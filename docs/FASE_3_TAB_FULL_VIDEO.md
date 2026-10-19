# FASE 3 — TAB FULL VIDEO & TIMELINE ENGINE (PATCH `[#95]`, BLUEPRINT BAGIAN 45)

Prasyarat: baca `00_ATURAN_UMUM.md` dan pastikan Fase 2 sudah lulus semua verifikasi. Fase ini menambah tab Full Video di Scene Prompt Studio dengan timeline visual, audio sync preview, dan export manifest JSON yang menjadi input untuk render engine di Fase 4.

Mulai fase ini dengan:
1. Tambahkan Bagian 45 ke `Project Prompt Gen.txt`.
2. Kerjakan tugas 3.1 s/d 3.9 berurutan.
3. Akhiri dengan verifikasi, entri PATCH_NOTES `[#95]`, dan laporan.

---

## 3.1 Feature flag

### Langkah
1. Di `src/lib/planFeatures.ts`, tambahkan entri baru di array `KNOWN_PLAN_FEATURES`:
   ```ts
   {
     key: "fullVideoStudio",
     labelKey: "featureFullVideoStudio",
     defaultValue: false   // fail-closed: premium feature
   },
   ```

2. Key i18n di `messages/id.json` namespace `Admin`:
   ```json
   "featureFullVideoStudio": "Full Video Studio"
   ```
   Di `messages/en.json`:
   ```json
   "featureFullVideoStudio": "Full Video Studio"
   ```

---

## 3.2 Data model: VideoTimeline

Fase ini TIDAK menambah tabel Prisma baru. Timeline disimpan sebagai JSON di field `Draft.generationConfig` yang sudah ada (tipe `Json?`). Struktur:

```ts
// Tipe ini ditaruh di src/types/videoTimeline.ts
export interface VideoTimelineScene {
  /** Nomor urut scene (1-indexed, dari parseScenes) */
  sceneNumber: number;
  /** Teks narasi untuk TTS */
  narration: string;
  /** Durasi scene dalam detik (dari estimatedDurationSec atau manual) */
  durationSec: number;
  /** Offset kumulatif dari awal video (detik) */
  startOffsetSec: number;
  /** Visual prompt untuk scene ini */
  visualPrompt: string;
  /** Scene context (konteks adegan) */
  sceneContext: string;
  /** Teks overlay jika ada */
  textOverlay: string;
  /** Audio file reference (base64 dari Voice Studio, atau null) */
  audioRef: string | null;
  /** Bab (chapter) jika ada grouping */
  chapter: number | null;
  chapterTitle: string | null;
}

export interface VideoTimeline {
  version: 1;
  totalDurationSec: number;
  scenes: VideoTimelineScene[];
  /** Referensi judul-judul yang sudah dipakai (UsedTitle IDs) */
  usedTitleIds: string[];
  /** Teks judul terpakai — dikirim ke AI agar tidak membahas topik yang sama */
  usedTitleTexts: string[];
  /** Metadata export */
  exportedAt: string;
  draftId: string;
  channelId: string | null;
}
```

### Langkah
1. Buat `src/types/videoTimeline.ts` dengan interface di atas. Perhatikan bahwa `usedTitleTexts` SUDAH ada di interface ini sejak awal.
2. JANGAN membuat migrasi Prisma. Data disimpan di `Draft.generationConfig` yang sudah ada.

---

## 3.3 Shared utility: formatTime

Buat `src/lib/formatTime.ts` — utility yang akan dipakai di Fase 3 dan Fase 4:

```ts
/**
 * Format detik ke string "M:SS".
 * Dipakai di VideoTimelineTab dan komponen render.
 */
export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

---

## 3.4 Timeline builder service

Buat `src/lib/timelineBuilder.ts`:

```ts
import type { SceneForExport } from "@/lib/sceneExportFormat";
import type { VideoTimeline, VideoTimelineScene } from "@/types/videoTimeline";

/**
 * Bangun VideoTimeline dari array scene hasil parseScenes().
 * Menghitung startOffsetSec secara kumulatif.
 */
export function buildTimeline(
  scenes: SceneForExport[],
  opts: {
    draftId: string;
    channelId: string | null;
    usedTitleIds: string[];
    usedTitleTexts: string[];
    defaultDurationSec?: number;
  }
): VideoTimeline {
  const defaultDur = opts.defaultDurationSec ?? 4;
  let offset = 0;

  const timelineScenes: VideoTimelineScene[] = scenes.map((s) => {
    const dur = s.estimatedDurationSec ?? defaultDur;
    const scene: VideoTimelineScene = {
      sceneNumber: s.id,
      narration: s.narasi || "",
      durationSec: dur,
      startOffsetSec: offset,
      visualPrompt: s.visual || "",
      sceneContext: s.sceneContext || "",
      textOverlay: s.teksOverlay || "",
      audioRef: null,
      chapter: s.chapter ?? null,
      chapterTitle: s.chapterTitle ?? null,
    };
    offset += dur;
    return scene;
  });

  return {
    version: 1,
    totalDurationSec: offset,
    scenes: timelineScenes,
    usedTitleIds: opts.usedTitleIds,
    usedTitleTexts: opts.usedTitleTexts,
    exportedAt: new Date().toISOString(),
    draftId: opts.draftId,
    channelId: opts.channelId,
  };
}

/**
 * Validasi integritas timeline: scene berurutan, offset konsisten.
 */
export function validateTimeline(tl: VideoTimeline): string[] {
  const errors: string[] = [];
  let expectedOffset = 0;
  for (let i = 0; i < tl.scenes.length; i++) {
    const s = tl.scenes[i];
    if (s.sceneNumber !== i + 1) {
      errors.push(`Scene ${i}: sceneNumber ${s.sceneNumber} != expected ${i + 1}`);
    }
    if (Math.abs(s.startOffsetSec - expectedOffset) > 0.01) {
      errors.push(`Scene ${i}: startOffsetSec ${s.startOffsetSec} != expected ${expectedOffset}`);
    }
    if (s.durationSec <= 0) {
      errors.push(`Scene ${i}: durationSec <= 0`);
    }
    expectedOffset += s.durationSec;
  }
  if (Math.abs(tl.totalDurationSec - expectedOffset) > 0.01) {
    errors.push(`totalDurationSec ${tl.totalDurationSec} != sum ${expectedOffset}`);
  }
  return errors;
}
```

---

## 3.5 Route UsedTitle (jika belum ada)

**Masalah:** Langkah 3.7 membutuhkan endpoint `/api/used-titles` tapi belum tentu ada.

### Langkah
1. Cari apakah route sudah ada: `grep -rn "used-titles\|UsedTitle" src/app/api/`.
2. Jika SUDAH ada route yang mengembalikan UsedTitle per channel, GUNAKAN route itu. Catat URL-nya.
3. Jika BELUM ada, buat `src/app/api/used-titles/route.ts`:

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyRateLimit, getClientIp } from "@/lib/rateLimit";
import { z } from "zod";

const querySchema = z.object({
  channelId: z.string().cuid(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await applyRateLimit(`used_titles_${getClientIp(req)}`, 30, 60);

  const parsed = querySchema.safeParse({
    channelId: req.nextUrl.searchParams.get("channelId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid channelId" }, { status: 400 });
  }

  // Ownership check: channel milik user ini?
  const channel = await prisma.profileChannel.findFirst({
    where: { id: parsed.data.channelId, userId: session.user.id },
    select: { id: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const titles = await prisma.usedTitle.findMany({
    where: { channelId: parsed.data.channelId },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json(titles);
}
```

> **Catatan:** Jika model `UsedTitle` tidak ada di `prisma/schema.prisma`, cari model yang menyimpan judul terpakai. Gunakan `grep -n "UsedTitle\|usedTitle\|used_title" prisma/schema.prisma`. Sesuaikan nama model dan field.

---

## 3.6 Tab Full Video di ScenePromptStudioClient

**Masalah:** `ScenePromptStudioClient.tsx` (~133 KB) memiliki tab-tab (berdasarkan state). Tab Full Video belum ada.

### Langkah
1. Cari daftar tab yang sudah ada: `grep -n "tab\|activeTab\|setActiveTab" src/app/[locale]/dashboard/scene-prompt/ScenePromptStudioClient.tsx | head -20`.

2. Tambahkan tab baru `"fullVideo"` ke daftar tab yang ada (biasanya array atau union type). JANGAN mengubah tab lain. Tambahkan tepat setelah tab terakhir.

3. Buat komponen terpisah `src/components/video/VideoTimelineTab.tsx`:

```tsx
"use client";
import { useTranslations } from "next-intl";
import { formatTime } from "@/lib/formatTime";
import type { VideoTimeline, VideoTimelineScene } from "@/types/videoTimeline";

interface Props {
  timeline: VideoTimeline | null;
  onExportManifest: () => void;
  onSceneClick: (sceneNumber: number) => void;
}

export default function VideoTimelineTab({ timeline, onExportManifest, onSceneClick }: Props) {
  const t = useTranslations("VideoStudio");

  if (!timeline || timeline.scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="pg-text-muted text-sm">{t("noTimeline")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="pg-text-heading text-lg font-bold">{t("timelineTitle")}</h3>
          <p className="pg-text-muted text-xs">
            {t("totalDuration", { time: formatTime(timeline.totalDurationSec) })}
            {" · "}
            {t("sceneCount", { count: timeline.scenes.length })}
          </p>
        </div>
        <button onClick={onExportManifest} className="neu-btn px-4 py-2 text-sm font-semibold">
          {t("exportManifest")}
        </button>
      </div>

      {/* Timeline bar */}
      <div className="relative w-full h-8 rounded-lg neu-pressed overflow-hidden flex">
        {timeline.scenes.map((scene) => (
          <div
            key={scene.sceneNumber}
            onClick={() => onSceneClick(scene.sceneNumber)}
            className="h-full cursor-pointer hover:opacity-80 transition-opacity pg-border border-r"
            style={{
              width: `${(scene.durationSec / timeline.totalDurationSec) * 100}%`,
              backgroundColor: scene.chapter
                ? `hsl(${(scene.chapter * 60) % 360}, 50%, 60%)`
                : "var(--pg-brand)",
            }}
            title={`Scene ${scene.sceneNumber} (${formatTime(scene.startOffsetSec)})`}
          />
        ))}
      </div>

      {/* Scene list */}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {timeline.scenes.map((scene) => (
          <SceneCard key={scene.sceneNumber} scene={scene} onClick={() => onSceneClick(scene.sceneNumber)} />
        ))}
      </div>
    </div>
  );
}

function SceneCard({ scene, onClick }: { scene: VideoTimelineScene; onClick: () => void }) {
  const t = useTranslations("VideoStudio");
  return (
    <div
      onClick={onClick}
      className="neu-flat rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold pg-text-heading">
              {t("sceneLabel", { n: scene.sceneNumber })}
            </span>
            <span className="text-xs pg-text-muted">
              {formatTime(scene.startOffsetSec)} - {formatTime(scene.startOffsetSec + scene.durationSec)}
            </span>
            {scene.chapterTitle && (
              <span className="text-xs px-2 py-0.5 rounded-full neu-sm pg-text-sub">
                {scene.chapterTitle}
              </span>
            )}
          </div>
          <p className="text-xs pg-text-sub mt-1 line-clamp-2">{scene.narration || "—"}</p>
          {scene.textOverlay && (
            <p className="text-xs pg-text-muted mt-0.5 italic">[Overlay: {scene.textOverlay}]</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-sm font-mono pg-text-heading">{scene.durationSec}s</span>
          {scene.audioRef && (
            <span className="block text-xs mt-0.5" style={{ color: "var(--pg-brand)" }}>
              {t("audioReady")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

4. Di `ScenePromptStudioClient.tsx`, render `<VideoTimelineTab>` di dalam case tab `"fullVideo"`. **Tambahkan feature flag check:**
   ```tsx
   // Di dalam switch/if activeTab
   case "fullVideo": {
     // Feature flag check
     if (!hasFeature(currentPlanFeatures, "fullVideoStudio")) {
       return (
         <div className="flex flex-col items-center justify-center py-16 gap-4">
           <p className="pg-text-muted text-sm">{t("featureNotAvailable")}</p>
           <a href={`/${locale}/dashboard/settings`} className="neu-btn-brand px-4 py-2 text-sm rounded-xl">
             {t("upgradePlan")}
           </a>
         </div>
       );
     }
     return (
       <VideoTimelineTab
         timeline={currentTimeline}
         onExportManifest={handleExportManifest}
         onSceneClick={(n) => scrollToScene(n)}
       />
     );
   }
   ```
   > **Catatan:** `hasFeature` sudah ada dari `src/lib/planFeatures.ts`. `currentPlanFeatures` harus sudah tersedia di komponen (cari dengan `grep -n "hasFeature\|planFeatures\|currentPlan" src/app/[locale]/dashboard/scene-prompt/ScenePromptStudioClient.tsx`). Jika belum, ambil dari props atau context yang meneruskan plan features user.

5. State `currentTimeline`:
   ```tsx
   const [currentTimeline, setCurrentTimeline] = useState<VideoTimeline | null>(null);
   ```

---

## 3.7 Build timeline dari parsed scenes + UsedTitle

### Langkah
1. Bangun timeline setiap kali `parsedScenes` berubah. Fetch used titles dulu:
   ```tsx
   useEffect(() => {
     if (parsedScenes.length === 0) {
       setCurrentTimeline(null);
       return;
     }

     let cancelled = false;

     async function build() {
       // Ambil used titles
       let usedTitleIds: string[] = [];
       let usedTitleTexts: string[] = [];
       if (channelId) {
         try {
           const res = await fetch(`/api/used-titles?channelId=${channelId}`);
           if (res.ok) {
             const titles = await res.json() as { id: string; title: string }[];
             usedTitleIds = titles.map((t) => t.id);
             usedTitleTexts = titles.map((t) => t.title);
           }
         } catch {
           // Non-fatal: timeline tetap dibuat tanpa used titles
         }
       }

       if (cancelled) return;

       const tl = buildTimeline(parsedScenes, {
         draftId: currentDraftId ?? "",
         channelId: channelId ?? null,
         usedTitleIds,
         usedTitleTexts,
         defaultDurationSec: 4,
       });

       // Jika ada audio dari Voice Studio, map ke timeline
       if (audioMap && audioMap.size > 0) {
         tl.scenes = tl.scenes.map((s) => ({
           ...s,
           audioRef: audioMap.get(s.sceneNumber) ?? null,
         }));
       }

       setCurrentTimeline(tl);
     }

     build();
     return () => { cancelled = true; };
   }, [parsedScenes, currentDraftId, channelId, audioMap]);
   ```

   > **Catatan untuk AI agent:**
   > - `audioMap` adalah state yang menyimpan audio per scene dari Voice Studio. Cari nama variabelnya: `grep -n "audioMap\|audioBuffers\|ttsResults\|voiceAudio" src/app/[locale]/dashboard/scene-prompt/ScenePromptStudioClient.tsx | head -20`.
   > - Jika nama variabel berbeda, sesuaikan. Jika Voice Studio belum menyimpan audio per scene ke state Map, `audioRef` tetap `null` dan tidak ada error.

---

## 3.8 Export manifest JSON

### Langkah
1. Fungsi `handleExportManifest` di `ScenePromptStudioClient.tsx`:
   ```ts
   async function handleExportManifest() {
     if (!currentTimeline) return;
     const errors = validateTimeline(currentTimeline);
     if (errors.length > 0) {
       toast.error(t("manifestValidationError"));
       console.error("Timeline validation errors:", errors);
       return;
     }
     const blob = new Blob([JSON.stringify(currentTimeline, null, 2)], { type: "application/json" });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = `timeline-${currentTimeline.draftId || "draft"}.json`;
     a.click();
     URL.revokeObjectURL(url);
     toast.success(t("manifestExported"));
   }
   ```

2. Manifest JSON ini menjadi input untuk Fase 4 (render engine). Format sudah didefinisikan di `VideoTimeline`.

---

## 3.9 Key i18n & Definition of Done

Key i18n baru di namespace `VideoStudio` (`messages/id.json`):
```json
"VideoStudio": {
  "timelineTitle": "Timeline Video",
  "totalDuration": "Total: {time}",
  "sceneCount": "{count} scene",
  "sceneLabel": "Scene {n}",
  "audioReady": "Audio siap",
  "noTimeline": "Belum ada timeline. Generate naskah terlebih dahulu.",
  "exportManifest": "Export Manifest JSON",
  "manifestExported": "Manifest berhasil diunduh.",
  "manifestValidationError": "Timeline tidak valid. Periksa konsol.",
  "tabFullVideo": "Full Video",
  "featureNotAvailable": "Fitur ini tidak tersedia di paket Anda.",
  "upgradePlan": "Upgrade Paket"
}
```
Salin key SAMA ke `messages/en.json`:
```json
"VideoStudio": {
  "timelineTitle": "Video Timeline",
  "totalDuration": "Total: {time}",
  "sceneCount": "{count} scenes",
  "sceneLabel": "Scene {n}",
  "audioReady": "Audio ready",
  "noTimeline": "No timeline yet. Generate a script first.",
  "exportManifest": "Export Manifest JSON",
  "manifestExported": "Manifest downloaded successfully.",
  "manifestValidationError": "Timeline is invalid. Check console.",
  "tabFullVideo": "Full Video",
  "featureNotAvailable": "This feature is not available on your plan.",
  "upgradePlan": "Upgrade Plan"
}
```

### Definition of Done Fase 3

- [ ] `src/types/videoTimeline.ts` dibuat dengan `VideoTimeline` (termasuk `usedTitleTexts`) dan `VideoTimelineScene`.
- [ ] `src/lib/formatTime.ts` dibuat (shared utility).
- [ ] `src/lib/timelineBuilder.ts` dibuat dengan `buildTimeline()` (menerima `usedTitleTexts`) dan `validateTimeline()`.
- [ ] Route `/api/used-titles` ada dan berfungsi (sudah ada atau baru dibuat).
- [ ] `src/components/video/VideoTimelineTab.tsx` dibuat, memakai `formatTime` dari shared utility.
- [ ] Tab "Full Video" muncul di `ScenePromptStudioClient.tsx` **dengan feature flag check `fullVideoStudio`**.
- [ ] Jika fitur tidak aktif, tampilkan pesan upgrade (bukan tab kosong).
- [ ] Timeline visual bar + scene cards render dengan benar.
- [ ] Export manifest JSON menghasilkan file valid **termasuk `usedTitleTexts`**.
- [ ] Audio sync: `audioRef` diisi dari Voice Studio data jika ada.
- [ ] Feature flag `fullVideoStudio` di `planFeatures.ts`.
- [ ] Key i18n id/en paritas (termasuk `featureNotAvailable`, `upgradePlan`).
- [ ] Test: `src/lib/__tests__/timelineBuilder.test.ts` (min 8 test: build, validate, offset, empty, max scenes, usedTitleTexts propagation).
- [ ] `[#95]` di PATCH_NOTES + Bagian 45 di blueprint.
- [ ] 7 perintah verifikasi lulus.
