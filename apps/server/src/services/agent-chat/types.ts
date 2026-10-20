/**
 * Fase 2b — tipe bersama untuk jembatan chat Runs API.
 */

/**
 * Satu bingkai yang siap ditulis ke stream klien.
 *
 * Tiga kemungkinan, dan tidak ada yang keempat: teks yang mengalir, penutup
 * yang sah, atau kegagalan yang diakui dengan jujur. Sengaja tidak ada
 * " kosong" sebagai hasil — menutup stream tanpa penanda adalah penyakit yang
 * sedang diperbaiki (tujuan D pada rencana: tidak ada balasan terpotong
 * diam-diam).
 */
export type ChatFrame =
  | { kind: 'content'; text: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/**
 * Peristiwa Runs API yang direkam untuk pemutaran ulang.
 * `seq` diambil dari bingkai SSE gateway dan menjadi kunci sambung-ulang:
 * `GET /v1/runs/{id}/events?seq=N` melanjutkan dari peristiwa berikutnya.
 */
/**
 * Run chat yang sedang atau pernah berjalan, dibawa ke klien lewat
 * `x-run-id`. Klien menyimpannya dan memakai `?seq=` saat menyambung ulang.
 */
export interface RunHandle {
  runId: string;
  /** Papan tempat riwayat run ini bisa diputar ulang; bisa kosong. */
  hub?: 'chat';
}

export interface RecordedRunEvent {
  seq: number;
  event: string;
  data: unknown;
  ts: number;
}
