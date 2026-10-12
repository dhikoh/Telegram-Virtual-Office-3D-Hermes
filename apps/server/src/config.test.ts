/**
 * F-03 Config Tests: Secrets with unsafe defaults
 * Tests that production mode rejects missing/mock credentials.
 */
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

describe('F-03: Production config security (secrets, mock gate, owner IDs)', () => {
  const validProdEnv = {
    NODE_ENV: 'production',
    TELEGRAM_BOT_TOKEN: 'real-bot-token-12345',
    OWNER_TELEGRAM_IDS: '111222333',
    HERMES_MODE: 'real',
    HERMES_KEY_DEFAULT: 'real-hermes-key',
    DEV_AUTH_BYPASS: '0',
  };

  it('production + missing TELEGRAM_BOT_TOKEN => throws naming the variable', () => {
    expect(() => {
      loadConfig({
        ...validProdEnv,
        TELEGRAM_BOT_TOKEN: undefined,
      });
    }).toThrow();
  });

  it('production + missing HERMES_KEY_DEFAULT => throws', () => {
    expect(() => {
      loadConfig({
        ...validProdEnv,
        HERMES_KEY_DEFAULT: undefined,
      });
    }).toThrow();
  });

  it('production + empty OWNER_TELEGRAM_IDS => throws', () => {
    expect(() => {
      loadConfig({
        ...validProdEnv,
        OWNER_TELEGRAM_IDS: '',
      });
    }).toThrow();
  });

  it('production + HERMES_MODE=mock => throws', () => {
    expect(() => {
      loadConfig({
        ...validProdEnv,
        HERMES_MODE: 'mock',
      });
    }).toThrow(/HERMES_MODE=mock/);
  });

  it('production + DEV_AUTH_BYPASS=1 => throws', () => {
    expect(() => {
      loadConfig({
        ...validProdEnv,
        DEV_AUTH_BYPASS: '1',
      });
    }).toThrow(/DEV_AUTH_BYPASS/);
  });

  it('production + non-numeric OWNER_TELEGRAM_IDS => throws', () => {
    expect(() => {
      loadConfig({
        ...validProdEnv,
        OWNER_TELEGRAM_IDS: 'not-a-number',
      });
    }).toThrow(/OWNER_TELEGRAM_IDS/);
  });

  it('valid production config succeeds', () => {
    const cfg = loadConfig(validProdEnv);
    expect(cfg.NODE_ENV).toBe('production');
    expect(cfg.HERMES_MODE).toBe('real');
    expect(cfg.ownerIdsList).toEqual([111222333]);
  });

  it('development config with .env.development values succeeds', () => {
    const cfg = loadConfig({
      NODE_ENV: 'development',
      TELEGRAM_BOT_TOKEN: 'mock_telegram_bot_token',
      OWNER_TELEGRAM_IDS: '123456789,987654321',
      HERMES_MODE: 'mock',
      HERMES_KEY_DEFAULT: 'mock-secret-key',
    });
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.HERMES_MODE).toBe('mock');
  });

  it('error output never contains secret values', () => {
    try {
      loadConfig({
        NODE_ENV: 'production',
        TELEGRAM_BOT_TOKEN: 'SUPER_SECRET_VALUE_12345',
        OWNER_TELEGRAM_IDS: '111222333',
        HERMES_MODE: 'mock',
        HERMES_KEY_DEFAULT: 'ANOTHER_SECRET_XYZ',
        DEV_AUTH_BYPASS: '1',
      });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('SUPER_SECRET_VALUE_12345');
      expect(msg).not.toContain('ANOTHER_SECRET_XYZ');
    }
  });
});
