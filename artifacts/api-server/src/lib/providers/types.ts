export interface StreamResult {
  promptTokens: number;
  completionTokens: number;
  modelUsed: string;
}

export type OnToken = (content: string) => void;
export type OnReset = (notice: string) => void;

export interface GatewayProvider {
  readonly name: string;
  readonly model: string;
  readonly costPerKInputTokens: number;
  readonly costPerKOutputTokens: number;
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
