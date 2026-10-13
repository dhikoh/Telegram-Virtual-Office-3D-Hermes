/**
 * Tahap 8 — unit test klien sesi gateway (RealHermesClient).
 *
 * Fetch di-stub global: tidak ada jaringan, tidak ada mock karangan —
 * respon yang diuji sama persis dengan bentuk respon gateway sesungguhnya
 * (SSE bernama `event:` + payload data, daftar /messages, /v1/skills).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealHermesClient } from './real.client.js';

const BASE = 'http://gateway.test:8642';
const client = () => new RealHermesClient(BASE, 'test-key', 5000);

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
      handler(String(input), init)
    )
  );
}

describe('RealHermesClient sessions (Tahap 8)', () => {
  it('createSession extracts the session id from POST /api/sessions', async () => {
    stubFetch((url, init) => {
      expect(url).toBe(`${BASE}/api/sessions`);
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ object: 'hermes.session', session: { id: 'api_123_abc' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    expect(await client().createSession('Felix')).toBe('api_123_abc');
  });

  it('createSession returns null when the gateway refuses (no throw, chat falls back)', async () => {
    stubFetch(() => new Response('not found', { status: 404 }));
    expect(await client().createSession()).toBeNull();
  });

  it('getSessionMessages keeps only user/assistant turns and sorts chronologically', async () => {
    const body = {
      data: [
        { id: 2, role: 'assistant', content: 'jawaban', timestamp: 200, tool_call_id: null, tool_name: null },
        { id: 1, role: 'user', content: 'pertanyaan', timestamp: 100, tool_call_id: null, tool_name: null },
        { id: 3, role: 'assistant', content: '', timestamp: 150, tool_name: 'shell' },
        { id: 4, role: 'tool', content: 'tool output', timestamp: 160, tool_call_id: 'call_1' },
      ],
    };
    stubFetch((url) => {
      expect(url).toContain('/api/sessions/api_123_abc/messages');
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const messages = await client().getSessionMessages('api_123_abc');
    expect(messages.map((m) => m.content)).toEqual(['pertanyaan', 'jawaban']);
  });

  it('sessionChatStream emits deltas from named SSE frames and ignores the rest', async () => {
    const sse = [
      'event: run.started',
      'data: {"session_id":"api_123_abc","seq":1}',
      '',
      'event: message.started',
      'data: {"message":{"id":"msg_1","role":"assistant"},"seq":2}',
      '',
      'event: assistant.delta',
      'data: {"delta":"Halo ","session_id":"api_123_abc","seq":3}',
      '',
      'event: assistant.delta',
      'data: {"delta":"dunia","session_id":"api_123_abc","seq":4}',
      '',
      'event: run.completed',
      'data: {"status":"completed","seq":5}',
      '',
    ].join('\n');

    stubFetch((url, init) => {
      expect(url).toBe(`${BASE}/api/sessions/api_123_abc/chat/stream`);
      expect(init?.method).toBe('POST');
      return new Response(sse, { status: 200 });
    });

    const chunks: string[] = [];
    await client().sessionChatStream('api_123_abc', 'halo', (d) => chunks.push(d));
    expect(chunks.join('')).toBe('Halo dunia');
  });

  it('sessionChatStream surfaces gateway error events instead of truncating silently', async () => {
    const sse = [
      'event: error',
      'data: {"error":{"message":"session exploded","code":"boom"}}',
      '',
    ].join('\n');
    stubFetch(() => new Response(sse, { status: 200 }));

    await expect(client().sessionChatStream('api_1', 'x', () => {})).rejects.toThrow(
      'session exploded'
    );
  });

  it('sessionChatStream rejects non-2xx with the gateway message', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: { message: 'Missing \'message\' field' } }), {
          status: 400,
        })
    );
    await expect(client().sessionChatStream('api_1', 'x', () => {})).rejects.toThrow(
      "Missing 'message' field"
    );
  });
});

describe('RealHermesClient skills (Tahap 8)', () => {
  it('listSkills returns items from the gateway', async () => {
    stubFetch((url) => {
      expect(url).toBe(`${BASE}/v1/skills`);
      return new Response(JSON.stringify({ data: [{ name: 'obsidian', description: 'Notes' }] }), {
        status: 200,
      });
    });
    const skills = await client().listSkills();
    expect(skills).toHaveLength(1);
    expect((skills[0] as { name: string }).name).toBe('obsidian');
  });

  it('listSkills rethrows the gateway error message on 500 (route reports honestly)', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({ error: { message: 'Failed to enumerate skills' } }),
          { status: 500 }
        )
    );
    await expect(client().listSkills()).rejects.toThrow('Failed to enumerate skills');
  });
});
