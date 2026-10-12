# Skrip Pengujian Manual Ponsel (20-Step CEO Verification)

Dokumen ini adalah skrip pengujian manual langkah-demi-langkah bagi CEO/Pemilik Kantor Virtual untuk memvalidasi seluruh fungsionalitas **Hermes Virtual Office** langsung dari aplikasi Telegram di ponsel Anda.

---

## Prasyarat Pengujian
- Ponsel pintar dengan aplikasi Telegram versi terbaru (iOS atau Android).
- Akun Telegram yang terdaftar di variabel `OWNER_TELEGRAM_IDS`.
- Bot Telegram telah dikonfigurasi dengan Mini App URL.

---

## Daftar 20 Langkah Pengujian

### Bagian 1: Autentikasi & Navigasi Kantor Virtual
1. **Langkah 1: Membuka Aplikasi**
   - Buka chat dengan bot Telegram kantor virtual Anda.
   - Ketuk tombol **🏢 Virtual Office** di pojok kiri bawah layar chat.
   - *Ekspektasi*: Aplikasi terbuka full-screen (WebView TMA), transisi halus, tidak ada error jaringan.
2. **Langkah 2: Pemeriksaan Autentikasi & HUD Pimpinan**
   - Perhatikan bagian Header (HUD) paling atas: foto/nama CEO Anda muncul dengan badge hijau `ONLINE`.
   - *Ekspektasi*: Metrik ringkasan menampilkan jumlah tugas aktif, antrean persetujuan, dan ticker status real-time.
3. **Langkah 3: Eksplorasi Denah Lantai 2D (Office Map)**
   - Gulir atau amati denah lantai futuristik bernuansa neon gelap.
   - Amati 8 ruangan departemen (Command, Social, Sales, Finance, Marketing, Analytics, Support, HR) serta Lounge santai di tengah.
   - *Ekspektasi*: Avatar agen muncul di ruangan masing-masing dengan cincin status glowing.
4. **Langkah 4: Pemeriksaan Status & Gerakan Agen**
   - Agen yang sedang menganggur (*idle*) berada di area Lounge dengan animasi napas santai.
   - Agen yang sedang berpikir/bekerja berada di meja kerja departemen masing-masing.
   - *Ekspektasi*: Indikator visual sesuai dengan status operasional agen.

### Bagian 2: Agent Sheet & Percakapan Interaktif
5. **Langkah 5: Membuka Agent Sheet**
   - Ketuk salah satu avatar agen di denah kantor (contoh: agen departemen Sales atau Command).
   - *Ekspektasi*: Bottom sheet laci meluncur naik dari bawah dengan 4 tab: *Chat*, *Aktivitas*, *Tugas*, *Profil*.
6. **Langkah 6: Uji Coba Chat Streaming Real-time**
   - Buka tab **Chat**. Ketik pesan instruksi atau pilih salah satu chip rekomendasi prompt cepat.
   - Ketuk tombol kirim.
   - *Ekspektasi*: Agen merespons dengan teks streaming per kata secara instan didukung haptic feedback.
7. **Langkah 7: Pemeriksaan Riwayat Aktivitas & Tool Progress**
   - Buka tab **Aktivitas**.
   - *Ekspektasi*: Menampilkan riwayat pemanggilan tool terbaru dengan tag durasi dan status penyelesaian.
8. **Langkah 8: Pemeriksaan Tab Profil & Uji Koneksi Gateway**
   - Buka tab **Profil**. Periksa ringkasan kepribadian (SOUL) dan misi agen.
   - Ketuk tombol **Uji Koneksi**.
   - *Ekspektasi*: Muncul indikator sukses hijau yang menandakan gateway Hermes merespons cepat. Tutup sheet dengan menggeser ke bawah.

### Bagian 3: Manajemen Tugas & Persetujuan Kritis (Inbox)
9. **Langkah 9: Membuat Tugas Baru di Tab Tasks**
   - Ketuk tab **Tugas** (Tasks) di navigasi bawah.
   - Amati 4 kolom Kanban: *Backlog*, *Sedang Berjalan*, *Perlu Persetujuan*, *Selesai*.
   - Ketuk tombol **+ Buat Tugas Baru**. Masukkan judul tugas (contoh: "Alokasi anggaran promosi kuartalan"), pilih agen, dan set prioritas *Mendesak*. Simpan.
   - *Ekspektasi*: Kartu tugas baru muncul di kolom *Backlog*.
10. **Langkah 10: Menjalankan Tugas ("Jalankan Sekarang")**
    - Ketuk kartu tugas tadi, lalu ketuk tombol **Jalankan Sekarang**.
    - *Ekspektasi*: Kartu tugas berpindah secara animasi ke kolom *Sedang Berjalan*.
11. **Langkah 11: Menerima Notifikasi Telegram untuk Persetujuan**
    - Tunggu beberapa detik hingga agen meminta otorisasi aksi berisiko.
    - *Ekspektasi*: Ponsel bergetar dan notifikasi Telegram baru masuk dari bot berisi ringkasan aksi serta tombol inline *"Buka Virtual Office"*.
12. **Langkah 12: Memeriksa Inbox Persetujuan**
    - Ketuk tab **Inbox** di navigasi bawah.
    - *Ekspektasi*: Item persetujuan muncul paling atas dengan label kuning mencolok dan rincian parameter JSON lengkap.
13. **Langkah 13: Memberikan Keputusan Persetujuan ("Setujui 1x")**
    - Ketuk tombol hijau besar **Setujui (1x)**.
    - *Ekspektasi*: Getaran haptic terasa di tangan. Item berpindah status menjadi *Disetujui*, dan agen melanjutkan eksekusi tugas.
14. **Langkah 14: Memeriksa Hasil Akhir Tugas (Markdown Result)**
    - Kembali ke tab **Tugas**. Amati tugas telah berpindah ke kolom *Selesai*.
    - Ketuk tombol **Lihat Hasil**.
    - *Ekspektasi*: Modal pop-up menampilkan hasil analisis agen dalam format Markdown yang rapi dan mudah dibaca.

### Bagian 4: Laporan Eksekutif & Verifikasi Anti-Halusinasi
15. **Langkah 15: Membuka Tab Laporan (Reports)**
    - Ketuk tab **Laporan** di navigasi bawah.
    - Ketuk tab salah satu departemen (contoh: *Sales* atau *Finance*).
    - *Ekspektasi*: Kartu KPI departemen muncul dilengkapi grafik mini (sparkline) tren data.
16. **Langkah 16: Input Data KPI Manual**
    - Ketuk tombol **+ Catat Metrik KPI**.
    - Masukkan nama metrik (contoh: `Target Omzet`), nilai `150000000`, dan target `120000000`. Simpan.
    - *Ekspektasi*: Metrik baru langsung tercatat dengan badge sumber `manual`.
17. **Langkah 17: Membuat Laporan Eksekutif Otomatis**
    - Ketuk tombol **Buat Laporan Baru**. Pilih template laporan harian/mingguan.
    - Ketuk **Hasilkan Laporan**.
    - *Ekspektasi*: Sistem menyusun laporan berbasis data KPI terverifikasi database (tanpa halusinasi angka). Laporan memuat ringkasan eksekutif, wawasan (*insights*), risiko (*risks*), dan rekomendasi aksi (*actions*).

### Bagian 5: Ruang Perekrutan (Recruitment Room) & Pengaturan
18. **Langkah 18: Perekrutan Agen Baru via Wizard 4 Langkah**
    - Buka tab **Lainnya** (More) -> Ketuk **Ruang Perekrutan Agen** (atau ketuk pintu `+` HR di denah lantai).
    - **Langkah 1**: Pilih template peran (contoh: *Customer Support Agent*).
    - **Langkah 2**: Periksa formulir spesifikasi, batasan yang TIDAK boleh dilanggar agen, dan kebijakan persetujuan.
    - **Langkah 3**: Lihat preview berkas `SOUL.md` yang digenerate secara otomatis (memuat 9 seksi standar).
    - **Langkah 4**: Salin perintah CLI untuk VPS. Ketuk tombol **Daftarkan ke Kantor Virtual**.
    - *Ekspektasi*: Agen baru langsung terdaftar dan muncul di Registry Agen kantor.
19. **Langkah 19: Uji Coba Pengaturan & Aksesibilitas**
    - Di tab **Lainnya**, coba lakukan hal berikut:
      - Ketuk tombol **Ganti Bahasa** (ID ↔ EN): semua teks navigasi berubah seketika.
      - Ketuk toggle **Mode Hemat Daya**: animasi glow dan transisi berat berhenti seketika.
      - Ketuk tombol **Kirim Tes Notifikasi**: bot mengirimkan tes pesan langsung ke chat Telegram Anda.
    - *Ekspektasi*: Semua pengaturan tersimpan di memori lokal dan berfungsi responsif.
20. **Langkah 20: Pengujian Resiliensi & Auto-Reconnect**
    - Matikan koneksi internet (Airplane mode) selama 5 detik, lalu nyalakan kembali.
    - *Ekspektasi*: Muncul indikator kuning offline / mencoba menyambung kembali, dan otomatis terhubung kembali (*auto-reconnect*) tanpa perlu me-reload aplikasi.
