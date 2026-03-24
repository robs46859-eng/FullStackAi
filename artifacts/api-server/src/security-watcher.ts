import chokidar from "chokidar";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import { openai } from "@workspace/integrations-openai-ai-server";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});

const SECURITY_SYSTEM_PROMPT = `You are a senior application-security engineer specialising in Node.js / Express APIs.

Your task is to review the TypeScript source file provided by the user and return a security-hardened version of it.

Apply every relevant fix from the list below without breaking existing behaviour. Leave a short inline comment beginning with \`// SECURITY:\` wherever you make a change so the developer knows exactly what was improved and why.

Checklist:
1. **Helmet security headers** – add or tighten helmet() middleware; set Content-Security-Policy, X-Frame-Options, HSTS, X-Content-Type-Options, etc. (OWASP A05).
2. **CORS origin restriction** – replace wide-open cors() / cors({ origin: '*' }) with an explicit allow-list; never trust the Origin header blindly (OWASP A01).
3. **Rate limiting** – add express-rate-limit (or tighten existing limits) on every route, especially auth and resource-intensive endpoints; use a store-backed limit in production (OWASP A04).
4. **Request body size limits** – set express.json({ limit: '10kb' }) and urlencoded limits; reject oversized payloads before they reach business logic (OWASP A04).
5. **Path traversal prevention** – for any file-write or file-read operation, call path.resolve() then verify the resolved path starts with the expected base directory; throw if it escapes (OWASP A01 / A03).
6. **Information leakage in error responses** – never expose stack traces, internal error messages, or raw DB errors to clients; log the full error server-side, return a generic message to the client (OWASP A09).
7. **Input sanitisation beyond Zod** – strip unknown fields (.strip() on Zod schemas or explicit pick), enforce string max-length limits on every string field, and reject NUL bytes (OWASP A03).
8. **Authentication / authorisation hooks** – add middleware stubs with clear \`// TODO(auth):\` markers wherever credentials should be checked; never leave endpoints fully open if they mutate state (OWASP A01 / A07).
9. **SSE / streaming endpoint hardening** – set res.setTimeout(), limit concurrent connections per IP if feasible, ensure the stream is always closed on error or client disconnect (OWASP A04).
10. **General OWASP Top 10 inline comments** – for any remaining risk you spot, add a \`// OWASP A0N:\` comment with a one-line description of the risk and the recommended mitigation.

Rules:
- Output ONLY the full TypeScript source file, no markdown code fences, no explanations outside comments.
- Do NOT change import paths, exported symbols, or the overall module structure.
- Keep all existing logic intact; only add security controls around it.
- If a category is not applicable to this file, skip it silently (do not add empty middleware).
- Prefer minimal, targeted changes over wholesale rewrites.`;

async function getNextRevNumber(
  dir: string,
  baseName: string,
): Promise<number> {
  let files: string[] = [];
  try {
    files = readdirSync(dir);
  } catch {
    return 1;
  }
  const revPattern = new RegExp(
    `^${escapeRegex(baseName)}\\.rev(\\d+)\\.ts$`,
    "i",
  );
  let maxRev = 0;
  for (const f of files) {
    const m = f.match(revPattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxRev) maxRev = n;
    }
  }
  return maxRev + 1;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function reviewFile(filePath: string): Promise<void> {
  const absolutePath = resolve(filePath);
  logger.info({ file: absolutePath }, "File changed — starting security review");

  let source: string;
  try {
    source = readFileSync(absolutePath, "utf-8");
  } catch (err) {
    logger.error({ err, file: absolutePath }, "Failed to read file — skipping");
    return;
  }

  if (!source.trim()) {
    logger.warn({ file: absolutePath }, "File is empty — skipping");
    return;
  }

  logger.info({ file: absolutePath }, "Sending file to OpenAI for security review");

  let improved = "";
  try {
    const model = process.env.SECURITY_REVIEW_MODEL ?? process.env.AGENT_MODEL ?? "gpt-4.1";
    const stream = await openai.chat.completions.create({
      model,
      max_completion_tokens: 16384,
      messages: [
        { role: "system", content: SECURITY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Review and harden the following TypeScript file:\n\n${source}`,
        },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        improved += content;
        process.stdout.write(".");
      }
    }
    process.stdout.write("\n");
  } catch (err) {
    logger.error({ err, file: absolutePath }, "OpenAI request failed");
    return;
  }

  if (!improved.trim()) {
    logger.warn({ file: absolutePath }, "Model returned empty response — skipping write");
    return;
  }

  const dir = dirname(absolutePath);
  const ext = extname(absolutePath);
  const base = basename(absolutePath, ext);

  const revN = await getNextRevNumber(dir, base);
  const outName = `${base}.rev${revN}.ts`;
  const outPath = join(dir, outName);

  try {
    writeFileSync(outPath, improved, "utf-8");
    logger.info({ file: absolutePath, revision: outPath }, "Security revision saved");
  } catch (err) {
    logger.error({ err, outPath }, "Failed to write revision file");
  }
}

function main(): void {
  const __filename = fileURLToPath(import.meta.url);
  const srcDir = join(dirname(__filename), "..", "src");

  logger.info({ watchDir: srcDir }, "Security Review Agent starting up");

  const watcher = chokidar.watch(`${srcDir}/**/*.ts`, {
    ignored: [
      /security-watcher\.ts$/,
      /\.rev\d+\.ts$/,
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on("change", (filePath) => {
    reviewFile(filePath).catch((err) => {
      logger.error({ err, file: filePath }, "Unexpected error during review");
    });
  });

  watcher.on("error", (err) => {
    logger.error({ err }, "Watcher error");
  });

  watcher.on("ready", () => {
    logger.info("Watcher ready — monitoring source files for changes");
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received — shutting down watcher");
    watcher.close().then(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received — shutting down watcher");
    watcher.close().then(() => process.exit(0));
  });
}

main();
