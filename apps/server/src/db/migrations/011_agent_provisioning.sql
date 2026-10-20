-- Migrasi 011: Status provisioning profil Hermes per agen (Fase 3)
-- Memungkinkan setiap agen memiliki profil Hermes sendiri dengan SOUL.md terisolasi
-- dan pelacakan status provisioning ('unprovisioned' | 'provisioning' | 'ready' | 'failed').

ALTER TABLE agents ADD COLUMN provision_state TEXT NOT NULL DEFAULT 'unprovisioned';
ALTER TABLE agents ADD COLUMN provision_error TEXT;
ALTER TABLE agents ADD COLUMN provisioned_at INTEGER;
