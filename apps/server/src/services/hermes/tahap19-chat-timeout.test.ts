/**
 * Tahap 19 — pengunci untuk dua perbaikan klien gateway:
 *
 *  1. Stream chat yang berakhir TANPA satu huruf pun diperlakukan sebagai
 *     GALAT, bukan "sukses" hampa. Itulah yang membuat bubble chat kosong
 *     tanpa keterangan sama sekali.
 *  2. Dua batas waktu terpisah: `HERMES_CHAT_TTFB_MS` (huruf/peristiwa
 *     pertama) dan `HERMES_CHAT_TIMEOUT_MS` (total satu giliran), berdiri
 *     sendiri dari `HERMES_TIMEOUT_MS` yang hanya untuk panggilan pendek.
 *
 * Peringatan yang memakan satu putaran penuh: `AbortSignal` membatalkan
 * `fetch()`, TETAPI TIDAK membatalkan `reader.read()` yang sedang menunggu.
 * Dibuktikan terpisah (scratch/abort-read-probe.mjs): pembacaan yang menunggu
 * pada saluran yang tidak pernah menutup bertahan selamanya, walau sinyalnya
 * sudah `aborted`. Jadi test timeout tidak boleh memakai saluran yang
 * menggantung selamanya — salurannya harus menutup sendiri lewat `setTimeout`
 * yang sama dengan jendela yang sedang diuji. Tanpa itu, test gagal sebagai
 * "timeout", bukan sebagai salah.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealHermesClient } from './real.client.js';

const BASE = 'http://gateway.test:8642';

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

/**
 * Respon stream yang menggantung lalu menutup dirinya sendiri setelah `ms`
 * — seperti provider yang membisu lalu menutup koneksi, tetapi tidak pernah
 * membuat test menggantung karena pembacaannya selalu berakhir.
 */
function hangingThenClosingResponse(ms: number) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Tidak ada data sama sekali: tidak ada peristiwa, tidak ada delta.
      setTimeout(() => controller.close(), ms);
    },
  });
  return new Response(stream, { status: 200 });
}

function chatClient(ttfbMs: number, totalMs: number, timeoutMs = 5000) {
  return new RealHermesClient(BASE, 'test-key', timeoutMs, ttfbMs, totalMs);
}

function sse(parts: string[]) {
  return new Response(parts.join('\n'), { status: 200 });
}

describe('RealHermesClient chat stream kosong (Tahap 19)', () => {
  it('stream yang berakhir tanpa satu huruf pun → galat, bukan sukses hampa', async () => {
    stubFetch(() => sse(['event: run.completed', 'data: {"status":"completed"}', '']));

    const chunks: string[] = [];
    await expect(chatClient(5000, 5000).sessionChatStream('s1', 'halo', (d) => chunks.push(d)))
      .rejects.toThrow(/0 byte dari provider/);
    expect(chunks).toEqual([]);
  });

  it('chatStream (jalur tanpa sesi) juga menolak stream 0 byte', async () => {
    stubFetch(() => new Response('', { status: 200 }));

    const chunks: string[] = [];
    await expect(
      chatClient(5000, 5000).chatStream([{ role: 'user', content: 'halo' }], (c) => chunks.push(c))
    ).rejects.toThrow(/0 byte dari provider/);
    expect(chunks).toEqual([]);
  });

  it('jawaban yang hilang di delta dipulihkan dari assistant.completed', async () => {
    stubFetch(() =>
      sse([
        'event: assistant.completed',
        'data: {"content":"jawaban utuh dari salinan"}',
        '',
        'event: run.completed',
        'data: {"status":"completed"}',
        '',
      ])
    );

    const chunks: string[] = [];
    await chatClient(5000, 5000).sessionChatStream('s1', 'halo', (d) => chunks.push(d));
    expect(chunks.join('')).toBe('jawaban utuh dari salinan');
  });

  it('assistant.completed TIDAK menggandakan delta yang sudah terkirim', async () => {
    stubFetch(() =>
      sse([
        'event: assistant.delta',
        'data: {"delta":"Halo dunia"}',
        '',
        'event: assistant.completed',
        'data: {"content":"Halo dunia"}',
        '',
      ])
    );

    const chunks: string[] = [];
    await chatClient(5000, 5000).sessionChatStream('s1', 'x', (d) => chunks.push(d));
    expect(chunks).toEqual(['Halo dunia']);
  });

  it('tanpa assistant.completed dan tanpa delta → tetap galat (jangan karang teks)', async () => {
    stubFetch(() => sse(['event: message.completed', 'data: {"role":"assistant"}', '']));

    await expect(chatClient(5000, 5000).sessionChatStream('s1', 'x', () => {})).rejects.toThrow(
      /0 byte dari provider/
    );
  });
});

describe('RealHermesClient dua batas waktu chat (Tahap 19)', () => {
  it('TTFB: gateway diam tanpa peristiwa → galat TTFB, bukan timeout total', async () => {
    stubFetch(() => hangingThenClosingResponse(400));

    const started = Date.now();
    const err = await chatClient(120, 60000).sessionChatStream('s1', 'x', () => {}).catch((e) => e);
    const elapsed = Date.now() - started;

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/no gateway event for 120ms/);
    // Terpotong di jendela TTFB (120 ms), jauh sebelum saluran menutup sendiri
    // di 400 ms. Tanpa balapan pembatalan, `read()` menggantung dan waktunya
    // mendekati 400 ms dengan pesan "0 byte" — dua-duanya terbaca di sini.
    expect(elapsed).toBeLessThan(380);
  });

  it('total: giliran yang jalan lebih lama dari batas total → galat total', async () => {
    stubFetch(() => hangingThenClosingResponse(400));

    const started = Date.now();
    const err = await chatClient(60000, 150).sessionChatStream('s1', 'x', () => {}).catch((e) => e);
    const elapsed = Date.now() - started;

    // TTFB 60 dtk tidak pernah menyala; yang menyala batas total 150 ms.
    expect(err.message).toMatch(/timed out after 150ms/);
    expect(elapsed).toBeLessThan(380);
  });

  it('angka batas memengaruhi perilaku (bukan angka mati di dalam kode)', async () => {
    stubFetch(() => hangingThenClosingResponse(400));

    const fast = await chatClient(40, 60000).sessionChatStream('s1', 'x', () => {}).catch((e) => e);
    expect(fast.message).toMatch(/no gateway event for 40ms/);
  });

  it('chatStream (tanpa sesi) ikut memakai kedua batas, bukan HERMES_TIMEOUT_MS', async () => {
    stubFetch(() => hangingThenClosingResponse(400));

    const err = await chatClient(120, 60000)
      .chatStream([{ role: 'user', content: 'x' }], () => {})
      .catch((e) => e);

    // timeoutMs diuji terpisah sebagai 5000 ms; bila jalur ini memakainya,
    // pesan galatnya akan "after 5000ms" dan peristiwa ini gagal.
    expect(err.message).toMatch(/no reply for 120ms/);
  });

  it('panggilan pendek tetap memakai timeoutMs sendiri, bukan batas chat', async () => {
    stubFetch(() => hangingThenClosingResponse(400));

    // timeoutMs 1 ms + batas chat raksasa: membuktikan createSession tidak
    // ikut terkena angka chat.
    await expect(chatClient(60000, 600000, 1).createSession('x')).resolves.toBeNull();
  });

  it('runWithTimeout: handler yang tidak pernah resolve → timeout throw setelah 900 detik (C5)', async () => {
    vi.useFakeTimers();
    try {
      const client = new RealHermesClient(BASE, 'test-key');
      const neverResolvingTask = (_signal: AbortSignal) => new Promise(() => {});

      const runPromise = client.runWithTimeout(neverResolvingTask, 900000);
      const expectation = expect(runPromise).rejects.toThrow(/timed out after 900000ms/);

      await vi.advanceTimersByTimeAsync(900000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
