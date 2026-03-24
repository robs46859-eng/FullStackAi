/**
 * Public API Gateway — authenticated via API key (Bearer token)
 * Routes: POST /api/v1/generate, GET /api/v1/me, GET /api/v1/openapi.json
 */
import { Router, type IRouter } from "express";
import { createGzip } from "zlib";
import { createWriteStream, mkdirSync } from "fs";
import { join, resolve } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, generationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { apiKeyAuth, recordKeyUsage } from "../middlewares/apiKeyAuth";
import { piiShield } from "../middlewares/pii-shield";
import { semanticCache, tokenize } from "../middlewares/semantic-cache";
import { checkTpmLimit, recordTokens } from "../lib/tpm-limiter";

const router: IRouter = Router();

const COST_PER_1K_INPUT = parseFloat(process.env.COST_PER_1K_INPUT ?? "0.003");
const COST_PER_1K_OUTPUT = parseFloat(process.env.COST_PER_1K_OUTPUT ?? "0.015");

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

router.get("/v1/me", apiKeyAuth, (req, res) => {
  if (!req.apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    keyId: req.apiKey.id,
    keyPrefix: req.apiKey.keyPrefix,
    name: req.apiKey.name,
    monthlyLimit: req.apiKey.monthlyLimit,
    createdAt: req.apiKey.createdAt,
    lastUsedAt: req.apiKey.lastUsedAt,
  });
});

router.post("/v1/generate", apiKeyAuth, piiShield, semanticCache, async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const { allowed, retryAfterSec } = checkTpmLimit();
  if (!allowed) {
    res.status(429).set("Retry-After", String(retryAfterSec)).json({
      error: "Token rate limit exceeded",
      code: "TPM_LIMIT",
    });
    return;
  }

  const resolvedPrompt = req.sanitizedPrompt ?? prompt;
  const primaryModel = process.env.AGENT_MODEL ?? "gpt-5.2";
  const fallbackModel = process.env.AGENT_FALLBACK_MODEL ?? "gpt-4.1";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullCode = "";
  let ttftMs: number | null = null;
  let usagePromptTokens: number | null = null;
  let usageCompletionTokens: number | null = null;
  let usedModel = primaryModel;
  const startTs = Date.now();

  const tryGenerate = async (model: string): Promise<boolean> => {
    try {
      const stream = await openai.chat.completions.create({
        model,
        max_completion_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: resolvedPrompt },
        ],
        stream: true,
        stream_options: { include_usage: true },
      });
      usedModel = model;

      for await (const chunk of stream) {
        if (chunk.usage) {
          usagePromptTokens = chunk.usage.prompt_tokens ?? null;
          usageCompletionTokens = chunk.usage.completion_tokens ?? null;
        }
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          if (ttftMs === null) ttftMs = Date.now() - startTs;
          fullCode += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      return true;
    } catch (err) {
      req.log.warn({ err, model }, "LLM call failed");
      return false;
    }
  };

  let succeeded = await tryGenerate(primaryModel);
  if (!succeeded && primaryModel !== fallbackModel) {
    res.write(`data: ${JSON.stringify({ streamReset: true, notice: `Retrying with ${fallbackModel}…` })}\n\n`);
    fullCode = "";
    ttftMs = null;
    succeeded = await tryGenerate(fallbackModel);
  }

  if (!succeeded) {
    res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
    res.end();
    return;
  }

  const slug = slugify(prompt) || "generated-api";
  const filename = `${slug}-${Date.now()}.ts.gz`;
  const agentDir = resolve(process.cwd(), "Agent");
  mkdirSync(agentDir, { recursive: true });
  const outPath = join(agentDir, filename);

  const readable = Readable.from([Buffer.from(fullCode, "utf-8")]);
  const gzip = createGzip({ level: 9 });
  const writeable = createWriteStream(outPath);
  await pipeline(readable, gzip, writeable);

  const promptTokens = usagePromptTokens ?? Math.ceil(resolvedPrompt.length / 4);
  const completionTokens = usageCompletionTokens ?? Math.ceil(fullCode.length / 4);
  const costUsd =
    (promptTokens / 1000) * COST_PER_1K_INPUT +
    (completionTokens / 1000) * COST_PER_1K_OUTPUT;

  recordTokens(promptTokens, completionTokens);

  await db.insert(generationsTable).values({
    prompt,
    filename,
    tokenCountPrompt: promptTokens,
    tokenCountCompletion: completionTokens,
    costUsd,
    ttftMs: ttftMs ?? undefined,
    modelUsed: usedModel,
    cacheHit: false,
  });

  const tokens = tokenize(resolvedPrompt);
  await db.execute(sql`
    INSERT INTO semantic_cache
      (prompt_normalized, filename, cached_code_gz_path, similarity_tokens, hit_count, prompt_tsv)
    VALUES
      (${resolvedPrompt}, ${filename}, ${outPath}, ${JSON.stringify([...tokens])}, 0,
       to_tsvector('english', ${resolvedPrompt}))
  `);

  if (req.apiKey) {
    recordKeyUsage(req.apiKey.keyHash, req.apiKey.id, promptTokens + completionTokens, costUsd)
      .catch((err) => req.log.warn({ err }, "recordKeyUsage failed"));
  }

  res.write(`data: ${JSON.stringify({
    done: true,
    filename,
    model: usedModel,
    cached: false,
    tokenCount: { prompt: promptTokens, completion: completionTokens },
    costUsd,
    ttftMs,
  })}\n\n`);
  res.end();
});

export default router;
