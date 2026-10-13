/**
 * Tahap 9 acceptance — orkestrator & kehidupan UI:
 *  - agen sistem tak terhapus + badge SISTEM, Ask Office mengarah ke orkestrator;
 *  - bubble teks di avatar (auto-hilang, throttle per status);
 *  - tombol geser baris ruang untuk desktop (fix chip kepotong);
 *  - Sesi baru + arsip sesi + edit-&-kirim-ulang [koreksi] di chat;
 *  - avatar editor (warna baju + aksesori) tersimpan lewat whitelist server.
 *
 * Layout/wiring asserted on source; route behaviour covered by
 * apps/server/src/tahap9.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const avatar = read('../../office/Avatar.tsx');
const roomChips = read('../../office/RoomChips.tsx');
const chat = read('../AgentSheetChat.tsx');
const profile = read('../AgentSheetProfile.tsx');
const registry = read('../../more/AgentsRegistryModal.tsx');
const office = read('../../../screens/Office.tsx');
const api = read('../../../services/api.ts');
const shared = read('../../../../../../packages/shared/src/schemas.ts');
const migration = read(
  '../../../../../../apps/server/src/db/migrations/004_tahap9_orchestrator.sql'
);

describe('system orchestrator', () => {
  it('is born as an undeletable, undisableable row in the migration', () => {
    expect(migration).toContain('is_system INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain("'agent_orchestrator'");
    expect(migration).toMatch(/INSERT INTO agents[\s\S]*\n  1\n\);/);
  });

  it('carries is_system through the shared public schema', () => {
    expect(shared).toContain('is_system: z.boolean().optional()');
    expect(shared).toContain('is_system: z.number().int().min(0).max(1)');
  });

  it('hides the delete button and labels system agents in the registry', () => {
    expect(registry).toContain('!agent.is_system &&');
    expect(registry).toContain('SISTEM');
  });

  it('points Ask Office at the system agent, with legacy fallbacks', () => {
    expect(office).toContain('agents.find((a) => a.is_system)');
  });

  it('shows a permanent-agent note in the profile', () => {
    expect(profile).toContain('AGEN SISTEM');
  });
});

describe('avatar life', () => {
  it('draws a status speech bubble that hides itself after a few seconds', () => {
    expect(avatar).toContain('data-testid="avatar-bubble"');
    expect(avatar).toContain('setTimeout(() => setBubbleText(null), 4200)');
    expect(avatar).toContain("'sedang berpikir…'");
    expect(avatar).toContain("'butuh persetujuanmu'");
  });

  it('lets the owner override the shirt colour and overlay an accessory', () => {
    expect(avatar).toContain('agent.avatar_style?.shirt');
    expect(avatar).toContain('ACCESSORY_GLYPHS');
    expect(avatar).toContain('data-testid="avatar-accessory"');
  });
});

describe('room strip scrolling on desktop', () => {
  it('adds labelled scroll arrows that nudge the chip row', () => {
    expect(roomChips).toContain('rowRef.current?.scrollBy');
    expect(roomChips).toContain('aria-label="Geser daftar ruang ke kiri"');
    expect(roomChips).toContain('aria-label="Geser daftar ruang ke kanan"');
    // arrows are for pointers (mouse/trackpad), not touch screens
    expect(roomChips).toContain('[@media(pointer:fine)]:flex');
  });
});

describe('chat sessions & corrections', () => {
  it('offers a new session and an archive list backed by the API', () => {
    expect(chat).toContain('Sesi baru');
    expect(chat).toContain('Riwayat sesi');
    expect(api).toContain('/agents/${id}/session');
    expect(api).toContain('/agents/${id}/sessions');
  });

  it('sends edits as an explicit correction and marks the old message', () => {
    expect(chat).toContain('[koreksi]');
    expect(chat).toContain('digantikan');
    expect(chat).toContain('diedit');
  });

  it('locks archived sessions as read-only', () => {
    expect(chat).toContain('Anda melihat arsip sesi (hanya baca).');
    expect(chat).toContain('isViewingArchive');
  });
});

describe('avatar editor', () => {
  it('exposes colour swatches and accessories, saved through the API whitelist', () => {
    expect(profile).toContain('data-testid="avatar-editor"');
    expect(profile).toContain('SHIRT_SWATCHES');
    expect(profile).toContain('ACCESSORY_OPTIONS');
    expect(profile).toContain('Simpan Avatar');
  });
});
