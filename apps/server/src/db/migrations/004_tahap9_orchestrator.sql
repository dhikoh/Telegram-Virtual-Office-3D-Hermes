-- Tahap 9 — orkestrator sistem, arsip sesi, gaya avatar.
--
-- 1. is_system  : penanda agen sistem (orkestrator) — tidak bisa dihapus atau
--                 dinonaktifkan lewat API/UI.
-- 2. avatar_style: JSON ringan { shirt?, accessory? } untuk penyesuaian visual
--                 avatar pixel tanpa mengubah kolom emoji lama.
-- 3. agent_sessions: arsip sesi gateway per agen — saat Owner memulai "Sesi
--                 baru", sesi lama dicatat di sini (riwayatnya tetap ada di
--                 gateway; tabel ini menunjukkan bahwa sesi itu pernah ada).

ALTER TABLE agents ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN avatar_style TEXT;

CREATE TABLE IF NOT EXISTS agent_sessions (
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived_at INTEGER,
  PRIMARY KEY (agent_id, session_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Orkestrator sistem: asisten pribadi Owner, satu-satunya agen permanen.
-- hermes_base_url '' = ikut pengaturan server (semantik Tahap 7).
INSERT INTO agents (
  id, name, role, department, avatar, soul_summary,
  hermes_base_url, api_key_env, hermes_profile, active,
  hired_at, created_at, is_system
) VALUES (
  'agent_orchestrator',
  'Orion',
  'Asisten Owner & Orkestrator',
  'command',
  '👑',
  'Asisten pribadi Owner sekaligus orkestrator kantor: menerima instruksi langsung, memecah pekerjaan menjadi tugas untuk agen divisi, dan merangkum hasilnya.',
  '',
  'HERMES_KEY_DEFAULT',
  'default',
  1,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  1
);
