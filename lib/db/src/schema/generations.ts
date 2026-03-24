import { boolean, integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const generationsTable = pgTable("generations", {
  id: serial("id").primaryKey(),
  prompt: text("prompt").notNull(),
  filename: text("filename").notNull(),
  tokenCountPrompt: integer("token_count_prompt"),
  tokenCountCompletion: integer("token_count_completion"),
  costUsd: real("cost_usd"),
  ttftMs: integer("ttft_ms"),
  modelUsed: text("model_used"),
  cacheHit: boolean("cache_hit").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGenerationSchema = createInsertSchema(generationsTable).omit({ id: true, createdAt: true });
export type InsertGeneration = z.infer<typeof insertGenerationSchema>;
export type Generation = typeof generationsTable.$inferSelect;
