# Active Context: Hermes Virtual Office

## 1. Status Saat Ini
- **Fase Terakhir Diselesaikan:** **Fase 2d (Idempotensi + Deteksi Stall Chat)** — Selesai & Terverifikasi penuh per 2026-10-20.
- **Kondisi Kesehatan Sistem:**
  * `npm run typecheck`: **PASS (100%)** — 0 errors di seluruh workspace.
  * `npm run gap-check`: **PASS (8/8 Checks)** — Phase 19 meets all 8 completeness criteria (C3a - C3h).
  * `npm test`: Suite pengujian aktif dan stabil (**874 tests passed across 83 test files**).
- **Fitur Baru Fase 2d:**
  * `client_message_id` wajib pada setiap giliran chat baru. Request duplikat otomatis di-deduplikasi dan tersambung ke run yang sama (idempoten in-memory + database SQLite `run_events`).
  * Deteksi stall 45 detik (`chatStallMs`, default 45s): frame status `tool_running` diinjeksikan saat gateway lama memproses tool, diikuti retry tunggal otomatis ke model fallback (`resolveFallbackModel`).
  * Sinkronisasi `seq` database `run_events` dan memory `chatRunHub` 100% konsisten.
- **Sistem Pengaturan Terpasang:**
  * Protokol **Phase-Gated & Memory Bank Development** aktif secara global dan per-proyek.
  * File workflow tersedia di `.agent/workflows/` (`create-prd.md`, `generate-tasks.md`, `process-task-list.md`, `memory-bank-rules.md`).
  * File panduan utama tersimpan di `.agent/rules.md` dan `AGENTS.md`.

---

## 2. Fokus & Prioritas Kerja Aktif
- Menjaga kepatuhan mutlak terhadap 3 Hukum Mutlak (Zero-Gap, Strict Single Sub-Task, Memory Sync).
- Prioritas berikutnya: **Fase 2e (Persist Parsial)** — menyimpan chunk obrolan parsial (`agent_messages` / `agent_runs`) ke database agar pesan tidak hilang dan tombol "Lanjutkan" berfungsi saat run terpotong.
- Menunggu konfirmasi user sebelum memulai Fase 2e.

---

## 3. Keputusan Teknis Terbaru (Fase 2d)
- **Chat Idempotency Hub:** `ChatIdempotencyHub` melacak pasangan `agentId:clientMessageId` dengan `runIdPromise` deferred. Request kedua yang tiba bersamaan akan menunggu `run_id` dari request pertama tanpa menjalankan gateway ganda.
- **Stall & Model Fallback:** Jeda streaming >45 detik memicu status frame `tool_running` ke SSE klien ("agen sedang menjalankan tool"), membatalkan request gateway via `AbortController`, lalu retry 1x dengan model alternatif yang ditentukan via `HERMES_FALLBACK_MODEL` atau model gateway yang tersedia.
- **Stream Sequence Alignment:** `getRunEventsFromDb` menyaring `type != 'run.started'` saat merekonstruksi replay stream, memastikan urutan `seq` 1:1 identik dengan `chatRunHub`.

---

## 4. Invarian yang Harus Dijaga
1. Dilarang keras menyisipkan `// TODO`, `// ... rest of code`, atau fungsi kosong.
2. Setiap kali menulis endpoint baru atau tabel baru, wajib memperbarui `scripts/gap-check.ts` dan fixtures-nya agar status gap-check tetap hijau.
3. Seluruh string baru yang ditampilkan di UI wajib dimasukkan ke dictionary lokalisasi `en` dan `id`.
4. Kerjakan HANYA SATU sub-task dalam satu siklus, lalu berhenti untuk konfirmasi.
