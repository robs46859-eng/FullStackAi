import { customType, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const vector768 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value) as number[];
  },
});

export const semanticCacheTable = pgTable(
  "semantic_cache",
  {
    id: serial("id").primaryKey(),
    promptNormalized: text("prompt_normalized").notNull(),
    filename: text("filename").notNull(),
    cachedCodeGzPath: text("cached_code_gz_path").notNull(),
    similarityTokens: text("similarity_tokens").notNull(),
    promptTsv: tsvector("prompt_tsv"),
    embedding: vector768("embedding"),
    hitCount: integer("hit_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("semantic_cache_prompt_tsv_gin_idx").using("gin", table.promptTsv),
  ],
);

export type SemanticCacheEntry = typeof semanticCacheTable.$inferSelect;
