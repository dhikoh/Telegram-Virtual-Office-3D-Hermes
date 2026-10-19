import type {
  ChatMessageContent,
  ChatRequestMessage,
  HermesClient,
  StartRunParams,
  StartRunResponse,
  HermesRunStatus,
  HermesSessionMessage,
} from './client.interface.js';
import { HermesTimeoutError } from './client.interface.js';
import type { HermesCapabilities } from '@hermes-office/shared';
import { config } from '../../config.js';

export class RealHermesClient implements HermesClient {
  private baseUrl: string;
  private key: string;
  private timeoutMs: number;
  /** Batas tunggu huruf pertama stream chat (TTFB). */
  private chatTtfbMs: number;
  /** Batas total satu giliran chat — sengaja terpisah dari timeoutMs. */
  private chatTimeoutMs: number;

  constructor(
    baseUrl: string,
    key: string,
    timeoutMs: number = config.HERMES_TIMEOUT_MS,
    chatTtfbMs: number = config.HERMES_CHAT_TTFB_MS,
    chatTimeoutMs: number = config.HERMES_CHAT_TIMEOUT_MS
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.key = key;
    this.timeoutMs = timeoutMs;
    this.chatTtfbMs = chatTtfbMs;
    this.chatTimeoutMs = chatTimeoutMs;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: 'Bearer ' + this.key,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit,
    timeoutMs: number = this.timeoutMs
  ): Promise<Response> {
    const signal = init?.signal ?? AbortSignal.timeout(timeoutMs);
    try {
      return await fetch(url, { ...init, signal });
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error?.name === 'TimeoutError' || (error?.name === 'AbortError' && signal.aborted)) {
        throw new HermesTimeoutError(`Hermes request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  public async capabilities(): Promise<HermesCapabilities> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/capabilities`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Hermes capabilities error: ${res.status} ${res.statusText}`);
    return (await res.json()) as HermesCapabilities;
  }

  /**
   * Tahap 7 — auto-detect: ask the gateway which models it serves.
   * Falls back to the capabilities document when /v1/models is unavailable.
   */
  public async listModels(): Promise<string[]> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: { id?: string }[] };
        const ids = (body.data || []).map((m) => m?.id).filter((id): id is string => Boolean(id));
        if (ids.length > 0) return ids;
      }
    } catch {
      // fall through to capabilities
    }
    const caps = await this.capabilities();
    return caps.model ? [caps.model] : [];
  }

  public async startRun(params: StartRunParams): Promise<StartRunResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Hermes startRun error: ${res.status} ${res.statusText}`);
    return (await res.json()) as StartRunResponse;
  }

  public async getRunStatus(runId: string): Promise<HermesRunStatus> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Hermes getRunStatus error: ${res.status} ${res.statusText}`);
    return (await res.json()) as HermesRunStatus;
  }

  public async resolveApproval(
    runId: string,
    decision: 'once' | 'deny'
  ): Promise<{ status: string; decision: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}/approval`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) throw new Error(`Hermes resolveApproval error: ${res.status} ${res.statusText}`);
    return (await res.json()) as { status: string; decision: string };
  }

  public async stopRun(runId: string): Promise<{ status: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}/stop`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Hermes stopRun error: ${res.status} ${res.statusText}`);
    return (await res.json()) as { status: string };
  }

  public async streamEvents(
    runId: string,
    onEvent: (event: string, data: unknown) => void,
    timeoutMs: number = 900000
  ): Promise<() => void> {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort('timeout');
    }, timeoutMs);

    fetch(`${this.baseUrl}/v1/runs/${runId}/events`, {
      headers: { Authorization: 'Bearer ' + this.key },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.body) {
          if (!controller.signal.aborted) {
            onEvent('stream.dropped', { reason: 'No response body' });
          }
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (!controller.signal.aborted) {
              onEvent('stream.dropped', { reason: 'Unexpected EOF mid-stream' });
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.substring(6));
                onEvent(parsed.event || 'message', parsed.data || parsed);
              } catch {
                // Ignore parse errors on malformed chunks
              }
            }
          }
        }
      })
      .catch((err) => {
        if (controller.signal.aborted && controller.signal.reason === 'timeout') {
          onEvent('run.failed', {
            error: new HermesTimeoutError(`Hermes stream timed out after ${timeoutMs}ms`).message,
          });
        } else if (!controller.signal.aborted) {
          onEvent('stream.dropped', { error: String(err) });
        }
      })
      .finally(() => {
        clearTimeout(timeoutTimer);
      });

    return () => {
      clearTimeout(timeoutTimer);
      controller.abort();
    };
  }

  /**
   * Helper to run task execution with timeout (default 900000ms / 15 minutes)
   */
  public async runWithTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number = 900000
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new HermesTimeoutError(`Hermes task execution timed out after ${timeoutMs}ms`)),
        { once: true }
      );
    });

    try {
      return await Promise.race([fn(controller.signal), abortPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Tahap 19 — jalur tanpa sesi memakai batas chat yang sama seperti sesi:
   * stream kosong diperlakukan sebagai galat, bukan balasan sukses hampa.
   */
  public async chatStream(
    messages: ChatRequestMessage[],
    onChunk: (chunk: string) => void,
    model?: string,
    /** Fase 1 — identitas agen. Dipasang sebagai pesan system PERTAMA tanpa
     *  menyentuh riwayat; tanpa identitas `messages` dikirim persis seperti aslinya. */
    systemPrompt?: string
  ): Promise<void> {
    const controller = new AbortController();
    const ttfbTimer = setTimeout(() => controller.abort('ttfb'), this.chatTtfbMs);
    const totalTimer = setTimeout(() => controller.abort('total'), this.chatTimeoutMs);
    const timeoutError = () => {
      const why = String(controller.signal.reason ?? '');
      return new HermesTimeoutError(
        why === 'ttfb'
          ? `Hermes chat timed out: no reply for ${this.chatTtfbMs}ms`
          : `Hermes chat timed out after ${this.chatTimeoutMs}ms`
      );
    };
    let received = 0;

    try {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            model: model || 'hermes-agent',
            messages: systemPrompt
              ? [{ role: 'system', content: systemPrompt }, ...messages]
              : messages,
            stream: true,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw timeoutError();
        throw err;
      }
      // Tahap 12 — a rejected completion (e.g. the gateway refuses image parts)
      // must surface its own message instead of a silently empty stream.
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`Hermes chat error: ${res.status} ${res.statusText} ${text}`.trim());
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          onChunk(decoder.decode(value));
        }
      } catch (err) {
        if (controller.signal.aborted) throw timeoutError();
        throw err;
      }
      // Celah yang sama seperti sessionChatStream: sinyal bisa sudah abort
      // sementara pembacaan berakhir normal. Tanpa pemeriksaan ini, timeout
      // terbaca sebagai "stream kosong 0 byte".
      if (controller.signal.aborted) throw timeoutError();
      if (received === 0) {
        throw new Error('Gateway menutup stream chat tanpa balasan apa pun (0 byte dari provider).');
      }
    } finally {
      clearTimeout(ttfbTimer);
      clearTimeout(totalTimer);
    }
  }

  /**
   * Tahap 8 — sessions: history and memory live on the gateway, so an agent's
   * chat survives reloads, restarts and redeploys without a local copy.
   */
  public async createSession(label?: string): Promise<string | null> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(label ? { label } : {}),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { session?: { id?: string } };
      return body?.session?.id ?? null;
    } catch {
      return null;
    }
  }

  public async getSessionMessages(sessionId: string): Promise<HermesSessionMessage[]> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=500`,
      { headers: this.headers() }
    );
    if (!res.ok) {
      throw new Error(`Hermes session messages error: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { data?: HermesSessionMessage[] };
    return (body.data || [])
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          !m.tool_call_id &&
          !m.tool_name &&
          typeof m.content === 'string'
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Tahap 19 — dua batas waktu terpisah untuk satu giliran chat.
   * Sebelumnya `HERMES_TIMEOUT_MS` (30 dtk) dipakai untuk SEMUA panggilan
   * gateway termasuk stream chat, sehingga giliran yang butuh lebih dari 30
   * detik mati di tengah jalan (terukur di produksi: request 08:49:41,
   * diputus tepat 30,0 detik kemudian). `chatTtfbMs` menangkap gateway yang
   * diam tanpa balasan; `chatTimeoutMs` memberi ruang untuk giliran lambat
   * yang tetap berjalan.
   */
  public async sessionChatStream(
    sessionId: string,
    message: ChatMessageContent,
    onDelta: (delta: string) => void,
    _model?: string,
    /** Fase 1 — identitas agen, diteruskan sebagai `system_message`. Gateway
     *  membacanya di `_prepare_session_chat`; riwayat sesi tidak tersentuh. */
    systemPrompt?: string
  ): Promise<void> {
    const controller = new AbortController();
    const ttfbTimer = setTimeout(() => controller.abort('ttfb'), this.chatTtfbMs);
    const totalTimer = setTimeout(() => controller.abort('total'), this.chatTimeoutMs);
    /** Peristiwa PERTAMA apa pun membuktikan gateway masih hidup. Peristiwa
     * kemudian tidak boleh ikut membatalkan: bila timer dicabut lagi,
     * `clearTimeout(ttfbTimer)` yang sudah dipanggil tidak berpengaruh — tapi
     * anggapan "gateway merespons" tidak boleh diperbarui oleh peristiwa yang
     * datang setelah gateway berhenti mengirim. Karena `disarmTtfb` dipanggil
     * satu kali oleh peristiwa pertama, `handleFrame` memakai flag ini. */
    let ttfbArmed = true;
    const disarmTtfb = () => {
      if (!ttfbArmed) return;
      ttfbArmed = false;
      clearTimeout(ttfbTimer);
    };
    let delivered = 0;
    /** Teks lengkap dari `assistant.completed` — satu-satunya salinan bila delta hilang. */
    let completedText = '';

    const timeoutError = () => {
      const why = String(controller.signal.reason ?? '');
      return new HermesTimeoutError(
        why === 'ttfb'
          ? `Hermes chat timed out: no gateway event for ${this.chatTtfbMs}ms`
          : `Hermes chat timed out after ${this.chatTimeoutMs}ms`
      );
    };

    try {
      let res: Response;
      try {
        res = await this.fetchWithTimeout(
          `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`,
          {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(
              systemPrompt ? { message, system_message: systemPrompt } : { message }
            ),
            signal: controller.signal,
          }
        );
      } catch (err) {
        if (controller.signal.aborted) throw timeoutError();
        throw err;
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`Hermes session chat error: ${res.status} ${res.statusText} ${text}`.trim());
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: string | null = null;

      /**
       * Pemecah frame yang tahan pada dua gaya penulisan: peristiwa dipisah
       * `\n\n` (SSE ketat) MAUPUN `\n` berurutan (dipakai uji dan sebagian
       * penerbit). Sebelum Tahap 19 hanya `\n\n` yang dipakai, sehingga satu
       * peristiwa menumpuk di `buffer` dan peristiwa pendukungnya — termasuk
       * `assistant.completed` yang membawa jawaban UTUH — tidak pernah
       * sampai ke `handleFrame`. Gejalanya: pemulihan jawaban diam-diam tidak
       * pernah bekerja.
       *
       * Blok terakhir yang berakhir tepat `\n\n` (tanpa peristiwa berikutnya)
       * wajib ikut keluar; kalau tidak, peristiwa `error` yang menutup stream
       * tertinggal di buffer dan pengguna hanya melihat "stream kosong".
       */
      const takeFrames = (): string[] => {
        const raw = buffer;
        if (!raw.trim()) {
          buffer = '';
          return [];
        }
        const pieces = raw.split('\n\n');
        const last = pieces.pop() || '';
        // Potongan terakhir baru dikembalikan bila bloknya lengkap —
        // berakhir dengan baris kosong (`\n` terakhir). Blok yang masih
        // terpotong di tengah peristiwa menunggu data berikutnya.
        const complete = raw.endsWith('\n');
        buffer = complete ? '' : last;
        if (complete && last.trim()) pieces.push(last);
        return pieces.filter((f) => f.trim());
      };

      const handleFrame = (frame: string) => {
        const lines = frame.split('\n');
        let event = '';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.substring(7).trim();
          else if (line.startsWith('data: ')) data = line.substring(6);
        }
        if (!event || !data) return;
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          return;
        }
        disarmTtfb();
        if (event === 'assistant.delta') {
          const delta = parsed.delta;
          if (typeof delta === 'string' && delta) {
            delivered += delta.length;
            onDelta(delta);
          }
        } else if (event === 'assistant.completed') {
          // Peristiwa terminal gateway: membawa jawaban UTUH. Delta yang hilang
          // di tengah transport masih bisa dipulihkan dari salinan ini.
          const content = parsed.content;
          if (typeof content === 'string') completedText = content;
        } else if (event === 'error' || event === 'run.failed') {
          streamError = String(
            (parsed.error as { message?: string } | undefined)?.message ||
              parsed.message ||
              parsed.error ||
              event
          );
        }
      };

      /**
       * Tahap 19 — `AbortSignal` membatalkan `fetch()`, tetapi TIDAK
       * membatalkan `reader.read()` yang sedang menunggu. Dibuktikan terpisah
       * (probe: abort menyala di 110 ms, `read()` masih menggantung setelah
       * 2 detik). Tanpa balapan ini, klien berhenti berfungsi selamanya ketika
       * timer TTFB/total mematikan.
       *
       * Prioritas: bacaan yang selesai normal menang. Balapan hanya aktif
       * selama pembacaan tertunda; begitu stream berakhir sendiri (misalnya
       * berisi peristiwa `error`), balapan dibatalkan lebih dulu sehingga
       * `streamError` tetap yang dilempar, bukan galat abrasi.
       */
      const abortRace = <T>(p: Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          let settled = false;
          const onAbort = () => {
            if (settled) return;
            settled = true;
            reject(timeoutError());
          };
          const disarm = () => {
            controller.signal.removeEventListener('abort', onAbort);
          };
          if (controller.signal.aborted) {
            onAbort();
            return;
          }
          controller.signal.addEventListener('abort', onAbort, { once: true });
          p.then(
            (v) => {
              settled = true;
              disarm();
              resolve(v);
            },
            (e) => {
              settled = true;
              disarm();
              reject(e);
            }
          );
        });

      try {
        while (true) {
          const { done, value } = await abortRace(reader.read());
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (const frame of takeFrames()) handleFrame(frame);
        }
      } catch (err) {
        if (controller.signal.aborted) throw timeoutError();
        throw err;
      }
      for (const frame of takeFrames()) handleFrame(frame);

      // `streamError` didahulukan dari "0 byte": bila gateway menyebut
      // alasannya sendiri, pesan itulah yang harus sampai ke pengguna —
      // "0 byte dari provider" akan menutupi penyebab sebenarnya.
      if (streamError) throw new Error(streamError);

      // `AbortSignal` membatalkan fetch, TETAPI tidak membatalkan
      // `reader.read()` yang sedang menunggu — dibuktikan: timer menyala di
      // 134 ms, pembacaan baru berhenti saat saluran menutup di 418 ms. Karena
      // itu pembatalan diperiksa sendiri SESUDAH pembacaan berakhir; tanpa
      // pemeriksaan ini, jalur "0 byte" di bawah menang dan pengguna melihat
      // "stream kosong" padahal penyebab sebenarnya adalah timeout.
      if (controller.signal.aborted) throw timeoutError();

      // Stream selesai TANPA satu huruf pun: jangan kembalikan "sukses" hampa —
      // itulah yang membuat bubble chat kosong tanpa keterangan apa pun.
      if (delivered === 0) {
        if (completedText.trim()) {
          onDelta(completedText);
          return;
        }
        throw new Error('Gateway menutup stream tanpa balasan apa pun (0 byte dari provider).');
      }
    } finally {
      clearTimeout(ttfbTimer);
      clearTimeout(totalTimer);
    }
  }

  /** Tahap 8 — skills installed on the gateway. */
  public async listSkills(): Promise<unknown[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/skills`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) message = body.error.message;
      } catch {
        // keep the status line
      }
      throw new Error(message);
    }
    const body: unknown = await res.json();
    if (Array.isArray(body)) return body;
    const asRecord = body as { data?: unknown[]; skills?: unknown[] };
    return asRecord?.data || asRecord?.skills || [];
  }
}
