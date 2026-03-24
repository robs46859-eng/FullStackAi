import type { GatewayPlugin, GenerateContext } from "../plugin-interface";

const STYLE_CONTEXT = `
[Style guide: Use Express 5 async route handlers. Use async/await exclusively. Use TypeScript strict mode. Use pino for logging via req.log (never console.log). Apply Zod for input validation. Export the router as default.]`;

export const promptEnhancerPlugin: GatewayPlugin = {
  name: "prompt-enhancer",
  version: "1.0.0",

  async beforeGenerate(ctx: GenerateContext): Promise<void> {
    if (!ctx.prompt.includes("[Style guide:")) {
      ctx.prompt = ctx.prompt + STYLE_CONTEXT;
    }
  },
};
