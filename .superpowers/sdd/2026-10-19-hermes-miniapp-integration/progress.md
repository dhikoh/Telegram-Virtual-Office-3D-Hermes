# SDD ledger — plan: docs/plans/2026-10-19-hermes-miniapp-integration.md

Pre-flight: Fase 1 memproduksi `systemPrompt` dikonsumsi `chatStream()` (Fase 1 sendiri) — tidak ada konsumen antar-fase lain di urutan ini. Ruling: Fase 2b mengubah jalur transport `chatStream` tetapi mempertahankan parameter system prompt; dicatat di Fase 2.
Branch: fase/1-jembatan-identitas (BASE 77dd64c)

Task 1 (Fase 1 — Jembatan Identitas): complete (commits 77dd64c..9725e2f, tests: vitest run 770/770 pass, tsc -p tsconfig.json --noEmit → 0)
  Ruling: identitas jalur sesi lewat `system_message`, instruksi cakupan skill TETAP ditempel di pesan (Tahap 11) — stripSkillScope hanya membersihkan prefiks dari pesan; memindahkan cakupan ke system_message akan membuat riwayat lama tidak terbaca bersih. Cost if wrong: dua sumber instruksi terpisah, perlu digabung bila Fase 3 menambah SOUL.md.
  Ruling: jalur stateless mengirim dua pesan system terpisah (identitas lalu cakupan), bukan digabung satu string — menjaga format Tahap 11 tetap utuh dan bisa diuji satu per satu.
  Ruling: test Tahap 11 yang mengharapkan "tanpa tambahan" dijalur stateless disesuaikan: sekarang identitas selalu ikut, cakupan tetap hanya bila ada skill dimatikan.
  Catatan: agen tanpa `name` → identitas null (schema mewajibkan name min 1, jadi kasus ini hanya pertahanan).
  Belum diverifikasi (butuh deploy): kriteria manual "chat dengan Bagas, tanya siapa kamu".

Task 2 (Fase 2a — Heartbeat SSE): complete (commits 9725e2f..8653b0d, tests: vitest run 789/789, tsc 0, gap-check 8/8)
  Ruling: heartbeat = frame komentar `: hb`, bukan event data — klien membaca frame data; mencampurnya akan merusak parser di sisi klien. Cost if wrong: bila nanti ada klien yang butuh event nyata, format harus berubah.
  Ruling: interval disuntik lewat opsi buildServer `chatHeartbeatMs` (default dari CHAT_HEARTBEAT_MS) — test tidak perlu menunggu 10 detik sungguhan. Cost if wrong: satu jalan tambahan untuk menyetel interval.
  Ruling: test "tidak ada detak tambahan" diganti menjadi "detak dibatasi durasi stream" — menghitung detak silang-permintaan tidak bisa dibuktikan lewat inject karena socket lama sudah ditutup. Pembersihan timer diuji di unit test (stop() melepaskan interval).
  Catatan: CHAT_HEARTBEAT_MS wajib masuk .env.example, .env.development, docker-compose.yml, DEPLOY_COOLIFY.md — gap-check C3d menolak env baru yang tidak tercatat di ketiga tempat.
Task 3 (Fase 2b — Runs API + reattach): IN PROGRESS — lapisan transport selesai, rute belum.
  Selesai: runChatStream() di real.client.ts (POST /v1/runs → GET /v1/runs/{id}/events),
  mock padanan, interface, modul pemetaan peristiwa run-events.ts + types.ts.
  Tests: vitest run 805/805, tsc -p apps/server/tsconfig.json --noEmit → 0.
  Ruling: identitas Fase 1 pindah ke `instructions` (bukan system_message) — dibaca dari
  gateway, chat_completion_helpers.py:2180 MENAMBAHKAN instructions ke system efektif, jadi
  SOUL.md tidak tertimpa. Cost if wrong: identitas hilang dari chat Runs API.
  Ruling: badan POST /v1/runs disusun ulang ke snake_case (`session_id`, `conversation_history`).
  Temuan: startRun lama mengirim camelCase — gateway membaca session_id (api_server_runs.py:668)
  dan conversation_history (baris 429), jadi sesi TIDAK PERNAH sampai. Tidak pernah menampakkan
  diri karena semua pemanggil lama mengirim sessionId kosong. Cost if wrong: nol — pemanggil lama
  tidak mengirim keduanya.
  Ruling: stream yang tamat tanpa peristiwa terminal DITOLAK (throw), bukan ditutup senyap —
  tujuan D rencana. Cost if wrong: run sungguhan tanpa terminal dianggap galat; perlu ditinjau
  bila gateway ternyata menutup normal tanpa run.completed.
  Belum: rute chat memakai runChatStream, rute reattach GET /api/agents/:id/runs/:runId/stream,
  dispatcher tidak membatalkan run saat klien putus, jalur sesi dipertahankan sebagai fallback.

