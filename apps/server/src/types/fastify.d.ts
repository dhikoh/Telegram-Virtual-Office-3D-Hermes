/**
 * F-09: Typed Fastify decorations.
 * Augments the FastifyInstance interface so that fastify.db and fastify.dispatcher
 * are strongly typed, eliminating all (fastify as any) casts in route files.
 */
import type Database from 'better-sqlite3';
import type { OfficeDispatcher } from '../services/dispatcher.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
    dispatcher: OfficeDispatcher;
  }
}
