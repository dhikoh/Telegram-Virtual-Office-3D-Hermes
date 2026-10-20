-- Migrasi 012: Visibilitas Task & Runs (Fase 4)
-- Menambahkan kolom asal usul task ('source') dan penghitung pemanggilan tool ('tool_calls_count'),
-- serta indeks untuk percepatan lookup task berdasarkan run_id dan source.

ALTER TABLE tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE tasks ADD COLUMN tool_calls_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_run_id ON tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);
