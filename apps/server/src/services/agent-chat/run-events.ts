/**
 * Fase 2b — penerjemah peristiwa Runs API menjadi bingkai chat untuk klien.
 *
 * Jalur chat lama memakai stream sesi. Bila klien putus (tutup panel, sinyal
 * lemah, Cloudflare di ~100 detik), stream itu mati BERSAMA pekerjaannya:
 * production 19 Okt mencatat run Orion batal persis seperti ini.
 *
 * Runs API berbeda sifatnya: `POST /v1/runs` MENAMPAKKAN pekerjaan (202 +
 * run_id), lalu peristiwa dibaca dari `GET /v1/runs/{id}/events` yang bisa
 * disambung ulang dengan `?seq=`. Klien boleh pergi; pekerjaan tetap jalan.
 *
 * Modul ini murni: memetakan peristiwa gateway ke bingkai, tanpa jaringan,
 * tanpa timer. Semua keputusan waktu ada di pemanggilnya.
 */
import type { ChatFrame } from './types.js';

/** Peristiwa terminal Runs API (api_server_runs.terminal_run_status). */
const TERMINAL_EVENTS = new Set(['run.completed', 'run.failed', 'run.cancelled', 'run.interrupted']);

export function isTerminalRunEvent(event: string): boolean {
  return TERMINAL_EVENTS.has(event);
}

/**
 * Terjemahkan satu peristiwa Runs API menjadi nol atau satu bingkai untuk
 * klien.
 *
 * Kontrak yang dipetakan (bukan karangan — dibaca dari api_server_runs.py):
 *  - `message.delta`  → `{ delta }`  : potongan jawaban yang mengalir.
 *  - `message.interim`→ diabaikan   : komentar menengah giliran, sudah
 *                                      terkirim bila `already_streamed`, dan
 *                                      jawaban akhir tetap lewat `run.completed`.
 *  - `run.completed`  → `[DONE]`     : penutup stream OpenAI-compatible.
 *  - `run.failed`/`run.cancelled`/`run.interrupted` → frame galat yang
 *    JELAS, bukan stream yang ditutup diam-diam (D di tujuan Fase).
 *  - `approval.request` → diabaikan di sini; jalurnya `POST
 *    /v1/runs/{id}/approval`, bukan bingkai chat.
 *
 * @returns bingkai yang harus ditulis, atau null bila peristiwa tidak
 *          membawa apa pun untuk klien.
 */
export function runEventToChatFrame(event: string, data: unknown): ChatFrame | null {
  const payload = (data || {}) as Record<string, unknown>;

  if (event === 'message.delta') {
    const delta = typeof payload.delta === 'string' ? payload.delta : '';
    if (!delta) return null;
    return { kind: 'content', text: delta };
  }

  if (event === 'run.completed') {
    return { kind: 'done' };
  }

  if (isTerminalRunEvent(event)) {
    const error =
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : event === 'run.cancelled'
          ? 'Pekerjaan dibatalkan.'
          : 'Pekerjaan berhenti tanpa jawaban lengkap.';
    return { kind: 'error', message: error };
  }

  return null;
}

/**
 * Kumpulkan seluruh delta menjadi satu jawaban utuh.
 *
 * `run.completed` di Runs API TIDAK selalu membawa teks utuh, berbeda dengan
 * `assistant.completed` di jalur sesi — jadi salinan yang disimpan adalah
 * gabungan delta, bukan satu peristiwa tunggal.
 */
export class DeltaCollector {
  private parts: string[] = [];

  push(text: string): void {
    if (text) this.parts.push(text);
  }

  get text(): string {
    return this.parts.join('');
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }
}
