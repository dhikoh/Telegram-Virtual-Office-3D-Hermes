import { buildServer } from './server.js';
import { getDatabase } from './db/index.js';
import { config } from './config.js';

const db = getDatabase(config.DB_PATH);
const app = buildServer({ db });

app.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
  if (err) {
    process.stderr.write(`Failed to start office server: ${err}\n`);
    process.exit(1);
  }
  process.stdout.write(`Hermes Virtual Office server running on ${address}\n`);
});

process.on('SIGINT', async () => {
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await app.close();
  process.exit(0);
});
