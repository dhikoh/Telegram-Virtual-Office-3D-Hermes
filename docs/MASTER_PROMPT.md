# MASTER PROMPT — "HERMES VIRTUAL OFFICE" (Telegram Mini App)

## 0. ROLE AND WORKING RULES (re-read this section at the start of EVERY phase and every new session)

You are a senior full-stack engineer. Build a Telegram Mini App called "Hermes Virtual Office" in PHASES. The owner is a non-developer, so be explicit and verify everything.

HARD RULES
R1. Work on ONE phase at a time. A phase ends only with the exit report (C11) and the definition of done (C12). Then commit to git ("phase-N: <summary>") and STOP. Never start the next phase until the owner replies "lanjut".
R2. Never invent APIs. Hermes facts are in section 3. Anything not listed there is UNKNOWN: verify it from the docs or a real response, or ask the owner. Mark unverified code with // TODO(verify).
R3. Evidence before code: for Hermes events, save real (or mock) samples in docs/samples/ first, then write parsers from those samples.
R4. Do not add dependencies outside section 4 without asking.
R5. TypeScript strict. No `any` without a comment. Keep files under 300 lines; split otherwise.
R6. Secrets only via environment variables. Never hardcode, log, or send secrets to the browser.
R7. If a command fails: show the error, fix the root cause, re-run. Never claim success without passing acceptance. Never fake test output.
R8. Maintain docs/DECISIONS.md (one line per non-obvious decision).
R9. UI default language Indonesian (id), English (en) selectable. All strings live in i18n files.
R10. Mobile-first: design for 360x740, touch targets >= 44px, no hover-only interactions.
R11. Do not run commands on the owner's VPS. Write instructions in docs/ for the owner instead, unless the owner explicitly gives you SSH access.

## 0B. COMPLETENESS AND GAP-CHECK PROTOCOL (mandatory; overrides any "good enough" instinct)

Goal: nothing in this spec may be forgotten, silently skipped, or half-built.

C1. REQUIREMENT LEDGER. In Phase 0 create docs/TRACEABILITY.md: one row per requirement extracted from sections 1, 5, 6, 7, 8 and 9 (every rule S1-S9, every table, every endpoint, every screen/tab, every feature bullet, every phase acceptance item). Columns: ID (REQ-001...), Requirement (copied wording), Phase, Files/Tests, Status, Evidence.
 - Allowed status values ONLY: TODO | IMPLEMENTED-UNTESTED | VERIFIED | ASSUMED | BLOCKED | DEFERRED-BY-OWNER.
 - A row may never be deleted or reworded to make it easier. Changing or dropping one requires a DECISIONS.md entry AND explicit owner approval.
 - VERIFIED requires evidence: a test name, a command with real output, or a described manual check. No evidence = not VERIFIED.
 - At the end of every phase, update the ledger and print counts per status.

C2. EVIDENCE LABELS. In every report use exactly: VERIFIED (ran and passed), IMPLEMENTED-UNTESTED, ASSUMED (no source), BLOCKED (needs owner/VPS). Never write "done", "complete" or "working" without one of these labels.

C3. AUTOMATED GAP CHECKS. In Phase 1 create `npm run gap-check` (scripts/gap-check.ts) and extend it every phase. It is PHASE-AWARE: it reads the current phase from docs/PROGRESS.md; items tagged with a later phase are reported as "pending", not as failures; at Phase 8 everything is enforced. It must exit non-zero when:
 a. any endpoint of the current or an earlier phase (listed in packages/shared/src/endpoints.ts, each tagged with its phase) is missing in the server route table;
 b. any table from section 6 due by now lacks a migration;
 c. any i18n key used in code is missing in id or en (warn on unused keys);
 d. any env var read in code is missing in .env.example or docs/DEPLOY_COOLIFY.md (the latter from Phase 8);
 e. grep in apps/*/src and packages/*/src finds: TODO without "(verify)", FIXME, "not implemented", "lorem", console.log, hard-coded tokens/URLs/ports (host.docker.internal, 8642, bot tokens) outside the config module, `any` without a comment (tools/mock-hermes and docs are excluded from the hard-coded port/URL rule);
 f. mock code is reachable when NODE_ENV=production (HERMES_MODE=mock must throw in production);
 g. any ledger row belonging to the current or an earlier phase is still TODO;
 h. any screen from section 8 due by now has no component or lacks one of its states (see C5).
Print the real output. A phase cannot end while gap-check fails.

C4. REGRESSION GATE. From Phase 2 onward, at the START of every phase and every new session, run: `npm run typecheck && npm test && npm run gap-check`. If anything fails, fix it before any new work. Run it again before the phase-end STOP. (In Phase 1, run it at the end only, because the scripts do not exist yet.)

C5. STATE MATRIX. Every screen must implement and test: loading, empty, error (with retry), offline (network or Telegram session lost, SSE auto-reconnect), success, and low-power variant. Every API route must handle: invalid input (400, zod), unauthorized (401), forbidden (403), not found (404), Hermes down or timeout (502/504 with a clear message), and have at least one happy-path test and one failure test.

C6. SINGLE SOURCE OF TRUTH. Types, zod schemas, endpoint list, status enums and departments live ONLY in packages/shared. Web and server import from there; a duplicated type is a defect. Add contract tests: every server response in tests is parsed with the shared schema.

C7. NO SILENT STUBS. A stub, placeholder or fake-data path is allowed only if it is listed in docs/STUBS.md (what, why, owner approval, phase in which it is removed) AND visibly labeled in the UI ("Belum tersedia" or DEMO). Unlisted stubs are defects.

C8. SCOPE DISCIPLINE (gaps AND extras). Do exactly what the spec says. Good ideas outside the spec go to docs/BACKLOG.md, not into code. If something is ambiguous, list the questions (max 5) in the exit report and STOP. Never guess on anything involving security, data, or money. For trivial UI details: decide, log in DECISIONS.md, continue.

C9. TWO-PASS SELF-REVIEW before the exit report.
 Pass 1 (line by line): re-open this master prompt, read the current phase and every ledger row for it, and for each row open the actual file or test that satisfies it. Quote the path. If you cannot point to it, the row is TODO.
 Pass 2 (adversarial): try to break your own work and record the result of each case: Hermes down; Hermes slow (30 s); expired initData; non-owner Telegram ID; SSE dropped mid-run; double tap on Approve; empty database; 20 agents at once; 1000-character task title; 320 px wide viewport; Indonesian and English; low-power mode on.

C10. PROGRESS FILE (memory across sessions). Maintain docs/PROGRESS.md: current phase, what is done, next steps, open questions, known issues, exact commands to run the project. Update it at the end of every phase. At the start of EVERY session, or whenever you feel you lost context, re-read docs/MASTER_PROMPT.md, docs/PROGRESS.md, docs/TRACEABILITY.md and docs/DECISIONS.md before doing anything.

C11. PHASE EXIT REPORT (fixed format; the last message of every phase):
 1. Ringkasan untuk owner (Bahasa Indonesia, max 5 plain lines, no jargon)
 2. Requirements closed this phase (REQ ids + label)
 3. Requirements NOT closed (REQ ids + reason)
 4. Deviations from the spec (or "none")
 5. Assumptions / TODO(verify) list
 6. typecheck, test and gap-check output (real, pasted)
 7. Pass 2 adversarial results
 8. Risks, and what the owner must do manually
 9. Ledger counts per status
 10. Write "PHASE N DONE - waiting for 'lanjut'" ONLY if item 3 is empty (or only BLOCKED/DEFERRED with owner OK) and gap-check is green. Otherwise write "PHASE N INCOMPLETE" and keep working.

C12. DEFINITION OF DONE per phase = ALL of: acceptance commands pass with real output; ledger rows for the phase are VERIFIED (or BLOCKED/DEFERRED with owner OK); gap-check green; docs updated (PROGRESS, DECISIONS, STUBS, .env.example); git commit made.

## 1. PRODUCT GOAL

A phone-first "virtual office" opened inside Telegram. The owner (CEO) sees AI agents as characters in a futuristic 2D office, can assign tasks, approve risky actions, read reports, and "recruit" new agents by profile/soul. The office covers: social media, sales, finance, marketing, analytics, support, and a command center. Heavy rendering happens on the phone; the server is lightweight.

PRIORITY ORDER (when time is short): (1) approvals + tasks + chat, (2) live agent status, (3) reports/KPIs, (4) recruitment room, (5) visual polish.

## 2. ARCHITECTURE

Phone (Telegram WebView) --HTTPS--> Coolify domain (reverse proxy) --> ONE container "office" (Fastify: serves the web build + /api/*) --> Hermes API on the VPS host (reached via host.docker.internal).

- Hermes runs on the VPS host, NOT in Coolify. The office container only calls it over HTTP.
- SQLite file on a persistent volume (/data). No other database.
- The office server is the DISPATCHER: it assigns tasks to agents. Do not assume Hermes agents talk to each other.
- Do NOT call Telegram getUpdates or setWebhook anywhere: the Hermes gateway already uses this bot token, and doing so would break it. Only sendMessage (notifications) is allowed.

Monorepo (npm workspaces):
  apps/web (Vite + React), apps/server (Fastify), packages/shared (zod schemas + types + constants), tools/mock-hermes (fake Hermes for development), docs/

## 3. HERMES FACTS

VERIFIED (official docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server , /docs/developer-guide/programmatic-integration , /docs/user-guide/profiles):
- API server starts with `hermes gateway`; default listens on http://127.0.0.1:8642 (loopback only).
- OpenAI-compatible: POST /v1/chat/completions (stream:true -> SSE; also emits custom event "hermes.tool.progress"), POST /v1/responses, GET /v1/models (model name "hermes-agent"), GET /v1/capabilities.
- Runs API: POST /v1/runs (returns 202 + run_id), GET /v1/runs/{id}, GET /v1/runs/{id}/events (SSE: tool-call progress, token deltas, lifecycle events), POST /v1/runs/{id}/approval, POST /v1/runs/{id}/stop.
- Jobs CRUD under /api/jobs (scheduled/background runs).
- Optional headers: X-Hermes-Session-Id, X-Hermes-Session-Key.
- Profiles = isolated agents: `hermes profile create <name> [--description "..."]`, each with own config.yaml, .env, SOUL.md, memory, sessions, skills, cron, gateway state, in ~/.hermes/profiles/<name>/. Profiles do NOT sandbox the agent. SOUL.md changes apply to NEW sessions.

UNKNOWN (must verify, do not guess): auth header for the API server (probably Bearer key), exact JSON body of POST /v1/runs and /approval, exact event names and payload shapes in /events, how to run each profile's API server on its own port/host, whether token usage/cost appears in events.

## 4. TECH STACK (fixed)

Web: Vite, React 18, TypeScript, Tailwind CSS 3, Zustand, @tanstack/react-query, framer-motion, lucide-react, recharts, @microsoft/fetch-event-source, i18next + react-i18next. Telegram: official script https://telegram.org/js/telegram-web-app.js (window.Telegram.WebApp), no wrapper SDK. Fonts: system stack only (no external fonts).
Server: Node 20, Fastify 4, zod, better-sqlite3, @telegram-apps/init-data-node (if unavailable: manual HMAC, see S2), pino, @fastify/static, @fastify/helmet, @fastify/rate-limit.
Tests: vitest.

## 5. SECURITY (non-negotiable)

S1. Every /api/* route except /api/health requires header `Authorization: tma <Telegram.WebApp.initData>`.
S2. Server validation: (a) verify hash with TELEGRAM_BOT_TOKEN (library, or manual: secret = HMAC_SHA256(key="WebAppData", msg=bot_token); data_check_string = all fields except `hash`, sorted by key, "key=value" joined by "\n"; compare HMAC_SHA256(secret, data_check_string) hex with `hash` using timingSafeEqual); (b) auth_date not older than 3600 s; (c) user.id must be in OWNER_TELEGRAM_IDS (comma-separated env), else 403.
S3. DEV_AUTH_BYPASS=1 is allowed only when NODE_ENV != production. The server must REFUSE TO START if NODE_ENV=production and the bypass is set.
S4. The Hermes API key stays on the server (env var per agent, e.g. HERMES_KEY_<AGENTID>). The browser never sees Hermes URLs or keys.
S5. Hermes base URLs come only from the agent registry (owner-set), never from request input (SSRF).
S6. The web app NEVER executes shell commands and never touches ~/.hermes files.
S7. Approvals: show the FULL action text, require an explicit tap, log who decided and when. No auto-approve.
S8. Rate limit (e.g. 60 req/min per user), helmet with CSP that allows https://telegram.org scripts, no wildcard CORS.
S9. Audit log every mutating action (user id, action, target, timestamp).

## 6. DATA MODEL (SQLite; create a simple migrations runner)

agents(id, name, role, department, avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at, created_at)
tasks(id, title, description, agent_id, priority[low|normal|high|urgent], status[backlog|queued|running|needs_approval|done|failed|cancelled], run_id, result_md, due_at, created_by, created_at, updated_at)
run_events(id, run_id, agent_id, type, payload_json, ts)   -- prune older than 14 days
approvals(id, run_id, agent_id, summary, payload_json, status[pending|approved|denied|expired], decided_by, decided_at, created_at)
reports(id, agent_id, department, template, period, body_md, metrics_json, created_at)
kpis(id, department, key, label, value, unit, period, source[manual|import|agent], source_note, created_at)
hiring_drafts(id, form_json, soul_md, commands_md, status[draft|hired|discarded], created_at)
audit_log(id, telegram_user_id, action, target, detail_json, ts)
settings(key, value)

Departments (constants in packages/shared): command, social, sales, finance, marketing, analytics, support, hr.

## 7. OFFICE SERVER API (all JSON, validated with zod from packages/shared)

GET  /api/health                      (public)
GET  /api/me
GET  /api/agents        POST /api/agents        PATCH /api/agents/:id
GET  /api/agents/:id/health           (calls Hermes /v1/capabilities)
POST /api/agents/:id/chat             (streams SSE, proxies Hermes)
GET/POST /api/tasks     PATCH /api/tasks/:id
POST /api/tasks/:id/run               (-> Hermes POST /v1/runs, store run_id, subscribe to its /events)
POST /api/tasks/:id/stop
GET  /api/approvals     POST /api/approvals/:id/resolve   {decision: approve|deny}
GET  /api/stream                      (SSE: normalized office events + heartbeat every 15 s)
GET/POST /api/kpis      GET /api/reports      POST /api/reports/generate {agent_id, template, period}
POST /api/hiring/draft  POST /api/hiring/:id/mark-hired
GET  /api/audit

Hermes access goes through ONE interface `HermesClient` { capabilities, startRun, streamEvents, resolveApproval, stopRun, chatStream } with two implementations: RealHermesClient and MockHermesClient, chosen by HERMES_MODE=mock|real.

Normalized agent status: idle | thinking | working (with tool name) | waiting_approval | error | offline. Derive it from run events (mapper written from samples, rule R3) plus periodic health checks (every 30 s).

## 8. UI / FEATURE SPEC

VISUAL STYLE: futuristic, dark-first. Tokens: bg #070B14; glass surfaces rgba(255,255,255,0.04) + backdrop-blur; accent cyan #22D3EE; violet #8B5CF6; success #34D399; warn #FBBF24; danger #F43F5E; mono font for numbers (ui-monospace). Subtle neon grid floor, glowing status rings. Apply Telegram themeParams via CSS variables; support light scheme.
LOW-POWER MODE: auto-on when hardwareConcurrency <= 4, deviceMemory <= 4, or prefers-reduced-motion; replaces continuous animations with static indicators. User can toggle it in Settings.

TELEGRAM INTEGRATION (always feature-detect and wrap in try/catch): Telegram.WebApp.ready() and expand() at startup; BackButton on nested screens; HapticFeedback on approvals/errors; disableVerticalSwipes() if available; requestFullscreen() only if isVersionAtLeast('8.0') and the user enabled it in Settings; honor safe-area insets (env(safe-area-inset-*) plus Telegram's content safe area). In dev (import.meta.env.DEV), inject a mock Telegram.WebApp with fake initData so the app runs in a normal browser.

SCREENS (bottom nav, 5 tabs: Office, Tasks, Inbox, Reports, More)
1. OFFICE (home): top HUD with active runs, pending approvals, errors, agents online. Below, a floor plan (SVG + framer-motion) of rooms: Command Center, Social Studio, Sales Floor, Finance Vault, Marketing Lab, Analytics Hub, Support Desk, HR/Recruitment Room (door with "+"), Lounge. Each agent is an avatar chip with a status ring. Movement by status: idle -> Lounge (slow breathing glow); thinking -> own desk (pulsing ring, "..." bubble); working -> own desk (spinning ring + tool-name chip); waiting_approval -> Approval Gate near Command Center (amber blink + haptic); error -> red glitch shake; offline -> greyed with "zzz". Tapping an avatar opens the Agent Sheet. Floating "Ask Office" button opens chat with the default orchestrator agent. Live event ticker at the bottom of the HUD. Empty state: onboarding card + "Load demo office" (all demo items carry a visible DEMO badge).
2. AGENT SHEET (bottom sheet, 4 tabs): Chat (streaming) | Activity (live tool progress + history) | Tasks | Profile (role, department, soul summary, health, stop/pause actions).
3. TASKS: Kanban columns (Backlog, Running, Needs approval, Done) as horizontal swipe on mobile; create/edit task, assign agent, priority, due date, "Run now"; result viewer renders Markdown.
4. INBOX: pending approvals first (full action text, big Approve/Deny buttons, haptic feedback), then errors, then finished-report notifications.
5. REPORTS: tabs per department. KPI cards with sparklines (recharts), source badge (manual/import/agent) and "as of" timestamp. Manual KPI entry form. "Generate report" button using templates: daily_sales, weekly_social, monthly_finance, campaign_roi.
   ANTI-HALLUCINATION RULE: the server builds the prompt from KPI rows in the database and instructs the agent to analyze ONLY the provided data, never invent numbers, and answer with JSON {summary_md, insights[], risks[], actions[]}. Validate with zod; retry once on failure; otherwise mark the report failed. Agent-sourced numbers are always labeled "unverified".
6. MORE: Agents registry (add/edit, health), RECRUITMENT ROOM, Audit log, Settings (language, low-power, haptics, fullscreen, notifications).

RECRUITMENT ROOM (wizard, 4 steps):
 Step 1 choose a template or "custom": Social Media Manager, Content Writer, Sales Analyst, Finance Controller, Marketing Strategist, Data Analyst, Customer Support Agent, Executive Assistant (each with 4 default responsibilities).
 Step 2 form: name, department, mission, tone/personality, responsibilities, allowed tools/skills, boundaries (what it must NEVER do), actions that REQUIRE owner approval (spending money, public posting, deleting data, messaging customers), reporting cadence.
 Step 3 preview: generate SOUL.md deterministically from a template with sections: Identity, Mission, Responsibilities, Tone & Style, Operating Rules, Boundaries, Approval Policy, Output Format, Reporting Cadence.
 Step 4 "Hiring Package": SOUL.md + the exact commands for the owner to run on the VPS (hermes profile create <slug> --description "...", where to place SOUL.md, how to set the API port/key and start its gateway - only what Phase 0 verified) + a checklist + a "Register agent" form (base URL, key env var name). "Mark as hired" adds the agent to the registry. No automatic shell execution in v1.

NOTIFICATIONS: the server sends Telegram messages (sendMessage with an inline web_app button that opens the Mini App) to the owner on: approval pending, run failed, report ready.

## 9. PHASES AND ACCEPTANCE

EVERY phase additionally requires: C9 self-review, C11 exit report, C12 definition of done. Acceptance below is the minimum, not the whole job.

PHASE 0 - Recon and ledger.
 - Read the three docs URLs in section 3 (if you have web access) and write docs/HERMES_FACTS.md (confirmed facts only, each with a source URL).
 - Write docs/VPS_CHECKS.md: copy-paste commands for the OWNER to run on the VPS and paste back (hermes --version; hermes profile list; ss -ltnp | grep 8642; a curl to /v1/capabilities using the verified auth header; one curl -N run against /v1/runs and /events to capture real samples; docker network ls; ufw status; free -h; df -h).
 - Create docs/TRACEABILITY.md (full ledger, C1), docs/PROGRESS.md, docs/STUBS.md, docs/BACKLOG.md, docs/DECISIONS.md.
 - Acceptance: all files exist; the ledger row count is printed; every item of sections 5, 6, 7 and 8 has at least one row.
 - STOP. The owner may say "lanjut" without pasting VPS results; then continue with the mock and keep all unverified items marked TODO(verify).

PHASE 1 - Scaffold + mock Hermes + gap-check.
 - Set up the monorepo, strict TS, eslint, vitest, root scripts (dev, build, typecheck, test, gap-check).
 - Create packages/shared/src/endpoints.ts (endpoint list with phase tags) and implement `npm run gap-check` per C3.
 - Build tools/mock-hermes on :8642 simulating /v1/capabilities, /v1/runs, /v1/runs/:id/events (SSE with scripted tool progress, occasional approval request, occasional error), /approval, /stop, and /v1/chat/completions streaming. State clearly in docs/ that mock event shapes are ASSUMPTIONS to be replaced by real samples.
 - Acceptance: `npm run typecheck`, `npm test`, `npm run gap-check` run; curl against the mock returns expected data.

PHASE 2 - Server core.
 - Config/env validation (zod), SQLite + migrations, Telegram auth (section 5) with tests (valid, tampered hash, expired, non-owner), agent registry, HermesClient (Real + Mock), task run lifecycle, event normalizer and status derivation, /api/stream, approvals, audit, rate limit.
 - Acceptance: tests pass; with the mock running, a scripted curl flow create-agent -> create-task -> run -> receive SSE events -> approval resolved works end to end. Show the output.

PHASE 3 - Web shell + Office Map.
 - Vite/React/Tailwind, i18n, Telegram integration (section 8), design system (glass cards, status ring, avatar chip, bottom sheet, bottom nav), the Office screen with live data from /api/stream, low-power mode.
 - Acceptance: build passes; in a 360x740 browser viewport with the mock, avatars move between zones when the mock changes agent status; describe or screenshot what was verified.

PHASE 4 - Agent Sheet, chat, Tasks, Inbox.
 - Acceptance: create a task, run it, see live activity, approve a mock approval from Inbox, see the result Markdown. Tests for the main stores/hooks.

PHASE 5 - Reports and KPIs.
 - Manual KPI entry, charts, report templates with the anti-hallucination flow, source badges.
 - Acceptance: a unit test proves invalid agent JSON is rejected/retried and agent numbers are labeled unverified.

PHASE 6 - Recruitment Room.
 - Acceptance: tests that the generated SOUL.md contains every section and every boundary/approval rule entered in the form; the Hiring Package contains no command that was not verified in Phase 0 (otherwise it is marked TODO(verify) in the output).

PHASE 7 - Notifications, Settings, polish.
 - Telegram notifications, settings screen, accessibility pass, empty/error/loading states everywhere, performance check (no continuous animation in low-power mode).
 - Acceptance: checklist in docs/QA.md ticked with evidence.

PHASE 8 - Deploy and final audit.
 - Multi-stage Dockerfile (build web, run server, non-root user, HEALTHCHECK on /api/health), docker-compose example with extra_hosts "host.docker.internal:host-gateway" and a /data volume, .env.example (NODE_ENV, PORT=3000, TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_IDS, HERMES_MODE, HERMES_KEY_<AGENTID>).
 - docs/DEPLOY_COOLIFY.md for the owner: create the app in Coolify, set domain with HTTPS, env vars, persistent volume; make Hermes reachable from the container (Hermes listens on loopback by default - give the safe options, e.g. bind to the Docker bridge gateway IP and firewall it so it is NOT public; never expose the Hermes API to the internet); BotFather steps (set the Menu Button URL or create a Main Mini App with the HTTPS domain).
 - Go-live checklist and the switch from mock to real (HERMES_MODE=real), including replacing assumed event shapes with the real samples from Phase 0.
 - FINAL AUDIT: docs/FINAL_AUDIT.md with every ledger row and its final status; zero TODO and zero ASSUMED unless the owner approved them. Also a manual phone-test script in Indonesian for the owner (open the app, check agent status, assign a task, approve an action, read a report, draft a new agent, stop Hermes and observe the offline state, let the session expire).
 - Acceptance: docker build succeeds locally; the container starts and /api/health returns ok; docs complete; gap-check fully enforced and green.

## 10. DEFINITION OF DONE (v1)
Owner opens the bot's Mini App on a phone, sees the agents live, assigns a task, approves an action, reads a report built from real KPI data, and drafts a new agent's SOUL.md - with auth enforced and no secret reaching the browser.
