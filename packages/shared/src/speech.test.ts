/**
 * Tahap 17 — aturan bubble kantor (packages/shared/src/speech.ts).
 *
 * Bubble di lantai kantor menjawab satu pertanyaan saja: "agen ini barusan
 * bilang apa?". Modul ini pemilik satu-satunya aturan itu — sprite 2D
 * (Avatar.tsx) dan karakter 3D (Agent3D.tsx) membacanya di sini, jadi kedua
 * tampilan tidak mungkin menampilkan kalimat yang berbeda (Rule 9.1 parity).
 *
 * Yang dikunci di sini: kalimat jadi satu baris (sintaks markdown dibuang,
 * bukan dikarang), dipotong dengan `…`, dan kedaluwarsa sendiri — bubble lama
 * yang tetap tampil = UI yang berbohong soal keadaan sekarang (Rule C7).
 */
import { describe, it, expect } from 'vitest';
import {
  SPEECH_MAX_CHARS,
  SPEECH_TTL_MS,
  isSpeechFresh,
  normalizeSpeech,
  speechLine,
  toSpeechEntry,
} from './speech.js';

const NOW = 1_700_000_000_000;

describe('normalizeSpeech — satu baris, tanpa sintaks', () => {
  it('meratakan baris baru dan spasi berlebih jadi satu spasi', () => {
    expect(normalizeSpeech('Halo,\n\n  saya   sudah\nselesai.')).toBe('Halo, saya sudah selesai.');
    expect(normalizeSpeech('\t  ')).toBe('');
  });

  it('membuang fence kode, tapi menyimpan teks inline code', () => {
    expect(normalizeSpeech('Cek ini:\n```ts\nconst a = 1;\n```\nlanjut.')).toBe('Cek ini: lanjut.');
    expect(normalizeSpeech('Jalankan `npm test` dulu.')).toBe('Jalankan npm test dulu.');
  });

  it('menyimpan label tautan, membuang URL-nya', () => {
    expect(normalizeSpeech('Lihat [laporan](https://example.com/a?b=1) besok.')).toBe(
      'Lihat laporan besok.'
    );
    expect(normalizeSpeech('![grafik](https://example.com/g.png) naik.')).toBe('grafik naik.');
  });

  it('membuang penanda blok: heading, kutipan, bullet, nomor', () => {
    expect(normalizeSpeech('## Ringkasan\n> catatan\n- satu\n- dua\n1. tiga')).toBe(
      'Ringkasan catatan satu dua tiga'
    );
  });

  it('membuang penekanan tapi menyimpan hurufnya', () => {
    expect(normalizeSpeech('**penting** dan _segera_ ~kadang~')).toBe('penting dan segera kadang');
  });
});

describe('toSpeechEntry — null bukan bubble kosong', () => {
  it('teks kosong / hanya sintaks -> null', () => {
    expect(toSpeechEntry('', NOW)).toBeNull();
    expect(toSpeechEntry('   \n\t ', NOW)).toBeNull();
    expect(toSpeechEntry('```\nconst a = 1;\n```', NOW)).toBeNull();
    expect(toSpeechEntry('***', NOW)).toBeNull();
  });

  it('mencatat `at` apa adanya (pure — tanpa jam internal)', () => {
    expect(toSpeechEntry('halo', NOW)).toEqual({ text: 'halo', at: NOW });
    expect(toSpeechEntry('halo', NOW)?.at).toBe(NOW);
  });

  it('memotong pada batas karakter dengan satu elipsis', () => {
    const long = 'a'.repeat(SPEECH_MAX_CHARS + 40);
    const entry = toSpeechEntry(long, NOW);
    expect(entry?.text.length).toBe(SPEECH_MAX_CHARS);
    expect(entry?.text.endsWith('…')).toBe(true);
    expect(entry?.text).not.toContain('...');
  });

  it('tidak menyisakan spasi menggantung sebelum elipsis', () => {
    const entry = toSpeechEntry(`${'kata '.repeat(30)}akhir`, NOW);
    expect(entry?.text.endsWith(' …')).toBe(false);
    expect(entry?.text.endsWith('…')).toBe(true);
  });

  it('teks pas batas tidak dipotong', () => {
    const exact = 'b'.repeat(SPEECH_MAX_CHARS);
    expect(toSpeechEntry(exact, NOW)?.text).toBe(exact);
  });
});

describe('isSpeechFresh — bubble punya umur', () => {
  const entry = { text: 'halo', at: NOW };

  it('null / undefined selalu basi', () => {
    expect(isSpeechFresh(null, NOW)).toBe(false);
    expect(isSpeechFresh(undefined, NOW)).toBe(false);
  });

  it('segar sebelum TTL, basi setelahnya', () => {
    expect(isSpeechFresh(entry, NOW)).toBe(true);
    expect(isSpeechFresh(entry, NOW + SPEECH_TTL_MS - 1)).toBe(true);
    expect(isSpeechFresh(entry, NOW + SPEECH_TTL_MS)).toBe(false);
    expect(isSpeechFresh(entry, NOW + SPEECH_TTL_MS * 10)).toBe(false);
  });

  it('jam perangkat mundur tidak membuang bubble', () => {
    expect(isSpeechFresh(entry, NOW - 5_000)).toBe(true);
  });

  it('ttl bisa di-override untuk test', () => {
    expect(isSpeechFresh(entry, NOW + 10, 5)).toBe(false);
    expect(isSpeechFresh(entry, NOW + 10, 50)).toBe(true);
  });
});

describe('speechLine — yang dirender sekarang', () => {
  it('mengembalikan teks selagi segar, null setelah kedaluwarsa', () => {
    const entry = toSpeechEntry('**Selesai** ya.', NOW);
    expect(speechLine(entry, NOW)).toBe('Selesai ya.');
    expect(speechLine(entry, NOW + SPEECH_TTL_MS - 1)).toBe('Selesai ya.');
    expect(speechLine(entry, NOW + SPEECH_TTL_MS)).toBeNull();
  });

  it('tanpa entri tidak ada bubble', () => {
    expect(speechLine(undefined, NOW)).toBeNull();
    expect(speechLine(null, NOW)).toBeNull();
  });

  it('at dipakai, bukan waktu modul — entry bisa diuji tanpa timer', () => {
    const entry = { text: 'x', at: 0 };
    expect(speechLine(entry, SPEECH_TTL_MS - 1)).toBe('x');
    expect(speechLine(entry, SPEECH_TTL_MS + 1)).toBeNull();
  });
});

describe('batas yang dipakai UI', () => {
  it('TTL beberapa puluh detik, bukan berjam-jam', () => {
    expect(SPEECH_TTL_MS).toBeGreaterThanOrEqual(20_000);
    expect(SPEECH_TTL_MS).toBeLessThanOrEqual(120_000);
  });

  it('maksimum karakter muat di bubble satu baris', () => {
    expect(SPEECH_MAX_CHARS).toBeGreaterThanOrEqual(24);
    expect(SPEECH_MAX_CHARS).toBeLessThanOrEqual(80);
  });
});
