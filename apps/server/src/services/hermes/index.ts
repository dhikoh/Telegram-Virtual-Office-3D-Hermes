import type { Agent } from '@hermes-office/shared';
import type { HermesClient } from './client.interface.js';
import { MockHermesClient } from './mock.client.js';
import { RealHermesClient } from './real.client.js';
import { config } from '../../config.js';

export * from './client.interface.js';
export * from './mock.client.js';
export * from './real.client.js';

export function getHermesClientForAgent(agent: Agent): HermesClient {
  // Rule S5: URL comes strictly from agent registry
  const baseUrl = agent.hermes_base_url || config.HERMES_BASE_URL;
  const timeoutMs = process.env.HERMES_TIMEOUT_MS
    ? parseInt(process.env.HERMES_TIMEOUT_MS, 10)
    : config.HERMES_TIMEOUT_MS;

  if (config.HERMES_MODE === 'real') {
    // Rule S4: API key stays on server via env var lookup
    const apiKey = process.env[agent.api_key_env] || config.HERMES_KEY_DEFAULT;
    return new RealHermesClient(baseUrl, apiKey, timeoutMs);
  }

  return new MockHermesClient(baseUrl, timeoutMs);
}
