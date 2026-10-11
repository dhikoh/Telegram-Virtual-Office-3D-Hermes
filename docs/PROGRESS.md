# Project Progress & Session State (C10)

## 1. Current Phase: Phase 0 (Recon and Ledger)

- **Status**: Completed Phase 0 recon and initial documentation.
- **Next Phase**: Phase 1 (Scaffold + Mock Hermes + Automated Gap-Check).

---

## 2. What Is Done (Phase 0)

1. Initialized Git repository for the project.
2. Verified official Hermes Agent documentation for API server, programmatic integration, and multi-profile setups.
3. Created `docs/HERMES_FACTS.md` with verified facts, endpoints, configuration specs, and documentation links.
4. Created `docs/VPS_CHECKS.md` with copy-paste commands for the owner to inspect and capture live VPS telemetry and sample event streams.
5. Created `docs/TRACEABILITY.md` containing the full 104-requirement ledger mapped to sections 1–9 and rules.
6. Created `docs/DECISIONS.md` to track architectural choices.
7. Created `docs/STUBS.md` to catalog allowed stubs.
8. Created `docs/BACKLOG.md` for deferred features outside core scope.
9. Created `docs/samples/` directory for saving real/mock SSE event payloads.

---

## 3. Next Steps (Phase 1)

1. Setup npm monorepo workspaces: `apps/web`, `apps/server`, `packages/shared`, `tools/mock-hermes`.
2. Configure TypeScript strict mode and shared tsconfig.
3. Implement `packages/shared/src/endpoints.ts` with all API endpoints tagged by phase.
4. Implement automated phase-aware gap check `scripts/gap-check.ts` (`npm run gap-check`).
5. Build `tools/mock-hermes` on port 8642 to simulate runs, approvals, SSE events, and chat streams.
6. Run `typecheck`, `test`, and `gap-check` regression gate.

---

## 4. Open Questions

1. VPS Hermes port & key: Apakah Hermes di VPS saat ini sudah aktif di port default 8642 dengan API key tertentu, atau perlu diaktifkan terlebih dahulu menggunakan panduan di `docs/VPS_CHECKS.md`? (Bisa dilanjutkan dengan mock di dev mode jika belum siap).

---

## 5. Known Issues / Risks

- Hermes listening on loopback (127.0.0.1) on VPS host by default cannot be reached from Docker containers unless configured to bind to Docker bridge IP (172.17.0.1) or host network. Handled in Phase 8 deployment guide.

---

## 6. Exact Commands to Run the Project

*(Will be active from Phase 1 onward)*
- Development mode: `npm run dev`
- Run Mock Hermes: `npm run mock:hermes`
- Typecheck: `npm run typecheck`
- Unit tests: `npm test`
- Automated Gap Check: `npm run gap-check`
