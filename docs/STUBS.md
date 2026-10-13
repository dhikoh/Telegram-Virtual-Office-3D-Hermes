# Catalog of Permitted Stubs & Mocks (C7)

> **Rule C7**: A stub, placeholder or fake-data path is allowed ONLY if it is listed here (what, why, owner approval, phase in which it is removed) AND visibly labeled in the UI ("Belum tersedia" or DEMO). Unlisted stubs are defects.

---

| ID | Component / Stub | Purpose & Justification | UI Label | Target Phase to Remove / Connect | Owner Approved |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **STUB-001** | `tools/mock-hermes` server | Simulates Hermes runs, SSE events, and approvals when developing locally without live VPS connection | None (Dev tool only) | Kept as dev harness; replaced in production via `HERMES_MODE=real` in Phase 8 | YES (Section 9 Spec) |
| **STUB-002** | Dev Mock Telegram WebApp (`window.Telegram.WebApp`) | Allows running and debugging the Mini App in a standard desktop browser during development | Dev banner: `[DEV TMA MOCK]` | Phase 3 (Active only when `import.meta.env.DEV` is true) | YES (Section 8 Spec) |
| **STUB-003** | "Load demo office" dataset | Prepopulates sample agents to showcase the office floor plan when the owner explicitly asks for a tour. Secondary CTA (primary is "Rekrut Agen Pertama"); every demo agent carries `isDemo` and is badged `DEMO` everywhere, including Reports filtering. | Badge: `DEMO` + ticker warning | Persistent as an explicitly-labelled tour feature | YES (Section 8 Spec) |
| **STUB-004** | Mock Run Event samples (`docs/samples/mock_run_events.jsonl`) | Provides scripted SSE event sequences for parser unit tests before live VPS sample capture | None (Test fixture) | Phase 1 (Replaced/supplemented with real VPS samples in Phase 8) | YES (Section 9 Spec) |
| **STUB-005** | "Simulate Status" panel (`screens/Office.tsx`) | Dev-only status driver for acceptance testing of avatar/HUD states without a live gateway | **Hidden in production** — rendered only when `import.meta.env.DEV` is true | Dev builds only; never shipped | YES (Tahap 7 audit, 2026-10-13) |
