-- Tahap 8 — riwayat chat nyata:
-- Tiap agen dititipkan ke sebuah sesi di gateway Hermes; riwayat, memori, dan
-- token usage tersimpan di sana. Kolom ini hanya menunjuk sesi tersebut.
ALTER TABLE agents ADD COLUMN session_id TEXT;
