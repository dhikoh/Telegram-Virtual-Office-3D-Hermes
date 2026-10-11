import type { FastifyPluginAsync } from 'fastify';
import {
  AntiHallucinationReportSchema,
  type Department,
  type ReportTemplate,
} from '@hermes-office/shared';
import { ReportRepository } from '../db/repositories/reports.js';
import { KpiRepository } from '../db/repositories/kpis.js';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { getHermesClientForAgent } from '../services/hermes/index.js';

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const db = (fastify as any).db; // eslint-disable-line @typescript-eslint/no-explicit-any
  const reportRepo = new ReportRepository(db);
  const kpiRepo = new KpiRepository(db);
  const agentRepo = new AgentRepository(db);
  const auditRepo = new AuditRepository(db);

  fastify.get<{ Querystring: { department?: Department } }>('/api/reports', async (request) => {
    const { department } = request.query;
    return reportRepo.getAll(department);
  });

  fastify.post<{
    Body: { agent_id: string; template: ReportTemplate; period: string };
  }>('/api/reports/generate', async (request, reply) => {
    const { agent_id, template, period } = request.body || {};
    if (!agent_id || !template || !period) {
      return reply.code(400).send({ error: 'invalid_input', message: 'Missing required report fields' });
    }

    let agent = agentRepo.getById(agent_id);
    if (!agent) {
      if (agent_id.startsWith('demo-')) {
        const dept = agent_id.replace(/^demo-/, '') as Department;
        agent = {
          id: agent_id,
          name: `Agen ${dept.toUpperCase()}`,
          role: `Lead ${dept}`,
          department: dept,
          avatar: '🤖',
          soul_summary: 'Agen demo kantor virtual Hermes',
          hermes_base_url: 'http://127.0.0.1:8642',
          api_key_env: 'HERMES_KEY_DEFAULT',
          hermes_profile: agent_id,
          active: 1,
          hired_at: Date.now(),
          created_at: Date.now(),
        };
        try {
          agentRepo.create(agent);
        } catch {
          // Ignore
        }
      } else {
        return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
      }
    }

    // Fetch verified departmental KPIs from database
    const kpis = kpiRepo.getAll(agent.department);
    const kpiSummary = kpis
      .map((k) => `${k.label} (${k.key}): ${k.value} ${k.unit} [Source: ${k.source === 'agent' ? 'agent (unverified)' : k.source}]`)
      .join('\n');

    // Strict Anti-Hallucination prompt per Section 8
    const prompt = `You are ${agent.name}, ${agent.role}.
Analyze the following verified KPI data for department "${agent.department}" over period "${period}".
DO NOT invent any numbers. Analyze ONLY the provided data.
You MUST output strictly valid JSON matching this schema:
{
  "summary_md": "Markdown text summary citing only the provided numbers",
  "insights": ["List of key positive observations"],
  "risks": ["List of identified risks"],
  "actions": ["List of recommended concrete next steps"]
}

VERIFIED DATA:
${kpiSummary || 'No KPI entries currently available.'}`;

    const client = getHermesClientForAgent(agent);
    let attempt = 0;
    let validatedAnalysis = null;

    while (attempt < 2 && !validatedAnalysis) {
      attempt++;
      try {
        const { run_id } = await client.startRun({ input: prompt });
        // Poll status or fetch completion
        let settled = false;
        let pollCount = 0;
        let output = '';

        while (!settled && pollCount < 20) {
          await new Promise((r) => setTimeout(r, 80));
          const status = await client.getRunStatus(run_id);
          if (status.status === 'completed') {
            settled = true;
            output = status.output || '';
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            settled = true;
          }
          pollCount++;
        }

        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const check = AntiHallucinationReportSchema.safeParse(parsed);
          if (check.success) {
            validatedAnalysis = check.data;
          }
        }
      } catch {
        // Retry loop continues
      }
    }

    const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const bodyMd = validatedAnalysis
      ? `${validatedAnalysis.summary_md}\n\n### Insights\n${validatedAnalysis.insights.map((i) => `- ${i}`).join('\n')}\n\n### Risks\n${validatedAnalysis.risks.map((r) => `- ${r}`).join('\n')}\n\n### Actions\n${validatedAnalysis.actions.map((a) => `- ${a}`).join('\n')}`
      : 'Gagal membuat laporan: Agen tidak mematuhi skema data anti-halusinasi terverifikasi.';

    const report = {
      id: reportId,
      agent_id: agent.id,
      department: agent.department,
      template,
      period,
      body_md: bodyMd,
      metrics_json: JSON.stringify(validatedAnalysis || {}),
      created_at: Date.now(),
    };

    reportRepo.create(report);
    auditRepo.logAction(request.user!.id, 'report.generate', reportId, JSON.stringify({ template, period }));

    if (!validatedAnalysis) {
      return reply.code(422).send({ error: 'validation_failed', report, message: 'Report failed anti-hallucination validation' });
    }

    return reply.code(201).send(report);
  });
};
