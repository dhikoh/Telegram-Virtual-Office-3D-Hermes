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
