# Catalog of Permitted Stubs & Mocks (C7)

> **Rule C7**: A stub, placeholder or fake-data path is allowed ONLY if it is listed here (what, why, owner approval, phase in which it is removed) AND visibly labeled in the UI ("Belum tersedia" or DEMO). Unlisted stubs are defects.

---

| ID | Component / Stub | Purpose & Justification | UI Label | Target Phase to Remove / Connect | Owner Approved |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **STUB-001** | `tools/mock-hermes` server | Simulates Hermes runs, SSE events, and approvals when developing locally without live VPS connection | None (Dev tool only) | Kept as dev harness; production uses `HERMES_MODE=real` (VPS verified, Tahap 7) | YES (Section 9 Spec) |
| **STUB-002** | Dev Mock Telegram WebApp (`window.Telegram.WebApp`) | Allows running and debugging the Mini App in a standard desktop browser during development | Dev banner: `[DEV TMA MOCK]` | Phase 3 (Active only when `import.meta.env.DEV` is true) | YES (Section 8 Spec) |
| **STUB-003** | "Load demo office" dataset | Prepopulates sample agents to showcase the office floor plan when the owner explicitly asks for a tour. Secondary CTA (primary is "Rekrut Agen Pertama"); every demo agent carries `isDemo` and is badged `DEMO` everywhere, including Reports filtering. | Badge: `DEMO` + ticker warning | Persistent as an explicitly-labelled tour feature | YES (Section 8 Spec) |
| **STUB-004** | Mock Run Event samples (`docs/samples/mock_run_events.jsonl`) | Provides scripted SSE event sequences for parser unit tests | None (Test fixture) | Kept as parser fixture; **real VPS samples captured** in `docs/samples/live_vps_stream_frames.jsonl` and locked by `live_sample.test.ts` (Tahap 8, 2026-10-13) | YES (Section 9 Spec) |
| **STUB-005** | "Simulate Status" panel (`screens/Office.tsx`) | Dev-only status driver for acceptance testing of avatar/HUD states without a live gateway | **Hidden in production** — rendered only when `import.meta.env.DEV` is true | Dev builds only; never shipped | YES (Tahap 7 audit, 2026-10-13) |
| **STUB-006** | Session-chat fallback (`real.client.chatStream` + `MockHermesClient` session/skill methods) | Keeps chat usable when the gateway session API is unavailable (mock mode or older gateway): chat degrades to stateless `/v1/chat/completions`, history then honestly reports "Belum ada percakapan" (no invented messages) | `MOCK MODE` banner in mock mode; empty-history label in fallback | Kept as resilience path; remove the mock-mode side with STUB-001 | YES (Tahap 8, 2026-10-13) |
