-- Migrasi 010: Tabel agent_runs dan agent_messages untuk Fase 2e (Persist Parsial)
-- Menyimpan setiap run obrolan dan potongan teks pesan secara persisten di SQLite
-- Menjaga konten parsial tetap utuh saat run terputus dan mendukung tombol Lanjutkan.

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  client_message_id TEXT,
  status TEXT NOT NULL, -- 'running' | 'completed' | 'failed' | 'cancelled'
  error_reason TEXT,
  model TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_client_message_id ON agent_runs(client_message_id);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  client_message_id TEXT,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- 'partial' | 'completed' | 'failed'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_agent_id ON agent_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_run_id ON agent_messages(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at);
