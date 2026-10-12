# Architectural & Design Decisions (R8)

Rule: One line per non-obvious decision. Format: `[DEC-XXX] <Decision>: <Rationale>`.

---

- **[DEC-001]** Monorepo using native npm workspaces: Minimalist setup avoiding external monorepo tools while preserving strict TypeScript boundaries.
- **[DEC-002]** Hermes API authentication verified as HTTP Bearer token: Confirmed via official documentation (`GET /v1/capabilities` and profile `.env` configuration).
- **[DEC-003]** 104 granular traceability requirements cataloged: Spans all functional, architectural, security, state matrix, and acceptance requirements.
- **[DEC-004]** Single dispatcher architecture: Office server dispatches tasks and tracks runs; agents do not communicate peer-to-peer.
- **[DEC-005]** HermesClient dual-implementation abstraction: Modular switch between `MockHermesClient` and `RealHermesClient` controlled via `HERMES_MODE`.
- **[DEC-006]** Telegram authentication verification: Enforce 3600-second maximum auth age and timing-safe comparison (`timingSafeEqual`) to prevent replay and timing attacks.
- **[DEC-007]** Mock Hermes Server uses Node native `node:http`: Zero extraneous dependencies in dev tooling, preserving strict compliance with Section 4 allowed stack and Rule R4.
- **[DEC-008]** Phase-aware Gap Check executes natively with Node 22 `--experimental-strip-types`: Direct TypeScript execution for scripts without additional build lag or bundler drift.
- **[DEC-009]** SQLite migration path fallback mechanism: Migrator checks both `__dirname/migrations` and `src/db/migrations` to ensure transparent execution from both TypeScript source and compiled `dist/`.
- **[DEC-010]** Explicit 64-character hex regex validation for Telegram initData hash: Prevents Node.js `Buffer.from(hash, 'hex')` from silently ignoring invalid trailing characters.
- **[DEC-011]** Custom Zod preprocessor for environment boolean parsing: Ensures string `'0'` evaluates to `false` and `'1'` to `true`, preventing false security aborts on `DEV_AUTH_BYPASS`.
- **[DEC-012]** Dispatcher run event listener cleanup pattern: Stream subscription unbinds on terminal events (`run.completed`, `run.failed`, `run.cancelled`) to prevent memory leaks during long-running server uptime.
- **[DEC-013]** Web client SVG percentage overlay coordinate system: Avoids WebKit/iOS `<foreignObject>` rendering artifacts by using proportional percentage coordinates for Framer Motion avatars on top of the SVG floor plan.
- **[DEC-014]** Telegram WebApp official script with error-safe degrading wrapper: Direct `<script src="https://telegram.org/js/telegram-web-app.js">` without wrapper SDK, guarded by try/catch feature detection for all TMA capabilities.
- **[DEC-015]** Dev environment TMA mock injection: Automatically injects valid simulated Telegram WebApp object with test initData in development to enable browser testing outside Telegram.
- **[DEC-016]** Low-power mode three-tier detection: Combines hardware concurrency `<= 4`, device memory `<= 4`, and `prefers-reduced-motion` media queries with user manual toggle persistence in `localStorage`.
- **[DEC-017]** Fastify static asset bypass in authHook: Excludes non-`/api/` paths from Telegram HMAC auth so static frontend SPA bundles are served directly without breaking Rule S1.
- **[DEC-018]** Hash routing synchronization in TMA web shell: Uses `window.location.hash` (`#tasks`, `#inbox`, `#reports`, `#more`) synchronized with Zustand and `Telegram.WebApp.BackButton` to enable seamless deep linking and back-button navigation without a heavy router library.
- **[DEC-019]** Lightweight safe Markdown rendering: Custom zero-dependency regex-based Markdown renderer (`MarkdownView.tsx`) sanitizes HTML tags and renders bold, headings, lists, code, and blockquotes without pulling external dependencies outside Section 4.
- **[DEC-020]** Anti-hallucination prompt and Zod schema validation: Backend generates strict prompt citing only verified database KPI numbers, enforces JSON schema (`summary_md`, `insights[]`, `risks[]`, `actions[]`), validates with Zod, retries once on schema error, and returns 422 if unvalidated per Rule REQ-079.
- **[DEC-021]** Agent-sourced KPI explicit unverified labeling: Any KPI entry originating with `source: 'agent'` is explicitly tagged as `agent (unverified)` in system prompts and displays an amber warning badge in the UI per Rule REQ-078 & REQ-079.
- **[DEC-022]** Mock Hermes run auto-progression for polling callers: Added background run progression to `MockHermesServer` so polling endpoints like `/api/reports/generate` complete and return valid output without requiring an open SSE connection.
- **[DEC-023]** Deterministic SOUL.md generator with 9 standard sections: Implemented in `packages/shared/src/soul.ts` ensuring exact adherence to official Hermes profile structure (Identity, Mission, Responsibilities, Tone & Style, Operating Rules, Boundaries, Approval Policy, Output Format, Reporting Cadence).
- **[DEC-024]** Client-side VPS Hiring Package with verified commands: Generates copyable CLI commands for the owner's terminal without automatic shell execution (complying with Rule R11 & S6), and marks unverified commands as `// TODO(verify)`.
- **[DEC-025]** Telegram Notification Service via sendMessage: Uses direct HTTP POST to Telegram Bot API `/sendMessage` with Markdown formatting and inline `web_app` button to open the virtual office; strictly avoids `getUpdates` or `setWebhook` per Rule REQ-011.
- **[DEC-026]** Code modularization under 300 lines for Rule R5: Decomposed large components across `apps/web` and `apps/server` (Reports, Tasks, AgentSheet, Soul, Office store, server tests) into focused sub-modules to ensure 100% compliance with strict Rule R5 (< 300 lines per file).
- **[DEC-027]** Node 22 Slim Multi-Stage Containerization: Used `node:22-slim` for the runner stage to provide pre-compiled glibc binaries for `better-sqlite3`, native `--experimental-strip-types` TypeScript execution without transpilation lag, non-root user `appuser`, and persistent volume on `/data`.
- **[DEC-028]** Host Gateway Hermes Network Bridge: Configured `host.docker.internal:host-gateway` in container to reach the host Hermes API on port 8642 securely without exposing port 8642 to the public internet.
- **[DEC-029]** Single source of truth for office layouts in packages/shared: Room coordinates, lounge slots, and pure function `getAgentPlacement(agent, status, slot)` serve both 2D SVG Map and 3D Scene, eliminating duplicate layout configuration (Rule 9.1).
- **[DEC-030]** Lazy dynamic loading of 3D bundle: Loaded via `React.lazy(() => import(...))` on toggle to prevent inflating initial SPA chunk, yielding a 222.21 KB gzip 3D chunk well within the 700 KB budget (Rule 9.2 & REQ-118).
- **[DEC-031]** Strict named imports for Three.js without wildcard imports: Enforces named imports (`import { Vector3, PerspectiveCamera } from 'three'`) preventing tree-shaking failures per Rule 4B.
- **[DEC-032]** 100% procedural 3D primitives and zero remote assets: All room furniture, neon materials, and low-poly characters built from primitives with zero remote CDN textures, complying with CSP (Rule 9.4).
- **[DEC-033]** Demand-driven rendering and hardware quality tiers: `frameloop="demand"`, DPR capped [1, 1.5], antialias disabled on low-power devices, and pause on hidden tab or open sheet (Rule REQ-114 & REQ-116).
- **[DEC-034]** WebGL context loss automatic recovery: Listens to `webglcontextlost` and falls back immediately to 2D view with dismissible notification to prevent black-screen hangs (Rule REQ-117).
- **[DEC-035]** Separation of public agent representation and server-only Hermes endpoints: Defined `AgentPublicSchema` (with `endpoint_configured: boolean`) for all API responses and client store data, stripping internal `hermes_base_url` and `api_key_env` to strictly enforce Rule S4 (browser never sees Hermes URLs or server secret variable names). Client bundle verified with zero hits for internal IPs or key names.
- **[DEC-036]** Strongly typed Fastify instance decoration: Created `apps/server/src/types/fastify.d.ts` module augmentation for `fastify.db` and `fastify.dispatcher`, eliminating all `(fastify as any)` casts and removing all `eslint-disable` comments across route handlers (Rule R5 & F-09).
- **[DEC-037]** Modular gap-check architecture (C3a..C3h) with passing and failing fixtures: Decomposed gap-check into 8 separate modules under `scripts/gap-check/` with automated passing and failing test fixtures in `scripts/gap-check/__tests__/gap-check.test.ts` to strictly satisfy Rule FR3 and verify that missing endpoints, tables, env vars, or i18n keys fail non-zero.
- **[DEC-038]** Hermes Gateway resilience and SSE drop recovery: Implemented configurable `HERMES_TIMEOUT_MS` (504 response on slow Hermes) and automatic exponential backoff retry (max 5) on dropped SSE streams, falling back to `GET /v1/runs/{id}` to ensure agents never get stuck in 'working' or 'thinking' states.


