/**
 * Tahap 8 — source assertions: riwayat chat dari sesi gateway (bukan pesan
 * karangan), kelola agen (PATCH/DELETE), layar skills & akun yang jujur.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8');

describe('Tahap 8 — chat history from the gateway session', () => {
  const chat = read('../AgentSheetChat.tsx');

  it('loads the transcript from GET /api/agents/:id/chat', () => {
    expect(chat).toContain('getChatHistory');
  });

  it('has no invented welcome message', () => {
    expect(chat).not.toMatch(/Halo, saya \*\*/);
    expect(chat).not.toMatch(/id:\s*'welcome'/);
  });

  it('shows loading and honest error states with a retry', () => {
    expect(chat).toContain('Memuat riwayat percakapan');
    expect(chat).toContain('Riwayat percakapan gagal dimuat dari gateway');
    expect(chat).toContain('Coba lagi');
  });

  it('states an empty history plainly instead of pretending', () => {
    expect(chat).toContain('Belum ada percakapan dengan');
  });
});

describe('Tahap 8 — agent management UI', () => {
  const registry = read('../../more/AgentsRegistryModal.tsx');

  it('wires PATCH (edit + activate/deactivate) and DELETE through the store', () => {
    expect(registry).toContain('patchAgent');
    expect(registry).toContain('deleteAgent');
    expect(registry).toContain('Nonaktifkan');
    expect(registry).toContain('Aktifkan lagi');
  });

  it('asks for confirmation before deleting and explains the consequences', () => {
    expect(registry).toContain('Ya, hapus');
    expect(registry).toContain('dihapus permanen dari roster');
    expect(registry).toContain('Riwayat di gateway tetap tersimpan');
  });

  it('never offers deletion for demo agents (they have no server row)', () => {
    expect(registry).toMatch(/\{!agent\.isDemo && \(/);
  });

  const store = read('../../../stores/office.ts');

  it('store exposes patchAgent and deleteAgent', () => {
    expect(store).toContain('patchAgent:');
    expect(store).toContain('deleteAgent:');
    expect(store).toMatch(/deleteAgent:\s*async \(id\)[\s\S]*?api\.deleteAgent/);
  });
});

describe('Tahap 8 — skills & account screens are honest', () => {
  const skillsModal = read('../../more/SkillsModal.tsx');

  it('shows the gateway-reported error when skills cannot be enumerated', () => {
    expect(skillsModal).toContain('Gateway tidak bisa mendaftar skill');
    expect(skillsModal).toContain('getSkills');
  });

  it('renders real capabilities data instead of fabricated skill lists', () => {
    expect(skillsModal).toContain('Kemampuan runtime');
    expect(skillsModal).toContain('features');
    expect(skillsModal).not.toMatch(/SKILLS\s*=\s*\[/);
  });

  const account = read('../../more/AccountCard.tsx');

  it('loads the authenticated identity from /api/me and hides nothing on error', () => {
    expect(account).toContain('getMe');
    expect(account).toContain('Akun gagal dimuat dari server');
    expect(account).toContain('login asli');
  });

  const more = read('../../../screens/More.tsx');

  it('More screen exposes the Skills modal and the account card', () => {
    expect(more).toContain('SkillsModal');
    expect(more).toContain('AccountCard');
    expect(more).toContain('Kemampuan Gateway');
  });
});

describe('Tahap 8 — client API surface', () => {
  const api = read('../../../services/api.ts');

  it('declares the Tahap 8 endpoints', () => {
    expect(api).toMatch(/getChatHistory:[\s\S]*?\/agents\/\$\{id\}\/chat/);
    expect(api).toMatch(/deleteAgent:[\s\S]*?\/agents\/\$\{id\}/);
    expect(api).toMatch(/getSkills:[\s\S]*?'\/skills'/);
  });
});
