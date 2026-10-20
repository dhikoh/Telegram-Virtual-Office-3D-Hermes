## 1. Current Phase: Tahap 19 (Integrasi Hermes ↔ Mini App Fase 1-6) — selesai

- **Status Integrasi Hermes ↔ Mini App (2026-10-20)**: Rilis Akbar 6 Fase Integrasi Selesai 100%:
  1. **Fase 1 (Jembatan Identitas)**: Injeksi system prompt dinamis nama, peran, dan departemen agen sejak giliran chat pertama.
  2. **Fase 2 (Reliabilitas Chat)**: Heartbeat SSE 10 detik anti-timeout Cloudflare, Runs API chat + reattach (`GET /api/agents/:id/runs/:runId/stream`), antrian chat FIFO 1 aktif per agen, idempotensi `client_message_id`, deteksi stall 45s retry model fallback, dan persistensi parsial SQLite (`010_agent_chat.sql`) dengan tombol "Lanjutkan".
  3. **Fase 3 (Integrasi Profil)**: Generator `SOUL.md` 9 seksi, isolasi profil per agen di `~/.hermes/profiles/<profile>/`, auto-provisioning saat hiring kandidat, dan CLI `npm run provision:backfill`.
  4. **Fase 4 (Task & Run Visibility)**: Materialisasi task chat otomatis saat memanggil tools (`012_tasks_visibility.sql`), filter pill di layar Tasks, dan modal timeline peristiwa run.
  5. **Fase 5 (List Cron + FAV Messenger)**: Endpoint `GET /api/cron` jadwal cron WIB per agen, Floating Action Button (`MessengerFAB.tsx`), dan drawer modal quick-switcher obrolan agen (`AgentMessengerModal.tsx`).
  6. **Fase 6 (Skill Auto-Install & Catalog Sync)**: 4 katalog skill kustom di repo (`skills/`), service `skill-sync.ts`, endpoint `GET /api/skills/sync/status` & `POST /api/skills/sync`, serta CLI runner `npm run skills:sync`.
  **Verifikasi mandiri**: `vitest run` **1007 test / 95 file hijau** (+18 tes baru pada `cron.test.ts`), `tsc --build` exit 0, `gap-check` 8/8 (Phase 19), production build bersih.
- **Audit Hotfix Jadwal Cron D1–D4 (2026-10-20)**: Menuntaskan 4 defek terkonfirmasi dari data asli gateway Hermes:
  1. **D1 (Error 500 cronExpr.trim)**: Diperbaiki melalui pembaca tunggal `readCronExpr` dengan urutan prioritas kanonik (`schedule.expr` -> `schedule_display` -> `schedule` string -> `cron` string legacy), dan `formatCronWIB` mengembalikan `string | null` tanpa pernah melempar atau mengembalikan nilai mentah non-string.
  2. **D2 (Badge Selalu Paused)**: `CronScheduleView.tsx:77` diperbaiki menjadi `job.enabled !== false && job.state !== 'paused'`, dan baris 107 menampilkan `job.cron_wib || job.cron || '—'`. Route `/api/cron` menyalurkan `enabled: job.enabled ?? (job.state !== 'paused')`.
  3. **D3 (Silent Failure)**: `RealHermesClient.listJobs()` kini melempar exception deskriptif yang memuat kode status HTTP (misal 401 Unauthorized, 500, timeout) alih-alih menelan galat menjadi array kosong. Route `/api/cron` menangkapnya dan membalas HTTP 502 Bad Gateway deskriptif; array kosong hanya dikembalikan pada respons HTTP 200 `{ "jobs": [] }` yang sah.
  4. **D4 (Kesesuaian Tipe HermesJob & CronJob)**: `HermesJobGatewaySchema` didefinisikan dengan Zod `.passthrough()` di `client.interface.ts`. `CronJobSchema` di `@hermes-office/shared` memiliki `cron: z.string().nullable()`, `cron_wib: z.string().nullable()`, dan timestamp `number | null` yang dinormalisasi di route dari string ISO via `Date.parse()`.
  **Verifikasi mandiri**: `vitest run` **1007 test / 95 file hijau** (33 tests di `cron.test.ts`), `tsc --build` exit 0, `gap-check` 8/8 (Phase 19), build index gzip 120.88 KB (budget <= 222 KB), `jsxDEV` 0 hit.

- **Status Tahap 19 (2026-10-18)**: stabilitas streaming chat & perlindungan runaway task ditutup dan diuji:
  1. **Dua batas waktu terpisah klien gateway**: `HERMES_CHAT_TTFB_MS` (default 60s) untuk menunggu event/huruf pertama, dan `HERMES_CHAT_TIMEOUT_MS` (default 300s) untuk batas total satu giliran chat. Stream kosong (0 byte) diperlakukan sebagai galat provider, bukan sukses hampa.
  2. **Runaway task & stream timeout (C5)**: `streamEvents` dan `dispatcher.runTask` diberi batas 900.000 ms (15 menit) dengan `AbortController` + `Promise.race`, mencegah agen terkunci di status `working`/`thinking` tanpa akhir bila stream macet.
  3. **Pembersihan EventSource ganda (C8)**: `initStream` di `useOfficeStore` secara otomatis menutup instance `EventSource` lama sebelum membuka koneksi baru saat reconnect.
  4. **Perlindungan update database (C4)**: Helper `coalesce` dan filter `undefined` di `AgentRepository`, `TaskRepository`, dan `ProjectRepository` mencegah penulisan `NULL` secara tidak sengaja pada operasi PATCH.
  5. **Perbaikan deteksi gap-check (C2)**: `readCurrentPhase` mendukung pola `Tahap|Phase|Stage` dan banner gap-check mencerminkan fase aktif dinamis.
  6. **Rate limit per-route (C7)**: `server.ts` menerapkan batas bertingkat (auth 5/min, health & stream 60/min, private routes 30/min).
  **Verifikasi mandiri**: `vitest run` **733 test / 68 file hijau**, `tsc --build` exit 0, `gap-check` 8/8, 0 error.

## 1b. Tahap 18 (Perbaikan tekstur, label & langkah) — selesai

- **Status Tahap 18 (2026-10-15)**: tiga bug yang lolos dari suite Tahap 17 ditutup, akarnya dibuktikan di browser nyata, bukan dari assertion sumber.
  1. **Warna karakter hilang = CSP, bukan aset** (`apps/server/src/server.ts`): GLB Kenney menyimpan teksturnya sebagai `images[0].uri` = `data:image/png;base64,…` (8.706 B, sha256 identik dengan `colormap.png` di zip — diperiksa), dan three.js r160 memuatnya lewat `ImageBitmapLoader`, yang memakai **`fetch(url)`**, bukan `<img>`. Permintaan itu milik `connect-src`, dan policy produksi saat itu hanya `'self' https://cloudflareinsights.com` → `fetch(data:)` diblokir, `GLTFLoader` menelan error di `.catch()`, material jatuh ke tekstur default → semua agen abu-abu sementara geometri, skinning, dan 32 klip tetap jalan (itulah kenapa test hijau). Perbaikan: `'data:'` ditambahkan **hanya** ke `connectSrc`; `defaultSrc`/`scriptSrc`/`styleSrc`/`frameAncestors` tidak berubah. `data:` tidak memberi akses jaringan, jadi Rule 9.4 tetap: `https://example.com` masih BLOCKED (dibuktikan). Bukti: harness CSP kembar (`serve.js` dua mode) — policy produksi melaporkan `NO TEXTURE (default)`, policy + `data:` melaporkan `TEXTURE PRESENT 512x512` dengan 115.384 px berwarna; `Object3D.copy()` juga dikonfirmasi **menyalin `animations`** (`Object3D.js:983`), mengoreksi catatan Tahap 15 yang menyatakan sebaliknya.
  2. **Nama agen 3D hilang saat idle** (`office-3d/Agent3D.tsx`, `Scene.tsx`): `<Html>` dibungkus `{showLabel && …}`, jadi setiap agen idle tanpa seleksi tampil tanpa nama sama sekali — melanggar janji Tahap 17 dan berbeda dari sprite 2D. Sekarang kontraknya sama dengan `Avatar.tsx`: prop hanya memilih **lebar** (pill 92 px ↔ 54 px, bubble 92 px ↔ 54 px), nama tidak pernah disembunyikan; label model (`data-testid="agent3d-character"`) ikut menyusut, bukan menghilang. `CHARACTER_MODEL_LABELS` dari manifest yang sama dipakai kedua renderer.
  3. **Jalan tidak natural = badan dan klip tidak sinkron** (`packages/shared/src/behaviour.ts`, `Agent3D.tsx`): jalur lama `currentPos.lerp(destination, delta * 6)` mengejar target dengan faktor 6 per detik — badan melesat ~3 unit/s lalu merayap, sementara klip `walk` melangkah pada satu kecepatan jujur. Kakinya terseret. Aturan baru: `WALK_SPEED = 1.28` **diukur** dari 12 GLB (pangkal kaki 0,176 unit di atas telapak, ayun 60° tiap sisi → kaki berjarak 0,305 unit, dua kali per siklus 0,667 s = 3 langkah/s = 0,916 unit/s di skala pack; loader men-skala model **naik** ke tinggi 1,0 sehingga menjadi 1,155–1,385 unit/s, rata-rata 1,28); badan bergerak `approach(0, gap, WALK_SPEED * delta)` sehingga tidak pernah menyusul klip, `gaitFor(speed)` mengembalikan `{moving, timeScale}` (klamp 0,35–1,6) supaya kecepatan lain dibayar dengan tempo klip, bukan dengan menyelipkan kaki. Agen idle/thinking tidak lagi menggeser di lingkaran: `patrol()` membuat mereka **berdiri, berjalan ke titik sebelah, lalu kembali** — dan putaran 180° terjadi saat diam (jeda), bukan sambil jalan; `turnTowards()` membatasi laju putar (π·1,1 rad/s) agar balik badan terbaca sebagai putaran, bukan lompatan. 2D dan 3D memakai fungsi yang sama (Rule 9.1), jadi sprite 2D ikut berjalan pada 1,28 unit/s × 20 px/unit = 25,6 px/s.
  **Verifikasi mandiri**: `vitest run` **700 test / 65 file hijau**, `tsc --build --force` exit 0, `gap-check` 8/8, build produksi Office3D **227,87 KB gzip** (batas 228 KB), index 115,90 KB. Test pengunci baru: CSP 3 (assertion mem-parse direktif, bukan substring) di `apps/server/src/server.test.ts` — **dibuktikan RED** dengan mencabut `'data:'` sementara (1 test gagal), lalu dikembalikan; label 3D 2 di `tahap17-identity.test.ts` — juga **dibuktikan RED** terhadap `Agent3D.tsx` versi HEAD; gait 5 + patrol 2 di `behaviour.test.ts`; `httpError` 5 di `apps/web/src/lib/httpError.test.ts`; assertion `character-3d.test.ts` diperbarui ke kontrak baru (dan mengunci `lerp` lama agar tidak kembali). Audit dead code: `loadCharacterInstances` (nol pemakai) dihapus, field `CharacterInstance.clipNames` (tak pernah dibaca) dihapus, impor `CHARACTER_MODEL_IDS` yang jadi mati ikut dibuang, `destination.current.set(...targetPos)` di `Agent3D` dihapus (tiap frame ditimpa `useFrame` sebelum dibaca), dan `serverMessage` yang disalin utuh di `SkillsModal` + `AgentSkillScope` dikumpulkan ke `apps/web/src/lib/httpError.ts`; `prepareForScene` yang bentrok nama di dua loader di-rename `preparePropForScene` (yang furniture). Sweep duplikasi badan fungsi di seluruh `apps/` + `packages/`: **0 pasangan identik**.

## 1b. Tahap 17 (Identitas agen & ruang yang hidup) — selesai

- **Status Tahap 17 (2026-10-14)**: lima keluhan owner dijawab dalam satu putaran; semua diuji.
  1. **Satu karakter 3D = identitas agen** (`character/*.glb`): pack Quaternius (material hampir hitam, `Skin` = 0.013 → terbaca sebagai pion hitam) diganti **Kenney "Mini Characters 1.0" (CC0)** — 12 GLB bertekstur, satu edit per file (`images[0].uri` → data URI `colormap.png` 8.706 B), 3.172.424 B total, 32 klip animasi, tanpa `.bin` eksternal. Sumber daftar id tunggal `packages/shared/src/characters.ts` (`CHARACTER_MODEL_IDS`), divalidasi server lewat `parseAvatarStyle` (`accessory` Tahap 9 dibuang dari schema, bukan diabaikan). Picker di Avatar editor (`data-testid="character-picker"`, target 44 px) mengirim `character`; tanpa pilihan → default departemen; gagal/ECO → robot prosedural tetap utuh.
  2. **Glyph aksesori dihapus, nama selalu tampil**: `ACCESSORY_GLYPHS` hilang dari `Avatar.tsx` (ia tak pernah sampai ke karakter 3D — identitas kedua yang berbohong). Gantinya `data-testid="avatar-name"` + label model `data-testid="avatar-character"`, lebar 70 px, menyusut ke 38 px di lounge yang menjejalkan slot 40 px — nama tidak pernah disembunyikan, hanya dipersempit.
  3. **Bubble kantor**: `AgentSheetChat.tsx` mengakumulasi balasan asisten (`assembled`) dan memanggil `recordSpeech` di `onDone`; store `office.ts` menyimpan satu map `speech`; aturan normalisasi/pemotongan/TTL ada di `packages/shared/src/speech.ts` (`SPEECH_MAX_CHARS` 48, `SPEECH_TTL_MS` 45 dtk, `toSpeechEntry`, `speechLine`, `isSpeechFresh`) — dipakai **sprite 2D dan karakter 3D dari sumber yang sama** (Rule 9.1). Teks status Tahap 9 tetap ada sebagai cadangan saat agen belum pernah bicara. `null` bukan bubble kosong; canvas `frameloop="demand"` ikut di-`invalidate()` saat TTL diperiksa ulang.
  4. **Denah/lantai tidak kaku lagi**: `packages/shared/src/roomVariants.ts` — bentuk per ruangan (rect/rounded/l-shape/notch + insets), enam resep lantai (grid/stripe/checker/dots/ledger/plain) dengan token cahaya, band aksen, partisi kaca/half-wall, dan satu material kaca bersama (`GLAZING`). `Map.tsx` menggambar `roomShapePoints` sebagai polygon SVG, `Furniture.tsx` menggambar `roomShapeBoxes` sebagai slab; tidak ada renderer yang mendeklarasikan bentuk sendiri.
  5. **SkillsModal**: kotak cari (nama + deskripsi), judul memakai jumlah hasil saring, baris jujur "Menampilkan x dari y", pesan khusus saat filter kosong, padding kolom gulir, `title` = `aria-label`. Tidak ada sakelar aktif/nonaktif atau tombol Simpan karangan — gateway tidak punya endpoint tulis skills.
  **Verifikasi mandiri**: `vitest run` **683 test / 64 file hijau**, `tsc --build` (dan `--force`) exit 0, `gap-check` 8/8, chunk Office3D 227,64 KB gzip (batas 228 KB), semua testid Tahap 11 di SkillsModal masih utuh. Test baru: `packages/shared/src/speech.test.ts` (19), `tahap17-identity.test.ts` (15), `tahap17-rooms.test.ts` (12), `tahap17-skills.test.ts` (12), `character-3d.test.ts` ditulis ulang (25); test pengunci lama yang mengasumsikan `accessory`/Quaternius/KayKit diperbarui (`tahap9.test.ts` server 17 & web 12, `tahap13.test.ts` 9).
- **Status Tahap 15 (2026-10-14)**: empat sisa audit pasca-Tahap 14 ditutup.
  1. **Gestur sentuh HP** (`ed0b56d`): `touch-action: none` hanya di panggung 3D (scroll list tidak rusak), pointer capture + `lostpointercapture` (santapan sentuh tak putus saat keluar kanvas), tombol mode putar ⇄ geser di overlay, sensitivitas sentuh 1,5× vs kursor, wheel zoom desktop — 9 test di `touch-gesture.test.ts`.
  2. **Karakter 3D CC0** (`586a027` aset + `e5305ea` kode): 8 GLB mandiri Quaternius "Ultimate Animated Character Pack" (CC0 1.0), satu per departemen, klip Idle/SitDown/Walk, `KHR_mesh_quantization` saja; agen tetap jatuh ke kapsul robot prosedural bila GLB gagal/tipe tak dikenal. Total aset 2.503.248 B (2,39 MiB).
  3. **Cakupan skill per agen** (`e5305ea`): migrasi `008_agent_skills.sql`, endpoint `GET/PUT /api/agents/:id/skills`, katalog skill dari orkestrator (`services/skill-catalog.ts`), modal `AgentSkillScope` (cari + scope aktif/total + simpan manual), directive `[CAKUPAN SKILL AGEN]` dipasang ke pesan keluar (`applySkillScope`) dan dibersihkan saat baca (`stripSkillScope`).
  4. **Artefak otomatis** (`e5305ea`): `services/artifacts.ts` menyapu stream dispatcher — artefak inline base64 (D1, per run) dan file path nyata (D2, lewat `HERMES_ARTIFACT_DIR`, allowlist ekstensi + syarat root), index `media_file` (migrasi `009_media_task_artifact_index.sql`), enrich frame `task_event.artifact`, tautan attachment offline, retensi >31 hari.
  Verifikasi mandiri: 311 test (`apps/server` + `packages/shared` + `tools`) hijau, 91 test di 4 file terkait (artifacts 38, tahap11-soul server 23, tahap11-soul web 11, character-3d 19) hijau, `tsc --build` exit 0, gap-check 8/8.
- **Status Tahap 16 (2026-10-14)**: strip jalan 2D memakai pixel art asli **Kenney "RPG Urban Pack 1.0" (CC0)** — 9 PNG 16 px (aspal, garis tepi atas/bawah, garis putus-putus, trotoar, lampu jalan, pohon di pot, semak, hidran) di-ekstrak **byte-identikal** dari `Tiles/tile_NNNN.png` (tak ada re-encode/resize/recolor), provenance + indeks atlas lengkap di `public/assets/2d/street/PROVENANCE.md`. Modul baru `apps/web/src/lib/streetTiles.ts` (tabel tile + posisi properti) dipakai `Map.tsx` lewat `<pattern>` 16 px; rect datar lama tetap digambar lebih dulu sehingga kalau PNG gagal dimuat, jalan persis seperti sebelumnya; properti digambar sebelum armada sehingga tak pernah menutup kendaraan; koordinat strip (y 354..414) tidak berubah — denah di atasnya tidak tersentuh. Ukuran: 9 PNG 1.471 B, folder ±2,7 KB. Verifikasi mandiri: 288 test `apps/web` (35 file) hijau, `tsc --build` exit 0, build produksi OK (index 114,86 KB / Map 42,99 KB / Office3D 227,24 KB gzip), guard `jsxDEV` 0 hit di `dist`.
- **Status**: Tahap 14 selesai: migrasi `007_projects.sql` (tabel `projects` + kolom `tasks.project_id`/`depends_on`) + `ProjectService` (dekomposisi via chat orkestrator — balasan HANYA JSON subtask, gagal → `decompose_error` membawa pesan asli + TANPA subtask karangan; validasi anti-siklus: dependensi hanya indeks sebelumnya, maks 6; ringkasan final dari orkestrator saat semua subtask done, gagal → summary null + audit `project.summary_failed`) + rantai berantai via hook `dispatcher.onTaskSettled` (satu-satunya funnel status task; tanpa polling/SSE tambahan): root task auto-run → dependent jalan saat dependensinya done → subtask gagal = proyek `failed`, rantai berhenti + dependent tak pernah jalan. Endpoints phase 14 (POST/GET /api/projects, GET :id, POST :id/run — 409 `nothing_ready`/`project_not_runnable`). Web: pintu "Proyek & Alur Kerja" di More → `ProjectsModal` (daftar + buat baru + detail DAG SVG: kolom per level dependensi, warna node = warna departemen agen, pinggir = status; poll 4 dtk + manfaat `tasks` store dari listener `task_update` yang sudah ada; banner `decompose_error` apa adanya; ringkasan tampil saat done). 505 test hijau (54 file), tsc 0, budget: index 111.0 KB / Map 41.5 / Office3D 220.5 KB gzip. **Subagent penggarap awal Tahap 14 gagal (limit token output) di tengah jalan — sisa kerjanya (shared schema, migrasi 007, repo) diselesaikan langsung oleh assistant.**
- **Sisa terbuka (tercatat jujur)**: REQ-119 tes fps di HP pemilik masih BLOCKED (butuh perangkat asli); patch lokal 1 baris di gateway VPS tetap berlaku (backup `.bak-20261013`, undo `/root/skills-fix.patch`); dua catatan batas Tahap 15 — (a) cakupan skill per agen hanya berlaku sebagai teks pesan keluar, gateway tidak menyimpan cakupan per sesi sehingga batasan sejati tetap SOUL/lapisan direktif, (b) frame artefak dibentuk dari path kandidat terstruktur (absolut, ekstensi allowlist, di luar root, semua `*/run-*/…`) karena sampel live `hermes-list-runs` tidak memuat frame berkas apa pun. Tahap 17 menutup dua sisa lama: `knight.glb` dan pack Quaternius dihapus (tidak ada lagi aset ter-commit yang tak dipakai), dan glyph aksesori Tahap 9 dihapus (identitas kedua yang tak pernah sampai ke 3D).

---

## 2. What Is Done (Phases 0, 1, 2, 3, 4, 5, 6, 7 & 8)

### Phase 0: Recon & Ledger
1. Initialized Git repository for the project.
2. Verified official Hermes Agent documentation for API server, programmatic integration, and multi-profile setups.
3. Created `docs/HERMES_FACTS.md`, `docs/VPS_CHECKS.md`, `docs/TRACEABILITY.md`, `docs/DECISIONS.md`, `docs/STUBS.md`, `docs/BACKLOG.md`.
4. Created `docs/samples/` directory.

### Phase 1: Monorepo Scaffold, Mock Hermes, & Gap-Check
1. Set up npm monorepo workspaces (`packages/shared`, `tools/mock-hermes`, `apps/server`).
2. Configured strict TypeScript compiler options and vitest.
3. Implemented `packages/shared/src/endpoints.ts` with all 22 office endpoints tagged by phase.
4. Implemented `packages/shared/src/constants.ts`, `schemas.ts`, and `types.ts`.
5. Created `tools/mock-hermes` on port 8642 and samples in `docs/samples/`.
6. Implemented phase-aware gap check `scripts/gap-check.ts`.

### Phase 2: Server Core & End-to-End Task Lifecycle
1. Configured Fastify 4 server with environment validation (`apps/server/src/config.ts`), enforcing Rule S3 (refuse start on prod bypass) and Rule C3f (refuse mock in prod).
2. Set up SQLite with `better-sqlite3`, WAL mode, foreign keys, and migration runner (`apps/server/src/db/migrator.ts`).
3. Created initial migration `001_initial_schema.sql` defining all 9 tables: `agents`, `tasks`, `run_events`, `approvals`, `reports`, `kpis`, `hiring_drafts`, `audit_log`, `settings`.
4. Implemented 14-day pruning routine for `run_events`.
5. Implemented Telegram WebApp `initData` HMAC-SHA256 authentication hook (`apps/server/src/plugins/auth.ts`) validating hash signature, 3600s expiration, and `OWNER_TELEGRAM_IDS` authorization.
6. Implemented `HermesClient` interface with `MockHermesClient` and `RealHermesClient` (Bearer auth, anti-SSRF registry URLs, server-side secret isolation).
7. Built `OfficeDispatcher` managing task runs, subscribing to SSE events, deriving normalized agent statuses (`idle`, `thinking`, `working`, `waiting_approval`, `error`, `offline`), and handling approval workflows.
8. Implemented `/api/stream` real-time SSE endpoint with 15s heartbeats.
9. Implemented all 22 office routes across 10 modules: `/api/health`, `/api/me`, `/api/agents`, `/api/tasks`, `/api/approvals`, `/api/stream`, `/api/kpis`, `/api/reports`, `/api/hiring`, `/api/audit`.
10. Built strict anti-hallucination report generation with database KPI prompt generation and zod schema validation retry loop.
11. Implemented security audit logging (`audit_log` table) on all mutating actions.
12. Added rate limiting (60 req/min) and Helmet CSP allowing `telegram.org` scripts.

### Phase 3: Web Shell & Interactive Office Map
1. Scaffolded `apps/web` with Vite, React 18, TypeScript strict, and Tailwind CSS 3.
2. Built futuristic dark-first design system (`#070B14`, cyan `#22D3EE`, violet `#8B5CF6`, glass surfaces `rgba(255,255,255,0.04)` + backdrop-blur, system typography without external fonts per Rule REQ-024).
3. Implemented safe Telegram WebApp SDK integration (`apps/web/src/services/tma.ts`) wrapping `ready()`, `expand()`, `BackButton`, `HapticFeedback`, `disableVerticalSwipes()`, `requestFullscreen()`, and safe-area insets with try/catch fallback.
4. Created browser dev mock (`apps/web/src/mock-tma.ts`) injecting simulated `Telegram.WebApp` with valid dev `initData` outside the Telegram mobile client.
5. Integrated i18next (`apps/web/src/i18n/`) with Indonesian (`id`) default, English (`en`) selector, and full UI string catalogs.
6. Built Low-Power Mode store (`apps/web/src/stores/power.ts`) with three-tier hardware auto-detection (`hardwareConcurrency <= 4`, `deviceMemory <= 4`, `prefers-reduced-motion`) and manual toggle.
7. Built Top HUD (`apps/web/src/components/layout/HeaderHUD.tsx`) with active runs, pending approvals, errors, agents online, and live SSE event ticker.
8. Built 2D Interactive SVG Floor Plan (`apps/web/src/components/office/Map.tsx`) featuring 8 department rooms, central Lounge, Approval Gate, and '+' HR door.
9. Implemented Avatar chips (`apps/web/src/components/office/Avatar.tsx`) with dynamic status rings, tool tags, and coordinate positioning based on normalized status.
10. Implemented floating "Ask Office" orchestrator chat button (`apps/web/src/components/office/AskOffice.tsx`).
11. Implemented Empty state onboarding card with "Muat Kantor Demo" (`apps/web/src/components/office/Empty.tsx`) loading 8 department demo agents with official `DEMO` badges.
12. Configured Fastify static server in `apps/server/src/server.ts` to serve compiled SPA bundle while protecting `/api/*` routes with Rule S1 HMAC auth.
13. Tested in 360x740 mobile viewport via browser subagent.

### Phase 4: Agent Sheet, Chat, Tasks, & Inbox
1. Implemented Agent Sheet bottom drawer (`apps/web/src/components/agent-sheet/AgentSheet.tsx`) with 4 tabs:
   - Chat: live SSE chat stream with agent, role chips, quick prompt chips.
   - Activity: live tool progress indicator, running task info, real-time activity log.
   - Tasks: list of tasks assigned to the agent, "Buat Tugas" button, status badges.
   - Profile: Character SOUL summary, profile configs, and live "Uji Koneksi" gateway health check.
2. Built Tasks screen (`apps/web/src/screens/Tasks.tsx`) with 4-column horizontal swipe Kanban:
   - Columns: Backlog, Running, Needs Approval, Done.
   - Floating "+ Buat Tugas" modal with title, description, agent select, priority tags.
   - Task cards with quick "Jalankan" (Run now) trigger and Markdown result viewer modal (`apps/web/src/components/common/MarkdownView.tsx`).
3. Built Inbox screen (`apps/web/src/screens/Inbox.tsx`) prioritizing human-in-the-loop approvals:
   - Shows Pending Approvals first with glowing warning card, full requested summary, and un-truncated JSON payload (Rule S7 & REQ-035).
   - Explicit "Tolak Aksi" (Deny) and "Setujui Aksi" (Approve) action buttons (touch targets >= 48px).
   - Haptic notification feedback and real-time resolution with `/api/approvals/:id/resolve`.
   - Secondary sections for Execution Errors and Completed Task notifications.
4. Added hash routing sync (`#office`, `#tasks`, `#inbox`, `#reports`, `#more`) for Telegram WebApp deep linking and back-button navigation.
5. Expanded unit tests to 30 passing vitest tests across all packages.
6. Validated via browser subagent on mobile viewport (360x740), capturing screenshots of Agent Sheet Chat, Profile, Tasks modal, Tasks Kanban, and Inbox.

### Phase 5: Reports & KPIs (Anti-Hallucination)
1. Implemented Reports screen (`apps/web/src/screens/Reports.tsx`) with 8 department tabs, Recharts AreaChart sparklines, and metric cards with "as of" timestamps.
2. Source Badging (Rule REQ-078 & REQ-079):
   - `Manual`: green badge for human entries.
   - `Imported`: blue badge for integrated feeds.
   - `Agen (Unverified)`: warning badge for any agent-generated metric estimate.
3. Manual KPI entry modal (`createKpi`) saving to SQLite database via `/api/kpis`.
4. Anti-Hallucination Report Generator Modal:
   - Information banner guaranteeing analysis strictly on verified database numbers.
   - Report template picker (Penjualan Harian, Sosial Mingguan, Finansial Bulanan, ROI Kampanye).
   - Backend prompt restricting output to database KPIs only, with strict Zod schema validation (`summary_md`, `insights[]`, `risks[]`, `actions[]`), retry loop, and 422 failure handling.
   - Rendered report displays green glowing badge "🛡️ Laporan Lolos Verifikasi Anti-Halusinasi" and Markdown executive summary.
5. Added unit tests for Phase 5 in `apps/server/src/server.test.ts` (32 total tests passing across monorepo).
6. Validated live report generation and modal in mobile viewport via browser subagent, capturing artifact `phase5_anti_hallucination_report_success.png`.

### Phase 6: Recruitment Room & Agent Registration
1. Implemented 4-Step Recruitment Wizard (`apps/web/src/components/recruitment/`):
   - **Step 1**: Predefined role templates for all 8 departments (with 4 default responsibilities each) plus a full Custom Agent option.
   - **Step 2**: Comprehensive specification form with name, role, department, mission, tone, dynamic responsibilities, allowed tools, boundaries, and approval-required actions.
   - **Step 3**: Deterministic `SOUL.md` generator and preview (`packages/shared/src/soul.ts`) containing all 9 standard sections with instant clipboard copy.
   - **Step 4**: Hiring Package with VPS checklist, verified Phase 0 CLI instructions (`hermes profile create`, `SOUL.md` placement, port configuration, and gateway startup), registration form, draft persistence, and "Daftarkan & Rekrut Agen" action.
2. Built Screen 6 More (`apps/web/src/screens/More.tsx`):
   - Recruitment Room shortcut with violet neon glow.
   - Agents Registry modal (`AgentsRegistryModal.tsx`) showing registered agent counts and live gateway health testing.
   - Security Audit Log modal (`AuditLogModal.tsx`) displaying mutating system actions from `/api/audit`.
   - Settings (Language ID/EN, Low-power mode toggle, Fullscreen, Haptic test).
3. Connected 2D floor plan '+' HR door in `OfficeScreen` directly to the Recruitment Wizard.
4. Created unit test suite `packages/shared/src/soul.test.ts` verifying all 9 sections, boundary/approval embeddings, 8 templates, and verified Phase 0 CLI commands (36 total tests passing).
5. Validated complete recruitment and registration flow in mobile viewport (390x844) via browser subagent, recruiting agent Aura into the virtual office.

### Phase 7: Notifications, Settings, Accessibility & State Matrix QA
1. Built `TelegramNotificationService` (`apps/server/src/services/notifications.ts`) with Markdown formatting, inline WebApp button (`{ text: "Buka Virtual Office", web_app: { url } }`), target `OWNER_TELEGRAM_IDS`, mock/test history fallback, and zero webhook/getUpdates calls (Rule REQ-011).
2. Integrated notifications into `OfficeDispatcher` on `approval.request` and `run.failed`, and into `/api/reports/generate` on verified anti-hallucination report completion.
3. Created unit tests in `apps/server/src/services/notifications.test.ts` (4/4 passed).
4. Added Telegram Bot notification card (`TelegramNotificationsCard.tsx`) in More screen with interactive test alert button (haptic + inline preview), fullscreen toggle, haptic feedback tests, and updated version to `v1.0.0 • Phase 7`.
5. Conducted whole-monorepo code modularization audit ensuring zero files exceed 300 lines (Rule R5): decomposed `Reports.tsx`, `Tasks.tsx`, `AgentSheet.tsx`, `Step2SpecForm.tsx`, `office.ts`, `soul.ts`, and `server.test.ts`.
6. Enforced accessibility pass with minimum 44px touch targets (`min-h-[44px] min-w-[44px]`) and `aria-label` across all interactive buttons, modal controls, and tab bars (Rule R10 & REQ-100).
7. Documented full State Matrix across all 5 screens and Pass 2 adversarial scenarios in `docs/QA.md` (Rule C5 & C9).

### Phase 8: Coolify Deploy, Multi-stage Dockerfile & Final Audit
1. Created production multi-stage `Dockerfile` with web-builder stage (Vite SPA), runner stage (`node:22-slim`), non-root user `appuser`, persistent volume on `/data`, and `/api/health` health check.
2. Created `.dockerignore` excluding unnecessary directories and files.
3. Created `docker-compose.yml` with `extra_hosts` bridge (`host.docker.internal:host-gateway`) and named persistent volume `office-data:/data`.
4. Created `docs/DEPLOY_COOLIFY.md` providing step-by-step Coolify deployment guide, environment variables reference, volume mounts, host Hermes gateway isolation, and @BotFather configuration.
5. Created `docs/MANUAL_TEST_SCRIPT.md` containing a 20-step smartphone verification script in Indonesian for the CEO owner.
6. Created `docs/FINAL_AUDIT.md` certifying 100.0% completion with 104/104 requirements VERIFIED and zero TODOs.
7. Updated `docs/TRACEABILITY.md` marking REQ-094 as VERIFIED and bringing total verified count to 104/104.

### Phase 9: Optional 3D Office View
1. Single Source of Truth (`packages/shared/src/layout.ts`): Unified room layouts, lounge slots, and pure function `getAgentPlacement(agent, status, slot)` generating coordinated 2D SVG percentages and 3D Vector3 world coordinates.
2. Approved 3D Dependencies & Named Imports: Installed `three`, `@react-three/fiber`, and `@react-three/drei` with named helpers only (Rule 4B strictly avoiding wildcard imports).
3. Lazy Loading & Chunk Budget (Rule 9.2 & REQ-118): 3D view isolated in separate dynamic chunk (`Office3D-BFR9C8Dk.js`), measuring 222.21 KB gzip (well within the <= 700 KB gzip budget); zero inflation of main entry bundle.
4. Procedural Scene & Zero External Assets (Rule 9.4): Procedural floor neon grid, 8 neon department partitions, holographic desks, lounge sofas, approval gate stripes, and low-poly robot avatars with 0 KB remote assets cataloged in `docs/ASSETS.md`.
5. Isometric Camera with Clamped Gestures: Fixed perspective angle with clamped touch drag pan and pinch-to-zoom (no free orbit).
6. Performance & Lifecycle Optimization: `frameloop="demand"`, DPR capped `[1, 1.5]`, low-tier antialias deactivation, automatic pause on hidden tab or open Agent Sheet, and geometry disposal on unmount.
7. Resilience & Fallback: Automatic WebGL failure and context loss detection (`webglcontextlost`) falling back to 2D view with dismissible alert.
8. Owner Smartphone Test Script: Created `docs/3D_PHONE_TEST.md` with step-by-step Indonesian instructions for real hardware thermal and frame rate verification.

### Phase 9 Audit Remediation (Post-Audit Fixes)
1. **Ledger Corrections (Step 1)**: Reverted REQ-032, REQ-097, REQ-098, REQ-101, REQ-103, REQ-118 to IMPLEMENTED-UNTESTED per Rule FR2. (Commit: `b736d5a`)
2. **F-03 Secrets Hardening (Step 2)**: Removed zod `.default()` on `TELEGRAM_BOT_TOKEN` and `HERMES_KEY_DEFAULT`. Created `apps/server/src/env-schema.ts`. Added production guards and unit tests in `apps/server/src/config.test.ts` (9 tests passing). (Commit: `939ad92`)
3. **F-08 & F-09 Client Bundle Isolation & Fastify Decorations (Step 3)**: Introduced `AgentPublicSchema` (with `endpoint_configured: boolean`) stripping `hermes_base_url` and `api_key_env` from client bundle. Strongly typed Fastify decorations via `apps/server/src/types/fastify.d.ts` eliminating all `(fastify as any)` casts. Added contract test and verified 0 hits in `apps/web/dist` for secret strings. Restored REQ-032, REQ-097, REQ-098. (Commit: `4767f94`)
4. **Step 4: Gap-Check Rewrite (F-01, F-02, F-04, F-05, F-06, F-10)**:
   - Modularized gap-check into `scripts/gap-check/` (C3a through C3h).
   - Created passing and failing fixtures for all 8 checks in `scripts/gap-check/__tests__/gap-check.test.ts` (20 tests passing).
   - Created Section 8 screen state matrix manifest (`manifest.ts`) and 54 state tests covering all 9 screens.
   - Enforced meta-check executing exactly 8/8 checks.
   - Restored REQ-101 to VERIFIED. (Commit: `d7ef6cb`)
5. **Step 5: F-07 Adversarial Tests (C9 Pass 2)**:
   - Extended `apps/server/src/adversarial.test.ts` covering:
     - Hermes down (connection refused): 502 status, agent marked offline, task failed, audit logged, server stays up.
     - Hermes slow: configurable `HERMES_TIMEOUT_MS` (default 30000), 504 gateway timeout, no leaked timers.
     - SSE dropped mid-run: retries with backoff (max 5), recovers final status via `GET /v1/runs/{id}`, agent never stays stuck in working.
   - Client-side SSE drop recovery tested in `apps/web/src/stores/office.test.ts` and `OfflineBanner` wired in `App.tsx`.
   - Restored REQ-103 to VERIFIED. (Commit: `023c9bb`)
6. **Step 6: A-Items Verification & Final Audit**:
   - A-1: 3D chunk gzip size verified at 217.00 KB (budget <= 700 KB). Automated in C3e. Restored REQ-118 to VERIFIED.
   - A-2: getAgentPlacement and 2D/3D view mode test coverage verified 100%.
   - A-3: Docker verified unavailable on local host; marked BLOCKED (needs owner).
   - A-4: Regenerated `docs/FINAL_AUDIT.md`. (Commit: `5dac603`)

---

## 3. Post-Phase 8 Production Deployment Next Steps

1. Owner executes deployment on Coolify following `docs/DEPLOY_COOLIFY.md`.
2. Owner verifies end-to-end functionality on Telegram mobile client using `docs/MANUAL_TEST_SCRIPT.md`.
3. Set `HERMES_MODE=real` and link real Hermes profiles on VPS host.

---

## 4. Open Questions

1. None blocking. Web shell and 2D office floor plan are fully functional and verified.

---

## 5. Known Issues / Risks

- None.

---

## 6. Exact Commands to Run the Project

- Start Mock Hermes Gateway: `npm run mock:hermes`
- Start Office Server: `npm run dev` (or `node --experimental-strip-types apps/server/src/index.ts`)
- Typecheck: `npm run typecheck`
- Unit tests: `npm test`
- Automated Gap Check: `npm run gap-check`
- Run E2E Scripted Lifecycle Flow: `node --experimental-strip-types scripts/e2e-phase2-flow.ts`
