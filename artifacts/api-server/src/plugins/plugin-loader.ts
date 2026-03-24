import type { GatewayPlugin, GenerateContext } from "./plugin-interface";
import { gatewayConfig } from "../lib/gateway-config";
import { logger } from "../lib/logger";

type Hook = keyof Omit<GatewayPlugin, "name" | "version" | "init">;

interface PluginEntry {
  plugin: GatewayPlugin;
  callCounts: Record<string, number>;
}

class PluginLoader {
  private entries: PluginEntry[] = [];
  private initialized = false;

  async init(plugins: GatewayPlugin[]): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const enabledNames = this.resolveEnabledList();

    for (const plugin of plugins) {
      if (!enabledNames.has(plugin.name)) continue;
      try {
        await plugin.init?.();
        this.entries.push({ plugin, callCounts: {} });
        logger.info({ plugin: plugin.name }, "Gateway plugin loaded");
      } catch (err) {
        logger.error({ err, plugin: plugin.name }, "Plugin init failed — skipping");
      }
    }
  }

  private resolveEnabledList(): Set<string> {
    const envList = process.env.GATEWAY_PLUGINS;
    if (envList) {
      return new Set(envList.split(",").map((s) => s.trim()).filter(Boolean));
    }
    return new Set(gatewayConfig.plugins.enabled);
  }

  async run(hook: "beforeGenerate", ctx: GenerateContext): Promise<boolean>;
  async run(hook: Exclude<Hook, "beforeGenerate">, ctx: GenerateContext, err?: Error): Promise<void>;
  async run(hook: Hook, ctx: GenerateContext, err?: Error): Promise<boolean | void> {
    for (const entry of this.entries) {
      const fn = entry.plugin[hook] as
        | ((ctx: GenerateContext, err?: Error) => Promise<void | false>)
        | undefined;
      if (!fn) continue;

      entry.callCounts[hook] = (entry.callCounts[hook] ?? 0) + 1;
      try {
        const result = await fn.call(entry.plugin, ctx, err);
        if (hook === "beforeGenerate" && result === false) return false;
      } catch (e) {
        logger.warn({ err: e, plugin: entry.plugin.name, hook }, "Plugin hook threw");
      }
    }
    return hook === "beforeGenerate" ? true : undefined;
  }

  getStats(): Array<{
    name: string;
    version?: string;
    callCounts: Record<string, number>;
  }> {
    return this.entries.map((e) => ({
      name: e.plugin.name,
      version: e.plugin.version,
      callCounts: { ...e.callCounts },
    }));
  }
}

export const pluginLoader = new PluginLoader();
