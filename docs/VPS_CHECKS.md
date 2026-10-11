# VPS Checks — Panduan Verifikasi VPS untuk Owner

Dokumen ini berisi perintah yang dapat langsung di-copy-paste oleh Owner ke terminal SSH VPS.
Hasil outputnya cukup di-copy dan di-paste kembali ke chat untuk verifikasi sistem live Hermes.

> **Catatan Keamanan (Rule R11 & R6)**:
> - Asisten tidak akan menjalankan perintah langsung ke VPS Owner.
> - Jangan mengirimkan secret key atau token yang sensitif ke publik. Ganti token asli dengan `<TOKEN>` jika perlu saat menempelkan hasil.

---

## 1. Quick Check Status Hermes & Sistem

Jalankan blok perintah berikut di terminal VPS:

```bash
echo "=== 1. HERMES VERSION ==="
hermes --version || which hermes

echo "=== 2. HERMES PROFILES ==="
hermes profile list

echo "=== 3. PORT & LISTENER (DEFAULT 8642) ==="
ss -ltnp | grep 8642 || netstat -tulpn | grep 8642

echo "=== 4. DOCKER NETWORKS ==="
docker network ls

echo "=== 5. UFW FIREWALL STATUS ==="
sudo ufw status verbose || ufw status

echo "=== 6. RESOURCE MEMORY & DISK ==="
free -h
df -h
```

---

## 2. Tes Koneksi API Hermes & Auth Header

Gunakan API key yang dikonfigurasi pada file `~/.hermes/.env` atau `config.yaml`.
Jika belum tahu API key-nya, cek dengan:
```bash
grep -i "API_SERVER_KEY" ~/.hermes/.env 2>/dev/null || grep -A 5 "api_server" ~/.hermes/config.yaml 2>/dev/null
```

Setelah mendapatkan key (misal `HERMES_KEY`), jalankan:
```bash
export HERMES_KEY="masukkan_key_disini"

echo "=== CEK CAPABILITIES ==="
curl -s -i -H "Authorization: Bearer $HERMES_KEY" http://127.0.0.1:8642/v1/capabilities

echo ""
echo "=== CEK MODELS ==="
curl -s -i -H "Authorization: Bearer $HERMES_KEY" http://127.0.0.1:8642/v1/models
```

---

## 3. Capture Real Samples (POST /v1/runs & SSE /events)

Perintah ini akan menjalankan task sederhana dan merekam respon asli dari Hermes untuk dijadikan dataset parser sistem.

```bash
# 1. Jalankan run baru
RUN_RES=$(curl -s -X POST http://127.0.0.1:8642/v1/runs \
  -H "Authorization: Bearer $HERMES_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "Hitung 25 * 4 dan sebutkan hasilnya secara singkat."}')

echo "Hasil POST /v1/runs:"
echo "$RUN_RES"

# Ekstrak run_id dari JSON
RUN_ID=$(echo "$RUN_RES" | grep -o '"run_id":"[^"]*' | cut -d'"' -f4)
echo "Run ID terdeteksi: $RUN_ID"

# 2. Rekam event stream (SSE)
if [ -n "$RUN_ID" ]; then
  echo "Merekam SSE events untuk $RUN_ID selama 15 detik..."
  timeout 15s curl -N -s \
    -H "Authorization: Bearer $HERMES_KEY" \
    http://127.0.0.1:8642/v1/runs/$RUN_ID/events > sample_run_events.txt
  
  echo "Preview 30 baris pertama sample_run_events.txt:"
  head -n 30 sample_run_events.txt
fi
```

Isi file `sample_run_events.txt` dan respon `RUN_RES` dapat disalin ke chat agar asisten dapat menyimpannya ke `docs/samples/` sesuai Rule R3.

---

## 4. Jika Owner Belum Sempat Menjalankan di VPS

Sistem dirancang modular (`HERMES_MODE=mock|real`).
Jika Owner belum sempat menjalankan perintah di atas, Owner cukup mengetik:
`lanjut`
Maka pengerjaan akan berlanjut menggunakan mock server built-in, dan seluruh komponen integrasi Hermes ditandai `// TODO(verify)` sampai live data tersedia.
