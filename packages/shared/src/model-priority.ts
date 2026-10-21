import { z } from 'zod';

export const MAX_MODEL_PRIORITY = 5;
export const ModelPrioritySchema = z.array(z.string().trim().min(1).max(300))
  .min(1).max(MAX_MODEL_PRIORITY)
  .refine((models) => new Set(models).size === models.length, 'Model tidak boleh berulang.');
export const ModelPriorityPatchSchema = z.object({ models: ModelPrioritySchema }).strict();
export interface AgentModelPriority {
  models: string[];
  current_model: string | null;
  max_models: number;
}
