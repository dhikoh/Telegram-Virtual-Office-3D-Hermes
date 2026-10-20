import { describe, it, expect, vi } from 'vitest';
import { resolveFallbackModel } from './fallback-model.js';
import type { HermesClient } from '../hermes/client.interface.js';

describe('Fase 2d — resolveFallbackModel', () => {
  const makeMockClient = (models: string[] = []): HermesClient => {
    return {
      listModels: async () => models,
    } as unknown as HermesClient;
  };

  it('mengutamakan configuredFallback jika disediakan', async () => {
    const client = makeMockClient(['model-a', 'model-b']);
    const model = await resolveFallbackModel(client, 'model-a', 'custom-fallback');
    expect(model).toBe('custom-fallback');
  });

  it('memilih model lain dari listModels jika tersedia', async () => {
    const client = makeMockClient(['model-a', 'model-b']);
    const model = await resolveFallbackModel(client, 'model-a');
    expect(model).toBe('model-b');
  });

  it('jatuh ke hermes-agent jika model saat ini bukan hermes-agent dan listModels kosong', async () => {
    const client = makeMockClient([]);
    const model = await resolveFallbackModel(client, 'custom-deepseek');
    expect(model).toBe('hermes-agent');
  });

  it('jatuh ke hermes-agent-fallback jika model saat ini hermes-agent dan listModels kosong', async () => {
    const client = makeMockClient([]);
    const model = await resolveFallbackModel(client, 'hermes-agent');
    expect(model).toBe('hermes-agent-fallback');
  });
});
