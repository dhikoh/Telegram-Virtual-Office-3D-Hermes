/**
 * Tahap 14 acceptance — sisi web proyek & DAG (source-assertion).
 *
 * Perilaku server (dekomposisi jujur, rantai berantai, ringkasan final)
 * dicakup apps/server/src/tahap14.test.ts. Test ini mengunci wiring web:
 *  - More.tsx punya pintu "Proyek & Alur Kerja" + memuat ProjectsModal;
 *  - api.ts punya createProject/listProjects/getProject/runProject;
 *  - ProjectsModal memuat peta DAG (svg/node), warna node dari departemen,
 *    error dekomposisi tampil apa adanya, tombol jalankan, ringkasan hasil;
 *  - manifest endpoints phase 14 lengkap.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const more = read('../../../screens/More.tsx');
const modal = read('../ProjectsModal.tsx');
const api = read('../../../services/api.ts');
const endpoints = read('../../../../../../packages/shared/src/endpoints.ts');

describe('pintu proyek di layar More', () => {
  it('menyediakan tombol Proyek & Alur Kerja dan me-mount ProjectsModal', () => {
    expect(more).toContain("from '../components/more/ProjectsModal'");
    expect(more).toContain('Proyek &amp; Alur Kerja');
    expect(more).toContain('setIsProjectsOpen(true)');
    expect(more).toContain('<ProjectsModal');
    expect(more).toContain('isProjectsOpen}');
  });
});

describe('kontrak API proyek', () => {
  it('api.ts memuat empat metode proyek ke endpoint yang benar', () => {
    expect(api).toContain('createProject');
    expect(api).toContain("request<{ project: Project }>('/projects', { method: 'POST'");
    expect(api).toContain('listProjects');
    expect(api).toContain("'/projects'");
    expect(api).toContain('getProject');
    expect(api).toContain('`/projects/${id}`');
    expect(api).toContain('runProject');
    expect(api).toContain('`/projects/${id}/run`');
  });

  it('endpoints.ts memuat 4 entri phase 14', () => {
    const phase14 = endpoints.match(/phase: 14/g) ?? [];
    expect(phase14.length).toBeGreaterThanOrEqual(4);
    expect(endpoints).toContain("path: '/api/projects'");
    expect(endpoints).toContain("path: '/api/projects/:id/run'");
  });
});

describe('peta DAG di ProjectsModal', () => {
  it('menggambar node + edge dependensi dalam SVG murni', () => {
    expect(modal).toContain('const DagMap');
    expect(modal).toContain('<svg');
    expect(modal).toContain('data-testid="project-dag"');
    expect(modal).toContain('data-testid="dag-node"');
    expect(modal).toContain('depends_on');
    expect(modal).toContain('computeLevels');
  });

  it('warna node berasal dari warna departemen agen (data, bukan konstanta)', () => {
    expect(modal).toContain('agentColor');
    expect(modal).toContain('useOfficeStore');
    expect(modal).toContain('departments');
    expect(modal).toContain('agent.department');
  });

  it('status node memakai gaya per status (queued/running/done/failed)', () => {
    expect(modal).toContain('queued');
    expect(modal).toContain('running');
    expect(modal).toContain('done');
    expect(modal).toContain('failed');
  });

  it('galat dekomposisi tampil apa adanya dan tombol jalankan ada', () => {
    expect(modal).toContain('decompose_error');
    expect(modal).toContain('data-testid="project-decompose-error"');
    expect(modal).toContain('data-testid="project-run"');
    expect(modal).toContain('api.runProject');
    expect(modal).toContain('data-testid="project-summary"');
    expect(modal).toContain('project.summary');
  });

  it('status live memakai listener task_update store yang sudah ada, bukan EventSource baru', () => {
    expect(modal).not.toContain('new EventSource');
    expect(modal).toContain('tasks: storeTasks');
    expect(modal).toContain('refreshDetail');
  });
});
