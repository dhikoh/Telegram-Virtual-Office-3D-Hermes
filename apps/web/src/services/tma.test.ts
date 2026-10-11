import { describe, it, expect } from 'vitest';
import { tma } from './tma';

describe('Telegram WebApp Service (Phase 3)', () => {
  it('safely handles missing Telegram WebApp environment without throwing', () => {
    expect(() => tma.init()).not.toThrow();
    expect(tma.getInitData()).toBe('');
    expect(tma.getColorScheme()).toBe('dark');
    expect(tma.getUser()).toBeUndefined();
    expect(() => tma.hapticImpact('medium')).not.toThrow();
    expect(() => tma.hapticNotification('success')).not.toThrow();
    expect(() => tma.hapticSelection()).not.toThrow();
    expect(() => tma.showBackButton(() => {})).not.toThrow();
    expect(() => tma.hideBackButton()).not.toThrow();
    expect(() => tma.requestFullscreen()).not.toThrow();
  });
});
