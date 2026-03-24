import { Router, type IRouter } from "express";
import { db, generationsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/agent/history", async (req, res) => {
  try {
    const records = await db
      .select()
      .from(generationsTable)
      .orderBy(desc(generationsTable.createdAt));

    res.json(records);
  } catch (err) {
    req.log.error({ err }, "Agent history error");
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
