# Panduan Deployment Coolify — Hermes Virtual Office

Dokumen ini adalah panduan langkah-demi-langkah bagi pemilik sistem (CEO/Owner) untuk melakukan deployment aplikasi **Hermes Virtual Office** di server VPS menggunakan platform **Coolify**.

---

## 1. Arsitektur & Topologi Jaringan

```text
[ Telegram App di HP ]
        │  (HTTPS aman / TLS)
        ▼
[ Reverse Proxy Coolify (Caddy/Traefik) ]  <-- Menangani Domain & SSL Otomatis
        │  (Port 3000 internal)
        ▼
[ Kontainer Docker: Hermes Virtual Office ]
        ├── Fastify Server (API & Static SPA Frontend)
        ├── Volume Persisten: /data/office.sqlite (Database SQLite WAL)
        └── Network Bridge: host.docker.internal:8642
                │
                ▼ (Hanya melalui jaringan internal loopback/docker0)
[ Hermes Gateway CLI di VPS Host (Port 8642) ]
```

> [!IMPORTANT]
> **Aturan Keamanan Krusial**: Hermes Agent berjalan di host VPS, **BUKAN** di dalam kontainer Docker. API port Hermes (`8642`) **TIDAK PERNAH** boleh dibuka ke internet publik — bind ke IP gateway jaringan Docker (`API_SERVER_HOST=172.16.1.1`), bukan `0.0.0.0`. Kontainer mengaksesnya lewat IP tersebut (lihat bagian 2C).

---

## 2. Persiapan di VPS Host (Hermes Gateway + API Server)

> [!IMPORTANT]
> Hermes menjalankan **dua** proses terpisah:
> 1. **Messaging gateway** (`hermes gateway run`) → melayani chat bot Telegram.
> 2. **API server** (`API_SERVER_ENABLED=true` di dalam gateway yang sama) → melayani endpoint `/v1/runs`, `/v1/capabilities`, `/v1/runs/{id}/events` yang dipakai mini app.
>
> Tanpa API server aktif, mini app tetap jalan tapi semua task gagal dengan `Hermes startRun error`. Port 8642 **tidak akan** ada di `ss -ltn` — itu tanda API server belum diaktifkan.

### A. Aktifkan API Server

Edit `~/.hermes/.env` di VPS host:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=<random-32-char>   # generate: openssl rand -hex 16
API_SERVER_HOST=172.16.1.1        # HANYA jaringan Docker Coolify — jangan 0.0.0.0
API_SERVER_PORT=8642
```

`API_SERVER_HOST=172.16.1.1` = gateway IP jaringan Docker `coolify`. Dengan nilai ini port 8642
hanya bisa diakses kontainer di jaringan itu, **bukan** dari internet publik.
(Ganti IP-nya jika `docker network inspect coolify` menunjukkan gateway lain.)

> [!WARNING]
> Jangan pakai `API_SERVER_HOST=0.0.0.0` selama `ufw status` masih `inactive` — port 8642
> akan terbuka ke publik di IP VPS.

### B. Jalankan Gateway sebagai Systemd Service

Gateway yang dimulai manual (`nohup`/`run`) mati saat server reboot.

```bash
hermes gateway install     # membuat unit systemd
hermes gateway restart
```

Verifikasi — harus mencetak `[API Server] API server listening on http://172.16.1.1:8642`:

```bash
ss -ltnp | grep 8642
curl -sS http://172.16.1.1:8642/health
```

### C. Catatan Jaringan Kontainer Coolify

Coolify **mengabaikan** `docker-compose.yml` di repo bila aplikasi memakai Build Pack
**Dockerfile** — file itu hanya untuk deployment `docker compose up` manual. Akibatnya
`extra_hosts: host.docker.internal:host-gateway` tidak ikut terpasang, dan
`http://host.docker.internal:8642` akan gagal dengan `Could not resolve host`.

Solusi: pakai IP gateway jaringan Coolify langsung di variabel lingkungan aplikasi:

```
HERMES_BASE_URL=http://172.16.1.1:8642
```

Server menolak start bila `HERMES_MODE=real` tetapi `HERMES_BASE_URL` masih localhost —
error ini muncul di log Coolify dan artinya variabel belum diganti.

---

## 3. Langkah Deployment di Coolify

### Langkah 1: Buat Aplikasi Baru di Dashboard Coolify
1. Buka dashboard Coolify Anda (`https://coolify.domain-anda.com`).
2. Masuk ke Project & Environment yang aktif.
3. Klik **+ Add Resource** -> **Application** -> **Public Repository** (atau Private Git).
4. Masukkan URL repositori GitHub proyek ini.
5. Pada pilihan **Build Pack**, pilih **Dockerfile**.

### Langkah 2: Konfigurasi Domain & SSL
1. Pada menu aplikasi Coolify, buka tab **General**.
2. Di kolom **Domains**, masukkan subdomain Anda, contoh: `https://office.perusahaan-anda.com`.
3. Coolify akan secara otomatis menerbitkan sertifikat SSL gratis (Let's Encrypt).

### Langkah 3: Konfigurasi Persistent Storage (Volume SQLite)
1. Buka tab **Storages** di Coolify.
2. Klik **+ Add Storage**.
3. Atur konfigurasi volume:
   - **Name**: `office-data`
   - **Destination Path**: `/data`
   - **Type**: Persistent Volume
4. Klik **Save**. Volume ini memastikan seluruh data agen, tugas, persetujuan, dan KPI tetap aman tersimpan saat kontainer di-restart atau di-update.

### Langkah 4: Jaringan Host (tidak perlu extra_hosts)

Build Pack **Dockerfile** di Coolify tidak memakai `docker-compose.yml` repo, jadi
`extra_hosts` tidak ikut terpasang. Lewati langkah ini — cukup isi
`HERMES_BASE_URL` dengan IP gateway jaringan Coolify (Langkah 5).
`host.docker.internal` hanya dipakai bila Anda deploy dengan `docker compose up` manual.

### Langkah 5: Masukkan Variabel Lingkungan (Environment Variables)
Buka tab **Environment Variables** di Coolify dan masukkan variabel berikut:

| Variabel | Contoh Nilai | Deskripsi |
|---|---|---|
| `NODE_ENV` | `production` | Mengaktifkan mode produksi (Rule S3 & C3f) |
| `PORT` | `3000` | Port internal kontainer |
| `HOST` | `0.0.0.0` | Binding internal server |
| `DB_PATH` | `/data/office.sqlite` | Lokasi database di volume persisten |
| `TELEGRAM_BOT_TOKEN` | `7123456789:AA...` | Token bot dari @BotFather |
| `OWNER_TELEGRAM_IDS` | `123456789,987654321` | ID Telegram CEO yang berhak mengakses |
| `OWNER_EMAILS` | `dhiko.h@gmail.com` | Email pemilik untuk autentikasi Cloudflare Access di web biasa |
| `APP_URL` | `https://t.me/NamaBot/office` | Link Mini App Telegram Anda |
| `HERMES_MODE` | `real` | Mode produksi riil terhubung ke Hermes |
| `HERMES_BASE_URL` | `http://172.16.1.1:8642` | IP gateway jaringan `coolify` + port API server Hermes (lihat bagian 2C) |
| `HERMES_KEY_DEFAULT` | *(sama persis dengan `API_SERVER_KEY`)* | Bearer key API server Hermes. Server menolak start bila masih placeholder |
| `HERMES_TIMEOUT_MS` | `30000` | Batas waktu permintaan **pendek** ke Hermes: probe, health, daftar model, status run (default 30000) |
| `HERMES_CHAT_TTFB_MS` | `60000` | Batas tunggu event/huruf **pertama** dari stream chat. Terlalu pendek memutus model yang lambat tapi masih jalan (default 60000) |
| `HERMES_CHAT_TIMEOUT_MS` | `300000` | Batas **total** satu giliran chat — sengaja jauh lebih besar dari `HERMES_TIMEOUT_MS`, karena jawaban yang memanggil tool bisa berjalan beberapa menit (default 300000) |
| `MEDIA_DIR` | `/data/media` | Folder media chat & artefak di volume persisten. **Kosongkan** = otomatis `<folder DB_PATH>/media` (mis. `/data/media`) |
| `MEDIA_IMAGE_RETENTION_DAYS` | `7` | Retensi gambar chat (hari). `0` = tidak pernah dihapus berdasar umur |
| `MEDIA_ARTIFACT_RETENTION_DAYS` | `30` | Retensi artefak agent, mis. video/gambar hasil run (hari). `0` = nonaktif |
| `MEDIA_CAP_MB` | `500` | Batas total seluruh media dalam MB; melebihi ini yang **paling tua** dihapus dulu. `0` = tanpa cap |
| `MEDIA_UPLOAD_MAX_MB` | `8` | Batas ukuran satu unggahan (di atas ini server menjawab `413`) |
| `MEDIA_SWEEP_INTERVAL_MIN` | `60` | Interval pembersih retensi otomatis dalam menit (jalan juga sekali saat start) |
| `MEDIA_SWEEP_DISABLED` | `0` | `1` = hentikan pembersih retensi otomatis (hanya untuk debugging) |
| `DEV_AUTH_BYPASS` | `0` | **Wajib 0** di produksi (Rule S3) |

Klik **Save**.

### Langkah 6: Klik Deploy
Klik tombol **Deploy** di pojok kanan atas Coolify. Pantau log build:
1. Stage 1 membangun frontend React Vite SPA ke folder `apps/web/dist`.
2. Stage 2 menginstal server Fastify, SQLite, dan mengintegrasikan bundle frontend.
3. Health check `/api/health` akan memverifikasi kontainer dalam status `healthy`.

---

## 4. Konfigurasi Bot Telegram via @BotFather

1. Buka Telegram dan kirim pesan ke **@BotFather**.
2. Buat bot baru jika belum ada: kirim `/newbot` dan ikuti instruksi nama bot.
3. Simpan **Bot Token** yang diberikan ke variabel `TELEGRAM_BOT_TOKEN`.
4. Buat Telegram Mini App baru:
   - Kirim `/newapp`.
   - Pilih bot Anda.
   - Masukkan judul aplikasi: `Hermes Virtual Office`.
   - Masukkan deskripsi singkat: `Virtual Office AI Command Center`.
   - Masukkan URL aplikasi: `https://office.perusahaan-anda.com` (domain Coolify Anda).
   - Masukkan short name aplikasi: contoh `office`.
5. Atur Menu Button agar tombol "Virtual Office" muncul di sudut kiri bawah chat:
   - Kirim `/setmenubutton`.
   - Pilih bot Anda.
   - Masukkan URL Web App: `https://office.perusahaan-anda.com`.
   - Masukkan teks tombol: `🏢 Virtual Office`.

---

## 5. Prosedur Beralih dari Mock ke Real (Go-Live Checklist)

- [ ] Pastikan Hermes CLI di VPS host memiliki minimal satu profile: `hermes profile list`.
- [ ] Pastikan gateway Hermes aktif: `curl http://127.0.0.1:8642/health` mengembalikan `status: ok`.
- [ ] Di Coolify, set `HERMES_MODE=real`.
- [ ] Pastikan `DEV_AUTH_BYPASS=0` (Server otomatis menolak start jika bypass aktif di production).
- [ ] Buka bot Telegram di ponsel, klik tombol **🏢 Virtual Office**, dan verifikasi avatar departemen muncul di layar kantor virtual.

---

## 6. Pemecahan Masalah (Troubleshooting)

- **Log Kontainer**: Buka tab **Logs** di Coolify untuk melihat aktivitas server Fastify secara real-time.
- **Error 401 Unauthorized**: Pastikan Anda membuka Mini App dari Telegram resmi dengan akun pemilik. Token kedaluwarsa setelah 3600 detik jika Mini App dibiarkan terbuka terlalu lama di background.
- **Error 403 Forbidden**: Telegram ID akun Anda belum terdaftar di `OWNER_TELEGRAM_IDS`. Cari ID Telegram Anda via bot `@userinfobot` lalu tambahkan di Coolify.
- **Error 502 / Offline**: Hermes Gateway di host belum berjalan atau firewall memblokir port 8642. Jalankan `sudo ufw status` di terminal VPS.
