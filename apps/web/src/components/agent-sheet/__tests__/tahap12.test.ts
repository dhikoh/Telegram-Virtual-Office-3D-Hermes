/**
 * Tahap 12 acceptance — media chat & retensi (wiring UI + kontrak API).
 *
 * Perilaku rute (multipart 415/413, sweep retensi, audit) dicakup oleh
 * apps/server/src/tahap12.test.ts. Test ini mengunci sisi web:
 *  - tombol lampiran Paperclip + input file accept image/* di bar chat;
 *  - uploadChatImage memakai FormData (bukan helper JSON) dan menampilkan
 *    peringatan gateway_error apa adanya;
 *  - api.ts punya daftar media + URL unduh artefak;
 *  - batas 8MB dicek di klien sebelum unggah.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const chat = read('../AgentSheetChat.tsx');
const api = read('../../../services/api.ts');
const routes = read('../../../../../server/src/routes/media.ts');
const migration = read('../../../../../server/src/db/migrations/006_media.sql');
const mediaService = read('../../../../../server/src/services/media.ts');

describe('lampiran gambar di chat', () => {
  it('menyediakan tombol klip kertas dan input file khusus gambar', () => {
    expect(chat).toContain('Paperclip');
    expect(chat).toContain('data-testid="chat-attach-button"');
    expect(chat).toContain('data-testid="chat-image-input"');
    expect(chat).toContain('accept="image/png,image/jpeg,image/webp,image/gif"');
  });

  it('mengunggah lewat uploadChatImage dan menampilkan bubble gambar + pesan lampiran', () => {
    expect(chat).toContain('api.uploadChatImage(agent.id, file)');
    expect(chat).toContain("content: '[gambar terlampir]'");
    expect(chat).toContain('data-testid="chat-image-attachment"');
    expect(chat).toContain('mediaId: media.id');
  });

  it('memperlihatkan galat gateway apa adanya, bukan menyembunyikannya', () => {
    expect(chat).toContain('media.gateway_error');
    expect(chat).toContain('data-testid="media-gateway-error"');
    expect(chat).toContain('gateway menolak:');
    expect(api).toContain('gateway_error?: string');
  });

  it('menolak berkas non-gambar dan yang melebihi 8MB sebelum unggah', () => {
    expect(chat).toContain("file.type.startsWith('image/')");
    expect(chat).toContain('MAX_IMAGE_MB');
    expect(chat).toContain('MAX_IMAGE_MB * 1024 * 1024');
  });
});

describe('api.ts Tahap 12', () => {
  it('mengunggah dengan FormData dan tanpa Content-Type JSON', () => {
    expect(api).toContain('new FormData()');
    expect(api).toContain("form.append('file', file");
    expect(api).toContain('/media`');
    // helper request() selalu menyetel application/json — upload tidak boleh lewat sana
    expect(api).toContain('uploadChatImage: async (agentId: string, file: File)');
  });

  it('membaca daftar media dan membangun URL unduh artefak', () => {
    expect(api).toContain('getMediaList: (agentId: string)');
    expect(api).toContain('/media?agent_id=');
    expect(api).toContain('artifactDownloadUrl: (id: string)');
    expect(api).toContain('/artifacts/');
  });
});

describe('server Tahap 12 (kontrak sumber)', () => {
  it('route media menolak mime asing (415) dan berkas kebesaran (413)', () => {
    expect(routes).toContain("'image/png', 'image/jpeg', 'image/webp', 'image/gif'");
    expect(routes).toContain('415');
    expect(routes).toContain('413');
    expect(routes).toContain("'payload_too_large'");
    expect(routes).toContain("'unsupported_media_type'");
  });

  it('meneruskan gambar sebagai content part dan melaporkan galat gateway', () => {
    expect(routes).toContain("type: 'image_url'");
    expect(routes).toContain('base64');
    expect(routes).toContain('gateway_error');
    expect(routes).toContain("text: '[gambar terlampir]'");
  });

  it('sweep retensi mencatat audit dan membuang yang paling tua saat cap terlampaui', () => {
    expect(mediaService).toContain("'media.retention_sweep'");
    expect(mediaService).toContain('imageRetentionDays');
    expect(mediaService).toContain('artifactRetentionDays');
    expect(mediaService).toContain('capBytes');
    expect(mediaService).toContain('paling tua');
  });

  it('migrasi 006 membuat tabel media dengan CHECK kind dan index created_at', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS media');
    expect(migration).toContain("CHECK (kind IN ('upload', 'artifact'))");
    expect(migration).toContain('idx_media_created_at');
  });
});
