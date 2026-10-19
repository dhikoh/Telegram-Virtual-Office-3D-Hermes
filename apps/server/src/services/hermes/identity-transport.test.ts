/**
 * Fase 1 — identitas agen ikut terkirim pada KEDUA jalur chat.
 *
 * Tanpa ini gateway tidak pernah tahu siapa yang sedang menjawab, dan balasan
 * menjadi "saya asisten" bahkan untuk agen yang jelas punya nama.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealHermesClient } from './real.client.js';

const BASE = 'http://gateway.test:8642';
const client = () => new RealHermesClient(BASE, 'test-key', 5000);

afterEach(() => {
  vi.unstubAllGlobals();
});

function capture(handler: () => Response) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
      return handler();
    })
  );
  return calls;
}

const IDENTITY = 'Kamu adalah Bagas.\nPeran: Distributor.';

describe('Fase 1 — identitas dikirim ke gateway', () => {
  it('jalur stateless: system prompt menjadi message role system pertama', async () => {
    const calls = capture(() => new Response('jawaban', { status: 200 }));
    await client().chatStream(
      [{ role: 'user', content: 'siapa kamu?' }],
      () => {},
      'hermes-agent',
      IDENTITY
    );
    const sent = calls[0].body as { messages: { role: string; content: string }[] };
    expect(sent.messages[0].role).toBe('system');
    expect(sent.messages[0].content).toBe(IDENTITY);
    expect(sent.messages[1]).toEqual({ role: 'user', content: 'siapa kamu?' });
  });

  it('jalur tanpa identitas: tidak ada system message yang disuntikkan', async () => {
    const calls = capture(() => new Response('jawaban', { status: 200 }));
    await client().chatStream([{ role: 'user', content: 'halo' }], () => {});
    const sent = calls[0].body as { messages: { role: string }[] };
    expect(sent.messages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('jalur sesi: identitas dikirim sebagai system_message', async () => {
    const sse = ['event: assistant.delta', 'data: {"delta":"Halo","seq":1}', '', ''].join('\n');
    const calls = capture(() => new Response(sse, { status: 200 }));
    await client().sessionChatStream(
      'api_1_abc',
      'siapa kamu?',
      () => {},
      undefined,
      IDENTITY
    );
    const sent = calls[0].body as { message: string; system_message?: string };
    expect(sent.system_message).toBe(IDENTITY);
    expect(sent.message).toBe('siapa kamu?');
  });

  it('jalur sesi tanpa identitas: system_message tidak ikut dikirim', async () => {
    const sse = ['event: assistant.delta', 'data: {"delta":"Halo","seq":1}', '', ''].join('\n');
    const calls = capture(() => new Response(sse, { status: 200 }));
    await client().sessionChatStream('api_1_abc', 'halo', () => {});
    expect('system_message' in (calls[0].body as object)).toBe(false);
  });
});
