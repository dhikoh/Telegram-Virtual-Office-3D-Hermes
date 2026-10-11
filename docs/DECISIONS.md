# Architectural & Design Decisions (R8)

Rule: One line per non-obvious decision. Format: `[DEC-XXX] <Decision>: <Rationale>`.

---

- **[DEC-001]** Monorepo using native npm workspaces: Minimalist setup avoiding external monorepo tools while preserving strict TypeScript boundaries.
- **[DEC-002]** Hermes API authentication verified as HTTP Bearer token: Confirmed via official documentation (`GET /v1/capabilities` and profile `.env` configuration).
- **[DEC-003]** 104 granular traceability requirements cataloged: Spans all functional, architectural, security, state matrix, and acceptance requirements.
- **[DEC-004]** Single dispatcher architecture: Office server dispatches tasks and tracks runs; agents do not communicate peer-to-peer.
- **[DEC-005]** HermesClient dual-implementation abstraction: Modular switch between `MockHermesClient` and `RealHermesClient` controlled via `HERMES_MODE`.
- **[DEC-006]** Telegram authentication verification: Enforce 3600-second maximum auth age and timing-safe comparison (`timingSafeEqual`) to prevent replay and timing attacks.
