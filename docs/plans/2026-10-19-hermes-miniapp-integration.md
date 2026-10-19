# Integrasi Hermes ↔ Mini App — Rencana Implementasi

> **Untuk Claude:** Eksekusi plan ini task-by-task dengan `executing-plans`. Setiap fase
> memakai branch sendiri. Jangan kerjakan dua fase dalam satu branch.

**Goal:** Menyambungkan dua dunia yang sekarang terpisah — tabel `agents` di aplikasi
(nama, role, soul_summary, skills) dan profil/gateway Hermes (yang sesungguhnya menjawab) —
lalu membuat chat andal, terlihat, dan siap bermigrasi antar server.

**Architecture:** Aplikasi tetap sebagai satu-satunya pemilik data agen (SQLite). Hermes
tetap sebagai satu-satunya otak. Jembatannya adalah teks yang aplikasi kirim ke gateway:
identitas agen sebagai system prompt, ditambah jalur Runs API yang persisten sehingga
percakapan tidak mati saat koneksi putus.

**Tech Stack:** Fastify + TypeScript, SQLite (better-sqlite3), SSE, Zod, Vitest.
Server berjalan di Docker (Coolify), gateway Hermes di host `172.16.1.1:8642`.

**Tanggal:** 2026-10-19 · **Status:** menunggu persetujuan sebelum eksekusi

---

## Peta Temuan (bukti yang mendasari rencana ini)

Semua di bawah ini sudah diverifikasi, bukan asumsi.

| # | Temuan | Bukti |
|---|---|---|
| 1 | Identitas agen **tidak pernah dikirim** ke Hermes | `services/hermes/skill-scope.ts:4-15` menulis terus terang: gateway tidak punya sakelar per agen, "satu-satunya tuas yang benar-benar dimiliki aplikasi adalah teks yang DIKIRIM aplikasi ke gateway" |
| 2 | Akibatnya: agen tidak mengenali namanya sendiri | Screenshot: kartu menulis "Bagas · Distributor Prospecting & Marketing", balasan bertanya "Bagas ini orang di proyek mana?" |
| 3 | **Satu gateway, satu profil** untuk semua agen | `hermes gateway list` → `✓ default (current) — PID 785`; `hermes profile list` → hanya `◆default` |
| 4 | Gateway **menerima** system prompt di jalur sesi | `api_server.py:3370` `system_prompt = body.get("system_message") or body.get("instructions")` dalam `_prepare_session_chat` |
| 5 | Jalur stateless mendukung `role: "system"` asli | catatan `skill-scope.ts:14` |
| 6 | Aplikasi sudah memakai Runs API untuk hal lain | `real.client.ts:92` `POST /v1/runs`; `routes/reports.ts:71` `client.startRun()`; `services/dispatcher.ts:207` recover via `GET /v1/runs/{id}` |
| 7 | Tapi jalur **chat** masih memakai stream sesi/completions | `routes/agents.ts:607` → `client.chatStream()` → `real.client.ts:383` (`/api/sessions/{id}/chat/stream`) atau `:249` (`/v1/chat/completions`) |
| 8 | Migrasi terakhir = `009` | `db/migrations/009_media_task_artifact_index.sql` |

---

## Urutan Fase

Dipesan menurut rasa sakit, bukan menurut alfabet.

```
Fase 1  Jembatan Identitas        kecil, hari ini, memperbaiki yang sedang rusak
Fase 2  Reliabilitas Chat         penyebab langsung 3 turn gagal & balasan terpotong
Fase 3  Integrasi Profil          "dua dunia tersambung" secara permanen
Fase 4  Task & Run Visibility     baru setelah Fase 2 stabil
Fase 5  UI — List Cron + FAV      pengalaman pemakaian harian
Fase 6  Skill Auto-Install        ketahanan migrasi antar server
```

**Dependensi:** Fase 1 lepas sendiri. Fase 3 dibangun di atas Fase 1 (identitas yang
dikirim berasal dari profil, bukan dari kolom bebas). Fase 4 membutuhkan Fase 2 (tanpa
Runs API persisten, task tidak punya `run_id`). Fase 5 dan 6 lepas dari semua.

---

## FASE 1 — Jembatan Identitas Agen

**Mengapa duluan:** ini yang sedang rusak sekarang. Perubahan kecil, dampak langsung terlihat.

**Goal:** Agen tahu namanya sendiri — nama, peran, ruang lingkup kerja — pada giliran chat
pertama tanpa harus diketik ulang tiap pesan.

**Files:**

- Create: `apps/server/src/services/hermes/identity.ts`
- Create: `apps/server/src/services/hermes/identity.test.ts`
- Modify: `apps/server/src/services/hermes/real.client.ts:228-250` — `chatStream()` menerima
  parameter `systemPrompt`
- Modify: `apps/server/src/routes/agents.ts:607` — membangun identitas lalu meneruskannya

**Langkah:**

1. Tulis test gagal: `buildAgentIdentity(agent)` menghasilkan teks berisi `name`,
   `role`, dan `department` dari record agen; menghasilkan `null` kalau `name` kosong.
2. Jalankan — **FAIL**, fungsi belum ada.
3. Tulis `identity.ts` minimal.
4. Jalankan — **PASS**.
5. Terapkan ke kedua jalur `chatStream()`:
   - jalur sesi → `body.system_message`
   - jalur stateless → `unshift({ role: 'system', content })` ke `messages`
6. Test integrasi: pastikan identitas ikut terkirim pada kedua jalur.
7. Commit: `feat(tahap-20): agen tahu identitasnya sendiri`

**Keputusan saya (bukan persetujuan Anda):** identitas dikirim **hanya bila** `name` atau
`role` terisi. Agen tanpa identitas tetap bersikap seperti sebelumnya. Ini mencegah
menambah system prompt kosong ke percakapan yang sudah berjalan.

**Kriteria selesai:** chat dengan Bagas, tanya "siapa kamu?", jawab menyebut Bagas dan
perannya. Bukan "saya asisten", dan bukan bertanya siapa Bagas.

**Risiko:** menimpa instruksi yang sudah ada. Saat ini tidak ada yang tertimpa karena
semua agen memakai profil `default` tanpa `SOUL.md` (temuan #3). Fase 3 yang akan
mengambil alih ini secara permanen.

---

## FASE 2 — Reliabilitas Chat

**Mengapa kedua:** ini penyebab langsung pengalaman rusak. Heartbeat 10 detik adalah
perbaikan paling murah dengan dampak paling besar, jadi dikerjakan lebih dulu dari
seluruh Bagian B.

**Goal:** Balasan tidak pernah terpotong diam-diam. Menutup panel tidak membatalkan
pekerjaan. Pesan beruntun diproses berurutan.

**Sub-tahap, dikerjakan dan di-commit terpisah:**

**2a. Heartbeat SSE** — paling murah, dampak paling besar
- Modify: route chat — kirim frame komentar `: hb\n\n` tiap 10 detik, termasuk saat
  menunggu tool. Clear interval di `finally`.
- Verify: tool berjalan 120 detik → stream tetap hidup (bukti di log).
- Ini mencegah Cloudflare memutus koneksi idle di ~100 detik.

**2b. Runs API + reattach**
- Modify: `services/hermes/real.client.ts` — jalur chat pindah ke `POST /v1/runs` +
  stream `/v1/runs/:runId/events`.
- Modify: `routes/agents.ts` — `GET /api/agents/:id/runs/:runId/stream` (replay
  `run_events` dari awal, lanjut live).
- Modify: `services/dispatcher.ts` — run tidak dibatalkan saat klien putus.
- Jalur `/api/sessions/:id/chat/stream` dipertahankan sebagai fallback.

**2c. Antrian per agen**
- Create: `services/agent-chat/queue.ts` — 1 run aktif, sisanya FIFO, maks 5.
- Test: unit FIFO, dan "3 pesan beruntun diproses berurutan".

**2d. Idempotensi + deteksi stall**
- `client_message_id` wajib; duplikat diabaikan.
- 45 detik tanpa event → kirim status "agen sedang menjalankan tool", lalu retry sekali
  dengan model fallback. Jangan pernah menutup stream diam-diam.

**2e. Persist parsial**
- Migrasi `010_agent_chat.sql`: `agent_messages` + `agent_runs`.
- Setiap chunk tersimpan; run gagal → `status: failed` + `error_reason`, isi parsial
  tetap ada + tombol Lanjutkan.

**Timeout yang jangan diturunkan:** `HERMES_TIMEOUT_MS=30000`, `HERMES_CHAT_TTFB_MS=60000`,
`HERMES_CHAT_TIMEOUT_MS=300000`, heartbeat `10000`, stall `45000`.

**Regresi wajib:** (a) tutup panel saat run berjalan → buka lagi, balasan utuh;
(b) 3 pesan beruntun 5 detik → berurutan; (c) tool 120 detik → tidak putus;
(d) balasan 20.000 karakter → utuh; (e) provider lambat 50 detik → retry, bukan mati.

---

## FASE 3 — Integrasi Profil (dua dunia tersambung)

**Mengapa ketiga:** setelah Fase 1 membuktikan identitas bekerja, Fase 3 membuatnya
permanen dan benar — setiap agen memakai profilnya sendiri, sesinya terisolasi.

**Goal:** Hire agen → profil Hermes dibuat otomatis dengan `SOUL.md` berisi identitasnya,
skills sesuai pilihan, sesi terpisah antar agen.

**Keputusan saya — versi lebih ringan dari Bagian A di spec Anda:**

Saya **tidak** membangun service systemd terpisah dengan `X-Provision-Token`,
AES-256-GCM, dan rotasi key sebagai langkah pertama. Alasannya: keluhan nyata hanya satu
— *agen tidak tahu dia siapa*. Mengamankan jalur provisioning sebelum jalurnya terbukti
berhasil menambah permukaan yang harus dipelihara tanpa menyelesaikan apa pun hari ini.

Yang saya bangun: route internal `POST /api/agents/:id/provision` yang memanggil Hermes
lewat `execFile` (bukan shell string), idempoten, dengan state di kolom baru
`agents.provision_state`. Audit log tetap, tetapi sebagai tabel biasa dulu.

Kalau nanti butuh isolasi profil sungguhan dengan key per-agen, baru service terpisah
naik sebagai fase lanjutan. Bukan dihapus — ditunda sampai jalurnya teruji.

**Files:**
- Create: `db/migrations/010_agent_provisioning.sql`
- Create: `services/hermes/provisioner.ts`
- Modify: `routes/agents.ts` — `POST /api/agents/:id/provision`
- Modify: `routes/hiring.ts` — insert agen → provision otomatis

**Langkah:**
1. Migrasi: `provision_state`, `provision_error`, `provisioned_at`.
2. Test gagal → implement provisioner → pass.
3. Verifikasi topologi gateway sebelum melangkah: `hermes gateway list`,
   `hermes -p <profile> gateway status`. Catat hasilnya — **jangan berasumsi** apakah
   satu gateway melayani banyak profil atau tiap profil punya gateway sendiri.
4. Smoke test `/v1/chat/completions` prompt "ping", timeout 90 detik.
5. Backfill: `npm run provision:backfill -- --dry-run`, lalu jalankan sungguhan.

**Kriteria selesai:** hire agen → `hermes profile list` menampilkan profilnya, state
`ready` ≤ 10 detik, sesi terisolasi, provision ulang idempoten.

---

## FASE 4 — Task & Run Visibility

**Goal:** Setiap pekerjaan agen yang memakai tool tercatat sebagai task dan tampil di UI.

**Langkah:**
1. Migrasi `011_tasks_visibility.sql` bila skema `tasks` kurang kolom.
2. Materialisasi: turn chat dengan ≥ 1 tool call → buat `tasks` (status `running`,
   `run_id`, `agent_id`) → update `done`/`failed`.
3. Backfill sesi lama (Orion, Aura) — di VPS sekarang juga ada Bagas.
4. UI Tasks: tampilkan sumber (chat/task) + status; klik task → `run_events`.
5. Obrolan tanpa tool/intent **tidak** dibuatkan task.

**Kriteria selesai:** `tasks = 0` padahal ada 13 tool call tidak terjadi lagi.

---

## FASE 5 — UI: List Cron + FAV Messenger

**Goal:** Jadwal tiap agen terlihat di aplikasi, dan satu tombol membuka daftar agen
seperti chat list Messenger.

**5a. List cron**
- Create: `routes/cron.ts` — `GET /api/cron` yang menerus ke gateway `GET /api/jobs`.
- Maping: `job.skills[0]` → agen, agar jadwal tampil per agen.
- UI: tab atau kartu ringkas (nama job, ekspresi cron, display WIB, state, `last_status`).

**5b. FAV Messenger**
- `GET /api/agents` sudah ada → dipakai langsung, **tanpa endpoint baru**.
- Preview pesan terakhir diambil dari pesan terakhir tiap agen.
- Layout: daftar di kiri (avatar, nama, preview, jam, badge), area chat di kanan,
  FAB di bawah membuka daftar agent.

**Keputusan saya:** FAB membuka **daftar agen saja**, bukan daftar agen + riwayat sesi.
Alasannya menjaga tampilan tetap setara chat list. Kalau tiap agen boleh punya banyak
baris sesi, struktur `sessions` yang sekarang tidak tampil di UI ikut berubah — itu
pekerjaan tambahan yang tidak Anda minta.

---

## FASE 6 — Skill Auto-Install

**Migrasi-proof:** kalau aplikasi dipasang di server baru, skill yang dibutuhkan tiap
agen terpasang sendiri.

**Goal:** Perbandingan `agent_skills` (yang dibutuhkan) dengan `/v1/skills` (yang terpasang)
menghasilkan daftar kurang; kalau ada isinya, aplikasi memasang sendiri.

**Keputusan saya — sumber skill:** katalog skill disimpan **di dalam repo ini**.
Alasannya: `prospecting`, `marketing-plan`, `brand`, `sales-enablement` adalah milik Anda,
bukan bagian dari instalasi Hermes. Menaruhnya di repo membuatnya ikut bermigrasi bersama
aplikasinya, tanpa bergantung pada komputer lokal Anda.

**Catatan jujur:** saya belum mengetahui apakah gateway Hermes menyediakan endpoint untuk
**memasang** skill, atau hanya membacanya (`GET /v1/skills`). Kalau tidak ada endpoint
pemasangan, jalurnya harus lewat SSH — dan itu perlu dibuktikan, bukan diasumsikan.
Fase ini dimulai dengan menjawab pertanyaan itu.

---

## Yang Saya Putuskan Sendiri

| Keputusan | Alasan |
|---|---|
| Fase 1 dulu, bukan provisioner penuh | Keluhan nyata satu hal; jalurnya perlu terbukti sebelum diamankan |
| Identitas dikirim hanya bila `name`/`role` terisi | Mencegah system prompt kosong masuk ke percakapan berjalan |
| FAB membuka daftar agen saja | Menjaga tampilan setara chat list tanpa mengubah struktur `sessions` |
| Katalog skill di repo | Skill adalah milik Anda; ikut bermigrasi bersama aplikasi |
| Service systemd provisioning ditunda | Permukaan keamanan besar untuk masalah yang belum terbukti butuh itu |

## Yang Belum Saya Ketahui

1. Apakah satu gateway Hermes melayani banyak profil, atau tiap profil punya gateway
   sendiri. **Diverifikasi di Fase 3 langkah 3** — bukan diasumsikan.
2. Apakah gateway punya endpoint memasang skill. **Diverifikasi di Fase 6**.
3. Apakah `system_message` dijalur sesi menimpa `SOUL.md` atau menambah. Saat ini tidak
   relevan karena tidak ada `SOUL.md`; menjadi relevan di Fase 3.
