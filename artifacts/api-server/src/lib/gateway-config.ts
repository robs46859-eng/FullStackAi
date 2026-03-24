import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

export interface GatewayPipelineConfig {
  guardrails: {
    enabled: boolean;
    preCheck: boolean;
    postCheck: boolean;
    provider: string;
  };
  rag: {
    enabled: boolean;
    maxResults: number;
    minSimilarityScore: number;
  };
  templates: {
    enabled: boolean;
    compressThresholdTokens: number;
  };
  otel: {
    enabled: boolean;
    exporterEndpoint: string;
  };
  canary: {
    enabled: boolean;
    provider: string;
    trafficPercent: number;
  };
  semanticRouting: {
    enabled: boolean;
  };
  transforms: {
    request: string[];
    response: string[];
  };
}

export interface GatewayConfig {
  pipeline: GatewayPipelineConfig;
  plugins: {
    enabled: string[];
  };
}

const DEFAULTS: GatewayConfig = {
  pipeline: {
    guardrails: { enabled: false, preCheck: true, postCheck: false, provider: "openai-moderation" },
    rag: { enabled: false, maxResults: 3, minSimilarityScore: 0.5 },
    templates: { enabled: true, compressThresholdTokens: 2048 },
    otel: { enabled: true, exporterEndpoint: "" },
    canary: { enabled: false, provider: "openai-gpt41", trafficPercent: 10 },
    semanticRouting: { enabled: false },
    transforms: { request: [], response: [] },
  },
  plugins: {
    enabled: ["request-logger", "plan-tier-limiter", "prompt-enhancer"],
  },
};

function deepMerge<T>(target: T, source: Partial<T>): T {
  const out = { ...target };
  for (const key of Object.keys(source ?? {}) as (keyof T)[]) {
    const sv = source[key];
    const tv = target[key];
    if (sv !== null && typeof sv === "object" && !Array.isArray(sv) && typeof tv === "object" && tv !== null && !Array.isArray(tv)) {
      (out as Record<string, unknown>)[key as string] = deepMerge(tv, sv as Partial<typeof tv>);
    } else if (sv !== undefined) {
      (out as Record<string, unknown>)[key as string] = sv;
    }
  }
  return out;
}

function loadConfig(): GatewayConfig {
  const cfgPath = resolve(process.cwd(), "config/gateway.yaml");
  if (!existsSync(cfgPath)) {
    return DEFAULTS;
  }
  try {
    const raw = readFileSync(cfgPath, "utf-8");
    const parsed = yaml.load(raw) as Partial<GatewayConfig>;
    return deepMerge(DEFAULTS, parsed ?? {});
  } catch {
    return DEFAULTS;
  }
}

export const gatewayConfig = loadConfig();
