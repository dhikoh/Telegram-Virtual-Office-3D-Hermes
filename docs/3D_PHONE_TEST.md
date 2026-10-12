# Panduan Pengujian 3D di Perangkat Handphone Asli (Owner Verification Script)

> **Status REQ-119**: BLOCKED (needs owner)  
> Pengujian frame rate, suhu baterai/perangkat, dan kelancaran grafis 3D pada lingkungan perangkat keras ponsel nyata memerlukan pengujian fisik oleh Owner.

---

## Tujuan Pengujian
Memastikan bahwa tampilan 3D isometrik procedural (Three.js / React Three Fiber) berjalan lancar, tidak mengalami overheating (panas berlebih), tidak terjadi memory leak, dan gesture sentuh (pan & pinch-to-zoom) merespons dengan halus pada smartphone Telegram Mini App.

---

## Langkah-Langkah Pengujian (Step-by-Step)

### 1. Buka Aplikasi di Ponsel
1. Buka bot Telegram Anda di smartphone fisik (Android / iOS).
2. Luncurkan WebApp **Hermes Virtual Office**.
3. Pastikan mode hemat daya tidak aktif (ikon baterai / toggle di More dalam posisi Full Power).

### 2. Aktifkan Tampilan 3D
1. Di bagian atas layar (Header HUD), ketuk tombol switch **"3D"** (atau buka menu **More > Tampilan Denah Kantor > 3D Isometrik**).
2. Perhatikan proses pemuatan awal: denah kantor 3D neon isometrik akan muncul dengan lantai grid bercahaya, 8 ruangan divisi dengan kubus furnitur transparan, dan karakter agen low-poly.

### 3. Uji Navigasi Sentuh (Touch Gestures)
1. **Pan (Geser)**: Letakkan 1 jari pada layar dan geser ke segala arah. Pastikan pergerakan kamera halus dan tidak tembus ke luar batas lantai kantor (clamped boundary).
2. **Pinch-to-Zoom (Cubit)**: Gunakan 2 jari untuk memperbesar (zoom in) dan memperkecil (zoom out). Pastikan zoom dibatasi pada rentang pandang yang nyaman.
3. Pastikan **tidak ada rotasi bebas (orbit)** yang membuat denah terbalik. Tampilan tetap terkunci pada sudut isometrik.

### 4. Uji Interaksi Agen (Raycast Picking & Sheet)
1. Ketuk 3 agen berbeda di denah 3D:
   - Ketuk Agen 1: Pastikan **Agent Sheet** muncul dari bawah dengan data yang tepat.
   - Tutup Sheet, lalu ketuk Agen 2.
   - Tutup Sheet, lalu ketuk Agen 3.
2. Perhatikan saat Agent Sheet terbuka penuh: rendering 3D otomatis dijeda (`isPaused`) untuk menghemat baterai dan GPU.
3. Tutup Sheet: animasi 3D kembali aktif sesuai permintaan (`frameloop="demand"`).

### 5. Uji Ketahanan 5 Menit (Thermal & Stability Run)
1. Biarkan tampilan 3D terbuka dan berjalan di layar ponsel Anda selama **5 menit**.
2. Anda dapat sesekali menggeser posisi kamera atau memicu simulasi status agen.
3. Amati kondisi ponsel:
   - Apakah punggung ponsel terasa hangat wajar atau panas berlebih (overheat)?
   - Apakah terjadi patah-patah (stuttering) atau penurunan frame rate yang drastis?
   - Apakah aplikasi tetap responsif atau crash/keluar sendiri?

### 6. Uji Transisi 2D <-> 3D (Memory Stability)
1. Lakukan pergantian bolak-balik antara tombol **2D** dan **3D** sebanyak 10–20 kali.
2. Pastikan tidak ada pesan error WebGL, memori tidak menumpuk, dan aplikasi tidak melambat.

---

## Format Laporan Hasil Pengujian (Kirim ke Tim Pengembang)

Silakan salin format di bawah ini dan isi setelah melakukan pengujian di ponsel Anda:

```markdown
### Laporan Uji 3D Ponsel (Owner)
- **Model Ponsel & OS**: [Contoh: iPhone 13 Pro / Samsung Galaxy S23 / Xiaomi Redmi Note 11]
- **Versi Telegram**: [Contoh: Telegram v10.x]
- **Kelancaran Gesture (Pan & Zoom)**: [Lancar / Agak Patah / Macet]
- **Respons Ketuk Agen (Sheet)**: [Berfungsi baik / Kurang akurat]
- **Suhu Ponsel setelah 5 Menit**: [Dingin / Hangat wajar / Sangat panas]
- **Stuttering / Lag**: [Tidak ada lag / Ada sedikit lag saat awal / Sering lag]
- **Status Akhir**: [PASSED / PERLU OPTIMASI]
- **Catatan Tambahan**: [Tuliskan jika ada perilaku aneh atau visual glitch]
```
