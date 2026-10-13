/**
 * Tahap 7 acceptance — fondasi jujur (audit 2026-10-13):
 *  - named SSE events so the office stream actually reaches the UI,
 *  - no fabricated KPI/sparkline/report agents, demo explicitly labelled,
 *  - the "Simulate Status" driver hidden from production builds (Rule C7),
 *  - hiring, not demoing, as the empty-office primary path,
 *  - per-agent connection probe with gateway model auto-detect (Rule S4/S5).
 *
 * Layout and wiring asserted on source; transport and probe behaviour are
 * covered by stream.frame.test.ts, detect.test.ts and base-url.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const officeStore = read('../../../stores/office.ts');
const officeScreen = read('../../../screens/Office.tsx');
const reports = read('../../../screens/Reports.tsx');
const reportModal = read('../../../components/reports/GenerateReportModal.tsx');
const empty = read('../../../components/office/Empty.tsx');
const profile = read('../AgentSheetProfile.tsx');
const serverStream = '../../../../../server/src/services/stream.ts';
const streamSrc = read(serverStream);
const migrations = read('../../../../../server/src/db/migrations/002_agent_model_and_endpoint.sql');
const reportRoutes = read('../../../../../server/src/routes/reports.ts');

describe('live office stream', () => {
  it('frames every broadcast with a named SSE event', () => {
    expect(streamSrc).toContain('event: ${event.type}');
    expect(streamSrc).toContain('export function sseFrame');
    // both broadcast() and sendToClient() must go through the shared framer
    expect(streamSrc.match(/sseFrame\(event\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps listeners for the events the server actually emits', () => {
    for (const name of ['heartbeat', 'agent_status', 'approval_requested', 'task_update']) {
      expect(officeStore).toContain(`'${name}'`);
    }
    expect(officeStore).not.toContain(`'approval_request'`); // old, never-firing name
  });

  it('reads the approval and task payloads the server sends', () => {
    expect(officeStore).toContain('payload.approval');
    expect(officeStore).toContain('payload.task');
  });
});

describe('no fabricated data', () => {
  it('never falls back to demo KPI numbers when the API returns empty', () => {
    expect(officeStore).not.toContain('loadedKpis.length > 0 ? loadedKpis');
    expect(officeStore).toContain('kpis: []');
  });

  it('labels loaded demo agents so the UI can badge them', () => {
    expect(officeStore).toContain('isDemo: true');
  });

  it('drops the synthesised KPI sparkline from the reports screen', () => {
    expect(reports).not.toContain('kpi.value * 0.75');
    expect(reports).not.toContain('AreaChart');
    expect(reports).toContain('Tercatat');
  });

  it('only reports from really hired agents', () => {
    expect(reports).not.toMatch(/import\s*\{[^}]*DEMO_AGENTS/);
    expect(reports).toContain('!a.isDemo');
    expect(reportModal).not.toContain('demo-${activeDept}');
    expect(reportModal).toContain('Belum ada agen di divisi ini');
    expect(reportRoutes).not.toContain("startsWith('demo-')");
  });

  it('hides the status simulator from production builds (STUB-005)', () => {
    expect(officeScreen).toContain('import.meta.env.DEV && showSimPanel');
    expect(officeScreen).toContain("import.meta.env.DEV && (");
  });
});

describe('empty office onboarding', () => {
  it('leads with hiring a real agent, demo demoted to a labelled secondary', () => {
    expect(empty).toContain('onOpenRecruitment');
    expect(empty).toContain('Rekrut Agen Pertama');
    expect(empty).toContain('Lihat Kantor DEMO');
    const hireFirst = empty.indexOf('Rekrut Agen Pertama');
    const demo = empty.indexOf('Lihat Kantor DEMO');
    expect(hireFirst).toBeGreaterThan(-1);
    expect(hireFirst).toBeLessThan(demo);
  });
});

describe('per-agent connection & model auto-detect', () => {
  it('offers a probe that detects the models the gateway serves', () => {
    expect(profile).toContain('api.probeConnection');
    expect(profile).toContain('Mendeteksi model');
    expect(profile).toContain('data-testid="agent-connection"');
  });

  it('lets the owner pick the detected model per agent', () => {
    expect(profile).toContain('api.setAgentModel');
    expect(profile).toContain('knownModels.map');
    expect(profile).toContain('Model aktif');
  });

  it('keeps the API key server-side and off the wire (Rule S4)', () => {
    expect(profile).toContain('type="password"');
    expect(profile).not.toContain('agent.api_key');
  });

  it('migrates loopback endpoints away and adds the model column', () => {
    expect(migrations).toContain('ALTER TABLE agents ADD COLUMN model TEXT');
    expect(migrations).toContain('127.0.0.1:8642');
  });
});
