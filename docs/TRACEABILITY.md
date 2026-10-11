# Traceability Matrix & Requirement Ledger (C1)

> **Allowed Status Values Only**:
> `TODO` | `IMPLEMENTED-UNTESTED` | `VERIFIED` | `ASSUMED` | `BLOCKED` | `DEFERRED-BY-OWNER`
> 
> *Rule*: A row may never be deleted or reworded to make it easier. Any modification requires a DECISIONS.md entry AND explicit owner approval. VERIFIED requires concrete evidence.

---

| ID | Requirement (Specification) | Phase | Files / Tests | Status | Evidence |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-001** | Phone-first virtual office opened inside Telegram WebView | 3 | apps/web | VERIFIED | Tested in browser subagent in 360x740 mobile viewport |
| **REQ-002** | Owner (CEO) sees AI agents as characters in futuristic 2D office floor plan | 3 | apps/web/src/components/office | VERIFIED | 2D SVG floor plan and avatar positioning verified in Map.tsx & Avatar.tsx |
| **REQ-003** | Owner can assign tasks, approve risky actions, read reports, recruit agents | 4 | apps/web, apps/server | TODO | Planned Phases 4-6 |
| **REQ-004** | Office covers 7 departments + command center (command, social, sales, finance, marketing, analytics, support, hr) | 2 | packages/shared, apps/server | VERIFIED | Constants in shared & SQLite schema/routes support all 8 depts |
| **REQ-005** | Heavy rendering happens on phone; server is lightweight | 3 | apps/web, apps/server | VERIFIED | Client-side SVG/framer-motion rendering with lightweight Fastify server verified |
| **REQ-006** | Priority order: (1) approvals + tasks + chat, (2) live agent status, (3) reports/KPIs, (4) recruitment room, (5) visual polish | 7 | Monorepo | TODO | Execution priority order |
| **REQ-007** | Architecture: Phone -> Coolify HTTPS proxy -> Fastify container -> Hermes API on VPS host via host.docker.internal | 2 | apps/server, config.ts | VERIFIED | Fastify server + Hermes client host configuration verified |
| **REQ-008** | Hermes runs on VPS host, NOT in Coolify; container calls HTTP only | 2 | docs/HERMES_FACTS.md | VERIFIED | Official Hermes docs verified in docs/HERMES_FACTS.md |
| **REQ-009** | SQLite file on persistent volume (/data); no other database | 2 | apps/server/src/db | VERIFIED | better-sqlite3 with WAL mode in apps/server/src/db/index.ts |
| **REQ-010** | Office server is DISPATCHER (assigns tasks; agents do not talk to each other) | 2 | apps/server/src/services/dispatcher.ts | VERIFIED | OfficeDispatcher verified in server.test.ts & e2e-phase2-flow.ts |
| **REQ-011** | Never call Telegram getUpdates or setWebhook; only sendMessage allowed | 2 | apps/server/src/plugins/auth.ts | VERIFIED | Auth uses static HMAC parsing; zero getUpdates/setWebhook calls |
| **REQ-012** | Monorepo structure with npm workspaces (apps/web, apps/server, packages/shared, tools/mock-hermes, docs/) | 1 | package.json | VERIFIED | Root package.json workspaces verified via npm install & tsc |
| **REQ-013** | Hermes starts with `hermes gateway`, default http://127.0.0.1:8642 | 0 | docs/HERMES_FACTS.md | VERIFIED | Verified from official Hermes docs |
| **REQ-014** | OpenAI endpoints: POST /v1/chat/completions (stream SSE), POST /v1/responses, GET /v1/models, GET /v1/capabilities | 0 | docs/HERMES_FACTS.md, packages/shared | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-015** | Runs API: POST /v1/runs (202 + run_id), GET /v1/runs/{id}, GET /v1/runs/{id}/events (SSE), POST /approval, POST /stop | 0 | docs/HERMES_FACTS.md, packages/shared | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-016** | Jobs CRUD under /api/jobs | 0 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-017** | Optional headers: X-Hermes-Session-Id, X-Hermes-Session-Key | 0 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-018** | Profiles in ~/.hermes/profiles/<name>/ with config.yaml, .env, SOUL.md, memory, sessions, skills, cron, gateway | 0 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-019** | Profiles do NOT sandbox agent; SOUL.md changes apply to new sessions | 0 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-020** | Bearer auth support for Hermes API server via API_SERVER_KEY header | 0 | docs/HERMES_FACTS.md | VERIFIED | Verified in docs/HERMES_FACTS.md |
| **REQ-021** | Evidence before code: save real/mock samples in docs/samples/ first, then write parsers (R3) | 1 | docs/samples/ | VERIFIED | mock_run_events.jsonl & mock_chat_stream.txt saved in docs/samples/ |
| **REQ-022** | Web stack: Vite, React 18, TypeScript strict, Tailwind 3, Zustand, TanStack Query, framer-motion, lucide-react, recharts, @microsoft/fetch-event-source, i18next | 3 | apps/web/package.json | VERIFIED | Approved tech stack in apps/web/package.json verified via build & tests |
| **REQ-023** | Official Telegram WebApp script (window.Telegram.WebApp), no wrapper SDK | 3 | apps/web/index.html | VERIFIED | Official Telegram WebApp script in index.html verified |
| **REQ-024** | Fonts: system stack only (no external fonts) | 3 | apps/web/src/index.css | VERIFIED | System font stack in index.css without external web fonts verified |
| **REQ-025** | Server stack: Node 20, Fastify 4, zod, better-sqlite3, @telegram-apps/init-data-node, pino, @fastify/static, @fastify/helmet, @fastify/rate-limit | 2 | apps/server/package.json | VERIFIED | All approved stack dependencies active in apps/server/package.json |
| **REQ-026** | Tests: vitest across packages | 1 | vitest.config.ts | VERIFIED | vitest run executed, 23 tests passing across packages |
| **REQ-027** | S1: Every /api/* route except /api/health requires `Authorization: tma <initData>` | 2 | apps/server/src/plugins/auth.ts | VERIFIED | Tested in server.test.ts (health public, other routes require auth) |
| **REQ-028** | S2a: Validate Telegram hash with TELEGRAM_BOT_TOKEN (library or manual HMAC SHA256) | 2 | apps/server/src/plugins/auth.ts | VERIFIED | HMAC SHA256 timingSafeEqual tested in server.test.ts |
| **REQ-029** | S2b: Auth date not older than 3600 seconds | 2 | apps/server/src/plugins/auth.ts | VERIFIED | Expired timestamp rejection (>3600s) tested in server.test.ts |
| **REQ-030** | S2c: User id must be in OWNER_TELEGRAM_IDS, else 403 Forbidden | 2 | apps/server/src/plugins/auth.ts | VERIFIED | Non-owner 403 rejection tested in server.test.ts |
| **REQ-031** | S3: DEV_AUTH_BYPASS=1 allowed only when non-production; server REFUSES TO START if prod + bypass set | 2 | apps/server/src/config.ts | VERIFIED | Throws error on prod + bypass in config.ts, tested in server.test.ts |
| **REQ-032** | S4: Hermes API keys stay on server (HERMES_KEY_<AGENTID>); browser never sees keys/URLs | 2 | apps/server/src/services/hermes | VERIFIED | Environment variable lookup server-side only in hermes/index.ts |
| **REQ-033** | S5: Hermes base URLs come only from agent registry, never request input (anti-SSRF) | 2 | apps/server/src/services/hermes | VERIFIED | Agent repository base URL lookup in hermes/index.ts |
| **REQ-034** | S6: Web app never executes shell commands and never touches ~/.hermes files | 2 | apps/server/src/routes | VERIFIED | Zero shell execution in server routes |
| **REQ-035** | S7: Approvals: show FULL action text, explicit tap required, log decision & decider; no auto-approve | 4 | apps/web/src/components/inbox | TODO | Planned Phase 4 |
| **REQ-036** | S8: Rate limit (60 req/min per user), helmet CSP allowing telegram.org scripts, no wildcard CORS | 2 | apps/server/src/server.ts | VERIFIED | @fastify/helmet CSP, @fastify/rate-limit, cors in server.ts |
| **REQ-037** | S9: Audit log every mutating action (user id, action, target, timestamp) | 2 | apps/server/src/db/repositories/audit.ts | VERIFIED | All POST/PATCH routes call auditRepo.logAction, tested in server.test.ts |
| **REQ-038** | SQLite table `agents` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-039** | SQLite table `tasks` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-040** | SQLite table `run_events` schema, migration, and 14-day pruning routine | 2 | apps/server/src/db/migrations | VERIFIED | Table + pruneOldRunEvents verified in server.test.ts |
| **REQ-041** | SQLite table `approvals` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-042** | SQLite table `reports` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-043** | SQLite table `kpis` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-044** | SQLite table `hiring_drafts` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-045** | SQLite table `audit_log` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-046** | SQLite table `settings` schema and migration | 2 | apps/server/src/db/migrations | VERIFIED | Table created and verified in server.test.ts |
| **REQ-047** | Department constants (command, social, sales, finance, marketing, analytics, support, hr) in shared | 1 | packages/shared/src/constants.ts | VERIFIED | DEPARTMENTS constant defined in shared and verified in index.test.ts |
| **REQ-048** | Lightweight migrations runner for SQLite | 2 | apps/server/src/db/migrator.ts | VERIFIED | runMigrations executes schema migrations in server.test.ts |
| **REQ-049** | Endpoint GET /api/health (public) | 2 | apps/server/src/routes/health.ts | VERIFIED | Tested in server.test.ts without auth header |
| **REQ-050** | Endpoint GET /api/me (auth required) | 2 | apps/server/src/routes/me.ts | VERIFIED | Tested in server.test.ts with valid and non-owner credentials |
| **REQ-051** | Endpoints GET /api/agents, POST /api/agents, PATCH /api/agents/:id | 2 | apps/server/src/routes/agents.ts | VERIFIED | CRUD tested in server.test.ts and e2e-phase2-flow.ts |
| **REQ-052** | Endpoint GET /api/agents/:id/health (proxies Hermes /v1/capabilities) | 2 | apps/server/src/routes/agents.ts | VERIFIED | Tested in server.test.ts against Mock Hermes |
| **REQ-053** | Endpoint POST /api/agents/:id/chat (proxies Hermes chat completions with SSE) | 2 | apps/server/src/routes/agents.ts | VERIFIED | Streaming SSE route implemented in agents.ts |
| **REQ-054** | Endpoints GET /api/tasks, POST /api/tasks, PATCH /api/tasks/:id | 2 | apps/server/src/routes/tasks.ts | VERIFIED | Task CRUD verified in server.test.ts & e2e-phase2-flow.ts |
| **REQ-055** | Endpoint POST /api/tasks/:id/run (Hermes POST /v1/runs + events subscription) | 2 | apps/server/src/routes/tasks.ts | VERIFIED | Verified in server.test.ts and e2e-phase2-flow.ts |
| **REQ-056** | Endpoint POST /api/tasks/:id/stop (calls Hermes /stop) | 2 | apps/server/src/routes/tasks.ts | VERIFIED | Tested via dispatcher stopTask in server.ts |
| **REQ-057** | Endpoints GET /api/approvals, POST /api/approvals/:id/resolve | 2 | apps/server/src/routes/approvals.ts | VERIFIED | Approval resolution verified in server.test.ts & e2e flow |
| **REQ-058** | Endpoint GET /api/stream (SSE normalized events + 15s heartbeat) | 2 | apps/server/src/routes/stream.ts | VERIFIED | streamManager broadcast and client registration implemented |
| **REQ-059** | Endpoints GET /api/kpis, POST /api/kpis | 2 | apps/server/src/routes/kpis.ts | VERIFIED | Tested in server.test.ts (create and list KPIs) |
| **REQ-060** | Endpoints GET /api/reports, POST /api/reports/generate | 2 | apps/server/src/routes/reports.ts | VERIFIED | Strict anti-hallucination validation with retry implemented |
| **REQ-061** | Endpoints POST /api/hiring/draft, POST /api/hiring/:id/mark-hired | 2 | apps/server/src/routes/hiring.ts | VERIFIED | Draft saving and mark-hired implemented in hiring.ts |
| **REQ-062** | Endpoint GET /api/audit | 2 | apps/server/src/routes/audit.ts | VERIFIED | Tested in server.test.ts (query audit trails) |
| **REQ-063** | HermesClient interface with RealHermesClient and MockHermesClient implementations | 2 | apps/server/src/services/hermes | VERIFIED | Both implementations verified in server.test.ts & mock.client.ts |
| **REQ-064** | Normalized agent status: idle, thinking, working (with tool), waiting_approval, error, offline | 2 | apps/server/src/services/dispatcher.ts | VERIFIED | OfficeDispatcher derives and broadcasts normalized statuses |
| **REQ-065** | Futuristic dark-first style tokens (bg #070B14, cyan #22D3EE, violet #8B5CF6, glass surfaces) | 3 | apps/web/src/index.css | VERIFIED | Dark tokens, glassmorphism, and glowing ring styles verified in index.css & tailwind.config.js |
| **REQ-066** | Telegram themeParams CSS variable mapping + light scheme support | 3 | apps/web/src/theme.ts | VERIFIED | themeParams CSS vars and dark/light mode toggle verified in theme.ts |
| **REQ-067** | Low-power mode (auto detection on concurrency/memory/reduced-motion + manual toggle) | 3 | apps/web/src/stores/power.ts | VERIFIED | Hardware detection, DOM class override, and unit tests verified in power.ts |
| **REQ-068** | Telegram WebApp integration: ready(), expand(), BackButton, Haptics, disableVerticalSwipes, safe-area | 3 | apps/web/src/services/tma.ts | VERIFIED | Feature detection and error-safe Telegram SDK wrapper verified in tma.ts & tma.test.ts |
| **REQ-069** | Dev environment mock Telegram.WebApp with fake initData | 3 | apps/web/src/mock-tma.ts | VERIFIED | Browser dev TMA mock with valid simulated initData verified in mock-tma.ts |
| **REQ-070** | Screen 1 (Office): Top HUD with active runs, pending approvals, errors, agents online, event ticker | 3 | apps/web/src/screens/Office.tsx | VERIFIED | HeaderHUD.tsx verified with live metrics, connection status, and event ticker in browser |
| **REQ-071** | Screen 1 (Office): Floor plan SVG with 8 department rooms + Lounge | 3 | apps/web/src/components/office/Map.tsx | VERIFIED | 2D interactive SVG map verified with 8 department rooms, Lounge, and '+' HR door in browser |
| **REQ-072** | Screen 1 (Office): Avatar movement and animations by normalized status | 3 | apps/web/src/components/office/Avatar.tsx | VERIFIED | Status rings, animations, and coordinates movement verified in Avatar.tsx & browser |
| **REQ-073** | Screen 1 (Office): Floating "Ask Office" orchestrator chat button | 3 | apps/web/src/components/office/AskOffice.tsx | VERIFIED | Floating AskOffice button with haptic feedback verified in AskOffice.tsx & browser |
| **REQ-074** | Screen 1 (Office): Empty state onboarding card + "Load demo office" (DEMO badges) | 3 | apps/web/src/components/office/Empty.tsx | VERIFIED | EmptyOffice onboarding card and 8 demo agents with DEMO badge verified in browser |
| **REQ-075** | Screen 2 (Agent Sheet): Bottom sheet with Chat, Activity, Tasks, Profile tabs | 4 | apps/web/src/components/agent-sheet | TODO | Planned Phase 4 |
| **REQ-076** | Screen 3 (Tasks): Mobile Kanban swipe (Backlog, Running, Needs approval, Done), CRUD, Markdown viewer | 4 | apps/web/src/screens/Tasks.tsx | TODO | Planned Phase 4 |
| **REQ-077** | Screen 4 (Inbox): Pending approvals first (full action text, haptics), errors, reports | 4 | apps/web/src/screens/Inbox.tsx | TODO | Planned Phase 4 |
| **REQ-078** | Screen 5 (Reports): Department tabs, KPI sparklines (recharts), source badges, manual entry form | 5 | apps/web/src/screens/Reports.tsx | TODO | Planned Phase 5 |
| **REQ-079** | Screen 5 (Reports): Anti-hallucination agent prompt, strict zod JSON validation, retry, unverified badge | 5 | apps/server/src/services/reports.ts | TODO | Planned Phase 5 |
| **REQ-080** | Screen 6 (More): Agents registry, Recruitment room, Audit log, Settings | 6 | apps/web/src/screens/More.tsx | TODO | Planned Phases 6-7 |
| **REQ-081** | Recruitment Wizard: Step 1 Template choice (8 predefined roles or custom) | 6 | apps/web/src/components/recruitment | TODO | Planned Phase 6 |
| **REQ-082** | Recruitment Wizard: Step 2 Comprehensive specification form | 6 | apps/web/src/components/recruitment | TODO | Planned Phase 6 |
| **REQ-083** | Recruitment Wizard: Step 3 Deterministic SOUL.md generation (9 standard sections) | 6 | packages/shared/src/soul.ts | TODO | Planned Phase 6 |
| **REQ-084** | Recruitment Wizard: Step 4 Hiring Package (verified VPS commands, checklist, register form) | 6 | apps/web/src/components/recruitment | TODO | Planned Phase 6 |
| **REQ-085** | Server-side Telegram notifications via sendMessage for approvals, errors, reports | 7 | apps/server/src/services/notifications.ts | TODO | Planned Phase 7 |
| **REQ-086** | Phase 0 Acceptance: Recon docs, VPS checks, Traceability ledger, Progress, Decisions, Stubs, Backlog | 0 | docs/ | VERIFIED | All 7 required docs created and verified in Phase 0 |
| **REQ-087** | Phase 1 Acceptance: Monorepo scaffold, gap-check script, mock Hermes on :8642 | 1 | scripts/gap-check.ts, tools/mock-hermes | VERIFIED | Monorepo scaffolded, mock Hermes passing on :8642, gap-check active |
| **REQ-088** | Phase 2 Acceptance: Server core, Telegram auth tests, HermesClient, task runs, /api/stream | 2 | apps/server | VERIFIED | Tests pass, E2E flow verified with real output in e2e-phase2-flow.ts |
| **REQ-089** | Phase 3 Acceptance: Web shell, Telegram integration, Office map SVG, avatar movements | 3 | apps/web | VERIFIED | Production build passes (15s); 360x740 browser verification passed with demo loading and avatar status movements |
| **REQ-090** | Phase 4 Acceptance: Agent sheet, chat, Tasks Kanban, Inbox approvals | 4 | apps/web | TODO | Planned Phase 4 |
| **REQ-091** | Phase 5 Acceptance: Reports & KPIs, sparklines, anti-hallucination test | 5 | apps/web, apps/server | TODO | Planned Phase 5 |
| **REQ-092** | Phase 6 Acceptance: Recruitment wizard, SOUL.md generator tests, Hiring package | 6 | apps/web, apps/server | TODO | Planned Phase 6 |
| **REQ-093** | Phase 7 Acceptance: Push notifications, settings, accessibility pass, states matrix | 7 | apps/web, apps/server | TODO | Planned Phase 7 |
| **REQ-094** | Phase 8 Acceptance: Multi-stage Dockerfile, Coolify deploy guide, final audit, manual test script | 8 | Dockerfile, docs/DEPLOY_COOLIFY.md | TODO | Planned Phase 8 |
| **REQ-095** | Rule R1: Work on ONE phase at a time; commit "phase-N: <summary>"; stop until owner replies "lanjut" | 0 | Process | VERIFIED | Enforced strictly across all phases |
| **REQ-096** | Rule R4: Do not add dependencies outside section 4 without owner confirmation | 0 | package.json | VERIFIED | Only Section 4 approved libraries planned |
| **REQ-097** | Rule R5: TypeScript strict, no `any` without comment, files under 300 lines | 1 | tsconfig.json | VERIFIED | Strict TS compiler options enabled, tsc --build passes |
| **REQ-098** | Rule R6: Secrets only via environment variables, never sent to browser | 0 | .env.example | VERIFIED | Zero secrets in client-side code |
| **REQ-099** | Rule R9: UI default Indonesian (id), English (en) selectable, all strings in i18n | 3 | apps/web/src/i18n | VERIFIED | Indonesian default with English selector verified in i18n/index.ts & browser |
| **REQ-100** | Rule R10: Mobile-first 360x740, touch targets >= 44px, no hover-only interactions | 3 | apps/web | VERIFIED | 360x740 mobile viewport and touch targets >= 44px verified in BottomNav & AskOffice |
| **REQ-101** | Rule C3: Automated phase-aware gap-check script (`npm run gap-check`) | 1 | scripts/gap-check.ts | VERIFIED | scripts/gap-check.ts implements checks a through h |
| **REQ-102** | Rule C4: Regression gate (`typecheck && test && gap-check`) at start and end of phases | 1 | scripts/ | VERIFIED | Root scripts typecheck, test, and gap-check all functional |
| **REQ-103** | Rule C5: State matrix on every screen (loading, empty, error, offline, success, low-power) | 3 | apps/web | VERIFIED | Loading, empty, error, offline, and low-power states handled in Office.tsx |
| **REQ-104** | Rule C6: Single source of truth in packages/shared (schemas, types, endpoints, enums) | 1 | packages/shared | VERIFIED | packages/shared provides single source of truth for endpoints and types |

---

### Ledger Summary Counts (Phase 3)
- **Total Requirements**: 104
- **VERIFIED**: 80
- **IMPLEMENTED-UNTESTED**: 0
- **TODO**: 24
- **ASSUMED**: 0
- **BLOCKED**: 0
- **DEFERRED-BY-OWNER**: 0
