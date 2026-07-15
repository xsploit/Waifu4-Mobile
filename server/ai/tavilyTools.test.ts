import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTavilyTools, TAVILY_TOOL_NAMES } from './tavilyTools';

describe('Tavily tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is disabled when no request-scoped or env key is available', () => {
    expect(createTavilyTools()).toBeUndefined();
    expect(createTavilyTools('   ')).toBeUndefined();
  });

  it('reports every registered live-chat tool name', () => {
    expect(Object.keys(createTavilyTools('tvly-test-key') ?? {})).toEqual(TAVILY_TOOL_NAMES);
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

  it('reports tool progress around the real network wait', async () => {
    const progress: Array<{ detail?: string; label: string; phase: string; toolName: string }> = [];
    let releaseFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      releaseFetch = resolve;
    })));

    const tools = createTavilyTools('tvly-test-key', (event) => progress.push(event));
    const pending = tools?.tavily_search.execute?.(
      { query: 'WebWaifu', search_depth: 'basic', max_results: 3 },
      { toolCallId: 'call-2', messages: [], abortSignal: undefined } as never,
    );

    expect(progress).toEqual([{
      label: 'Searching the web...',
      detail: 'Query: WebWaifu',
      phase: 'started',
      toolName: 'tavily_search',
    }]);

    releaseFetch?.(new Response(JSON.stringify({
      results: [{ title: 'WebWaifu', url: 'https://example.com/webwaifu' }],
    }), { status: 200 }));
    await pending;

    expect(progress.at(-1)).toEqual({
      label: 'Reviewing search results...',
      detail: '1 source · example.com',
      phase: 'completed',
      toolName: 'tavily_search',
    });
  });

  it('reports failed tool execution without swallowing the provider error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    const progress: Array<{ detail?: string; label: string; phase: string; toolName: string }> = [];
    const tools = createTavilyTools('tvly-test-key', (event) => progress.push(event));

    await expect(tools?.tavily_search.execute?.(
      { query: 'WebWaifu', search_depth: 'basic', max_results: 3 },
      { toolCallId: 'call-3', messages: [], abortSignal: undefined } as never,
    )).rejects.toThrow('Tavily /search failed (503)');
    expect(progress.at(-1)).toEqual({
      label: 'Web search failed; trying to recover...',
      phase: 'failed',
      toolName: 'tavily_search',
    });
  });
});
