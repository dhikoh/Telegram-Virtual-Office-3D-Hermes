-- 008_agent_skills.sql — Tahap 11 (bagian 2): toggle skill aktif per agen (layer SOUL).
--
-- Kenapa TABEL, bukan kolom JSON di `agents`:
--   1. Kunci kombinasi (agent_id, skill) membuat satu lookup indeks untuk
--      "apakah skill X mati untuk agen Y?" tanpa mem-parse ulang JSON.
--   2. ON DELETE CASCADE membersihkan baris saat agen dihapus dari roster —
--      kolom JSON tidak punya hubungan dengan tabel `agents`.
--   3. Toggle satu skill menulis satu baris, bukan rewrite seluruh dokumen
--      JSON (aman kalau dua layar menyimpan bersamaan).
--
-- SEMANTIK (wajib dibaca sebelum menulis query):
--   * BARIS ADA  = skill itu DIMATIKAN untuk agen tersebut.
--   * TIDAK ADA BARIS = skill AKTIF (bawaan / default).
--   * Tabel sengaja TIDAK di-seed apa pun: agen tanpa baris berarti SELURUH
--     skill katalog aktif untuk agen itu. Skill yang baru diinstal ke gateway
--     ikut aktif otomatis karena tidak punya baris.
--   * `updated_at` epoch ms — jejak kapan terakhir diubah (ikut audit log).

CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, skill),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
