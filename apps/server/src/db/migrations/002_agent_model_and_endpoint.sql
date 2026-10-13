-- Tahap 7 — fondasi nyata:
-- 1. `model` pilihan per agen (sebelumnya hard-coded 'hermes-agent' di client).
-- 2. Nilai endpoint loopback yang tersimpan di baris agen (bawaan skema lama
--    'http://127.0.0.1:8642') dihapus; '' dianggap "belum diatur" dan kode
--    jatuh ke HERMES_BASE_URL server.
ALTER TABLE agents ADD COLUMN model TEXT;

UPDATE agents SET hermes_base_url = ''
WHERE hermes_base_url IN (
  'http://127.0.0.1:8642',
  'https://127.0.0.1:8642',
  'http://localhost:8642',
  'https://localhost:8642',
  'http://0.0.0.0:8642'
);
