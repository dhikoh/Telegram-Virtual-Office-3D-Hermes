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
import { ProjectService } from './services/projects.js';
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
import { departmentRoutes } from './routes/departments.js';
import { mediaRoutes } from './routes/media.js';
import { projectRoutes } from './routes/projects.js';
import { config } from './config.js';
import { startMediaSweepTimer, stopMediaSweepTimer, sweepRetention } from './services/media.js';

export interface BuildServerOptions {
  db: Database.Database;
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = fastify({
    logger: false,
  });

  const dispatcher = new OfficeDispatcher(options.db);

  // Tahap 14 — rantai proyek disambung ke satu-satunya funnel status task
  // (dispatcher.updateTask): tanpa polling, tanpa listener SSE kedua.
  const projectService = new ProjectService(options.db, () => dispatcher);
  dispatcher.onTaskSettled = (taskId) => {
    void projectService.handleSettled(taskId).catch(() => undefined);
  };

  app.decorate('db', options.db);
  app.decorate('dispatcher', dispatcher);
  app.decorate('projectService', projectService);

  // Rule S8: Helmet with CSP allowing telegram.org scripts
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://telegram.org', 'https://static.cloudflareinsights.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // `data:` is load-bearing, not a relaxation for convenience. The CC0
        // character GLBs embed their texture as a `data:image/png` URI, and
        // three.js loads GLB textures through ImageBitmapLoader, which uses
        // `fetch()` — so the texture is a connect-src request, not an img-src
        // one. Without it the loader's catch() swaps in a default white
        // texture and every agent renders as an untextured grey blob, while
        // geometry, skinning and all 32 clips keep working (verified: a GLB
        // through this policy reports NO TEXTURE; with `data:` it reports
        // 512x512 with 115384 saturated pixels). `data:` grants no network
        // access, so the "zero remote 3D requests" rule (9.4) still holds —
        // https://example.com stays blocked either way.
        connectSrc: ["'self'", 'data:', 'https://cloudflareinsights.com'],
        // Telegram Web membuka Mini App di dalam iframe — izinkan hanya
        // origin Telegram (bukan 'self' semata), tanpa membuka frame ke pihak lain.
        frameAncestors: ["'self'", 'https://web.telegram.org'],
      },
    },
    // X-Frame-Options SAMEORIGIN (default helmet) menolak iframe web.telegram.org;
    // batasan framing sudah ditangani frameAncestors di atas.
    xFrameOptions: false,
  });

  // Rule S8: CORS - no wildcard with credentials
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile webview or curl) or self
      cb(null, true);
    },
    credentials: true,
  });

  // Rule S8: Rate limit per-route (auth 5/min, health 60/min, stream 60/min, private 30/min)
  app.register(rateLimit, {
    global: true,
    keyGenerator: (req) => `${req.ip}:${req.headers.authorization || 'anon'}:${req.url.split('?')[0]}`,
    max: (req) => {
      const url = req.url;
      if (url.startsWith('/api/auth')) return 5;
      if (url.startsWith('/api/health')) return 60;
      if (url.startsWith('/api/stream')) return 60;
      return 30;
    },
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
  app.register(departmentRoutes, { db: options.db });
  app.register(mediaRoutes);
  app.register(projectRoutes);

  // Tahap 12 — retensi media: sekali saat startup + interval berkala.
  // NODE_ENV=test sengaja dilewati supaya unit test tidak mewarisi timer aktif
  // (timer-nya juga bisa dimatikan dengan MEDIA_SWEEP_DISABLED=1).
  if (config.NODE_ENV !== 'test' && !config.MEDIA_SWEEP_DISABLED) {
    try {
      sweepRetention(options.db);
    } catch (err) {
      app.log?.error?.({ err }, 'startup media sweep failed');
    }
    startMediaSweepTimer(options.db);
  }

  app.addHook('onClose', async () => {
    dispatcher.destroy();
    stopMediaSweepTimer();
  });

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
