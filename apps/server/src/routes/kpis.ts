import type { FastifyPluginAsync } from 'fastify';
import { KpiSchema, type Department } from '@hermes-office/shared';
import { KpiRepository } from '../db/repositories/kpis.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { departmentExists } from '../db/repositories/departments.js';

export const kpiRoutes: FastifyPluginAsync = async (fastify) => {
  // F-09: Typed decorations via types/fastify.d.ts
  const { db } = fastify;
  const kpiRepo = new KpiRepository(db);
  const auditRepo = new AuditRepository(db);

  fastify.get<{ Querystring: { department?: Department } }>('/api/kpis', async (request) => {
    const { department } = request.query;
    return kpiRepo.getAll(department);
  });

  fastify.post('/api/kpis', async (request, reply) => {
    const rawBody = (request.body || {}) as Record<string, unknown>;
    const kpiData = {
      id: rawBody.id || `kpi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      department: rawBody.department,
      key: rawBody.key,
      label: rawBody.label,
      value: rawBody.value,
      unit: rawBody.unit || '',
      period: rawBody.period || 'current',
      source: rawBody.source || 'manual',
      source_note: rawBody.source_note || '',
      created_at: Date.now(),
    };

    const parseResult = KpiSchema.safeParse(kpiData);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parseResult.error.format() });
    }

    const kpi = parseResult.data;
    // Tahap 10: a KPI can only be recorded against a live room.
    if (!departmentExists(db, kpi.department)) {
      return reply.code(400).send({
        error: 'invalid_input',
        message: `Ruang/departemen '${kpi.department}' tidak dikenal.`,
      });
    }
    kpiRepo.create(kpi);

    auditRepo.logAction(request.user!.id, 'kpi.create', kpi.id, JSON.stringify({ key: kpi.key }));

    return reply.code(201).send(kpi);
  });
};
