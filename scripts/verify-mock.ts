import { MockHermesServer } from '../tools/mock-hermes/dist/server.js';

async function main() {
  const port = 8642;
  const server = new MockHermesServer(port);
  await server.start();
  process.stdout.write(`\nMock Hermes started on http://127.0.0.1:${port}\n\n`);

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
    process.stdout.write(`[1] GET /health response:\n${JSON.stringify(health, null, 2)}\n\n`);

    const capabilities = await fetch(`http://127.0.0.1:${port}/v1/capabilities`).then((r) => r.json());
    process.stdout.write(`[2] GET /v1/capabilities response:\n${JSON.stringify(capabilities, null, 2)}\n\n`);

    const models = await fetch(`http://127.0.0.1:${port}/v1/models`).then((r) => r.json());
    process.stdout.write(`[3] GET /v1/models response:\n${JSON.stringify(models, null, 2)}\n\n`);

    const runCreate = await fetch(`http://127.0.0.1:${port}/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Analisa performa media sosial minggu ini' }),
    }).then((r) => r.json());
    process.stdout.write(`[4] POST /v1/runs response:\n${JSON.stringify(runCreate, null, 2)}\n\n`);

    const runStatus = await fetch(`http://127.0.0.1:${port}/v1/runs/${runCreate.run_id}`).then((r) => r.json());
    process.stdout.write(`[5] GET /v1/runs/${runCreate.run_id} response:\n${JSON.stringify(runStatus, null, 2)}\n\n`);

    const chat = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: [{ role: 'user', content: 'Halo Hermes' }],
        stream: false,
      }),
    }).then((r) => r.json());
    process.stdout.write(`[6] POST /v1/chat/completions response:\n${JSON.stringify(chat, null, 2)}\n\n`);

    process.stdout.write(`✅ All mock endpoints verified successfully.\n`);
  } finally {
    await server.stop();
    process.stdout.write(`Mock Hermes server stopped.\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Verification failed: ${err}\n`);
  process.exit(1);
});
