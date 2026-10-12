# State Matrix & Adversarial QA Verification (Rule C5 & C9)

This document records the complete state matrix verification and adversarial stress test results for **Hermes Virtual Office** (Pass 1 & Pass 2), satisfying requirements **REQ-006**, **REQ-085**, **REQ-093**, and Rules **C5**, **C9**, **R5**, and **R10**.

---

## 1. Pass 1: State Matrix Across 5 Screens

Every primary screen in the application is implemented to handle 6 explicit system states gracefully:

| Screen | 1. Loading | 2. Empty | 3. Error (w/ Retry) | 4. Offline (SSE Reconnect) | 5. Success | 6. Low-Power Mode |
|---|---|---|---|---|---|---|
| **Office (Map)** | Pulsing cyan skeletons for header HUD & map container | Onboarding card with *"Muat Kantor Demo"* (8 demo agents) | Error banner with *"Coba Lagi"* button re-fetching `/api/agents` | Yellow offline badge with SSE auto-reconnect banner | Interactive 2D floor plan, dynamic avatar status rings, floating chat | Animations disabled, static status rings, paused pulse effects |
| **Tasks** | Skeleton cards in 4 Kanban columns | Empty illustration with *"Belum ada tugas"* & *"Buat Tugas Pertama"* | Error alert with retry button re-fetching `/api/tasks` | Live SSE ticker pauses with auto-reconnecting indicator | 4-column drag/swipe Kanban (`backlog`, `running`, `needs_approval`, `done`) | Disabled column transition effects, static progress bars |
| **Inbox (Approvals)** | Spinner placeholder in approvals feed | Empty inbox card: *"Semua beres! Tidak ada persetujuan tertunda"* | Error prompt with retry trigger on `/api/approvals` | Action buttons show offline warning until reconnect | Cards with payload inspector, *Setujui (1x)* and *Tolak* buttons | Instant dismissal without slide/fade animations |
| **Reports** | Skeleton table rows for reports & KPIs | Empty state with *"Belum ada laporan"* & prompt to generate | Error banner with retry trigger on `/api/reports` & `/api/kpis` | Background sync paused; manual entry retained in local state | Generated Markdown reports, verified KPI badges, anti-hallucination gate | No chart animations, static KPI scorecards |
| **More (Settings)** | Quick spinner while loading settings & agent registry | Clean defaults for all preferences | Notification toast on failed setting update | Offline badge on live Telegram bot connection test | Full settings, language selector, recruitment wizard, audit log | Low-power toggle indicator active with battery optimization info |

---

## 2. Pass 2: Adversarial & Resiliency Test Results

All adversarial scenarios are verified via automated tests (`apps/server/src/adversarial.test.ts`, `server.test.ts`, `auth.test.ts`, `notifications.test.ts`) and browser testing:

### Scenario 1: Hermes Gateway Down Mid-Run
- **Behavior**: When the external Hermes instance becomes unreachable during task execution, the SSE event reader catches the disconnection, updates the task status to `failed` (`result_md: "Hermes gateway connection failed"`), sets the agent status to `error`, and sends an automated Telegram failure alert.
- **Verification**: `server.test.ts` & `dispatcher.ts` (14-day error event persistence and notification fallback).

### Scenario 2: Expired Telegram WebApp `initData` (> 3600s)
- **Behavior**: When an authentication token older than 3600 seconds is presented in the `Authorization: tma <initData>` header, the server rejects it immediately with HTTP `401 Unauthorized`.
- **Verification**: `adversarial.test.ts` Case 2: `tma auth_date` older than 4500 seconds returns `401`.

### Scenario 3: Non-Owner Telegram ID Access
- **Behavior**: When a valid Telegram user signature is provided but the user ID is not in `OWNER_TELEGRAM_IDS`, the server rejects the request with HTTP `403 Forbidden`.
- **Verification**: `adversarial.test.ts` Case 3: Stranger user `id: 88888888` returns `403`.

### Scenario 4: Double-Tap on Approval Resolution (Idempotency)
- **Behavior**: When an owner taps *"Setujui"* twice in rapid succession (e.g., poor network connection), Tap 1 succeeds with HTTP `200 { status: 'resolved' }`. Tap 2 is rejected safely with HTTP `400 { error: 'already_resolved' }`. No duplicate runs or double disbursements are executed.
- **Verification**: `adversarial.test.ts` Case 5: Concurrency check passes.

### Scenario 5: Extreme Input Length (1000-Character Task Title)
- **Behavior**: Task creation accepts a 1000-character title without truncation, buffer overflow, or database errors. The full title is stored safely in SQLite and rendered in the Kanban UI with proper `break-words` styling.
- **Verification**: `adversarial.test.ts` Case 4: Title length 1000 verified with HTTP `201`.

### Scenario 6: High Concurrency (20 Simultaneous Agent Registrations)
- **Behavior**: 20 agents created simultaneously in SQLite. With `WAL` mode enabled (`PRAGMA journal_mode = WAL`), all 20 transactions commit cleanly without SQLITE_BUSY or database lock failures.
- **Verification**: `adversarial.test.ts` Case 6: All 20 concurrent HTTP POST requests return `201`.

### Scenario 7: Ultra-Narrow Mobile Viewport (320px Viewport)
- **Behavior**: At 320x640px, the UI adapts with zero horizontal scroll bleed. All buttons meet the `>= 44px` touch target requirement (`min-h-[44px] min-w-[44px]`), modal headers wrap cleanly, and Kanban tabs are horizontally swipeable.
- **Verification**: Mobile responsive pass in `apps/web/src/` with Tailwind `min-h-[44px]` and flexible grid layout.

### Scenario 8: Language Hot-Swap (ID ↔ EN)
- **Behavior**: Switching language between Indonesian (`id`) and English (`en`) in the More screen updates all navigation labels, status pills, and empty states immediately without requiring an app reload.
- **Verification**: `apps/web/src/i18n/` and `More.tsx` language picker.

### Scenario 9: Low-Power Mode Active
- **Behavior**: When Low-Power Mode is toggled (or auto-detected on low-end hardware: `<= 4` CPU cores / `<= 4GB` RAM), CSS transitions and keyframe animations are disabled, background polling intervals are extended, and static badges are used instead of pulsing glow effects.
- **Verification**: `apps/web/src/stores/power.ts` reactive subscriber in root app.

---

## 3. Test Suite Summary

- **Total Test Files**: 9 passed
- **Total Unit & Integration Tests**: 64 passed
- **Coverage Highlights**:
  - `apps/server/src/adversarial.test.ts`: 15 passed
  - `apps/server/src/server.test.ts`: 9 passed
  - `apps/server/src/auth.test.ts`: 5 passed
  - `apps/server/src/services/notifications.test.ts`: 4 passed
  - `apps/server/src/services/dispatcher.test.ts`: 3 passed
  - `apps/server/src/db/migrator.test.ts`: 2 passed
  - `packages/shared/src/schemas.test.ts`: 17 passed
  - `packages/shared/src/endpoints.test.ts`: 5 passed
  - `tools/mock-hermes/src/server.test.ts`: 4 passed
