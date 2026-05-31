import type { ToolDefinition } from "./chat-tools";

export type ToolNamespace = "core" | "plugin" | "mcp";

export interface ToolCall {
  tool_id: string;
  args: Record<string, unknown>;
  timeout_ms?: number;
}

export function parseToolNamespace(toolId: string): ToolNamespace | null {
  const parts = String(toolId || "").split(".");
  const head = parts[0];
  if (head === "core" || head === "plugin" || head === "mcp") {
    return head;
  }
  return null;
}

export function isNamespacedToolId(toolId: string): boolean {
  const ns = parseToolNamespace(toolId);
  if (!ns) return false;
  const parts = String(toolId || "").split(".");
  if (ns === "core") return parts.length >= 2;
  if (ns === "plugin") return parts.length >= 3;
  if (ns === "mcp") return parts.length >= 3;
  return false;
}

export interface ToolAllowlistEntry {
  namespace: ToolNamespace;
  pattern: string;
}

interface BuildToolSetSources {
  core?: Record<string, ToolDefinition>;
  plugin?: Record<string, ToolDefinition>;
  mcp?: Record<string, ToolDefinition>;
}

function matchesPattern(value: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim();
  if (!normalizedPattern.length) return false;
  if (normalizedPattern === "*") return true;
  if (normalizedPattern.endsWith("*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return value.startsWith(prefix);
  }
  return value === normalizedPattern;
}

function isAllowed(toolId: string, allowlist?: ToolAllowlistEntry[]): boolean {
  if (!allowlist || !allowlist.length) return true;
  const ns = parseToolNamespace(toolId);
  if (!ns) return false;
  return allowlist.some((entry) => entry.namespace === ns && matchesPattern(toolId, entry.pattern));
}

export function buildToolSet(
  sources: BuildToolSetSources,
  allowlist?: ToolAllowlistEntry[],
): Record<string, ToolDefinition> {
  const out: Record<string, ToolDefinition> = {};
  const orderedSources: Array<Record<string, ToolDefinition> | undefined> = [
    sources.core,
    sources.plugin,
    sources.mcp,
  ];

  for (const source of orderedSources) {
    if (!source) continue;
    for (const [toolId, definition] of Object.entries(source)) {
      if (!isNamespacedToolId(toolId)) {
        console.warn(`[tool-registry] rejecting invalid tool id '${toolId}'`);
        continue;
      }
      if (!isAllowed(toolId, allowlist)) {
        console.warn(`[tool-registry] rejecting tool by allowlist '${toolId}'`);
        continue;
      }
      out[toolId] = definition;
    }
  }

  return out;
}
