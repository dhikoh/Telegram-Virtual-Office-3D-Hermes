/**
 * Tahap 7 — gateway auto-detect: given an endpoint + API key, ask the gateway
 * which models it serves (Rule S4: the key never leaves the server; Rule S5:
 * the endpoint is validated before use).
 */
import { describe, it, expect, vi } from 'vitest';
import { normalizeBaseUrl, probeModels, stripApiSuffix } from './detect.js';

describe('normalizeBaseUrl', () => {
  it('accepts a full URL and strips a trailing slash', () => {
    expect(normalizeBaseUrl('http://172.16.1.1:8642/')).toBe('http://172.16.1.1:8642');
  });

  it('adds a scheme to a bare host:port', () => {
    expect(normalizeBaseUrl('172.16.1.1:8642')).toBe('http://172.16.1.1:8642');
  });

  it('returns null for empty or unparseable input', () => {
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl('   ')).toBeNull();
    expect(normalizeBaseUrl('http://')).toBeNull();
  });

  // Tahap 20 — bukti regresi: base URL ber- suffix /v1 membuat semua endpoint
  // menjadi /v1/v1/... (terbukti 404 pada https://openrouter.ai/api/v1/v1/models).
  it('strips a trailing /v1 so the appended path never doubles', () => {
    expect(normalizeBaseUrl('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api');
    expect(normalizeBaseUrl('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/api');
    expect(normalizeBaseUrl('https://openrouter.ai/api/v1/chat/completions')).toBe(
      'https://openrouter.ai/api'
    );
    expect(normalizeBaseUrl('172.16.1.1:8642/v1')).toBe('http://172.16.1.1:8642');
  });

  it('leaves endpoints that are not an API version untouched', () => {
    expect(normalizeBaseUrl('https://host.example/v1beta')).toBe('https://host.example/v1beta');
    expect(normalizeBaseUrl('https://host.example/api')).toBe('https://host.example/api');
    expect(normalizeBaseUrl('http://172.16.1.1:8642')).toBe('http://172.16.1.1:8642');
  });
});

describe('stripApiSuffix', () => {
  it('removes one or several trailing API version segments', () => {
    expect(stripApiSuffix('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api');
    expect(stripApiSuffix('https://openrouter.ai/api/v1/v1')).toBe('https://openrouter.ai/api');
    expect(stripApiSuffix('http://gw:8642/v1/')).toBe('http://gw:8642');
    expect(stripApiSuffix('http://gw:8642/v1/capabilities')).toBe('http://gw:8642');
  });

  it('never strips a scheme, host, port or non-version path', () => {
    expect(stripApiSuffix('http://172.16.1.1:8642')).toBe('http://172.16.1.1:8642');
    expect(stripApiSuffix('https://v1.example.com')).toBe('https://v1.example.com');
    expect(stripApiSuffix('https://host.example/v1beta')).toBe('https://host.example/v1beta');
    expect(stripApiSuffix('')).toBe('');
  });
});

describe('probeModels', () => {
  it('reads the OpenAI-style /v1/models list', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'hermes-agent' }, { id: 'gpt-oss-120b' }] }),
    });
    const res = await probeModels('http://172.16.1.1:8642', '***', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.ok).toBe(true);
    expect(res.models).toEqual(['hermes-agent', 'gpt-oss-120b']);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://172.16.1.1:8642/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer ***' }),
      })
    );
  });

  it('drops malformed model entries instead of failing the probe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'ok-model' }, {}, { id: '' }, null] }),
    });
    const res = await probeModels('http://gw:8642', 'k', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.ok).toBe(true);
    expect(res.models).toEqual(['ok-model']);
  });

  it('maps a rejected key to `unauthorized` and never echoes the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const res = await probeModels('http://gw:8642', 'sk-secret-value', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res).toMatchObject({ ok: false, error: 'unauthorized', status_code: 401 });
    expect(JSON.stringify(res)).not.toContain('sk-secret-value');
  });

  it('maps a refused connection to `connection_refused`', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 172.16.1.1:8642'));
    const res = await probeModels('http://172.16.1.1:8642', 'k', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('connection_refused');
  });

  it('maps DNS failures to `dns` and timeouts to `timeout`', async () => {
    const dns = await probeModels('http://gw:8642', 'k', {
      fetchImpl: vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND gw')) as unknown as typeof fetch,
    });
    expect(dns.error).toBe('dns');

    const abort = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const timedOut = await probeModels('http://gw:8642', 'k', {
      fetchImpl: vi.fn().mockRejectedValue(abort) as unknown as typeof fetch,
    });
    expect(timedOut.error).toBe('timeout');
  });
});
