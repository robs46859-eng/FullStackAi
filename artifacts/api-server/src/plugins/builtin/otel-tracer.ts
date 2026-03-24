import type { Tracer, Span } from "@opentelemetry/api";
import type { GatewayPlugin, GenerateContext } from "../plugin-interface";
import { gatewayConfig } from "../../lib/gateway-config";
import { logger } from "../../lib/logger";

let tracer: Tracer | null = null;
const activeSpans = new Map<string, Span>();
const childSpans = new Map<string, Map<string, Span>>();

async function initTracer(): Promise<void> {
  if (!gatewayConfig.pipeline.otel.enabled) return;

  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { Resource } = await import("@opentelemetry/resources");
  const { SEMRESATTRS_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");
  const { BatchSpanProcessor, SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-node");
  const otelApi = await import("@opentelemetry/api");

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: "ai-studio-gateway",
    }),
  });

  const endpoint = gatewayConfig.pipeline.otel.exporterEndpoint;
  if (endpoint) {
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    provider.addSpanProcessor(
      new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint + "/v1/traces" })),
    );
  } else if (process.env.NODE_ENV !== "production") {
    const { ConsoleSpanExporter } = await import("@opentelemetry/sdk-trace-node");
    provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    logger.info("otel-tracer: no exporter endpoint configured; using console exporter (dev mode)");
  }

  provider.register();
  tracer = otelApi.trace.getTracer("ai-studio-gateway", "1.0.0");
}

function startChildSpan(requestId: string, stage: string, attrs?: Record<string, string | number | boolean>): Span | null {
  if (!tracer) return null;
  const parent = activeSpans.get(requestId);
  if (!parent) return null;

  const otelApi = require("@opentelemetry/api") as typeof import("@opentelemetry/api");
  const ctx = otelApi.trace.setSpan(otelApi.context.active(), parent);
  const child = tracer.startSpan(`gateway.${stage}`, { attributes: attrs }, ctx);

  if (!childSpans.has(requestId)) childSpans.set(requestId, new Map());
  childSpans.get(requestId)!.set(stage, child);
  return child;
}

function endChildSpan(requestId: string, stage: string, attrs?: Record<string, string | number | boolean>): void {
  const child = childSpans.get(requestId)?.get(stage);
  if (!child) return;
  if (attrs) child.setAttributes(attrs);
  child.end();
  childSpans.get(requestId)?.delete(stage);
}

export const otelTracerPlugin: GatewayPlugin = {
  name: "otel-tracer",
  version: "2.0.0",

  async init(): Promise<void> {
    await initTracer();
  },

  async beforeGenerate(ctx: GenerateContext): Promise<void> {
    if (!tracer) return;

    const span = tracer.startSpan("gateway.generate", {
      attributes: {
        "gen.request_id": ctx.requestId,
        "gen.user_id": ctx.userId ?? "anonymous",
        "gen.prompt_length": ctx.prompt.length,
        "gen.strategy": (process.env.ROUTING_STRATEGY ?? "cost"),
      },
    });
    activeSpans.set(ctx.requestId, span);

    startChildSpan(ctx.requestId, "rag", { "rag.enabled": gatewayConfig.pipeline.rag.enabled });
    startChildSpan(ctx.requestId, "guard", { "guard.enabled": gatewayConfig.pipeline.guardrails.enabled });
    startChildSpan(ctx.requestId, "provider_select", {});
  },

  async afterGenerate(ctx: GenerateContext): Promise<void> {
    endChildSpan(ctx.requestId, "rag", {
      "rag.example_count": (ctx.metadata.ragExampleCount as number | undefined) ?? 0,
      "rag.strategy": (ctx.metadata.ragStrategy as string | undefined) ?? "none",
    });
    endChildSpan(ctx.requestId, "guard", {
      "guard.blocked": (ctx.metadata.guardBlocked as boolean | undefined) ?? false,
      "guard.output_flagged": (ctx.metadata.outputFlagged as boolean | undefined) ?? false,
    });
    endChildSpan(ctx.requestId, "provider_select", {
      "provider.name": ctx.provider ?? "",
      "provider.model": ctx.model ?? "",
      "provider.latency_ms": ctx.metadata.latencyMs as number | undefined ?? 0,
    });

    const span = activeSpans.get(ctx.requestId);
    if (!span) return;
    span.setAttributes({
      "gen.provider": ctx.provider ?? "",
      "gen.model": ctx.model ?? "",
      "gen.cached": ctx.cached ?? false,
      "gen.prompt_tokens": ctx.tokenCountPrompt ?? 0,
      "gen.completion_tokens": ctx.tokenCountCompletion ?? 0,
      "gen.cost_usd": ctx.costUsd ?? 0,
      "gen.ttft_ms": ctx.ttftMs ?? 0,
      "gen.routing_strategy": ctx.metadata.routingStrategy as string ?? "",
      "gen.semantic_routed": ctx.metadata.semanticRouted as boolean ?? false,
      "gen.canary_hit": ctx.metadata.canaryHit as boolean ?? false,
    });
    span.end();
    activeSpans.delete(ctx.requestId);
    childSpans.delete(ctx.requestId);
  },

  async onError(ctx: GenerateContext, error: Error): Promise<void> {
    const children = childSpans.get(ctx.requestId);
    if (children) {
      for (const [, child] of children) {
        child.end();
      }
      childSpans.delete(ctx.requestId);
    }

    const span = activeSpans.get(ctx.requestId);
    if (!span) return;
    const { SpanStatusCode } = await import("@opentelemetry/api");
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
    activeSpans.delete(ctx.requestId);
  },
};
