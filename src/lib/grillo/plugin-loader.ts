import { existsSync, readdirSync } from "node:fs";
import { extname, basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { ToolDefinition } from "./chat-tools";
import { withTimeout } from "./chat-tools";

export interface PluginToolSpec {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  timeoutMs?: number;
}

function toPluginSpecs(value: unknown): PluginToolSpec[] {
  if (Array.isArray(value)) return value as PluginToolSpec[];
  return [];
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function loadPluginTools(pluginDir: string): Promise<Record<string, ToolDefinition>> {
  const out: Record<string, ToolDefinition> = {};
  const resolvedDir = resolve(pluginDir);

  if (!pluginDir.trim().length || !existsSync(resolvedDir)) {
    return out;
  }

  const files = readdirSync(resolvedDir).filter((name) => {
    const ext = extname(name).toLowerCase();
    return ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".ts";
  });

  for (const file of files) {
    try {
      const filePath = resolve(resolvedDir, file);
      const mod = await import(pathToFileURL(filePath).href);
      const exported = mod.default ?? mod.tools ?? mod.pluginTools ?? [];
      const specs = toPluginSpecs(exported);
      const pluginName = sanitizeSegment(basename(file, extname(file))) || "plugin";

      for (const spec of specs) {
        if (!spec || typeof spec.name !== "string" || typeof spec.description !== "string" || typeof spec.execute !== "function") {
          continue;
        }
        const toolName = sanitizeSegment(spec.name) || "tool";
        const toolId = `plugin.${pluginName}.${toolName}`;
        const timeoutMs = Number.isFinite(spec.timeoutMs) ? Math.max(1, Number(spec.timeoutMs)) : 10_000;
        const inputSchema = spec.inputSchema ?? z.object({}).passthrough();

        out[toolId] = {
          description: spec.description,
          inputSchema,
          timeoutMs,
          execute: async (args: Record<string, unknown>) =>
            withTimeout(
              async () => Promise.resolve(spec.execute(args)),
              timeoutMs,
              toolId,
            ),
        };
      }
    } catch (error) {
      console.warn("[plugin-loader] failed to load plugin file", file, error);
    }
  }

  return out;
}
