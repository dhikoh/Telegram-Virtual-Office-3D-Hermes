/**
 * Tahap 10 — route-level test: ruang kantor jadi data.
 *
 *  - 8 ruang bawaan ter-seed (is_system) dan urut sesuai sort_order;
 *  - PATCH mengganti nama + warna, warna bukan heksa ditolak 400;
 *  - POST ruang custom dapat id slug & is_system=false, DELETE mengembalikan
 *    ok; DELETE ruang bawaan selalu 403 system_room;
 *  - ruang custom yang masih berpenghuni agen aktif ditolak 409
 *    department_in_use (tidak ada agen yang kehilangan ruangan diam-diam);
 *  - setiap tulisan agen/KPI melewati departmentExists: id ruang tak dikenal
 *    (mis. 'lava') jatuh ke 400 invalid_input.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

interface DepartmentPublic {
  id: string;
  name: string | null;
  color: string;
  sort_order: number;
  is_system: boolean;
  hidden: boolean;
}

describe('Tahap 10 — departments sebagai data', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const listDepartments = async () => {
    const res = await app.inject({ method: 'GET', url: '/api/departments', headers: authHeader });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as DepartmentPublic[];
  };

  const createAgent = async (id: string, department: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authHeader,
      body: JSON.stringify({
        id,
        name: 'Tahap Ten',
        role: 'QA',
        department,
        avatar: '🧪',
        soul_summary: 'Agent uji Tahap 10',
        hermes_base_url: null,
        api_key_env: 'HERMES_KEY_DEFAULT',
        hermes_profile: 'default',
        active: 1,
        hired_at: Date.now(),
        created_at: Date.now(),
      }),
    });
    return res;
  };

  const createRoom = async (name: string, color = '#38BDF8') => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/departments',
      headers: authHeader,
      body: JSON.stringify({ name, color }),
    });
    return res;
  };

  const patchRoom = async (id: string, body: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/api/departments/${id}`,
      headers: authHeader,
      body: JSON.stringify(body),
    });

  const deleteRoom = async (id: string) =>
    app.inject({ method: 'DELETE', url: `/api/departments/${id}`, headers: authHeader });

  it('seeds the eight original rooms as system rows in chip order', async () => {
    const rooms = await listDepartments();
    const system = rooms.filter((r) => r.is_system);
    expect(system.map((r) => r.id)).toEqual([
      'command',
      'social',
      'sales',
      'finance',
      'marketing',
      'analytics',
      'support',
      'hr',
    ]);
    // Ordered by sort_order, and every seeded row starts visible & unnamed
    // (null name = the i18n label wins in the UI).
    expect(system.map((r) => r.sort_order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(system.every((r) => r.name === null)).toBe(true);
    expect(system.every((r) => r.hidden === false)).toBe(true);
  });

  it('renames and recolours a seeded room, and rejects a non-hex colour', async () => {
    const ok = await patchRoom('command', { name: 'Komando', color: '#123ABC' });
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body) as DepartmentPublic;
    expect(body.name).toBe('Komando');
    expect(body.color).toBe('#123ABC');
    expect(body.is_system).toBe(true);

    const renamed = (await listDepartments()).find((r) => r.id === 'command');
    expect(renamed?.name).toBe('Komando');

    const bad = await patchRoom('command', { color: 'biru' });
    expect(bad.statusCode).toBe(400);
    expect((JSON.parse(bad.body) as { error: string }).error).toBe('invalid_input');
    expect((await listDepartments()).find((r) => r.id === 'command')?.color).toBe('#123ABC');
  });

  it('creates a custom room with a slug id and deletes it when empty', async () => {
    const res = await createRoom('Riset');
    expect(res.statusCode).toBe(201);
    const room = JSON.parse(res.body) as DepartmentPublic;
    expect(room.id).toBe('riset');
    expect(room.name).toBe('Riset');
    expect(room.is_system).toBe(false);
    expect(room.hidden).toBe(false);

    const rooms = await listDepartments();
    expect(rooms.find((r) => r.id === 'riset')).toBeTruthy();
    // Custom rooms sort after the seeded block (max sort_order + 10).
    expect(room.sort_order).toBe(Math.max(...rooms.map((r) => r.sort_order)));

    const del = await deleteRoom('riset');
    expect([200, 201]).toContain(del.statusCode);
    expect(JSON.parse(del.body) as { ok: boolean; id: string }).toEqual({ ok: true, id: 'riset' });
    expect((await listDepartments()).some((r) => r.id === 'riset')).toBe(false);
  });

  it('refuses to delete a seeded room with 403 system_room', async () => {
    const res = await deleteRoom('command');
    expect(res.statusCode).toBe(403);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('system_room');
    expect((await listDepartments()).some((r) => r.id === 'command')).toBe(true);
  });

  it('keeps a custom room alive while an agent still works there (409)', async () => {
    const created = await createRoom('Quality Assurance', '#34D399');
    expect(created.statusCode).toBe(201);
    const roomId = (JSON.parse(created.body) as DepartmentPublic).id;
    expect(roomId).toBe('quality-assurance');

    const agent = await createAgent('agent_t10_room', roomId);
    expect(agent.statusCode).toBe(201);

    const conflict = await deleteRoom(roomId);
    expect(conflict.statusCode).toBe(409);
    expect((JSON.parse(conflict.body) as { error: string }).error).toBe('department_in_use');

    // Move the agent out, then the room becomes deletable again.
    const moved = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent_t10_room',
      headers: authHeader,
      body: JSON.stringify({ department: 'support' }),
    });
    expect(moved.statusCode).toBe(200);
    const deleted = await deleteRoom(roomId);
    expect(deleted.statusCode).toBe(200);
  });

  it('rejects an unknown department on agent create and agent move', async () => {
    const created = await createAgent('agent_t10_lava', 'lava');
    expect(created.statusCode).toBe(400);
    expect((JSON.parse(created.body) as { error: string }).error).toBe('invalid_input');

    const moveTarget = await createAgent('agent_t10_move', 'support');
    expect(moveTarget.statusCode).toBe(201);

    const moved = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent_t10_move',
      headers: authHeader,
      body: JSON.stringify({ department: 'lava' }),
    });
    expect(moved.statusCode).toBe(400);
    const movedBody = JSON.parse(moved.body) as { error: string; message: string };
    expect(movedBody.error).toBe('invalid_input');
    expect(movedBody.message).toContain('lava');
  });

  it('rejects a KPI recorded against an unknown room', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/kpis',
      headers: authHeader,
      body: JSON.stringify({
        department: 'lava',
        key: 'revenue',
        label: 'Pendapatan',
        value: 42,
      }),
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('invalid_input');

    // Same payload against a live room still lands.
    const ok = await app.inject({
      method: 'POST',
      url: '/api/kpis',
      headers: authHeader,
      body: JSON.stringify({
        department: 'finance',
        key: 'revenue',
        label: 'Pendapatan',
        value: 42,
      }),
    });
    expect(ok.statusCode).toBe(201);
    expect((JSON.parse(ok.body) as { department: string }).department).toBe('finance');
  });
});
