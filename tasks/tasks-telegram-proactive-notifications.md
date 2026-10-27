# Tasks: Telegram Proactive Notifications & Daily Executive Briefing

- **Feature:** `telegram-proactive-notifications`
- **PRD Reference:** [prd-telegram-proactive-notifications.md](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/tasks/prd-telegram-proactive-notifications.md)
- **Protocol:** Phase-Gated & Strict Single Sub-Task Protocol

---

## Relevant Files

- `packages/shared/src/schemas.ts` - Skema Zod untuk preferensi notifikasi dan payload testing.
- `packages/shared/src/endpoints.ts` - Pendaftaran endpoint setting notifikasi dan test notification.
- `packages/shared/src/index.test.ts` - Unit test skema shared.
- `apps/server/src/services/notifications.ts` - Implementasi inti `TelegramNotificationService` (outbound `sendMessage`).
- `apps/server/src/services/notifications.test.ts` - Unit tests untuk format pesan, idempotensi, dan fallback mock.
- `apps/server/src/services/briefing-scheduler.ts` - Scheduler internal untuk agregasi metrik SQLite dan pengiriman jam 18:00 WIB.
- `apps/server/src/services/briefing-scheduler.test.ts` - Unit tests untuk scheduler dan kalkulasi metrik harian.
- `apps/server/src/routes/settings.ts` - Endpoint GET/PATCH preferensi notifikasi dan POST test notification.
- `apps/server/src/routes/settings.test.ts` - Integration tests untuk endpoint pengaturan notifikasi.
- `apps/server/src/services/dispatcher.ts` - Trigger notifikasi saat task selesai (`done`) atau gagal (`failed`).
- `apps/server/src/routes/approvals.ts` - Trigger notifikasi saat persetujuan baru tercipta.
- `apps/server/src/services/agent-chat/task-materializer.ts` - Trigger notifikasi saat chat auto-task selesai.
- `apps/web/src/services/api.ts` - Client API method untuk preferensi notifikasi.
- `apps/web/src/screens/Settings.tsx` - Komponen kartu UI preferensi notifikasi Telegram dan tombol uji kirim.
- `apps/web/src/i18n/index.ts` - Kamus i18n dwibahasa (id & en) untuk preferensi notifikasi.
- `apps/web/src/screens/__tests__/Settings.states.test.tsx` - Verifikasi state matrix UI Settings.
- `scripts/gap-check.ts` - Verifikasi endpoint baru dan integritas arsitektur.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.
Execute strictly **ONE SUB-TASK AT A TIME**. After each sub-task, run tests, update memory bank, and STOP.

---

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout feature branch `feature/telegram-proactive-notifications`
- [x] 1.0 Shared Schemas & Endpoints Definition
  - [x] 1.1 Define `NotificationPreferencesSchema`, `NotificationPreferencesPatchSchema`, and `TestNotificationResultSchema` in `packages/shared/src/schemas.ts`
  - [x] 1.2 Register notification preferences & test endpoints in `packages/shared/src/endpoints.ts`
  - [x] 1.3 Add unit tests in `packages/shared/src/index.test.ts`
- [x] 2.0 Enhanced Telegram Notification Service
  - [x] 2.1 Implement `notifyTaskCompleted`, `notifyRunFailed`, `notifyApprovalPending`, `sendDailyBriefing`, and `sendTestNotification` in `apps/server/src/services/notifications.ts`
  - [x] 2.2 Add preference checking, Markdown V1 formatting, 5s timeout, and mock/test isolation
  - [x] 2.3 Write comprehensive unit tests in `apps/server/src/services/notifications.test.ts`
- [x] 3.0 Event-Driven Notification Hooking
  - [x] 3.1 Hook task completion and failure triggers in `apps/server/src/services/dispatcher.ts` and `apps/server/src/routes/tasks.ts`
  - [x] 3.2 Hook approval pending notification in `apps/server/src/routes/approvals.ts` and `apps/server/src/services/dispatcher.ts`
  - [x] 3.3 Hook task materializer completion in `apps/server/src/services/agent-chat/task-materializer.ts`
  - [x] 3.4 Integration tests in `apps/server/src/routes/tasks.test.ts` and `apps/server/src/routes/approvals.test.ts`
- [x] 4.0 Executive Daily Briefing Scheduler
  - [x] 4.1 Implement `ExecutiveBriefingService` in `apps/server/src/services/briefing-scheduler.ts` for SQLite metric aggregation
  - [x] 4.2 Implement 18:00 WIB daily timer with idempotency lock
  - [x] 4.3 Add unit tests in `apps/server/src/services/briefing-scheduler.test.ts`
- [x] 5.0 Settings UI & Test Notification Integration
  - [x] 5.1 Implement notification settings repository & endpoints in `apps/server/src/routes/settings.ts`
  - [x] 5.2 Add frontend API client methods in `apps/web/src/services/api.ts`
  - [x] 5.3 Build `TelegramNotificationsCard` in `apps/web/src/components/more/TelegramNotificationsCard.tsx` with toggle controls and test button
  - [x] 5.4 Update i18n dictionaries in `apps/web/src/i18n/index.ts`
  - [x] 5.5 Add UI state tests in `apps/web/src/components/more/__tests__/TelegramNotificationsCard.test.tsx` and `apps/web/src/screens/__tests__/Settings.states.test.tsx`
- [x] 6.0 Comprehensive Verification & Gate Compliance
  - [x] 6.1 Update `scripts/gap-check.ts` fixtures for new endpoints
  - [x] 6.2 Full regression verification: `npm run typecheck`, `npm test`, `npm run gap-check`, and `npm run build`
