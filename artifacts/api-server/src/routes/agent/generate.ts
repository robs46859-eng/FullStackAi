import { Router, type IRouter } from "express";
import { createGzip } from "zlib";
import { createWriteStream, mkdirSync } from "fs";
import { join, resolve } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, generationsTable } from "@workspace/db";
import { AgentGenerateBody } from "@workspace/api-zod";

const router: IRouter = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

router.post("/agent/generate", async (req, res) => {
  const parsed = AgentGenerateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const { prompt } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullCode = "";

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

  try {
    const model = process.env.AGENT_MODEL ?? "gpt-5.2";
    const stream = await openai.chat.completions.create({
      model,
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullCode += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    const slug = slugify(prompt) || "generated-api";
    const timestamp = Date.now();
    const filename = `${slug}-${timestamp}.ts.gz`;

    const agentDir = resolve(process.cwd(), "Agent");
    mkdirSync(agentDir, { recursive: true });
    const outPath = join(agentDir, filename);

    const readable = Readable.from([Buffer.from(fullCode, "utf-8")]);
    const gzip = createGzip({ level: 9 });
    const writeable = createWriteStream(outPath);
    await pipeline(readable, gzip, writeable);

    await db.insert(generationsTable).values({ prompt, filename });

    res.write(`data: ${JSON.stringify({ done: true, filename })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Agent generate error");
    res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
    res.end();
  }
});

export default router;
