/**
 * Fix identitas — unit test untuk lapisan teks.
 *
 * Kebenaran yang dijaga:
 *  - Nama kosong → null (tidak ada instruksi karangan).
 *  - Field kosong tidak meninggalkan baris hampa / "undefined".
 *  - Kalimat penimpa benar-benar ada — itu satu-satunya senjata melawan
 *    system prompt relay yang melarang menyebut nama.
 *  - applyIdentity idempoten: dipanggil dua kali tidak menggandakan marker.
 *  - stripIdentity membuang marker milik aplikasi tetapi menjaga teks pengguna.
 *  - Urutan stripIdentity / stripSkillScope tidak mengubah hasil.
 */
import { describe, it, expect } from 'vitest';
import {
  IDENTITY_MARKER,
  buildIdentityDirective,
  applyIdentity,
  stripIdentity,
} from './identity-scope.js';
import {
  SKILL_SCOPE_MARKER,
  buildSkillScopeDirective,
  applySkillScope,
  stripSkillScope,
} from './skill-scope.js';

const agent = {
  name: 'Bagas',
  role: 'Distributor Prospecting & Marketing',
  department: 'marketing',
  soul_summary: 'Menjual zeolit ke pabrik semen.',
};

describe('buildIdentityDirective', () => {
  it('mengembalikan null saat nama kosong — tidak ada instruksi karangan', () => {
    expect(buildIdentityDirective({ ...agent, name: '' })).toBeNull();
    expect(buildIdentityDirective({ ...agent, name: '   ' })).toBeNull();
    expect(buildIdentityDirective({ ...agent, name: null })).toBeNull();
    expect(buildIdentityDirective({})).toBeNull();
  });

  it('mengandung nama, peran, ruang kerja, dan soul', () => {
    const text = buildIdentityDirective(agent)!;
    expect(text).toBeTruthy();
    expect(text.startsWith(IDENTITY_MARKER)).toBe(true);
    expect(text.endsWith(']')).toBe(true);
    expect(text).toContain('Bagas');
    expect(text).toContain('Distributor Prospecting & Marketing');
    expect(text).toContain('marketing');
    expect(text).toContain('Menjual zeolit ke pabrik semen.');
  });

  it('menyertakan kalimat penimpa identitas lain (lawan larangan nama relay)', () => {
    const text = buildIdentityDirective(agent)!;
    expect(text).toContain('MENIMPA instruksi identitas lain');
    expect(text).toContain('larangan menyebut nama');
    expect(text).toContain('Jawab selalu sebagai Bagas.');
  });

  it('soul_summary kosong tidak membuat baris hampa', () => {
    const text = buildIdentityDirective({ ...agent, soul_summary: '' })!;
    expect(text).toBeTruthy();
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('Tugasmu: .');
    // Tidak ada dua spasi beruntun dari bagian yang dilewati.
    expect(text).not.toMatch(/ {2}/);
  });

  it('peran dan departemen kosong tetap mengirim identitas berbasis nama', () => {
    const text = buildIdentityDirective({ ...agent, role: '', department: '  ' })!;
    expect(text).toContain('Kamu adalah Bagas.');
    expect(text).not.toContain('Peran:');
    expect(text).not.toContain('Ruang kerja:');
    expect(text).not.toMatch(/ {2}/);
  });
});

describe('applyIdentity', () => {
  const directive = buildIdentityDirective(agent)!;

  it('menempelkan direktif di depan pesan user', () => {
    const out = applyIdentity('Siapa namamu?', directive);
    expect(out.startsWith(IDENTITY_MARKER)).toBe(true);
    expect(out).toContain('Siapa namamu?');
    expect(out.indexOf('Siapa namamu?')).toBeGreaterThan(out.indexOf(IDENTITY_MARKER));
  });

  it('idempoten — dipanggil dua kali tidak menggandakan marker', () => {
    const once = applyIdentity('Siapa namamu?', directive);
    const twice = applyIdentity(once, directive);
    expect(twice).toBe(once);
    expect(twice.split(IDENTITY_MARKER).length - 1).toBe(1);
  });

  it('mengenali marker yang sudah ada walau teks pengguna diawali karakter lain', () => {
    const once = applyIdentity('Siapa namamu?', directive);
    // strip lalu apply lagi harus kembali ke bentuk sekali tempel.
    expect(applyIdentity(stripIdentity(once), directive)).toBe(once);
  });

  it('directive null mengembalikan pesan apa adanya', () => {
    expect(applyIdentity('halo', null)).toBe('halo');
  });
});

describe('stripIdentity', () => {
  const directive = buildIdentityDirective(agent)!;

  it('membuang marker tetapi menjaga teks pengguna', () => {
    const scoped = applyIdentity('Siapa namamu, perkenalkan dirimu', directive);
    expect(stripIdentity(scoped)).toBe('Siapa namamu, perkenalkan dirimu');
  });

  it('pesan tanpa marker tidak berubah', () => {
    expect(stripIdentity('halo Bagas')).toBe('halo Bagas');
    expect(stripIdentity('')).toBe('');
  });

  it('marker di tengah teks TIDAK dibuang (hanya milik aplikasi, di awal)', () => {
    const content = `jawaban yang menyebut ${IDENTITY_MARKER} ...] di tengah`;
    expect(stripIdentity(content)).toBe(content);
  });

  it('komposisi dengan stripSkillScope tidak bergantung urutan', () => {
    const scope = buildSkillScopeDirective(null, ['codebase-inspection'])!;
    const scoped = applySkillScope('Siapa namamu?', scope);
    const both = applyIdentity(scoped, directive);

    // Identitas paling depan, cakupan skill di bawahnya — keduanya milik
    // aplikasi, jadi keduanya lepas dan teks pemilik kembali utuh.
    const a = stripIdentity(stripSkillScope(both));
    const b = stripSkillScope(stripIdentity(both));
    expect(a).toBe('Siapa namamu?');
    expect(b).toBe(a);
  });

  it('marker cakupan skill milik aplikasi ikut dibuang (riwayat bebas garis)', () => {
    const scope = buildSkillScopeDirective(null, ['codebase-inspection'])!;
    const scoped = applySkillScope('halo', scope);
    // Kedua marker adalah garis yang DITAMBAHKAN aplikasi ini; pemilik tidak
    // boleh melihat satu pun dari keduanya di riwayat.
    expect(stripIdentity(scoped)).toBe('halo');
  });

  it('identitas yang ditempel di atas cakupan skill bersih dua-duanya', () => {
    const scope = buildSkillScopeDirective(null, ['codebase-inspection'])!;
    const both = applyIdentity(applySkillScope('halo', scope), directive);
    // Identitas paling depan (applyIdentity terakhir), skill di bawahnya.
    expect(both.startsWith(IDENTITY_MARKER)).toBe(true);
    expect(stripIdentity(both)).toBe('halo');
    expect(stripSkillScope(stripIdentity(both))).toBe('halo');
  });
});
