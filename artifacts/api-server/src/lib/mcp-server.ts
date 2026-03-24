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
