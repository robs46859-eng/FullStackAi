import type { Request, Response, NextFunction } from "express";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { promisify } from "util";
import { gunzip } from "zlib";
import { db, semanticCacheTable, generationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const gunzipAsync = promisify(gunzip);

const SIMILARITY_THRESHOLD = 0.85;

const STOP_WORDS = new Set([
  "a","an","the","in","on","at","to","for","of","with","that","this","is","are",
  "was","were","be","been","as","by","from","it","its","have","has","had","or",
  "and","but","not","i","my","your","we","they","he","she","do","did","can",
  "could","will","would","should","may","might","so","if","then","than","into",
  "up","out","how","what","which","who","when","where","why","all","each","both",
  "more","some","any","over","about","make","get","use","just","also","new","like",
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

export async function semanticCache(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const prompt: string = req.sanitizedPrompt ?? req.body?.prompt ?? "";

  if (!prompt) {
    next();
    return;
  }

  const currentTokens = tokenize(prompt);

  let entries: Array<typeof semanticCacheTable.$inferSelect>;
  try {
    entries = await db
      .select()
      .from(semanticCacheTable)
      .orderBy(semanticCacheTable.hitCount)
      .limit(2000);
  } catch {
    next();
    return;
  }

  let bestMatch: { entry: typeof semanticCacheTable.$inferSelect; similarity: number } | null = null;

  for (const entry of entries) {
    try {
      const cachedTokens = new Set<string>(JSON.parse(entry.tokenJson) as string[]);
      const sim = jaccard(currentTokens, cachedTokens);
      if (sim >= SIMILARITY_THRESHOLD && (!bestMatch || sim > bestMatch.similarity)) {
        bestMatch = { entry, similarity: sim };
      }
    } catch {
      continue;
    }
  }

  if (!bestMatch) {
    next();
    return;
  }

  const { entry } = bestMatch;
  const agentDir = resolve(process.cwd(), "Agent");
  const filePath = join(agentDir, entry.filename);

  if (!existsSync(filePath)) {
    next();
    return;
  }

  let code: string;
  try {
    const compressed = await readFile(filePath);
    const decompressed = await gunzipAsync(compressed);
    code = decompressed.toString("utf-8");
  } catch {
    next();
    return;
  }

  try {
    await db
      .update(semanticCacheTable)
      .set({ hitCount: entry.hitCount + 1 })
      .where(eq(semanticCacheTable.id, entry.id));

    await db.insert(generationsTable).values({
      prompt,
      filename: entry.filename,
      cacheHit: true,
      modelUsed: "cached",
    });
  } catch {
    // Non-fatal — still serve the cached response
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const chunkSize = 120;
  for (let i = 0; i < code.length; i += chunkSize) {
    res.write(`data: ${JSON.stringify({ content: code.slice(i, i + chunkSize) })}\n\n`);
  }

  res.write(
    `data: ${JSON.stringify({
      done: true,
      filename: entry.filename,
      cached: true,
      model: "cached",
    })}\n\n`,
  );
  res.end();
}
