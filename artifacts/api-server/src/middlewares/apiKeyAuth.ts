import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db, apiKeysTable, keyUsageTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getRedis, isRedisAvailable } from "../lib/redis";

declare global {
  namespace Express {
    interface Request {
      apiKey?: import("@workspace/db").ApiKey;
      apiKeyUser?: import("@workspace/db").User;
    }
  }
}

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function currentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function endOfMonthExpiry(): number {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return Math.floor(endOfMonth.getTime() / 1000);
}

function redisMonthlyKey(keyHash: string): string {
  return `apik:monthly:${keyHash}:${currentMonthYear()}`;
}

const INCR_AND_CHECK_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local expiry = tonumber(ARGV[2])

local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIREAT', key, expiry)
end
if count > limit then
  redis.call('DECR', key)
  return {0, count - 1}
end
return {1, count}
`;

async function redisIncrAndCheck(
  keyHash: string,
  monthlyLimit: number,
): Promise<{ allowed: boolean } | null> {
  const redis = getRedis();
  if (!redis || !isRedisAvailable()) return null;
  try {
    const result = (await redis.eval(
      INCR_AND_CHECK_SCRIPT,
      1,
      redisMonthlyKey(keyHash),
      String(monthlyLimit),
      String(endOfMonthExpiry()),
    )) as [number, number];
    return { allowed: result[0] === 1 };
  } catch (err) {
    logger.warn({ err }, "Redis monthly incr/check failed — falling back to DB");
    return null;
  }
}

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "API key required. Pass Authorization: Bearer <key>", code: "API_KEY_REQUIRED" });
    return;
  }

  const rawKey = authHeader.slice(7).trim();
  const keyHash = hashKey(rawKey);

  const [keyRow] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, keyHash));

  if (!keyRow) {
    res.status(401).json({ error: "Invalid API key", code: "INVALID_API_KEY" });
    return;
  }

  if (keyRow.revokedAt) {
    res.status(401).json({ error: "API key has been revoked", code: "KEY_REVOKED" });
    return;
  }

  const redisResult = await redisIncrAndCheck(keyHash, keyRow.monthlyLimit);

  if (redisResult !== null) {
    if (!redisResult.allowed) {
      res.status(429).json({
        error: `Monthly limit of ${keyRow.monthlyLimit} requests exceeded`,
        code: "MONTHLY_LIMIT_EXCEEDED",
        source: "redis",
      });
      return;
    }
  } else {
    const monthYear = currentMonthYear();
    const [usage] = await db
      .select()
      .from(keyUsageTable)
      .where(and(eq(keyUsageTable.apiKeyId, keyRow.id), eq(keyUsageTable.monthYear, monthYear)));

    if (usage && usage.requestCount >= keyRow.monthlyLimit) {
      res.status(429).json({
        error: `Monthly limit of ${keyRow.monthlyLimit} requests exceeded`,
        code: "MONTHLY_LIMIT_EXCEEDED",
        source: "db",
      });
      return;
    }
  }

  db.update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, keyRow.id))
    .catch((err) => logger.warn({ err }, "Failed to update lastUsedAt"));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, keyRow.userId));

  req.apiKey = keyRow;
  req.apiKeyUser = user;

  next();
}

export async function recordKeyUsage(
  keyHash: string,
  apiKeyId: number,
  tokens: number,
  costUsd: number,
): Promise<void> {
  const monthYear = currentMonthYear();

  try {
    await db.execute(sql`
      INSERT INTO key_usage (api_key_id, month_year, token_count, cost_usd, request_count)
      VALUES (${apiKeyId}, ${monthYear}, ${tokens}, ${costUsd}, 1)
      ON CONFLICT (api_key_id, month_year)
      DO UPDATE SET
        token_count = key_usage.token_count + EXCLUDED.token_count,
        cost_usd = key_usage.cost_usd + EXCLUDED.cost_usd,
        request_count = key_usage.request_count + 1
    `);
  } catch (err) {
    logger.warn({ err }, "Failed to record key usage in DB");
  }
}
