# Hermes Event Samples (Rule R3)

> **Pernyataan Status (Rule R3 & Section 9 Phase 1)**:
> `mock_run_events.jsonl` dan `mock_chat_stream.txt` berstatus **ASSUMPTIONS** yang dibangun berdasarkan dokumentasi resmi Hermes Agent (tetap dipakai sebagai fixture unit test parser).
> **`live_vps_stream_frames.jsonl` berstatus VERIFIED** — ditangkap langsung dari produksi (https://app.zupu.web.id/api/stream) saat satu run sungguhan dijalankan, 2026-10-13, container image `9387636`.

---

## Isi Direktori:

0. `live_vps_stream_frames.jsonl` (**VERIFIED, sampel VPS nyata**):
   Frame SSE yang benar-benar diterima dari `GET /api/stream` selama satu run:
   - `heartbeat` (keep-alive berkala, `data.type` = nama event)
   - `task_update` (task masuk status running + payload task asli)
   - `agent_status` (agen berpindah ke `thinking` / kembali `idle`)
   Dipakai oleh `apps/server/src/services/live_sample.test.ts` untuk mengunci kontrak: setiap frame bernama, `data.type` sama dengan nama event, timestamp monoton.

1. `mock_run_events.jsonl` (**ASSUMPTIONS**):
   Urutan event Server-Sent Events (SSE) saat sebuah run dieksekusi di endpoint `GET /v1/runs/{id}/events`:
   - `run.started`
   - `tool.started`
   - `tool.completed`
   - `message.interim`
   - `approval.request` (memicu status `waiting_for_approval`)
   - `run.completed` (mengembalikan output akhir dan token usage)

2. `mock_chat_stream.txt` (**ASSUMPTIONS**):
   Contoh format payload streaming chunk OpenAI pada endpoint `POST /v1/chat/completions` (dengan `stream: true`), termasuk event kustom Hermes `hermes.tool.progress`.

## Cara menangkap ulang sampel nyata

Dari dalam container app produksi (butuh `TELEGRAM_BOT_TOKEN` + `OWNER_TELEGRAM_IDS` milik container, tidak pernah ditulis ke chat):

1. Buka `GET /api/stream` (auth initData Telegram) dan kumpulkan frame `event:`/`data:`.
2. Buat satu agen + satu task, lalu panggil `POST /api/tasks/:id/run` dengan body `{}` (Fastify menolak body kosong yang tetap diberi `Content-Type: application/json`).
3. Tunggu frame `task_update` dengan `status: "done"` disertai `agent_status: "idle"` (stream memakai nama ternormalisasi — tidak ada event literal `run.completed`), tutup stream, lalu bersihkan: hapus task, agen, dan `run_events` terkait dari `/data/office.sqlite`.

