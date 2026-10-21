/**
 * Tahap 20 (ST-3) — api.listAgentModels().
 *
 * Perilaku rute GET /api/agents/:id/models (404/400/502, pengurutan A-Z,
 * read-only) dikunci oleh apps/server/src/routes/agents.test.ts. Test ini
 * mengunci sisi klien: bentuk URL, header otorisasi Rule S1, dan pesan galat
 * yang benar-benar sampai ke panel model.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api';

vi.mock('../tma', () => ({
  tma: { getInitData: () => 'init-data-terpalsu' },
}));

type FetchCall = [input: string, init?: RequestInit];

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('api.listAgentModels', () => {
  const fetchMock = vi.fn();
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      calls.push([input, init]);
      return Promise.resolve(
        fakeResponse(200, {
          models: ['apple-2', 'anthropic/claude'],
          current_model: 'model-1',
          endpoint_source: 'server',
          base_url_used: 'https://openrouter.ai/api',
          status_code: 200,
          latency_ms: 12,
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('membaca endpoint read-only tanpa query saat tidak ada draft', async () => {
    const result = await api.listAgentModels('agent_raka');

    expect(calls[0]?.[0]).toBe('/api/agents/agent_raka/models');
    // Rule S1 — setiap panggilan membawa initData Telegram.
    expect(new Headers(calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'tma init-data-terpalsu'
    );
    expect(result.models).toEqual(['apple-2', 'anthropic/claude']);
    expect(result.endpoint_source).toBe('server');
    expect(result.current_model).toBe('model-1');
  });

  it('meneruskan draft base URL yang sudah di-encode', async () => {
    await api.listAgentModels('agent_raka', ' https://openrouter.ai/api/v1 ');

    expect(calls[0]?.[0]).toBe(
      `/api/agents/agent_raka/models?base_url=${encodeURIComponent('https://openrouter.ai/api/v1')}`
    );
  });

  it('mengabaikan draft yang hanya berisi spasi', async () => {
    await api.listAgentModels('agent_raka', '   ');

    expect(calls[0]?.[0]).toBe('/api/agents/agent_raka/models');
  });

  it('melempar pesan galat server apa adanya, bukan blob JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(502, {
        error: 'unauthorized',
        message: 'Kunci API ditolak gateway (401).',
        models: [],
      })
    );

    await expect(api.listAgentModels('agent_raka')).rejects.toThrow(
      'Kunci API ditolak gateway (401).'
    );
  });

  it('tetap memberi pesan yang terbaca ketika balasan bukan JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bukan json')),
    });

    await expect(api.listAgentModels('agent_raka')).rejects.toThrow(
      'Gagal memproses permintaan (500)'
    );
  });
});
