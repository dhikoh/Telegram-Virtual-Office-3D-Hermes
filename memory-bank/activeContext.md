# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Branch Aktif:** `feature/telegram-proactive-notifications` (Branch fitur baru dari `master`).
- **Fitur Sedang Dikerjakan:** **Telegram Proactive Notifications & Daily Executive Briefing**.
- **Status Sub-Task:**
  * [x] **Task 0.0**: Checkout branch `feature/telegram-proactive-notifications` & inisialisasi PRD serta task list.
  * [x] **Task 1.0**: Definisi shared schemas Zod (`NotificationPreferencesSchema`, `NotificationPreferencesPatchSchema`, `TestNotificationResultSchema`) di `packages/shared/src/schemas.ts`, registrasi endpoint di `packages/shared/src/endpoints.ts`, dan unit test di `packages/shared/src/index.test.ts` (PASS 6/6).
  * [x] **Task 2.0**: Enhanced Telegram Notification Service (`TelegramNotificationService` di `apps/server/src/services/notifications.ts` dengan `notifyTaskCompleted`, `notifyRunFailed`, `notifyApprovalPending`, `sendDailyBriefing`, `sendTestNotification`, filter preferensi, escaping Markdown V1, dan 13 unit tests di `notifications.test.ts` PASS 100%).
  * [x] **Task 3.0**: Event-Driven Notification Hooking (Hook `notifyTaskCompleted` dan `notifyRunFailed` di `apps/server/src/services/dispatcher.ts`, `apps/server/src/routes/tasks.ts`, dan `apps/server/src/services/agent-chat/task-materializer.ts`; hook `notifyApprovalPending` di `dispatcher.ts`; unit & integration test komprehensif di `tasks.test.ts`, `approvals.test.ts`, dan `task-materializer.test.ts` PASS 100%).
  * [x] **Task 4.0**: Executive Daily Briefing Scheduler (`apps/server/src/services/briefing-scheduler.ts` yang mengagregasi metrik faktual harian dari SQLite dan trigger harian jam 18:00 WIB / UTC+7 dengan idempotency lock kalender harian; 10 unit & integration tests PASS 100%).
  * [x] **Task 5.0**: Settings UI & Test Notification Integration (Repository & endpoints `GET/PATCH /api/settings/notifications` dan `POST /api/settings/notifications/test`, wiring `preferencesProvider`, API client methods, `TelegramNotificationsCard.tsx` dengan toggle controls & test button, i18n, dan 16 route tests + 5 component tests PASS 100%).
  * [ ] **Task 6.0**: Comprehensive Verification & Gate Compliance (Verifikasi fixtures `scripts/gap-check.ts` untuk endpoint baru, build bundle produksi `npm run build`, dan regresi penuh 3 gate).
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace monorepo.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 20 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif, stabil & bersih (**1316 tests passed across 121 test files, 0 warnings**).
- **Pembersihan Test Hygiene (2026-10-27)**:
  * Mengeliminasi React `act(...)` warning di `apps/web/src/components/agent-sheet/__tests__/tahap20-endpoint.test.tsx` menggunakan helper `renderProfile` yang meng-await resolusi efek asynchronous initial render (`listAgentModels` dan `getAgentModelPriority`). Seluruh 117 file test kini berjalan tanpa warning console.
- **Perbaikan Terbaru — Hotfix GET /api/cron (2026-10-20)**:
  * Memperbaiki bug 500 `cronExpr.trim is not a function` akibat payload gateway Hermes mengirimkan field `schedule` berupa objek (`{ kind: 'cron', expr: '0 1 * * *', display: '0 1 * * *' }`).
  * Normalisasi aman melalui `readCronExpr` dan pengetatan `formatCronWIB` (return `null` alih-alih melempar error).
  * Validasi runtime boundary dengan `HermesJobGatewaySchema` (Zod `.passthrough()`) di `real.client.ts`.
  * Rute `/api/cron` tetap 200 untuk job dengan jadwal invalid dan mengembalikan 502 jika gateway gagal total.
- **Penyempurnaan Visual, Label & Kontrol Kamera (2026-10-21)**:
  * **Sub-Task 1 (Selesai)**:
    1. Pembersihan label karakter di `Agent3D.tsx`: nama model 3D tidak lagi muncul mengganggu di atas kepala karakter, digantikan fokus tunggal pada badge nama agen dan logo avatar.
    2. Komponen `AvatarSymbolPicker.tsx` (`@hermes-office/shared` array `AVATAR_SYMBOLS`) dengan 18 simbol terkurasi di `Step2SpecForm.tsx` dan `AgentSheetProfile.tsx` untuk pemilihan avatar satu sentuhan tanpa ketik manual.
    3. Kontrol slider zoom dinamis + tombol `+` / `−` di `Office3D.tsx` terhubung ke `cameraState.ts` (`CAMERA_ZOOM_EVENT`) dan `CameraController.tsx` untuk mengatur FOV kamera (25 s/d 65) secara halus di mobile & desktop.
    4. Unit test `avatar-symbol-picker.test.tsx` (3 tests) & `camera-zoom.test.ts` (4 tests) passing.
  * **Sub-Task 2 (Selesai)**:
    1. Mobil Kenney Car Kit (`sedan.glb`, `suv.glb`, `delivery.glb`) dengan embedded base64 data URI colormap atlas (Rule 9.4) menggantikan balok primitif di jalan raya (`Backdrop.tsx`) dengan rotasi arah jalur dinamis (`Math.PI / 2` untuk jalur 0 ke kanan, `-Math.PI / 2` untuk jalur 1 ke kiri) dan skala `0.75` yang proporsional terhadap karakter (~1.0 unit).
    2. Lantai modular Kenney Mini Market (`floor.glb`) diintegrasikan di area Central Lounge (`GLTFFloor.tsx` dan `Furniture.tsx`).
    3. Furniture Kenney Furniture Kit dimaksimalkan, dan silinder primitif meja kopi lama di Central Lounge dihapus agar tidak bertumpuk dengan `sideTable` Kenney (zero overlapping).
    4. Sekat kaca akrilik transparan/neon antar ruangan tetap dipertahankan 100% utuh.
    5. Dokumentasi CC0 dan provenance lengkap di `docs/ASSETS.md` (Seksi 7 & 8).
    6. Unit tests di `vehicles-and-floor-3d.test.ts` (12 tests) passing.
  * **Sub-Task 3 (Selesai)**:
    1. Garis kawat wireframe neon di sekeliling lantai ruangan departemen, approval gate, dan central lounge dihapus sepenuhnya (`wireframe` eliminasi 100% dari `Furniture.tsx`).
    2. Digantikan dengan alas karpet ruangan eksekutif (*plush room carpet pad*) dengan lis tepi bordir (*soft textile rug border trim*) bermaterial matte (`MeshStandardMaterial`, roughness 0.95–0.96) yang hangat, bersih, dan menapak (*grounded*).
    3. Unit test di `vehicles-and-floor-3d.test.ts` diperluas memvalidasi eliminasi total wireframe dan keberadaan karpet (13 tests passed).
  * **Verifikasi Mandiri**: `tsc --build` lolos 100% (0 error), vitest passing (1144/1144), dan `gap-check` lolos 8/8 kriteria (Phase 20).
- **Tahap 20 — Endpoint Mode & Auto-Detect Model (BERJALAN, ST-1 selesai 2026-10-20)**:
  * **ST-1 (selesai)**: normalisasi suffix `/v1` di seluruh jalur. Helper `stripApiSuffix()` di `services/hermes/detect.ts` dipakai di jalur tulis (`normalizeBaseUrl`), jalur baca (`resolveAgentBaseUrl` — membetulkan baris lama di SQLite tanpa migrasi), di dalam `probeModels`, dan di `config.ts` (`HERMES_BASE_URL` dinormalisasi sekali supaya health/hiring/skills/klien gateway ikut bersih). Akar masalah terbukti: `https://openrouter.ai/api/v1/v1/models` membalas 404, `/api/v1/models` membalas 200.
  * **Koreksi diri saat implementasi**: suffix `/api/v1` awalnya ikut di daftar sehingga `https://openrouter.ai/api` terpotong jadi `https://openrouter.ai` (kehilangan `/api`) — ditangkap oleh tes yang baru ditulis, lalu dihapus dari daftar.
  * **Verifikasi mandiri**: `tsc --build` exit 0, `vitest run` **1012 test / 95 file hijau** (+5 tes baru), `gap-check` 8/8 (Phase 19).
  * **Tersisa (ST-2 s/d ST-6)**: endpoint read-only `GET /api/agents/:id/models`, toggle UI `Ikuti Server` / `Custom` (kirim `hermes_base_url: ''` eksplisit), panel daftar model auto-detect terurut A-Z (OpenRouter mengembalikan 468 model → perlu filter + cap render), **model prioritas berurutan per agen beserta rantai fallback-nya**, lalu dokumen Tahap 20.
- **Fitur Selesai di Fase 6 (Skill Auto-Install & Catalog Synchronization):**
  * **Katalog Skill Resmi di Repositori (`skills/`)**:
    - `skills/prospecting/SKILL.md`: Prospecting, lead qualification BANT, cold outreach draft.
    - `skills/marketing-plan/SKILL.md`: Go-to-market plan, omnichannel channel mix, ROI/CAC evaluation.
    - `skills/brand/SKILL.md`: Brand identity, tone of voice, touchpoint guidelines.
    - `skills/sales-enablement/SKILL.md`: Sales deck structure, battlecard, objection handling.
  * **Shared Schemas & Endpoints**:
    - Skema Zod `LocalSkillSchema`, `SkillSyncStatusSchema`, dan `SkillSyncResultSchema` di `packages/shared/src/schemas.ts`.
    - Pendaftaran endpoint `GET /api/skills/sync/status` dan `POST /api/skills/sync` di `packages/shared/src/endpoints.ts`.
  * **Service Core `SkillSynchronizer`**:
    - `apps/server/src/services/hermes/skill-sync.ts`: `readLocalSkillCatalog`, `checkSkillSyncStatus`, `syncSkills`.
    - Sinkronisasi berkas skill ke target `~/.hermes/skills/` secara aman, atomik, dan idempoten.
    - Integrasi audit log `skill.auto_sync` di database SQLite.
    - 9 unit tests di `apps/server/src/services/hermes/skill-sync.test.ts` PASS 100%.
  * **Route Handlers Fastify & API Client**:
    - `GET /api/skills/sync/status` & `POST /api/skills/sync` di `apps/server/src/routes/skills.ts`.
    - 15 integration tests di `apps/server/src/routes/skills.test.ts` PASS 100%.
    - Client API frontend `api.getSkillSyncStatus()` dan `api.syncSkills(force)` di `apps/web/src/services/api.ts`.

---

## 2. Fokus & Prioritas Kerja Aktif
- **Fix Identitas Agen & Keandalan Run (branch `fix/agent-identity-and-run-reliability`) — T1 s/d T4 selesai, 5 commit, belum di-push.**
  Akar masalah terbukti dari bukti produksi (25 Okt 2026): relay `api.trustisgold.web.id` menyuntikkan system prompt 34k token berisi larangan menyebut nama, dan Hermes menaruh `ephemeral_system_prompt` di BELAKANG system prompt utama — jadi identitas yang dikirim sebagai `system_message` kalah. Agen "Bagas" menjawab "Siapa namamu" dengan "Saya asisten dari Trust Is Gold".
  - T1 `identity-scope.ts`: blok identitas ditempel DI DEPAN pesan user (satu-satunya teks yang tidak bisa ditimpa relay), idempoten, dibersihkan saat riwayat dibaca. Lapisan `system_message` lama TIDAK dihapus.
  - T2 `stale-run-reaper.ts` + migrasi `013`: run 'running' yang mati ditutup menjadi 'interrupted' (startup, socket 'close', dan turn tanpa event terminal).
  - T3 `task-materializer.ts`: setiap run yang menyelesaikan giliran → tepat satu task (sebelumnya hanya turn ber-tool).
  - T4 `scripts/backfill-runs.ts`: backfill run/task/pesan lama; sesi tanpa run dilaporkan sebagai OPEN QUESTION, tidak ditebak.
- **Sisa (BUKAN milik repo ini — dikerjakan pemilik di VPS):** V1 s.d V4 — daftarkan provider OpenRouter di config Hermes, simpan `OPENROUTER_API_KEY` di `/root/.hermes/.env`, `/restart` lalu `/model or --global`, verifikasi jawaban tidak lagi "Trust Is Gold" dan log menunjukkan `deepseek/deepseek-v4.1-flash`. Kriteria selesai #1 hanya bisa diverifikasi nyata setelah provider diganti.
- **KOREKSI DIAGNOSIS 2026-10-25:** kegagalan `tahap11.test.ts > membuat tugas hapus` BUKAN flake/pre-existing — itu regresi migrasi 013 branch ini. `UNIQUE INDEX ON tasks(run_id)` tanpa filter source membuat task orkestrator kedua (run_id gateway sama) gagal INSERT → `runTask` melempar → task nyangkut `'queued'`. Sudah diperbaiki: indeks dibatasi ke `source='chat'` (`idx_tasks_run_id_chat_unique`), backfill memakai `INSERT OR IGNORE`, plus tes regresi khusus.
- **Gate terakhir branch ini:** `tsc --build` 0, `vitest run` hijau, `gap-check` 8/8 (Phase 20).
- Menunggu arahan pengguna: push branch dan/atau eksekusi bagian VPS.

---

## 3. Keputusan Teknis Terbaru (Fase 2e)
- **Granular Real-Time Persistence:** Menggunakan `AgentChatRepository` untuk meng-insert user message dan assistant message di awal stream, lalu meng-update akumulasi teks per delta chunk.
- **Resilient Fallback History:** `GET /api/agents/:id/chat` memprioritaskan sesi gateway untuk keselarasan memori LLM, namun secara cerdas menyematkan potongan respon parsial lokal yang belum tersinkronkan ke gateway, serta melakukan fallback 100% ke database lokal jika gateway mengalami error HTTP 502 / network connection refused.
- **Deterministic Incomplete Message Query:** `getLastIncompleteMessage` memeriksa baris asisten paling baru (`ORDER BY created_at DESC, rowid DESC`), memastikan status `can_continue` bebas dari race condition sub-millisecond.

---

## 4. Invarian yang Harus Dijaga
1. Dilarang keras menyisipkan `// TODO`, `// ... rest of code`, atau fungsi kosong.
2. Setiap kali menulis endpoint baru atau tabel baru, wajib memperbarui `scripts/gap-check.ts` dan fixtures-nya agar status gap-check tetap hijau.
3. Seluruh string baru yang ditampilkan di UI wajib dimasukkan ke dictionary lokalisasi `en` dan `id`.
4. Kerjakan HANYA SATU sub-task dalam satu siklus, lalu berhenti untuk konfirmasi.
