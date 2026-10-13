/**
 * Tahap 8 / STUB-004 — kontrak frame SSE diuji terhadap SAMPEL NYATA VPS
 * (bukan fixture karangan): `docs/samples/live_vps_stream_frames.jsonl`
 * ditangkap dari https://app.zupu.web.id/api/stream selama satu run sungguhan
 * (2026-10-13, container image 9387636).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const samplePath = resolve(
  import.meta.dirname,
  '../../../../docs/samples/live_vps_stream_frames.jsonl'
);
const frames = readFileSync(samplePath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as { ts: number; event: string; data: Record<string, unknown> });

describe('Live VPS stream frames (real capture)', () => {
  it('contains a meaningful number of frames', () => {
    expect(frames.length).toBeGreaterThanOrEqual(10);
  });

  it('every frame carries a timestamp, a named event and parsed data', () => {
    for (const f of frames) {
      expect(typeof f.ts).toBe('number');
      expect(typeof f.event).toBe('string');
      expect(f.event.length).toBeGreaterThan(0);
      expect(f.data).toBeTypeOf('object');
    }
  });

  it("upholds the Tahap 7 contract: data.type equals the named event (SSE 'event:' field)", () => {
    for (const f of frames) {
      expect(f.data.type).toBe(f.event);
    }
  });

  it('captures heartbeat, task_update and agent_status events', () => {
    const events = new Set(frames.map((f) => f.event));
    expect(events.has('heartbeat')).toBe(true);
    expect(events.has('task_update')).toBe(true);
    expect(events.has('agent_status')).toBe(true);
  });

  it('heartbeats arrive with monotonic timestamps', () => {
    const hb = frames.filter((f) => f.event === 'heartbeat').map((f) => f.ts);
    expect(hb.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < hb.length; i++) {
      expect(hb[i]).toBeGreaterThan(hb[i - 1]);
    }
  });

  it('captures the full run lifecycle: backlog -> running -> done with real output', () => {
    const statuses = frames
      .filter((f) => f.event === 'task_update')
      .map((f) => (f.data.task as { status: string }).status);
    expect(statuses).toContain('backlog');
    expect(statuses).toContain('running');
    expect(statuses).toContain('done');
    const done = frames.find(
      (f) => f.event === 'task_update' && (f.data.task as { status: string }).status === 'done'
    );
    const result = (done!.data.task as { result_md: string | null }).result_md;
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('task_update frames carry a real task payload with a status', () => {
    const updates = frames.filter((f) => f.event === 'task_update');
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) {
      const task = u.data.task as { id: string; status: string } | undefined;
      expect(task).toBeTruthy();
      expect(typeof task!.id).toBe('string');
      expect(typeof task!.status).toBe('string');
    }
  });
});
