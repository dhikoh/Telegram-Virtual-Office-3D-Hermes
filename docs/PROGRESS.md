# Project Progress & Session State (C10)

## 1. Current Phase: Phase 4 (Agent Sheet, Chat, Tasks, Inbox) — COMPLETED

- **Status**: Phase 4 completed and verified (Agent Sheet bottom sheet with Chat/Activity/Tasks/Profile tabs, SSE live chat streaming, Tasks Kanban swipe with task creation and markdown viewer modal, Inbox pending approvals with full action text and haptic decisions).
- **Next Phase**: Phase 5 (Reports & KPIs).

---

## 2. What Is Done (Phases 0, 1, 2, 3 & 4)

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

---

## 3. Next Steps (Phase 5: Reports & KPIs)

1. Implement Reports screen (`apps/web/src/screens/Reports.tsx`) with department tabs (command, social, sales, finance, marketing, analytics, support, hr).
2. Implement KPI sparklines and charts using Recharts for visual progress tracking.
3. Display verified vs unverified source badges on reports per Rule REQ-078.
4. Connect to server-side anti-hallucination report generation pipeline (`/api/reports/generate` and `/api/kpis`).
5. Run full regression gate (`npm run typecheck && npm test && npm run gap-check`).

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
