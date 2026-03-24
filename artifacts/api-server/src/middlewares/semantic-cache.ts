import type { Request, Response, NextFunction } from "express";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { promisify } from "util";
import { gunzip } from "zlib";
import { db, semanticCacheTable, generationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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

interface CacheRow {
  id: number;
  prompt_normalized: string;
  filename: string;
  cached_code_gz_path: string;
  similarity_tokens: string;
  hit_count: number;
}

async function findCandidates(prompt: string): Promise<CacheRow[]> {
  try {
    const tsvResult = await db.execute<CacheRow>(sql`
      SELECT id, prompt_normalized, filename, cached_code_gz_path, similarity_tokens, hit_count
      FROM semantic_cache
      WHERE prompt_tsv @@ plainto_tsquery('english', ${prompt})
      ORDER BY ts_rank(prompt_tsv, plainto_tsquery('english', ${prompt})) DESC
      LIMIT 200
    `);

    if (tsvResult.rows.length > 0) {
      return tsvResult.rows;
    }
  } catch {
    // tsvector search failed (e.g., empty query term) — fall through to full scan
  }

  const fallback = await db.execute<CacheRow>(sql`
    SELECT id, prompt_normalized, filename, cached_code_gz_path, similarity_tokens, hit_count
    FROM semantic_cache
    ORDER BY hit_count DESC
    LIMIT 100
  `);

  return fallback.rows;
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

  let candidates: CacheRow[];
  try {
    candidates = await findCandidates(prompt);
  } catch {
    next();
    return;
  }

  let bestMatch: { row: CacheRow; similarity: number } | null = null;

  for (const row of candidates) {
    try {
      const cachedTokens = new Set<string>(JSON.parse(row.similarity_tokens) as string[]);
      const sim = jaccard(currentTokens, cachedTokens);
      if (sim >= SIMILARITY_THRESHOLD && (!bestMatch || sim > bestMatch.similarity)) {
        bestMatch = { row, similarity: sim };
      }
    } catch {
      continue;
    }
  }

  if (!bestMatch) {
    next();
    return;
  }

  const { row } = bestMatch;
  const filePath = row.cached_code_gz_path;

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
      .set({ hitCount: row.hit_count + 1 })
      .where(eq(semanticCacheTable.id, row.id));

    await db.insert(generationsTable).values({
      prompt,
      filename: row.filename,
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
      filename: row.filename,
      cached: true,
      model: "cached",
    })}\n\n`,
  );
  res.end();
}
