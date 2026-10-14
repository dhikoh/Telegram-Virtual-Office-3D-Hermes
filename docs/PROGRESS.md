## 1. Current Phase: Tahap 13 (aset 3D CC0) — done, local commit; next Tahap 14 (proyek & DAG); Push B menunggu Tahap 14

- **Status**: Tahap 12 **live** (deploy `3153615` terverifikasi 2026-10-14: container healthy, `/api/health` 200, `dist/routes/media.js` memuat download route, migrasi `006` ter-apply, tabel `media` ada, log 0 error). Tahap 13 selesai: 6 GLB furnitur CC0 Kenney (42.5 KB total, terkompres) + `knight.glb` KayKit (345 KB, staged) di `apps/web/public/assets/3d/` + lisensi teks; `GLTFurniture` (slot per ruang/lounge/gate, prop tidak menutupi meja agen) + `loadFurnitureModels` (GLTFLoader dynamic import, gagal → `null`, ECO tak fetch) aditif di `Furniture.tsx`; `docs/ASSETS.md` §4 provenance (sumber, penulis, CC0, ukuran, gap jujur: Character Animations itch.io tak bisa diunduh otomatis, knight belum dipakai). 479 test hijau (52 file), tsc 0, budget: Office3D **220.5 KB** gzip (≤228), index 108.5, Map 41.5; 6 GLB ter-copy ke dist. **Commit lokal saja — Push B setelah Tahap 14** (kesepakatan: aset 3D & Tahap 14 di-push bersamaan).
- **Next Step**: Tahap 14 (tabel `projects`, orkestrator memecah jadi subtask berdependensi, peta DAG di UI) → **Push B** (Tahap 13+14, aset 3D commit sendiri di dalamnya). Sisa terbuka: wiring artefak otomatis dari stream run, toggle aktif-skill per agen, wiring 3D avatar (butuh Character Animations manual). REQ-119 tetap BLOCKED (tes HP asli). Gateway patch lokal 1 baris tetap berlaku (backup `.bak-20261013`, undo `/root/skills-fix.patch`).

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
