import type { Tracer, Span } from "@opentelemetry/api";
import type { GatewayPlugin, GenerateContext } from "../plugin-interface";
import { gatewayConfig } from "../../lib/gateway-config";

let tracer: Tracer | null = null;
const activeSpans = new Map<string, Span>();

async function initTracer(): Promise<void> {
  if (!gatewayConfig.pipeline.otel.enabled) return;

  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { Resource } = await import("@opentelemetry/resources");
  const { SEMRESATTRS_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");
  const { BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-node");
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
  }

  provider.register();
  tracer = otelApi.trace.getTracer("ai-studio-gateway", "1.0.0");
}

export const otelTracerPlugin: GatewayPlugin = {
  name: "otel-tracer",
  version: "1.0.0",

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
      },
    });
    activeSpans.set(ctx.requestId, span);
  },

  async afterGenerate(ctx: GenerateContext): Promise<void> {
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
    });
    span.end();
    activeSpans.delete(ctx.requestId);
  },

  async onError(ctx: GenerateContext, error: Error): Promise<void> {
    const span = activeSpans.get(ctx.requestId);
    if (!span) return;
    const { SpanStatusCode } = await import("@opentelemetry/api");
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
    activeSpans.delete(ctx.requestId);
  },
};
