import type Database from 'better-sqlite3';
import { ModelPrioritySchema } from '@hermes-office/shared';
import { SettingRepository } from '../../db/repositories/settings.js';

export const priorityKey = (id: string) => `agent_model_priority:${id}`;

/** Legacy rows need no migration. Never let stale settings displace agents.model. */
export function readModelPriority(db: Database.Database, id: string, current?: string | null): string[] {
  const primary = current?.trim();
  const raw = new SettingRepository(db).get(priorityKey(id));
  let models: string[] = [];
  if (raw) {
    try {
      const parsed = ModelPrioritySchema.safeParse(JSON.parse(raw));
      if (parsed.success) models = parsed.data;
    } catch { /* Corrupt legacy setting: use the persisted primary only. */ }
  }
  if (!primary) return [];
  return [primary, ...models.filter((m) => m !== primary)].slice(0, 5);
}
