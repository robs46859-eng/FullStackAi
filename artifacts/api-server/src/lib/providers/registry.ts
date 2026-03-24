import type { GatewayProvider, OnReset, OnToken, ProviderStats, StreamResult } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { gatewayConfig } from "../gateway-config";

export type RoutingStrategy = "cost" | "latency" | "capability";

const ALL_PROVIDERS: GatewayProvider[] = [
  new OpenAIProvider("openai", process.env.AGENT_MODEL ?? "gpt-5.2", 0.002, 0.008),
  new OpenAIProvider("openai-gpt41", process.env.AGENT_FALLBACK_MODEL ?? "gpt-4.1", 0.002, 0.008),
  new AnthropicProvider("claude-sonnet-4-5", 0.003, 0.015),
  new GeminiProvider("gemini-2.5-pro", 0.00125, 0.01),
];

const STRATEGY_ORDER: Record<RoutingStrategy, string[]> = {
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

function getRoutingStrategyValue(): RoutingStrategy {
  const s = process.env.ROUTING_STRATEGY ?? "cost";
  if (s === "latency" || s === "capability") return s;
  return "cost";
}

function detectSemanticProvider(prompt: string): string | null {
  if (!gatewayConfig.pipeline.semanticRouting.enabled) return null;
  for (const rule of SEMANTIC_ROUTING_RULES) {
    if (rule.patterns.some((p) => p.test(prompt))) {
      return rule.provider;
    }
  }
  return null;
}

function applyCanaryOverride(providerName: string): string {
  const cfg = gatewayConfig.pipeline.canary;
  if (!cfg.enabled) return providerName;

  canaryStats.totalDecisions++;
  const roll = Math.random() * 100;
  if (roll < cfg.trafficPercent) {
    canaryStats.canaryHits++;
    return cfg.provider;
  }
  return providerName;
}

function buildProviderChain(prompt: string): GatewayProvider[] {
  const strategy = getRoutingStrategyValue();
  const baseOrder = [...STRATEGY_ORDER[strategy]];

  const semanticProvider = detectSemanticProvider(prompt);
  if (semanticProvider) {
    const idx = baseOrder.indexOf(semanticProvider);
    if (idx > 0) {
      baseOrder.splice(idx, 1);
      baseOrder.unshift(semanticProvider);
    }
  }

  const leadName = applyCanaryOverride(baseOrder[0]);
  if (leadName !== baseOrder[0]) {
    const canaryIdx = baseOrder.indexOf(leadName);
    if (canaryIdx >= 0) {
      baseOrder.splice(canaryIdx, 1);
    }
    baseOrder.unshift(leadName);
  }

  return baseOrder
    .map((name) => ALL_PROVIDERS.find((p) => p.name === name))
    .filter((p): p is GatewayProvider => p !== undefined);
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

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const stats = providerStats.get(provider.name)!;
    stats.requests++;

    try {
      const result = await provider.streamCompletion(prompt, systemPrompt, onToken);
      const costUsd = computeCost(provider, result.promptTokens, result.completionTokens);

      stats.totalCostUsd += costUsd;
      stats.totalTokens += result.promptTokens + result.completionTokens;

      return { ...result, providerName: provider.name, costUsd, semanticRouted, canaryHit };
    } catch (err) {
      stats.errors++;
      const isLast = i === providers.length - 1;
      if (!isLast) {
        const nextProvider = providers[i + 1];
        onReset(`Provider ${provider.name} failed. Switching to ${nextProvider.name}…`);
      }
    }
  }

  throw new Error("All providers exhausted");
}

export function getProviderStats(): Record<
  string,
  ProviderStats & { model: string; costPerKInput: number; costPerKOutput: number }
> {
  const result: Record<
    string,
    ProviderStats & { model: string; costPerKInput: number; costPerKOutput: number }
  > = {};
  for (const provider of ALL_PROVIDERS) {
    const stats = providerStats.get(provider.name) ?? {
      requests: 0,
      errors: 0,
      totalCostUsd: 0,
      totalTokens: 0,
    };
    result[provider.name] = {
      ...stats,
      model: provider.model,
      costPerKInput: provider.costPerKInputTokens,
      costPerKOutput: provider.costPerKOutputTokens,
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
