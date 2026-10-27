# Hermes Virtual Office — Release & Patch Notes

## 📢 Rilis 28 Oktober 2026: Telegram Proactive Notifications & Daily Executive Briefing
**Tanggal Rilis:** 28 Oktober 2026  
**Cakupan:** Notifikasi Outbound Proaktif Telegram, Executive Daily Briefing 18:00 WIB, Settings Preferences, Model Priority Fallback Chain & Stale Run Reaper  
**Status Kualitas:** 1.316 Tests Passed (121 Test Files) · Gap-Check 8/8 PASS · TypeScript 0 Error · 3D Chunk 228.81 KB gzip  

---

### 🚀 Ringkasan Rilis (28 Oktober 2026)
Rilis ini membawa kapabilitas komunikasi proaktif searah (**Outbound Proactive Notifications**, Rule REQ-011) dari Virtual Office langsung ke chat pribadi Telegram Owner:
1. **Notifikasi Otomatis Status Tugas:** Owner langsung menerima alert real-time ketika suatu tugas selesai dikerjakan agen (`done`) dengan ringkasan output dan durasi, atau ketika run gagal (`failed`) dengan detail pesan kendala.
2. **Alert Permintaan Persetujuan (Human-in-the-Loop):** Saat agen membutuhkan otorisasi untuk tindakan berisiko (misal eksekusi order, deployment, atau pengeluaran dana), bot langsung mengirimkan pesan ringkasan otorisasi dengan deep-link tombol langsung ke Virtual Office.
3. **Executive Daily Briefing (18:00 WIB):** Rekap metrik eksekutif harian otomatis yang ditarik dari basis data faktual SQLite (jumlah tugas tuntas, gagal, success rate %, approval tertunda, dan rincian kerja departemen) tepat setiap jam 6 sore WIB dengan idempotensi kalender aman.
4. **Kontrol Preferensi & Uji Kirim:** Kartu pengaturan baru di menu *Settings* dengan 4 switch toggle independen dan tombol "Uji Kirim Pesan" untuk memastikan koneksi bot Telegram aktif.
5. **Kepatuhan Mutlak Rule REQ-011:** Panggilan API bot strictly `sendMessage` HTTP POST, **tanpa** `getUpdates` atau `setWebhook`, menjaga webhook bot utama tetap aman tanpa konflik.

---

### 📦 Rincian Fitur & Pembaruan

#### 1. Outbound Telegram Notification Service
- Service inti di `apps/server/src/services/notifications.ts` dengan perlindungan timeout 5 detik, sanitasi karakter format Markdown V1, penanganan error non-blocking, serta isolasi mock pengujian.
- Filter preferensi dinamis yang mengecek konfigurasi pengguna sebelum mengirim pesan.

#### 2. Event-Driven Notification Hooking
- Terhubung secara otomatis pada lifecycle dispatcher (`dispatcher.ts`), rute tugas (`routes/tasks.ts`), dan materializer chat (`task-materializer.ts`).
- Notifikasi terkirim tepat saat transisi status tugas terjadi di server.

#### 3. Executive Daily Briefing Scheduler
- Modul `briefing-scheduler.ts` dengan agregasi metrik faktual harian dari SQLite.
- Pengecekan periodic jam 18:00 WIB (UTC+7) dengan penguncian kunci `last_daily_briefing_date` (`YYYY-MM-DD`) di tabel `settings` untuk mencegah notifikasi ganda saat restart server.

#### 4. Settings UI & Test Notification
- Endpoint Fastify:
  * `GET /api/settings/notifications` — Membaca preferensi notifikasi.
  * `PATCH /api/settings/notifications` — Menyimpan pembaruan preferensi switch toggle.
  * `POST /api/settings/notifications/test` — Mengirimkan contoh pesan uji ke ID Telegram Owner.
- Komponen antarmuka `TelegramNotificationsCard.tsx` dengan switch toggle ber-touch target $\ge 44\text{px}$, dialog feedback interaktif, dan lokalisasi dwibahasa (ID/EN).

---

## 📢 Rilis 20 Oktober 2026: Integrasi Hermes Gateway ↔ Telegram Mini App (Fase 1 s/d 6)
**Tanggal Rilis:** 20 Oktober 2026  
**Cakupan:** Rilis Akbar Integrasi Hermes Gateway ↔ Telegram Mini App (Fase 1 s/d 6)  
**Status Kualitas:** 989 Tests Passed (95 Test Files) · Gap-Check 8/8 PASS · TypeScript 0 Error  

---

## 🚀 Ringkasan Rilis

Rilis ini menyambungkan dua sistem yang sebelumnya terpisah:
1. **Aplikasi Telegram Mini App (SQLite)**: Pengelola profil agen, status kantor 3D/2D, daftar tugas, dan lembar obrolan.
2. **Hermes Gateway & Host**: Otak eksekusi LLM, tool caller, dan scheduler.

Melalui 6 fase integrasi bertahap, percakapan agen kini tahan terhadap gangguan jaringan/restart, eksekusi tools tercatat otomatis sebagai tugas, jadwal cron tampil per agen dalam waktu WIB, CEO dapat berganti obrolan dalam 1 ketukan, dan skill kustom bisnis ikut berpindah bersama repositori (migrasi-proof).

---

## 📦 Rincian Pembaruan per Fase

### 1. Fase 1 — Jembatan Identitas Agen
- **Masalah:** Agen menjawab seperti asisten umum dan tidak mengenali nama/perannya ("Bagas ini orang di proyek mana?").
- **Solusi:**
  * Modul `identity.ts` menyusun system prompt kontekstual berisi nama, peran, dan departemen agen.
  * System prompt disuntikkan secara otomatis pada giliran chat pertama (`system_message` pada sesi gateway atau `role: system` pada completions stateless).
  * **Hasil:** Agen langsung menyadari identitasnya sejak awal tanpa perlu instruksi berulang.

### 2. Fase 2 — Reliabilitas Chat & Anti-Timeout
- **2a. Heartbeat SSE 10 Detik:**
  * Server mengirimkan komentar `: hb\n\n` tiap 10 detik selama stream chat berjalan (termasuk saat menunggu tool). Mencegah pemutusan koneksi sepihak oleh Cloudflare / reverse proxy.
- **2b. Chat via Runs API + Reattach:**
  * Jalur chat dimigrasikan ke `POST /v1/runs` + SSE events.
  * Endpoint `GET /api/agents/:id/runs/:runId/stream` memungkinkan Mini App menyambung ulang stream yang terputus (replay dari SQLite `run_events` + live events). Menutup panel tidak membatalkan pekerjaan agen.
- **2c. Antrian Chat per Agen:**
  * `AgentChatQueue` menjamin 1 run aktif per agen secara FIFO (maksimal 5 antrian). Mengeliminasi race condition turn chat ganda.
- **2d. Idempotensi & Deteksi Stall 45 Detik:**
  * Header `client_message_id` mencegah duplikasi request.
  * Jika gateway terdiam selama 45 detik, sistem otomatis mengirim status `tool_running` dan melakukan retry ke fallback model.
- **2e. Persistensi Parsial & Tombol Lanjutkan:**
  * Migrasi database `010_agent_chat.sql` (`agent_runs` dan `agent_messages`).
  * Setiap potongan teks stream tersimpan secara bertahap. Jika terjadi kegagalan jaringan, balasan tidak hilang dan pengguna diberikan tombol interaktif "Lanjutkan".

### 3. Fase 3 — Integrasi Profil Hermes & SOUL.md
- **Isolasi Profil Mandiri:** Setiap agen memiliki profil terisolasi di `~/.hermes/profiles/<profile>/` lengkap dengan memori dan sesinya sendiri.
- **Generator SOUL.md 9 Seksi:** Mengompilasi nama, peran, gaya komunikasi, batasan otorisasi, dan keahlian agen ke dalam format resmi `SOUL.md`.
- **Auto-Provisioning saat Hiring:** Kandidat yang diterima di `POST /api/hiring/:id/mark-hired` otomatis di-provision profilnya.
- **CLI Backfill Runner:** Script `npm run provision:backfill` untuk menyelaraskan seluruh agen lama di database ke profil Hermes.

### 4. Fase 4 — Task & Run Visibility
- **Materialisasi Task Chat Otomatis:**
  * Migrasi `012_tasks_visibility.sql` (`source: 'chat' | 'direct' | 'system'`).
  * Turn chat yang memanggil tool (misal browser, scraping, bash) secara otomatis dibuatkan entri tugas di database dan UI Tasks.
- **Visualisasi Timeline Run:**
  * Filter pill di layar Tugas (`Semua`, `Langsung`, `Dari Obrolan`).
  * Badge indikator `Chat Auto-Task` dan jumlah tool yang dipanggil (`🔧 X tools`).
  * Modal `TaskResultModal` interaktif untuk beralih antara teks hasil output dan linimasa peristiwa run.

### 5. Fase 5 — UI: List Cron + FAV Messenger
- **List Cron Jadwal Otomatis:**
  * Endpoint `GET /api/cron` mengambil job terjadwal dari gateway Hermes, memetakan ke agen penanggung jawab, memfilter skill yang nonaktif, dan memformat ekspresi cron ke label waktu Indonesia (WIB).
  * Komponen `CronScheduleView.tsx` terintegrasi di layar Tasks.
- **FAV Messenger & Quick-Switcher:**
  * Floating Action Button (`MessengerFAB.tsx`) dengan badge counter agen.
  * Drawer modal (`AgentMessengerModal.tsx`) menampilkan daftar obrolan agen, status dot animasi, cuplikan pesan terkini, dan pencarian real-time.
  * Tombol quick-switch di header `AgentSheet.tsx` memungkinkan CEO berganti obrolan agen dalam 1 ketukan tanpa keluar ke denah kantor 3D.

### 6. Fase 6 — Skill Auto-Install & Catalog Sync (Migrasi-Proof)
- **Katalog Skill Kustom di Repositori (`skills/`):**
  * `prospecting`: Pencarian lead, kualifikasi ICP & BANT, draf outreach.
  * `marketing-plan`: Strategi Go-To-Market, bauran promosi omnichannel, CAC/ROAS.
  * `brand`: Identitas brand, tone of voice, panduan komunikasi.
  * `sales-enablement`: Sales deck, objection handling, battlecard kompetitor.
- **Core Synchronizer & REST API:**
  * Service `skill-sync.ts` membandingkan katalog lokal repo dengan target host (`~/.hermes/skills/`).
  * Endpoint `GET /api/skills/sync/status` dan `POST /api/skills/sync` dengan audit log SQLite.
  * CLI Runner: `npm run skills:sync` (dengan dukungan `--dry-run` dan `--force`).

---

## 🛠️ Petunjuk Operasional & Migrasi VPS

Saat memperbarui deployment di VPS produksi (Coolify / Docker):

```bash
# 1. Tarik pembaruan rilis
git pull origin master

# 2. Build aplikasi monorepo
npm run build

# 3. Jalankan migrasi profil agen yang ada di DB
npm run provision:backfill

# 4. Sinkronisasikan katalog skill kustom ke host Hermes
npm run skills:sync
```

---

## 🛡️ Jaminan Kualitas & Sertifikasi

- **TypeScript:** 100% Type-Safe (`tsc --build` lolos tanpa kompromi).
- **Gap-Check Engine:** Memenuhi seluruh 8 kriteria C3 (Endpoints, Data Tables, i18n, Environment, Code Hygiene, Mock Security, Ledger, State Matrix).
- **Test Automation:** 989 unit & integration tests lolos di Vitest.
