import type { GatewayPlugin, GenerateContext } from "../plugin-interface";
import { gatewayConfig } from "../../lib/gateway-config";

const APPROX_CHARS_PER_TOKEN = 4;

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? `{{${key}}}`);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function compressToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * APPROX_CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;

  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = "";
  for (const sentence of sentences) {
    if ((result + sentence).length > maxChars) break;
    result += (result ? " " : "") + sentence;
  }
  return result || text.slice(0, maxChars);
}

export const promptTemplatePlugin: GatewayPlugin = {
  name: "prompt-template",
  version: "1.0.0",

  async beforeGenerate(ctx: GenerateContext): Promise<void> {
    const cfg = gatewayConfig.pipeline.templates;
    if (!cfg.enabled) return;

    const now = new Date();
    const templateVars: Record<string, string> = {
      timestamp: now.toISOString(),
      date: now.toISOString().split("T")[0],
      user_id: ctx.userId ?? "anonymous",
      plan: ctx.planTier ?? "free",
      ...(ctx.metadata.templateVars as Record<string, string> | undefined ?? {}),
    };

    ctx.prompt = renderTemplate(ctx.prompt, templateVars);

    const tokenEstimate = estimateTokens(ctx.prompt);
    if (tokenEstimate > cfg.compressThresholdTokens) {
      ctx.prompt = compressToTokenLimit(ctx.prompt, cfg.compressThresholdTokens);
      ctx.metadata.promptCompressed = true;
      ctx.metadata.originalTokenEstimate = tokenEstimate;
    }
  },
};
