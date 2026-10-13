/**
 * Tahap 7 — SSE framing (Rule S6 transport contract).
 *
 * The server used to write bare `data:` frames. EventSource delivers those as
 * the DEFAULT `message` event, so every named listener in the web app
 * (`agent_status`, `task_update`, `approval_requested`, `heartbeat`) never
 * fired. These tests pin the frame format that makes them fire again, plus the
 * payload shapes the client reads.
 */
import { describe, it, expect } from 'vitest';
import { sseFrame } from './stream.js';
import type { NormalizedOfficeEvent } from '@hermes-office/shared';

describe('sseFrame', () => {
  it('emits a named event line so addEventListener() handlers fire', () => {
    const frame = sseFrame({ type: 'agent_status', agent_id: 'a1', status: 'working', timestamp: 1 });
    expect(frame.startsWith('event: agent_status\n')).toBe(true);
    expect(frame.endsWith('\n\n')).toBe(true);
  });

  it('keeps a parseable data line for onmessage consumers', () => {
    const frame = sseFrame({ type: 'heartbeat', timestamp: 42 });
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse(dataLine!.slice(6));
    expect(parsed).toEqual({ type: 'heartbeat', timestamp: 42 });
  });

  it('uses the same names the web app listens for', () => {
    const types: NormalizedOfficeEvent['type'][] = [
      'agent_status',
      'task_update',
      'approval_requested',
      'heartbeat',
    ];
    for (const type of types) {
      expect(sseFrame({ type, timestamp: 0 }).startsWith(`event: ${type}\n`)).toBe(true);
    }
  });

  it('carries the approval object shape the client reads (payload.approval.summary)', () => {
    const frame = sseFrame({
      type: 'approval_requested',
      agent_id: 'a1',
      approval: {
        id: 'appr_1',
        run_id: 'run_1',
        agent_id: 'a1',
        summary: 'Publikasi tweet',
        status: 'pending',
        created_at: 1,
      },
      timestamp: 1,
    });
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice(6)) as { approval?: { summary?: string } };
    expect(parsed.approval?.summary).toBe('Publikasi tweet');
  });

  it('carries the task object shape the client reads (payload.task.id/status)', () => {
    const frame = sseFrame({
      type: 'task_update',
      agent_id: 'a1',
      task: { id: 't1', status: 'failed', title: 'Riset', agent_id: 'a1' },
      timestamp: 1,
    });
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice(6)) as { task?: { id?: string; status?: string } };
    expect(parsed.task?.id).toBe('t1');
    expect(parsed.task?.status).toBe('failed');
  });
});
