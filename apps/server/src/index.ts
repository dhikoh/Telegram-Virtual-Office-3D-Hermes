import { buildServer } from './server.js';
import { getDatabase, closeDatabase } from './db/index.js';
import { config } from './config.js';
import { stopMediaSweepTimer } from './services/media.js';

const db = getDatabase(config.DB_PATH);
const app = buildServer({ db });

app.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
  if (err) {
    process.stderr.write(`Failed to start office server: ${err}\n`);
    process.exit(1);
  }
  process.stdout.write(`Hermes Virtual Office server running on ${address}\n`);
});

let isShuttingDown = false;
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  process.stdout.write(`Received ${signal}, initiating graceful shutdown...\n`);
  try {
    stopMediaSweepTimer();
    await app.close();
    closeDatabase();
    process.stdout.write('shutdown complete\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Shutdown error: ${err}\n`);
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
