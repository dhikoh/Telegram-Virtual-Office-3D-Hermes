# Panduan Pengujian Manual — Layar 320px & Telegram Mini App (Rule R10 & C3h)

**Dokumen**: Panduan QA Manual untuk Pemilik (Owner)  
**Status Pengujian Otomatis**: BLOCKED (Membutuhkan Perangkat Fisik / Web Telegram Nyata)  
**Tujuan**: Memverifikasi responsivitas layout visual pada layar sempit (320px) serta interaksi perangkat sentuh asli di aplikasi Telegram Mini App.

---

## 1. Lingkungan Pengujian
1. **Perangkat Uji**:
   - Smartphone layar kecil (contoh: iPhone SE generasi 1 / resolusi viewport 320 x 568 px) ATAU
   - Chrome / Firefox DevTools Responsive Mode disetel ke lebar `320px` x tinggi `600px` (DPR 2.0).
2. **Klien Telegram**:
   - Telegram Mobile App (Android / iOS) terbaru.
   - Buka bot: `@hermes_office_bot` -> ketuk tombol menu / inline button `Buka Kantor Virtual`.

---

## 2. Skenario Pengujian Layar Sempit (320px Viewport)

### Skenario A: Layar Utama Kantor (Office 2D & 3D)
- [ ] **A-1**: Buka layar Kantor. Pastikan HUD atas (indikator agen aktif, tugas, error) tidak mengalami overflow horizontal dan teks tidak terpotong.
- [ ] **A-2**: Denah 2D SVG beradaptasi secara proporsional. Seluruh 9 ruangan (Command Center, Social Studio, Sales, Finance, Marketing, Analytics, Support, HR, Lounge) tetap terlihat dan dapat diketuk.
- [ ] **A-3**: Avatar agen memiliki target sentuh minimal `44px x 44px` sehingga mudah diketuk dengan jari tanpa salah memilih agen di sekitarnya.
- [ ] **A-4**: Beralih ke mode 3D (jika perangkat mendukung). Pastikan canvas Three.js tidak keluar dari frame 320px dan kamera isometric tetap terpusat.

### Skenario B: Bottom Sheet Profil Agen (Agent Sheet)
- [ ] **B-1**: Ketuk salah satu avatar agen (misal Aria Commander).
- [ ] **B-2**: Bottom sheet membuka dengan animasi mulus dan menutupi sebagian layar tanpa horizontal scroll.
- [ ] **B-3**: Navigasi 4 tab (*Chat*, *Aktivitas*, *Tugas*, *Profil*) memiliki ukuran tab yang proporsional di lebar 320px.
- [ ] **B-4**: Tab *Profil*: Pastikan label *Endpoint Gateway* dan *Status* rapi tanpa teks bertumpuk.
- [ ] **B-5**: Tombol aksi (*Stop*, *Tutup*) mudah ditekan dengan tinggi sentuh minimal 44px.

### Skenario C: Papan Kanban Tugas (Tasks)
- [ ] **C-1**: Masuk ke menu *Tugas* via bilah navigasi bawah.
- [ ] **C-2**: Kolom Kanban (*Backlog*, *Berjalan*, *Menunggu*, *Selesai*) dapat digeser secara horizontal (swipe) dengan mulus pada lebar 320px.
- [ ] **C-3**: Kartu tugas menampilkan judul, chip prioritas, dan tombol *Jalankan* tanpa overflow.

### Skenario D: Kotak Masuk & Persetujuan (Inbox)
- [ ] **C-1**: Masuk ke tab *Kotak Masuk*.
- [ ] **C-2**: Kartu permintaan persetujuan menampilkan teks ringkasan lengkap.
- [ ] **C-3**: Tombol *Setujui* dan *Tolak* memiliki ukuran besar dan berdampingan atau bertumpuk vertikal dengan jarak yang cukup untuk mencegah ketukan ganda yang tidak disengaja.

### Skenario E: Laporan & Analitik (Reports)
- [ ] **E-1**: Masuk ke tab *Laporan*.
- [ ] **E-2**: Filter departemen dapat di-scroll horizontal secara halus di lebar 320px.
- [ ] **E-3**: Kartu metrik KPI menampilkan nilai, sparkline, dan badge sumber dengan jelas.

### Skenario F: Wizard Perekrutan Agen (Recruitment Room)
- [ ] **F-1**: Buka menu *Lainnya* -> *Perekrutan Agen*.
- [ ] **F-2**: Langkah 1–4 formulir input mudah diisi menggunakan keyboard virtual ponsel.
- [ ] **F-3**: Kotak terminal VPS perintah CLI dapat di-scroll secara independen dan tombol *Salin Perintah* berfungsi dengan feedback haptic.

---

## 3. Matriks Hasil Verifikasi

| Komponen | Status 320px | Catatan Pemilik |
|:---|:---|:---|
| Office HUD & Floor Plan | [ ] Lolos / [ ] Gagal | |
| Agent Sheet | [ ] Lolos / [ ] Gagal | |
| Kanban Tasks | [ ] Lolos / [ ] Gagal | |
| Inbox Approvals | [ ] Lolos / [ ] Gagal | |
| Reports & KPIs | [ ] Lolos / [ ] Gagal | |
| Recruitment Wizard | [ ] Lolos / [ ] Gagal | |
| Navigasi Tab Bawah | [ ] Lolos / [ ] Gagal | |

---

## 4. Kesimpulan
Hasil uji manual ini melengkapi verifikasi otomatis headless (jsdom) dan membuktikan kesiapan antarmuka Telegram Mini App untuk penggunaan nyata di smartphone pemilik.
