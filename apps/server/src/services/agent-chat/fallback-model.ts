/**
 * Fase 2d — Resolver Model Fallback untuk Deteksi Stall.
 *
 * Saat provider lambat atau macet 45 detik, sistem melakukan retry sekali
 * menggunakan model cadangan untuk menyelamatkan percakapan.
 */
import type { HermesClient } from '../hermes/client.interface.js';

export async function resolveFallbackModel(
  client: HermesClient,
  currentModel?: string | null,
  configuredFallback?: string
): Promise<string> {
  if (configuredFallback && configuredFallback.trim()) {
    return configuredFallback.trim();
  }
  try {
    const models = await client.listModels();
    if (Array.isArray(models) && models.length > 0) {
      const alt = models.find((m) => m && m !== currentModel);
      if (alt) return alt;
      if (models[0]) return models[0];
    }
  } catch {
    // Abaikan jika listModels gagal atau tidak didukung
  }

  if (currentModel && currentModel !== 'hermes-agent') {
    return 'hermes-agent';
  }
  return 'hermes-agent-fallback';
}
