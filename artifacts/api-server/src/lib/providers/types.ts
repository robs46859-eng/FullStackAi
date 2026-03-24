export interface StreamResult {
  promptTokens: number;
  completionTokens: number;
  modelUsed: string;
  latencyMs?: number;
}

export type OnToken = (content: string) => void;
export type OnReset = (notice: string) => void;

export interface GatewayProvider {
  readonly name: string;
  readonly model: string;
  readonly costPerKInputTokens: number;
  readonly costPerKOutputTokens: number;
  readonly weight: number;
  streamCompletion(
    prompt: string,
    systemPrompt: string,
    onToken: OnToken,
  ): Promise<StreamResult>;
}

export interface ProviderStats {
  requests: number;
  errors: number;
  totalCostUsd: number;
  totalTokens: number;
}

export interface ProviderRuntimeStats {
  inFlight: number;
  latencyWindowMs: number[];
  wrrCounter: number;
}

export function p50(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.5)] ?? sorted[sorted.length - 1]!;
}

export const LATENCY_WINDOW_SIZE = 20;
