-- 009_media_task_artifact_index.sql — artefak otomatis dari stream run.
--
-- Jalur baru (dispatcher -> services/artifacts.ts) mendaftarkan berkas hasil run
-- sebagai baris media kind='artifact' yang bertaut ke task_id, sehingga retensi
-- Tahap 12 (umur + cap MB) otomatis berlaku tanpa penyimpanan kedua.
--
-- GET /api/tasks kini mengambil artefak per task dan broadcast `task_update`
-- menyertakan task.artifacts pada status terminal — keduanya mencari media
-- BERDASARKAN task_id. Tanpa indeks ini setiap poll memindai seluruh tabel
-- media (bisa berisi ratusan baris retensi 30 hari).

CREATE INDEX IF NOT EXISTS idx_media_task_id ON media(task_id);
