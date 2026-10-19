# Phase-Gated & Memory Bank Development Protocol

Sistem ini adalah protokol pengembangan perangkat lunak berbasis **Phase-Gated Development** dan **Memory Bank Synchronization**. Seluruh proses pengembangan wajib mengikuti aturan di bawah ini secara ketat tanpa pengecualian.

---

## 3 HUKUM MUTLAK (ABSOLUTE LAWS)

### 1. ZERO-GAP & NO PLACEHOLDER
- **Dilarang Keras:** Menulis komentar `// TODO`, `// ... rest of code`, `// implement later`, stub kosong, mock palsu pada production path, atau mengabaikan penanganan error.
- **Integritas Antar-Layer:** Semua koneksi antar-layer (Database Schema -> Repository -> Service -> API Route -> Shared Contract -> Frontend Store/Hook -> UI Component) harus terhubung secara utuh, type-safe (strict TypeScript tanpa `any`/`@ts-ignore`), dan teruji.
- **Validasi Total:** Perubahan model data harus disertai migrasi database, validasi Zod schema, tipe TypeScript yang selaras, dan gap-check yang lolos.

### 2. STRICT SINGLE SUB-TASK
- **Satu Sub-Task Pada Satu Waktu:** Mengacu pada `process-task-list.md`, kerjakan **HANYA SATU** sub-task terkecil (contoh: Task 1.1) dalam satu siklus kerja.
- **Dilarang Merangkap:** Jangan melompat, jangan menggabungkan beberapa sub-task sekaligus, dan jangan "sekalian" mengerjakan hal di luar sub-task yang sedang aktif.
- **Protokol Penyelesaian Sub-Task:**
  1. Selesaikan implementasi sub-task secara penuh (zero-gap).
  2. Jalankan verifikasi kualitas:
     - Linter & Typecheck: `npm run typecheck`
     - Test Suite: `npm test`
     - Gap Check (jika ada): `npm run gap-check`
  3. Centang item sub-task pada file task/progress dari `[ ]` menjadi `[x]`.
  4. Lakukan sinkronisasi Memory Bank (perbarui `activeContext.md` dan `progress.md`).
  5. **BERHENTI (STOP)** segera. Laporkan apa yang baru saja diselesaikan, tampilkan bukti verifikasi, dan **TUNGGU INSTRUKSI / KONFIRMASI PENGGUNA** sebelum memulai sub-task berikutnya.

### 3. MEMORY SYNC
- **Read First:** Pada awal setiap sesi atau sebelum memulai pekerjaan baru, wajib membaca seluruh file di folder `memory-bank/` untuk menyerap konteks arsitektur, pola sistem, dan progres terkini.
- **Update As You Go:** Setiap kali suatu sub-task atau sub-fase selesai, file di `memory-bank/` wajib diperbarui secara real-time.
- **Single Source of Truth:** `memory-bank/` adalah memori jangka panjang proyek yang mencegah amnesia antar sesi. Jangan biarkan file di dalamnya usang atau bertentangan dengan kondisi riil kode.

---

## ALUR KERJA PHASE-GATED (WORKFLOW PHASES)

### Fase 1: Pembuatan PRD (`.agent/workflows/create-prd.md`)
- Saat merencanakan fitur baru yang signifikan, mulai dengan menyusun Product Requirements Document (PRD).
- Ajukan pertanyaan klarifikasi jika kebutuhan belum jelas sebelum membuat asumsi teknis.
- Format PRD mencakup: Problem Statement, User Stories, Scope (In-Scope & Out-of-Scope), Technical Requirements, Success Metrics, dan Risks.
- Simpan PRD sebagai dokumen acuan (misal: `docs/prd/<feature>-prd.md`).

### Fase 2: Pemecahan Task List (`.agent/workflows/generate-tasks.md`)
- Turunkan PRD menjadi daftar task yang terstruktur, modular, dan terurut.
- Gunakan penomoran hierarkis (Phase 1 -> Task 1.1, Task 1.2, Phase 2 -> Task 2.1...).
- Setiap sub-task harus cukup kecil untuk diselesaikan dan diverifikasi dalam satu iterasi kerja.
- Sertakan kriteria sukses dan file yang relevan untuk setiap sub-task.

### Fase 3: Eksekusi Berpagar (`.agent/workflows/process-task-list.md`)
- Ambil satu sub-task pertama yang belum selesai (`[ ]`).
- Konfirmasi pemahaman sebelum mulai mengeksekusi jika ada ambiguitas.
- Implementasikan kode secara tuntas (Zero Placeholder, Zero Gap).
- Jalankan automated tests / typechecks.
- Ubah checkbox menjadi `[x]`.
- Minta review dan konfirmasi pengguna untuk lanjut ke task berikutnya.

---

## STRUKTUR MEMORY BANK (`memory-bank/`)

Folder `memory-bank/` harus selalu terawat dengan file-file berikut:
1. **`projectbrief.md`**: Fondasi proyek, visi produk, tujuan utama, dan batasan cakupan sistem.
2. **`systemPatterns.md`**: Arsitektur teknis, pola desain (design patterns), arsitektur monorepo, aliran data, dan keputusan teknis utama.
3. **`activeContext.md`**: Status pekerjaan aktif, fokus langkah saat ini, pertimbangan teknis terkini, dan langkah berikutnya.
4. **`progress.md`**: Rekam jejak fitur yang sudah selesai (what works), apa yang tersisa (what's left), status fase saat ini, dan known issues.

---

## INTEGRASI DENGAN ALAT VERIFIKASI
Di setiap penyelesaian sub-task:
- Verifikasi compile & type-safety: `npm run typecheck`
- Verifikasi unit & integrasi: `npm test`
- Verifikasi kelengkapan gap: `npm run gap-check` (jika tersedia di proyek)
- Tidak boleh ada perubahan yang di-commit atau dilaporkan selesai jika typecheck atau gap-check masih gagal.
