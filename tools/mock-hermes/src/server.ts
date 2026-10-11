import http, { type IncomingMessage, type ServerResponse } from 'node:http';

export interface MockRun {
  run_id: string;
  status: 'started' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled';
  input: string;
  output?: string;
  created_at: number;
  approvalResolver?: (decision: string) => void;
  sseResponse?: ServerResponse;
}

export class MockHermesServer {
  private server: http.Server | null = null;
  private runs = new Map<string, MockRun>();
  private port: number;

  constructor(port = 8642) {
    this.port = port;
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
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
      this.streamRunEvents(run, res);
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
        this.streamChatCompletion(res);
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

  private streamRunEvents(run: MockRun, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    run.sseResponse = res;
    run.status = 'running';

    const send = (event: string, data: unknown) => {
      res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
    };

    send('run.started', { run_id: run.run_id, status: 'running' });

    setTimeout(() => {
      if (run.status === 'cancelled') return;
      send('tool.started', { run_id: run.run_id, tool: 'data_analyzer', preview: 'Analyzing input...' });
    }, 200);

    setTimeout(() => {
      if (run.status === 'cancelled') return;
      send('tool.completed', {
        run_id: run.run_id,
        tool: 'data_analyzer',
        duration: 0.4,
        error: false,
        preview: 'Dataset parsed.',
      });
    }, 400);

    const needsApproval = /approval|transfer|approve|delete/i.test(run.input);

    if (needsApproval) {
      setTimeout(() => {
        if (run.status === 'cancelled') return;
        run.status = 'waiting_for_approval';
        send('approval.request', {
          run_id: run.run_id,
          action: 'confirm_critical_action',
          summary: 'Permintaan persetujuan aksi kritis oleh agen',
          payload: { detail: 'Aksi memerlukan otorisasi pimpinan kantor virtual.' },
        });

        run.approvalResolver = (decision: string) => {
          if (decision === 'deny') {
            run.status = 'failed';
            send('run.failed', { run_id: run.run_id, error: 'Approval denied by user' });
            res.end();
          } else {
            run.status = 'running';
            send('tool.completed', {
              run_id: run.run_id,
              tool: 'confirm_critical_action',
              duration: 1.0,
              error: false,
              preview: 'Aksi telah disetujui.',
            });
            this.finishRun(run, send, res);
          }
        };
      }, 600);
    } else {
      setTimeout(() => {
        if (run.status === 'cancelled') return;
        send('message.interim', {
          run_id: run.run_id,
          text: 'Menyusun laporan ringkas...',
          already_streamed: false,
        });
        this.finishRun(run, send, res);
      }, 600);
    }
  }

  private finishRun(run: MockRun, send: (e: string, d: unknown) => void, res: ServerResponse): void {
    setTimeout(() => {
      if (run.status === 'cancelled') return;
      run.status = 'completed';
      run.output = `Hasil tugas untuk: "${run.input || 'Operasional'}" telah selesai dengan status sukses.`;
      send('run.completed', {
        run_id: run.run_id,
        status: 'completed',
        output: run.output,
        usage: { input_tokens: 110, output_tokens: 220, total_tokens: 330 },
      });
      res.end();
    }, 300);
  }

  private streamChatCompletion(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write(
      `data: ${JSON.stringify({
        id: 'chatcmpl_mock',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Halo dari ' }, finish_reason: null }],
      })}\n\n`
    );

    res.write(`event: hermes.tool.progress\ndata: ${JSON.stringify({ step: 'checking status' })}\n\n`);

    res.write(
      `data: ${JSON.stringify({
        id: 'chatcmpl_mock',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'Hermes Virtual Office!' }, finish_reason: 'stop' }],
      })}\n\n`
    );

    res.write('data: [DONE]\n\n');
    res.end();
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
