import { Router, type IRouter } from "express";
import { db, generationsTable } from "@workspace/db";
import { avg, count, sql, sum } from "drizzle-orm";
import { getWindowStats } from "../../lib/tpm-limiter";
import { getProviderStats, getRoutingStrategy, getCanaryStats } from "../../lib/providers/registry";
import { pluginLoader } from "../../plugins";
import { gatewayConfig } from "../../lib/gateway-config";
import { isRedisAvailable } from "../../lib/redis";

const router: IRouter = Router();

router.get("/gateway/stats", async (req, res) => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Only admins can access gateway stats", code: "FORBIDDEN" });
    return;
  }
  try {
    const [row] = await db
      .select({
        totalRequests: count(),
        cacheHits: sum(sql<number>`case when ${generationsTable.cacheHit} = true then 1 else 0 end`),
        totalPromptTokens: sum(generationsTable.tokenCountPrompt),
        totalCompletionTokens: sum(generationsTable.tokenCountCompletion),
        totalCostUsd: sum(generationsTable.costUsd),
        avgTtftMs: avg(generationsTable.ttftMs),
      })
      .from(generationsTable);

    const totalRequests = Number(row?.totalRequests ?? 0);
    const cacheHits = Number(row?.cacheHits ?? 0);
    const cacheHitRate = totalRequests === 0 ? 0 : cacheHits / totalRequests;
    const totalPromptTokens = Number(row?.totalPromptTokens ?? 0);
    const totalCompletionTokens = Number(row?.totalCompletionTokens ?? 0);
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalCostUsd = Number(row?.totalCostUsd ?? 0);
    const avgTtftMs = row?.avgTtftMs != null ? Number(row.avgTtftMs) : null;

    const userId = req.user?.id;
    let planTier: string | undefined;
    if (userId) {
      try {
        const userResult = await db.execute<{ stripe_subscription_id: string | null }>(
          sql`SELECT stripe_subscription_id FROM users WHERE id = ${userId} LIMIT 1`,
        );
        planTier = userResult.rows[0]?.stripe_subscription_id ? "pro" : "free";
      } catch {
        planTier = "free";
      }
    }
    const tpmStats = await getWindowStats(userId, planTier);

    res.json({
      totalRequests,
      cacheHits,
      cacheHitRate,
      totalTokens,
      totalCostUsd,
      avgTtftMs,
      tpm: tpmStats,
      tpmWindowTotal: tpmStats.global.total,
      tpmLimit: tpmStats.global.limit,
      routingStrategy: getRoutingStrategy(),
      providers: getProviderStats(),
      canary: getCanaryStats(),
      plugins: pluginLoader.getStats(),
      redisAvailable: isRedisAvailable(),
      pipelineConfig: {
        guardrails: gatewayConfig.pipeline.guardrails.enabled,
        rag: gatewayConfig.pipeline.rag.enabled,
        templates: gatewayConfig.pipeline.templates.enabled,
        otel: gatewayConfig.pipeline.otel.enabled,
        canary: gatewayConfig.pipeline.canary.enabled,
        semanticRouting: gatewayConfig.pipeline.semanticRouting.enabled,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Gateway stats error");
    res.status(500).json({ error: "Failed to fetch gateway stats" });
  }
});

export default router;
