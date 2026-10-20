# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Branch Aktif:** `fase/5-cron-fav`.
- **Fase Terakhir Diselesaikan:** **Fase 5b (FAV Messenger & Agent Quick-Switcher) — FASE 5 TUNTAS 100%**.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**965 tests passed across 93 test files**).
- **Fitur Selesai di Fase 5 (List Cron + FAV Messenger):**
  * **Fase 5a (List Cron)**:
    - Skema & tipe Zod `CronJob` di `@hermes-office/shared/schemas.ts`.
    - Endpoint `GET /api/cron` terdaftar di `packages/shared/src/endpoints.ts` (Rule C3a & gap-check).
    - Method `listJobs(): Promise<HermesJob[]>` di `HermesClient`, `RealHermesClient`, `MockHermesClient`, dan `MockHermesServer`.
    - Implementasi route `GET /api/cron` di `apps/server/src/routes/cron.ts`: memetakan job gateway ke agen penanggung jawab, memfilter skill yang dinonaktifkan di `agent_skills`, dan memformat ekspresi cron ke label waktu WIB yang ramah manusia.
    - Web API client `api.getCronJobs()` di `apps/web/src/services/api.ts`.
    - Komponen UI [`CronScheduleView.tsx`](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/apps/web/src/components/tasks/CronScheduleView.tsx) dengan status card per agen, display WIB, skill tags, serta mode switcher di header [`TasksScreen`](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/apps/web/src/screens/Tasks.tsx).
    - Unit tests `apps/server/src/routes/cron.test.ts` (15 tests) PASS 100%.
  * **Fase 5b (FAV Messenger & Quick Switcher)**:
    - Floating Action Button [`MessengerFAB.tsx`](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/apps/web/src/components/office/MessengerFAB.tsx) dengan badge jumlah agen, haptic feedback, dan desain neumorphic modern.
    - Bottom Sheet [`AgentMessengerModal.tsx`](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/apps/web/src/components/office/AgentMessengerModal.tsx) dengan pencarian agen realtime, preview percakapan terkini (`speech`), status dot animasi, dan quick selection instant.
    - Tombol integrasi quick-switch di header [`AgentSheet.tsx`](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/apps/web/src/components/agent-sheet/AgentSheet.tsx) sehingga CEO dapat beralih obrolan antar agen dalam 1 ketukan tanpa keluar ke denah kantor 3D.
    - Kamus i18n dwibahasa namespace `messenger` lengkap di `apps/web/src/i18n/index.ts` (Rule C3c).
    - Unit test suite [`messenger.test.tsx`](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/apps/web/src/components/office/__tests__/messenger.test.tsx) (5 tests) PASS 100%.

---

## 2. Fokus & Prioritas Kerja Aktif
- **Fase 5 (List Cron + FAV Messenger) telah selesai 100%.**
- Menunggu arahan pengguna untuk fase atau fitur selanjutnya.

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
