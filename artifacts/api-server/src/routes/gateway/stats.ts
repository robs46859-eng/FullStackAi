import { Router, type IRouter } from "express";
import { db, generationsTable } from "@workspace/db";
import { avg, count, sql, sum } from "drizzle-orm";
import { getWindowStats } from "../../lib/tpm-limiter";
import { getProviderStats, getRoutingStrategy } from "../../lib/providers/registry";

const router: IRouter = Router();

router.get("/gateway/stats", async (req, res) => {
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

    const { total: tpmWindowTotal, limit: tpmLimit } = getWindowStats();

    res.json({
      totalRequests,
      cacheHits,
      cacheHitRate,
      totalTokens,
      totalCostUsd,
      avgTtftMs,
      tpmWindowTotal,
      tpmLimit,
      routingStrategy: getRoutingStrategy(),
      providers: getProviderStats(),
    });
  } catch (err) {
    req.log.error({ err }, "Gateway stats error");
    res.status(500).json({ error: "Failed to fetch gateway stats" });
  }
});

export default router;
