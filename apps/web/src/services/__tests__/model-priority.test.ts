import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';

vi.mock('../tma', () => ({ tma: { getInitData: () => 'priority-test-init' } }));
afterEach(() => { vi.unstubAllGlobals(); });

 describe('model priority API', () => {
  it('reads and saves the ordered list through the authenticated exact route', async () => {
    const payload = { models: ['beta', 'alpha'], current_model: 'beta', max_models: 5 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.getAgentModelPriority('agent/test')).toEqual(payload);
    expect(await api.saveAgentModelPriority('agent/test', ['beta', 'alpha'])).toEqual(payload);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/agents/agent%2Ftest/model-priority', '/api/agents/agent%2Ftest/model-priority',
    ]);
    const init = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ models: ['beta', 'alpha'] });
    expect(new Headers(init.headers).get('Authorization')).toBe('tma ' + 'priority-test-init');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });
});
