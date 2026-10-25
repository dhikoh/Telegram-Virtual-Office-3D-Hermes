-- Migrasi 013: Indeks run nyangkut (Fix Run Reliability)
--
-- 7 run berstatus 'running' tanpa finished_at tertahan di produksi (25 Okt 2026):
-- stream gateway mati, UI menampilkan "sedang mengetik..." selamanya. Reaper
-- (services/agent-chat/stale-run-reaper.ts) menutup run yang sudah mati menjadi
-- 'interrupted' — indeks ini membuat query reaper O(log n), bukan table scan,
-- karena dijalankan setiap server start dan setiap kali stream chat ditutup.

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_started
  ON agent_runs(status, started_at);

-- Satu task per run untuk jalur CHAT: jaring pengaman tingkat database untuk
-- materialisasi task (T3), supaya backfill atau reattach yang terpicu dua kali
-- tidak menggandakan task untuk run yang sama.
--
-- PENTING — dibatasi ke source='chat'. Indeks UNIQUE atas run_id saja TIDAK
-- bisa dipakai: task orkestrator (skill install/uninstall, cron) berbagi
-- run_id gateway yang sama saat gateway memulangkan id duplikat, dan UNIQUE
-- global membuat INSERT task kedua GAGAL total — runTask melempar, task
-- tertinggal 'queued' selamanya. Yang dijamin benar-benar satu per run hanyalah
-- task yang DIMATERIALKAN dari sebuah giliran chat, dan itu punya source 'chat'.
--
-- run_id NULL (task manual) tidak pernah masuk indeks partial ini.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_run_id_chat_unique
  ON tasks(run_id)
  WHERE run_id IS NOT NULL AND source = 'chat';
