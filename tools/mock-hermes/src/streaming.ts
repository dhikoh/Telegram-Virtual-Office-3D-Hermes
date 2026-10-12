import type { ServerResponse } from 'node:http';

export interface MockRun {
  run_id: string;
  status: 'started' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled';
  input: string;
  output?: string;
  created_at: number;
  approvalResolver?: (decision: string) => void;
  sseResponse?: ServerResponse;
}

export function completeRunOutput(run: MockRun): void {
  run.status = 'completed';

  if (run.input.includes('strictly valid JSON') || run.input.includes('VERIFIED DATA')) {
    if (run.input.includes('SIMULATE_INVALID_JSON')) {
      run.output = 'Laporan narasi tanpa JSON yang valid: data meningkat drastis.';
    } else {
      run.output = JSON.stringify({
        summary_md: `### Ringkasan Eksekutif KPI\nBerdasarkan data KPI departemen, seluruh indikator menunjukkan stabilitas tinggi dan kepatuhan penuh terhadap target operasional.`,
        insights: [
          'Seluruh indikator kinerja utama tercapai dengan baik.',
          'Tidak ada penyimpangan signifikan dari rencana kuartalan.',
        ],
        risks: ['Fluktuasi beban server pada jam operasional puncak.'],
        actions: [
          'Pertahankan pengawasan metrik harian.',
          'Lakukan optimalisasi alokasi sumber daya mingguan.',
        ],
      });
    }
  } else {
    run.output = `Hasil tugas untuk: "${run.input || 'Operasional'}" telah selesai dengan status sukses.`;
  }
}

function finishRun(run: MockRun, send: (e: string, d: unknown) => void, res: ServerResponse): void {
  setTimeout(() => {
    if (run.status === 'cancelled') return;
    completeRunOutput(run);

    send('run.completed', {
      run_id: run.run_id,
      status: 'completed',
      output: run.output,
      usage: { input_tokens: 110, output_tokens: 220, total_tokens: 330 },
    });
    res.end();
  }, 150);
}

export function streamRunEvents(run: MockRun, res: ServerResponse): void {
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

  const needsApproval = /approval|transfer|approve|delete|persetujuan|alokasi/i.test(run.input);

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
          finishRun(run, send, res);
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
      finishRun(run, send, res);
    }, 600);
  }
}

export function streamChatCompletion(res: ServerResponse): void {
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
