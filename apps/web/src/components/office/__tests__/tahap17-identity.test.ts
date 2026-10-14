/**
 * Tahap 17 acceptance — satu identitas agen & ruang yang hidup.
 *
 * Yang dikunci di sini:
 *  - identitas agen = karakter 3D-nya. Glyph aksesori Tahap 9 DIHAPUS (ia
 *    tidak pernah sampai ke karakter 3D, jadi ia identitas kedua yang
 *    berbohong); penggantinya nama + label model, selalu tergambar, dan
 *    menyusut 38 px saat lounge menjejalkan slot 40 px (aturan kolisi lama);
 *  - bubble kantor berisi kalimat TERAKHIR yang benar-benar diucapkan agen
 *    (dari chat sheet, lewat store kantor), satu map dipakai sprite 2D dan
 *    karakter 3D — bukan dua versi (Rule 9.1);
 *  - teks bubble dinormalkan di satu tempat (shared/speech.ts), bukan di
 *    komponen; `recordSpeech` tidak pernah menyimpan bubble kosong;
 *  - picker avatar mengirim `character` dan server memvalidasinya terhadap
 *    CHARACTER_MODEL_IDS (diuji di apps/server/src/tahap9.test.ts).
 *
 * Diassert dari sumber; aturan bubble diuji perilakunya di
 * packages/shared/src/speech.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const avatar = read('../Avatar.tsx');
const agent3d = read('../office-3d/Agent3D.tsx');
const store = read('../../../stores/office.ts');
const chat = read('../../agent-sheet/AgentSheetChat.tsx');
const profile = read('../../agent-sheet/AgentSheetProfile.tsx');
const manifest = read('../office-3d/glbCharacter.ts');

describe('identitas: satu karakter, satu label', () => {
  it('glyph aksesori Tahap 9 sudah tidak ada di mana pun', () => {
    expect(avatar).not.toContain('ACCESSORY_GLYPHS');
    expect(avatar).not.toContain('avatar-accessory');
    expect(profile).not.toContain('ACCESSORY_OPTIONS');
    expect(chat).not.toContain('ACCESSORY_OPTIONS');
  });

  it('label nama SELALU tergambar — tidak pernah invisible', () => {
    expect(avatar).toContain('data-testid="avatar-name"');
    expect(avatar).toContain('showLabel = true');
    // Lebar menyusut, bukan disembunyikan: lounge 40 px vs pill 70 px.
    expect(avatar).toContain("showLabel ? 'max-w-[70px]' : 'max-w-[38px]'");
    expect(avatar).not.toMatch(/\$\{showLabel \? '' : 'invisible'\}/);
  });

  it('label model 3D di bawah nama, memakai daftar label bersama', () => {
    expect(avatar).toContain('data-testid="avatar-character"');
    expect(avatar).toContain('CHARACTER_MODEL_LABELS');
    expect(avatar).toContain('characterModelFor(agent.department, agent.avatar_style)');
    expect(manifest).toContain('CHARACTER_MODEL_LABELS');
  });

  it('badge DEMO hanya di pill lebar (tidak menabrak di slot sempit)', () => {
    expect(avatar).toMatch(/\{showLabel && agent\.isDemo && \(/);
  });

  it('2D dan 3D memilih karakter dari fungsi yang sama', () => {
    expect(avatar).toContain("from './office-3d/glbCharacter'");
    expect(agent3d).toContain("from './glbCharacter'");
    expect(agent3d).toContain('characterModelFor(agent.department, agent.avatar_style)');
  });
});

describe('bubble kantor: kalimat terakhir yang benar-benar diucapkan', () => {
  it('chat sheet mencatat balasan gateway saat stream selesai', () => {
    expect(chat).toContain('const recordSpeech = useOfficeStore((s) => s.recordSpeech);');
    expect(chat).toContain('let assembled =');
    expect(chat).toContain('assembled += delta;');
    expect(chat).toContain('if (assembled.trim()) recordSpeech(agent.id, assembled);');
    // Hanya balasan asisten; pesan pengguna tidak pernah jadi bubble.
    expect(chat).not.toContain('recordSpeech(agent.id, userMsg');
  });

  it('store menyimpan satu map `speech` dan tidak menyimpan bubble kosong', () => {
    expect(store).toContain('speech: Record<string, SpeechEntry>;');
    expect(store).toContain('speech: {},');
    expect(store).toContain('recordSpeech: (agentId, text) => {');
    expect(store).toContain('const entry = toSpeechEntry(text, Date.now());');
    expect(store).toContain('if (!entry) return;');
    expect(store).toMatch(/speech: \{ \.\.\.state\.speech, \[agentId\]: entry \}/);
  });

  it('sprite 2D membaca map yang sama dan memakai aturan bersama', () => {
    expect(avatar).toContain('useOfficeStore((s) => s.speech[agent.id])');
    expect(avatar).toContain('speechLine(lastSpeech, now)');
    expect(avatar).toContain('data-testid="avatar-bubble"');
  });

  it('bubble menang atas teks status; status hanya cadangan', () => {
    expect(avatar).toContain('const bubble = speech ?? bubbleText;');
    expect(avatar).toMatch(/if \(speech\) \{\s*setBubbleText\(null\);/);
    // Teks status Tahap 9 tidak dihapus — hanya jadi fallback.
    expect(avatar).toContain("'sedang berpikir…'");
    expect(avatar).toContain("'butuh persetujuanmu'");
  });

  it('TTL bubble diperiksa ulang supaya tidak ada bubble kedaluwarsa yang tertinggal', () => {
    expect(avatar).toMatch(/const tick = setInterval\(\(\) => setNow\(Date\.now\(\)\), 5000\);/);
    expect(avatar).toContain('return () => clearInterval(tick);');
    // Hanya berjalan selama ada kalimat; tidak ada timer abadi.
    expect(avatar).toMatch(/if \(!lastSpeech\) return undefined;/);
  });

  it('tidak ada komponen yang menyalin aturan normalisasi sendiri', () => {
    for (const source of [avatar, agent3d, chat, store]) {
      expect(source).not.toContain('SPEECH_MAX_CHARS');
      expect(source).not.toContain('normalizeSpeech');
    }
    expect(agent3d).toContain('speechLine(lastSpeech, now)');
  });
});

describe('picker avatar: identitas disimpan lewat whitelist server', () => {
  it('picker menggambar dari daftar id bersama, bukan array lokal', () => {
    expect(profile).toContain('data-testid="character-picker"');
    expect(profile).toContain('CHARACTER_MODEL_IDS.map((id) => {');
    expect(profile).not.toMatch(/const CHARACTER_IDS = \[/);
    expect(profile).toContain('CHARACTER_MODEL_LABELS[id]');
  });

  it('menyimpan `character` (bukan hanya shirt) dan selalu ikut terkirim', () => {
    expect(profile).toContain('const style = { ...(shirt ? { shirt } : {}), character };');
    expect(profile).toContain('await api.updateAgent(agent.id, { avatar_style: style });');
    expect(profile).not.toContain('accessory');
  });

  it('tombol picker memenuhi target sentuh 44 px dan menandai pilihan', () => {
    expect(profile).toContain('aria-pressed={selected}');
    expect(profile).toMatch(/data-testid="character-picker"[\s\S]{0,900}min-h-\[44px\]/);
  });

  it('default ruangan ditulis apa adanya supaya pemilik tahu titik awalnya', () => {
    expect(profile).toContain('Kosong = default ruangan');
    expect(profile).toContain('characterModelFor(agent.department, null)');
  });
});
