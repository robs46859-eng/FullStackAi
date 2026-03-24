interface TokenEntry {
  tokens: number;
  ts: number;
}

const WINDOW_MS = 60_000;
const tpmWindow: TokenEntry[] = [];

export const TPM_LIMIT = parseInt(process.env.AGENT_TPM_LIMIT ?? "50000", 10);

function evictExpired(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (tpmWindow.length > 0 && tpmWindow[0].ts < cutoff) {
    tpmWindow.shift();
  }
}

export function checkTpmLimit(): { allowed: boolean; retryAfterSec: number } {
  evictExpired();
  const currentTotal = tpmWindow.reduce((sum, e) => sum + e.tokens, 0);

  if (currentTotal >= TPM_LIMIT) {
    const oldestTs = tpmWindow[0]?.ts ?? Date.now();
    const retryAfterMs = WINDOW_MS - (Date.now() - oldestTs);
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

export function recordTokens(promptTokens: number, completionTokens: number): void {
  const total = promptTokens + completionTokens;
  if (total > 0) {
    tpmWindow.push({ tokens: total, ts: Date.now() });
  }
}

export function getWindowStats(): { total: number; limit: number } {
  evictExpired();
  const total = tpmWindow.reduce((sum, e) => sum + e.tokens, 0);
  return { total, limit: TPM_LIMIT };
}

export function checkTpmLimitForTier(multiplier: number): { allowed: boolean; retryAfterSec: number } {
  evictExpired();
  const effectiveLimit = TPM_LIMIT * multiplier;
  const currentTotal = tpmWindow.reduce((sum, e) => sum + e.tokens, 0);
  if (currentTotal >= effectiveLimit) {
    const oldestTs = tpmWindow[0]?.ts ?? Date.now();
    const retryAfterMs = WINDOW_MS - (Date.now() - oldestTs);
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}
