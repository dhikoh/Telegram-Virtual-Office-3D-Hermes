# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Fase Terakhir Diselesaikan:** **Tahap 19 (Chat Streaming & Timeout)** — Selesai & Terverifikasi penuh per 2026-10-18.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — tidak ada compile / type error di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil.
- **Sistem Pengaturan Baru yang Terpasang:**
  * Protokol **Phase-Gated & Memory Bank Development** telah diaktifkan secara global dan per-proyek.
  * File workflow tersedia di `.agent/workflows/` (`create-prd.md`, `generate-tasks.md`, `process-task-list.md`, `memory-bank-rules.md`).
  * File panduan utama tersimpan di `.agent/rules.md` dan `AGENTS.md`.
  * Skill terpasang secara global di konfigurasi Antigravity (`~/.gemini/config/skills/phase-gated-memory-bank/` dan `~/.gemini/config/rules/phase-gated-memory-bank.md`).

---

## 2. Fokus & Prioritas Kerja Aktif
- Menjaga kepatuhan mutlak terhadap 3 Hukum Mutlak (Zero-Gap, Strict Single Sub-Task, Memory Sync) untuk setiap instruksi atau pengembangan fitur berikutnya.
- Menunggu instruksi spesifik dari pengguna mengenai fitur/perbaikan berikutnya yang akan dieksekusi.
- Jika tugas baru diterima:
  1. Jika butuh perencanaan / scoping: Buat PRD (`create-prd.md`).
  2. Pecah ke dalam daftar sub-task terinci (`generate-tasks.md`).
  3. Kerjakan secara ketat satu per satu sub-task (`process-task-list.md`), lakukan verifikasi, centang, perbarui memory-bank, dan minta konfirmasi sebelum melanjutkan.

---

## 3. Keputusan Teknis Terbaru (Tahap 19)
- **Dual-Timeout Gateway:** Memisahkan batas `HERMES_CHAT_TTFB_MS` (60 detik) untuk waktu respons pertama dan `HERMES_CHAT_TIMEOUT_MS` (300 detik) untuk durasi penuh giliran chat.
- **Empty Stream Failure Detection:** Gateway SSE stream yang menghasilkan 0 byte langsung ditandai sebagai galat penyedia, mencegah status "sukses kosong" yang membingungkan pengguna.
- **Runaway Task Cleanup:** Membersihkan status task yang terabaikan atau terputus secara otomatis untuk menjaga ketersediaan agen.

---

## 4. Invarian yang Harus Dijaga
1. Dilarang keras menyisipkan `// TODO`, `// ... rest of code`, atau fungsi kosong.
2. Setiap kali menulis endpoint baru atau tabel baru, wajib memperbarui `scripts/gap-check.ts` dan fixtures-nya agar status gap-check tetap hijau.
3. Seluruh string baru yang ditampilkan di UI wajib dimasukkan ke dictionary lokalisasi `en` dan `id`.
4. Kerjakan HANYA SATU sub-task dalam satu siklus, lalu berhenti untuk konfirmasi.
