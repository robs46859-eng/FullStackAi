import type {
  GatewayProvider,
  OnReset,
  OnToken,
  ProviderStats,
  ProviderRuntimeStats,
  StreamResult,
} from "./types";
import { p50, LATENCY_WINDOW_SIZE } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { gatewayConfig } from "../gateway-config";

export type RoutingStrategy =
  | "cost"
  | "latency"
  | "capability"
  | "weighted-round-robin"
  | "lowest-latency"
  | "usage-based";

const ALL_PROVIDERS: GatewayProvider[] = [
  new OpenAIProvider("openai", process.env.AGENT_MODEL ?? "gpt-5.2", 0.002, 0.008, 3),
  new OpenAIProvider("openai-gpt41", process.env.AGENT_FALLBACK_MODEL ?? "gpt-4.1", 0.002, 0.008, 2),
  new AnthropicProvider("claude-sonnet-4-5", 0.003, 0.015, 2),
  new GeminiProvider("gemini-2.5-pro", 0.00125, 0.01, 5),
];

const STATIC_STRATEGY_ORDER: Record<"cost" | "latency" | "capability", string[]> = {
  cost:       ["gemini", "openai", "openai-gpt41", "anthropic"],
  latency:    ["openai", "openai-gpt41", "gemini", "anthropic"],
  capability: ["anthropic", "openai", "openai-gpt41", "gemini"],
};

const SEMANTIC_ROUTING_RULES: Array<{ patterns: RegExp[]; provider: string }> = [
  {
    patterns: [/\b(math|algorithm|compute|calculation|logic|reasoning|proof|optimize)\b/i],
    provider: "openai",
  },
  {
    patterns: [/\b(creative|story|poem|narrative|write|fiction|design|artistic|explain|summarize)\b/i],
    provider: "anthropic",
  },
  {
    patterns: [/\b(image|vision|multimodal|picture|photo|video|audio|multi.?modal)\b/i],
    provider: "gemini",
  },
  {
    patterns: [/\b(data|analysis|science|research|statistics|dataset|chart|graph)\b/i],
    provider: "openai",
  },
];

interface CanaryStats {
  totalDecisions: number;
  canaryHits: number;
}
const canaryStats: CanaryStats = { totalDecisions: 0, canaryHits: 0 };

const providerStats = new Map<string, ProviderStats>(
  ALL_PROVIDERS.map((p) => [
    p.name,
    { requests: 0, errors: 0, totalCostUsd: 0, totalTokens: 0 },
  ]),
);

const runtimeStats = new Map<string, ProviderRuntimeStats>(
  ALL_PROVIDERS.map((p) => [
    p.name,
    { inFlight: 0, latencyWindowMs: [], wrrCounter: 0 },
  ]),
);

function getRoutingStrategyValue(): RoutingStrategy {
  const s = (process.env.ROUTING_STRATEGY ?? "cost").toLowerCase();
  const valid: RoutingStrategy[] = [
    "cost", "latency", "capability",
    "weighted-round-robin", "lowest-latency", "usage-based",
  ];
  return valid.includes(s as RoutingStrategy) ? (s as RoutingStrategy) : "cost";
}

function recordLatency(providerName: string, ms: number): void {
  const rt = runtimeStats.get(providerName);
  if (!rt) return;
  rt.latencyWindowMs.push(ms);
  if (rt.latencyWindowMs.length > LATENCY_WINDOW_SIZE) rt.latencyWindowMs.shift();
}

function setInFlight(providerName: string, delta: number): void {
  const rt = runtimeStats.get(providerName);
  if (!rt) return;
  rt.inFlight = Math.max(0, rt.inFlight + delta);
}

function buildOrderedByStrategy(strategy: RoutingStrategy): GatewayProvider[] {
  switch (strategy) {
    case "weighted-round-robin": {
      const scored = ALL_PROVIDERS.map((p) => {
        const rt = runtimeStats.get(p.name)!;
        rt.wrrCounter = (rt.wrrCounter + 1) % Math.max(1, p.weight);
        return { p, score: p.weight - rt.wrrCounter };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s) => s.p);
    }
    case "lowest-latency": {
      const scored = ALL_PROVIDERS.map((p) => {
        const rt = runtimeStats.get(p.name)!;
        const latency = rt.latencyWindowMs.length > 0 ? p50(rt.latencyWindowMs) : 9_999_999;
        return { p, latency };
      });
      scored.sort((a, b) => a.latency - b.latency);
      return scored.map((s) => s.p);
    }
    case "usage-based": {
      const scored = ALL_PROVIDERS.map((p) => {
        const rt = runtimeStats.get(p.name)!;
        const st = providerStats.get(p.name)!;
        const errorRate = st.errors / Math.max(1, st.requests);
        return { p, score: rt.inFlight * 10 + errorRate * 5 };
      });
      scored.sort((a, b) => a.score - b.score);
      return scored.map((s) => s.p);
    }
    default: {
      const names = [...STATIC_STRATEGY_ORDER[strategy]];
      const ordered = names
        .map((name) => ALL_PROVIDERS.find((p) => p.name === name))
        .filter((p): p is GatewayProvider => p !== undefined);
      const missing = ALL_PROVIDERS.filter((p) => !ordered.find((o) => o.name === p.name));
      return [...ordered, ...missing];
    }
  }
}

function detectSemanticProvider(prompt: string): string | null {
  if (!gatewayConfig.pipeline.semanticRouting.enabled) return null;
  for (const rule of SEMANTIC_ROUTING_RULES) {
    if (rule.patterns.some((p) => p.test(prompt))) return rule.provider;
  }
  return null;
}

function applyCanaryOverride(providerName: string): string {
  const cfg = gatewayConfig.pipeline.canary;
  if (!cfg.enabled) return providerName;
  canaryStats.totalDecisions++;
  if (Math.random() * 100 < cfg.trafficPercent) {
    canaryStats.canaryHits++;
    return cfg.provider;
  }
  return providerName;
}

function buildProviderChain(prompt: string): GatewayProvider[] {
  const strategy = getRoutingStrategyValue();
  const ordered = buildOrderedByStrategy(strategy);

  const semanticProvider = detectSemanticProvider(prompt);
  if (semanticProvider) {
    const idx = ordered.findIndex((p) => p.name === semanticProvider);
    if (idx > 0) {
      const [p] = ordered.splice(idx, 1);
      ordered.unshift(p!);
    }
  }

  const leadName = applyCanaryOverride(ordered[0]?.name ?? "");
  if (leadName !== ordered[0]?.name) {
    const canaryIdx = ordered.findIndex((p) => p.name === leadName);
    if (canaryIdx >= 0) {
      const [p] = ordered.splice(canaryIdx, 1);
      ordered.unshift(p!);
    }
  }

  return ordered;
}

function computeCost(
  provider: GatewayProvider,
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    (promptTokens / 1000) * provider.costPerKInputTokens +
    (completionTokens / 1000) * provider.costPerKOutputTokens
  );
}

export interface RegistryStreamResult extends StreamResult {
  providerName: string;
  costUsd: number;
  semanticRouted: boolean;
  canaryHit: boolean;
  routingStrategy: RoutingStrategy;
  latencyMs: number;
}

export async function streamWithFallback(
  prompt: string,
  systemPrompt: string,
  onToken: OnToken,
  onReset: OnReset,
): Promise<RegistryStreamResult> {
  const beforeCanaryHits = canaryStats.canaryHits;
  const providers = buildProviderChain(prompt);
  const semanticProvider = detectSemanticProvider(prompt);
  const semanticRouted = semanticProvider !== null && providers[0]?.name === semanticProvider;
  const canaryHit = canaryStats.canaryHits > beforeCanaryHits;
  const routingStrategy = getRoutingStrategyValue();

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]!;
    const stats = providerStats.get(provider.name)!;
    stats.requests++;
    setInFlight(provider.name, +1);

    const t0 = Date.now();
    try {
      const result = await provider.streamCompletion(prompt, systemPrompt, onToken);
      const latencyMs = Date.now() - t0;
      recordLatency(provider.name, latencyMs);
      setInFlight(provider.name, -1);

      const costUsd = computeCost(provider, result.promptTokens, result.completionTokens);
      stats.totalCostUsd += costUsd;
      stats.totalTokens += result.promptTokens + result.completionTokens;

      return {
        ...result,
        latencyMs,
        providerName: provider.name,
        costUsd,
        semanticRouted,
        canaryHit,
        routingStrategy,
      };
    } catch (err) {
      setInFlight(provider.name, -1);
      stats.errors++;
      const isLast = i === providers.length - 1;
      if (!isLast) {
        onReset(`Provider ${provider.name} failed. Switching to ${providers[i + 1]!.name}…`);
      }
    }
  }

  throw new Error("All providers exhausted");
}

export function getProviderStats(): Record<
  string,
  ProviderStats & {
    model: string;
    costPerKInput: number;
    costPerKOutput: number;
    weight: number;
    p50LatencyMs: number;
    inFlight: number;
  }
> {
  const result: Record<string, ReturnType<typeof getProviderStats>[string]> = {};
  for (const provider of ALL_PROVIDERS) {
    const stats = providerStats.get(provider.name) ?? {
      requests: 0, errors: 0, totalCostUsd: 0, totalTokens: 0,
    };
    const rt = runtimeStats.get(provider.name) ?? {
      inFlight: 0, latencyWindowMs: [], wrrCounter: 0,
    };
    result[provider.name] = {
      ...stats,
      model: provider.model,
      costPerKInput: provider.costPerKInputTokens,
      costPerKOutput: provider.costPerKOutputTokens,
      weight: provider.weight,
      p50LatencyMs: p50(rt.latencyWindowMs),
      inFlight: rt.inFlight,
    };
  }
  return result;
}

export function getCanaryStats(): CanaryStats & { hitRate: number } {
  return {
    ...canaryStats,
    hitRate: canaryStats.totalDecisions === 0 ? 0 : canaryStats.canaryHits / canaryStats.totalDecisions,
  };
}

export function getRoutingStrategy(): RoutingStrategy {
  return getRoutingStrategyValue();
}
