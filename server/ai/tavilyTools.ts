import { tool } from 'ai';
import { z } from 'zod';

const TAVILY_BASE_URL = 'https://api.tavily.com';

const tavilySearchInputSchema = z.object({
  query: z.string().min(1).describe('Search query to run.'),
  search_depth: z
    .enum(['basic', 'advanced', 'fast', 'ultra-fast'])
    .default('advanced')
    .describe('Search depth; advanced is slower but broader.'),
  max_results: z.number().int().min(1).max(10).default(5).describe('Number of results to return.'),
});

const tavilyExtractInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20).describe('URLs to extract.'),
  extract_depth: z
    .enum(['basic', 'advanced'])
    .default('basic')
    .describe('Extraction depth; advanced may return richer content.'),
  max_results: z.number().int().min(1).max(10).default(5).describe('Maximum extracted items to return.'),
});

const tavilyCrawlInputSchema = z.object({
  url: z.string().url().describe('Starting URL to crawl.'),
  extract_depth: z.enum(['basic', 'advanced']).default('basic').describe('Content depth for crawled pages.'),
  max_results: z.number().int().min(1).max(30).default(10).describe('Maximum crawled items to return.'),
});

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
      description:
        'Search the web for factual or recent information. Use this first to discover relevant pages and links.',
      inputSchema: tavilySearchInputSchema,
      execute: async ({ query, search_depth, max_results }) =>
        postTavily(key, '/search', {
          query,
          search_depth,
          max_results,
          include_answer: true,
          include_images: false,
          include_raw_content: false,
        }),
    }),
    tavily_extract: tool({
      description:
        'Extract cleaned page content from specific URLs. Use after tavily_search when deeper details are needed.',
      inputSchema: tavilyExtractInputSchema,
      execute: async ({ urls, extract_depth, max_results }) => {
        const result = await postTavily(key, '/extract', {
          urls,
          extract_depth,
          include_images: false,
        });

        if (
          result &&
          typeof result === 'object' &&
          Array.isArray((result as { results?: unknown }).results)
        ) {
          return {
            ...result,
            results: (result as { results: unknown[] }).results.slice(0, max_results),
          };
        }

        return result;
      },
    }),
    tavily_crawl: tool({
      description: 'Crawl a site from a starting URL and return discovered page content.',
      inputSchema: tavilyCrawlInputSchema,
      execute: async ({ url, extract_depth, max_results }) =>
        postTavily(key, '/crawl', {
          url,
          max_results,
          crawl_depth: extract_depth,
          include_images: false,
        }),
    }),
  };
}

