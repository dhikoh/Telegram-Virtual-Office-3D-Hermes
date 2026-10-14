/**
 * Tahap 17 acceptance — SkillsModal: pencarian, hitungan, dan keterbacaan.
 *
 * Polish dari tinjauan tangkapan layar (2026-10-14):
 *  - kotak cari menyaring daftar TERPASANG (nama + deskripsi, tanpa peduli
 *    huruf besar/kecil) dan tidak menyentuh permintaan instal/hapus;
 *  - judul memakai jumlah hasil saring + satu baris jujur "Menampilkan x dari y";
 *  - filter tanpa hasil tidak pernah menyisakan area kosong;
 *  - kolom gulir tidak menutupi kartu (tombol hapus / badge NONAKTIF);
 *  - tombol header punya title yang sama dengan aria-label;
 *  - TIDAK ada sakelar aktif/nonaktif atau tombol Simpan karangan di daftar
 *    terpasang: gateway tidak punya endpoint tulis untuk skills.
 *
 * Diassert dari sumber; perilaku rute dicakup test server.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Baris baru dinormalkan: checkout Windows memakai CRLF, assert pakai LF. */
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const modal = read('../SkillsModal.tsx');

describe('Tahap 17 — kotak cari skill terpasang', () => {
  it('menyediakan input cari dengan testid, label aksesibel, dan target 44px', () => {
    expect(modal).toContain('data-testid="skill-search"');
    expect(modal).toContain('aria-label="Cari skill"');
    expect(modal).toContain('placeholder="cari nama skill…"');
    expect(modal).toContain('const [search, setSearch] = useState(\'\');');
    // Label sr-only + id yang dirujuk input.
    expect(modal).toContain('<label className="sr-only" htmlFor="skill-search">');
    expect(modal).toContain('Cari skill\n              </label>');
    expect(modal).toContain('id="skill-search"');
    expect(modal).toMatch(/data-testid="skill-search"[\s\S]{0,400}min-h-\[44px\]/);
  });

  it('menyaring nama DAN deskripsi dari gateway, tanpa peduli huruf besar/kecil', () => {
    expect(modal).toMatch(/const needle = query\.toLowerCase\(\);/);
    expect(modal).toMatch(/s\.name\.toLowerCase\(\)\.includes\(needle\)/);
    expect(modal).toMatch(/\(s\.description \|\| ''\)\.toLowerCase\(\)\.includes\(needle\)/);
  });

  it('menyaring hanya daftar terpasang — tidak mengubah permintaan instal/hapus', () => {
    // Handler input hanya menyetel state pencarian; tidak ada panggilan API.
    expect(modal).toContain('onChange={(e) => setSearch(e.target.value)}');
    // Penyaringan memakai state `skills`, bukan hasil panggilan baru.
    expect(modal).toMatch(/const shown = needle[\s\S]{0,220}\? skills\.filter\(/);
    // Permintaan ke orkestrator tetap dua dan tidak tersentuh filter.
    expect(modal.match(/api\.installSkill\(/g)?.length).toBe(1);
    expect(modal.match(/api\.uninstallSkill\(/g)?.length).toBe(1);
    expect(modal).not.toContain('api.updateSkill');
  });
});

describe('Tahap 17 — hitungan dan keadaan kosong', () => {
  it('judul memakai jumlah hasil saring, bukan jumlah mentah', () => {
    expect(modal).toContain('Skill terpasang ({shown.length})');
    expect(modal).not.toContain('Skill terpasang ({skills.length})');
  });

  it('menambah baris jujur "Menampilkan x dari y" hanya saat filter aktif', () => {
    expect(modal).toContain('data-testid="skill-count"');
    expect(modal).toMatch(/\{query !== '' && \([\s\S]{0,220}data-testid="skill-count"/);
    expect(modal).toContain('Menampilkan {shown.length} dari {skills.length} skill');
  });

  it('filter tanpa hasil menampilkan pesan, bukan area kosong', () => {
    expect(modal).toContain('data-testid="skill-empty-filter"');
    expect(modal).toMatch(/\{shown\.length === 0 && \([\s\S]{0,220}data-testid="skill-empty-filter"/);
    expect(modal).toContain('Tidak ada skill yang cocok dengan');
    // Pesan memuat kata kunci yang diketik pengguna.
    expect(modal).toMatch(/Tidak ada skill yang cocok dengan "\$\{query\}"\./);
  });

  it('daftar terpasang digambar dari hasil saring', () => {
    expect(modal).toContain('data-testid="skill-list"');
    expect(modal).toMatch(/\{shown\.map\(\(s\) => \(/);
    expect(modal).not.toMatch(/\{skills\.map\(\(s\) => \(/);
  });
});

describe('Tahap 17 — keterbacaan & kejujuran UI', () => {
  it('kolom gulir diberi padding kanan agar tidak menutupi kartu', () => {
    expect(modal).toContain('flex flex-col gap-3 overflow-y-auto pr-2.5');
    expect(modal).not.toContain('overflow-y-auto pr-1"');
  });

  it('tombol header punya title yang sama dengan aria-label', () => {
    expect(modal).toContain('aria-label="Muat ulang kemampuan gateway"');
    expect(modal).toContain('title="Muat ulang kemampuan gateway"');
    expect(modal).toContain('aria-label="Tutup"');
    expect(modal).toContain('title="Tutup"');
  });

  it('tidak mengarang sakelar aktif/nonaktif atau tombol Simpan untuk skill terpasang', () => {
    expect(modal).not.toContain('role="switch"');
    expect(modal).not.toContain('Simpan');
    expect(modal).not.toContain('api.updateSkill');
    // Badge NONAKTIF tetap data dari gateway (s.enabled === false).
    expect(modal).toContain('{s.enabled === false && (');
    expect(modal).toContain('NONAKTIF');
  });
});

describe('Tahap 17 — permukaan Tahap 11 tetap utuh', () => {
  it('panel instal, cakupan agen, dan testid lama masih ada', () => {
    expect(modal).toContain('data-testid="skill-install-panel"');
    expect(modal).toContain('data-testid="skill-install-input"');
    expect(modal).toContain('data-testid="skill-install-submit"');
    expect(modal).toContain('data-testid="skill-install-status"');
    expect(modal).toContain('data-testid="skill-install-error"');
    expect(modal).toContain('data-testid="skill-uninstall-error"');
    expect(modal).toContain('data-testid="agent-skill-panel"');
    expect(modal).toContain('<AgentSkillScope agents={agents} />');
    expect(modal).toContain('data-testid={`skill-remove-${s.name}`}');
    expect(modal).toContain('Minta Orkestrator Install');
    expect(modal).toContain('Instal dari katalog');
    expect(modal).toContain('Minta Hapus');
    expect(modal).toContain('Ya, hapus');
    expect(modal).toContain('Batal');
    expect(modal).toContain('Permintaan dikirim — pantau progres di layar Tugas.');
    expect(modal).toContain('setConfirmUninstall(');
  });

  it('keadaan loading, gateway tak tersedia, dan galat tidak berubah', () => {
    expect(modal).toContain('Menanyakan gateway...');
    expect(modal).toContain('Gateway tidak bisa mendaftar skill');
    expect(modal).toContain('Gateway melaporkan tidak ada skill terpasang.');
    expect(modal).toContain('Gagal menghubungi server kantor.');
    expect(modal).toContain("setState('error')");
    // Keadaan kosong tanpa filter tetap tanpa kotak cari (skills.length === 0).
    expect(modal).toMatch(
      /\{state === 'ready' && available && skills\.length === 0 && \([\s\S]{0,200}Gateway melaporkan tidak ada skill terpasang\./
    );
  });
});
