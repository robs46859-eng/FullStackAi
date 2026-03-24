# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── ai-studio/          # React + Vite AI Studio frontend (served at /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-openai-ai-server/ # Replit AI Integration (OpenAI SDK wrapper)
├── Agent/                  # Output directory for gzip-compressed generated API files
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- **Layer 8 Gateway middleware** in `src/middlewares/`:
  - `pii-shield.ts` — redacts PII (email, phone, SSN, CC) and blocks prompt injection patterns; runs first on generate
  - `semantic-cache.ts` — Two-tier cache: (1) vector similarity via Gemini embeddings (cosine distance ≤ 0.15) with tsvector pre-filter → top-200 cosine re-rank; (2) Jaccard fallback (≥85%) for rows without embeddings; short-circuits LLM call on hit
- **Gateway lib** in `src/lib/`:
  - `redis.ts` — ioredis singleton; connects to `REDIS_URL` on startup; gracefully degrades to in-memory if unavailable; exports `getRedis()`, `isRedisAvailable()`, `initRedis()`
  - `tpm-limiter.ts` — async Redis sorted-set sliding-window TPM limiter (ZADD/ZREMRANGEBYSCORE via Lua scripts); falls back to in-memory when Redis unavailable; supports: `checkTpmLimit()` (global), `checkTpmLimitForTier(multiplier)` (global×multiplier), `checkUserTpmLimit(userId, planTier)` (per-user: free=10k, pro=50k, enterprise=200k); `recordTokens(prompt, completion, userId?)` writes to both global+user keys; `getWindowStats(userId?)` returns `{global:{total,limit,source}, user?:{...}}`
  - `embeddings.ts` — Gemini `text-embedding-004` embedding client (768 dims) via `@workspace/integrations-gemini-ai`; `embed(text): Promise<number[]|null>` with graceful null fallback; `vectorToSql(embedding)` converts to pgvector string format; `COSINE_THRESHOLD = 0.15` (cosine distance ≤ 0.15 ≈ 85% similarity)
  - `gateway-config.ts` — loads `config/gateway.yaml` with deep-merge fallback to defaults; exported `gatewayConfig` singleton
  - `mcp-server.ts` — MCP server via `@modelcontextprotocol/sdk` StreamableHTTP transport; mounted at `POST/GET/DELETE /api/mcp`; exposes `generate`, `gateway-stats`, `list-providers` tools; stateful sessions via `mcp-session-id` header
  - `providers/` — multi-provider AI routing layer:
    - `types.ts` — `GatewayProvider` interface, `ProviderStats`, `StreamResult`
    - `openai.ts` — OpenAI provider (model: `gpt-5.2`, cost: $0.002/$0.008 per 1K tokens)
    - `anthropic.ts` — Anthropic provider (model: `claude-sonnet-4-5`, cost: $0.003/$0.015 per 1K tokens)
    - `gemini.ts` — Gemini provider (model: `gemini-2.5-pro`, cost: $0.00125/$0.01 per 1K tokens)
    - `registry.ts` — `streamWithFallback()` builds provider chain using: (1) `ROUTING_STRATEGY` base order, (2) semantic keyword routing (analytical→openai, creative→anthropic, multimodal→gemini), (3) canary traffic split (`CANARY_PROVIDER` + `CANARY_TRAFFIC_PERCENT`); exposes `getCanaryStats()`
- **Plugin system** in `src/plugins/`:
  - `plugin-interface.ts` — `GatewayPlugin` interface (hooks: `init`, `beforeGenerate`, `afterGenerate`, `onCacheHit`, `onCacheMiss`, `onError`) + `GenerateContext` type
  - `plugin-loader.ts` — `PluginLoader` singleton; respects `GATEWAY_PLUGINS` env var or `config/gateway.yaml` enabled list; runs hooks in registration order; tracks per-plugin call counts
  - `index.ts` — exports `pluginLoader` + `ALL_BUILTIN_PLUGINS` array
  - `builtin/request-logger.ts` — logs generation completion with all metrics
  - `builtin/plan-tier-limiter.ts` — resolves user Stripe tier → sets `ctx.planTier` and `ctx.metadata.tpmMultiplier`
  - `builtin/prompt-enhancer.ts` — appends Express 5 / pino / Zod coding style guide to prompt
  - `builtin/otel-tracer.ts` — OpenTelemetry tracing with OTLP HTTP exporter; span attributes cover provider, model, tokens, cost, TTFT
  - `builtin/rag-injector.ts` — TSVector full-text search over `semantic_cache`; injects up to N gzip-decompressed code examples into prompt
  - `builtin/prompt-template.ts` — `{{variable}}` interpolation + sentence-level compression to configurable token limit
  - `builtin/content-guard.ts` — OpenAI Moderation API pre/post check; `beforeGenerate` returns `false` to block flagged prompts
  - `builtin/transform.ts` — extensible request/response transform registry (`registerRequestTransform`, `registerResponseTransform`)
- **Declarative config**: `config/gateway.yaml` — feature flags for all pipeline stages (guardrails, rag, templates, otel, canary, semanticRouting, transforms); `plugins.enabled` list
- **Routes**: `src/routes/gateway/stats.ts` — `GET /api/gateway/stats` returns aggregate + per-provider stats + `routingStrategy` + `canary` + `plugins` call counts + `pipelineConfig` feature flags
- Provider fallback: provider chain: strategy base order → semantic keyword override → canary coin-flip
- Observability: TTFT (ms), token counts, cost estimate per generation; stored in `generations` table; `semanticRouted` + `canaryHit` flags on SSE done event
- Depends on: `@workspace/db`, `@workspace/api-zod`, `@workspace/integrations-openai-ai-server`, `@workspace/integrations-anthropic-ai`, `@workspace/integrations-gemini-ai`
- Extra deps: `@opentelemetry/api`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `@modelcontextprotocol/sdk`, `js-yaml`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle
- Build bundles all deps including `@google/genai` and `@anthropic-ai/sdk` (only `@google-cloud/*` is externalized, not `@google/*`)

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/ai-studio` (`@workspace/ai-studio`)

React + Vite frontend for the AI Studio. Served at the root path `/`.

- Prompt textarea + Generate button
- Real-time SSE streaming code viewer (consumes `/api/agent/generate`)
- Sidebar with **Layer 8 Gateway Status panel** (cache hit rate, total tokens, estimated cost, TTFT, TPM) and generation history
- History entries show: cost, TTFT, model used, and "Cached" badge for semantic cache hits
- PII warning banner when prompt contained redacted PII
- Saved-file confirmation banner with `.ts.gz` filename
- `hooks/use-generate.ts` — tracks SSE meta: `modelUsed`, `isCached`, `tokenCount`, `costUsd`, `ttftMs`, `piiWarning`

### `lib/integrations-openai-ai-server` (`@workspace/integrations-openai-ai-server`)

Server-side OpenAI SDK wrapper using Replit AI Integrations (no user API key needed).
Requires env vars: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`.

### `lib/integrations-anthropic-ai` (`@workspace/integrations-anthropic-ai`)

Server-side Anthropic SDK wrapper using Replit AI Integrations. Exports `anthropic` client.
Requires env vars: `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`.

### `lib/integrations-gemini-ai` (`@workspace/integrations-gemini-ai`)

Server-side Google GenAI SDK wrapper using Replit AI Integrations. Exports `ai` client.
Requires env vars: `AI_INTEGRATIONS_GEMINI_BASE_URL`, `AI_INTEGRATIONS_GEMINI_API_KEY`.

### `Agent/` (output directory)

Generated TypeScript route handler files are saved here as gzip-compressed `.ts.gz` files.
Format: `<prompt-slug>-<timestamp>.ts.gz`. Use `zcat` or `gunzip` to read them.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
