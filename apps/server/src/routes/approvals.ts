import type { FastifyPluginAsync } from 'fastify';
import { ResolveApprovalRequestSchema } from '@hermes-office/shared';
import { ApprovalRepository } from '../db/repositories/approvals.js';
import { AuditRepository } from '../db/repositories/audit.js';

export const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  const db = (fastify as any).db; // eslint-disable-line @typescript-eslint/no-explicit-any
  const dispatcher = (fastify as any).dispatcher; // eslint-disable-line @typescript-eslint/no-explicit-any
  const approvalRepo = new ApprovalRepository(db);
  const auditRepo = new AuditRepository(db);

  fastify.get('/api/approvals', async () => {
    return approvalRepo.getAll();
  });

  fastify.post<{ Params: { id: string } }>('/api/approvals/:id/resolve', async (request, reply) => {
    const { id } = request.params;
    const approval = approvalRepo.getById(id);
    if (!approval) {
      return reply.code(404).send({ error: 'not_found', message: 'Approval not found' });
    }

    if (approval.status !== 'pending') {
      return reply.code(400).send({ error: 'already_resolved', message: 'Approval is not pending' });
    }

    const parseResult = ResolveApprovalRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parseResult.error.format() });
    }

    const { decision } = parseResult.data;

    try {
      await dispatcher.resolveApproval(id, decision, request.user!.id);

      // Rule S7 & S9: Log who decided and when
      auditRepo.logAction(
        request.user!.id,
        'approval.resolve',
        id,
        JSON.stringify({ decision, run_id: approval.run_id })
      );

      return { status: 'resolved', decision };
    } catch (err) {
      return reply.code(500).send({ error: 'resolution_failed', message: `Could not resolve: ${err}` });
    }
  });
};
