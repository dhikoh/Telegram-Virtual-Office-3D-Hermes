/**
 * Hermes reachability probe used by GET /api/health.
 * Covers the three failure modes seen on the VPS: DNS (host.docker.internal
 * unresolvable), connection refused (API server not enabled), and timeout.
 */
import { describe, it, expect, vi } from 'vitest';
import { probeHermes } from './probe.js';

const BASE = 'http://172.16.1.1:8642';

describe('probeHermes', () => {
  it('mock mode does not make a network call', async () => {
    const fetchImpl = vi.fn();
    const res = await probeHermes(BASE, 'mock', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({
      mode: 'mock',
      reachable: false,
      status_code: null,
      latency_ms: null,
      error: 'mock_mode',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reachable API server reports status and latency', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const res = await probeHermes(BASE, 'real', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/health`,
      expect.objectContaining({ method: 'GET' })
    );
    expect(res.reachable).toBe(true);
    expect(res.status_code).toBe(200);
    expect(res.error).toBeNull();
    expect(res.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('maps DNS failure (host.docker.internal missing) to dns', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND host.docker.internal'));
    const res = await probeHermes(BASE, 'real', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toMatchObject({ reachable: false, status_code: null, error: 'dns' });
  });

  it('maps connection refused (API server disabled) to connection_refused', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 172.16.1.1:8642'));
    const res = await probeHermes(BASE, 'real', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toMatchObject({ reachable: false, error: 'connection_refused' });
  });

  it('maps abort/timeout to timeout', async () => {
    const err = new Error('The operation was aborted');
    err.name = 'TimeoutError';
    const fetchImpl = vi.fn().mockRejectedValue(err);
    const res = await probeHermes(BASE, 'real', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toMatchObject({ reachable: false, error: 'timeout' });
  });

  it('non-2xx response is reported but not treated as reachable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const res = await probeHermes(BASE, 'real', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toMatchObject({ reachable: false, status_code: 401, error: 'http_401' });
  });

  it('never exposes the base URL (internal host must stay private)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 172.16.1.1:8642'));
    const res = await probeHermes(BASE, 'real', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(JSON.stringify(res)).not.toContain('172.16.1.1');
    expect(Object.keys(res)).not.toContain('base_url');
  });
});
