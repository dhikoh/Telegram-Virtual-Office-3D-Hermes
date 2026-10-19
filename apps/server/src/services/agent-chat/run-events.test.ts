/**
 * Fase 2b — penerjemah peristiwa Runs API.
 *
 * Kebenaran yang dijaga:
 *  - Delta menjadi bingkai konten; delta kosong tidak menghasilkan bingkai.
 *  - `run.completed` menutup stream dengan `[DONE]`.
 *  - `run.failed`/`run.cancelled`/`run.interrupted` menghasilkan bingkai
 *    galat yang JELAS — bukan penutup diam-diam. Ini tujuan D rencana.
 *  - Peristiwa lain (message.interim, approval.request, run.steered)
 *    diabaikan: bukan milik stream chat.
 */
import { describe, it, expect } from 'vitest';
import { runEventToChatFrame, isTerminalRunEvent, DeltaCollector } from './run-events.js';

describe('Fase 2b — runEventToChatFrame', () => {
  it('message.delta menjadi bingkai konten', () => {
    expect(runEventToChatFrame('message.delta', { delta: 'Halo ' })).toEqual({
      kind: 'content',
      text: 'Halo ',
    });
  });

  it('message.delta tanpa delta menghasilkan null, bukan bingkai kosong', () => {
    expect(runEventToChatFrame('message.delta', { delta: '' })).toBeNull();
    expect(runEventToChatFrame('message.delta', {})).toBeNull();
    expect(runEventToChatFrame('message.delta', { delta: 42 })).toBeNull();
  });

  it('run.completed menutup stream dengan done', () => {
    expect(runEventToChatFrame('run.completed', { completed: true })).toEqual({ kind: 'done' });
  });

  it('run.failed membawa pesan galat apa adanya', () => {
    expect(runEventToChatFrame('run.failed', { error: 'provider meledak' })).toEqual({
      kind: 'error',
      message: 'provider meledak',
    });
  });

  it('run.failed tanpa pesan tetap jujur bahwa ada kegagalan', () => {
    const frame = runEventToChatFrame('run.failed', {});
    expect(frame?.kind).toBe('error');
    expect((frame as { message: string }).message.length).toBeGreaterThan(0);
  });

  it('run.cancelled dan run.interrupted pun menjadi galat yang terlihat', () => {
    expect(runEventToChatFrame('run.cancelled', {})?.kind).toBe('error');
    expect(runEventToChatFrame('run.interrupted', {})?.kind).toBe('error');
  });

  it('peristiwa yang bukan milik stream chat diabaikan', () => {
    for (const event of [
      'message.interim',
      'approval.request',
      'run.steered',
      'run.queued',
      'replay.truncated',
      'unknown.future.event',
    ]) {
      expect(runEventToChatFrame(event, { anything: true })).toBeNull();
    }
  });

  it('isTerminalRunEvent mengenali keempat penutup', () => {
    expect(isTerminalRunEvent('run.completed')).toBe(true);
    expect(isTerminalRunEvent('run.failed')).toBe(true);
    expect(isTerminalRunEvent('run.cancelled')).toBe(true);
    expect(isTerminalRunEvent('run.interrupted')).toBe(true);
    expect(isTerminalRunEvent('message.delta')).toBe(false);
  });
});

describe('Fase 2b — DeltaCollector', () => {
  it('menggabungkan delta berurutan', () => {
    const c = new DeltaCollector();
    c.push('Halo ');
    c.push('dunia');
    expect(c.text).toBe('Halo dunia');
    expect(c.empty).toBe(false);
  });

  it('delta kosong tidak mengotori salinan', () => {
    const c = new DeltaCollector();
    c.push('');
    c.push('satu');
    expect(c.text).toBe('satu');
  });

  it('penyimpanan utuh meski delta terpotong-potong', () => {
    const c = new DeltaCollector();
    for (const ch of 'jawaban dua puluh ribu karakter') c.push(ch);
    expect(c.text).toBe('jawaban dua puluh ribu karakter');
  });

  it('kosong selama belum ada delta sama sekali', () => {
    expect(new DeltaCollector().empty).toBe(true);
  });
});
