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
> **Aturan Keamanan Krusial**: Hermes Agent berjalan di host VPS, **BUKAN** di dalam kontainer Docker. API port Hermes (`8642`) **TIDAK PERNAH** boleh dibuka ke internet publik. Kontainer mengaksesnya melalui jembatan jaringan internal `host.docker.internal`.

---

## 2. Persiapan di VPS Host (Hermes Gateway)

Jalankan perintah berikut di terminal VPS Host:

### A. Pastikan Hermes Berjalan pada Interface Internal
Hermes gateway secara default mendengarkan di `127.0.0.1:8642`. Agar dapat diakses kontainer Docker, pastikan port terbuka untuk subnet Docker:
```bash
# Cek apakah Hermes sedang berjalan
ss -ltnp | grep 8642

# Jika menggunakan UFW firewall, izinkan akses hanya dari interface Docker:
sudo ufw allow in on docker0 to any port 8642 proto tcp
```

### B. Mulai Hermes Gateway di Host (Background / Systemd)
```bash
# Mulai gateway di background (atau gunakan systemd service)
nohup hermes gateway --port 8642 > ~/.hermes/gateway.log 2>&1 &
```

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

### Langkah 4: Konfigurasi Jaringan Host (Docker Extra Hosts)
1. Buka tab **Docker Compose** atau **Custom Docker Run Options** di Coolify.
2. Tambahkan host gateway argument:
   ```yaml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```

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
| `APP_URL` | `https://t.me/NamaBot/office` | Link Mini App Telegram Anda |
| `HERMES_MODE` | `real` | Mode produksi riil terhubung ke Hermes |
| `HERMES_BASE_URL` | `http://host.docker.internal:8642` | URL gateway Hermes di VPS host |
| `HERMES_KEY_DEFAULT` | `hermes_secret_token` | Token otentikasi Bearer Hermes API |
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
