import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTavilyTools } from './tavilyTools';

describe('Tavily tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is disabled when no request-scoped or env key is available', () => {
    expect(createTavilyTools()).toBeUndefined();
    expect(createTavilyTools('   ')).toBeUndefined();
  });

  it('posts search requests with Tavily bearer auth and copied defaults', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ answer: 'ok', results: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tools = createTavilyTools('tvly-test-key');
    const result = await tools?.tavily_search.execute?.(
      {
        query: 'latest WebGPU news',
        search_depth: 'advanced',
        max_results: 5,
      },
      { toolCallId: 'call-1', messages: [], abortSignal: undefined } as never,
    );

    expect(result).toEqual({ answer: 'ok', results: [] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer tvly-test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      query: 'latest WebGPU news',
      max_results: 5,
      search_depth: 'advanced',
      include_answer: true,
      include_images: false,
      include_raw_content: false,
    });
  });
});
