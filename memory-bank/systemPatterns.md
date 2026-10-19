# System Patterns: Hermes Virtual Office

## 1. Monorepo Architecture
Proyek ini mengadopsi pola monorepo berbasis **npm workspaces**:
```
vps-mini-app/
├── apps/
│   ├── server/       # Fastify backend, SQLite DB, SSE streaming, Hermes Gateway client
│   └── web/          # React 18 frontend, Three.js 3D canvas, Zustand stores, TailwindCSS
├── packages/
│   └── shared/       # Domain schemas (Zod), shared TypeScript interfaces, common contracts
├── tools/
│   └── mock-hermes/  # Mock Hermes gateway server untuk pengembangan & pengujian offline
└── scripts/
    └── gap-check/    # Mesin gap-check otomatis (Rule C3 & REQ-101)
```

---

## 2. Backend Design Patterns (`apps/server`)

### A. Modular Fastify Architecture
Server dibangun dengan plugin-plugin terpisah:
- **Security & Network:** `@fastify/helmet` untuk HTTP security headers, `@fastify/cors` untuk cross-origin kontrol, `@fastify/rate-limit` untuk perlindungan dari flooding, dan `@fastify/multipart` untuk upload file/media.
- **Autentikasi:** Plugin `auth.ts` memvalidasi inisialisasi Telegram (`initData`) dengan HMAC-SHA256 signature check. Mode dev mendukung bypass terisolasi yang diblokir mutlak saat `NODE_ENV === 'production'`.

### B. Database & Repository Pattern
- **Engine:** SQLite 3 melalui driver sinkron berkecepatan tinggi `better-sqlite3`. Mode WAL (`PRAGMA journal_mode = WAL;`) diaktifkan untuk konkurensi baca-tulis optimal.
- **Migrasi:** Sequential migration runner (`apps/server/src/db/migrator.ts`) mengeksekusi file `.sql` bernomor urut di `apps/server/src/db/migrations/`.
- **Repository Abstraction:** Semua query database dibungkus dalam repository (`apps/server/src/db/repositories/`):
  * `agents.ts`, `tasks.ts`, `departments.ts`, `projects.ts`, `agent-skills.ts`, `hiring.ts`, `approvals.ts`, `audit.ts`, `kpis.ts`, `reports.ts`, `settings.ts`.
  * Memisahkan layer persistence dari route handler dan mempermudah unit testing.

### C. Gateway Client & Streaming Pattern
- **Hermes Client Interface:** Abstraksi seragam antara `real.client.ts` (koneksi ke Hermes Gateway asli via SSE/REST) dan `mock.client.ts` (simulasi deterministik).
- **Dual-Timeout Guard:**
  * `HERMES_CHAT_TTFB_MS`: Batas waktu menunggu byte/event pertama dari gateway (default: 60.000 ms).
  * `HERMES_CHAT_TIMEOUT_MS`: Batas waktu maksimum seluruh siklus giliran obrolan (default: 300.000 ms).
  * Stream kosong (0 byte) segera ditangkap sebagai galat provider, bukan keberhasilan kosong.
- **Runaway Task Cleanup:** Deteksi otomatis task yang menggantung atau terputus untuk menjaga kebersihan status agen.

---

## 3. Frontend Design Patterns (`apps/web`)

### A. Layered UI Architecture
- **Screens Layer (`apps/web/src/screens/`):** 5 layar utama (`Office.tsx`, `Tasks.tsx`, `Reports.tsx`, `Inbox.tsx`, `More.tsx`) yang terdaftar pada `manifest.ts`.
- **3D Canvas Layer (`apps/web/src/components/office/`):** Canvas 3D Three.js yang di-mount di layar `Office`. Menggunakan kamera ortografis isometrik, pencahayaan terkalibrasi, objek meja teroptimasi, dan badge status agen di atas model 3D.
- **State Matrix Requirement:** Setiap komponen layar wajib mendukung 6 variasi status: `loading`, `empty`, `error`, `success`, `offline`, dan `unauthorized`.

### B. State Management & Data Fetching
- **Zustand:** Digunakan untuk client-side ephemeral state (interaksi UI, pemilihan meja/agen aktif di 3D, filter task).
- **TanStack React Query:** Mengelola server state, caching otomatis, revalidasi latar belakang, dan sinkronisasi data task/notifikasi.

### C. Internationalization (i18n)
- Dikelola oleh `i18next` dan `react-i18next`.
- Seluruh teks UI terpetakan di file lokalisasi (`id` dan `en`). Script `gap-check` secara ketat memverifikasi bahwa tidak ada key yang hilang di antara kedua bahasa.

---

## 4. Cross-Layer Contracts (`packages/shared`)
- **Single Source of Truth:** Semua payload permintaan, response, enum status agen, dan model domain didefinisikan pertama kali di `packages/shared/src/schemas.ts`.
- **Zod Inferencing:** Tipe data TypeScript diturunkan langsung dari Zod (`z.infer<typeof Schema>`), menjamin runtime parsing dan compile-time type-safety 100% konsisten antara Server dan Frontend.

---

## 5. Automated Verification Patterns (`scripts/gap-check.ts`)
Setiap fase dilindungi oleh gatekeeper otomatis yang mengecek 8 kriteria:
1. `C3a`: Kelengkapan Endpoint terdaftar di Fastify.
2. `C3b`: Tabel dan kolom database SQLite terpasang lengkap.
3. `C3c`: Kelengkapan key terjemahan i18n (Indonesia & Inggris).
4. `C3d`: Sinkronisasi Environment Variables (`.env.example`, `env-schema.ts`, Coolify).
5. `C3e`: Kebersihan kode, tidak ada secret bocor, chunk 3D <= 700 KB gzip.
6. `C3f`: Penyekatan mock server & dev bypass di lingkungan produksi.
7. `C3g`: Integritas ledger requirements Phase 0-N.
8. `C3h`: State matrix 6 status pada seluruh layar UI.
