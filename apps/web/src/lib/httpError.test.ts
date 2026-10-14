import { describe, expect, it } from 'vitest';
import { serverMessage } from './httpError';

/**
 * `serverMessage` dipakai dua modal di layar More (SkillsModal,
 * AgentSkillScope). Sebelumnya keduanya menyalin fungsi yang sama; test ini
 * mengunci perilaku satu-satunya salinan yang tersisa: pesan server menang atas
 * teks teknis, dan tidak pernah ada lemparan.
 */
describe('serverMessage (Tahap 18)', () => {
  it('mengambil pesan JSON di ujung teks galat request()', () => {
    expect(
      serverMessage(new Error('HTTP 409: {"message":"Skill sudah terpasang"}'))
    ).toBe('Skill sudah terpasang');
  });

  it('jatuh ke field error kalau message tidak ada', () => {
    expect(serverMessage(new Error('HTTP 404: {"error":"Tidak ditemukan"}'))).toBe(
      'Tidak ditemukan'
    );
  });

  it('mengembalikan pesan mentah kalau bodi bukan JSON', () => {
    expect(serverMessage(new Error('HTTP 500: {bukan json'))).toBe('HTTP 500: {bukan json');
    expect(serverMessage(new Error('Network error'))).toBe('Network error');
  });

  it('menerima nilai bukan Error tanpa melempar', () => {
    expect(serverMessage('gagal')).toBe('gagal');
    expect(serverMessage(null)).toBe('null');
    expect(serverMessage(undefined)).toBe('undefined');
  });

  it('mengabaikan kurung kurawal yang tidak menghasilkan message/error', () => {
    expect(serverMessage(new Error('HTTP 400: {"detail":"x"}'))).toBe('HTTP 400: {"detail":"x"}');
  });
});
