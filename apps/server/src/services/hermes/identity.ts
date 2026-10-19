/**
 * Fase 1 — Jembatan Identitas Agen.
 *
 * Aplikasi adalah pemilik identitas agen (tabel `agents`); Hermes hanya otak
 * yang menjawab. Karena gateway tidak punya sakelar per agen (lihat
 * `skill-scope.ts`), satu-satunya jembatan adalah teks yang aplikasi kirim
 * bersama giliran chat — di sini sebagai system prompt.
 *
 * Dikirim HANYA bila nama atau peran terisi. Agen tanpa identitas tetap
 * bersikap seperti sebelumnya: tidak ada system prompt kosong yang disuntikkan
 * ke percakapan yang sedang berjalan.
 */

/** Bentuk minimum yang dibaca dari record agen — sengaja tidak memakai tipe
 *  penuh `Agent` supaya fungsi ini bisa dipakai oleh repo, route, maupun test
 *  tanpa menarik seluruh schema. */
export interface AgentIdentityInput {
  name?: string | null;
  role?: string | null;
  department?: string | null;
  soul_summary?: string | null;
}

/**
 * Bangun teks identitas untuk system prompt.
 * @returns null bila nama kosong — tidak ada identitas untuk disebut.
 */
export function buildAgentIdentity(agent: AgentIdentityInput): string | null {
  const name = agent.name?.trim();
  if (!name) return null;

  const lines: string[] = [`Kamu adalah ${name}.`];

  const role = agent.role?.trim();
  if (role) lines.push(`Peran: ${role}.`);

  const dept = agent.department?.trim();
  if (dept) lines.push(`Ruang kerja: ${dept}.`);

  const soul = agent.soul_summary?.trim();
  if (soul) lines.push(`Tugasmu: ${soul}`);

  lines.push(
    'Kenali dirimu sendiri dari identitas ini — jangan pernah bertanya siapa nama atau peranmu.',
    'Jawab sesuai peran tersebut.'
  );

  return lines.join('\n');
}
