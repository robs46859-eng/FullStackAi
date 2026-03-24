import { openai } from "@workspace/integrations-openai-ai-server";
import type { GatewayPlugin, GenerateContext } from "../plugin-interface";
import { gatewayConfig } from "../../lib/gateway-config";
import { logger } from "../../lib/logger";

async function moderate(text: string): Promise<{ flagged: boolean; categories: string[] }> {
  try {
    const result = await openai.moderations.create({ input: text });
    const output = result.results[0];
    if (!output) return { flagged: false, categories: [] };

    const flaggedCategories = Object.entries(output.categories)
      .filter(([, v]) => v)
      .map(([k]) => k);

    return { flagged: output.flagged, categories: flaggedCategories };
  } catch (err) {
    logger.warn({ err }, "content-guard: moderation API call failed");
    return { flagged: false, categories: [] };
  }
}

export const contentGuardPlugin: GatewayPlugin = {
  name: "content-guard",
  version: "1.0.0",

  async beforeGenerate(ctx: GenerateContext): Promise<void | false> {
    const cfg = gatewayConfig.pipeline.guardrails;
    if (!cfg.enabled || !cfg.preCheck) return;

    const { flagged, categories } = await moderate(ctx.originalPrompt);
    if (flagged) {
      logger.warn({
        requestId: ctx.requestId,
        categories,
      }, "content-guard: prompt flagged by moderation");
      ctx.metadata.guardBlocked = true;
      ctx.metadata.guardCategories = categories;
      return false;
    }
  },

  async afterGenerate(ctx: GenerateContext): Promise<void> {
    const cfg = gatewayConfig.pipeline.guardrails;
    if (!cfg.enabled || !cfg.postCheck) return;

    const output = ctx.metadata.generatedCode as string | undefined;
    if (!output) return;

    const { flagged, categories } = await moderate(output);
    if (flagged) {
      logger.warn({
        requestId: ctx.requestId,
        categories,
      }, "content-guard: output flagged by moderation");
      ctx.metadata.outputFlagged = true;
      ctx.metadata.outputGuardCategories = categories;
    }
  },
};
