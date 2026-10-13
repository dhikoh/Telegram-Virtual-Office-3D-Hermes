import type { Agent } from '@hermes-office/shared';
import type Database from 'better-sqlite3';
import type { HermesClient } from './client.interface.js';
import { MockHermesClient } from './mock.client.js';
import { RealHermesClient } from './real.client.js';
import { SettingRepository } from '../../db/repositories/settings.js';
import { config } from '../../config.js';

export * from './client.interface.js';
export * from './mock.client.js';
export * from './real.client.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '[::1]']);

/**
 * Tahap 7 fix: a loopback base URL stored on an agent points at the container
 * itself, where no Hermes gateway listens — the gateway lives on the VPS host.
 * Empty / loopback / unparseable URLs therefore fall back to the server config.
 */
export function isLoopbackUrl(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return true;
  try {
    const parsed = new URL(url.trim());
    return LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return true;
  }
}

/**
 * True when the row carries no endpoint the owner actually chose: empty,
 * unparseable, or the legacy schema default `http://127.0.0.1:8642` (port 8642
 * / no port on a loopback host). A deliberately different loopback endpoint
 * (e.g. a dev gateway on another port) is still honoured — and the connection
 * probe rejects new loopback endpoints outright.
 */
export function isUnsetEndpoint(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return true;
  try {
    const parsed = new URL(url.trim());
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) return false;
    return parsed.port === '8642' || parsed.port === '';
  } catch {
    return true;
  }
}

export function resolveAgentBaseUrl(agent: Pick<Agent, 'hermes_base_url'>): string {
  // Rule S5: URL comes from the agent registry, else the server config
  return isUnsetEndpoint(agent.hermes_base_url)
    ? config.HERMES_BASE_URL
    : (agent.hermes_base_url as string).trim();
}

/** True when the agent carries its own endpoint instead of the server default. */
export function hasCustomEndpoint(agent: Pick<Agent, 'hermes_base_url'>): boolean {
  return resolveAgentBaseUrl(agent) !== config.HERMES_BASE_URL;
}

/**
 * Rule S4: API keys never reach the browser. Resolution order:
 * 1. per-agent key entered by the owner in the app (settings: agent_key:<id>)
 * 2. env var named by the agent's api_key_env
 * 3. the server-wide default key
 */
export function resolveAgentApiKey(
  agent: Pick<Agent, 'id' | 'api_key_env'>,
  db?: Database.Database
): string {
  if (db) {
    try {
      const stored = new SettingRepository(db).get(`agent_key:${agent.id}`);
      if (stored) return stored;
    } catch {
      // settings table unavailable — fall through to env resolution
    }
  }
  return (agent.api_key_env && process.env[agent.api_key_env]) || config.HERMES_KEY_DEFAULT;
}

export function getHermesClientForAgent(agent: Agent, db?: Database.Database): HermesClient {
  const baseUrl = resolveAgentBaseUrl(agent);
  const timeoutMs = process.env.HERMES_TIMEOUT_MS
    ? parseInt(process.env.HERMES_TIMEOUT_MS, 10)
    : config.HERMES_TIMEOUT_MS;

  if (config.HERMES_MODE === 'real') {
    // Rule S4: key stays server-side, resolved from settings/env only
    const apiKey = resolveAgentApiKey(agent, db);
    return new RealHermesClient(baseUrl, apiKey, timeoutMs);
  }

  return new MockHermesClient(baseUrl, timeoutMs);
}
