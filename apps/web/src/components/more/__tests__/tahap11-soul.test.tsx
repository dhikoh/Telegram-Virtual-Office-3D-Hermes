// @vitest-environment jsdom
/**
 * Tahap 11 (bagian 2) — sakelar skill aktif per agen (layer SOUL).
 *
 *  - AgentSkillScope merender katalog dari GET /api/agents/:id/skills sebagai
 *    sakelar per skill dan menyimpannya lewat PATCH (daftar lengkap aktif);
 *  - kegagalan simpan menampilkan pesan server APA ADANYA (bukan diam optimis);
 *  - agen sistem dikunci di UI (server juga menjaga 403);
 *  - SkillsModal memang memasang panel ini, api.ts punya dua pemanggilan, dan
 *    routes/agents.ts menulis audit agent.skills_updated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentSkillScope } from '../AgentSkillScope';
import type { AgentSkillScope as ScopeShape } from '../../../services/api';

const apiMock = vi.hoisted(() => ({
  getAgentSkills: vi.fn(),
  updateAgentSkills: vi.fn(),
}));

vi.mock('../../../services/api', () => ({ api: apiMock }));

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const CATALOG = [
  { name: 'pdf-tools', description: 'Baca & tulis PDF' },
  { name: 'invoice-parser', description: 'Ekstrak invoice' },
];

const scope = (over: Partial<ScopeShape> = {}): ScopeShape => ({
  agent_id: 'agent_aria',
  is_system: false,
  catalog: CATALOG,
  skills: ['pdf-tools', 'invoice-parser'],
  disabled: [],
  mode: 'default',
  available: true,
  error: null,
  ...over,
});

const AGENTS = [
  { id: 'agent_aria', name: 'Aria' },
  { id: 'agent_orion', name: 'Orion', is_system: true },
  { id: 'demo-command', name: 'Demo', isDemo: true },
];

beforeEach(() => {
  apiMock.getAgentSkills.mockReset();
  apiMock.updateAgentSkills.mockReset();
});

describe('AgentSkillScope — sakelar skill per agen', () => {
  it('memuat cakupan agen terpilih dan merender satu sakelar per skill katalog', async () => {
    apiMock.getAgentSkills.mockResolvedValue(scope());

    render(<AgentSkillScope agents={AGENTS} />);

    await waitFor(() => expect(apiMock.getAgentSkills).toHaveBeenCalledWith('agent_aria'));

    // Agen demo tidak muncul di pilihan (tidak punya baris di server).
    const select = screen.getByTestId('agent-skill-agent-select') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe('agent_aria');

    const pdf = screen.getByTestId('agent-skill-toggle-pdf-tools');
    const invoice = screen.getByTestId('agent-skill-toggle-invoice-parser');
    expect(pdf.getAttribute('role')).toBe('switch');
    expect(pdf.getAttribute('aria-checked')).toBe('true');
    expect(invoice.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('agent-skill-status')).toBeNull();
    expect(
      screen.getByText('Bawaan: seluruh skill katalog aktif untuk agen ini.')
    ).toBeDefined();
  });

  it('menyimpan daftar LENGKAP skill aktif lewat PATCH dan menampilkan status sukses', async () => {
    apiMock.getAgentSkills.mockResolvedValue(scope());
    apiMock.updateAgentSkills.mockResolvedValue(
      scope({ skills: ['pdf-tools'], disabled: ['invoice-parser'], mode: 'restricted' })
    );

    render(<AgentSkillScope agents={AGENTS} />);
    await waitFor(() => expect(apiMock.getAgentSkills).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('agent-skill-toggle-invoice-parser'));
    expect(screen.getByTestId('agent-skill-toggle-invoice-parser').getAttribute('aria-checked')).toBe(
      'false'
    );

    fireEvent.click(screen.getByTestId('agent-skill-save'));

    await waitFor(() =>
      expect(apiMock.updateAgentSkills).toHaveBeenCalledWith('agent_aria', ['pdf-tools'])
    );
    await waitFor(() => expect(screen.getByTestId('agent-skill-status').textContent).toContain('tersimpan'));
    expect(screen.getByTestId('agent-skill-toggle-invoice-parser').getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('menampilkan pesan server apa adanya saat penyimpanan ditolak', async () => {
    apiMock.getAgentSkills.mockResolvedValue(scope());
    apiMock.updateAgentSkills.mockRejectedValue(
      new Error(
        'API error 400 (/agents/agent_aria/skills): {"error":"unknown_skill","message":"Nama skill di luar katalog gateway: skill-karangan."}'
      )
    );

    render(<AgentSkillScope agents={AGENTS} />);
    await waitFor(() => expect(apiMock.getAgentSkills).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('agent-skill-toggle-invoice-parser'));
    fireEvent.click(screen.getByTestId('agent-skill-save'));

    const error = await waitFor(() => screen.getByTestId('agent-skill-error'));
    expect(error.textContent).toContain('Nama skill di luar katalog gateway: skill-karangan.');
    // Tidak pernah menampilkan status sukses untuk permintaan yang gagal.
    expect(screen.queryByTestId('agent-skill-status')).toBeNull();
  });

  it('mengunci agen sistem: sakelar & tombol simpan nonaktif plus catatan jujur', async () => {
    apiMock.getAgentSkills.mockResolvedValue(
      scope({ agent_id: 'agent_orion', is_system: true })
    );

    render(<AgentSkillScope agents={AGENTS} />);
    const select = screen.getByTestId('agent-skill-agent-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'agent_orion' } });

    await waitFor(() => expect(apiMock.getAgentSkills).toHaveBeenCalledWith('agent_orion'));
    expect(screen.getByTestId('agent-skill-system-note').textContent).toContain('dikunci');
    expect((screen.getByTestId('agent-skill-toggle-pdf-tools') as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByTestId('agent-skill-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('menampilkan galat katalog gateway apa adanya bila tidak bisa dibaca', async () => {
    apiMock.getAgentSkills.mockResolvedValue(
      scope({ catalog: [], skills: [], available: false, error: 'gateway 500 saat mendaftar skill' })
    );

    render(<AgentSkillScope agents={AGENTS} />);
    const shown = await waitFor(() => screen.getByTestId('agent-skill-catalog-error'));
    expect(shown.textContent).toContain('gateway 500 saat mendaftar skill');
    // Katalog tidak terbaca TIDAK dilaporkan 'tidak ada skill' — itu bohong.
    expect(screen.queryByTestId('agent-skill-catalog-empty')).toBeNull();
  });

  it('memberi tahu pemilik saat belum ada agen nyata', () => {
    render(<AgentSkillScope agents={[{ id: 'demo-command', name: 'Demo', isDemo: true }]} />);
    expect(screen.getByTestId('agent-skill-empty').textContent).toContain('Belum ada agen');
  });
});

describe('Wiring Tahap 11 (bagian 2)', () => {
  it('SkillsModal memasang panel cakupan skill', () => {
    const modal = read('../SkillsModal.tsx');
    expect(modal).toContain('<AgentSkillScope agents={agents} />');
    expect(modal).toContain("import { AgentSkillScope } from './AgentSkillScope';");
    expect(modal).toContain('const { addTickerMessage, agents } = useOfficeStore();');
  });

  it('api.ts memanggil kedua rute cakupan skill', () => {
    const api = read('../../../services/api.ts');
    expect(api).toContain('getAgentSkills:');
    expect(api).toContain('updateAgentSkills:');
    expect(api).toContain("method: 'PATCH'");
    expect(api).toContain("/skills'");
  });

  it('endpoints manifest mencatat GET & PATCH /api/agents/:id/skills di phase 11', () => {
    const endpoints = read('../../../../../../packages/shared/src/endpoints.ts');
    expect(endpoints).toContain("path: '/api/agents/:id/skills'");
    expect(endpoints).toMatch(/phase: 11/);
  });

  it('routes/agents.ts memegang guardrail unknown_skill, 503 katalog, dan audit', () => {
    const routes = read('../../../../../../apps/server/src/routes/agents.ts');
    expect(routes).toContain("error: 'unknown_skill'");
    expect(routes).toContain("error: 'catalog_unavailable'");
    expect(routes).toContain("error: 'system_agent'");
    expect(routes).toContain("'agent.skills_updated'");
    expect(routes).toContain('AgentSkillsPatchSchema.safeParse');
  });

  it('migrasi 008 mendokumentasikan semantik tanpa baris = semua aktif', () => {
    const migration = read(
      '../../../../../../apps/server/src/db/migrations/008_agent_skills.sql'
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS agent_skills');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).toContain('TIDAK ADA BARIS = skill AKTIF');
    expect(migration).toMatch(/TIDAK di-seed/);
  });
});
