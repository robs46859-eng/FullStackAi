export { pluginLoader } from "./plugin-loader";
export type { GatewayPlugin, GenerateContext } from "./plugin-interface";

import { requestLoggerPlugin } from "./builtin/request-logger";
import { planTierLimiterPlugin } from "./builtin/plan-tier-limiter";
import { promptEnhancerPlugin } from "./builtin/prompt-enhancer";
import { otelTracerPlugin } from "./builtin/otel-tracer";
import { ragInjectorPlugin } from "./builtin/rag-injector";
import { promptTemplatePlugin } from "./builtin/prompt-template";
import { contentGuardPlugin } from "./builtin/content-guard";
import { transformPlugin } from "./builtin/transform";
import type { GatewayPlugin } from "./plugin-interface";

export const ALL_BUILTIN_PLUGINS: GatewayPlugin[] = [
  requestLoggerPlugin,
  planTierLimiterPlugin,
  promptEnhancerPlugin,
  otelTracerPlugin,
  ragInjectorPlugin,
  promptTemplatePlugin,
  contentGuardPlugin,
  transformPlugin,
];
