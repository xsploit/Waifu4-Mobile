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

export const TAVILY_TOOL_NAMES = [
  'tavily_search',
  'tavily_extract',
  'tavily_crawl',
] as const;

export type ToolProgressPhase = 'started' | 'completed' | 'failed';

export type ToolProgressEvent = {
  detail?: string;
  label: string;
  phase: ToolProgressPhase;
  toolName: 'tavily_search' | 'tavily_extract' | 'tavily_crawl';
};

export type ToolProgressHandler = (event: ToolProgressEvent) => void;

function compactText(value: unknown, maxLength = 140) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function sourceHosts(urls: unknown[], maxHosts = 4) {
  const hosts: string[] = [];
  for (const value of urls) {
    const url = typeof value === 'string'
      ? value
      : value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
        ? (value as { url: string }).url
        : '';
    if (!url) continue;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (host && !hosts.includes(host)) hosts.push(host);
    } catch {
      // Invalid provider URLs are omitted from user-facing progress.
    }
    if (hosts.length >= maxHosts) break;
  }
  return hosts.join(', ');
}

function summarizeTavilyResult(result: unknown) {
  if (!result || typeof result !== 'object') return undefined;
  const results = Array.isArray((result as { results?: unknown }).results)
    ? (result as { results: unknown[] }).results
    : [];
  const hosts = sourceHosts(results);
  if (results.length === 0) return 'No matching sources returned.';
  return `${results.length} source${results.length === 1 ? '' : 's'}${hosts ? ` · ${hosts}` : ''}`;
}

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
    details?: { started?: string; completed?: (result: T) => string | undefined },
  ) => {
    onProgress?.({ detail: details?.started, label: labels.started, phase: 'started', toolName });
    try {
      const result = await execute();
      onProgress?.({
        detail: details?.completed?.(result),
        label: labels.completed,
        phase: 'completed',
        toolName,
      });
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
        {
          started: `Query: ${compactText(args.query)}`,
          completed: summarizeTavilyResult,
        },
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
        {
          started: `Sources: ${sourceHosts(args.urls) || `${args.urls.length} URL${args.urls.length === 1 ? '' : 's'}`}`,
          completed: summarizeTavilyResult,
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
        {
          started: `Site: ${sourceHosts([args.url]) || compactText(args.url)}`,
          completed: summarizeTavilyResult,
        },
      ),
    }),
  };
}
