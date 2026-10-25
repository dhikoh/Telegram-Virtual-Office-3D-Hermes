/**
 * Fase 2d (route level) — Idempotensi (client_message_id) & Deteksi Stall (45s).
 *
 * Kebenaran yang dijaga:
 *  - `client_message_id` wajib disertakan pada permintaan chat baru (400 jika kosong).
 *  - Request duplikat dengan `client_message_id` yang sama diabaikan dari eksekusi
 *    ganda dan mengembalikan stream yang sama (idempoten).
 *  - 45 detik tanpa event dari gateway memancarkan frame status "agen sedang menjalankan tool",
 *    lalu retry sekali dengan model fallback.
 *  - Stream tidak pernah ditutup diam-diam (selalu berakhir dengan [DONE] atau error).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

const { mockClient } = vi.hoisted(() => {
  return {
    mockClient: {
      capabilities: async () => ({
        object: 'hermes.api_server.capabilities',
        platform: 'hermes-agent',
        model: 'hermes-agent',
        features: {},
      }),
      startRun: async () => ({ run_id: 'run_unused', status: 'started' }),
      getRunStatus: async () => ({ object: 'hermes.run', run_id: 'run_unused', status: 'completed' }),
      resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
      stopRun: async () => ({ status: 'stopping' }),
      streamEvents: async () => () => {},
      runChatStream: async (
        _params: any,
        handlers: {
          onRunId?: (runId: string) => void;
          onDelta: (delta: string) => void;
          onDone: () => void;
          onError?: (message: string) => void;
        }
      ) => {
        handlers.onRunId?.('run_chat_test_1');
        handlers.onDelta('Halo ');
        handlers.onDelta('dunia');
        handlers.onDone();
      },
      chatStream: async () => {},
      listModels: async () => ['hermes-agent', 'hermes-agent-fallback'],
      createSession: async () => 'sess_x',
      getSessionMessages: async () => [],
      sessionChatStream: async (
        _sessionId: string,
        _message: any,
        onDelta: (delta: string) => void
      ) => {
        onDelta('Halo dari fallback session');
      },
      listSkills: async () => [],
    },
  };
});

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();
  return {
    ...actual,
    getHermesClientForAgent: () => mockClient,
  };
});

let app: FastifyInstance;
let db: BetterSqlite3.Database;
const botToken = 'mock_telegram_bot_token';
const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
const auth = 'tma ' + createTelegramInitData(ownerUser, botToken);
const agentId = 'agent_a';

beforeAll(async () => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  // Gunakan chatStallMs kecil (50ms) agar test stall berjalan instan
  app = buildServer({
    db,
    chatHeartbeatMs: 20,
    chatStallMs: 150,
    chatFallbackModel: 'hermes-agent-fallback',
  });
  await app.ready();

  db.prepare(
    `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
     hermes_profile, model, active, hired_at, created_at)
     VALUES (?, 'Bagas', 'anggota', 'Tech', 'bot', '{}', 'ringkas', 'default', 'hermes-agent', 1, ?, ?)`
  ).run(agentId, Date.now(), Date.now());
});

describe('Fase 2d — Idempotensi (client_message_id)', () => {
  it('menolak HTTP 400 jika client_message_id tidak disertakan', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'Halo' }] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_input');
    expect(res.json().message).toContain('client_message_id is required');
  });

  it('menerima request jika client_message_id dikirimkan via body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: {
        client_message_id: 'msg_test_1',
        messages: [{ role: 'user', content: 'Halo' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('run_chat_test_1');
    expect(res.payload).toContain('Halo ');
    expect(res.payload).toContain('dunia');
  });

  it('request duplikat dengan client_message_id yang sama tidak menjalankan LLM ulang dan mengembalikan hasil yang sama', async () => {
    let callCount = 0;
    const origRunChatStream = mockClient.runChatStream;
    mockClient.runChatStream = async (_params: any, handlers: any) => {
      callCount++;
      handlers.onRunId?.('run_idempotent_1');
      handlers.onDelta('Jawaban pertama');
      handlers.onDone();
    };

    try {
      const p1 = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: {
          client_message_id: 'msg_idem_unique',
          messages: [{ role: 'user', content: 'Pertanyaan satu' }],
        },
      });

      expect(p1.statusCode).toBe(200);
      expect(p1.payload).toContain('Jawaban pertama');
      expect(callCount).toBe(1);

      // Request kedua dengan ID yang sama
      const p2 = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: {
          client_message_id: 'msg_idem_unique',
          messages: [{ role: 'user', content: 'Pertanyaan satu' }],
        },
      });

      expect(p2.statusCode).toBe(200);
      expect(p2.payload).toContain('Jawaban pertama');
      // LLM TIDAK dipanggil kedua kali!
      expect(callCount).toBe(1);
    } finally {
      mockClient.runChatStream = origRunChatStream;
    }
  });

  it('request duplikat konkuren langsung tersambung ke run yang sedang aktif', async () => {
    let releaseRun: () => void;
    const gate = new Promise<void>((r) => {
      releaseRun = r;
    });

    let executionCount = 0;
    // Fix flake: dulu tes menunggu 20 ms dan BERASUMSI request 1 sudah sampai
    // di runChatStream. Saat event loop sibuk, 20 ms bisa belum cukup —
    // request 2 lalu dijalankan sebagai giliran BARU dan executionCount jadi 2.
    // Kini request 1 memberi sinyal NYATA lewat `runStarted`, dan tes menunggu
    // sinyal itu sebelum mengirim request 2.
    let runStarted: () => void;
    const started = new Promise<void>((r) => {
      runStarted = r;
    });

    const origRunChatStream = mockClient.runChatStream;
    mockClient.runChatStream = async (_params: any, handlers: any) => {
      executionCount++;
      handlers.onRunId?.('run_concurrent_idempotent');
      handlers.onDelta('Potongan 1 ');
      runStarted!();
      await gate;
      handlers.onDelta('Potongan 2');
      handlers.onDone();
    };

    try {
      const p1 = app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: {
          client_message_id: 'msg_concurrent_same',
          messages: [{ role: 'user', content: 'Halo' }],
        },
      });

      // Tunggu run pertama BENAR-BENAR mulai, bukan sekian milidetik lewat.
      await started;

      const p2 = app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: {
          client_message_id: 'msg_concurrent_same',
          messages: [{ role: 'user', content: 'Halo' }],
        },
      });

      releaseRun!();

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      expect(r1.payload).toContain('Potongan 1 ');
      expect(r1.payload).toContain('Potongan 2');
      expect(r2.payload).toContain('Potongan 1 ');
      expect(r2.payload).toContain('Potongan 2');
      expect(executionCount).toBe(1);
    } finally {
      mockClient.runChatStream = origRunChatStream;
    }
  });
});

describe('Fase 2d — Deteksi Stall & Model Fallback', () => {
  it('mengirim frame status saat stall terjadi dan retry dengan fallback model', async () => {
    const executedModels: (string | undefined)[] = [];
    const origRunChatStream = mockClient.runChatStream;

    mockClient.runChatStream = async (params: any, handlers: any) => {
      executedModels.push(params.model);
      if (executedModels.length === 1) {
        // Run pertama: diam tanpa event melebihi chatStallMs (50ms)
        handlers.onRunId?.('run_stalled_1');
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 200);
          params.signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('stalled'));
          });
        });
        return;
      }
      // Run kedua (retry): berhasil mengirimkan jawaban
      handlers.onRunId?.('run_fallback_success');
      handlers.onDelta('Jawaban dari model fallback');
      handlers.onDone();
    };

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: {
          client_message_id: 'msg_stall_test',
          messages: [{ role: 'user', content: 'Tes stall' }],
        },
      });

      expect(res.statusCode).toBe(200);
      // Memastikan frame status terkirim
      expect(res.payload).toContain('"status":"tool_running"');
      expect(res.payload).toContain('"message":"agen sedang menjalankan tool"');
      // Memastikan jawaban dari model fallback diterima
      expect(res.payload).toContain('Jawaban dari model fallback');
      expect(res.payload).toContain('data: [DONE]');

      // Model pertama adalah bawaan agen, model kedua adalah fallback
      expect(executedModels[0]).toBe('hermes-agent');
      expect(executedModels[1]).toBe('hermes-agent-fallback');
    } finally {
      mockClient.runChatStream = origRunChatStream;
    }
  });

  it('jika retry juga gagal, stream mengirim frame error nyata dan tidak tertutup diam-diam', async () => {
    const origRunChatStream = mockClient.runChatStream;
    let attempts = 0;

    mockClient.runChatStream = async (_params: any, handlers: any) => {
      attempts++;
      handlers.onRunId?.(`run_fail_${attempts}`);
      if (attempts === 1) {
        // Stall attempt 1
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 200);
          _params.signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('stalled'));
          });
        });
        return;
      }
      // Attempt 2 throws / fails
      handlers.onError?.('fallback provider kuota habis');
      throw new Error('fallback provider kuota habis');
    };

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: {
          client_message_id: 'msg_stall_double_fail',
          messages: [{ role: 'user', content: 'Tes double fail' }],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain('tool_running');
      expect(res.payload).toContain('"error":"run_failed"');
      expect(res.payload).toContain('fallback provider kuota habis');
    } finally {
      mockClient.runChatStream = origRunChatStream;
    }
  });
});
