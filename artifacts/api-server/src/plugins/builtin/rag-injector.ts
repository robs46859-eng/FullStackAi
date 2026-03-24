import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createGunzip } from "zlib";
import { createReadStream, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { Writable } from "stream";
import type { GatewayPlugin, GenerateContext } from "../plugin-interface";
import { gatewayConfig } from "../../lib/gateway-config";
import { logger } from "../../lib/logger";
import { embed, vectorToSql } from "../../lib/embeddings";

interface CacheRow {
  prompt_normalized: string;
  cached_code_gz_path: string;
  [key: string]: unknown;
}

async function readGzFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!existsSync(filePath)) {
      resolve("");
      return;
    }
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    const source = createReadStream(filePath);
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk as Buffer);
        cb();
      },
    });
    pipeline(source, gunzip, sink)
      .then(() => resolve(Buffer.concat(chunks).toString("utf-8")))
      .catch(reject);
  });
}

async function fetchByEmbedding(
  prompt: string,
  maxResults: number,
): Promise<CacheRow[]> {
  const vec = await embed(prompt);
  if (!vec) return [];
  const vecStr = vectorToSql(vec);
  const result = await db.execute<CacheRow>(sql`
    SELECT sc.prompt_normalized, sc.cached_code_gz_path
    FROM (
      SELECT id
      FROM semantic_cache
      WHERE embedding IS NOT NULL
        AND prompt_tsv @@ plainto_tsquery('english', ${prompt})
      ORDER BY ts_rank(prompt_tsv, plainto_tsquery('english', ${prompt})) DESC
      LIMIT 200
    ) candidates
    JOIN semantic_cache sc ON sc.id = candidates.id
    WHERE 1 - (sc.embedding <=> ${vecStr}::vector) >= ${gatewayConfig.pipeline.rag.minSimilarityScore}
    ORDER BY sc.embedding <=> ${vecStr}::vector
    LIMIT ${maxResults}
  `);
  return result.rows;
}

async function fetchByTsv(
  prompt: string,
  maxResults: number,
): Promise<CacheRow[]> {
  const result = await db.execute<CacheRow>(sql`
    SELECT prompt_normalized, cached_code_gz_path
    FROM semantic_cache
    WHERE prompt_tsv @@ plainto_tsquery('english', ${prompt})
    ORDER BY hit_count DESC, ts_rank(prompt_tsv, plainto_tsquery('english', ${prompt})) DESC
    LIMIT ${maxResults}
  `);
  return result.rows;
}

export const ragInjectorPlugin: GatewayPlugin = {
  name: "rag-injector",
  version: "1.0.0",

  async beforeGenerate(ctx: GenerateContext): Promise<void> {
    const cfg = gatewayConfig.pipeline.rag;
    if (!cfg.enabled) return;

    try {
      let rows = await fetchByEmbedding(ctx.prompt, cfg.maxResults);
      let ragStrategy = "embedding";
      if (!rows.length) {
        rows = await fetchByTsv(ctx.prompt, cfg.maxResults);
        ragStrategy = "tsvector";
      }
      if (!rows.length) return;

      const examples: string[] = [];
      for (const row of rows) {
        const code = await readGzFile(row.cached_code_gz_path);
        if (code.trim()) {
          examples.push(`// Example for: "${row.prompt_normalized}"\n${code.slice(0, 800)}`);
        }
      }

      if (examples.length === 0) return;

      const ragBlock = `\n\n[Relevant examples from codebase:]\n${examples.join("\n\n---\n\n")}\n[End examples]`;
      ctx.prompt = ctx.prompt + ragBlock;
      ctx.metadata.ragExampleCount = examples.length;
      ctx.metadata.ragStrategy = ragStrategy;
    } catch (err) {
      logger.warn({ err }, "rag-injector: failed to fetch examples");
    }
  },
};
