# PRD: Telegram Proactive Notifications & Daily Executive Briefing

- **Feature Name:** `telegram-proactive-notifications`
- **Target Audience:** Junior Developer & Implementation Agents
- **Target Location:** `apps/server`, `apps/web`, `packages/shared`
- **Protocol Compliance:** Phase-Gated, Zero-Gap, Zero-Placeholder, Rule REQ-011 (outbound `sendMessage` only)

---

## 1. Introduction / Overview

Hermes Virtual Office saat ini mengelola agen otonom, eksekusi tugas (tasks), dan persetujuan (approval) sensitif. Saat ini, CEO/Owner harus membuka Telegram Mini App secara manual untuk mengetahui apakah suatu tugas telah selesai, apakah ada tugas yang gagal, atau apakah ada agen yang tertahan menunggu persetujuan (approval).

Fitur **Telegram Proactive Notifications & Daily Executive Briefing** menghadirkan komunikasi dua lapis langsung ke chat Telegram Owner:
1. **Notifikasi Instan (Event-Driven):** Pesan instan saat tugas selesai (`done`), tugas gagal (`failed`), atau membutuhkan persetujuan CEO (`approval.pending`).
2. **Executive Daily Briefing (Scheduled Cron):** Rangkuman kinerja harian otomatis setiap pukul 18:00 WIB (UTC+7) yang merangkum jumlah task selesai, performa departemen, dan tugas yang memerlukan tindakan lanjut.

Sesuai **Rule REQ-011**, seluruh komunikasi ke Telegram Bot API dilakukan strictly searah melalui endpoint `/sendMessage` dengan tombol inline WebApp, tanpa pernah menyentuh `getUpdates` atau `setWebhook`, sehingga aman dari konflik dengan gateway Hermes.

---

## 2. Goals

1. **Memberikan Visibilitas Real-time:** Owner menerima kabar langsung saat tugas selesai atau gagal tanpa perlu me-refresh atau membuka Mini App terus-menerus.
2. **Mempercepat Pengambilan Keputusan (Approval):** Memangkas waktu tunggu agen saat membutuhkan persetujuan sensitif dengan mengirim alert interaktif ke Telegram Owner.
3. **Rekapitulasi Harian Otomatis:** Menyediakan ringkasan eksekutif harian pukul 18:00 WIB berdasarkan data faktual SQLite (anti-halusinasi).
4. **Pengaturan Fleksibel (User Preference):** Memberikan kendali kepada Owner di menu Settings untuk mengaktifkan/menonaktifkan jenis notifikasi tertentu serta melakukan uji kirim.

---

## 3. User Stories

- **US-1 (Notifikasi Task Selesai):** Sebagai CEO, saya ingin menerima notifikasi Telegram saat agen menyelesaikan tugasnya beserta ringkasan hasil kerja dan tombol untuk membuka Mini App, agar saya mengetahui progres kantor tanpa membuka aplikasi berulang kali.
- **US-2 (Alert Approval Checkpoint):** Sebagai CEO, saya ingin segera diberitahu ketika sebuah tugas membutuhkan persetujuan saya, agar agen tidak terhenti terlalu lama.
- **US-3 (Alert Task Gagal):** Sebagai CEO, saya ingin menerima notifikasi instan ketika tugas gagal beserta ringkasan errornya, agar saya bisa segera melakukan evaluasi atau penugasan ulang.
- **US-4 (Daily Executive Briefing):** Sebagai CEO, setiap pukul 18:00 WIB saya ingin menerima pesan rekapitulasi kinerja kantor hari ini (tugas selesai, KPI utama, approval tertunda) agar saya memiliki gambaran umum sebelum jam kerja berakhir.
- **US-5 (Pengaturan Notifikasi):** Sebagai CEO, saya ingin dapat menyalakan/mematikan jenis notifikasi di layar Pengaturan (Settings) Mini App dan menguji pengirimannya dengan satu klik.

---

## 4. Functional Requirements

### 4.1 Event-Driven Notifications (Backend)
- **FR-1 (Task Completed Trigger):**
  - Ketika sebuah tugas bertransisi status menjadi `done` (baik melalui `dispatcher.ts`, `tasks.ts`, atau `task-materializer.ts`), sistem harus memanggil `telegramNotifications.notifyTaskCompleted(task, agentName)`.
  - Format pesan:
    ```markdown
    ✅ *Tugas Selesai*
    Agen: *[Nama Agen]* ([Departemen])
    Tugas: *[Judul Tugas]*
    Hasil: [Ringkasan output / artefak jika ada]
    ID Tugas: `[task_id]`
    ```
  - Disertai tombol inline WebApp: `[Buka Virtual Office]`.

- **FR-2 (Task Failed Trigger):**
  - Ketika tugas bertransisi status menjadi `failed`, sistem harus memanggil `telegramNotifications.notifyRunFailed(task, agentName, error)`.
  - Format pesan memuat detail galat (maksimal 300 karakter) dan tombol inline WebApp.

- **FR-3 (Approval Pending Trigger):**
  - Ketika sebuah approval checkpoint baru terdaftar (`approvals.ts`), sistem harus memanggil `telegramNotifications.notifyApprovalPending(approval, agentName)`.
  - Format pesan memuat ringkasan aksi sensitif dan tombol inline WebApp bertuliskan `[Tinjau Persetujuan]`.

### 4.2 Scheduled Executive Daily Briefing (Backend)
- **FR-4 (Briefing Scheduler):**
  - Backend Fastify harus memiliki scheduler internal yang berjalan setiap hari tepat pukul 18:00 WIB (11:00 UTC).
  - Scheduler menghitung data faktual dari SQLite hari ini (`created_at` / `updated_at` hari ini):
    1. Total task dibuat & total task selesai hari ini.
    2. Rincian per departemen (jumlah task selesai per divisi).
    3. Jumlah approval yang masih berstatus `pending`.
    4. Tingkat keberhasilan tugas harian (% success rate).
  - Format pesan:
    ```markdown
    🏢 *Executive Daily Briefing — Hermes Office*
    📅 *[Tanggal Hari Ini, WIB]*
    
    📊 *Ringkasan Kinerja Hari Ini:*
    • Tugas Selesai: *[N]* tugas
    • Tingkat Keberhasilan: *[X]%*
    • Approval Tertunda: *[N]* perlu tindakan

    🏛️ *Aktivitas Departemen:*
    • Sales: [N] tugas selesai
    • Marketing: [N] tugas selesai
    • Development: [N] tugas selesai
    • Operations: [N] tugas selesai

    Semua agen beroperasi normal di kantor virtual.
    ```
  - Disertai tombol inline WebApp: `[Lihat Dashboard Lengkap]`.

### 4.3 Notification Preferences & Test Action (Shared & Frontend)
- **FR-5 (Notification Settings Schema & Persistence):**
  - Tambahkan skema pengaturan notifikasi di `packages/shared/src/schemas.ts`:
    * `notify_task_completed: boolean` (default: `true`)
    * `notify_task_failed: boolean` (default: `true`)
    * `notify_approval_pending: boolean` (default: `true`)
    * `daily_briefing_enabled: boolean` (default: `true`)
  - Tersimpan di tabel `settings` SQLite melalui key `notification_preferences`.

- **FR-6 (Settings UI Card):**
  - Di layar `Settings.tsx`, tambahkan seksi **Notifikasi Telegram**:
    * Sakelar toggle untuk masing-masing preferensi (Task Selesai, Task Gagal, Approval, Daily Briefing).
    * Tombol **Uji Kirim Notifikasi** (`Kirim Notifikasi Tes`) dengan animasi loading dan haptic feedback Telegram.

- **FR-7 (Test Notification API):**
  - Endpoint `POST /api/settings/notifications/test` untuk mengirim notifikasi sampel ke seluruh `OWNER_TELEGRAM_IDS` terdaftar.

---

## 5. Non-Goals (Out of Scope)

1. **Two-Way Chat Bot / Interactive Bot Commands:** Tidak membangun handler `/start`, `/help`, atau input interaktif di chat bot Telegram biasa (fokus interaksi utama tetap berada di dalam Telegram Mini App).
2. **`getUpdates` atau `setWebhook`:** Mutlak dilarang memanggil endpoint polling/webhook Telegram sesuai **REQ-011**.
3. **Notifikasi ke Grup / Channel:** Pengiriman hanya ditujukan kepada akun Owner terdaftar (`OWNER_TELEGRAM_IDS`), bukan broadcast ke grup publik.

---

## 6. Design & UX Considerations

- **Bahasa Notifikasi:** Menggunakan Bahasa Indonesia profesional yang ringkas, elegan, dan nyaman dibaca di layar smartphone.
- **Pesan Bersih & Actionable:** Tidak menyertakan teks teknis mentah yang membingungkan. Setiap pesan selalu memiliki satu tombol aksi langsung menuju konteks yang relevan di Mini App.
- **Dukungan Dark/Light TMA:** Styling UI toggle di layar `Settings.tsx` mengikuti palette token kantor virtual (`office-surface`, `office-accent`, `office-border`).

---

## 7. Technical Considerations & Architecture

- **Service Layer (`apps/server/src/services/notifications.ts`):**
  - Perluas method `TelegramNotificationService`:
    * `notifyTaskCompleted(task, agentName, outputSummary)`
    * `sendDailyBriefing(metrics)`
    * `sendTestNotification()`
  - Pastikan setiap request HTTP ke `https://api.telegram.org/bot<TOKEN>/sendMessage` memiliki `timeout` 5 detik dan penanganan error yang anggun (tidak melempar uncaught exception jika koneksi Telegram gagal).
  - Fallback aman pada mode test / mock: jika `NODE_ENV === 'test'` atau bot token mock, simpan record ke memori `sentNotifications` tanpa memanggil API jaringan sungguhan.
- **Scheduling Layer:**
  - Timer akurat berbasis node `setInterval` atau cron parser ringan yang memeriksa pergantian waktu dan mengeksekusi tepat pada 11:00 UTC (18:00 WIB), dengan flag idempotensi harian (mencegah pengiriman ganda pada tanggal yang sama).
- **Security & Authorization:**
  - Endpoint `POST /api/settings/notifications/test` dan update preferensi dilindungi oleh autentikasi HMAC Telegram yang sudah ada.

---

## 8. Success Metrics

1. **Zero-Gap Verification:** `npm run typecheck`, `npm test`, dan `npm run gap-check` tetap 100% lulus (8/8).
2. **Delivery Latency:** Notifikasi instan terkirim dalam waktu $< 2$ detik setelah status task atau approval berubah di database.
3. **Reliability:** 0 crash pada server jika API Telegram mengalami timeout atau rate limit (graceful error logging).
4. **Idempotensi Briefing:** Briefing harian hanya terkirim tepat 1 kali per hari kalender WIB.

---

## 9. Open Questions & Resolutions

- *Q: Apa yang terjadi jika Owner belum mengatur `TELEGRAM_BOT_TOKEN` atau `OWNER_TELEGRAM_IDS`?*
  - **A:** Service mendeteksi konfigurasi kosong, mencatat log peringatan ramah (*warning*), dan me-no-op pengiriman tanpa membuat server crash atau alur task terhambat.
- *Q: Apakah ringkasan harian tetap dikirim jika tidak ada tugas yang berjalan hari itu?*
  - **A:** Ya, tetap dikirimkan dengan status *"Semua sistem siap, belum ada tugas yang dieksekusi hari ini"* agar Owner tahu kantor tetap aktif dan siaga.
