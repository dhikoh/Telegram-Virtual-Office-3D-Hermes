/**
 * Tahap 20 (ST-4) — api.saveAgentEndpoint() dan api.resetAgentEndpoint().
 *
 * Inti kontraknya satu: reset HARUS membawa `hermes_base_url` "" (string kosong,
 * bukan undefined) karena server memakai '' sebagai "ikuti pengaturan server" dan
 * menganggap field yang tidak ikut dikirim berarti "jangan ubah apa pun".
 * Perilaku server (terima '', tolak loopback, normalisasi) dikunci di
 * apps/server/src/routes/agents.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api';

vi.mock('../tma', () => ({
  tma: { getInitData: () => 'init-data-terpalsu' },
}));

describe('api endpoint per agen', () => {
  const fetchMock = vi.fn();
  let bodies: string[];
  let urls: string[];

  beforeEach(() => {
    bodies = [];
    urls = [];
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      urls.push(input);
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'agent_raka',
            name: 'Raka',
            role: 'Sales',
            department: 'Sales',
            avatar: '🤖',
            soul_summary: '',
            hermes_profile: 'default',
            model: null,
            active: 1,
            hired_at: 0,
            created_at: 0,
          }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('resetAgentEndpoint mengirim string kosong, bukan undefined', async () => {
    await api.resetAgentEndpoint('agent_raka');

    expect(urls[0]).toBe('/api/agents/agent_raka');
    const sent = JSON.parse(bodies[0]);
    expect('hermes_base_url' in sent).toBe(true);
    expect(sent.hermes_base_url).toBe('');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
  });

  it('saveAgentEndpoint mengirim URL yang sudah dipangkas', async () => {
    await api.saveAgentEndpoint('agent_raka', '  https://openrouter.ai/api/v1  ');

    expect(JSON.parse(bodies[0]).hermes_base_url).toBe('https://openrouter.ai/api/v1');
  });

  it('melempar pesan galat server apa adanya (400 loopback, dll.)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: 'invalid_input',
          message: 'Alamat loopback hanya boleh dipakai oleh server (Rule S5).',
        }),
    });

    await expect(api.resetAgentEndpoint('agent_raka')).rejects.toThrow(
      'Alamat loopback hanya boleh dipakai oleh server (Rule S5).'
    );
  });

  it('tetap memberi pesan terbaca ketika balasan bukan JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bukan json')),
    });

    await expect(api.saveAgentEndpoint('agent_raka', 'https://host/api')).rejects.toThrow(
      'Gagal memproses permintaan (500)'
    );
  });
});
