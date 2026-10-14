/**
 * Galat dari `api`/`request()` membawa bodi JSON server di ujung pesannya
 * (mis. `HTTP 409: {"message":"…"}`). Dua modal di layar More — SkillsModal dan
 * AgentSkillScope — butuh pesan server apa adanya (409/400/404), bukan teks
 * teknis; dulu keduanya menyalin fungsi yang sama. Sekarang satu salinan.
 *
 * Tidak pernah melempar: kalau badan bukan JSON, pesan mentah dikembalikan.
 */
export function serverMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const start = raw.indexOf('{');
  if (start >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as { message?: string; error?: string };
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
    } catch {
      // bukan JSON — pakai pesan mentah
    }
  }
  return raw;
}
