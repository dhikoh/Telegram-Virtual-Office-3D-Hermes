/**
 * Tahap 11 (bagian 2) — cakupan skill per agen, layer SOUL.
 *
 * JUJUR TENTANG GATEWAY: Hermes gateway TIDAK punya sakelar skill per sesi /
 * per agen. `POST /api/sessions` hanya menerima label/end_reason, dan
 * `POST /v1/runs` `instructions` justru MENG-override instruksi default
 * (berisiko menimpa SOUL.md), jadi keduanya tidak dipakai untuk ini.
 *
 * Satu-satunya tuas yang benar-benar dimiliki aplikasi adalah teks yang
 * DIKIRIM aplikasi ke gateway. Karena itu sakelar di lapisan SOUL diwujudkan
 * sebagai instruksi cakupan skill yang ikut dalam setiap giliran chat:
 *  - jalur sesi (`/api/sessions/{id}/chat/stream`) — satu-satunya field yang
 *    diterima gateway adalah pesan, jadi instruksi menempel di pesan keluar;
 *  - jalur stateless (`/v1/chat/completions`) — memakai `role: 'system'`
 *    yang asli, tanpa menyentuh riwayat.
 *
 * Pesan sesi yang sudah diberi prefiks DIBERSIHKAN KEMBALI saat riwayat
 * dibaca (stripSkillScope) supaya pemilik melihat pesan miliknya apa adanya.
 * Prefiksnya sendiri deterministik — tidak ada konten yang dikarang atau
 * dihapus selain garis yang ditambahkan aplikasi ini sendiri.
 */

/** Penanda garis yang ditambahkan aplikasi (dipakai strip saat membaca riwayat). */
export const SKILL_SCOPE_MARKER = '[CAKUPAN SKILL AGEN:';

const SKILL_SCOPE_RE = /^\[CAKUPAN SKILL AGEN:[^\]]*\]\s*/;

/**
 * Bangun instruksi cakupan skill.
 * @param enabled  daftar skill AKTIF untuk agen (null bila katalog tak bisa dibaca)
 * @param disabled daftar skill yang dimatikan pemilik (dari tabel agent_skills)
 * @returns null bila tidak ada pembatasan — pesan dikirim persis seperti biasa.
 */
export function buildSkillScopeDirective(
  enabled: string[] | null,
  disabled: string[]
): string | null {
  if (disabled.length === 0) return null;

  if (enabled && enabled.length > 0) {
    return (
      `${SKILL_SCOPE_MARKER} ${enabled.join(', ')}. ` +
      'Hanya gunakan skill yang tercantum di daftar ini; skill lain NONAKTIF untuk agen ini. ' +
      'Bila skill itu tidak ada, lanjutkan tanpa memakainya.]'
    );
  }

  // Katalog tidak terbaca / semua skill dimatikan: sebut yang dilarang apa adanya.
  return (
    `${SKILL_SCOPE_MARKER} jangan gunakan skill berikut: ${disabled.join(', ')}. ` +
    'Skill lain boleh dipakai.]'
  );
}

/** Pasang instruksi pada pesan keluar. Idempoten — tidak pernah menggandakan. */
export function applySkillScope(message: string, directive: string | null): string {
  if (!directive) return message;
  if (SKILL_SCOPE_RE.test(message)) return message;
  return `${directive}\n\n${message}`;
}

/** Hapus instruksi aplikasi dari konten yang dibaca kembali dari gateway. */
export function stripSkillScope(content: string): string {
  if (!content.startsWith(SKILL_SCOPE_MARKER)) return content;
  return content.replace(SKILL_SCOPE_RE, '');
}
