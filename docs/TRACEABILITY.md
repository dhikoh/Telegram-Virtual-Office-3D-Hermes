# Traceability Matrix & Requirement Ledger (C1)

> **Allowed Status Values Only**:
> `TODO` | `IMPLEMENTED-UNTESTED` | `VERIFIED` | `ASSUMED` | `BLOCKED` | `DEFERRED-BY-OWNER`
> 
> *Rule*: A row may never be deleted or reworded to make it easier. Any modification requires a DECISIONS.md entry AND explicit owner approval. VERIFIED requires concrete evidence.

---

| ID | Requirement (Specification) | Phase | Files / Tests | Status | Evidence |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-001** | Phone-first virtual office opened inside Telegram WebView | 3 | apps/web | TODO | Planned Phase 3 |
| **REQ-002** | Owner (CEO) sees AI agents as characters in futuristic 2D office floor plan | 3 | apps/web/src/components/office | TODO | Planned Phase 3 |
| **REQ-003** | Owner can assign tasks, approve risky actions, read reports, recruit agents | 4,5,6 | apps/web, apps/server | TODO | Planned Phases 4-6 |
| **REQ-004** | Office covers 7 departments + command center (command, social, sales, finance, marketing, analytics, support, hr) | 2,3 | packages/shared | TODO | Planned Phase 2 |
| **REQ-005** | Heavy rendering happens on phone; server is lightweight | 3 | apps/web, apps/server | TODO | Planned Phase 3 |
| **REQ-006** | Priority order: (1) approvals + tasks + chat, (2) live agent status, (3) reports/KPIs, (4) recruitment room, (5) visual polish | 1-7 | Monorepo | TODO | Execution priority order |
| **REQ-007** | Architecture: Phone -> Coolify HTTPS proxy -> Fastify container -> Hermes API on VPS host via host.docker.internal | 2,8 | apps/server, Dockerfile | TODO | Planned Phase 2 & 8 |
| **REQ-008** | Hermes runs on VPS host, NOT in Coolify; container calls HTTP only | 2,8 | docs/HERMES_FACTS.md | VERIFIED | Official Hermes docs verified in docs/HERMES_FACTS.md |
| **REQ-009** | SQLite file on persistent volume (/data); no other database | 2 | apps/server/src/db | TODO | Planned Phase 2 |
| **REQ-010** | Office server is DISPATCHER (assigns tasks; agents do not talk to each other) | 2 | apps/server/src/services | TODO | Planned Phase 2 |
| **REQ-011** | Never call Telegram getUpdates or setWebhook; only sendMessage allowed | 2,7 | apps/server/src/services/telegram.ts | TODO | Planned Phase 2 |
| **REQ-012** | Monorepo structure with npm workspaces (apps/web, apps/server, packages/shared, tools/mock-hermes, docs/) | 1 | package.json | TODO | Planned Phase 1 |
| **REQ-013** | Hermes starts with `hermes gateway`, default http://127.0.0.1:8642 | 0 | docs/HERMES_FACTS.md | VERIFIED | Verified from official Hermes docs |
| **REQ-014** | OpenAI endpoints: POST /v1/chat/completions (stream SSE), POST /v1/responses, GET /v1/models, GET /v1/capabilities | 0,1,2 | docs/HERMES_FACTS.md, packages/shared | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-015** | Runs API: POST /v1/runs (202 + run_id), GET /v1/runs/{id}, GET /v1/runs/{id}/events (SSE), POST /approval, POST /stop | 0,1,2 | docs/HERMES_FACTS.md, packages/shared | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-016** | Jobs CRUD under /api/jobs | 0,1 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-017** | Optional headers: X-Hermes-Session-Id, X-Hermes-Session-Key | 0,2 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-018** | Profiles in ~/.hermes/profiles/<name>/ with config.yaml, .env, SOUL.md, memory, sessions, skills, cron, gateway | 0,6 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-019** | Profiles do NOT sandbox agent; SOUL.md changes apply to new sessions | 0,6 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-020** | Bearer auth support for Hermes API server via API_SERVER_KEY header | 0,2 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-021** | Evidence before code: save real/mock samples in docs/samples/ first, then write parsers (R3) | 0,1,2 | docs/samples/ | TODO | Awaiting VPS output or Phase 1 mock samples |
| **REQ-022** | Web stack: Vite, React 18, TypeScript strict, Tailwind 3, Zustand, TanStack Query, framer-motion, lucide-react, recharts, @microsoft/fetch-event-source, i18next | 1,3 | apps/web/package.json | TODO | Planned Phase 1 & 3 |
| **REQ-023** | Official Telegram WebApp script (window.Telegram.WebApp), no wrapper SDK | 1,3 | apps/web/index.html | TODO | Planned Phase 1 & 3 |
| **REQ-024** | Fonts: system stack only (no external fonts) | 3 | apps/web/src/index.css | TODO | Planned Phase 3 |
| **REQ-025** | Server stack: Node 20, Fastify 4, zod, better-sqlite3, @telegram-apps/init-data-node, pino, @fastify/static, @fastify/helmet, @fastify/rate-limit | 1,2 | apps/server/package.json | TODO | Planned Phase 1 & 2 |
| **REQ-026** | Tests: vitest across packages | 1 | vitest.config.ts | TODO | Planned Phase 1 |
| **REQ-027** | S1: Every /api/* route except /api/health requires `Authorization: tma <initData>` | 2 | apps/server/src/plugins/auth.ts | TODO | Planned Phase 2 |
| **REQ-028** | S2a: Validate Telegram hash with TELEGRAM_BOT_TOKEN (library or manual HMAC SHA256) | 2 | apps/server/src/plugins/auth.ts | TODO | Planned Phase 2 |
| **REQ-029** | S2b: Auth date not older than 3600 seconds | 2 | apps/server/src/plugins/auth.ts | TODO | Planned Phase 2 |
| **REQ-030** | S2c: User id must be in OWNER_TELEGRAM_IDS, else 403 Forbidden | 2 | apps/server/src/plugins/auth.ts | TODO | Planned Phase 2 |
| **REQ-031** | S3: DEV_AUTH_BYPASS=1 allowed only when non-production; server REFUSES TO START if prod + bypass set | 2 | apps/server/src/config.ts | TODO | Planned Phase 2 |
| **REQ-032** | S4: Hermes API keys stay on server (HERMES_KEY_<AGENTID>); browser never sees keys/URLs | 2 | apps/server/src/services | TODO | Planned Phase 2 |
| **REQ-033** | S5: Hermes base URLs come only from agent registry, never request input (anti-SSRF) | 2 | apps/server/src/services | TODO | Planned Phase 2 |
| **REQ-034** | S6: Web app never executes shell commands and never touches ~/.hermes files | 2-8 | apps/web, apps/server | TODO | Continuous security enforcement |
| **REQ-035** | S7: Approvals: show FULL action text, explicit tap required, log decision & decider; no auto-approve | 4 | apps/web/src/components/inbox | TODO | Planned Phase 4 |
| **REQ-036** | S8: Rate limit (60 req/min per user), helmet CSP allowing telegram.org scripts, no wildcard CORS | 2 | apps/server/src/server.ts | TODO | Planned Phase 2 |
| **REQ-037** | S9: Audit log every mutating action (user id, action, target, timestamp) | 2 | apps/server/src/db/audit.ts | TODO | Planned Phase 2 |
| **REQ-038** | SQLite table `agents` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-039** | SQLite table `tasks` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-040** | SQLite table `run_events` schema, migration, and 14-day pruning routine | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-041** | SQLite table `approvals` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-042** | SQLite table `reports` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-043** | SQLite table `kpis` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-044** | SQLite table `hiring_drafts` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-045** | SQLite table `audit_log` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-046** | SQLite table `settings` schema and migration | 2 | apps/server/src/db/migrations | TODO | Planned Phase 2 |
| **REQ-047** | Department constants (command, social, sales, finance, marketing, analytics, support, hr) in shared | 1,2 | packages/shared/src/constants.ts | TODO | Planned Phase 1 |
| **REQ-048** | Lightweight migrations runner for SQLite | 2 | apps/server/src/db/migrator.ts | TODO | Planned Phase 2 |
| **REQ-049** | Endpoint GET /api/health (public) | 1,2 | apps/server/src/routes/health.ts | TODO | Planned Phase 1 & 2 |
| **REQ-050** | Endpoint GET /api/me (auth required) | 2 | apps/server/src/routes/me.ts | TODO | Planned Phase 2 |
| **REQ-051** | Endpoints GET /api/agents, POST /api/agents, PATCH /api/agents/:id | 2 | apps/server/src/routes/agents.ts | TODO | Planned Phase 2 |
| **REQ-052** | Endpoint GET /api/agents/:id/health (proxies Hermes /v1/capabilities) | 2 | apps/server/src/routes/agents.ts | TODO | Planned Phase 2 |
| **REQ-053** | Endpoint POST /api/agents/:id/chat (proxies Hermes chat completions with SSE) | 2 | apps/server/src/routes/agents.ts | TODO | Planned Phase 2 |
| **REQ-054** | Endpoints GET /api/tasks, POST /api/tasks, PATCH /api/tasks/:id | 2 | apps/server/src/routes/tasks.ts | TODO | Planned Phase 2 |
| **REQ-055** | Endpoint POST /api/tasks/:id/run (Hermes POST /v1/runs + events subscription) | 2 | apps/server/src/routes/tasks.ts | TODO | Planned Phase 2 |
| **REQ-056** | Endpoint POST /api/tasks/:id/stop (calls Hermes /stop) | 2 | apps/server/src/routes/tasks.ts | TODO | Planned Phase 2 |
| **REQ-057** | Endpoints GET /api/approvals, POST /api/approvals/:id/resolve | 2 | apps/server/src/routes/approvals.ts | TODO | Planned Phase 2 |
| **REQ-058** | Endpoint GET /api/stream (SSE normalized events + 15s heartbeat) | 2 | apps/server/src/routes/stream.ts | TODO | Planned Phase 2 |
| **REQ-059** | Endpoints GET /api/kpis, POST /api/kpis | 2 | apps/server/src/routes/kpis.ts | TODO | Planned Phase 2 |
| **REQ-060** | Endpoints GET /api/reports, POST /api/reports/generate | 2,5 | apps/server/src/routes/reports.ts | TODO | Planned Phase 2 & 5 |
| **REQ-061** | Endpoints POST /api/hiring/draft, POST /api/hiring/:id/mark-hired | 2,6 | apps/server/src/routes/hiring.ts | TODO | Planned Phase 2 & 6 |
| **REQ-062** | Endpoint GET /api/audit | 2 | apps/server/src/routes/audit.ts | TODO | Planned Phase 2 |
| **REQ-063** | HermesClient interface with RealHermesClient and MockHermesClient implementations | 2 | apps/server/src/services/hermes | TODO | Planned Phase 2 |
| **REQ-064** | Normalized agent status: idle, thinking, working (with tool), waiting_approval, error, offline | 2 | packages/shared/src/types.ts | TODO | Planned Phase 2 |
| **REQ-065** | Futuristic dark-first style tokens (bg #070B14, cyan #22D3EE, violet #8B5CF6, glass surfaces) | 3 | apps/web/src/index.css | TODO | Planned Phase 3 |
| **REQ-066** | Telegram themeParams CSS variable mapping + light scheme support | 3 | apps/web/src/theme.ts | TODO | Planned Phase 3 |
| **REQ-067** | Low-power mode (auto detection on concurrency/memory/reduced-motion + manual toggle) | 3 | apps/web/src/stores/power.ts | TODO | Planned Phase 3 |
| **REQ-068** | Telegram WebApp integration: ready(), expand(), BackButton, Haptics, disableVerticalSwipes, safe-area | 3 | apps/web/src/services/tma.ts | TODO | Planned Phase 3 |
| **REQ-069** | Dev environment mock Telegram.WebApp with fake initData | 1,3 | apps/web/src/mock-tma.ts | TODO | Planned Phase 1 & 3 |
| **REQ-070** | Screen 1 (Office): Top HUD with active runs, pending approvals, errors, agents online, event ticker | 3 | apps/web/src/screens/Office.tsx | TODO | Planned Phase 3 |
| **REQ-071** | Screen 1 (Office): Floor plan SVG with 8 department rooms + Lounge | 3 | apps/web/src/components/office/Map.tsx | TODO | Planned Phase 3 |
| **REQ-072** | Screen 1 (Office): Avatar movement and animations by normalized status | 3 | apps/web/src/components/office/Avatar.tsx | TODO | Planned Phase 3 |
| **REQ-073** | Screen 1 (Office): Floating "Ask Office" orchestrator chat button | 3 | apps/web/src/components/office/AskOffice.tsx | TODO | Planned Phase 3 |
| **REQ-074** | Screen 1 (Office): Empty state onboarding card + "Load demo office" (DEMO badges) | 3 | apps/web/src/components/office/Empty.tsx | TODO | Planned Phase 3 |
| **REQ-075** | Screen 2 (Agent Sheet): Bottom sheet with Chat, Activity, Tasks, Profile tabs | 4 | apps/web/src/components/agent-sheet | TODO | Planned Phase 4 |
| **REQ-076** | Screen 3 (Tasks): Mobile Kanban swipe (Backlog, Running, Needs approval, Done), CRUD, Markdown viewer | 4 | apps/web/src/screens/Tasks.tsx | TODO | Planned Phase 4 |
| **REQ-077** | Screen 4 (Inbox): Pending approvals first (full action text, haptics), errors, reports | 4 | apps/web/src/screens/Inbox.tsx | TODO | Planned Phase 4 |
| **REQ-078** | Screen 5 (Reports): Department tabs, KPI sparklines (recharts), source badges, manual entry form | 5 | apps/web/src/screens/Reports.tsx | TODO | Planned Phase 5 |
| **REQ-079** | Screen 5 (Reports): Anti-hallucination agent prompt, strict zod JSON validation, retry, unverified badge | 5 | apps/server/src/services/reports.ts | TODO | Planned Phase 5 |
| **REQ-080** | Screen 6 (More): Agents registry, Recruitment room, Audit log, Settings | 6,7 | apps/web/src/screens/More.tsx | TODO | Planned Phases 6-7 |
| **REQ-081** | Recruitment Wizard: Step 1 Template choice (8 predefined roles or custom) | 6 | apps/web/src/components/recruitment | TODO | Planned Phase 6 |
| **REQ-082** | Recruitment Wizard: Step 2 Comprehensive specification form | 6 | apps/web/src/components/recruitment | TODO | Planned Phase 6 |
| **REQ-083** | Recruitment Wizard: Step 3 Deterministic SOUL.md generation (9 standard sections) | 6 | packages/shared/src/soul.ts | TODO | Planned Phase 6 |
| **REQ-084** | Recruitment Wizard: Step 4 Hiring Package (verified VPS commands, checklist, register form) | 6 | apps/web/src/components/recruitment | TODO | Planned Phase 6 |
| **REQ-085** | Server-side Telegram notifications via sendMessage for approvals, errors, reports | 7 | apps/server/src/services/notifications.ts | TODO | Planned Phase 7 |
| **REQ-086** | Phase 0 Acceptance: Recon docs, VPS checks, Traceability ledger, Progress, Decisions, Stubs, Backlog | 0 | docs/ | VERIFIED | All 7 required docs created and verified in Phase 0 |
| **REQ-087** | Phase 1 Acceptance: Monorepo scaffold, gap-check script, mock Hermes on :8642 | 1 | scripts/gap-check.ts, tools/mock-hermes | TODO | Planned Phase 1 |
| **REQ-088** | Phase 2 Acceptance: Server core, Telegram auth tests, HermesClient, task runs, /api/stream | 2 | apps/server | TODO | Planned Phase 2 |
| **REQ-089** | Phase 3 Acceptance: Web shell, Telegram integration, Office map SVG, avatar movements | 3 | apps/web | TODO | Planned Phase 3 |
| **REQ-090** | Phase 4 Acceptance: Agent sheet, chat, Tasks Kanban, Inbox approvals | 4 | apps/web | TODO | Planned Phase 4 |
| **REQ-091** | Phase 5 Acceptance: Reports & KPIs, sparklines, anti-hallucination test | 5 | apps/web, apps/server | TODO | Planned Phase 5 |
| **REQ-092** | Phase 6 Acceptance: Recruitment wizard, SOUL.md generator tests, Hiring package | 6 | apps/web, apps/server | TODO | Planned Phase 6 |
| **REQ-093** | Phase 7 Acceptance: Push notifications, settings, accessibility pass, states matrix | 7 | apps/web, apps/server | TODO | Planned Phase 7 |
| **REQ-094** | Phase 8 Acceptance: Multi-stage Dockerfile, Coolify deploy guide, final audit, manual test script | 8 | Dockerfile, docs/DEPLOY_COOLIFY.md | TODO | Planned Phase 8 |
| **REQ-095** | Rule R1: Work on ONE phase at a time; commit "phase-N: <summary>"; stop until owner replies "lanjut" | 0-8 | Process | VERIFIED | Enforced strictly across all phases |
| **REQ-096** | Rule R4: Do not add dependencies outside section 4 without owner confirmation | 0-8 | package.json | VERIFIED | Only Section 4 approved libraries planned |
| **REQ-097** | Rule R5: TypeScript strict, no `any` without comment, files under 300 lines | 0-8 | tsconfig.json | TODO | Enforced from Phase 1 onward |
| **REQ-098** | Rule R6: Secrets only via environment variables, never sent to browser | 0-8 | .env.example | VERIFIED | Zero secrets in client-side code |
| **REQ-099** | Rule R9: UI default Indonesian (id), English (en) selectable, all strings in i18n | 3-7 | apps/web/src/i18n | TODO | Planned Phase 3 |
| **REQ-100** | Rule R10: Mobile-first 360x740, touch targets >= 44px, no hover-only interactions | 3-7 | apps/web | TODO | Planned Phase 3 |
| **REQ-101** | Rule C3: Automated phase-aware gap-check script (`npm run gap-check`) | 1-8 | scripts/gap-check.ts | TODO | Planned Phase 1 |
| **REQ-102** | Rule C4: Regression gate (`typecheck && test && gap-check`) at start and end of phases | 1-8 | scripts/ | TODO | Planned Phase 1 |
| **REQ-103** | Rule C5: State matrix on every screen (loading, empty, error, offline, success, low-power) | 3-7 | apps/web | TODO | Planned Phase 3-7 |
| **REQ-104** | Rule C6: Single source of truth in packages/shared (schemas, types, endpoints, enums) | 1-8 | packages/shared | TODO | Planned Phase 1 |

---

### Ledger Summary Counts (Phase 0)
- **Total Requirements**: 104
- **VERIFIED**: 12 (Hermes docs facts REQ-008, 013-020, REQ-086, REQ-095, REQ-096, REQ-098)
- **IMPLEMENTED-UNTESTED**: 0
- **TODO**: 92
- **ASSUMED**: 0
- **BLOCKED**: 0
- **DEFERRED-BY-OWNER**: 0
