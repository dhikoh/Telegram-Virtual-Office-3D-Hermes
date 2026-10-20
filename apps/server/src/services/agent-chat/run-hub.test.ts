/**
 * Fase 2b — papan lari hidup.
 *
 * Kebenaran yang dijaga:
 *  - Riwayat ber-`seq` menumpuk dan bisa diputar ulang kapan pun.
 *  - Pelanggan hidup menerima peristiwa sesudah `afterSeq` — celah antara
 *    pemutaran dan langganan ditutup oleh riwayat, jadi tidak ada potongan
 *    yang terlewat maupun terlipat dua kali.
 *  - Pelanggan gagal tidak menjatuhkan pelanggan lain.
 *  - Run selesai tetap bisa diputar ulang sampai TTL habis.
 */
import { describe, it, expect } from 'vitest';
import { ChatRunHub, DEFAULT_RUN_TTL_MS } from './run-hub.js';

describe('Fase 2b — ChatRunHub', () => {
  it('peristiwa diberi seq berurutan dari 1', () => {
    const hub = new ChatRunHub();
    hub.start('r1', 'a1');
    expect(hub.append('r1', 'message.delta', { delta: 'a' })?.seq).toBe(1);
    expect(hub.append('r1', 'message.delta', { delta: 'b' })?.seq).toBe(2);
    expect(hub.append('r1', 'run.completed', {})?.seq).toBe(3);
  });

  it('peristiwa pada run yang tidak dikenal diabaikan, bukan membuat run karangan', () => {
    const hub = new ChatRunHub();
    expect(hub.append('nope', 'message.delta', {})).toBeNull();
    expect(hub.size).toBe(0);
  });

  it('mengulang run_id tidak menghapus riwayat yang sudah ada', () => {
    const hub = new ChatRunHub();
    hub.start('r1', 'a1');
    hub.append('r1', 'message.delta', { delta: 'x' });
    hub.start('r1', 'a1'); // retry / double-start
    expect(hub.history('r1')).toHaveLength(1);
  });

  it('pelanggan menerima peristiwa baru setelah langganan', () => {
    const hub = new ChatRunHub();
    hub.start('r1', 'a1');
    const seen: number[] = [];
    hub.subscribe('r1', 0, (e) => seen.push(e.seq));
    hub.append('r1', 'message.delta', { delta: 'a' });
    hub.append('r1', 'run.completed', {});
    expect(seen).toEqual([1, 2]);
  });

  it('pemutaran riwayat + langganan tidak menggandakan potongan', () => {
    const hub = new ChatRunHub();
    hub.start('r1', 'a1');
    hub.append('r1', 'message.delta', { delta: 'a' });
    hub.append('r1', 'message.delta', { delta: 'b' });

    // Klien kembali: putar riwayat dari awal, lalu langganan dari seq terakhir.
    const replayed = hub.history('r1').map((e) => e.seq);
    const seen: number[] = [];
    hub.subscribe('r1', replayed[replayed.length - 1], (e) => seen.push(e.seq));
    hub.append('r1', 'message.delta', { delta: 'c' });

    expect(replayed).toEqual([1, 2]);
    // Hanya peristiwa BARU — bukan 1 dan 2 lagi.
    expect(seen).toEqual([3]);
  });

  it('celah antara riwayat dan langganan tetap terkirim', () => {
    const hub = new ChatRunHub();
    hub.start('r1', 'a1');
    hub.append('r1', 'message.delta', { delta: 'a' });

    // Pemanggil membaca riwayat (dapat seq 1) lalu menunda sejenak sebelum
    // berlangganan. Peristiwa seq 2 tiba di jeda itu.
    const snapshot = hub.history('r1');
    hub.append('r1', 'message.delta', { delta: 'b' });

    const seen: number[] = [];
    hub.subscribe('r1', snapshot[snapshot.length - 1].seq, (e) => seen.push(e.seq));
    expect(seen).toEqual([2]);
  });

  it('pelanggan gagal tidak menjatuhkan pelanggan lain', () => {
    const hub = new ChatRunHub();
    hub.start('r1', 'a1');
    const good: number[] = [];
    hub.subscribe('r1', 0, () => {
      throw new Error('pelanggan rusak');
    });
    hub.subscribe('r1', 0, (e) => good.push(e.seq));
    hub.append('r1', 'message.delta', {});
    expect(good).toEqual([1]);
  });

  it('run selesai melepas pelanggan tetapi riwayat tetap bisa diputar', () => {
    const hub = new ChatRunHub();
    hub.start('r1', 'a1');
    hub.append('r1', 'message.delta', { delta: 'a' });
    hub.finish('r1');
    expect(hub.isLive('r1')).toBe(false);

    // Klien yang kembali SETELAH run selesai tetap menerima seluruh riwayat:
    // itulah tujuan reattach — balasan utuh meski panel ditutup di tengah jalan.
    const late: number[] = [];
    hub.subscribe('r1', 0, (e) => late.push(e.seq));
    expect(late).toEqual([1]);
    expect(hub.history('r1')).toHaveLength(1);
  });

  it('langganan pada run tak dikenal tidak meledak', () => {
    const hub = new ChatRunHub();
    expect(() => hub.subscribe('nope', 0, () => {})).not.toThrow();
  });

  it('prune membuang run yang lewat TTL dan menyisakan yang muda', () => {
    let now = 1_000_000;
    const hub = new ChatRunHub(1000, () => now);
    hub.start('old', 'a1');
    hub.append('old', 'message.delta', {});

    now += 5000;
    // 'fresh' dibuat SETELAH jam berjalan — usianya nol saat prune.
    hub.start('fresh', 'a1');
    hub.append('fresh', 'message.delta', {});

    const removed = hub.prune();
    expect(removed).toBe(1);
    expect(hub.has('old')).toBe(false);
    expect(hub.has('fresh')).toBe(true);
  });

  it('TTL bawaan cukup lama untuk putar ulang manual', () => {
    expect(DEFAULT_RUN_TTL_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });
});
