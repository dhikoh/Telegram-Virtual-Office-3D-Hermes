import { MockHermesServer } from './server.js';

const port = Number(process.env.MOCK_PORT || process.env.PORT || 8642);
const server = new MockHermesServer(port);

server.start().then(() => {
  process.stdout.write(`Mock Hermes Gateway listening on http://127.0.0.1:${port}\n`);
});

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
