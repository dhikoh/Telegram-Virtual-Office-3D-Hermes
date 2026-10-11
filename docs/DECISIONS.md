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
