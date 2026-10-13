-- 006_media.sql — Tahap 12: media chat & retensi.
--
-- Satu baris = satu berkas fisik di MEDIA_DIR (default: <data dir>/media).
--   kind='upload'   gambar yang pemilik kirim di chat (retensi pendek: 7 hari)
--   kind='artifact' keluaran agen, mis. video/gambar hasil run (30 hari)
--
-- path disimpan RELATIF terhadap MEDIA_DIR ('uploads/<id>.png') sehingga
-- direktori media bisa dipindah / di-volume-mount tanpa menulis ulang baris.
-- Retensi (umur + cap total MB) dijalankan sweepRetention() di services/media.ts.

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('upload', 'artifact')),
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  original_name TEXT,
  path TEXT NOT NULL,
  task_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
CREATE INDEX IF NOT EXISTS idx_media_agent_id ON media(agent_id);
