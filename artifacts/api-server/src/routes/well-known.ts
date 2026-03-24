/**
 * Agent discoverability endpoints — .well-known manifest and public OpenAPI spec
 */
import { Router, type IRouter } from "express";

const router: IRouter = Router();

function getBaseUrl(req: Parameters<typeof router.get>[1] extends (req: infer R, ...args: unknown[]) => unknown ? R : never): string {
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
  return `${proto}://${host}`;
}

router.get("/.well-known/ai-plugin.json", (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    schema_version: "v1",
    name_for_human: "AI Studio Code Generator",
    name_for_model: "ai_studio",
    description_for_human: "Generate production-ready TypeScript Express API route handlers from plain English prompts.",
    description_for_model:
      "Use this plugin to generate complete, async TypeScript Express 5 route handlers from a natural-language description. The generated code is saved as a .ts.gz file and streamed back as Server-Sent Events. Supports semantic caching, PII redaction, and multi-model fallback.",
    auth: {
      type: "service_http",
      authorization_type: "bearer",
    },
    api: {
      type: "openapi",
      url: `${base}/api/v1/openapi.json`,
    },
    logo_url: `${base}/logo.png`,
    contact_email: "support@example.com",
    legal_info_url: `${base}/legal`,
  });
});

router.get("/.well-known/agent.json", (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    name: "AI Studio",
    version: "1.0.0",
    description: "Generates production-ready TypeScript Express route handlers from plain-English prompts",
    url: base,
    capabilities: [
      {
        name: "generate",
        description: "Generate an async TypeScript Express route handler from a natural-language prompt",
        endpoint: `${base}/api/v1/generate`,
        method: "POST",
        auth: { type: "bearer" },
        input: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Plain-English description of the API to generate" },
          },
          required: ["prompt"],
        },
      },
    ],
    authentication: {
      type: "apiKey",
      in: "header",
      name: "Authorization",
      scheme: "Bearer",
      description: "Obtain an API key from the AI Studio dashboard. Pass it as: Authorization: Bearer <key>",
    },
    openapi: `${base}/api/v1/openapi.json`,
    contact: {
      email: "support@example.com",
    },
  });
});

router.get("/api/v1/openapi.json", (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    openapi: "3.1.0",
    info: {
      title: "AI Studio Public API",
      version: "1.0.0",
      description:
        "Public API for AI Studio — generate production-ready TypeScript Express route handlers from plain-English prompts. Authenticate with a Bearer API key obtained from the AI Studio dashboard.",
    },
    servers: [{ url: `${base}/api/v1`, description: "Public API" }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/generate": {
        post: {
          operationId: "generate",
          summary: "Generate a TypeScript Express route handler",
          description:
            "Accepts a plain-English prompt and streams the AI-generated TypeScript code as Server-Sent Events. The generated file is saved as a gzip-compressed .ts.gz file.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    prompt: {
                      type: "string",
                      description: "Plain-English description of the API to generate",
                      example: "Create a REST endpoint to register a new user with email and password",
                    },
                  },
                  required: ["prompt"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "SSE stream of generated TypeScript code",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            "400": { description: "Bad request" },
            "401": { description: "Invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/me": {
        get: {
          operationId: "getMe",
          summary: "Get API key info and usage",
          responses: {
            "200": {
              description: "API key metadata",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      keyId: { type: "integer" },
                      keyPrefix: { type: "string" },
                      name: { type: "string" },
                      monthlyLimit: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API key obtained from the AI Studio dashboard",
        },
      },
    },
  });
});

export default router;
