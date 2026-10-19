# Konfigurasi Sub-Agent Marketing di VPS

Catatan rekonstruksi. Semua yang di bawah ini **berada di server, bukan di repo** — kalau VPS
hilang atau ganti, harus dibangun ulang dari dokumen ini.

Ditulis 2026-10-19. Tidak ada rahasia di sini: API key dan bot token tidak pernah dicatat
di repo ini.

---

## Gambaran jalurnya

```
08:00 WIB   cron VPS (job 0f2cec510461)  →  agent baca /root/.hermes/marketing/bentocat.md
                                            →  tulis laporan ke /root/.hermes/cron/output/
08:08 WIB   cron VPS (job 3f156736fd65)  →  jalankan send_report.py
                                            →  kirim laporan ke chat admin via Bot API
kapan saja  admin  →  chat manual ke prospek dari HP sendiri
```

**Bot tidak pernah mengirim ke calon pelanggan.** Admin hanya menerima paket kerja
(maximal 3 prospek + 1 draft pesan) lalu memutuskan sendiri siapa yang dihubungi.

---

## Komponen di server

| Komponen | Lokasi / nilai |
|---|---|
| Server | `root@76.13.23.78` (`srv1303959`), key `~/.ssh/id_ed25519` |
| Gateway | `hermes-gateway.service`, `172.16.1.1:8642`, auth dari `API_SERVER_KEY` di `/root/.hermes/.env` |
| Skill marketing | `/root/.hermes/skills/{prospecting,marketing-plan,brand,sales-enablement}/` (59 skill total) |
| Sub-agent | tabel `agents` di `/data/office.sqlite`, id `agent_bagas_7kq2m9xd`, department `marketing` |
| Skill sub-agent | tabel `agent_skills`, 4 baris menempel ke Bagas |
| Konteks produk | `/root/.hermes/marketing/bentocat.md` |
| Log cooldown kontak | `/root/.hermes/marketing/contact-log.csv` |
| Script pengirim | `/root/.hermes/marketing/send_report.py` |
| Rahasia Telegram | `/root/.hermes/marketing/telegram.env` (chmod 600, **tidak masuk repo**) |
| Penanda anti-spam | `/root/.hermes/marketing/.last_sent` |
| Output laporan | `/root/.hermes/cron/output/<job_id>/` |

## Langkah membangun ulang

1. **Skill** — salin 4 folder dari komputer lokal:
   `tar czf - prospecting marketing-plan brand sales-enablement | ssh root@… 'cd /root/.hermes/skills && tar xzf -'`
   Verifikasi `GET /v1/skills` naik dari 51 ke 59. Tidak perlu restart gateway.
2. **Sub-agent** — INSERT satu baris ke tabel `agents` (kolom: `id, name, role, department,
   avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at,
   created_at, model, session_id, is_system, avatar_style`). Salin pola dari baris `agent_aura_mv6sq76w`.
   Lalu INSERT 4 baris ke `agent_skills`.
3. **Konteks produk & log** — buat `bentocat.md` dan `contact-log.csv` (header
   `tanggal,kota,nama_usaha,kontak,pemilik,status`).
4. **Script pengirim** — `send_report.py`; baca `telegram.env` berisi
   `TELEGRAM_BOT_TOKEN` dan `OWNER_TELEGRAM_IDS` (keduanya diambil dari container mini app
   dengan `docker exec printenv`, tanpa pernah dicetak).
5. **Cron** — `POST /api/jobs` dua kali (lihat bagian ID).

---

## Job cron

| ID | Nama | Jadwal (WIB) | Tugas |
|---|---|---|---|
| `0f2cec510461` | prospek-harian-bentocat | 08:00 | agent membuat laporan, skill `prospecting` + `marketing-plan` |
| `3f156736fd65` | kirim-laporan-telegram | 08:08 | menjalankan `send_report.py` |

Endpoint: `GET/POST /api/jobs`, `GET/PATCH/DELETE /api/jobs/{id}`,
`POST /api/jobs/{id}/run`, `/pause`, `/resume`.

---

## Batasan yang sudah diketahui

- **`POST /api/jobs` tidak menerima field `script` dan `no_agent`** — kedua field itu ada di
  `cron.jobs.create_job()` (Python) dan diizinkan oleh scheduler, tetapi handler HTTP
  `_handle_create_job` tidak meneruskannya, dan `_UPDATE_ALLOWED_FIELDS` juga tidak
  memuatnya. Akibatnya job `no_agent` (script-only, tanpa model) **tidak bisa dibuat lewat API**.
  Rencana hemat token ini tertunda sampai field itu diteruskan handler.
- Karena itu job pengirim memakai agent biasa yang hanya diminta menjalankan script —
  dia tidak pernah membaca token, token dibaca oleh script.
- Gateway tidak punya adapter Telegram (hanya `qqbot`), sehingga pengiriman dilakukan
  VPS langsung ke Bot API, bukan lewat mini app.
- Mini app tidak diubah sama sekali oleh pekerjaan ini.

## Belum selesai

- Uji chat sub-agent Bagas dari UI (belum pernah ada sesi chat).
- Isian `bentocat.md`: harga per truk per kota, kapasitas 1 truk, roadmap kota berikutnya,
  tabel prospek terverifikasi. Harga **bukan angka global** — tiap distributor disepakati
  sendiri.
- Aturan cooldown 1 bulan sudah ditulis di konteks, tetapi belum ada prospek yang tercatat
  di `contact-log.csv` sehingga aturannya belum pernah teruji dengan data nyata.
