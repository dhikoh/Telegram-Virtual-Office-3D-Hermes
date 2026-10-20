import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import {
  type MockRun,
  completeRunOutput,
  streamRunEvents,
  streamChatCompletion,
} from './streaming.js';

export type { MockRun };

export class MockHermesServer {
  private server: http.Server | null = null;
  private runs = new Map<string, MockRun>();
  private port: number;

  constructor(port = 8642) {
    this.port = port;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.once('error', (err) => {
        reject(err);
      });
      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  public getPort(): number {
    return this.port;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (method === 'GET' && (pathname === '/health' || pathname === '/health/detailed')) {
      this.sendJson(res, 200, { status: 'ok', service: 'mock-hermes-gateway' });
      return;
    }

    if (method === 'GET' && pathname === '/v1/capabilities') {
      this.sendJson(res, 200, {
        object: 'hermes.api_server.capabilities',
        platform: 'hermes-agent',
        model: 'hermes-agent',
        auth: { type: 'bearer', required: true },
        features: {
          chat_completions: true,
          responses_api: true,
          run_submission: true,
          run_status: true,
          run_events_sse: true,
          run_stop: true,
          run_approval: true,
          reasoning_streaming: true,
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/models') {
      this.sendJson(res, 200, {
        object: 'list',
        data: [{ id: 'hermes-agent', object: 'model', owned_by: 'nousresearch' }],
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/jobs') {
      this.sendJson(res, 200, {
        jobs: [
          {
            id: 'job_daily_prospecting',
            name: 'Prospecting Harian & Kualifikasi Lead',
            cron: '0 8 * * 1-5',
            skills: ['prospecting'],
            state: 'active',
            last_status: 'success',
            last_run_at: Date.now() - 3600000 * 4,
            next_run_at: Date.now() + 3600000 * 20,
          },
          {
            id: 'job_financial_reconciliation',
            name: 'Rekonsiliasi Kas & Laporan Finansial',
            cron: '0 17 * * *',
            skills: ['accounting'],
            state: 'active',
            last_status: 'success',
            last_run_at: Date.now() - 3600000 * 12,
            next_run_at: Date.now() + 3600000 * 12,
          },
        ],
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/runs') {
      const body = await this.readBodyJson(req);
      const runId = `run_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const run: MockRun = {
        run_id: runId,
        status: 'started',
        input: (body && typeof body.input === 'string') ? body.input : '',
        created_at: Date.now(),
      };
      this.runs.set(runId, run);

      const needsApproval = /approval|transfer|approve|delete|persetujuan|alokasi/i.test(run.input);
      if (!needsApproval) {
        setTimeout(() => {
          if (run.status === 'started') {
            run.status = 'running';
            setTimeout(() => {
              if (run.status === 'running') {
                completeRunOutput(run);
              }
            }, 80);
          }
        }, 40);
      }

      this.sendJson(res, 202, { run_id: runId, status: 'started' });
      return;
    }

    const runMatch = pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (method === 'GET' && runMatch) {
      const runId = runMatch[1];
      const run = this.runs.get(runId);
      if (!run) {
        this.sendJson(res, 404, { error: 'run_not_found' });
        return;
      }
      this.sendJson(res, 200, {
        object: 'hermes.run',
        run_id: run.run_id,
        status: run.status,
        output: run.output || null,
        usage: { input_tokens: 150, output_tokens: 280, total_tokens: 430 },
      });
      return;
    }

    const eventsMatch = pathname.match(/^\/v1\/runs\/([^/]+)\/events$/);
    if (method === 'GET' && eventsMatch) {
      const runId = eventsMatch[1];
      const run = this.runs.get(runId);
      if (!run) {
        this.sendJson(res, 404, { error: 'run_not_found' });
        return;
      }
      streamRunEvents(run, res);
      return;
    }

    const approvalMatch = pathname.match(/^\/v1\/runs\/([^/]+)\/approval$/);
    if (method === 'POST' && approvalMatch) {
      const runId = approvalMatch[1];
      const run = this.runs.get(runId);
      if (!run) {
        this.sendJson(res, 404, { error: 'run_not_found' });
        return;
      }
      const body = await this.readBodyJson(req);
      const decision = (body && body.decision) ? body.decision : 'once';
      if (run.approvalResolver) {
        run.approvalResolver(decision);
        run.approvalResolver = undefined;
      }
      this.sendJson(res, 200, { status: 'resumed', decision });
      return;
    }

    const stopMatch = pathname.match(/^\/v1\/runs\/([^/]+)\/stop$/);
    if (method === 'POST' && stopMatch) {
      const runId = stopMatch[1];
      const run = this.runs.get(runId);
      if (!run) {
        this.sendJson(res, 404, { error: 'run_not_found' });
        return;
      }
      run.status = 'cancelled';
      if (run.sseResponse) {
        run.sseResponse.write(
          `data: ${JSON.stringify({ event: 'run.cancelled', data: { run_id: run.run_id } })}\n\n`
        );
        run.sseResponse.end();
      }
      this.sendJson(res, 200, { status: 'stopping' });
      return;
    }

    if (method === 'POST' && pathname === '/v1/chat/completions') {
      const body = await this.readBodyJson(req);
      if (body && body.stream) {
        streamChatCompletion(res);
      } else {
        this.sendJson(res, 200, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Halo dari Mock Hermes Agent.' },
              finish_reason: 'stop',
            },
          ],
        });
      }
      return;
    }

    this.sendJson(res, 404, { error: 'not_found' });
  }

  private readBodyJson(req: IncomingMessage): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });
  }

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}
