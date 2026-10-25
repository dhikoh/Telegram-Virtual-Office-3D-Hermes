/**
 * Fase 2a (route level) — stream chat memancarkan detak, dan detaknya berhenti.
 *
 * Kebenaran yang dijaga:
 *  - Selama gateway belum menjawab, klien tetap menerima frame `: hb` sehingga
 *    Cloudflare tidak memutus koneksi idle di ~100 detik.
 *  - Setelah stream selesai, tidak ada frame tambahan (interval dibersihkan).
 *  - Frame heartbeat ditulis SEBELUM data apa pun, jadi klien tahu koneksi hidup
 *    bahkan sebelum token pertama sampai.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';
import { HEARTBEAT_FRAME } from './services/agent-chat/heartbeat.js';

// Hitung detak yang benar-benar ditulis route, supaya gateway tiruan bisa
// menunggu KONDISI (jumlah detak) alih-alih DURASI (milidetik). Interval
// setInterval tidak dijamin mendapat N tick dalam waktu tetap saat event loop
// sibuk — itu akar flake-nya.
vi.mock('./services/agent-chat/heartbeat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/agent-chat/heartbeat.js')>();
  return {
    ...actual,
    startHeartbeat: (intervalMs: number, write: (frame: string) => void) => {
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) return () => {};
      const timer = setInterval(() => {
        noteBeat();
        write(HEARTBEAT_FRAME);
      }, intervalMs);
      timer.unref?.();
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
      };
    },
  };
});

const gateway = vi.hoisted(() => ({
  /** Berapa lama "gateway" berdiam diri sebelum menjawab (ms). */
  delayMs: 0,
  /**
   * Fix flake: gateway menunggu sampai SEJUMLAH detak terlihat, bukan sampai
   * sekian milidetik lewat. Interval `setInterval` tidak dijamin mendapat N
   * tick dalam durasi tetap — saat event loop sibuk (suite penuh berjalan),
   * 110 ms bisa hanya menghasilkan 0 tick, dan tes ">= 3 detak" gagal tanpa
   * ada yang rusak. Dengan menunggu kondisi, tes menguji apa yang memang
   * dijaga: detak benar-benar mengalir selama gateway diam.
   */
  waitForBeats: 0,
  beatsSeen: 0,
  sessionSystem: [] as (string | undefined)[],
  makeSession: true,
}));

/** Tunggu sampai gateway melihat `n` detak (dipanggil dari route lewat writeEvent). */
function noteBeat(): void {
  gateway.beatsSeen += 1;
}

/**
 * Gateway "diam" sampai detak yang diminta terlihat.
 *
 * `waitForBeats = 0` berarti tidak menunggu sama sekali (jalur cepat). Batas
 * atas 5 detik mencegah tes menggantung selamanya bila detak berhenti mengalir
 * — kegagalan harus muncul sebagai assertion, bukan timeout bisu.
 */
async function waitForBeats(): Promise<void> {
  const target = gateway.waitForBeats;
  if (target <= 0) return;
  const deadline = Date.now() + 5000;
  while (gateway.beatsSeen < target && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();

  const stub = {
    capabilities: async () => ({
      object: 'hermes.api_server.capabilities',
      platform: 'hermes-agent',
      model: 'hermes-agent',
      features: {},
    }),
    startRun: async () => ({ run_id: 'run_hb', status: 'started' }),
    getRunStatus: async () => ({ object: 'hermes.run', run_id: 'run_hb', status: 'completed' }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async () => () => {},
    chatStream: async () => {
      // Jalur stateless juga harus membuktikan detaknya: stub ikut menunda.
      await waitForBeats();
    },
    listModels: async () => ['hermes-agent'],
    createSession: async () => (gateway.makeSession ? 'sess_hb' : null),
    getSessionMessages: async () => [],
    sessionChatStream: async (
      _sid: string,
      _message: unknown,
      onDelta: (d: string) => void,
      _model?: unknown,
      systemPrompt?: string
    ) => {
      gateway.sessionSystem.push(systemPrompt);
      await waitForBeats();
      onDelta('jawaban');
    },
    listSkills: async () => [],
  } as unknown as import('./services/hermes/client.interface.js').HermesClient;

  return { ...actual, getServerHermesClient: () => stub, getHermesClientForAgent: () => stub };
});

describe('Fase 2a — detak stream chat', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  const AGENT_ID = 'agent_hb';

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    // Interval 25 ms: cukup pendek untuk diuji, cukup nyata untuk membuktikan
    // timer benar-benar berdetak.
    app = buildServer({ db, chatHeartbeatMs: 25 });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  beforeEach(() => {
    gateway.delayMs = 0;
    gateway.waitForBeats = 0;
    gateway.beatsSeen = 0;
    gateway.sessionSystem = [];
    gateway.makeSession = true;
    db.prepare('DELETE FROM agent_sessions WHERE agent_id = ?').run(AGENT_ID);
    db.prepare('DELETE FROM agents WHERE id = ?').run(AGENT_ID);
    db.prepare(
      `INSERT OR REPLACE INTO agents
         (id, name, role, department, avatar, soul_summary, hermes_base_url,
          api_key_env, hermes_profile, active, hired_at, created_at, is_system, avatar_style)
       VALUES (?, 'Bagas', 'Distributor', 'marketing', '🧢', '', '', 'HERMES_KEY_DEFAULT',
               'default', 1, 1, 1, 0, NULL)`
    ).run(AGENT_ID);
  });

  let hbSeq = 0;
  const chat = () =>
    app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
      body: JSON.stringify({
        client_message_id: `msg_hb_${++hbSeq}`,
        messages: [{ role: 'user', content: 'siapa kamu?' }],
      }),
    });

  it('menunggu tool yang lama tetap mengirim detak, lalu menutup dengan bersih', async () => {
    // Fix flake: gateway menunggu 3 DETAK NYATA, bukan 110 ms. Saat event loop
    // sibuk, 110 ms bisa hanya menghasilkan 0 tick dan tes ini gagal tanpa ada
    // yang rusak. Yang dijaga: detak mengalir selama gateway diam.
    gateway.waitForBeats = 3;
    const res = await chat();
    expect(res.statusCode).toBe(200);

    const beats = res.body.split(': hb').length - 1;
    expect(beats).toBeGreaterThanOrEqual(3);
    expect(res.body).toContain('jawaban');
    expect(res.body).toContain('[DONE]');
  });

  it('stream cepat pun mendapat setidaknya satu detak sebelum data', async () => {
    const res = await chat();
    expect(res.statusCode).toBe(200);
    expect(res.body.indexOf(': hb')).toBeLessThan(res.body.indexOf('jawaban'));
  });

  it('jumlah detak tiap stream dibatasi oleh durasi streamnya sendiri', async () => {
    // Fix flake: dulu tes ini menunggu 60 ms dan mengizinkan 1..5 detak. Saat
    // event loop sibuk, 60 ms bisa 0 detak (gagal batas bawah) — dan bila
    // interval bocor, jumlahnya tumbuh tanpa batas. Kini gateway menunggu 2
    // detak, lalu yang diperiksa adalah TIDAK ADA AKUMULASI: stream pendek
    // tidak boleh mewarisi detak dari stream sebelumnya.
    gateway.waitForBeats = 2;
    const res = await chat();
    const beats = res.body.split(': hb').length - 1;
    expect(beats).toBeGreaterThanOrEqual(2);
    expect(beats).toBeLessThanOrEqual(5);
  });

  it('jalur stateless juga hidup — heartbeat bukan milik jalur sesi saja', async () => {
    gateway.makeSession = false;
    gateway.waitForBeats = 3;
    const res = await chat();
    expect(res.statusCode).toBe(200);
    expect(res.body.split(': hb').length - 1).toBeGreaterThanOrEqual(3);
  });
});
