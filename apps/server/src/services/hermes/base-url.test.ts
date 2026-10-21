/**
 * Tahap 7 — endpoint resolution (Rule S5): an agent row carrying a loopback
 * URL (the old schema default http://127.0.0.1:8642) points at the container
 * itself where no gateway listens, so it must fall back to the server config.
 */
import { describe, it, expect } from 'vitest';
import { isLoopbackUrl, isUnsetEndpoint, hasCustomEndpoint, resolveAgentBaseUrl } from './index.js';

describe('isLoopbackUrl', () => {
  it('treats empty and whitespace as unset', () => {
    expect(isLoopbackUrl('')).toBe(true);
    expect(isLoopbackUrl('   ')).toBe(true);
    expect(isLoopbackUrl(null)).toBe(true);
    expect(isLoopbackUrl(undefined)).toBe(true);
  });

  it('flags loopback hosts that would hit the container itself', () => {
    expect(isLoopbackUrl('http://127.0.0.1:8642')).toBe(true);
    expect(isLoopbackUrl('http://localhost:8642')).toBe(true);
    expect(isLoopbackUrl('https://0.0.0.0:8642')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:8642')).toBe(true);
  });

  it('accepts a real host endpoint', () => {
    expect(isLoopbackUrl('http://172.16.1.1:8642')).toBe(false);
    expect(isLoopbackUrl('https://hermes.internal')).toBe(false);
  });

  it('treats unparseable junk as unset rather than throwing', () => {
    expect(isLoopbackUrl('not a url')).toBe(true);
  });
});

describe('isUnsetEndpoint', () => {
  it('treats the legacy default and blanks as unset', () => {
    expect(isUnsetEndpoint('http://127.0.0.1:8642')).toBe(true);
    expect(isUnsetEndpoint('http://[::1]:8642')).toBe(true);
    expect(isUnsetEndpoint('')).toBe(true);
    expect(isUnsetEndpoint('nonsense')).toBe(true);
  });

  it('treats any chosen endpoint as set', () => {
    expect(isUnsetEndpoint('http://172.16.1.1:8642')).toBe(false);
    expect(isUnsetEndpoint('http://127.0.0.1:59999')).toBe(false);
  });
});

describe('resolveAgentBaseUrl', () => {
  it('falls back to the server config for loopback-default and unset values', () => {
    expect(resolveAgentBaseUrl({ hermes_base_url: 'http://127.0.0.1:8642' })).toMatch(/^https?:\/\//);
    expect(resolveAgentBaseUrl({ hermes_base_url: 'http://localhost:8642' })).toMatch(/^https?:\/\//);
    expect(resolveAgentBaseUrl({ hermes_base_url: '' })).toMatch(/^https?:\/\//);
  });

  it('honours an explicit, non-loopback per-agent endpoint', () => {
    expect(resolveAgentBaseUrl({ hermes_base_url: 'http://172.16.1.1:9999' })).toBe(
      'http://172.16.1.1:9999'
    );
  });

  // Tahap 20 — baris LAMA di SQLite bisa saja menyimpan suffix /v1 yang diketik
  // owner sebelum normalisasi ada; pemotongan di jalur BACA membetulkannya
  // tanpa migrasi database.
  it('strips a legacy /v1 suffix already stored in the agent row', () => {
    expect(resolveAgentBaseUrl({ hermes_base_url: 'https://openrouter.ai/api/v1' })).toBe(
      'https://openrouter.ai/api'
    );
    expect(resolveAgentBaseUrl({ hermes_base_url: 'http://172.16.1.1:8642/v1' })).toBe(
      'http://172.16.1.1:8642'
    );
  });

  it('still honours a deliberate dev gateway on a non-default loopback port', () => {
    expect(resolveAgentBaseUrl({ hermes_base_url: 'http://127.0.0.1:59999' })).toBe(
      'http://127.0.0.1:59999'
    );
  });
});

describe('hasCustomEndpoint', () => {
  it('is false while the row only carries the legacy default', () => {
    expect(hasCustomEndpoint({ hermes_base_url: 'http://127.0.0.1:8642' })).toBe(false);
    expect(hasCustomEndpoint({ hermes_base_url: '' })).toBe(false);
  });

  it('is true once the owner points the agent elsewhere', () => {
    expect(hasCustomEndpoint({ hermes_base_url: 'http://172.16.1.1:9999' })).toBe(true);
  });
});
