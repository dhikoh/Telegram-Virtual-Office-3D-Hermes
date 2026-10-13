/**
 * Tahap 10 — departments REST (docs/DESIGN_DIRECTION.md §5, keputusan 7.10).
 *
 *   GET    /api/departments          list rooms (chip order)
 *   POST   /api/departments          create a custom room (owner)
 *   PATCH  /api/departments/:id      rename / recolor / reorder / hide
 *   DELETE /api/departments/:id      custom rooms only, and only when empty
 *
 * The eight seeded rooms (is_system) are never deletable — hiding them is
 * the supported way to "reduce" the floor plan.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Database } from 'better-sqlite3';
import { AuditRepository } from '../db/repositories/audit.js';
import {
  countAgentsInDepartment,
  createDepartment,
  deleteDepartment,
  getDepartment,
  listDepartments,
  updateDepartment,
} from '../db/repositories/departments.js';
import type { DepartmentRow } from '../db/repositories/departments.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return base || `room-${Date.now().toString(36)}`;
}

function toPublic(row: DepartmentRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sort_order: row.sort_order,
    is_system: row.is_system === 1,
    hidden: row.hidden === 1,
    created_at: row.created_at,
  };
}

export const departmentRoutes: FastifyPluginAsync<{ db: Database }> = async (
  fastify: FastifyInstance,
  opts: { db: Database }
) => {
  const db = opts.db;
  const auditRepo = new AuditRepository(db);

  fastify.get('/api/departments', async () => listDepartments(db).map(toPublic));

  fastify.post('/api/departments', async (request, reply) => {
    const body = (request.body ?? {}) as { name?: string; color?: string };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 40) {
      return reply.code(400).send({
        error: 'invalid_input',
        message: 'Nama ruang wajib diisi (maks. 40 karakter).',
      });
    }
    const color = typeof body.color === 'string' ? body.color : '#94A3B8';
    if (!HEX.test(color)) {
      return reply
        .code(400)
        .send({ error: 'invalid_input', message: 'Warna harus heksa 6 digit (contoh #22D3EE).' });
    }

    let id = slugify(name);
    while (getDepartment(db, id)) id = `${id}-${Math.floor(Math.random() * 90 + 10)}`;

    const row = createDepartment(db, id, { name, color });
    auditRepo.logAction(request.user!.id, 'department.create', id, JSON.stringify({ name, color }));

    return reply.code(201).send(toPublic(row));
  });

  fastify.patch<{ Params: { id: string } }>('/api/departments/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = getDepartment(db, id);
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Ruang tidak ditemukan.' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: { name?: string; color?: string; sort_order?: number; hidden?: number } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 40) {
        return reply
          .code(400)
          .send({ error: 'invalid_input', message: 'Nama ruang wajib (maks. 40 karakter).' });
      }
      patch.name = name;
    }
    if (body.color !== undefined) {
      const color = String(body.color);
      if (!HEX.test(color)) {
        return reply
          .code(400)
          .send({ error: 'invalid_input', message: 'Warna harus heksa 6 digit (contoh #22D3EE).' });
      }
      patch.color = color;
    }
    if (body.sort_order !== undefined) {
      const order = Number(body.sort_order);
      if (!Number.isFinite(order)) {
        return reply
          .code(400)
          .send({ error: 'invalid_input', message: 'sort_order harus angka.' });
      }
      patch.sort_order = order;
    }
    if (body.hidden !== undefined) {
      patch.hidden = body.hidden ? 1 : 0;
    }

    const updated = updateDepartment(db, id, patch);
    auditRepo.logAction(request.user!.id, 'department.update', id, JSON.stringify(patch));

    return updated ? toPublic(updated) : null;
  });

  fastify.delete<{ Params: { id: string } }>('/api/departments/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = getDepartment(db, id);
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Ruang tidak ditemukan.' });
    }
    if (existing.is_system) {
      return reply.code(403).send({
        error: 'system_room',
        message: 'Ruang bawaan tidak bisa dihapus — sembunyikan saja lewat Sembunyikan/Tampilkan.',
      });
    }
    if (countAgentsInDepartment(db, id) > 0) {
      return reply.code(409).send({
        error: 'department_in_use',
        message: 'Masih ada agen aktif di ruang ini — pindahkan dulu sebelum menghapus.',
      });
    }

    deleteDepartment(db, id);
    auditRepo.logAction(request.user!.id, 'department.delete', id);

    return { ok: true, id };
  });
};
