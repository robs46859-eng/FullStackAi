import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { GatewayPlugin, GenerateContext } from "../plugin-interface";
import { logger } from "../../lib/logger";

const TIER_MULTIPLIERS: Record<string, number> = {
  free: 1,
  pro: 5,
  enterprise: 20,
};

export const planTierLimiterPlugin: GatewayPlugin = {
  name: "plan-tier-limiter",
  version: "1.0.0",

  async beforeGenerate(ctx: GenerateContext): Promise<void> {
    if (!ctx.userId) return;

    try {
      const result = await db.execute<{ stripe_subscription_id: string | null }>(
        sql`SELECT stripe_subscription_id FROM users WHERE id = ${ctx.userId} LIMIT 1`,
      );
      const user = result.rows[0];
      if (!user) return;

      const hasSubscription = Boolean(user.stripe_subscription_id);
      const tier: GenerateContext["planTier"] = hasSubscription ? "pro" : "free";
      ctx.planTier = tier;

      const multiplier = TIER_MULTIPLIERS[tier] ?? 1;
      ctx.metadata.tpmMultiplier = multiplier;

      logger.debug({ userId: ctx.userId, tier, multiplier }, "Plan tier resolved");
    } catch (err) {
      logger.warn({ err }, "plan-tier-limiter: failed to load user tier");
    }
  },
};
