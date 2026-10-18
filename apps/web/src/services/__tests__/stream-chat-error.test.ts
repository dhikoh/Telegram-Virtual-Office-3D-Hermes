/**
 * Tahap 19 — uji sisi klien `streamChat`: pesan gagal dari server harus
 * sampai ke pengguna lewat `onError`, bukan diam-diam menjadi bubble kosong.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '../api.js';

type ReaderCall = { done: boolean; value?: Uint8Array };

function stubSseReader(chunks: ReaderCall[]) {
  let i = 0;
  const reader = {
    read: async () => chunks[i++] ?? { done: true },
    releaseLock: () => {},
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: { getReader: () => reader },
    }))
  );
}

const encode = (s: string) => new TextEncoder().encode(s);

describe('streamChat — frame error server (Tahap 19)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('frame {"error":...} → onError, bukan chunk kosong', async () => {
    stubSseReader([
      { done: false, value: encode('data: {"error":"gateway_error","message":"Hermes chat timed out: no gateway event for 60000ms"}\n\n') },
      { done: true },
    ]);
    const chunks: string[] = [];
    const errors: Error[] = [];
    await api
      .streamChat('agent1', [{ role: 'user', content: 'halo' }], (d) => chunks.push(d), () => {}, (e) => errors.push(e))
      .catch(() => {});
    expect(chunks).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('timed out');
  });

  it('delta biasa tetap dipanggil, tanpa error', async () => {
    stubSseReader([
      { done: false, value: encode('data: {"choices":[{"delta":{"content":"Halo"}}]}\n\n') },
      { done: false, value: encode('data: [DONE]\n\n') },
      { done: true },
    ]);
    const chunks: string[] = [];
    const errors: Error[] = [];
    let done = false;
    await api.streamChat('agent1', [{ role: 'user', content: 'halo' }], (d) => chunks.push(d), () => { done = true; }, (e) => errors.push(e));
    expect(chunks.join('')).toBe('Halo');
    expect(errors).toEqual([]);
    expect(done).toBe(true);
  });

  it('data mentah non-JSON tetap dipanggil sebagai chunk', async () => {
    stubSseReader([
      { done: false, value: encode('data: teks mentah\n\n') },
      { done: true },
    ]);
    const chunks: string[] = [];
    const errors: Error[] = [];
    await api.streamChat('agent1', [{ role: 'user', content: 'halo' }], (d) => chunks.push(d), () => {}, (e) => errors.push(e)).catch(() => {});
    expect(chunks).toEqual(['teks mentah']);
    expect(errors).toEqual([]);
  });
});
