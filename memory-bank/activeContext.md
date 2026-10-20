# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Fase Terakhir Diselesaikan:** **Fase 2e (Persist Parsial Chat & Tombol Lanjutkan)** — Selesai & Terverifikasi penuh per 2026-10-20.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**894 tests passed across 85 test files**).
- **Fitur Baru Fase 2e:**
  * Migrasi `010_agent_chat.sql` menambahkan tabel `agent_runs` dan `agent_messages`.
  * Akumulasi chunk real-time: setiap delta stream disimpan bertahap ke SQLite. Jika terjadi error di tengah streaming, potongan respon asisten tetap utuh di database dengan `status: 'partial'`.
  * Tombol "Lanjutkan": `GET /api/agents/:id/chat` mendeteksi pesan parsial dan mengembalikan `can_continue: true` serta menyertakan potongan parsial di riwayat. UI AgentSheetChat menampilkan banner dan tombol "Lanjutkan" interaktif.
  * Resilience offline/502: riwayat chat tetap dapat dibaca dari database lokal meskipun gateway sedang tidak dapat dihubungi.
- **Sistem Pengaturan Terpasang:**
  * Protokol **Phase-Gated & Memory Bank Development** aktif secara global dan per-proyek.
  * File workflow tersedia di `.agent/workflows/` (`create-prd.md`, `generate-tasks.md`, `process-task-list.md`, `memory-bank-rules.md`).
  * File panduan utama tersimpan di `.agent/rules.md` dan `AGENTS.md`.

---

## 2. Fokus & Prioritas Kerja Aktif
- Menjaga kepatuhan mutlak terhadap 3 Hukum Mutlak (Zero-Gap, Strict Single Sub-Task, Memory Sync).
- Prioritas berikutnya: **Fase 3 (Integrasi Profil: Dua Dunia Tersambung)** — pembuatan profil Hermes otomatis per agen dengan `SOUL.md`, sesi terisolasi antar agen, migrasi `011_agent_provisioning.sql`, dan route `POST /api/agents/:id/provision`.
- Menunggu konfirmasi user sebelum memulai Fase 3.

---

## 3. Keputusan Teknis Terbaru (Fase 2e)
- **Granular Real-Time Persistence:** Menggunakan `AgentChatRepository` untuk meng-insert user message dan assistant message di awal stream, lalu meng-update akumulasi teks per delta chunk.
- **Resilient Fallback History:** `GET /api/agents/:id/chat` memprioritaskan sesi gateway untuk keselarasan memori LLM, namun secara cerdas menyematkan potongan respon parsial lokal yang belum tersinkronkan ke gateway, serta melakukan fallback 100% ke database lokal jika gateway mengalami error HTTP 502 / network connection refused.
- **Deterministic Incomplete Message Query:** `getLastIncompleteMessage` memeriksa baris asisten paling baru (`ORDER BY created_at DESC, rowid DESC`), memastikan status `can_continue` bebas dari race condition sub-millisecond.

---

## 4. Invarian yang Harus Dijaga
1. Dilarang keras menyisipkan `// TODO`, `// ... rest of code`, atau fungsi kosong.
2. Setiap kali menulis endpoint baru atau tabel baru, wajib memperbarui `scripts/gap-check.ts` dan fixtures-nya agar status gap-check tetap hijau.
3. Seluruh string baru yang ditampilkan di UI wajib dimasukkan ke dictionary lokalisasi `en` dan `id`.
4. Kerjakan HANYA SATU sub-task dalam satu siklus, lalu berhenti untuk konfirmasi.
