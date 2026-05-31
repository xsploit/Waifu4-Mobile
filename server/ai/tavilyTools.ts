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

export function createTavilyTools(apiKey?: string) {
  const key = apiKey?.trim();
  if (!key) {
    return undefined;
  }

  return {
    tavily_search: tool({
      description: tavilyToolDescriptions.search,
      inputSchema: tavilySearchInputSchema,
      execute: async (args) => postTavily(key, '/search', toTavilySearchRequest(args)),
    }),
    tavily_extract: tool({
      description: tavilyToolDescriptions.extract,
      inputSchema: tavilyExtractInputSchema,
      execute: async (args) => {
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
    }),
    tavily_crawl: tool({
      description: tavilyToolDescriptions.crawl,
      inputSchema: tavilyCrawlInputSchema,
      execute: async (args) => postTavily(key, '/crawl', toTavilyCrawlRequest(args)),
    }),
  };
}
