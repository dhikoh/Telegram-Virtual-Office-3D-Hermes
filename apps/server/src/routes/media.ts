/**
 * Tahap 12 — media chat & artefak.
 *
 *   POST /api/agents/:id/media        unggah gambar chat (multipart, 1 berkas)
 *   POST /api/agents/:id/artifacts    unggah keluaran agen (video/gambar hasil run)
 *   GET  /api/media?agent_id=         daftar media satu agen (tanpa path fisik)
 *   GET  /api/artifacts/:id/download  unduh artefak dengan tipe aslinya
 *
 * Gambar yang diunggah TIDAK hanya disimpan: ia juga diteruskan ke sesi gateway
 * agen sebagai content part OpenAI-compatible (teks + image_url data URL), persis
 * lewat client yang dipakai route chat. Bila gateway menolak, unggahan tetap 201
 * (berkas dan barisnya memang sudah tersimpan) TAPI pesan galat gateway ikut
 * dikirim apa adanya sebagai `gateway_error` — tidak pernah mengaku sukses.
 *
 * Keputusan desain Tahap 12: endpoint sesi gateway (`/api/sessions/:id/chat/stream`)
 * hanya menerima `message` berupa string, jadi konten multimodal dikirim sebagai
 * array content part. Bila gateway versi lama menolak array itu, penolakan itulah
 * yang dilaporkan ke UI (jujur), bukan di-silent.
 */
import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { getHermesClientForAgent } from '../services/hermes/index.js';
import type { ChatContentPart } from '../services/hermes/client.interface.js';
import {
  absoluteMediaPath,
  getMediaById,
  listMedia,
  mediaSettings,
  saveMedia,
  toPublic,
} from '../services/media.js';

/** Rule: hanya gambar yang memang bisa ditampilkan di bubble chat. */
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Nama berkas untuk header Content-Disposition — tanpa kutip / karakter kontrol. */
function downloadFileName(name: string | null, id: string, mime: string): string {
  const cleaned = (name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n"\\]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
  if (cleaned) return cleaned;
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '';
  return `${id}${ext}`;
}

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;
  const agentRepo = new AgentRepository(db);
  const auditRepo = new AuditRepository(db);

  const limits = mediaSettings();
  const maxUploadMb = Math.max(1, Math.round(limits.uploadMaxBytes / (1024 * 1024)));

  await fastify.register(multipart, {
    limits: { fileSize: limits.uploadMaxBytes, files: 1, fields: 4 },
    // Truncation is reported through part.file.truncated so the route can answer
    // with an honest, office-shaped 413 instead of a raw framework error.
    throwFileSizeLimit: false,
  });

  // Errors that belong to this scope (multipart parsing) get office-shaped bodies.
  fastify.setErrorHandler((err, request, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode === 413 || (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({
        error: 'payload_too_large',
        message: `Ukuran berkas melebihi batas ${maxUploadMb} MB.`,
      });
    }
    if (statusCode === 400) {
      return reply.code(400).send({ error: 'invalid_input', message: err.message });
    }
    return reply.code(statusCode).send({ error: 'server_error', message: err.message });
  });

  /**
   * Tahap 12 — unggah gambar chat: disimpan sebagai media + diteruskan ke sesi
   * gateway sebagai pesan multimodal. Galat gateway = field `gateway_error`.
   */
  fastify.post<{ Params: { id: string } }>('/api/agents/:id/media', async (request, reply) => {
    const { id } = request.params;
    const agent = agentRepo.getById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }
    if (!request.isMultipart()) {
      return reply
        .code(415)
        .send({ error: 'unsupported_media_type', message: 'Unggahan harus multipart/form-data.' });
    }

    const part = await request.file();
    if (!part) {
      return reply
        .code(400)
        .send({ error: 'invalid_input', message: 'Tidak ada berkas pada unggahan.' });
    }

    const buffer = await part.toBuffer();
    if (part.file.truncated) {
      return reply.code(413).send({
        error: 'payload_too_large',
        message: `Ukuran gambar melebihi batas ${maxUploadMb} MB.`,
      });
    }

    const mime = (part.mimetype || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      return reply.code(415).send({
        error: 'unsupported_media_type',
        message: `Tipe berkas "${part.mimetype || 'tanpa tipe'}" tidak didukung. Gunakan PNG, JPEG, WebP, atau GIF.`,
      });
    }

    const row = saveMedia(db, {
      agentId: id,
      kind: 'upload',
      mime,
      originalName: part.filename || null,
      buffer,
    });

    // Teruskan ke gateway: content part OpenAI-compatible, lewat client yang sama
    // dengan route chat (sesi bila ada, /v1/chat/completions bila tidak).
    const parts: ChatContentPart[] = [
      { type: 'text', text: '[gambar terlampir]' },
      {
        type: 'image_url',
        image_url: { url: `data:${row.mime};base64,${buffer.toString('base64')}` },
      },
    ];

    let gatewayError: string | null = null;
    try {
      const client = getHermesClientForAgent(agent, db);
      const sessionId = agent.session_id || (await client.createSession(`${agent.name}`));
      if (sessionId) {
        if (!agent.session_id) {
          agentRepo.update(id, { session_id: sessionId });
          db.prepare(
            'INSERT OR IGNORE INTO agent_sessions (agent_id, session_id, created_at, archived_at) VALUES (?, ?, ?, NULL)'
          ).run(id, sessionId, Date.now());
        }
        await client.sessionChatStream(sessionId, parts, () => {}, agent.model || undefined);
      } else {
        await client.chatStream(
          [{ role: 'user', content: parts }],
          () => {},
          agent.model || undefined
        );
      }
    } catch (err) {
      // Pesan galat gateway dikirim apa adanya — unggahan tersimpan, tapi
      // pengiriman ke model GAGAL dan UI harus tahu persis kenapa.
      gatewayError = String((err as Error)?.message || err);
    }

    auditRepo.logAction(
      request.user?.id ?? 0,
      'media.upload',
      row.id,
      JSON.stringify({ agent_id: row.agent_id, mime: row.mime, size: row.size, gateway_error: gatewayError })
    );

    return reply.code(201).send({
      ...toPublic(row),
      ...(gatewayError ? { gateway_error: gatewayError } : {}),
    });
  });

  /**
   * Tahap 12 — simpan keluaran agen (video/gambar hasil run) sebagai artefak
   * yang bisa diunduh pemilik. Wiring otomatis dari stream run BELUM dilakukan:
   * artefak kini diunggah lewat endpoint ini (lihat catatan di laporan Tahap 12).
   */
  fastify.post<{ Params: { id: string }; Querystring: { task_id?: string } }>(
    '/api/agents/:id/artifacts',
    async (request, reply) => {
      const { id } = request.params;
      const agent = agentRepo.getById(id);
      if (!agent) {
        return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
      }
      if (!request.isMultipart()) {
        return reply
          .code(415)
          .send({ error: 'unsupported_media_type', message: 'Unggahan harus multipart/form-data.' });
      }

      const part = await request.file();
      if (!part) {
        return reply
          .code(400)
          .send({ error: 'invalid_input', message: 'Tidak ada berkas pada unggahan.' });
      }

      const buffer = await part.toBuffer();
      if (part.file.truncated) {
        return reply.code(413).send({
          error: 'payload_too_large',
          message: `Ukuran artefak melebihi batas ${maxUploadMb} MB.`,
        });
      }

      const mime = (part.mimetype || '').trim().toLowerCase();
      if (!mime || mime === 'application/octet-stream') {
        return reply.code(415).send({
          error: 'unsupported_media_type',
          message: 'Artefak memerlukan Content-Type yang jelas.',
        });
      }

      const row = saveMedia(db, {
        agentId: id,
        kind: 'artifact',
        mime,
        originalName: part.filename || null,
        taskId: request.query.task_id?.trim() || null,
        buffer,
      });

      auditRepo.logAction(
        request.user?.id ?? 0,
        'media.artifact_upload',
        row.id,
        JSON.stringify({
          agent_id: row.agent_id,
          mime: row.mime,
          size: row.size,
          task_id: row.task_id,
        })
      );

      return reply.code(201).send(toPublic(row));
    }
  );

  /** Daftar media satu agen — path fisik tidak pernah ikut (Rule F-08). */
  fastify.get<{ Querystring: { agent_id?: string } }>('/api/media', async (request, reply) => {
    const agentId = (request.query.agent_id || '').trim();
    if (!agentId) {
      return reply
        .code(400)
        .send({ error: 'invalid_input', message: 'agent_id wajib diisi.' });
    }
    const agent = agentRepo.getById(agentId);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }
    return { media: listMedia(db, agentId) };
  });

  /** Unduh artefak: stream apa adanya, dengan tipe dan nama aslinya. */
  fastify.get<{ Params: { id: string } }>('/api/artifacts/:id/download', async (request, reply) => {
    const { id } = request.params;
    const row = getMediaById(db, id);
    if (!row || row.kind !== 'artifact') {
      return reply.code(404).send({ error: 'not_found', message: 'Artefak tidak ditemukan.' });
    }
    const abs = absoluteMediaPath(row);
    if (!abs || !fs.existsSync(abs)) {
      // Baris ada tapi berkasnya sudah kena retensi/hapus manual — laporkan jujur.
      return reply
        .code(404)
        .send({ error: 'not_found', message: 'Berkas artefak sudah tidak tersedia (terkena retensi).' });
    }

    reply.header('Content-Type', row.mime);
    reply.header('Content-Length', row.size);
    reply.header('Content-Disposition', `attachment; filename="${downloadFileName(row.original_name, row.id, row.mime)}"`);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'private, max-age=0, no-store');
    // Jejak audit: setiap unduhan artefak tercatat — termasuk artefak otomatis
    // hasil run (services/artifacts.ts), supaya penarikan berkas tidak tanpa jejak.
    auditRepo.logAction(
      request.user?.id ?? 0,
      'media.artifact_download',
      row.id,
      JSON.stringify({ agent_id: row.agent_id, task_id: row.task_id, mime: row.mime, size: row.size })
    );
    return reply.send(fs.createReadStream(abs));
  });
};
