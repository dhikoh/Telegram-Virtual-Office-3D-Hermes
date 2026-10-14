-- 007_projects.sql — Tahap 14: proyek & orkestrasi subtask berdependensi (DAG).
--
-- projects : satu baris = satu tujuan pemilik yang dipecah orkestrator menjadi
--            subtask berantai. status sengaja terbatas pada lima nilai ini agar
--            UI dan rantai eksekusi tidak perlu menebak status apa pun.
--              draft    proyek dibuat, dekomposisi belum menghasilkan subtask
--                       (atau gagal — rincian jujur ada di decompose_error)
--              running  ada subtask yang dieksekusi / menunggu giliran
--              blocked  berhenti karena menunggu persetujuan (approval gate)
--              done     semua subtask selesai, ringkasan final tersimpan
--              failed   ada subtask gagal — rantai berhenti, tidak ada
--                       dependent yang dijalankan
--
-- decompose_error : pesan apa adanya dari orkestrator/gateway bila pecahan tidak
--            bisa dibaca (teks bebas, bukan JSON, gateway mati). Tidak pernah
--            diisi teks karangan.
--
-- tasks.project_id  : subtask milik proyek mana (NULL untuk tugas biasa).
-- tasks.depends_on  : JSON array of task_id (mis. ["task_a","task_b"]).
--            Kosong / NULL = subtask akar yang boleh jalan lebih dulu.
--            Karena urutan dependensi hanya boleh menunjuk ke subtask yang
--            sudah didefinisikan sebelumnya, graf bebas siklus secara konstruksi
--            (dipotong lagi oleh cek topologi di services/projects.ts).

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'blocked', 'done', 'failed')),
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  summary TEXT,
  decompose_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

ALTER TABLE tasks ADD COLUMN project_id TEXT;
ALTER TABLE tasks ADD COLUMN depends_on TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
