import { Router, type IRouter } from "express";
import { db, usersTable, generationsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import { adminMiddleware } from "../middlewares/adminMiddleware";

const router: IRouter = Router();

router.use("/admin", adminMiddleware);

router.get("/admin/overview", async (req, res) => {
  try {
    const [totalUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    const [generationsToday] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(generationsTable)
      .where(sql`created_at >= now() - interval '1 day'`);

    const [generationsWeek] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(generationsTable)
      .where(sql`created_at >= now() - interval '7 days'`);

    const [generationsAll] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(generationsTable);

    const [costRow] = await db
      .select({ total: sql<number>`coalesce(sum(cost_usd), 0)::float` })
      .from(generationsTable);

    const [cacheHitRow] = await db
      .select({
        hits: sql<number>`count(*) filter (where cache_hit = true)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(generationsTable)
      .where(sql`created_at >= now() - interval '7 days'`);

    const [activeSubsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(sql`stripe_subscription_id is not null`);

    const hitRate =
      cacheHitRow.total > 0
        ? Math.round((cacheHitRow.hits / cacheHitRow.total) * 100)
        : 0;

    res.json({
      totalUsers: totalUsers.count,
      generationsToday: generationsToday.count,
      generationsWeek: generationsWeek.count,
      generationsAllTime: generationsAll.count,
      totalCostUsd: Number(costRow.total.toFixed(4)),
      cacheHitRate7d: hitRate,
      activeSubscriptions: activeSubsRow.count,
    });
  } catch (err) {
    req.log.error({ err }, "Admin overview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/users", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const offset = (page - 1) * limit;

    const users = await db.execute<{
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      stripe_subscription_id: string | null;
      is_admin: boolean;
      created_at: string;
      updated_at: string;
      api_key_count: number;
      monthly_requests: number;
      monthly_cost: number;
    }>(sql`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.stripe_subscription_id,
        u.is_admin,
        u.created_at,
        u.updated_at,
        count(distinct k.id)::int AS api_key_count,
        coalesce(sum(ku.request_count), 0)::int AS monthly_requests,
        coalesce(sum(ku.cost_usd), 0)::float AS monthly_cost
      FROM users u
      LEFT JOIN api_keys k ON k.user_id = u.id AND k.revoked_at IS NULL
      LEFT JOIN key_usage ku ON ku.api_key_id = k.id AND ku.month_year = to_char(now(), 'YYYY-MM')
      ${search ? sql`WHERE u.email ILIKE ${"%" + search + "%"} OR u.first_name ILIKE ${"%" + search + "%"} OR u.last_name ILIKE ${"%" + search + "%"}` : sql``}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const [countRow] = await db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM users u
      ${search ? sql`WHERE u.email ILIKE ${"%" + search + "%"} OR u.first_name ILIKE ${"%" + search + "%"} OR u.last_name ILIKE ${"%" + search + "%"}` : sql``}
    `);

    res.json({
      users: users.rows.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        plan: u.stripe_subscription_id ? "pro" : "free",
        isAdmin: u.is_admin,
        apiKeyCount: u.api_key_count,
        monthlyRequests: u.monthly_requests,
        monthlyCostUsd: Number(Number(u.monthly_cost).toFixed(4)),
        lastActive: u.updated_at,
        createdAt: u.created_at,
      })),
      total: countRow.rows[0]?.total ?? 0,
      page,
      limit,
    });
  } catch (err) {
    req.log.error({ err }, "Admin users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/generations", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        id: generationsTable.id,
        prompt: generationsTable.prompt,
        filename: generationsTable.filename,
        modelUsed: generationsTable.modelUsed,
        tokenCountPrompt: generationsTable.tokenCountPrompt,
        tokenCountCompletion: generationsTable.tokenCountCompletion,
        costUsd: generationsTable.costUsd,
        cacheHit: generationsTable.cacheHit,
        createdAt: generationsTable.createdAt,
      })
      .from(generationsTable)
      .orderBy(desc(generationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(generationsTable);

    res.json({
      generations: rows.map((g) => ({
        ...g,
        promptTruncated: g.prompt.length > 120 ? g.prompt.slice(0, 120) + "…" : g.prompt,
        costUsd: g.costUsd != null ? Number(g.costUsd.toFixed(6)) : null,
      })),
      total: countRow.total,
      page,
      limit,
    });
  } catch (err) {
    req.log.error({ err }, "Admin generations error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/cache", async (req, res) => {
  try {
    const [sizeRow] = await db.execute<{ row_count: number }>(
      sql`SELECT count(*)::int AS row_count FROM semantic_cache`,
    );

    const [hitRateRow] = await db
      .select({
        hits: sql<number>`count(*) filter (where cache_hit = true)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(generationsTable)
      .where(sql`created_at >= now() - interval '7 days'`);

    const [avgSimRow] = await db.execute<{ avg_sim: number | null }>(
      sql`SELECT avg(similarity_tokens)::float AS avg_sim FROM semantic_cache WHERE hit_count > 0`,
    );

    const largest = await db.execute<{
      prompt_normalized: string;
      hit_count: number;
      similarity_tokens: number;
    }>(
      sql`SELECT prompt_normalized, hit_count, similarity_tokens FROM semantic_cache ORDER BY length(prompt_normalized) DESC LIMIT 10`,
    );

    const hitRate =
      hitRateRow.total > 0
        ? Math.round((hitRateRow.hits / hitRateRow.total) * 100)
        : 0;

    res.json({
      rowCount: sizeRow.rows[0]?.row_count ?? 0,
      hitRate7d: hitRate,
      avgSimilarityOnHits: avgSimRow.rows[0]?.avg_sim
        ? Number(Number(avgSimRow.rows[0].avg_sim).toFixed(4))
        : null,
      largestPrompts: largest.rows.map((r) => ({
        prompt: r.prompt_normalized.length > 200 ? r.prompt_normalized.slice(0, 200) + "…" : r.prompt_normalized,
        hitCount: r.hit_count,
        similarityTokens: r.similarity_tokens,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin cache error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/keys", async (req, res) => {
  try {
    const currentMonth = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();

    const keys = await db.execute<{
      id: number;
      user_id: string;
      name: string;
      key_prefix: string;
      monthly_limit: number;
      revoked_at: string | null;
      last_used_at: string | null;
      created_at: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      monthly_requests: number;
      monthly_tokens: number;
      monthly_cost: number;
    }>(sql`
      SELECT
        k.id,
        k.user_id,
        k.name,
        k.key_prefix,
        k.monthly_limit,
        k.revoked_at,
        k.last_used_at,
        k.created_at,
        u.email,
        u.first_name,
        u.last_name,
        coalesce(ku.request_count, 0)::int AS monthly_requests,
        coalesce(ku.token_count, 0)::int AS monthly_tokens,
        coalesce(ku.cost_usd, 0)::float AS monthly_cost
      FROM api_keys k
      LEFT JOIN users u ON u.id = k.user_id
      LEFT JOIN key_usage ku ON ku.api_key_id = k.id AND ku.month_year = ${currentMonth}
      WHERE k.revoked_at IS NULL
      ORDER BY k.created_at DESC
    `);

    res.json({
      keys: keys.rows.map((k) => ({
        id: k.id,
        userId: k.user_id,
        name: k.name,
        keyPrefix: k.key_prefix,
        monthlyLimit: k.monthly_limit,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at,
        owner: {
          email: k.email,
          firstName: k.first_name,
          lastName: k.last_name,
        },
        thisMonth: {
          requests: k.monthly_requests,
          tokens: k.monthly_tokens,
          costUsd: Number(Number(k.monthly_cost).toFixed(4)),
        },
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin keys error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
