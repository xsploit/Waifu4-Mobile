import { z } from "zod";
import type { ToolDefinition } from "./chat-tools";
import { withTimeout } from "./chat-tools";

export interface McpToolSpec {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpBridge {
  listTools(): Promise<McpToolSpec[]>;
  executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  toToolDefinitions(): Promise<Record<string, ToolDefinition>>;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function tryJsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`MCP request failed ${response.status} ${url}`);
  }
  return response.json();
}

function parseToolList(payload: unknown): McpToolSpec[] {
  if (Array.isArray(payload)) {
    return payload.filter((x) => x && typeof x === "object") as McpToolSpec[];
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj["tools"])) {
      return obj["tools"].filter((x) => x && typeof x === "object") as McpToolSpec[];
    }
  }
  return [];
}

function normalizeInputSchema(raw: unknown): z.ZodType {
  if (raw && typeof raw === "object" && "_zod" in (raw as object)) {
    return raw as z.ZodType;
  }
  return z.object({}).passthrough();
}

export function createMcpBridge(serverUrl: string): McpBridge {
  const base = trimTrailingSlash(serverUrl);

  return {
    async listTools(): Promise<McpToolSpec[]> {
      try {
        const payload = await tryJsonFetch(`${base}/tools`);
        return parseToolList(payload);
      } catch {
        const payload = await tryJsonFetch(`${base}/tools/list`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        return parseToolList(payload);
      }
    },

    async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      try {
        return await tryJsonFetch(`${base}/tools/${encodeURIComponent(name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arguments: args }),
        });
      } catch {
        return tryJsonFetch(`${base}/tools/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, args }),
        });
      }
    },

    async toToolDefinitions(): Promise<Record<string, ToolDefinition>> {
      const out: Record<string, ToolDefinition> = {};
      const tools = await this.listTools();
      const serverName = sanitizeSegment(base.split("/").pop() || "server") || "server";

      for (const tool of tools) {
        if (!tool || typeof tool.name !== "string" || !tool.name.trim().length) continue;
        const toolName = sanitizeSegment(tool.name) || "tool";
        const toolId = `mcp.${serverName}.${toolName}`;
        const timeoutMs = 10_000;
        out[toolId] = {
          description: tool.description || `MCP tool ${tool.name}`,
          inputSchema: normalizeInputSchema(tool.inputSchema),
          timeoutMs,
          execute: async (args: Record<string, unknown>) =>
            withTimeout(
              () => this.executeTool(tool.name, args),
              timeoutMs,
              toolId,
            ),
        };
      }

      return out;
    },
  };
}
