import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { logger } from "./logger";
import { getProviderStats, getRoutingStrategy, getCanaryStats } from "./providers/registry";
import {
	createAgentTask,
	createLeadBundle,
	createMessageDraft,
	getWorkspaceContext,
	saveMemory,
	surrealConfigured,
} from "./fullstack/surreal";

function buildMcpServer(): Server {
  const server = new Server(
    { name: "ai-studio-gateway", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "generate",
        description:
          "Generate a production-ready async TypeScript Express route handler from a plain-English prompt",
        inputSchema: {
          type: "object" as const,
          properties: {
            prompt: {
              type: "string",
              description: "Plain-English description of the API route to generate",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "gateway-stats",
        description:
          "Get current gateway statistics including provider usage, routing strategy, and canary info",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "list-providers",
        description: "List all configured AI providers with their models and cost information",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "fullstack-create-lead",
        description: "Create a FULL STACK lead bundle in SurrealDB, optionally including company and contact records",
        inputSchema: {
          type: "object" as const,
          properties: {
            workspace: {
              type: "object" as const,
              properties: {
                slug: { type: "string" },
                name: { type: "string" },
              },
              required: ["slug"],
            },
            company: { type: "object" as const },
            contact: { type: "object" as const },
            lead: { type: "object" as const },
          },
          required: ["workspace"],
        },
      },
      {
        name: "fullstack-create-task",
        description: "Create a FULL STACK agent task in SurrealDB for cross-model workflow coordination",
        inputSchema: {
          type: "object" as const,
          properties: {
            workspace: {
              type: "object" as const,
              properties: {
                slug: { type: "string" },
                name: { type: "string" },
              },
              required: ["slug"],
            },
            type: { type: "string" },
            subject: { type: "string" },
            leadId: { type: "string" },
            campaignId: { type: "string" },
            assignedTo: { type: "string" },
            input: { type: "object" as const },
            priority: { type: "number" },
          },
          required: ["workspace", "type"],
        },
      },
      {
        name: "fullstack-save-memory",
        description: "Save reusable CRM or outreach memory for FULL STACK in SurrealDB",
        inputSchema: {
          type: "object" as const,
          properties: {
            workspace: {
              type: "object" as const,
              properties: {
                slug: { type: "string" },
                name: { type: "string" },
              },
              required: ["slug"],
            },
            category: { type: "string" },
            content: { type: "string" },
            leadId: { type: "string" },
            contactId: { type: "string" },
            companyId: { type: "string" },
            sourceTaskId: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["workspace", "category", "content"],
        },
      },
      {
        name: "fullstack-create-draft",
        description: "Create an outreach draft for FULL STACK in SurrealDB",
        inputSchema: {
          type: "object" as const,
          properties: {
            workspace: {
              type: "object" as const,
              properties: {
                slug: { type: "string" },
                name: { type: "string" },
              },
              required: ["slug"],
            },
            channel: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
            leadId: { type: "string" },
            contactId: { type: "string" },
            campaignId: { type: "string" },
            generatedByAgentId: { type: "string" },
          },
          required: ["workspace", "channel", "body"],
        },
      },
      {
        name: "fullstack-workspace-context",
        description: "Fetch recent FULL STACK workspace context including leads, tasks, drafts, and memories",
        inputSchema: {
          type: "object" as const,
          properties: {
            workspace: {
              type: "object" as const,
              properties: {
                slug: { type: "string" },
                name: { type: "string" },
              },
              required: ["slug"],
            },
            limit: { type: "number" },
          },
          required: ["workspace"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "generate") {
      const prompt = (args as { prompt?: string }).prompt;
      if (!prompt?.trim()) {
        return {
          content: [{ type: "text" as const, text: "Error: prompt is required" }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `To generate code, POST to /api/agent/generate with:\n{\n  "prompt": "${prompt}"\n}\n\nThe endpoint streams SSE events with the generated TypeScript code.`,
          },
        ],
      };
    }

    if (name === "gateway-stats") {
      const stats = {
        routingStrategy: getRoutingStrategy(),
        providers: getProviderStats(),
        canary: getCanaryStats(),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
      };
    }

    if (name === "list-providers") {
      const providers = getProviderStats();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(providers, null, 2) }],
      };
    }

    if (name.startsWith("fullstack-")) {
      if (!surrealConfigured()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "SurrealDB is not configured. Set SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, and SURREAL_PASS.",
            },
          ],
          isError: true,
        };
      }

      try {
        if (name === "fullstack-create-lead") {
          const result = await createLeadBundle((args ?? {}) as Parameters<typeof createLeadBundle>[0]);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "fullstack-create-task") {
          const result = await createAgentTask((args ?? {}) as Parameters<typeof createAgentTask>[0]);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "fullstack-save-memory") {
          const result = await saveMemory((args ?? {}) as Parameters<typeof saveMemory>[0]);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "fullstack-create-draft") {
          const result = await createMessageDraft((args ?? {}) as Parameters<typeof createMessageDraft>[0]);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "fullstack-workspace-context") {
          const payload = (args ?? {}) as { workspace: Parameters<typeof getWorkspaceContext>[0]; limit?: number };
          const result = await getWorkspaceContext(payload.workspace, payload.limit);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown FULL STACK tool error";
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  return server;
}

const activeTransports = new Map<string, StreamableHTTPServerTransport>();

async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && activeTransports.has(sessionId)) {
    const transport = activeTransports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body as unknown);
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  const server = buildMcpServer();

  transport.onclose = () => {
    if (transport.sessionId) {
      activeTransports.delete(transport.sessionId);
    }
    server.close().catch(() => undefined);
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body as unknown);

  if (transport.sessionId) {
    activeTransports.set(transport.sessionId, transport);
  }
}

async function handleMcpGet(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !activeTransports.has(sessionId)) {
    res.status(400).json({ error: "Missing or invalid MCP session ID" });
    return;
  }
  const transport = activeTransports.get(sessionId)!;
  await transport.handleRequest(req, res);
}

async function handleMcpDelete(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !activeTransports.has(sessionId)) {
    res.status(400).json({ error: "Missing or invalid MCP session ID" });
    return;
  }
  const transport = activeTransports.get(sessionId)!;
  await transport.close();
  activeTransports.delete(sessionId);
  res.status(200).json({ message: "MCP session closed" });
}

export function createMcpRouter(): IRouter {
  const router: IRouter = Router();

  router.post("/mcp", async (req: Request, res: Response) => {
    try {
      await handleMcpRequest(req, res);
    } catch (err) {
      logger.warn({ err }, "MCP POST handler error");
      if (!res.headersSent) res.status(500).json({ error: "MCP error" });
    }
  });

  router.get("/mcp", async (req: Request, res: Response) => {
    try {
      await handleMcpGet(req, res);
    } catch (err) {
      logger.warn({ err }, "MCP GET handler error");
      if (!res.headersSent) res.status(500).json({ error: "MCP error" });
    }
  });

  router.delete("/mcp", async (req: Request, res: Response) => {
    try {
      await handleMcpDelete(req, res);
    } catch (err) {
      logger.warn({ err }, "MCP DELETE handler error");
      if (!res.headersSent) res.status(500).json({ error: "MCP error" });
    }
  });

  return router;
}
