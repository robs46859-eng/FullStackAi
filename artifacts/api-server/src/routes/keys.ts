import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, apiKeysTable, keyUsageTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function currentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function generateApiKey(): { prefix: string; key: string } {
  const secret = crypto.randomBytes(32).toString("base64url");
  const prefix = `sk_${secret.slice(0, 8)}`;
  const key = `${prefix}_${secret}`;
  return { prefix, key };
}

router.get("/keys", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      monthlyLimit: apiKeysTable.monthlyLimit,
      revokedAt: apiKeysTable.revokedAt,
      lastUsedAt: apiKeysTable.lastUsedAt,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, req.user.id))
    .orderBy(sql`${apiKeysTable.createdAt} DESC`);

  res.json(keys);
});

router.post("/keys", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, monthlyLimit = 100 } = req.body as { name: string; monthlyLimit?: number };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const { prefix, key } = generateApiKey();
  const keyHash = hashKey(key);

  const [created] = await db
    .insert(apiKeysTable)
    .values({
      userId: req.user.id,
      name: name.trim(),
      keyPrefix: prefix,
      keyHash,
      monthlyLimit: Number(monthlyLimit) || 100,
    })
    .returning();

  res.status(201).json({
    id: created.id,
    name: created.name,
    keyPrefix: created.keyPrefix,
    key,
    monthlyLimit: created.monthlyLimit,
    createdAt: created.createdAt,
  });
});

router.delete("/keys/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const keyId = parseInt(req.params.id, 10);
  if (isNaN(keyId)) {
    res.status(400).json({ error: "Invalid key ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.id, keyId), eq(apiKeysTable.userId, req.user.id)));

  if (!existing) {
    res.status(404).json({ error: "Key not found" });
    return;
  }

  await db
    .update(apiKeysTable)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeysTable.id, keyId));

  res.json({ success: true });
});

router.get("/keys/:id/usage", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const keyId = parseInt(req.params.id, 10);
  if (isNaN(keyId)) {
    res.status(400).json({ error: "Invalid key ID" });
    return;
  }

  const [key] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.id, keyId), eq(apiKeysTable.userId, req.user.id)));

  if (!key) {
    res.status(404).json({ error: "Key not found" });
    return;
  }

  const monthYear = currentMonthYear();
  const [usage] = await db
    .select()
    .from(keyUsageTable)
    .where(and(eq(keyUsageTable.apiKeyId, keyId), eq(keyUsageTable.monthYear, monthYear)));

  res.json({
    monthYear,
    tokenCount: usage?.tokenCount ?? 0,
    costUsd: usage?.costUsd ?? 0,
    requestCount: usage?.requestCount ?? 0,
    monthlyLimit: key.monthlyLimit,
  });
});

export default router;
