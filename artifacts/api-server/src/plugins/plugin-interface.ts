export interface GenerateContext {
  requestId: string;
  prompt: string;
  originalPrompt: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  tokenCountPrompt?: number;
  tokenCountCompletion?: number;
  costUsd?: number;
  ttftMs?: number;
  cached?: boolean;
  userId?: string;
  planTier?: "free" | "pro" | "enterprise";
  metadata: Record<string, unknown>;
}

export interface GatewayPlugin {
  name: string;
  version?: string;
  init?(): Promise<void>;
  beforeGenerate?(ctx: GenerateContext): Promise<void | false>;
  afterGenerate?(ctx: GenerateContext): Promise<void>;
  onCacheHit?(ctx: GenerateContext): Promise<void>;
  onCacheMiss?(ctx: GenerateContext): Promise<void>;
  onError?(ctx: GenerateContext, error: Error): Promise<void>;
}
