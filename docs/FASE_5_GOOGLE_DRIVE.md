# FASE 5 — GOOGLE DRIVE UPLOAD & TOKEN MANAGEMENT (PATCH `[#97]`, BLUEPRINT BAGIAN 47)

Prasyarat: baca `00_ATURAN_UMUM.md` dan pastikan Fase 4 sudah lulus semua verifikasi. Fase ini menambah kemampuan upload hasil render ke Google Drive milik user, dengan OAuth2 scoped, token terenkripsi per user (memanfaatkan AAD dari Fase 1), dan revoke saat logout.

**Prinsip arsitektur:**
- Token Drive adalah milik USER, bukan milik aplikasi. Setiap user menghubungkan Google Drive-nya sendiri.
- Token disimpan terenkripsi di database dengan AAD terikat userId (dari `googleDriveAad()` di Fase 1).
- Upload menggunakan Google Drive API v3 resumable upload.
- Token di-revoke dan dihapus saat user logout atau memutuskan koneksi.
- File diupload ke folder khusus "Prompt Gen Videos" di Drive user (dibuat otomatis).

Mulai fase ini dengan:
1. Tambahkan Bagian 47 ke `Project Prompt Gen.txt`.
2. Kerjakan tugas 5.1 s/d 5.11 berurutan.
3. Akhiri dengan verifikasi, entri PATCH_NOTES `[#97]`, dan laporan.

---

## 5.1 Environment variables

### Langkah
1. Di `.env.example`, tambahkan:
   ```env
   # Google OAuth2 untuk Google Drive upload (Fase 5).
   # Dapatkan di Google Cloud Console > APIs & Services > Credentials.
   # Scope: https://www.googleapis.com/auth/drive.file (hanya file yang dibuat app).
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   # Callback URL: https://<domain>/api/auth/google-drive/callback
   GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/auth/google-drive/callback
   ```

2. Di `src/lib/env.ts`, tambahkan validasi (jangan crash kalau kosong — fitur Drive opsional):
   ```ts
   // Google Drive (opsional)
   const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
   const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
   const GOOGLE_DRIVE_REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI ?? "";

   export function isGoogleDriveConfigured(): boolean {
     return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_DRIVE_REDIRECT_URI);
   }
   ```

3. Di `src/lib/planFeatures.ts`, tambahkan feature flag:
   ```ts
   {
     key: "googleDriveUpload",
     labelKey: "featureGoogleDriveUpload",
     defaultValue: false   // fail-closed: premium feature, requires Google OAuth config
   },
   ```

---

## 5.2 Database: token storage

### Langkah
1. Tambahkan model di `prisma/schema.prisma`:
   ```prisma
   model UserGoogleDriveToken {
     id              String   @id @default(cuid())
     userId          String   @unique
     user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
     encryptedAccess String   @db.Text
     encryptedRefresh String  @db.Text
     expiresAt       DateTime
     scopes          String   @default("https://www.googleapis.com/auth/drive.file")
     folderId        String?  // ID folder "Prompt Gen Videos" di Drive user
     createdAt       DateTime @default(now())
     updatedAt       DateTime @updatedAt
   }
   ```

2. Tambahkan relasi di model `User`:
   ```prisma
   googleDriveToken UserGoogleDriveToken?
   ```

3. Buat migrasi `prisma/migrations/<YYYYMMDD>_add_google_drive_token/migration.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS "UserGoogleDriveToken" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "userId" TEXT NOT NULL UNIQUE,
     "encryptedAccess" TEXT NOT NULL,
     "encryptedRefresh" TEXT NOT NULL,
     "expiresAt" TIMESTAMP(3) NOT NULL,
     "scopes" TEXT NOT NULL DEFAULT 'https://www.googleapis.com/auth/drive.file',
     "folderId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "UserGoogleDriveToken_userId_fkey"
       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
   );
   ```

4. Jalankan `npx prisma generate`.

---

## 5.3 OAuth2 flow: connect (dengan CSRF aman)

Buat `src/app/api/auth/google-drive/route.ts` (GET — redirect ke Google):

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Google Drive not configured" }, { status: 503 });
  }

  // CSRF protection: random token disimpan di httpOnly cookie
  // JANGAN pakai userId sebagai state — userId bisa ditebak
  const csrfToken = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("gdrive_csrf", csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300, // 5 menit cukup untuk flow OAuth
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: csrfToken, // random token, BUKAN userId
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
```

---

## 5.4 OAuth2 callback (verifikasi CSRF dari cookie)

Buat `src/app/api/auth/google-drive/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";
import { encryptSecret, googleDriveAad } from "@/lib/crypto";
import { applyRateLimit, getClientIp } from "@/lib/rateLimit";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth", req.url));
  }

  await applyRateLimit(`gdrive_cb_${getClientIp(req)}`, 10, 60);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // Verifikasi CSRF: state harus cocok dengan cookie gdrive_csrf
  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get("gdrive_csrf")?.value;
  cookieStore.delete("gdrive_csrf"); // Hapus setelah dipakai (one-time use)

  if (!code || !state || !csrfCookie || state !== csrfCookie) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=gdrive_csrf", req.url));
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Google token exchange failed:", tokenRes.status);
    return NextResponse.redirect(new URL("/dashboard/settings?error=gdrive_token", req.url));
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokens.access_token) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=gdrive_no_token", req.url));
  }

  const aad = googleDriveAad(session.user.id);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.userGoogleDriveToken.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      encryptedAccess: encryptSecret(tokens.access_token, aad),
      encryptedRefresh: encryptSecret(tokens.refresh_token ?? "", aad),
      expiresAt,
    },
    update: {
      encryptedAccess: encryptSecret(tokens.access_token, aad),
      ...(tokens.refresh_token
        ? { encryptedRefresh: encryptSecret(tokens.refresh_token, aad) }
        : {}),
      expiresAt,
    },
  });

  return NextResponse.redirect(new URL("/dashboard/settings?gdrive=connected", req.url));
}
```

---

## 5.5 Token refresh, Drive service, & folder management

Buat `src/lib/googleDrive.ts`:

```ts
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret, googleDriveAad } from "@/lib/crypto";

const DRIVE_API = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_META_API = "https://www.googleapis.com/drive/v3/files";

const APP_FOLDER_NAME = "Prompt Gen Videos";

/**
 * Dapatkan access token yang valid untuk user.
 * Jika expired, refresh otomatis dan simpan token baru.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const record = await prisma.userGoogleDriveToken.findUnique({
    where: { userId },
  });
  if (!record) return null;

  const aad = googleDriveAad(userId);

  // Jika belum expired (buffer 5 menit), langsung pakai
  if (record.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return decryptSecret(record.encryptedAccess, aad);
  }

  // Refresh token
  const refreshToken = decryptSecret(record.encryptedRefresh, aad);
  if (!refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Google Drive token refresh failed:", res.status);
    // Hapus token yang sudah tidak valid
    await prisma.userGoogleDriveToken.delete({ where: { userId } }).catch(() => {});
    return null;
  }

  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  await prisma.userGoogleDriveToken.update({
    where: { userId },
    data: {
      encryptedAccess: encryptSecret(tokens.access_token, aad),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });

  return tokens.access_token;
}

/**
 * Dapatkan atau buat folder "Prompt Gen Videos" di Drive user.
 * ID folder di-cache di database agar tidak query Google setiap upload.
 */
export async function getOrCreateAppFolder(
  userId: string,
  accessToken: string
): Promise<string> {
  // 1. Cek cache di database
  const record = await prisma.userGoogleDriveToken.findUnique({
    where: { userId },
    select: { folderId: true },
  });
  if (record?.folderId) {
    // Verifikasi folder masih ada di Drive
    const checkRes = await fetch(
      `${DRIVE_META_API}/${record.folderId}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (checkRes.ok) {
      const checkData = (await checkRes.json()) as { trashed?: boolean };
      if (!checkData.trashed) return record.folderId;
    }
    // Folder dihapus user, buat baru
  }

  // 2. Cari folder yang sudah ada (by name)
  const searchRes = await fetch(
    `${DRIVE_META_API}?q=${encodeURIComponent(
      `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    )}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (searchRes.ok) {
    const searchData = (await searchRes.json()) as { files?: { id: string }[] };
    if (searchData.files && searchData.files.length > 0) {
      const folderId = searchData.files[0].id;
      await prisma.userGoogleDriveToken.update({
        where: { userId },
        data: { folderId },
      });
      return folderId;
    }
  }

  // 3. Buat folder baru
  const createRes = await fetch(DRIVE_META_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create Drive folder: ${createRes.status}`);
  }

  const folder = (await createRes.json()) as { id: string };
  await prisma.userGoogleDriveToken.update({
    where: { userId },
    data: { folderId: folder.id },
  });
  return folder.id;
}

/**
 * Upload file ke Google Drive user (resumable upload).
 * File otomatis masuk ke folder "Prompt Gen Videos".
 * Mengembalikan file ID di Drive.
 */
export async function uploadToDrive(
  userId: string,
  accessToken: string,
  file: {
    name: string;
    mimeType: string;
    data: Buffer | Blob;
  }
): Promise<{ fileId: string; webViewLink: string }> {
  // Dapatkan folder
  const folderId = await getOrCreateAppFolder(userId, accessToken);

  // Step 1: Initiate resumable upload
  const metadata = {
    name: file.name,
    mimeType: file.mimeType,
    parents: [folderId],
  };

  const initRes = await fetch(
    `${DRIVE_API}?uploadType=resumable`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    throw new Error(`Drive upload init failed: ${initRes.status}`);
  }

  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL returned");

  // Step 2: Upload file content
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.mimeType,
    },
    body: file.data,
  });

  if (!uploadRes.ok) {
    throw new Error(`Drive upload failed: ${uploadRes.status}`);
  }

  const result = (await uploadRes.json()) as { id: string };

  // Step 3: Get web view link
  const metaRes = await fetch(
    `${DRIVE_META_API}/${result.id}?fields=webViewLink`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const meta = (await metaRes.json()) as { webViewLink?: string };

  return {
    fileId: result.id,
    webViewLink: meta.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`,
  };
}

/**
 * Revoke token dan hapus dari database. Dipanggil saat disconnect atau logout.
 * File yang sudah diupload tetap ada di Drive user (milik mereka).
 */
export async function revokeGoogleDriveToken(userId: string): Promise<void> {
  const record = await prisma.userGoogleDriveToken.findUnique({
    where: { userId },
  });
  if (!record) return;

  try {
    const aad = googleDriveAad(userId);
    const accessToken = decryptSecret(record.encryptedAccess, aad);
    // Revoke di Google
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: "POST",
    });
  } catch {
    // Revoke gagal tidak boleh menggagalkan disconnect
  }

  await prisma.userGoogleDriveToken.delete({ where: { userId } }).catch(() => {});
}
```

---

## 5.6 API route: upload ke Drive (dengan feature flag + size limit)

Buat `src/app/api/user/google-drive/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { applyRateLimit } from "@/lib/rateLimit";
import { getValidAccessToken, uploadToDrive } from "@/lib/googleDrive";
import { prisma } from "@/lib/db";
import { hasFeature } from "@/lib/planFeatures";
import { z } from "zod";

/** Batas upload: 100 MB base64 = ~75 MB file asli */
const MAX_UPLOAD_BASE64 = 100 * 1024 * 1024;

const uploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(["video/webm", "video/mp4", "audio/wav", "audio/mp3"]),
  data: z.string().min(1).max(MAX_UPLOAD_BASE64),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit PER USER, bukan per IP (di shared IP, satu user spam tidak mengunci yang lain)
  await applyRateLimit(`gdrive_upload_${session.user.id}`, 5, 60);

  // Feature flag check: pastikan paket user menyertakan googleDriveUpload
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      invoices: {
        where: { paymentStatus: "PAID" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  // Dapatkan plan aktif (sesuaikan dengan cara proyek ini mengambil plan user)
  // Cari pola yang sudah ada: grep -n "hasFeature\|requireActiveSubscription" src/app/api/ -r | head -10
  // Sesuaikan kode di bawah dengan pola yang ditemukan:
  const activePlan = user?.invoices?.[0]?.plan;
  if (!activePlan || !hasFeature(activePlan.features, "googleDriveUpload")) {
    return NextResponse.json({ error: "Feature not available on your plan" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const accessToken = await getValidAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Google Drive not connected" }, { status: 403 });
  }

  try {
    const buffer = Buffer.from(parsed.data.data, "base64");
    const result = await uploadToDrive(session.user.id, accessToken, {
      name: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      data: buffer,
    });

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
    });
  } catch (err) {
    console.error("Drive upload error:", (err as Error).message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
```

Tambahkan juga konfigurasi body size limit di `next.config.ts` atau `route.ts`:
```ts
// Di atas export async function POST, tambahkan:
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "100mb",
    },
  },
};
// CATATAN: Untuk App Router (Next.js 13+), body parser limit dikonfigurasi di
// next.config.ts -> experimental.serverActions.bodySizeLimit atau via
// route segment config. Cari pola yang sudah ada di proyek.
```

---

## 5.7 API route: status

Buat `src/app/api/user/google-drive/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ connected: false });
  }

  const token = await prisma.userGoogleDriveToken.findUnique({
    where: { userId: session.user.id },
    select: { expiresAt: true, scopes: true, folderId: true },
  });

  return NextResponse.json({
    connected: !!token,
    expiresAt: token?.expiresAt ?? null,
    hasFolderSetup: !!token?.folderId,
  });
}
```

---

## 5.8 API route: disconnect

Buat `src/app/api/user/google-drive/disconnect/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { applyRateLimit } from "@/lib/rateLimit";
import { revokeGoogleDriveToken } from "@/lib/googleDrive";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit per user
  await applyRateLimit(`gdrive_disconnect_${session.user.id}`, 5, 60);

  await revokeGoogleDriveToken(session.user.id);

  return NextResponse.json({ success: true });
}
```

---

## 5.9 UI: Settings & Video Tab

### Settings page
1. Di `src/app/[locale]/dashboard/settings/SettingsClient.tsx`, tambahkan bagian Google Drive:
   - Tombol "Hubungkan Google Drive" yang redirect ke `/api/auth/google-drive`
   - Jika sudah terhubung: tampilkan status "Terhubung" + tombol "Putuskan"
   - Baca status: `GET /api/user/google-drive/status` (route dari 5.7)

### Video Tab (lanjutan Fase 4)
2. Di `VideoTimelineTab.tsx`, tambahkan tombol "Upload ke Google Drive":
   ```tsx
   {isDriveConnected && videoBlob && (
     <button
       onClick={handleUploadToDrive}
       disabled={isUploading}
       className="neu-btn px-4 py-2 text-sm font-semibold"
     >
       {isUploading ? t("uploading") : t("uploadToDrive")}
     </button>
   )}
   ```

3. Handler upload **dengan retry:**
   ```tsx
   async function handleUploadToDrive() {
     if (!videoBlob || !timeline) return;
     setIsUploading(true);

     const maxRetries = 3;
     let lastError = "";

     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         const base64 = await blobToBase64(videoBlob);
         const res = await fetch("/api/user/google-drive/upload", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             fileName: `${timeline.draftId}-render.webm`,
             mimeType: "video/webm",
             data: base64,
           }),
         });
         const data = await res.json();
         if (data.success) {
           toast.success(t("uploadSuccess"));
           window.open(data.webViewLink, "_blank");
           setIsUploading(false);
           return;
         }
         lastError = data.error || t("uploadFailed");
       } catch (err) {
         lastError = (err as Error).message || t("uploadFailed");
       }

       // Exponential backoff sebelum retry
       if (attempt < maxRetries) {
         await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
       }
     }

     toast.error(lastError);
     setIsUploading(false);
   }

   function blobToBase64(blob: Blob): Promise<string> {
     return new Promise((resolve, reject) => {
       const reader = new FileReader();
       reader.onloadend = () => {
         const base64 = (reader.result as string).split(",")[1];
         resolve(base64);
       };
       reader.onerror = reject;
       reader.readAsDataURL(blob);
     });
   }
   ```
   > **Catatan:** `videoBlob` harus tetap disimpan di state sampai upload dikonfirmasi berhasil. Jangan menghapusnya saat mulai upload.

---

## 5.10 Logout cleanup

### Langkah
1. Di `LogoutButton.tsx` (sudah dimodifikasi di Fase 1), tambahkan revoke Drive token sebelum `signOut`:
   ```tsx
   import { clearAllUserScopedStorage } from "@/lib/clientStorage";
   import { clearSensitiveCaches } from "@/lib/swCacheUtils";

   async function handleLogout() {
     clearAllUserScopedStorage();
     await clearSensitiveCaches();
     // Revoke Google Drive token (best-effort, jangan blokir logout)
     try {
       await fetch("/api/user/google-drive/disconnect", { method: "POST" });
     } catch {
       // abaikan
     }
     await signOut({ callbackUrl: `/${locale}/auth` });
   }
   ```

2. Ganti `onClick` button menjadi `handleLogout`.

3. Pastikan `data-export` (`src/app/api/user/data-export/route.ts`) TIDAK memuat `encryptedAccess` atau `encryptedRefresh` dari `UserGoogleDriveToken`. Jika model ter-include via `User.include`, tambahkan ke `select` exclusion:
   ```ts
   // Di data-export route, pastikan:
   const user = await prisma.user.findUnique({
     where: { id: session.user.id },
     include: {
       // ... include lain ...
       // JANGAN include googleDriveToken, atau jika di-include:
       googleDriveToken: {
         select: {
           scopes: true,
           expiresAt: true,
           // JANGAN select: encryptedAccess, encryptedRefresh
         },
       },
     },
   });
   ```

---

## 5.11 Key i18n & Test

Key i18n baru di namespace `Settings` dan `VideoStudio`:

`messages/id.json`:
```json
"connectGoogleDrive": "Hubungkan Google Drive",
"disconnectGoogleDrive": "Putuskan Google Drive",
"driveConnected": "Google Drive terhubung",
"driveNotConnected": "Google Drive belum terhubung",
"uploadToDrive": "Upload ke Google Drive",
"uploading": "Mengupload...",
"uploadSuccess": "Video berhasil diupload ke Google Drive.",
"uploadFailed": "Upload gagal.",
"featureGoogleDriveUpload": "Google Drive Upload"
```

`messages/en.json`:
```json
"connectGoogleDrive": "Connect Google Drive",
"disconnectGoogleDrive": "Disconnect Google Drive",
"driveConnected": "Google Drive connected",
"driveNotConnected": "Google Drive not connected",
"uploadToDrive": "Upload to Google Drive",
"uploading": "Uploading...",
"uploadSuccess": "Video uploaded to Google Drive successfully.",
"uploadFailed": "Upload failed.",
"featureGoogleDriveUpload": "Google Drive Upload"
```

### Test baru
- `src/lib/__tests__/googleDrive.test.ts`: mock `prisma` dan `fetch`; test `getValidAccessToken` (expired -> refresh, valid -> return, missing -> null); test `revokeGoogleDriveToken` (delete + revoke call); test `getOrCreateAppFolder` (cached folder, create new).
- Perluas `src/lib/__tests__/noRawForwardedFor.test.ts` untuk menyertakan semua route Google Drive baru.
- Perluas `src/lib/__tests__/noSharedAiKeys.test.ts` — pastikan `GOOGLE_CLIENT_ID/SECRET` TIDAK cocok dengan pattern AI key.

---

## 5.12 Definition of Done Fase 5

- [ ] `.env.example` memuat `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI`.
- [ ] `UserGoogleDriveToken` model di Prisma + migrasi SQL idempotent, **termasuk field `folderId`**.
- [ ] OAuth2 flow: `/api/auth/google-drive` redirect **dengan CSRF cookie (bukan userId)** + `/api/auth/google-drive/callback` verifikasi cookie.
- [ ] `googleDrive.ts`: `getValidAccessToken` (auto-refresh), `uploadToDrive` (resumable, **ke folder app**), `revokeGoogleDriveToken`, `getOrCreateAppFolder`.
- [ ] `/api/user/google-drive/status` GET — return `{ connected, expiresAt, hasFolderSetup }`.
- [ ] `/api/user/google-drive/upload` POST — **rate-limited per userId**, **feature flag check**, **upload size max 100 MB base64**.
- [ ] `/api/user/google-drive/disconnect` POST — revoke + hapus token, rate-limited per userId.
- [ ] Token terenkripsi dengan `googleDriveAad(userId)` (AAD dari Fase 1).
- [ ] `data-export` tidak memuat token terenkripsi.
- [ ] `LogoutButton` memanggil disconnect sebelum signOut.
- [ ] UI Settings: connect/disconnect button.
- [ ] UI Video Tab: upload button **dengan retry 3x + exponential backoff**.
- [ ] Feature flag `googleDriveUpload` di `planFeatures.ts`.
- [ ] Key i18n id/en paritas.
- [ ] Min 8 test lulus (termasuk folder management).
- [ ] `[#97]` di PATCH_NOTES + Bagian 47 di blueprint.
- [ ] 7 perintah verifikasi lulus.

---

## SELESAI — RINGKASAN SELURUH FASE

| Fase | Patch | Bagian | Inti |
|------|-------|--------|------|
| 1 | `[#93]` | 43 | Isolasi per user, AAD, rate-limit IP, constant-time token |
| 2 | `[#94]` | 44 | Scene limit 120, mode Auto persisten, proteksi parser |
| 3 | `[#95]` | 45 | Tab Full Video + feature flag, timeline engine, manifest JSON, UsedTitle |
| 4 | `[#96]` | 46 | AI animation code, sandbox iframe, sequential render, audio mixer, CSP |
| 5 | `[#97]` | 47 | Google Drive OAuth2 (CSRF-safe), folder management, resumable upload, token lifecycle |

Setelah Fase 5, seluruh pipeline kreator video lengkap: generate naskah -> timeline -> AI buat animasi -> render di browser -> upload ke Drive (folder terorganisir).
