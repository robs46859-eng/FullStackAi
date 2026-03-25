import type { Request, Response, NextFunction } from "express";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { promisify } from "util";
import { gunzip } from "zlib";
import { db, semanticCacheTable, generationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { pluginLoader } from "../plugins";
import type { GenerateContext } from "../plugins/plugin-interface";
import { embed, vectorToSql, COSINE_THRESHOLD } from "../lib/embeddings";

const gunzipAsync = promisify(gunzip);

const JACCARD_THRESHOLD = 0.85;

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
  has_embedding: boolean;
  [key: string]: unknown;
}

interface VectorCacheRow extends CacheRow {
  distance: number;
}

async function findByEmbedding(embeddingStr: string, prompt: string): Promise<VectorCacheRow | null> {
  try {
    const tsvResult = await db.execute<VectorCacheRow>(sql`
      SELECT
        sc.id, sc.prompt_normalized, sc.filename, sc.cached_code_gz_path,
        sc.similarity_tokens, sc.hit_count, true AS has_embedding,
        sc.embedding <=> ${embeddingStr}::vector AS distance
      FROM (
        SELECT id
        FROM semantic_cache
        WHERE embedding IS NOT NULL
          AND prompt_tsv @@ plainto_tsquery('english', ${prompt})
        ORDER BY ts_rank(prompt_tsv, plainto_tsquery('english', ${prompt})) DESC
        LIMIT 200
      ) candidates
      JOIN semantic_cache sc ON sc.id = candidates.id
      ORDER BY sc.embedding <=> ${embeddingStr}::vector
      LIMIT 1
    `);

    const row = tsvResult.rows[0];
    if (!row) return null;
    const distance = Number(row.distance);
    return distance <= COSINE_THRESHOLD ? { ...row, distance } : null;
  } catch {
    return null;
  }
}

async function findCandidates(prompt: string): Promise<CacheRow[]> {
  try {
    const tsvResult = await db.execute<CacheRow>(sql`
      SELECT id, prompt_normalized, filename, cached_code_gz_path, similarity_tokens, hit_count,
        (embedding IS NOT NULL) AS has_embedding
      FROM semantic_cache
      WHERE prompt_tsv @@ plainto_tsquery('english', ${prompt})
      ORDER BY ts_rank(prompt_tsv, plainto_tsquery('english', ${prompt})) DESC
      LIMIT 200
    `);

    if (tsvResult.rows.length > 0) {
      return tsvResult.rows;
    }
  } catch {
    // tsvector search failed — fall through to full scan
  }

  const fallback = await db.execute<CacheRow>(sql`
    SELECT id, prompt_normalized, filename, cached_code_gz_path, similarity_tokens, hit_count,
      (embedding IS NOT NULL) AS has_embedding
    FROM semantic_cache
    ORDER BY hit_count DESC
    LIMIT 100
  `);

  return fallback.rows;
}

async function serveFromCache(
  req: Request,
  res: Response,
  row: CacheRow,
  prompt: string,
): Promise<boolean> {
  const filePath = row.cached_code_gz_path;
  if (!existsSync(filePath)) return false;

  let code: string;
  try {
    const compressed = await readFile(filePath);
    const decompressed = await gunzipAsync(compressed);
    code = decompressed.toString("utf-8");
  } catch {
    return false;
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
    // Non-fatal
  }

  const cacheCtx: GenerateContext = {
    requestId: String(req.id ?? Math.random()),
    prompt,
    originalPrompt: prompt,
    systemPrompt: "",
    cached: true,
    userId: req.user?.id,
    metadata: { cacheFilename: row.filename },
  };

  await pluginLoader.run("onCacheHit", cacheCtx);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ cacheHit: true })}\n\n`);

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
  return true;
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

  const [embedding] = await Promise.all([embed(prompt)]);

  if (embedding) {
    const embeddingStr = vectorToSql(embedding);
    let vectorRow: VectorCacheRow | null = null;
    try {
      vectorRow = await findByEmbedding(embeddingStr, prompt);
    } catch {
      // Fall through to Jaccard
    }

    if (vectorRow) {
      const served = await serveFromCache(req, res, vectorRow, prompt);
      if (served) return;
    }
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
    if (row.has_embedding && embedding) continue;
    try {
      const cachedTokens = new Set<string>(JSON.parse(row.similarity_tokens) as string[]);
      const sim = jaccard(currentTokens, cachedTokens);
      if (sim >= JACCARD_THRESHOLD && (!bestMatch || sim > bestMatch.similarity)) {
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

  const served = await serveFromCache(req, res, bestMatch.row, prompt);
  if (!served) {
    next();
  }
}
