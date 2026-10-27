# Progress: Hermes Virtual Office

## 1. Status Ringkasan
- **Fase Aktif Saat Ini:** Phase 20 (Tahap 20) — Selesai & Terverifikasi
- **Status Gap-Check:** ✅ 8/8 Kriteria Lolos (C3a sampai C3h, Phase 20)
- **Status Typecheck:** ✅ Lolos (TypeScript 5.7) — 0 Error
- **Status Test Suite:** ✅ 1264 tests passed across 117 test files (0 warnings)
- **Fitur Baru (Sedang Berjalan):** Telegram Proactive Notifications & Daily Executive Briefing
  * [x] **Task 0.0**: Checkout branch `feature/telegram-proactive-notifications` & penyusunan PRD/Tasks
  * [x] **Task 1.0**: Shared Schemas & Endpoints Definition (`NotificationPreferencesSchema`, endpoints terdaftar)
  * [x] **Task 2.0**: Enhanced Telegram Notification Service (Core methods, preference filtering, Markdown V1 escaping, 13 unit tests PASS)
- **Penyempurnaan Terkini (2026-10-27):**
  * [x] **Audit Total & Zero-Gap Check**: Audit menyeluruh seluruh 44 endpoint, 13 migrasi DB, 14 repository, klien gateway Hermes, dan UI layers.
  * [x] **Test Hygiene (Zero Act Warnings)**: Eliminasi seluruh React `act(...)` warnings di `apps/web/src/components/agent-sheet/__tests__/tahap20-endpoint.test.tsx` dengan helper `renderProfile` yang meng-await lifecycle efek async.
  * [x] **Fix Identitas & Run Reliability (T1-T5)**: Scope identitas agen di depan prompt user, reaper run stale, materializer task 1-per-run, dan backfill script.
- **Hotfix Terkini:** ✅ Hotfix GET /api/cron (Payload gateway schedule object handled gracefully, formatCronWIB safe, Zod boundary validation)

---

## 2. Fitur yang Sudah Berfungsi (What Works)

### Fondasi & Monorepo (Fase 0 - 2)
- [x] Struktur monorepo npm workspaces (`apps/server`, `apps/web`, `packages/shared`, `tools/mock-hermes`).
- [x] Server Fastify 4 lengkap dengan database SQLite (`better-sqlite3`), WAL mode, dan migrasi SQL berurutan.
- [x] Mock Hermes Gateway untuk simulasi obrolan, eksekusi task, dan pengujian deterministik.
- [x] Mesin automated gap-check (`npm run gap-check`) yang memvalidasi integritas arsitektur.

### Kantor 3D & Telegram Mini App (Fase 3 - 4)
- [x] Canvas kantor 3D isometrik Three.js / React Three Fiber / Drei dengan kamera responsif dan kontrol interaktif.
- [x] Pemetaan meja agen, status visual (idle, thinking, executing, completed, failed), dan pemilihan agen secara visual.
- [x] Lembar rincian agen (Agent Sheet slide-over) untuk melihat atribut, histori kerja, dan keahlian agen.
- [x] Obrolan real-time berfitur streaming respon dari gateway.
- [x] Task Manager dan Inbox untuk melihat daftar tugas yang sedang berjalan atau menunggu tindakan.

### Rekrutmen, KPI & Laporan (Fase 5 - 7)
- [x] Anti-Hallucination Reports: Laporan analitik dan KPI yang diekstrak langsung dari log audit SQLite.
- [x] Recruitment Room: Alur pembuatan kandidat agen baru, wawancara kerja, dan pendaftaran ke departemen.
- [x] Skill Catalog: Manajemen penambahan keahlian khusus ke masing-masing agen.
- [x] Sistem notifikasi berbasis Zustand dan TanStack React Query.
- [x] Layar Pengaturan (Settings) dan dukungan multi-bahasa lengkap (Bahasa Indonesia & Bahasa Inggris).
- [x] Matrix 6 Status UI (`loading`, `empty`, `error`, `success`, `offline`, `unauthorized`) terverifikasi pada semua layar.

### Deployment & Optimasi Produksi (Fase 8)
- [x] Multi-stage Dockerfile teroptimasi untuk deployment di Coolify atau VPS mandiri.
- [x] Penyekatan lingkungan dev/mock dari lingkungan produksi (keamanan ketat).
- [x] Pengurangan ukuran bundle aset 3D (chunk 3D gzip <= 700 KB).

### Pemantapan & Stabilitas Streaming (Fase 9 - 19, Fase 1 - 2)
- [x] Peningkatan tekstur meja dan model 3D (Phase 9 - 18).
- [x] Integrasi departemen dan ruang kerja agen terorganisir (Phase 17 - 18).
- [x] Penambahan perlindungan streaming dual-timeout (`HERMES_CHAT_TTFB_MS` = 60s, `HERMES_CHAT_TIMEOUT_MS` = 300s) (Phase 19).
- [x] Deteksi aliran 0 byte sebagai error provider dan cleanup runaway task otomatis (Phase 19).
- [x] Pengaktifan protokol Phase-Gated & Memory Bank Development secara global dan lokal.
- [x] Fase 1: Jembatan Identitas (Agen sadar nama, peran, SOUL, dan ruang kerja).
- [x] Fase 2a: Heartbeat SSE tiap 10 detik (`: hb\n\n`) mencegah timeout Cloudflare.
- [x] Fase 2b: Chat via Runs API + Reattach tahan restart (`POST /api/agents/:id/chat` mengirim `run_id`, reattach via `GET /api/agents/:id/runs/:runId/stream` dengan replay dari SQLite `run_events`, live hub attachment, dan fallback `sessionChatStream`).
- [x] Fase 2c: Antrian Chat per Agen (`AgentChatQueue` - 1 run aktif, FIFO, maks 5 antrian, heartbeat selama antri, HTTP 429 `queue_full`).
- [x] Fase 2d: Idempotensi + Deteksi Stall (`client_message_id` wajib & deduplikasi request ganda, deteksi jeda 45s dengan frame status `tool_running` dan retry otomatis ke fallback model).
- [x] Fase 2e: Persist Parsial (`010_agent_chat.sql` tabel `agent_runs` & `agent_messages`, simpan delta stream bertahap, status `partial` bila terputus, dan tombol interaktif "Lanjutkan").
- [x] Fase 3a: Migrasi Provisioning & Skema (`011_agent_provisioning.sql` kolom `provision_state`, `provision_error`, `provisioned_at` pada tabel `agents`, Zod schemas, dan `AgentRepository.updateProvisionState()`).
- [x] Fase 3b: Service Hermes Provisioner & SOUL.md (`apps/server/src/services/hermes/provisioner.ts` dengan eksekusi `execFile` aman, sanitasi slug profil, generator `SOUL.md` 9 seksi, dan penanganan idempotensi).
- [x] Fase 3c: Endpoint Provisioning & Auto-Provisioning Hiring (`POST /api/agents/:id/provision`, definisi di `endpoints.ts`, integrasi auto-provision di `POST /api/hiring/:id/mark-hired`, dan 15 integration tests).
- [x] Fase 3d: Backfill Script & CLI Runner (`scripts/provision-backfill.ts` & `apps/server/src/services/hermes/backfill.ts` dengan mode `--dry-run`, `--force`, status per agen, dan unit tests).
- [x] Fase 4a: Migrasi Task Visibility & Skema Shared (`012_tasks_visibility.sql` kolom `source` & `tool_calls_count`, indeks `run_id`, konstanta `TASK_SOURCES`, skema Zod `TaskSchema`, method `getByRunId` & `getBySource` di `TaskRepository`, dan unit tests).
- [x] Fase 4b: Backend Task Materializer (`apps/server/src/services/agent-chat/task-materializer.ts`, integrasi `onEvent` di `HermesClient`, pembuatan task otomatis saat turn chat memanggil tool, transisi status `running` -> `done`/`failed`, dan 5 unit tests).
- [x] Fase 4c: Endpoint Tasks Events & Visualisasi UI Timeline Run (`GET /api/tasks?source=...`, `GET /api/tasks/:id/events`, visualisasi pill filter, badges `Chat Auto-Task` & `🔧 X tools`, modal timeline switcher `TaskResultModal`, lokalisasi i18n dwibahasa, dan 15 unit tests).
- [x] FASE 4 — Task & Run Visibility: SELESAI & TERVERIFIKASI PENUH.
- [x] Fase 5a: Endpoint Cron & Pemetaan Job Jadwal Hermes (`GET /api/cron`, interface `HermesJob` & `listJobs()`, pemetaan job ke agen berdasarkan skill & role, filter `agent_skills`, komponen `CronScheduleView.tsx`, switcher mode di TasksScreen, dan 15 unit tests).
- [x] Fase 5b: Floating Action Button (FAB) & Agent Messenger Modal Quick-Switcher (`MessengerFAB.tsx`, `AgentMessengerModal.tsx`, quick-switch button di `AgentSheet.tsx`, integrasi ke `Office.tsx`, kamus i18n dwibahasa `messenger`, dan 5 unit tests).
- [x] FASE 5 — UI: List Cron + FAV Messenger: SELESAI & TERVERIFIKASI PENUH.
- [x] Fase 6: Skill Auto-Install & Catalog Synchronization (`skills/` di repo, core `SkillSynchronizer`, endpoint `GET /api/skills/sync/status` & `POST /api/skills/sync`, audit log SQLite, client method frontend, dan 24 unit/integration tests).
- [x] FASE 6 — Skill Auto-Install (Migrasi-Proof): SELESAI & TERVERIFIKASI PENUH.

---

## 3. Komponen yang Terdaftar & Terverifikasi
- **11 Modul Endpoint Fastify:**
  1. `/api/agents` (`agents.ts`)
  2. `/api/tasks` (`tasks.ts`)
  3. `/api/cron` (`cron.ts`)
  4. `/api/departments` (`departments.ts`)
  5. `/api/projects` (`projects.ts`)
  6. `/api/skills` (`skills.ts`)
  7. `/api/hiring` (`hiring.ts`)
  8. `/api/approvals` (`approvals.ts`)
  9. `/api/audit` (`audit.ts`)
  10. `/api/kpis` (`kpis.ts`)
  11. `/api/reports` (`reports.ts`)
- **9 Tabel Database SQLite:**
  1. `agents`
  2. `tasks`
  3. `departments`
  4. `projects`
  5. `agent_skills`
  6. `hiring_candidates`
  7. `approvals`
  8. `audit_log`
  9. `settings`
- **9 Komponen Layar / Modul UI:**
  * `Office`, `Tasks`, `Reports`, `Inbox`, `More`, `AgentSheet`, `Recruitment`, `TaskDetail`, `Settings`.

---

## 4. Pekerjaan Tersisa (What's Left to Build)
- **Tahap 20 — Endpoint Mode & Auto-Detect Model (aktif, satu sub-task per siklus):**
  - [x] ST-1 — `stripApiSuffix()` + penerapan di `normalizeBaseUrl`, `resolveAgentBaseUrl`, `probeModels`, `config.ts`; 5 tes regresi. Gate: `tsc --build` 0, `vitest` 1012/95, `gap-check` 8/8.
  - [x] ST-2 — endpoint read-only `GET /api/agents/:id/models` + pendaftaran `packages/shared/src/endpoints.ts`. Gate: `agents.test.ts` 18 tes.
  - [x] ST-3 — `api.listAgentModels()` di `apps/web/src/services/api.ts` lewat `modelsRequest()`. Gate: `tahap20-models.test.ts` 5 tes.
  - [x] ST-4 — toggle UI `Ikuti Server` / `Custom` (mode server mengirim `hermes_base_url: ''` eksplisit). Gate: `tahap20-endpoint.test.tsx` 5 + `tahap20-endpoint-api.test.ts` 4.
  - [x] ST-5 — panel model auto-detect terurut A-Z (filter + cap render 60, tanpa kolom ketik nama model). Gate: `tahap20-modellist.test.tsx` 8 tes.
  - [x] ST-6 — **model prioritas berurutan per agen + rantai fallback**, dokumen `PROGRESS.md` ke Tahap 20, `TRACEABILITY.md` (REQ-120..126), `DECISIONS.md` (DEC-051..056), i18n `modelPriority.*`. Gate akhir: `tsc --build` 0, `vitest run` **1124/106 hijau**, `gap-check` 8/8 (Phase 20).
- **Fix Identitas Agen & Keandalan Run (branch `fix/agent-identity-and-run-reliability`, 2026-10-25) — T1 s/d T4 selesai:**
  - [x] T1 — identitas agen MENANG atas persona relay. Berkas baru `apps/server/src/services/hermes/identity-scope.ts` (marker + regex + apply + strip, idempoten, pola Tahap 11). Blok `[IDENTITAS AGEN: ...]` ditempel DI DEPAN pesan user — satu-satunya teks yang tidak bisa ditimpa relay — dengan kalimat penimpa eksplisit. Lapisan lama (`system_message` / `instructions`) TIDAK dihapus. Riwayat dibaca bersih lewat `stripIdentity(stripSkillScope(...))` di ketiga jalur baca. Gate: 15 unit + 17 integrasi.
  - [x] T2 — run nyangkut ditutup. `services/agent-chat/stale-run-reaper.ts`: `reapStaleRuns` (ambang 30 menit, jauh di atas `chatTimeoutMs` 300 s), `interruptAgentRuns` (socket SSE 'close', tanpa ambang), `closeRunIfRunning` (turn berakhir tanpa event terminal). Ketiganya idempoten (`status = 'running'` di WHERE). Migrasi `013_stale_runs.sql`: `idx_agent_runs_status_started` + indeks UNIQUE partial `idx_tasks_run_id_chat_unique` pada `tasks` (run_id NOT NULL AND source='chat'). CLI `npm run runs:reap -- --dry-run`. Gate: 12 unit + 14 integrasi + 5 tes migrasi.
  - [x] T3 — setiap run yang menyelesaikan giliran menghasilkan tepat satu task. `ensureTask()` jadi satu pintu untuk jalur tool maupun jalur obrolan biasa; judul task dibersihkan dari blok identitas. Gate: 9 unit + 13 integrasi.
  - [x] T4 — `scripts/backfill-runs.ts` (`npm run backfill:runs -- --dry-run|--apply`): tutup run nyangkut dulu, lalu materialisasi task + `agent_messages` dari `run_events`. Sesi lama tanpa run di DB aplikasi dilaporkan sebagai OPEN QUESTION, tidak ditebak. Gate: 12 tes termasuk regresi 10 run.
  - [x] T5 — seluruh tes di atas hijau; `tsc --build` 0 error; `gap-check` 8/8 (Phase 20). Tidak ada secret yang di-log.
  - **CATATAN:** bagian VPS (V1 s/d V4 — pindah provider ke OpenRouter, verifikasi jawaban tidak lagi "Trust Is Gold") BELUM dikerjakan dan BUKAN milik repo ini. Kriteria selesai #1 butuh verifikasi nyata setelah provider diganti.
  - **KOREKSI DIAGNOSIS (2026-10-25):** kegagalan `tahap11.test.ts > membuat tugas hapus untuk skill terpasang` BUKAN flake dan BUKAN pre-existing — itu REGRESI dari migrasi 013 branch ini sendiri. `CREATE UNIQUE INDEX ... ON tasks(run_id)` (tanpa filter source) membuat INSERT task orkestrator kedua GAGAL ketika gateway memulangkan `run_id` yang sama: `UNIQUE constraint failed: tasks.run_id` → `runTask` melempar → task tertinggal `'queued'` selamanya. Diperbaiki dengan membatasi indeks ke `source='chat'` (`idx_tasks_run_id_chat_unique`) + `INSERT OR IGNORE` di backfill. Bukti: audit_log `task.run_failed` memuat pesan UNIQUE constraint.

- Eksekusi fitur baru wajib diawali dengan PRD / Task List sesuai protokol `.agent/rules.md`.
