import type { GatewayProvider, OnReset, OnToken, ProviderStats, StreamResult } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

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

const providerStats = new Map<string, ProviderStats>(
  ALL_PROVIDERS.map((p) => [
    p.name,
    { requests: 0, errors: 0, totalCostUsd: 0, totalTokens: 0 },
  ]),
);

function getOrderedProviders(strategy: RoutingStrategy): GatewayProvider[] {
  const order = STRATEGY_ORDER[strategy];
  return order
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
}

export async function streamWithFallback(
  prompt: string,
  systemPrompt: string,
  onToken: OnToken,
  onReset: OnReset,
): Promise<RegistryStreamResult> {
  const strategyEnv = (process.env.ROUTING_STRATEGY ?? "cost") as RoutingStrategy;
  const strategy: RoutingStrategy =
    strategyEnv === "cost" || strategyEnv === "latency" || strategyEnv === "capability"
      ? strategyEnv
      : "cost";

  const providers = getOrderedProviders(strategy);

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const stats = providerStats.get(provider.name)!;
    stats.requests++;

    try {
      const result = await provider.streamCompletion(prompt, systemPrompt, onToken);
      const costUsd = computeCost(provider, result.promptTokens, result.completionTokens);

      stats.totalCostUsd += costUsd;
      stats.totalTokens += result.promptTokens + result.completionTokens;

      return { ...result, providerName: provider.name, costUsd };
    } catch (err) {
      stats.errors++;
      const isLast = i === providers.length - 1;

      if (!isLast) {
        const nextProvider = providers[i + 1];
        onReset(
          `Provider ${provider.name} failed. Switching to ${nextProvider.name}…`,
        );
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

export function getRoutingStrategy(): RoutingStrategy {
  const s = process.env.ROUTING_STRATEGY ?? "cost";
  if (s === "latency" || s === "capability") return s;
  return "cost";
}
