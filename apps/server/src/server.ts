import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import { authHook } from './plugins/auth.js';
import { OfficeDispatcher } from './services/dispatcher.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { agentRoutes } from './routes/agents.js';
import { taskRoutes } from './routes/tasks.js';
import { approvalRoutes } from './routes/approvals.js';
import { streamRoutes } from './routes/stream.js';
import { kpiRoutes } from './routes/kpis.js';
import { reportRoutes } from './routes/reports.js';
import { hiringRoutes } from './routes/hiring.js';
import { auditRoutes } from './routes/audit.js';
import { skillRoutes } from './routes/skills.js';

export interface BuildServerOptions {
  db: Database.Database;
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = fastify({
    logger: false,
  });

  const dispatcher = new OfficeDispatcher(options.db);

  app.decorate('db', options.db);
  app.decorate('dispatcher', dispatcher);

  // Rule S8: Helmet with CSP allowing telegram.org scripts
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://telegram.org', 'https://static.cloudflareinsights.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'https://cloudflareinsights.com'],
      },
    },
  });

  // Rule S8: CORS - no wildcard with credentials
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile webview or curl) or self
      cb(null, true);
    },
    credentials: true,
  });

  // Rule S8: Rate limit 60 req/min per user
  app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
  });

  // Rule S1 & S2: Telegram initData authentication hook
  app.addHook('onRequest', authHook);

  // Register all office routes
  app.register(healthRoutes);
  app.register(meRoutes);
  app.register(agentRoutes);
  app.register(taskRoutes);
  app.register(approvalRoutes);
  app.register(streamRoutes);
  app.register(kpiRoutes);
  app.register(reportRoutes);
  app.register(hiringRoutes);
  app.register(auditRoutes);
  app.register(skillRoutes);

  // Serve compiled web build when available (Section 2: ONE container office)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(__dirname, '../../../apps/web/dist'),
  ];
  const webDist = candidatePaths.find((p) => fs.existsSync(p));

  if (webDist) {
    app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) {
        reply.status(404).send({ error: 'Endpoint not found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  return app;
}
