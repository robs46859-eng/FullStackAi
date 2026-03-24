import { logger } from "../../lib/logger";
import type { GatewayPlugin, GenerateContext } from "../plugin-interface";

export const requestLoggerPlugin: GatewayPlugin = {
  name: "request-logger",
  version: "1.0.0",

  async afterGenerate(ctx: GenerateContext): Promise<void> {
    logger.info({
      plugin: "request-logger",
      requestId: ctx.requestId,
      userId: ctx.userId,
      planTier: ctx.planTier,
      provider: ctx.provider,
      model: ctx.model,
      cached: ctx.cached,
      promptTokens: ctx.tokenCountPrompt,
      completionTokens: ctx.tokenCountCompletion,
      costUsd: ctx.costUsd,
      ttftMs: ctx.ttftMs,
    }, "Generation complete");
  },

  async onCacheHit(ctx: GenerateContext): Promise<void> {
    logger.info({
      plugin: "request-logger",
      requestId: ctx.requestId,
      event: "cache_hit",
    }, "Served from semantic cache");
  },

  async onError(ctx: GenerateContext, error: Error): Promise<void> {
    logger.error({
      plugin: "request-logger",
      requestId: ctx.requestId,
      err: error,
    }, "Generation error");
  },
};
