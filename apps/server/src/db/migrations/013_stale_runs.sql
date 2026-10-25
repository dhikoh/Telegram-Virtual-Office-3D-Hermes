-- Migrasi 013: Indeks run nyangkut (Fix Run Reliability)
--
-- 7 run berstatus 'running' tanpa finished_at tertahan di produksi (25 Okt 2026):
-- stream gateway mati, UI menampilkan "sedang mengetik..." selamanya. Reaper
-- (services/agent-chat/stale-run-reaper.ts) menutup run yang sudah mati menjadi
-- 'interrupted' — indeks ini membuat query reaper O(log n), bukan table scan,
-- karena dijalankan setiap server start dan setiap kali stream chat ditutup.

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_started
  ON agent_runs(status, started_at);

-- Satu task per run: jaring pengaman tingkat database untuk materialisasi task
-- (T3). Tanpa ini, backfill atau reattach yang terpicu dua kali bisa
-- menggandakan task untuk run yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_run_id_unique
  ON tasks(run_id)
  WHERE run_id IS NOT NULL;
