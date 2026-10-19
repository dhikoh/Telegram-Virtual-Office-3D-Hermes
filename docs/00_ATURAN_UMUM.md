# 00 — ATURAN UMUM UNTUK AI AGENT (WAJIB DIBACA SEBELUM FASE APA PUN)

Repo: `dhikoh-gen` (Prompt Gen). Stack: Next.js 16 (App Router, Turbopack), React 19, Prisma 6 + PostgreSQL, NextAuth v4 (JWT, Credentials), next-intl 4, Tailwind 4, zod 4, vitest 3.
Bahasa kerja: Indonesia. Kode, nama variabel, nama file: Inggris.

Dokumen ini adalah aturan yang berlaku di SEMUA fase. Setiap file `FASE_*.md` mengasumsikan kamu sudah membaca file ini.

---

## A. 14 ATURAN EMAS

1. **Baca dokumentasi Next.js lokal dulu.** Repo ini memakai Next 16 yang BERBEDA dari pengetahuanmu. Sebelum menulis route handler, `next.config.ts`, atau middleware, buka folder `node_modules/next/dist/docs/` dan baca bagian yang relevan. Jika folder tidak ada, jalankan `npm install` lebih dulu. Untuk pola kode, SALIN dari file yang sudah ada (contoh: `src/app/api/user/tts-keys/[id]/route.ts` untuk route ber-`[id]`, `src/app/api/user/tts-keys/route.ts` untuk route biasa).
2. **Satu fase = satu pekerjaan.** Kerjakan HANYA fase yang diminta. Jangan "sekalian" memperbaiki hal lain. Jika menemukan masalah di luar fase, tulis di bagian "TEMUAN BARU" pada laporan, jangan diperbaiki.
3. **Additive & backward-compatible.** Jangan menghapus field, route, atau perilaku lama. Data lama (draft lama, localStorage lama, key API lama) harus tetap bisa dibaca.
4. **Dilarang:** `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `as unknown as X` (kecuali sudah ada di kode lama pada baris yang sama sekali tidak kamu ubah).
5. **Semua teks yang dilihat user wajib lewat i18n.** Tambahkan key di `messages/id.json` DAN `messages/en.json`, pada namespace yang disebut di fase, dengan nama key yang SAMA persis di kedua file. Dilarang string hardcoded di JSX, toast, atau pesan error API. Jalankan `npm run audit:i18n` setelah menambah key.
6. **Lokasi test:** `src/lib/__tests__/<nama>.test.ts` (pola yang sudah ada). Jangan membuat folder `tests/`. Pakai vitest dengan `globals: true` (tidak perlu import `describe/it/expect`, tetapi boleh). Import modul dengan alias `@/lib/...`.
7. **Prisma:**
   - Edit `prisma/schema.prisma`.
   - Buat folder migrasi baru `prisma/migrations/<YYYYMMDD>_<nama_snake_case>/migration.sql` dengan SQL idempotent (`IF NOT EXISTS`) — contoh gaya ada di `prisma/migrations/20261012_add_draft_generation_config/migration.sql` dan `.../20261013_add_storyboard/migration.sql`.
   - Jalankan `npx prisma generate`.
   - DILARANG: `prisma migrate reset`, `prisma db push --force-reset`, menjalankan `prisma/seed.js` di environment production.
8. **Urutan wajib di setiap API route handler:**
   `getServerSession` → (401 jika tidak ada) → `applyRateLimit` dengan IP dari `getClientIp(req)` (import dari `@/lib/rateLimit`) → `requireActiveSubscription` (bila fitur berbayar) → cek `hasFeature(...)` (bila fitur ber-flag) → validasi `zod` (`safeParse`) → cek kepemilikan data → logika. Pesan error untuk user lewat `getApiTranslator()` (`src/lib/apiI18n.ts`) dan key di namespace `API`.
9. **`userId` HANYA dari `session.user.id`.** Dilarang menerima `userId`, `ownerId`, `folderId`, atau `encryptedKey` dari body/query/header.
10. **Dilarang me-log** secret, token, API key, refresh token, isi kode animasi user, isi prompt user. `console.error` hanya boleh berisi pesan error + kode, bukan payload.
11. **Verifikasi wajib sebelum lapor selesai** (urutan ini, semua harus exit 0):
    ```bash
    npx prisma generate
    npx tsc --noEmit
    npm run lint
    npm test
    npm run audit:i18n
    npm run audit:design
    npm run build
    ```
    Jika salah satu gagal, perbaiki. Jangan lapor "selesai" bila ada yang gagal. Tempel output mentah ringkas (baris terakhir tiap perintah) di laporan.
    CATATAN: `package.json` memanggil `scripts/audit-i18n.mjs` dan `scripts/audit-design.mjs`. Jika file itu TIDAK ADA di repo-mu, JANGAN membuat skrip karangan; tulis di laporan "scripts/ tidak ditemukan" dan lewati dua perintah itu.
12. **Jika bingung, BERHENTI dan lapor.** Jika sebuah file, fungsi, atau baris anchor yang disebut di instruksi tidak ditemukan, atau hasil `grep` berbeda dari yang diharapkan: berhenti, tulis persis apa yang dicari dan hasil pencariannya. Jangan menebak, jangan mengarang nama fungsi atau API paket.
13. **Dokumentasi wajib diupdate di setiap fase:** (a) `Project Prompt Gen.txt` — tambah Bagian sesuai nomor di `ADDENDUM_Bagian42-47...md`, (b) `PATCH_NOTES.md` — tambah entri `[#NN]` di tabel kanonikal DAN entri detail di atas entri `[#92]`. Teks sudah disiapkan di ADDENDUM; kamu hanya mengisi bagian `<<DIISI AGEN>>`.
14. **Format laporan akhir fase** (wajib, persis):
    ```
    LAPORAN FASE <N>
    1. File baru: <daftar path>
    2. File diubah: <daftar path + 1 kalimat tiap file>
    3. Migrasi: <nama folder atau "tidak ada">
    4. Key i18n baru: <jumlah> (id/en paritas: ya/tidak)
    5. Test baru: <daftar file + jumlah test>
    6. Hasil verifikasi: <output mentah 7 perintah>
    7. Bagian blueprint & entri PATCH_NOTES: <nomor yang ditambahkan>
    8. Deviasi dari instruksi: <daftar + alasan, atau "tidak ada">
    9. TEMUAN BARU di luar fase: <daftar, atau "tidak ada">
    ```

---

## B. KONVENSI KODE (SALIN POLA, JANGAN BUAT POLA BARU)

- Komponen client: berkas `.tsx` dengan `"use client";` di baris pertama. Teks: `const t = useTranslations("<Namespace>")`.
- Kelas CSS: pakai kelas design system yang sudah ada (`pg-text-heading`, `pg-text-muted`, `pg-border`, `glass-panel`, `pg-btn-primary`, `neu-btn`, `pg-surface`, `pg-surface-dim`, `pg-bg-page`). Jangan memakai warna hex baru. Salin gaya dari komponen tetangga.
- Toast: `react-hot-toast` seperti yang dipakai `ScenePromptStudioClient.tsx` (`toast.success`, `toast.error`).
- Route handler `[id]` memakai `params` sebagai Promise di Next 16: salin cara `src/app/api/user/tts-keys/[id]/route.ts` membacanya.
- Respons JSON sukses: `{ success: true, ... }`. Respons error: `{ error: "<pesan terjemahan>" }` dengan status HTTP yang benar.
- Konstanta batas (angka) ditaruh di satu file `src/lib/*Limits.ts` atau modul yang disebut di fase; jangan menulis angka batas di dua tempat.

## C. HAL YANG SERING SALAH (HINDARI)

- Menambah key i18n hanya di satu file bahasa → `audit:i18n` gagal.
- Lupa `npx prisma generate` setelah mengubah schema → `tsc` gagal.
- Mengubah file besar (`promptGenerator.ts` 114 KB, `GeneratorForm.tsx` 107 KB, `ScenePromptStudioClient.tsx` 133 KB) dengan menulis ulang seluruh file. DILARANG. Edit hanya baris anchor yang disebut (pakai `grep -n` untuk menemukan baris, lalu ubah minimal).
- Menaruh logika baru langsung di file besar. Taruh logika di modul baru kecil, lalu panggil dari file besar.
- Memakai `localStorage` langsung. Setelah Fase 1, hanya `src/lib/clientStorage.ts` yang boleh menyentuh `localStorage`.
- Memakai `req.headers.get("x-forwarded-for")` langsung. Setelah Fase 1, wajib `getClientIp(req)`.
- Mengambil API key / secret dari `process.env` untuk fitur AI milik user. Key AI selalu milik user (tabel `UserApiKey`).
