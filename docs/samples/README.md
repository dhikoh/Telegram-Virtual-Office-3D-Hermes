# Hermes Event Samples (Rule R3)

> **Pernyataan Status (Rule R3 & Section 9 Phase 1)**:
> Sampel event pada direktori ini (`mock_run_events.jsonl` dan `mock_chat_stream.txt`) saat ini berstatus **ASSUMPTIONS** yang dibangun berdasarkan dokumentasi resmi Hermes Agent.
> Sampel ini akan digantikan atau diverifikasi dengan sampel nyata (**VERIFIED**) dari VPS host saat Owner menjalankan skrip penangkap di `docs/VPS_CHECKS.md`.

---

## Isi Direktori:

1. `mock_run_events.jsonl`:
   Urutan event Server-Sent Events (SSE) saat sebuah run dieksekusi di endpoint `GET /v1/runs/{id}/events`:
   - `run.started`
   - `tool.started`
   - `tool.completed`
   - `message.interim`
   - `approval.request` (memicu status `waiting_for_approval`)
   - `run.completed` (mengembalikan output akhir dan token usage)

2. `mock_chat_stream.txt`:
   Contoh format payload streaming chunk OpenAI pada endpoint `POST /v1/chat/completions` (dengan `stream: true`), termasuk event kustom Hermes `hermes.tool.progress`.
