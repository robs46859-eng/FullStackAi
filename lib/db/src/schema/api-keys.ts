import { integer, pgTable, real, serial, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  keyHash: text("key_hash").notNull(),
  monthlyLimit: integer("monthly_limit").default(100).notNull(),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
export type InsertApiKey = typeof apiKeysTable.$inferInsert;

export const keyUsageTable = pgTable("key_usage", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull(),
  monthYear: varchar("month_year", { length: 7 }).notNull(),
  tokenCount: integer("token_count").default(0).notNull(),
  costUsd: real("cost_usd").default(0).notNull(),
  requestCount: integer("request_count").default(0).notNull(),
}, (table) => [unique("key_usage_api_key_month_uniq").on(table.apiKeyId, table.monthYear)]);

export type KeyUsage = typeof keyUsageTable.$inferSelect;
