# Project Brief: Hermes Virtual Office (Telegram Mini App 3D Hermes)

## 1. Vision & Overview
**Hermes Virtual Office** (`hermes-virtual-office`) adalah aplikasi **Telegram Mini App (TMA)** interaktif berbasis 3D yang menghubungkan pengguna dengan agen AI otonom melalui **Hermes Agent Gateway**. Aplikasi ini menghadirkan ruang kantor virtual isometrik 3D tempat agen-agen AI bekerja di meja masing-masing, menjalankan tugas, berdiskusi melalui chat real-time berfitur streaming, menghasilkan artefak, dan melaporkan progres kerja nyata.

Proyek ini dibangun di atas fondasi non-negosiasi: **Zero-Gap**, **Zero-Placeholder**, dan **Anti-Halusinasi**.

---

## 2. Core Requirements & Key Features

### A. 3D Interactive Virtual Office (Frontend)
- **Render Engine:** Tiga dimensi menggunakan Three.js, `@react-three/fiber`, dan `@react-three/drei`.
- **Interaksi Meja & Agen:** Klik meja kerja untuk membuka profil agen, memeriksa status aktif (idle, thinking, executing, completed, failed), dan memulai obrolan langsung.
- **Optimasi Aset:** Aset 3D low-poly, tekstur teroptimasi, fallback otomatis jika aset gagal dimuat, dan bundle size terkontrol (chunk 3D gzip <= 700 KB).
- **Telegram Mini App Native:** Adaptasi viewport mobile, theme color sinkron dengan Telegram, dan mock TMA untuk kemudahan pengujian di browser biasa.

### B. Autonomous Agent & Task Lifecycle (Backend)
- **Agent Gateway:** Komunikasi terisolasi ke Hermes AI Gateway via REST dan Server-Sent Events (SSE).
- **Siklus Hidup Task:** Pembuatan tugas, penugasan ke agen yang sesuai berdasarkan department & skills, eksekusi real-time, approval checkpoint untuk aksi sensitif, hingga penerbitan artefak hasil kerja.
- **Robust Streaming:** Streaming chat dengan dual-timeout (`HERMES_CHAT_TTFB_MS` = 60s dan `HERMES_CHAT_TIMEOUT_MS` = 300s) serta pembersihan runaway task otomatis.

### C. Recruitment & Department Management
- **Hiring Room:** Alur rekrutmen agen baru mulai dari pemetaan kandidat, wawancara, hingga penempatan ke departemen yang tepat.
- **Skill Catalog:** Pemasangan keahlian teknis (tools/skills) ke agen untuk memperluas kemampuan penyelesaian masalah.

### D. Anti-Hallucination Reports & Audit Ledger
- **Laporan Faktual:** Metrik KPI dan laporan performa agen dihitung langsung dari log audit SQLite, bukan hasil imajinasi/halusinasi model AI.
- **Audit Trail:** Setiap keputusan, pergantian status, pengiriman prompt, dan eksekusi command tersimpan rapi dalam database.

---

## 3. Tech Stack At-a-Glance
- **Monorepo:** npm workspaces (`apps/server`, `apps/web`, `packages/shared`, `tools/mock-hermes`).
- **Server:** Node.js, Fastify 4, SQLite (`better-sqlite3`), Zod, Pino Logger.
- **Web:** React 18, Vite, Three.js / React Three Fiber / Drei, Zustand, TanStack React Query, TailwindCSS, Lucide React, i18next.
- **Shared:** `@hermes-office/shared` berisi skema Zod dan tipe TypeScript bersama.
- **DevOps:** Multi-stage Dockerfile, Coolify deployment ready, automated gap-check suite (`scripts/gap-check.ts`).

---

## 4. Development Protocol
Proyek ini dikelola di bawah **Phase-Gated & Memory Bank Development Protocol**:
1. Zero-Gap & No Placeholder (semua layer terhubung tuntas dan bertipe ketat).
2. Strict Single Sub-Task (eksekusi satu per satu, uji, verifikasi, centang, lalu berhenti).
3. Memory Sync (sinkronisasi berkelanjutan pada file di `memory-bank/`).
