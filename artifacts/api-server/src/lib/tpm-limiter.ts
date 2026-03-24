import { randomUUID } from "crypto";
import { getRedis, isRedisAvailable } from "./redis";

interface TokenEntry {
  tokens: number;
  ts: number;
}

const WINDOW_MS = 60_000;
const WINDOW_EXPIRE_SEC = 120;

const tpmWindow: TokenEntry[] = [];

export const TPM_LIMIT = parseInt(process.env.AGENT_TPM_LIMIT ?? "50000", 10);

export const USER_TPM_LIMITS: Record<string, number> = {
  free: 10_000,
  pro: 50_000,
  enterprise: 200_000,
};

function evictExpired(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (tpmWindow.length > 0 && tpmWindow[0].ts < cutoff) {
    tpmWindow.shift();
  }
}

const CHECK_AND_SUM_SCRIPT = `
local key = KEYS[1]
local window_start = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

local members = redis.call('ZRANGE', key, 0, -1)
local total = 0
for _, m in ipairs(members) do
  local t = tonumber(string.match(m, '^(%d+):'))
  if t then total = total + t end
end

if total >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = (oldest[2] and tonumber(oldest[2])) or now
  local retryMs = 60000 - (now - oldestScore)
  local retryS = math.ceil(retryMs / 1000)
  if retryS < 1 then retryS = 1 end
  return {0, retryS}
end
return {1, 0}
`;

const GET_TOTAL_SCRIPT = `
local key = KEYS[1]
local window_start = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
local members = redis.call('ZRANGE', key, 0, -1)
local total = 0
for _, m in ipairs(members) do
  local t = tonumber(string.match(m, '^(%d+):'))
  if t then total = total + t end
end
return total
`;

async function redisCheckTpm(
  key: string,
  limit: number,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const redis = getRedis();
  if (!redis || !isRedisAvailable()) {
    return checkTpmInMemory(limit);
  }
  try {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const result = (await redis.eval(
      CHECK_AND_SUM_SCRIPT,
      1,
      key,
      String(windowStart),
      String(now),
      String(limit),
    )) as [number, number];
    return { allowed: result[0] === 1, retryAfterSec: result[1] };
  } catch {
    return checkTpmInMemory(limit);
  }
}

async function redisRecordTokens(key: string, tokens: number): Promise<void> {
  const redis = getRedis();
  if (!redis || !isRedisAvailable()) return;
  try {
    const now = Date.now();
    const member = `${tokens}:${now}:${randomUUID()}`;
    const pipeline = redis.pipeline();
    pipeline.zadd(key, now, member);
    pipeline.expire(key, WINDOW_EXPIRE_SEC);
    await pipeline.exec();
  } catch {
    // Non-fatal — fall through
  }
}

async function redisGetTotal(key: string): Promise<number> {
  const redis = getRedis();
  if (!redis || !isRedisAvailable()) return 0;
  try {
    const windowStart = Date.now() - WINDOW_MS;
    const result = await redis.eval(GET_TOTAL_SCRIPT, 1, key, String(windowStart)) as number;
    return Number(result);
  } catch {
    return 0;
  }
}

function checkTpmInMemory(limit: number): { allowed: boolean; retryAfterSec: number } {
  evictExpired();
  const currentTotal = tpmWindow.reduce((sum, e) => sum + e.tokens, 0);
  if (currentTotal >= limit) {
    const oldestTs = tpmWindow[0]?.ts ?? Date.now();
    const retryAfterMs = WINDOW_MS - (Date.now() - oldestTs);
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordTokensInMemory(tokens: number): void {
  if (tokens > 0) {
    tpmWindow.push({ tokens, ts: Date.now() });
  }
}

export async function checkTpmLimit(): Promise<{ allowed: boolean; retryAfterSec: number }> {
  return redisCheckTpm("tpm:global", TPM_LIMIT);
}

export async function checkTpmLimitForTier(
  multiplier: number,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  return redisCheckTpm("tpm:global", TPM_LIMIT * multiplier);
}

export async function checkUserTpmLimit(
  userId: string,
  planTier: string,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const limit = USER_TPM_LIMITS[planTier] ?? USER_TPM_LIMITS.free;
  return redisCheckTpm(`tpm:user:${userId}`, limit);
}

export async function recordTokens(
  promptTokens: number,
  completionTokens: number,
  userId?: string,
): Promise<void> {
  const total = promptTokens + completionTokens;
  if (total <= 0) return;

  if (!isRedisAvailable()) {
    recordTokensInMemory(total);
    return;
  }

  await Promise.all([
    redisRecordTokens("tpm:global", total),
    userId ? redisRecordTokens(`tpm:user:${userId}`, total) : Promise.resolve(),
  ]);
}

export async function getWindowStats(
  userId?: string,
  planTier?: string,
): Promise<{
  global: { total: number; limit: number; source: "redis" | "memory" };
  user?: { total: number; limit: number; userId: string; planTier: string };
}> {
  const usingRedis = isRedisAvailable();

  let globalTotal: number;
  if (usingRedis) {
    globalTotal = await redisGetTotal("tpm:global");
  } else {
    evictExpired();
    globalTotal = tpmWindow.reduce((sum, e) => sum + e.tokens, 0);
  }

  const result: {
    global: { total: number; limit: number; source: "redis" | "memory" };
    user?: { total: number; limit: number; userId: string; planTier: string };
  } = {
    global: {
      total: globalTotal,
      limit: TPM_LIMIT,
      source: usingRedis ? "redis" : "memory",
    },
  };

  if (userId && usingRedis) {
    const userTotal = await redisGetTotal(`tpm:user:${userId}`);
    const resolvedTier = planTier ?? "free";
    result.user = {
      total: userTotal,
      limit: USER_TPM_LIMITS[resolvedTier] ?? USER_TPM_LIMITS.free,
      userId,
      planTier: resolvedTier,
    };
  }

  return result;
}
