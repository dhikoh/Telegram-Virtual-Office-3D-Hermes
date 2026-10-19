/**
 * Fase 2b — jalur chat lewat Runs API (`POST /v1/runs` + `GET .../events`).
 *
 * Kebenaran yang dijaga:
 *  - `run_id` dikabarkan ke pemanggil SEBELUM peristiwa mengalir, supaya rute
 *    bisa menyerahkannya ke klien untuk sambung-ulang.
 *  - Identitas agen dikirim sebagai `instructions` (bukan system message) —
 *    di gateway, `instructions` DITAMBAHKAN ke system efektif
 *    (chat_completion_helpers.py:2180), jadi SOUL.md tidak tertimpa.
 *  - Delta diteruskan apa adanya; `run.completed` memanggil `onDone`.
 *  - `run.failed` menolak dengan pesan gateway, bukan menutup senyap.
 *  - Kegagalan `POST /v1/runs` sendiri tetap menolak (jalur lama tidak
 *    dipakai diam-diam — tidak ada fallback otomatis di sini).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealHermesClient } from './real.client.js';

const BASE = 'http://gateway.test:8642';
const client = () => new RealHermesClient(BASE, 'test-key', 5000);

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
      handler(String(input), init)
    )
  );
}

function sse(lines: string[]): Response {
  return new Response(lines.join('\n'), { status: 200 });
}

describe('Fase 2b — chat lewat Runs API', () => {
  it('membuka run lalu menyiarkan run_id sebelum delta mengalir', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    stub((url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
      if (url.endsWith('/v1/runs')) {
        return new Response(JSON.stringify({ run_id: 'run_abc', status: 'queued' }), {
          status: 202,
        });
      }
      return sse([
        'event: message.delta',
        'data: {"event":"message.delta","run_id":"run_abc","delta":"Halo","seq":1}',
        '',
        'event: run.completed',
        'data: {"event":"run.completed","run_id":"run_abc","completed":true,"seq":2}',
        '',
      ]);
    });

    const order: string[] = [];
    const deltas: string[] = [];
    let done = false;

    await client().runChatStream(
      { input: 'siapa kamu?', sessionId: 'sess_1', instructions: 'Kamu adalah Bagas.' },
      {
        onRunId: (id) => order.push(`run:${id}`),
        onDelta: (d) => {
          order.push('delta');
          deltas.push(d);
        },
        onDone: () => {
          done = true;
          order.push('done');
        },
      }
    );

    expect(order[0]).toBe('run:run_abc');
    expect(order).toContain('delta');
    expect(order[order.length - 1]).toBe('done');
    expect(deltas.join('')).toBe('Halo');
    expect(done).toBe(true);

    // Identitas ikut sebagai instructions, sesi ikut sebagai session_id.
    const start = calls.find((c) => c.url.endsWith('/v1/runs'));
    expect(start?.body.instructions).toBe('Kamu adalah Bagas.');
    expect(start?.body.session_id).toBe('sess_1');
    expect(start?.body.input).toBe('siapa kamu?');
    // Peristiwa dibaca dari /v1/runs/{id}/events — bukan stream sesi.
    expect(calls.some((c) => c.url.endsWith('/v1/runs/run_abc/events'))).toBe(true);
  });

  it('run.failed menolak dengan pesan gateway, bukan menutup senyap', async () => {
    stub((url) => {
      if (url.endsWith('/v1/runs')) {
        return new Response(JSON.stringify({ run_id: 'run_bad', status: 'queued' }), {
          status: 202,
        });
      }
      return sse([
        'event: message.delta',
        'data: {"event":"message.delta","delta":"sebagian","seq":1}',
        '',
        'event: run.failed',
        'data: {"event":"run.failed","error":"provider meledak","seq":2}',
        '',
      ]);
    });

    const err = await client()
      .runChatStream(
        { input: 'x' },
        { onDelta: () => {}, onDone: () => {}, onError: () => {} }
      )
      .catch((e: Error) => e);

    expect(String(err)).toContain('provider meledak');
  });

  it('tanpa run_id yang bisa dibuka, langsung menolak', async () => {
    stub(() => new Response('gateway sibuk', { status: 503 }));

    await expect(
      client().runChatStream({ input: 'x' }, { onDelta: () => {}, onDone: () => {} })
    ).rejects.toThrow(/503/);
  });

  it('stream peristiwa yang ditutup tanpa terminal TIDAK dianggap sukses', async () => {
    stub((url) => {
      if (url.endsWith('/v1/runs')) {
        return new Response(JSON.stringify({ run_id: 'run_eof', status: 'queued' }), {
          status: 202,
        });
      }
      return sse(['event: message.delta', 'data: {"event":"message.delta","delta":"setengah","seq":1}', '']);
    });

    await expect(
      client().runChatStream(
        { input: 'x' },
        { onDelta: () => {}, onDone: () => {} }
      )
    ).rejects.toThrow();
  });
});
