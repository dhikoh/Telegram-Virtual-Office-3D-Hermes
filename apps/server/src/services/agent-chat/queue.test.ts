/**
 * Fase 2c — antrian pesan chat per agen.
 *
 * Kebenaran yang dijaga:
 *  - 1 run aktif per agen pada satu waktu (concurrency 1).
 *  - Pesan berikutnya mengantri secara FIFO (maksimal 5 antrian).
 *  - Melebihi 5 antrian langsung ditolak (QueueFullError).
 *  - Antrian antar-agen terisolasi (tugas agen B tidak terhambat agen A).
 *  - Kegagalan satu giliran tidak merusak antrian berikutnya.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentChatQueue, QueueFullError } from './queue.js';

describe('Fase 2c — AgentChatQueue', () => {
  let queue: AgentChatQueue;

  beforeEach(() => {
    queue = new AgentChatQueue(5);
  });

  it('memproses 3 pesan beruntun secara berurutan (FIFO)', async () => {
    const order: number[] = [];
    let activeCount = 0;
    let maxActive = 0;

    const createTask = (id: number, delayMs: number) => async () => {
      activeCount += 1;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      order.push(id);
      activeCount -= 1;
      return id;
    };

    // Kirim 3 pesan beruntun untuk agen yang sama
    const p1 = queue.enqueue('agent_1', createTask(1, 30));
    const p2 = queue.enqueue('agent_1', createTask(2, 20));
    const p3 = queue.enqueue('agent_1', createTask(3, 10));

    const results = await Promise.all([p1, p2, p3]);

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1); // Tidak pernah lebih dari 1 run aktif bersamaan
  });

  it('antrian antar-agen terisolasi dan berjalan bersamaan', async () => {
    const running = new Set<string>();
    let maxConcurrentAgents = 0;

    const createTask = (agentId: string) => async () => {
      running.add(agentId);
      maxConcurrentAgents = Math.max(maxConcurrentAgents, running.size);
      await new Promise((resolve) => setTimeout(resolve, 25));
      running.delete(agentId);
    };

    const pA = queue.enqueue('agent_a', createTask('agent_a'));
    const pB = queue.enqueue('agent_b', createTask('agent_b'));

    await Promise.all([pA, pB]);

    expect(maxConcurrentAgents).toBe(2); // Agent A dan Agent B berjalan paralel
  });

  it('menolak pesan jika antrian melebihi batas maksimal 5', async () => {
    let releaseActive: () => void;
    const blockActive = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });

    // 1 tugas aktif
    const active = queue.enqueue('agent_1', () => blockActive);

    // 5 tugas mengantri
    const pendingPromises = [];
    for (let i = 1; i <= 5; i++) {
      pendingPromises.push(queue.enqueue('agent_1', async () => i));
    }
    expect(queue.getPendingCount('agent_1')).toBe(5);

    // Tugas ke-7 (antrian ke-6) harus ditolak
    await expect(
      queue.enqueue('agent_1', async () => 'dilarang')
    ).rejects.toThrow(QueueFullError);

    releaseActive!();
    await active;
    await Promise.all(pendingPromises);
    expect(queue.getPendingCount('agent_1')).toBe(0);
  });

  it('kegagalan satu giliran tidak menghentikan giliran berikutnya', async () => {
    const order: string[] = [];

    const p1 = queue.enqueue('agent_1', async () => {
      throw new Error('giliran 1 gagal');
    }).catch((err) => {
      order.push(`catch: ${err.message}`);
    });

    const p2 = queue.enqueue('agent_1', async () => {
      order.push('giliran 2 sukses');
      return 'ok';
    });

    await Promise.all([p1, p2]);

    expect(order).toEqual(['catch: giliran 1 gagal', 'giliran 2 sukses']);
    expect(queue.isBusy('agent_1')).toBe(false);
  });

  it('melewati tugas jika signal sudah dibatalkan sebelum giliran dimulai', async () => {
    let releaseActive: () => void;
    const blockActive = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });

    const controller = new AbortController();

    const p1 = queue.enqueue('agent_1', () => blockActive);
    // Tugas 2 dibatalkan saat masih mengantri
    const p2 = queue.enqueue('agent_1', async () => 'tidak dijalankan', controller.signal);
    const p3 = queue.enqueue('agent_1', async () => 'giliran 3 sukses');

    controller.abort();
    releaseActive!();

    await p1;
    await expect(p2).rejects.toThrow(/dibatalkan/i);
    const res3 = await p3;
    expect(res3).toBe('giliran 3 sukses');
  });
});
