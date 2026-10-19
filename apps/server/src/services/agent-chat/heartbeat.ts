/**
 * Fase 2a — detak (heartbeat) untuk stream chat.
 *
 * Masalahnya nyata dan terukur di produksi: Cloudflare memutus koneksi idle di
 * ~100 detik, sedangkan satu giliran yang sedang menjalankan tool bisa diam
 * jauh lebih lama dari itu. Klien melihat "balasan terpotong", padahal di sisi
 * server stream-nya belum pernah berhenti.
 *
 * Solusinya bukan memperpanjang timeout, tapi membuat koneksi itu sendiri
 * tidak pernah terlihat idle: frame komentar `: hb` — bentuk yang sah menurut
 * spesifikasi SSE, diabaikan oleh klien, dan tetap dihitung sebagai tulisan
 * oleh proxy.
 */
import { config } from '../../config.js';

/** Satu frame heartbeat. Komentar SSE: tidak pernah masuk ke parser klien. */
export const HEARTBEAT_FRAME = ': hb\n\n';

/**
 * Mulai memancarkan heartbeat tiap `intervalMs`.
 *
 * @returns fungsi berhenti. Idempoten — dipanggil berkali-kali aman, dan
 *          selalu dipanggil di blok `finally` route chat supaya timer tidak
 *          pernah tertinggal di belakang stream yang sudah selesai.
 */
export function startHeartbeat(intervalMs: number, write: (frame: string) => void): () => void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return () => {};

  const timer = setInterval(() => write(HEARTBEAT_FRAME), intervalMs);
  // Jangan pernah menahan proses Node tetap hidup hanya karena heartbeat.
  timer.unref?.();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}

/** Interval heartbeat dari konfigurasi (`CHAT_HEARTBEAT_MS`). */
export const chatHeartbeatMs = (): number => config.CHAT_HEARTBEAT_MS;
