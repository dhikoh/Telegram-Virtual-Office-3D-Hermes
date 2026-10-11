import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockHermesServer } from './server.js';

describe('MockHermesServer', () => {
  const testPort = 8645;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  const server = new MockHermesServer(testPort);

  beforeAll(async () => {
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('responds with 200 on /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('returns valid capabilities on /v1/capabilities', async () => {
    const res = await fetch(`${baseUrl}/v1/capabilities`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.features.run_submission).toBe(true);
    expect(data.features.run_approval).toBe(true);
  });

  it('lists models on /v1/models', async () => {
    const res = await fetch(`${baseUrl}/v1/models`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data[0].id).toBe('hermes-agent');
  });

  it('creates a new run and polls status', async () => {
    const createRes = await fetch(`${baseUrl}/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Tolong buat ringkasan data kantor.' }),
    });
    expect(createRes.status).toBe(202);
    const createData = await createRes.json();
    expect(createData.run_id).toBeDefined();

    const statusRes = await fetch(`${baseUrl}/v1/runs/${createData.run_id}`);
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.run_id).toBe(createData.run_id);
    expect(['started', 'running']).toContain(statusData.status);
  });

  it('handles run stop endpoint', async () => {
    const createRes = await fetch(`${baseUrl}/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Long running task' }),
    });
    const { run_id } = await createRes.json();

    const stopRes = await fetch(`${baseUrl}/v1/runs/${run_id}/stop`, {
      method: 'POST',
    });
    expect(stopRes.status).toBe(200);
    const stopData = await stopRes.json();
    expect(stopData.status).toBe('stopping');
  });
});
