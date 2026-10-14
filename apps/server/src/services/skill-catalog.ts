import { getServerHermesClient } from './hermes/index.js';

/**
 * Tahap 8/11 — katalog skill gateway sebagai satu sumber kebenaran.
 *
 * Dipakai dua rute:
 *  - GET  /api/skills            (layar Kemampuan)
 *  - GET/PATCH /api/agents/:id/skills (toggle skill per agen — Tahap 11)
 * Guardrail "nama skill wajib ada di katalog" sengaja berbagi fungsi ini
 * supaya keduanya tidak bisa menyimpang satu sama lain.
 */

export interface NormalizedSkill {
  name: string;
  description: string;
  enabled?: boolean;
  source: string;
}

/** Beberapa versi gateway membalas {data:[...]} atau {skills:[...]} — dinormalkan. */
export function normalizeSkill(raw: unknown): NormalizedSkill {
  const s = (raw ?? {}) as Record<string, unknown>;
  const name =
    (typeof s.name === 'string' && s.name) ||
    (typeof s.slug === 'string' && s.slug) ||
    (typeof s.id === 'string' && s.id) ||
    'skill';
  const description =
    (typeof s.description === 'string' && s.description) ||
    (typeof s.summary === 'string' && s.summary) ||
    '';
  return {
    name,
    description,
    enabled: typeof s.enabled === 'boolean' ? s.enabled : undefined,
    source: 'gateway',
  };
}

export interface GatewayCatalog {
  /** Nama persis seperti yang dilaporkan gateway. */
  names: string[];
  skills: NormalizedSkill[];
  /** false bila gateway tak bisa mendaftar skill — pemeriksaan nama dilewati. */
  ok: boolean;
  /** Galat gateway apa adanya (bukan teks karangan). */
  error: string | null;
}

/** Nama skill yang benar-benar terpasang di gateway. */
export async function readGatewayCatalog(): Promise<GatewayCatalog> {
  try {
    const skills = await getServerHermesClient().listSkills();
    const normalized = skills.map((s) => normalizeSkill(s));
    return { names: normalized.map((s) => s.name), skills: normalized, ok: true, error: null };
  } catch (err) {
    return {
      names: [],
      skills: [],
      ok: false,
      error: String((err as Error)?.message || err),
    };
  }
}

/**
 * Cache singkat untuk jalur chat: setiap giliran chat tidak boleh menambah
 * satu panggilan gateway hanya untuk menyusun daftar skill aktif. Hanya agen
 * yang punya skill dimatikan yang membaca cache ini (agen lain berhenti di
 * baris kosong tabel agent_skills). PATCH /api/agents/:id/skills menghapusnya.
 */
const CATALOG_CACHE_TTL_MS = 60_000;
let catalogCache: { at: number; value: GatewayCatalog } | null = null;

export async function readGatewayCatalogCached(): Promise<GatewayCatalog> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_CACHE_TTL_MS) {
    return catalogCache.value;
  }
  const value = await readGatewayCatalog();
  catalogCache = { at: Date.now(), value };
  return value;
}

/** Panggil setelah pemilik mengubah cakupan skill agar katalog dibaca ulang. */
export function invalidateGatewayCatalogCache(): void {
  catalogCache = null;
}
