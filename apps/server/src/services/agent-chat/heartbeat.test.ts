/**
 * Fase 2a — detak (heartbeat) untuk stream chat.
 *
 * Kebenaran yang dijaga:
 *  - Interval memancarkan frame komentar `: hb` — bentuk komentar SSE, klien
 *    mengabaikannya, proxy tetap menganggap koneksi aktif.
 *  - `stop()` melepaskan timer: tanpa ini interval hidup setelah stream
 *    selesai dan menulis ke socket yang sudah ditutup.
 *  - Interval diambil dari `CHAT_HEARTBEAT_MS` (bukan angka mati di route).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startHeartbeat, HEARTBEAT_FRAME } from './heartbeat.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('Fase 2a — heartbeat SSE', () => {
  it('memancarkan frame komentar tiap interval', () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const stop = startHeartbeat(1000, (frame) => writes.push(frame));

    vi.advanceTimersByTime(3000);
    stop();

    expect(writes).toHaveLength(3);
    expect(writes.every((w) => w === HEARTBEAT_FRAME)).toBe(true);
    expect(HEARTBEAT_FRAME).toBe(': hb\n\n');
  });

  it('stop() menghentikan detak — tidak ada tulisan setelah stream ditutup', () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const stop = startHeartbeat(1000, (frame) => writes.push(frame));

    stop();
    vi.advanceTimersByTime(5000);

    expect(writes).toHaveLength(0);
  });

  it('stop() boleh dipanggil dua kali tanpa meledak', () => {
    vi.useFakeTimers();
    const stop = startHeartbeat(1000, () => {});
    stop();
    expect(() => stop()).not.toThrow();
  });

  it('interval nol atau negatif tidak memasang timer sama sekali', () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const stop = startHeartbeat(0, (frame) => writes.push(frame));
    vi.advanceTimersByTime(60000);
    stop();
    expect(writes).toHaveLength(0);
  });
});
