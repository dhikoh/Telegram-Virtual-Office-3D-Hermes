/**
 * F-09: Typed Fastify decorations.
 * Augments the FastifyInstance interface so that fastify.db and fastify.dispatcher
 * are strongly typed, eliminating all (fastify as any) casts in route files.
 */
import type Database from 'better-sqlite3';
import type { OfficeDispatcher } from '../services/dispatcher.js';
import type { ProjectService } from '../services/projects.js';
import type { ExecutiveBriefingService } from '../services/briefing-scheduler.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
    dispatcher: OfficeDispatcher;
    projectService: ProjectService;
    briefingScheduler: ExecutiveBriefingService;
    /** Fase 2a — interval heartbeat stream chat (ms). */
    chatHeartbeatMs: number;
    /** Fase 2d — batas deteksi stall stream chat (ms). */
    chatStallMs: number;
    /** Fase 2d — model fallback saat stall (opsional). */
    chatFallbackModel?: string;
  }
}
