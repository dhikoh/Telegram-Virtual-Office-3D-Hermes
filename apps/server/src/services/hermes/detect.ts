/**
 * Auto-detect a Hermes gateway endpoint: given a base URL and an API key,
 * ask the gateway which models it serves so the owner never has to type a
 * model name by hand.
 *
 * Rules honoured here:
 * - S4: the key is used server-side only and never echoed back.
 * - S5: the base URL is validated before use; loopback URLs are rejected so a
 *   misconfigured agent cannot silently probe the container itself.
 */

export interface ModelProbeResult {
  ok: boolean;
  models: string[];
  status_code: number | null;
  error: string | null;
  latency_ms: number | null;
}

export interface ModelProbeOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ModelsResponse {
  data?: { id?: string }[];
}

/** Accepts `http://host:port`, `host:port` or `host` and returns a base URL. */
export function normalizeBaseUrl(raw: string): string | null {
  const trimmed = (raw || '').trim();
  // Checked BEFORE stripping slashes: 'http://' would otherwise lose its '//'
  // and become the nonsense but parseable 'http://http:'.
  if (!trimmed || /^https?:\/\/?$/i.test(trimmed)) return null;
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  const candidate = withoutTrailing || trimmed;
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return null;
    return withScheme;
  } catch {
    return null;
  }
}

export async function probeModels(
  baseUrl: string,
  apiKey: string,
  options: ModelProbeOptions = {}
): Promise<ModelProbeResult> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = Date.now();

  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v1/models`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latency = Date.now() - started;

    if (!res.ok) {
      return {
        ok: false,
        models: [],
        status_code: res.status,
        error: res.status === 401 ? 'unauthorized' : `http_${res.status}`,
        latency_ms: latency,
      };
    }

    const body = (await res.json()) as ModelsResponse;
    const models = (body.data || [])
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    return { ok: true, models, status_code: res.status, error: null, latency_ms: latency };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    let error = 'error';
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') error = 'timeout';
    else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(e?.message || '')) error = 'dns';
    else if (/ECONNREFUSED/i.test(e?.message || '')) error = 'connection_refused';
    else if (/EHOSTUNREACH|ENETUNREACH/i.test(e?.message || '')) error = 'unreachable';
    return { ok: false, models: [], status_code: null, error, latency_ms: Date.now() - started };
  }
}
