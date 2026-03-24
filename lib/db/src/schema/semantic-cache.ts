import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const semanticCacheTable = pgTable("semantic_cache", {
  id: serial("id").primaryKey(),
  promptNormalized: text("prompt_normalized").notNull(),
  filename: text("filename").notNull(),
  cachedCodeGzPath: text("cached_code_gz_path").notNull(),
  similarityTokens: text("similarity_tokens").notNull(),
  hitCount: integer("hit_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SemanticCacheEntry = typeof semanticCacheTable.$inferSelect;
