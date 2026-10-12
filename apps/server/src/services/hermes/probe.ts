/**
 * Hermes API server reachability probe.
 *
 * Used by GET /api/health so the owner can see, in one call, whether the
 * office container can actually reach the Hermes API server on the VPS host.
 *
 * Rule: never leak the base URL (it names an internal host) — return only
 * booleans, HTTP status and latency.
 */

export interface HermesProbeResult {
  mode: string;
  reachable: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
}

export interface ProbeOptions {
  timeoutMs?: number;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

function normalizeError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  const msg = e?.message || String(err);
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) return 'dns';
  if (/ECONNREFUSED/i.test(msg)) return 'connection_refused';
  if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) return 'unreachable';
  return 'error';
}

export async function probeHermes(
  baseUrl: string,
  mode: string,
  options: ProbeOptions = {}
): Promise<HermesProbeResult> {
  const timeoutMs = options.timeoutMs ?? 1500;
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = Date.now();

  if (mode !== 'real') {
    return { mode, reachable: false, status_code: null, latency_ms: null, error: 'mock_mode' };
  }

  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      mode,
      reachable: res.ok,
      status_code: res.status,
      latency_ms: Date.now() - started,
      error: res.ok ? null : `http_${res.status}`,
    };
  } catch (err: unknown) {
    return {
      mode,
      reachable: false,
      status_code: null,
      latency_ms: Date.now() - started,
      error: normalizeError(err),
    };
  }
}
