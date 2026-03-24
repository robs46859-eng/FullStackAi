import { Router, type IRouter } from "express";
import { createGzip } from "zlib";
import { createWriteStream, mkdirSync } from "fs";
import { join, resolve } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { db, generationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { AgentGenerateBody } from "@workspace/api-zod";
import { piiShield } from "../../middlewares/pii-shield";
import { semanticCache, tokenize } from "../../middlewares/semantic-cache";
import { checkTpmLimit, recordTokens } from "../../lib/tpm-limiter";
import { streamWithFallback } from "../../lib/providers/registry";

const router: IRouter = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const systemPrompt = `You are an expert TypeScript backend developer.
Generate a complete, production-ready, async Express 5 route handler based on the user's prompt.
The output should be a single TypeScript file that:
- Uses Express 5 Router
- Uses async/await throughout
- Has proper error handling with try/catch
- Includes Zod validation for request bodies where appropriate
- Includes JSDoc comments
- Is fully self-contained and ready to mount in an Express app
- Exports the router as the default export

Only output the TypeScript code, no markdown, no explanations.`;

router.post(
  "/agent/generate",
  piiShield,
  semanticCache,
  async (req, res) => {
    const parsed = AgentGenerateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const { allowed, retryAfterSec } = checkTpmLimit();
    if (!allowed) {
      res
        .status(429)
        .set("Retry-After", String(retryAfterSec))
        .json({ error: "Token rate limit exceeded. Try again shortly.", code: "TPM_LIMIT" });
      return;
    }

    const prompt = req.sanitizedPrompt ?? parsed.data.prompt;
    const piiFlags = req.piiFlags;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    if (piiFlags?.redacted) {
      res.write(
        `data: ${JSON.stringify({
          piiWarning: `${piiFlags.count} PII pattern(s) were redacted from your prompt before sending to the model.`,
        })}\n\n`,
      );
    }

    let fullCode = "";
    let ttftMs: number | null = null;
    const startTs = Date.now();

    const onToken = (content: string) => {
      if (ttftMs === null) ttftMs = Date.now() - startTs;
      fullCode += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    };

    const onReset = (notice: string) => {
      fullCode = "";
      ttftMs = null;
      res.write(`data: ${JSON.stringify({ streamReset: true, notice })}\n\n`);
    };

    let streamResult;
    try {
      streamResult = await streamWithFallback(prompt, systemPrompt, onToken, onReset);
    } catch (err) {
      req.log.error({ err }, "All providers exhausted during generation");
      res.write(`data: ${JSON.stringify({ error: "Generation failed: all providers exhausted" })}\n\n`);
      res.end();
      return;
    }

    const { promptTokens, completionTokens, modelUsed, providerName, costUsd } = streamResult;

    const slug = slugify(parsed.data.prompt) || "generated-api";
    const timestamp = Date.now();
    const filename = `${slug}-${timestamp}.ts.gz`;

    const agentDir = resolve(process.cwd(), "Agent");
    mkdirSync(agentDir, { recursive: true });
    const outPath = join(agentDir, filename);

    const readable = Readable.from([Buffer.from(fullCode, "utf-8")]);
    const gzip = createGzip({ level: 9 });
    const writeable = createWriteStream(outPath);
    await pipeline(readable, gzip, writeable);

    recordTokens(promptTokens, completionTokens);

    await db.insert(generationsTable).values({
      prompt: parsed.data.prompt,
      filename,
      tokenCountPrompt: promptTokens,
      tokenCountCompletion: completionTokens,
      costUsd,
      ttftMs: ttftMs ?? undefined,
      modelUsed,
      cacheHit: false,
    });

    const tokens = tokenize(prompt);

    await db.execute(sql`
      INSERT INTO semantic_cache
        (prompt_normalized, filename, cached_code_gz_path, similarity_tokens, hit_count, prompt_tsv)
      VALUES
        (${prompt}, ${filename}, ${outPath}, ${JSON.stringify([...tokens])}, 0,
         to_tsvector('english', ${prompt}))
    `);

    res.write(
      `data: ${JSON.stringify({
        done: true,
        filename,
        model: modelUsed,
        provider: providerName,
        cached: false,
        tokenCount: { prompt: promptTokens, completion: completionTokens },
        costUsd,
        ttftMs,
      })}\n\n`,
    );
    res.end();
  },
);

export default router;
