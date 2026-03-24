import type { GatewayPlugin, GenerateContext } from "../plugin-interface";
import { gatewayConfig } from "../../lib/gateway-config";

type TransformFn = (ctx: GenerateContext) => void | Promise<void>;

const requestTransforms: TransformFn[] = [];
const responseTransforms: TransformFn[] = [];

function registerRequestTransform(fn: TransformFn): void {
  requestTransforms.push(fn);
}

function registerResponseTransform(fn: TransformFn): void {
  responseTransforms.push(fn);
}

export const transformPlugin: GatewayPlugin = {
  name: "transform",
  version: "1.0.0",

  async beforeGenerate(ctx: GenerateContext): Promise<void> {
    const cfgTransforms = gatewayConfig.pipeline.transforms.request;
    const hasConfig = cfgTransforms.length > 0;

    if (!hasConfig && requestTransforms.length === 0) return;

    for (const fn of requestTransforms) {
      await fn(ctx);
    }
  },

  async afterGenerate(ctx: GenerateContext): Promise<void> {
    const cfgTransforms = gatewayConfig.pipeline.transforms.response;
    const hasConfig = cfgTransforms.length > 0;

    if (!hasConfig && responseTransforms.length === 0) return;

    for (const fn of responseTransforms) {
      await fn(ctx);
    }
  },
};

export { registerRequestTransform, registerResponseTransform };
