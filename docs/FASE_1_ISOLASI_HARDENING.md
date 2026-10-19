# FASE 1 — ISOLASI PER USER & PERBAIKAN CELAH (PATCH `[#93]`, BLUEPRINT BAGIAN 43)

Prasyarat: baca `00_ATURAN_UMUM.md`. Fase ini TIDAK menambah fitur baru untuk user. Tujuannya menutup celah supaya data, key, dan cache tiap user tidak tercampur — ini fondasi untuk fitur Render lokal dan Google Drive di fase berikutnya.

Mulai fase ini dengan:
1. Tambahkan Bagian 42 dan Bagian 43 ke `Project Prompt Gen.txt` (teks ada di ADDENDUM).
2. Kerjakan tugas 1.1 s/d 1.9 berurutan.
3. Akhiri dengan verifikasi, entri PATCH_NOTES `[#93]`, dan laporan.

---

## 1.1 AES-GCM dengan AAD terikat user (celah G-03)

**Masalah:** `src/lib/crypto.ts` mengenkripsi tanpa AAD dan tanpa versi. Ciphertext milik user A yang disalin ke baris user B di database tetap bisa didekripsi. Master secret juga tidak bisa dirotasi.

**Perbaikan:** format baru `v2:<iv>:<tag>:<cipher>` dengan AAD. Format lama (3 bagian tanpa `v2:`) tetap bisa didekripsi (legacy).

### Langkah
1. Ganti ISI `src/lib/crypto.ts` dengan kode berikut (semua export lama tetap ada):

```ts
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const V2_PREFIX = "v2";

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set");
  // sha256 menghasilkan 32-byte key yang dibutuhkan AES-256
  //
  // ⚠️ ROTASI SECRET: Jika API_KEY_ENCRYPTION_SECRET diubah, SEMUA ciphertext
  // v2 yang ada akan gagal didekripsi. Sebelum rotasi, jalankan script
  // re-encrypt batch untuk tabel:
  //   - UserApiKey.encryptedKey
  //   - UserGoogleDriveToken.encryptedAccess & encryptedRefresh (Fase 5)
  // Script: decrypt dengan key lama, encrypt ulang dengan key baru.
  return crypto.createHash("sha256").update(secret).digest();
}

/** AAD untuk API key user: mengikat ciphertext ke user + provider. */
export function apiKeyAad(userId: string, provider: string): string {
  return `apikey:${userId}:${provider}`;
}

/** AAD untuk token Google Drive user (dipakai Fase 5). */
export function googleDriveAad(userId: string): string {
  return `gdrive:${userId}`;
}

/**
 * Enkripsi ke format:
 * - dengan aad  : "v2:<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 * - tanpa aad   : "<iv_b64>:<authTag_b64>:<ciphertext_b64>" (legacy, jangan dipakai kode baru)
 */
export function encryptSecret(plain: string, aad?: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV untuk GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const body = [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
  return aad ? `${V2_PREFIX}:${body}` : body;
}

/** true jika payload masih format lama (tanpa AAD). */
export function isLegacyPayload(payload: string): boolean {
  return !payload.startsWith(`${V2_PREFIX}:`);
}

/**
 * Dekripsi hasil encryptSecret().
 * - Payload "v2:" WAJIB disertai aad yang sama persis, jika tidak -> Error.
 * - Payload legacy (tanpa "v2:") didekripsi tanpa AAD (parameter aad diabaikan).
 */
export function decryptSecret(payload: string, aad?: string): string {
  let body = payload;
  let useAad = false;
  if (payload.startsWith(`${V2_PREFIX}:`)) {
    if (!aad) throw new Error("AAD required for v2 payload");
    body = payload.slice(V2_PREFIX.length + 1);
    useAad = true;
  }
  const parts = body.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload format");
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted payload format");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  if (useAad && aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Untuk UI: "•••• ab12" — tanpa pernah expose key asli ke client. */
export function maskApiKey(rawKey: string): string {
  const last4 = rawKey.slice(-4);
  return `\u2022\u2022\u2022\u2022 ${last4}`;
}

export function getKeyFingerprint(rawKey: string): string {
  return rawKey.slice(-4);
}
```

2. Ubah pemanggil (hanya 2 tempat; verifikasi dengan `grep -rn "encryptSecret\|decryptSecret" src`):
   - `src/app/api/user/tts-keys/route.ts` (sekitar baris 92): ganti `encryptSecret(apiKey)` menjadi `encryptSecret(apiKey, apiKeyAad(session.user.id, "GEMINI"))`. Tambahkan `apiKeyAad` ke import dari `@/lib/crypto`.
   - `src/app/api/tts/generate/route.ts` (sekitar baris 150): ganti `decryptSecret(keyRecord.encryptedKey)` menjadi `decryptSecret(keyRecord.encryptedKey, apiKeyAad(session.user.id, "GEMINI"))`. Setelah dekripsi sukses, jika `isLegacyPayload(keyRecord.encryptedKey)` bernilai true, upgrade diam-diam:
     ```ts
     if (isLegacyPayload(keyRecord.encryptedKey)) {
       try {
         await prisma.userApiKey.updateMany({
           where: { id: keyRecord.id, userId: session.user.id },
           data: { encryptedKey: encryptSecret(rawKey, apiKeyAad(session.user.id, "GEMINI")) },
         });
       } catch {
         // upgrade gagal tidak boleh menggagalkan request
       }
     }
     ```
     Pastikan `rawKey` sudah berisi key hasil dekripsi pada titik ini, dan upgrade dilakukan DI LUAR blok try/catch dekripsi yang sudah ada agar tidak mengubah klasifikasi error.
3. Test baru `src/lib/__tests__/crypto.test.ts`. Di `beforeAll` set `process.env.API_KEY_ENCRYPTION_SECRET = "x".repeat(40)`. Kasus WAJIB:
   - roundtrip v2 dengan aad sama → plaintext kembali;
   - payload v2 didekripsi dengan aad BERBEDA → `toThrow`;
   - payload v2 tanpa aad → `toThrow`;
   - payload legacy (hasil `encryptSecret("abc")` tanpa aad) → `isLegacyPayload` true dan `decryptSecret` berhasil;
   - payload v2 yang 1 karakter ciphertext-nya diubah → `toThrow`;
   - dua enkripsi plaintext sama menghasilkan string berbeda.

## 1.2 Storage client per user (celah G-01)

**Masalah:** key `localStorage` berikut GLOBAL per browser dan tidak dibersihkan saat logout, sehingga user B di browser yang sama bisa melihat data user A: `scenePromptState`, `generatorFormState`, `generatorLastActiveChannelId`, `generatorFormState_<channelId>`, `promptgen_favorite_voices`.

### Langkah
1. Buat `src/lib/clientStorage.ts`:

```ts
// Satu-satunya modul yang boleh menyentuh window.localStorage.
const PREFIX = "pg:";

const LEGACY_EXACT_KEYS = [
  "generatorFormState",
  "generatorLastActiveChannelId",
  "scenePromptState",
  "promptgen_favorite_voices",
] as const;
const LEGACY_PREFIXES = ["generatorFormState_"] as const;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function allKeys(s: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

export function userStorageKey(userId: string, name: string): string {
  return `${PREFIX}${userId}:${name}`;
}

export function getUserItem(userId: string | null | undefined, name: string): string | null {
  const s = storage();
  if (!s || !userId) return null;
  try {
    return s.getItem(userStorageKey(userId, name));
  } catch {
    return null;
  }
}

export function setUserItem(userId: string | null | undefined, name: string, value: string): void {
  const s = storage();
  if (!s || !userId) return;
  try {
    s.setItem(userStorageKey(userId, name), value);
  } catch {
    // kuota penuh / mode privat: abaikan
  }
}

export function removeUserItem(userId: string | null | undefined, name: string): void {
  const s = storage();
  if (!s || !userId) return;
  try {
    s.removeItem(userStorageKey(userId, name));
  } catch {
    // abaikan
  }
}

/** Hapus SEMUA data ber-prefix "pg:" (semua user) + key legacy. Dipanggil saat logout. */
export function clearAllUserScopedStorage(): void {
  const s = storage();
  if (!s) return;
  for (const k of allKeys(s)) {
    if (k.startsWith(PREFIX) || isLegacyKey(k)) {
      try {
        s.removeItem(k);
      } catch {
        // abaikan
      }
    }
  }
}

/** Hapus data milik user LAIN (sisa sesi sebelumnya) dan key legacy tanpa pemilik. */
export function purgeForeignStorage(currentUserId: string): void {
  const s = storage();
  if (!s || !currentUserId) return;
  const mine = `${PREFIX}${currentUserId}:`;
  for (const k of allKeys(s)) {
    const foreign = k.startsWith(PREFIX) && !k.startsWith(mine);
    if (foreign || isLegacyKey(k)) {
      try {
        s.removeItem(k);
      } catch {
        // abaikan
      }
    }
  }
}

function isLegacyKey(k: string): boolean {
  if ((LEGACY_EXACT_KEYS as readonly string[]).includes(k)) return true;
  return LEGACY_PREFIXES.some((p) => k.startsWith(p));
}
```

2. Buat komponen `src/components/layout/StorageGuard.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { purgeForeignStorage } from "@/lib/clientStorage";

export default function StorageGuard({ userId }: { userId: string }) {
  useEffect(() => {
    purgeForeignStorage(userId);
  }, [userId]);
  return null;
}
```
   Render `<StorageGuard userId={session.user.id} />` di `src/app/[locale]/dashboard/layout.tsx` (server component; baca file itu dulu, ambil session dengan cara yang sudah dipakai file tersebut; jika layout belum punya session, tambahkan `getServerSession(authOptions)` seperti di `generator/page.tsx`). PENTING: `StorageGuard` harus dirender SEBELUM `{children}` agar pembersihan terjadi lebih dulu.
   Catatan: pembersihan key legacy akan menghapus cache lokal lama user. Ini disengaja dan aman karena server adalah source of truth (Bugfix #90).
3. Ganti SEMUA pemakaian `localStorage` (kecuali `InstallPWABanner.tsx` yang hanya menyimpan flag UI) dengan helper. Pemetaan MEKANIS (nama key lama tetap dipakai sebagai `name`):

| Lama | Baru |
|---|---|
| `localStorage.getItem(X)` | `getUserItem(userId, X)` |
| `localStorage.setItem(X, V)` | `setUserItem(userId, X, V)` |
| `localStorage.removeItem(X)` | `removeUserItem(userId, X)` |

   File yang harus diubah (cari dengan `grep -rn "localStorage" src`):
   - `src/components/generator/GeneratorForm.tsx` (±11 tempat; termasuk `generatorFormState_${channelId}`, `generatorLastActiveChannelId`, `generatorFormState`, `scenePromptState`)
   - `src/app/[locale]/dashboard/scene-prompt/ScenePromptStudioClient.tsx` (`promptgen_favorite_voices`, `scenePromptState`, ±5 tempat)
4. `userId` datang lewat PROP (bukan `useSession`, supaya efek yang berjalan sekali saat mount tetap sinkron):
   - `src/app/[locale]/dashboard/generator/page.tsx`: tambahkan `userId={session.user.id}` pada `<GeneratorForm ... />`.
   - `src/app/[locale]/dashboard/scene-prompt/page.tsx`: tambahkan `userId={session.user.id}` pada `<ScenePromptStudioClient ... />`.
   - Tambahkan `userId: string` ke interface props kedua komponen, dan destructure di fungsi komponen.
   - Pada kode yang sudah ada `useEffect(..., [])` yang membaca storage, tambahkan `userId` ke array dependensi hanya jika linter menuntut; JANGAN mengubah logikanya.
5. `src/components/auth/LogoutButton.tsx`: sebelum `signOut(...)`, panggil `clearAllUserScopedStorage()` dan `clearSensitiveCaches()` (didefinisikan di 1.3). Jadikan handler `async`.
6. Test guard baru `src/lib/__tests__/noUnscopedLocalStorage.test.ts`: baca semua file `src/**/*.ts(x)` via `fs` (rekursif, abaikan `__tests__`), dan GAGAL bila ada `localStorage.` atau `sessionStorage.` di file selain `src/lib/clientStorage.ts` dan `src/components/InstallPWABanner.tsx`.
7. Test unit `src/lib/__tests__/clientStorage.test.ts`: karena vitest berjalan di environment `node`, buat stub `globalThis.window = { localStorage: <objek Map-backed dengan getItem/setItem/removeItem/key/length> }` di `beforeEach`. Kasus: key tersimpan dengan prefix `pg:<userId>:`; user A tidak bisa membaca data user B; `purgeForeignStorage("A")` menghapus `pg:B:*` dan key legacy tetapi mempertahankan `pg:A:*`; `clearAllUserScopedStorage` menghapus semua `pg:*`.

## 1.3 Cache service worker & header keamanan (celah G-02, G-06)

**Masalah (WAJIB DIVERIFIKASI DULU):** `next.config.ts` memakai `next-pwa` tanpa `runtimeCaching`, sehingga cache bawaan next-pwa berlaku. Sepengetahuan penulis prompt ini, bawaan next-pwa meng-cache GET `/api/*` dan halaman HTML dengan strategi NetworkFirst. Jika benar, respons API dan halaman dashboard milik user A bisa disajikan ke user B di browser yang sama saat jaringan lambat/offline.

### Langkah
1. Verifikasi: buka `node_modules/next-pwa/cache.js` dan catat entri yang `urlPattern`-nya mencakup `/api/` atau halaman (`others`). Tulis temuanmu di laporan (kutip nama cache dan handler). Jika file tidak ada atau berbeda, BERHENTI dan lapor sebelum lanjut.
2. Jika terbukti meng-cache API/halaman, ubah `next.config.ts` menjadi seperti ini (pertahankan semua yang sudah ada; ini hanya contoh bentuk akhir — sesuaikan dengan isi file aslimu):

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withPWAInit from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache";

const withNextIntl = createNextIntlPlugin();

// Jangan pernah meng-cache API & halaman berotentikasi di service worker.
const neverCache = {
  urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
    sameOrigin &&
    (url.pathname.startsWith("/api/") ||
      /^\/(id|en)\/(dashboard|admin)(\/|$)/.test(url.pathname)),
  handler: "NetworkOnly" as const,
};

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [neverCache, ...defaultRuntimeCaching],
});

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Jangan cache respons API milik user. Pengecualian: gambar storyboard (punya Cache-Control sendiri).
      {
        source: "/api/:path((?!storyboard/panels/).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default withPWA(withNextIntl(nextConfig));
```
   - Jika `import defaultRuntimeCaching from "next-pwa/cache"` ditolak TypeScript, tambahkan deklarasi modul di `src/types/next-pwa.d.ts` (`declare module "next-pwa/cache" { const c: unknown[]; export default c; }`) dan sesuaikan tipe `runtimeCaching` agar tanpa `any`. Jika masih gagal, BERHENTI dan lapor.
   - Jika pola `source` dengan negative lookahead membuat `npm run build` error, ganti dengan dua rule eksplisit untuk prefix API yang ada (`/api/drafts`, `/api/user`, `/api/tts`, `/api/generate`, `/api/parsed-outputs`, `/api/channels`, `/api/used-titles`, `/api/products`, `/api/research`, `/api/support`, `/api/notifications`, `/api/invoice`, `/api/admin`, `/api/storyboard` TIDAK termasuk).
   - JANGAN menambahkan `Content-Security-Policy` untuk aplikasi utama (akan merusak Next inline script dan upload ke Google Drive di Fase 5). CSP hanya dipasang di dalam iframe sandbox pada Fase 4.
3. Buat `src/lib/clearSensitiveCaches.ts`:
```ts
/** Hapus semua Cache Storage (kecuali precache aset statis Workbox). Dipanggil saat logout. */
export async function clearSensitiveCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => !n.startsWith("workbox-precache")).map((n) => caches.delete(n))
    );
  } catch {
    // abaikan
  }
}
```
   Panggil dari `LogoutButton` (lihat 1.2 langkah 5).

## 1.4 Rate-limit memakai IP yang benar (celah G-04)

**Masalah:** 19 tempat memakai `req.headers.get("x-forwarded-for") || "127.0.0.1"` langsung sebagai kunci rate-limit. Penyerang bisa mengganti header itu di tiap request untuk menghindari batas (termasuk di endpoint tanpa login seperti reset password dan cek auth). Fungsi aman `getClientIp(req)` sudah ada di `src/lib/rateLimit.ts` (hanya mempercayai header bila `TRUSTED_PROXY=true`).

### Langkah
1. Jalankan `grep -rn "x-forwarded-for" src --include=*.ts --include=*.tsx`. Ganti SETIAP pemakaian di luar `src/lib/rateLimit.ts` menjadi `getClientIp(req)` dan tambahkan `getClientIp` ke import dari `@/lib/rateLimit` (jika file sudah mengimpor `applyRateLimit` dari sana, cukup tambahkan nama `getClientIp`). Daftar file yang diketahui:
   `invoice/route.ts`, `niche-category-presets/route.ts`, `auth/reset-password/route.ts`, `auth/registration-status/route.ts` (fallback "anonymous"), `auth/check/route.ts`, `persona-presets/route.ts`, `visual-aesthetic-presets/route.ts`, `platform-options/route.ts`, `cs/contact-info/route.ts`, `channels/[id]/route.ts` (2x), `channels/[id]/products/route.ts`, `drafts/[id]/route.ts` (2x), `generate/route.ts`, `support/settings/route.ts` (fallback "anonymous"), `products/[id]/route.ts` (2x), `parsed-outputs/route.ts`.
   Untuk dua file dengan fallback `"anonymous"`, tetap pakai `getClientIp(req)` (fallback internalnya sudah aman).
2. Test guard `src/lib/__tests__/noRawForwardedFor.test.ts`: baca semua `src/**/*.ts(x)` kecuali `src/lib/rateLimit.ts` dan `__tests__`; GAGAL bila ada string `x-forwarded-for` (huruf kecil/besar diabaikan).
3. Catatan untuk laporan: efektivitas `getClientIp` bergantung pada reverse proxy (Traefik/Coolify) yang menimpa `X-Forwarded-For` dengan IP asli dan `TRUSTED_PROXY="true"` di environment. Tulis ini sebagai "langkah manual owner" di laporan.

## 1.5 Token layanan Hermes (celah G-05)

**Masalah:** di `GET /api/drafts` (`src/app/api/drafts/route.ts`, blok `HERMES API KEY BYPASS`), token dibandingkan dengan `===` (tidak constant-time), tidak ada panjang minimum, dan token itu otomatis menjadi SUPERADMIN pertama.

### Langkah
1. Buat `src/lib/serviceToken.ts`:
```ts
import crypto from "crypto";

/** Bandingkan header "Authorization: Bearer <token>" dengan secret env secara constant-time. */
export function isBearerTokenValid(
  authHeader: string | null,
  expected: string | undefined,
  minLength = 32
): boolean {
  if (!expected || expected.length < minLength) return false;
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) return false;
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!provided) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
```
2. Di `drafts/route.ts` fungsi `GET`, ganti blok bypass menjadi: (a) rate limit `applyRateLimit(\`hermes_${getClientIp(req)}\`, 30, 60)` SEBELUM membandingkan token (jika ditolak → 429); (b) `isBearerTokenValid(authHeader, process.env.HERMES_SECRET_KEY)`; (c) jika valid, cari SUPERADMIN pertama seperti sebelumnya. Bypass HANYA untuk `GET` (sudah demikian; jangan diperluas ke method lain).
3. Catat penggunaan token ke audit log: baca `src/lib/auditLog.ts`, pakai fungsi yang ada dengan `action: "SERVICE_TOKEN_DRAFTS_READ"`, `targetType: "Draft"`, dan IP. Batasi supaya hanya mencatat bila sudah lewat 5 menit sejak catatan terakhir (variabel modul `let lastHermesAuditAt = 0`). Bungkus try/catch; kegagalan log tidak boleh menggagalkan request.
4. Test `src/lib/__tests__/serviceToken.test.ts`: token benar → true; token salah → false; secret kosong → false; secret < 32 karakter → false; header tanpa "Bearer" → false; token berbeda panjang → false (tidak melempar error).
5. Di `.env.example` tambahkan komentar di atas `HERMES_SECRET_KEY` (tambahkan barisnya jika belum ada): `# Minimal 32 karakter acak. Token ini memberi akses BACA draft SUPERADMIN. Jangan dibagikan.`

## 1.6 Audit kepemilikan data (checklist wajib, hasilnya masuk laporan)

Model milik user: `Draft`, `DraftPerformance`, `ProfileChannel`, `Product` (via channel), `UsedTitle`, `ParsedOutput`, `UserApiKey`, `StoryboardPanel`, `Notification`, `SupportTicket`, `Invoice`.

Untuk SETIAP file `src/app/api/**/route.ts` KECUALI `admin/**`, `auth/**`, `cron/**`, `health`, `cs/**`, `content-archetypes` (GET publik), `support/settings`:
1. Catat semua pemanggilan `prisma.<model>.find*/update*/delete*/count*` pada model milik user di atas.
2. Pastikan SETIAP pemanggilan memenuhi salah satu: (a) `where` memuat `userId: session.user.id`; (b) mencari lewat `id` lalu langsung membandingkan `record.userId !== session.user.id` (atau `record.channel.userId` untuk `Product`) dan mengembalikan **404** (bukan 403, agar keberadaan data tidak bocor); (c) SUPERADMIN-only yang dicek eksplisit.
3. Khusus route yang menerima `channelId` dari query/body (`drafts/export`, `drafts/import-titles`, `generate`, `drafts` POST): pastikan ada pengecekan bahwa channel itu milik `session.user.id`.
4. `src/app/api/user/data-export/route.ts`: pastikan hasil ekspor TIDAK memuat `encryptedKey`, `passwordHash`, atau token apa pun. Jika memuat, hapus field itu dari `select`.
5. Tulis tabel hasil di laporan: `route | model | cara scoping | status (OK / DIPERBAIKI / TEMUAN)`. Perbaiki yang kurang (hanya perubahan scoping, tanpa mengubah respons sukses). Tambahkan 1 test per perbaikan jika memungkinkan (mock prisma dengan `vi.mock("@/lib/db")`).

## 1.7 Guard: dilarang key AI bersama (celah G-14)

**Aturan produk:** semua fitur AI untuk user memakai API key MILIK user (`UserApiKey`). Satu-satunya key milik owner yang diperbolehkan saat ini: `YOUTUBE_API_KEY` / `YOUTUBE_DATA_API_KEY` di `src/lib/researchService.ts` (riset tren; kuota bersama, dicatat sebagai keterbatasan).

Buat test `src/lib/__tests__/noSharedAiKeys.test.ts`: baca semua `src/**/*.ts(x)` kecuali `__tests__`; GAGAL bila ada pola `process.env.(OPENAI|ANTHROPIC|GEMINI|GOOGLE_AI|GROQ|MISTRAL|DEEPSEEK|OPENROUTER)[A-Z_]*` di file mana pun. Tambahkan allowlist eksplisit `["src/lib/researchService.ts"]` hanya untuk pola `YOUTUBE`. (Variabel `GOOGLE_CLIENT_ID/SECRET` untuk Fase 5 TIDAK termasuk pola ini; jangan memasukkan `GOOGLE_CLIENT` ke regex.)

## 1.8 Dokumentasi & rekonsiliasi (celah G-11, G-12)

1. Blueprint Bagian 42 (backfill #90–#92) — ikuti petunjuk di ADDENDUM; hanya meringkas isi PATCH_NOTES `[#90]`, `[#91]`, `[#92]`, jangan menambah klaim baru.
2. Bandingkan klaim di `AUDIT_REPORT_FINAL_v2.md` dengan kenyataan: jumlah file test (`find src -name "*.test.ts" | wc -l`), lokasi test, keberadaan `scripts/audit-i18n.mjs` dan `scripts/audit-design.mjs`. Tulis selisihnya di laporan. Jangan mengedit audit report lama; tambahkan satu paragraf "Catatan Rekonsiliasi 2026-10" di akhir `PATCH_NOTES.md` entri `[#93]`.

## 1.9 Definition of Done Fase 1

- [ ] `crypto.ts` v2 + AAD, 2 pemanggil diubah, upgrade lazy berjalan, 6 test lulus.
- [ ] `clientStorage.ts`, `StorageGuard`, semua `localStorage` terganti, `userId` lewat prop, `LogoutButton` membersihkan storage + cache, 2 test guard + 1 test unit lulus.
- [ ] `next.config.ts`: security headers + (bila terbukti) `runtimeCaching` NetworkOnly untuk `/api/` dan `/dashboard|admin`; temuan verifikasi `next-pwa/cache.js` dicatat.
- [ ] Nol sisa `x-forwarded-for` di luar `rateLimit.ts`; test guard lulus.
- [ ] `serviceToken.ts` + perubahan `drafts` GET + audit log + test lulus.
- [ ] Tabel audit kepemilikan lengkap di laporan; `data-export` bersih dari secret.
- [ ] `noSharedAiKeys` test lulus.
- [ ] Bagian 42 & 43 di blueprint; `[#93]` di PATCH_NOTES (tabel + detail).
- [ ] 7 perintah verifikasi lulus (atau dicatat bila `scripts/` tidak ada).
