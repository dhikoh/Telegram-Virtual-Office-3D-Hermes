# Design Direction — Hermes Virtual Office

> Tahap 1 dari redesign. Dokumen keputusan, bukan kode.
> Status: APPROVED — keputusan bagian 7 sudah dijawab.
> Tanggal: 2026-10-12

## 1. Decode referensi

Empat gambar diterima, isinya TIGA hal berbeda:

| # | Isi sebenarnya | Peran |
|---|---|---|
| 1, 2, 3 | `virtual.next-it.co.id` — tur kantor virtual Next IT (Bandung) | **Target visual dunia** |
| 4 | Mini app "Random Games" (UFC) di Telegram | **Referensi pencahayaan, kamera, tombol, modal** |
| 5 | `superdevresources.com/neumorphism-ui-design-inspiration` — konsep Fitness App oleh Mary Tokar | **Referensi gaya permukaan UI (neumorphism)** |

### Yang diambil

**Dari Next IT (2.5D target)**
- Isometrik tetap, tanpa distorsi perspektif — sama seperti `CameraController` sekarang
- Base terang (putih/abu muda), zone lantai berwarna pastel
- Shading flat low-poly, bayangan kontak lembut saja, tanpa shadow map dinamis
- Karakter kecil tanpa wajah, proporsi main-main ("toy"), pakaian berwarna
- Label ruangan berupa pill putih + ikon ⓘ
- Panel UI bergaya stiker: sudut membulat, kontras tinggi, mudah dibaca

**Dari Random Games / UFC (kualitas render)**
- Satu sumber cahaya dominan dengan cahaya panggung lembut + rim light pada karakter
- Rim highlight membuat karakter "terpisah" dari latar
- Tombol berbentuk pill penuh, ikon di kiri, label tebal
- Bottom nav bar terpisah, sudut membulat besar, ikon besar
- Baris chip horizontal (filter/aksi) di atas konten utama
- Modal/kartu kosong punya judul + subjudul jelas ("Choose a fighter to place bets")

**Dari neumorphism (permukaan UI)**
- Permukaan sewarna dengan latar, diangkat oleh dua bayangan (cahaya kiri-atas, gelap kanan-bawah)
- Kontrol inset/emboss (toggle, slider, progress ring)
- Bentuk membulat konsisten, tanpa border keras

### Yang TIDAK diambil

- Palet arena gelap UFC — dunia kantor virtual harus terang dan ramah
- Gaya fighting/arena untuk produk kantor
- Neumorphism penuh-putih tanpa aksen — kontras rendah, affordance lemah, mata cepat lelah di HP

## 2. Audit kondisi sekarang (baca kode, belum diubah)

### 2.1 Dunia 3D — penyebab utama "terasa murah"

| Temuan | Bukti | Dampak |
|---|---|---|
| Cuma 2 sumber cahaya, tanpa bayangan | `Scene.tsx:53-54` — `ambientLight 0.8` + `directionalLight 1.2` | Semua terang rata, tanpa kedalaman |
| Material emissive datar | `Scene.tsx:59`, `Furniture.tsx` | Plastik murah, tidak ada PBR |
| Latar `#070B14` + grid neon | `Scene.tsx:57-63` | Vibe dashboard/gaming, bukan kantor |
| Kamera dikunci, hanya pan | `CameraController.tsx:27-34`, offset `(12,16,16)` | Pemain tidak merasa "punya" ruangnya |
| Animasi = gerak koordinat | `Agent3D.tsx`, `getAgentPlacement` | Karakter berpindah, bukan bergerak |
| `frameloop="demand"` | `Office3D.tsx:63` | Frame hanya saat invalidasi — gerakan terasa patah |

### 2.2 Dunia 2D — status: map denah, bukan "dunia"

- `Map.tsx:32-186` — SVG denah lantai, stroke tipis, isian transparan, tanpa depth
- Avatar = elemen tipis di atas denah
- Hasil: terbaca, tapi tidak menyenangkan untuk dilihat — persis keluhan Anda

### 2.3 UI chrome

- Semua panel `glass-panel` + `bg-white/5` + `border-white/10`
- Aksen tunggal cyan `#22D3EE` dengan `shadow-glow-cyan`
- Tidak ada satu pun token neumorphism di codebase (0 match)

### 2.4 Kabar baik: paritas posisi sudah terjamin

`packages/shared/src/layout.ts` adalah **satu-satunya sumber** koordinat dan sudah memuat `pos2d` **dan** `pos3d` untuk tiap ruang/agen (`layout.ts:13-23`, `getAgentPlacement`).

Kebutuhan Anda nomor 3 ("posisi 2D dan 2.5D harus sama") sudah terpenuhi arsitektural. Syaratnya: **kedua renderer wajib terus membaca `layout.ts`**. Dilarang membuat koordinat sendiri di renderer mana pun. Ini masuk acceptance criteria tiap tahap.

## 3. Bahasa desain yang diusulkan

### 3.1 Dunia (kedua mode)

- Base terang, zone lantai pastel, tanpa grid neon
- Satu key light dominan + fill lembut + **bayangan kontak** (bukan shadow map penuh — terlalu mahal untuk HP)
- Rim light tipis pada karakter agar menonjol dari latar
- Material: `meshStandardMaterial` dengan roughness/metalness masuk akal, bukan emissive datar
- Karakter: proporsi main-main, tanpa wajah detail, pakaian berwarna per departemen

### 3.2 UI chrome — neumorphism gelap, aksen terang

Dua opsi nyata, lihat bagian 7. Yang diusulkan: **permukaan neumorphism di atas latar aplikasi**, dengan:

- Bayangan ganda: cahaya `rgba(255,255,255,0.06)` kiri-atas, gelap `rgba(0,0,0,0.45)` kanan-bawah
- Sudut: `rounded-xl` (12px) untuk kartu, `rounded-full` untuk tombol/nav/chip
- **Tombol primer selalu terisi penuh** (accent solid + teks gelap) — tidak pernah putih-di-atas-putih
- Toggle, slider, progress memakai efek inset
- Hilangkan border keras `border-white/10`; lekukan bayangan sudah cukup sebagai pemisah

### 3.3 Bentuk tombol (dari referensi UFC)

- Pill penuh, ikon kiri, label bold, tinggi minimal 44px (sudah jadi aturan repo)
- Bottom nav: bar melayang, sudut besar, ikon besar, label kecil
- Chip bar horizontal di atas konten utama untuk filter/aksi cepat

## 4. Mode 2D — pendekatan aset

Kebutuhan: 2D default, bergaya pixel art ala Ragnarok, posisi identik dengan 2.5D.

**Masalah**: Rule 9.4 melarang aset dari internet. Semua sprite harus dibuat sendiri. Karakter bergerak butuh banyak frame.

**Usulan teknis**: sprite didefinisikan sebagai **peta karakter teks** (array string + palet warna), dirender ke `<canvas>` sekali lalu di-cache sebagai data URL.

- Nol byte aset biner — muat di budget chunk
- Deterministik, bisa diuji unit test (panjang peta, indeks palet valid)
- Animasi jalan 4 frame, 4 arah hadap = 16 peta kecil
- Skala upscale nearest-neighbor → hasil pixel tajam, bukan blur
- Fallback: bila perangkat tidak sanggup, render versi vektor sederhana

Tahap 4 baru mengerjakan ini. Keputusan detail (palet warna, jumlah frame) dibuat di situ.

## 5. Rencana bertahap

| Tahap | Isi | Kriteria selesai |
|---|---|---|
| 0 | Kumpul referensi | ✅ selesai |
| 1 | Dokumen arah ini + keputusan palet | ✅ selesai |
| 1.5 | Perbaikan WebGL: pulihkan context, retry manual, ECO benar-benar matikan 3D | ✅ 181 test hijau, gap-check 8/8 |
| 2 | Design system neumorphic (tombol, chip, card, nav, modal) | ✅ 184 test hijau (guard tema baru), gap-check 8/8 — token `office-surface/panel/inset/accent`, shadow `nu-*`, sweep 598 literal gelap di 37 file |
| 3 | Dunia 2.5D: material, bayangan kontak, cahaya, kamera | Ada screenshot before/after; chunk ≤ 228 KB |
| 3.5 | Modul kehidupan ambien (strip jalan + pejalan kaki), satu modul → dua renderer | Test unit modul hijau; jalan di 2D dan 2.5D |
| 4 | Diorama Ruang Kaca: kamera dekat, dinding belakang, jendela ke jalan | Screenshot before/after; chunk ≤ 228 KB |
| 5 | Dunia 2D pixel art (default) + strip jalan | Chunk ≤ 222 KB; posisi sama dengan 2.5D |
| 6 | Transisi mode + preset grafis + uji fps | fps ≥ 30 di HP kelas menengah; preset Low aktif di `power.ts` |
| 7 | Fondasi jujur: SSE bernama, hapus data karangan, deteksi model gateway per agen | 310 test hijau, gap-check 8/8, index ≤ 222 KB gzip — live stream, KPI/laporan tanpa angka palsu, `POST /api/agents/:id/connection` |
| 8 | Integrasi sesi gateway: riwayat chat tersimpan, hapus/nonaktifkan agen, layar Skills & Akun | 348 test hijau, gap-check 8/8, index ≤ 222 KB gzip — `GET /api/agents/:id/chat` (riwayat dari sesi gateway), `DELETE /api/agents/:id` (+hapus tugas & kunci), `GET /api/skills`, kartu Akun dari `/api/me`, migrasi `003_agent_session` |
| 9 | Orkestrator & kehidupan UI: agen sistem tak-terhapus (`is_system`, "Ask Office" → sesi orkestrator), bubble status dari event SSE, fix scroll ruang di desktop, edit-&-kirim-ulang + sesi baru, avatar editor dasar | Orkestrator tak bisa dihapus via API/UI; bubble tampil & throttle; gate regresi hijau |
| 10 | Kepemilikan ruang: tabel `departments` + CRUD ruang di layar More, floor plan dibaca dari data | Buat/hapus/rename ruang langsung tercermin di denah; agen tetap terhubung ke ruangnya |
| 11 | Skill gateway: halaman detail skill + tombol **Install (dari katalog) & Uninstall** lewat orkestrator (`skill_manage`/`manage_catalog`), guardrail nama hanya dari katalog; toggle aktif per agen (layer SOUL) | Pasang/unpas skill nyata dari UI, tercatat di riwayat run; daftar muat ulang jujur |
| 12 | Media chat & artefak: tempel/unggah gambar di chat (multipart, validasi tipe+ukuran), direktori artefak + `GET /api/artifacts/:id/download` untuk output video/gambar agent, pembersih retensi otomatis (gambar 7 hari, artefak 30 hari, cap 500 MB — configurable via env) | Gambar terkirim ke sesi gateway (multimodal tervalidasi live 2026-10-14); unduh video jalan; pembersih terjadwal teruji |
| 13 | Visual 3D: aset CC0 (KayKit Adventurers + Character Animations, Kenney Furniture Kit) di-commit sendiri ke repo, dicatat di `docs/ASSETS.md` (Rule R3), lazy-load chunk 3D | fps ≥ 30 di HP asli (REQ-119), fallback 2D utuh, bundle tetap dalam budget |
| 14 | Proyek & koordinasi antar-agen: tabel `projects`, orkestrator memecah jadi subtask berdependensi, peta workflow DAG (node = subtask, warna = agen) | Satu proyek contoh berjalan otomatis dari pecahan sampai hasil gabungan, peta terlihat di UI |
| 15 | Sisa audit pasca-14: gestur sentuh HP setara kursor PC, karakter 3D CC0 per departemen, cakupan skill per agen, artefak otomatis dari stream | Sentuh HP: mode putar/geser bisa ditukar, tak ada sentuh terputus; 8 karakter GLB mandiri + fallback kapsul robot; `GET/PUT /api/agents/:id/skills` + directive cakupan; artefak D1/D2 terindex + retensi 31 hari |
| 16 | Strip jalan 2D pakai pixel art asli Kenney "RPG Urban Pack" (CC0) — 9 tile 16 px + properti trotoar, data asli di `lib/streetTiles.ts`, rect datar tetap jadi fallback | Chunk Map ≤ 222 KB gzip; denah di atas strip tidak berubah; kalau PNG gagal dimuat, jalan tetap tampil seperti sebelumnya |

Tahap 0–6 di-commit terpisah; Tahap 7 & 8 dikerjakan dalam satu putaran sesuai permintaan owner (2026-10-13). Tahap 9–14 disepakati 2026-10-14; **push dibagi dua**: (A) setelah Tahap 9–12 — semua kode & 2D selesai, sebelum aset visual; (B) setelah seluruh tahap selesai — aset 3D jadi commit sendiri di dalam push B agar roll-back visual tidak menghapus fitur. Putaran pasca-14 (Tahap 15) ikut aturan yang sama: aset 3D sendiri (`586a027`), kode terpisah (`e5305ea`).

## 6. Batasan yang tidak boleh dilanggar

- **Rule 9.1** — koordinat hanya dari `packages/shared/src/layout.ts`
- **Rule 9.4** — nol aset eksternal; semua visual dibundel atau dibuat sendiri
- **Rule 9.2** — 3D lazy load + chunk terpisah
- **Rule REQ-114..117** — quality tier, pause saat hidden, fallback WebGL
- Touch target minimal 44×44 px
- Kontras teks ≥ 4.5:1 (ini yang membuat neumorphism klasik gugur sebagai gaya tunggal)

## 7. Keputusan yang sudah dijawab

| # | Pertanyaan | Keputusan |
|---|---|---|
| 7.1 | Palet dasar | **Terang `#EEF2F7`** — cocok ketiga referensi, kontras ≥ 4.5:1 aman |
| 7.2 | Aksen utama | **Oranye-amber** — sesuai Next IT dan tombol UFC |
| 7.3 | Mode default | **2D pixel art** |
| 7.4 | Tujuan akhir dunia | **Konsep A: Diorama Ruang Kaca** — satu ruang + jendela ke jalan |
| 7.5 | Kehidupan (kendaraan lalu lalang) | **Modul ambien terpisah**, satu modul menggerakkan renderer 2D dan 2.5D |
| 7.6 | Retensi media (keterbatasan memori VPS) | **Gambar sementara 7 hari, artefak/video 30 hari, cap total 500 MB** — semuanya configurable via env; pembersih terjadwal di server, baris DB ikut dibersihkan + tercatat di audit |
| 7.7 | Jalur install/uninstall skill | **Lewat orkestrator + `skill_manage`** — gateway API tidak punya endpoint tulis (`POST /v1/skills` 405, `DELETE` 404, tervalidasi live 2026-10-14); guardrail: nama skill hanya dari daftar katalog |
| 7.8 | Chat multimodal (tempel gambar) | **Tervalidasi live 2026-10-14**: `/v1/chat/completions` menerima konten `image_url` dan model menjawab isi gambar dengan benar |
| 7.9 | Camoufox (anti-detect browser) | **Ditunda** — tidak pernah terpasang di VPS (diverifikasi 2026-10-14); tinjau ulang hanya jika browser bawaan diblokir target dan RAM terukur cukup (KVM 2) |

### Konsekuensi Konsep A

- Navigasi berubah: tidak lagi "10 ruang sekaligus", tapi **ruang aktif + chip pindah ruang**
- Kamera lebih dekat, isometrik tetap
- Kehidupan ambien di dua kedalaman: agen di dalam ruang, lalu lintas di balik jendela
- Modul ambien tidak butuh WebGL, jadi tetap hidup walau konteks WebGL mati
