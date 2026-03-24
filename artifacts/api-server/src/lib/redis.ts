import Redis from "ioredis";
import { logger } from "./logger";

let _redis: Redis | null = null;
let _redisAvailable = false;

export function getRedis(): Redis | null {
  return _redis;
}

export function isRedisAvailable(): boolean {
  return _redisAvailable;
}

export async function initRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("REDIS_URL not set — rate limiting will use in-memory fallback");
    return;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      commandTimeout: 2_000,
      lazyConnect: true,
      enableReadyCheck: true,
    });

    await client.connect();
    await client.ping();
    _redis = client;
    _redisAvailable = true;
    logger.info("Redis connected successfully");

    client.on("error", (err: Error) => {
      if (_redisAvailable) {
        logger.warn({ err: err.message }, "Redis error — falling back to in-memory rate limiting");
        _redisAvailable = false;
      }
    });

    client.on("ready", () => {
      _redisAvailable = true;
      logger.info("Redis reconnected");
    });
  } catch (err) {
    logger.warn({ err }, "Redis connection failed — using in-memory rate limiting fallback");
  }
}
