import { z } from 'zod';

export const tavilyToolDescriptions = {
  search:
    'Search the web for factual or recent information. Use this first to discover relevant pages and links.',
  extract:
    'Extract cleaned page content from specific URLs. Use after tavily_search when you need deeper details from selected links.',
  crawl: 'Crawl a site from a starting URL and return discovered page content. Use this for broader multi-page collection.',
} as const;

export const tavilySearchInputSchema = z.object({
  query: z.string().min(1).describe('Search query to run.'),
  search_depth: z
    .enum(['basic', 'advanced'])
    .default('advanced')
    .describe('Search depth; advanced is slower but broader.'),
  max_results: z.number().int().min(1).max(10).default(5).describe('Number of results to return (1-10).'),
});

export const tavilyExtractInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20).describe('One or more URLs to extract.'),
  extract_depth: z
    .enum(['basic', 'advanced'])
    .default('basic')
    .describe('Extraction depth; advanced may return richer content.'),
  max_results: z.number().int().min(1).max(10).default(5).describe('Maximum extracted items to return in tool output.'),
});

export const tavilyCrawlInputSchema = z.object({
  url: z.string().url().describe('Starting URL to crawl.'),
  extract_depth: z.enum(['basic', 'advanced']).default('basic').describe('Content depth for crawled pages.'),
  max_results: z.number().int().min(1).max(30).default(10).describe('Maximum crawled items to return in tool output.'),
});

export type TavilySearchInput = z.infer<typeof tavilySearchInputSchema>;
export type TavilyExtractInput = z.infer<typeof tavilyExtractInputSchema>;
export type TavilyCrawlInput = z.infer<typeof tavilyCrawlInputSchema>;

export function toTavilySearchRequest({ query, search_depth, max_results }: TavilySearchInput) {
  return {
    query,
    max_results: max_results ?? 5,
    search_depth: search_depth ?? 'advanced',
    include_answer: true,
    include_images: false,
    include_raw_content: false,
  };
}

export function toTavilyExtractRequest({ urls, extract_depth }: TavilyExtractInput) {
  return {
    urls,
    extract_depth: extract_depth ?? 'basic',
    include_images: false,
  };
}

export function toTavilyCrawlRequest({ url, extract_depth, max_results }: TavilyCrawlInput) {
  return {
    url,
    max_results: max_results ?? 10,
    crawl_depth: extract_depth ?? 'basic',
    include_images: false,
  };
}

