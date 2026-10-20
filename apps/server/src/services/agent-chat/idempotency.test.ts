import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatIdempotencyHub } from './idempotency.js';

describe('Fase 2d — ChatIdempotencyHub', () => {
  let hub: ChatIdempotencyHub;

  beforeEach(() => {
    hub = new ChatIdempotencyHub(1000);
  });

  it('mencatat turn baru dan mengembalikan record idempotensi', () => {
    const turn = hub.register('agent_1', 'msg_abc');
    expect(turn).toBeDefined();
    expect(turn.agentId).toBe('agent_1');
    expect(turn.clientMessageId).toBe('msg_abc');
    expect(turn.runId).toBeNull();
  });

  it('mendeteksi turn yang sudah terdaftar', () => {
    hub.register('agent_1', 'msg_abc');
    const existing = hub.get('agent_1', 'msg_abc');
    expect(existing).toBeDefined();
    expect(existing?.clientMessageId).toBe('msg_abc');

    // Agen berbeda dengan ID pesan yang sama tidak bertabrakan
    expect(hub.get('agent_2', 'msg_abc')).toBeNull();
  });

  it('mengaitkan runId ke turn yang sedang berjalan dan menyelesaikan promise', async () => {
    const turn = hub.register('agent_1', 'msg_abc');
    let resolvedId: string | null = null;
    void turn.runIdPromise.then((id) => {
      resolvedId = id;
    });

    expect(resolvedId).toBeNull();
    hub.setRunId('agent_1', 'msg_abc', 'run_xyz');

    await turn.runIdPromise;
    expect(resolvedId).toBe('run_xyz');
    expect(turn.runId).toBe('run_xyz');
  });

  it('menghapus turn jika eksekusi dibatalkan atau gagal sebelum runId', () => {
    hub.register('agent_1', 'msg_failed');
    expect(hub.get('agent_1', 'msg_failed')).toBeDefined();

    hub.remove('agent_1', 'msg_failed');
    expect(hub.get('agent_1', 'msg_failed')).toBeNull();
  });

  it('membersihkan catatan yang kedaluwarsa sesuai TTL', () => {
    let now = 1000;
    const customHub = new ChatIdempotencyHub(500, () => now);

    customHub.register('agent_1', 'msg_old');
    now = 1600; // 600ms lewat (TTL 500ms)
    const pruned = customHub.prune();
    expect(pruned).toBe(1);
    expect(customHub.get('agent_1', 'msg_old')).toBeNull();
  });
});
