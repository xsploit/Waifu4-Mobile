import { tool } from 'ai';
import {
  tavilyCrawlInputSchema,
  tavilyExtractInputSchema,
  tavilySearchInputSchema,
  tavilyToolDescriptions,
  toTavilyCrawlRequest,
  toTavilyExtractRequest,
  toTavilySearchRequest,
} from '../../src/lib/grillo/tavily-tool-definitions';

const TAVILY_BASE_URL = 'https://api.tavily.com';

export type ToolProgressPhase = 'started' | 'completed' | 'failed';

export type ToolProgressEvent = {
  label: string;
  phase: ToolProgressPhase;
  toolName: 'tavily_search' | 'tavily_extract' | 'tavily_crawl';
};

export type ToolProgressHandler = (event: ToolProgressEvent) => void;

async function postTavily(apiKey: string, path: '/search' | '/extract' | '/crawl', body: Record<string, unknown>) {
  const response = await fetch(`${TAVILY_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = text;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
  }

  if (!response.ok) {
    throw new Error(`Tavily ${path} failed (${response.status})`);
  }

  return data;
}

export function createTavilyTools(apiKey?: string, onProgress?: ToolProgressHandler) {
  const key = apiKey?.trim();
  if (!key) {
    return undefined;
  }

  const run = async <T>(
    toolName: ToolProgressEvent['toolName'],
    labels: { started: string; completed: string; failed: string },
    execute: () => Promise<T>,
  ) => {
    onProgress?.({ label: labels.started, phase: 'started', toolName });
    try {
      const result = await execute();
      onProgress?.({ label: labels.completed, phase: 'completed', toolName });
      return result;
    } catch (error) {
      onProgress?.({ label: labels.failed, phase: 'failed', toolName });
      throw error;
    }
  };

  return {
    tavily_search: tool({
      description: tavilyToolDescriptions.search,
      inputSchema: tavilySearchInputSchema,
      execute: async (args) => run(
        'tavily_search',
        {
          started: 'Searching the web...',
          completed: 'Reviewing search results...',
          failed: 'Web search failed; trying to recover...',
        },
        () => postTavily(key, '/search', toTavilySearchRequest(args)),
      ),
    }),
    tavily_extract: tool({
      description: tavilyToolDescriptions.extract,
      inputSchema: tavilyExtractInputSchema,
      execute: async (args) => run(
        'tavily_extract',
        {
          started: 'Reading the source...',
          completed: 'Reviewing the source...',
          failed: 'Source reading failed; trying to recover...',
        },
        async () => {
        const result = await postTavily(key, '/extract', toTavilyExtractRequest(args));

        if (
          result &&
          typeof result === 'object' &&
          Array.isArray((result as { results?: unknown }).results)
        ) {
          return {
            ...result,
            results: (result as { results: unknown[] }).results.slice(0, args.max_results),
          };
        }

        return result;
        },
      ),
    }),
    tavily_crawl: tool({
      description: tavilyToolDescriptions.crawl,
      inputSchema: tavilyCrawlInputSchema,
      execute: async (args) => run(
        'tavily_crawl',
        {
          started: 'Exploring the site...',
          completed: 'Reviewing the site...',
          failed: 'Site exploration failed; trying to recover...',
        },
        () => postTavily(key, '/crawl', toTavilyCrawlRequest(args)),
      ),
    }),
  };
}
