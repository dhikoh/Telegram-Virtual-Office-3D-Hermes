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

/**
 * Tahap 20 — buang suffix versi API yang diketik manual oleh owner.
 *
 * Semua endpoint dibangun sebagai `${baseUrl}/v1/...` (lihat detect.ts,
 * real.client.ts, mock.client.ts, probe.ts), sehingga base URL yang sudah
 * berakhir `/v1` selalu menghasilkan `/v1/v1/...` — buktinya
 * `https://openrouter.ai/api/v1/v1/models` membalas 404 sedangkan
 * `https://openrouter.ai/api/v1/models` membalas 200.
 *
 * Urutan list penting: segmen panjang didahulukan supaya `/v1/chat/completions`
 * terpotong utuh sebelum `/v1`. Hanya suffix versi API yang dibuang — suffix
 * `/api/v1` sengaja TIDAK ada di daftar, karena yang harus tersisa setelah
 * pemotongan adalah `https://openrouter.ai/api` (lalu kode menambahkan
 * `/v1/models`), bukan `https://openrouter.ai` yang akan membuat `/api` hilang.
 *
 * Loop bertingkat supaya input ganda ikut bersih: `host/api/v1/v1` -> `host/api`.
 * Path yang bukan versi API (`/v1beta`, `/api`, port saja) tidak tersentuh
 * karena perbandingan ke suffix eksak.
 */
const API_VERSION_SUFFIXES = ['/v1/chat/completions', '/v1/capabilities', '/v1'] as const;

export function stripApiSuffix(raw: string): string {
  let out = (raw || '').trim().replace(/\/+$/, '');
  let changed = true;
  while (changed && out) {
    changed = false;
    const lower = out.toLowerCase();
    for (const suffix of API_VERSION_SUFFIXES) {
      if (lower.endsWith(suffix) && out.length > suffix.length) {
        out = out.slice(0, -suffix.length).replace(/\/+$/, '');
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Tahap 20 — urutkan daftar model abjad A-Z tanpa duplikat dan tanpa entri
 * kosong. OpenRouter sendiri mengembalikan 468 model dalam urutan acak, jadi
 * pengurutan dilakukan sekali di server dan klien tinggal merender.
 *
 * `sensitivity: 'base'` menempatkan `GPT-4` berdampingan dengan `gpt-4`;
 * `numeric: true` merapikan `m2` sebelum `m10`.
 */
export function sortModels(models: string[]): string[] {
  return [...new Set(models.map((m) => m.trim()).filter((m) => m.length > 0))].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })
  );
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
    // Normalisasi di jalur TULIS: baris yang disimpan ke SQLite sudah bersih.
    return stripApiSuffix(withScheme);
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
    // stripApiSuffix: panggilan langsung (tanpa lewat normalizeBaseUrl) juga
    // tidak boleh menghasilkan `/v1/v1/models`.
    const res = await fetchImpl(`${stripApiSuffix(baseUrl)}/v1/models`, {
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
