import { describe, expect, it } from 'vitest';
import { buildAgentIdentity } from './identity.js';

const agent = {
  id: 'a1',
  name: 'Bagas',
  role: 'Distributor Prospecting & Marketing',
  department: 'marketing',
  soul_summary: 'Menjual zeolit ke pabrik semen.',
};

describe('Fase 1 — jembatan identitas', () => {
  it('mengandung nama, peran, dan ruang kerja agen', () => {
    const text = buildAgentIdentity(agent);
    expect(text).toBeTruthy();
    expect(text).toContain('Bagas');
    expect(text).toContain('Distributor Prospecting & Marketing');
    expect(text).toContain('marketing');
  });

  it('menyertakan soul_summary bila diisi', () => {
    const text = buildAgentIdentity(agent);
    expect(text).toContain('Menjual zeolit ke pabrik semen.');
  });

  it('mengembalikan null saat nama kosong — tidak ada system prompt karangan', () => {
    expect(buildAgentIdentity({ ...agent, name: '   ' })).toBeNull();
    expect(buildAgentIdentity({ ...agent, name: '' })).toBeNull();
  });

  // Keputusan plan: kirim hanya bila name atau role terisi. Nama adalah jangkar
  // — tanpa nama tidak ada identitas yang bisa disebut — jadi nama kosong = null,
  // sedangkan peran kosong dengan nama terisi tetap dikirim (baris peran dihilangkan).
  it('peran kosong tetap mengirim identitas berbasis nama', () => {
    const text = buildAgentIdentity({ ...agent, role: '   ' });
    expect(text).toBeTruthy();
    expect(text).toContain('Bagas');
    expect(text).not.toContain('Peran:');
  });

  it('soul_summary kosong tidak membuat baris hampa', () => {
    const text = buildAgentIdentity({ ...agent, soul_summary: '' });
    expect(text).toBeTruthy();
    expect(text).not.toContain('undefined');
    expect(text!.split('\n').every((line) => line.trim().length > 0)).toBe(true);
  });
});
