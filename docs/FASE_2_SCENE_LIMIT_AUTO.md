# FASE 2 — BATAS 120 SCENE & MODE AUTO (PATCH `[#94]`, BLUEPRINT BAGIAN 44)

Prasyarat: baca `00_ATURAN_UMUM.md` dan pastikan Fase 1 sudah lulus semua verifikasi. Fase ini menambah batas scene maksimal, mode penghitungan scene otomatis, dan integrasi dengan ContentArchetype — fondasi untuk timeline di Fase 3.

Mulai fase ini dengan:
1. Tambahkan Bagian 44 ke `Project Prompt Gen.txt` (teks disusun agen dari isi fase ini).
2. Kerjakan tugas 2.1 s/d 2.7 berurutan.
3. Akhiri dengan verifikasi, entri PATCH_NOTES `[#94]`, dan laporan.

---

## 2.1 Konstanta scene limit

**Masalah:** `STORYBOARD_MAX_SCENE_NUMBER` di `src/lib/storyboardLimits.ts` saat ini bernilai `30`. Nilai ini hanya membatasi panel storyboard, bukan jumlah scene di prompt. Tidak ada konstanta global untuk jumlah scene maksimal yang dihasilkan AI.

### Langkah
1. Buat `src/lib/sceneLimits.ts`:

```ts
/**
 * Batas jumlah scene yang boleh diminta ke AI.
 * Maks 120 dipilih karena: rata-rata 1 scene = 3-5 detik,
 * 120 scene = 6-10 menit video, cukup untuk long-form YouTube.
 * Nilai ini dipakai di GeneratorForm (validasi input), promptGenerator
 * (injeksi instruksi ke AI), dan parsers (batas loop parseScenes).
 */
export const MAX_SCENE_COUNT = 120;
export const MIN_SCENE_COUNT = 1;
export const DEFAULT_SCENE_COUNT = 10;

/** Durasi target minimum dan maksimum (detik) */
export const MIN_TARGET_DURATION_SEC = 10;
export const MAX_TARGET_DURATION_SEC = 600;
export const DEFAULT_TARGET_DURATION_SEC = 60;

/**
 * Kalkulasi jumlah scene otomatis berdasarkan durasi target dan speech rate.
 * Rumus: ceil(durasi_detik / avg_detik_per_scene).
 * avg_detik_per_scene bergantung pada speechRate (slow=6, medium=4, fast=3).
 *
 * Hasilnya di-clamp ke [MIN_SCENE_COUNT, MAX_SCENE_COUNT].
 */
export function autoSceneCount(
  targetDurationSec: number,
  speechRate: string | number = "medium"
): number {
  const rateMap: Record<string, number> = {
    slow: 6,
    medium: 4,
    fast: 3,
  };
  const avgSecPerScene =
    typeof speechRate === "number"
      ? Math.max(2, Math.min(10, speechRate))
      : rateMap[String(speechRate).toLowerCase()] ?? 4;

  const raw = Math.ceil(targetDurationSec / avgSecPerScene);
  return Math.max(MIN_SCENE_COUNT, Math.min(MAX_SCENE_COUNT, raw));
}

/**
 * Validasi angka scene dari input user.
 * Mengembalikan angka yang sudah di-clamp, atau null jika input bukan angka.
 */
export function clampSceneCount(input: unknown): number | null {
  const n = typeof input === "number" ? input : parseInt(String(input), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(MIN_SCENE_COUNT, Math.min(MAX_SCENE_COUNT, n));
}
```

2. Test `src/lib/__tests__/sceneLimits.test.ts`:

```ts
import { autoSceneCount, clampSceneCount, MAX_SCENE_COUNT, MIN_SCENE_COUNT } from "@/lib/sceneLimits";

describe("sceneLimits", () => {
  it("autoSceneCount medium 60s -> 15 scenes", () => {
    expect(autoSceneCount(60, "medium")).toBe(15);
  });

  it("autoSceneCount slow 60s -> 10 scenes", () => {
    expect(autoSceneCount(60, "slow")).toBe(10);
  });

  it("autoSceneCount fast 60s -> 20 scenes", () => {
    expect(autoSceneCount(60, "fast")).toBe(20);
  });

  it("autoSceneCount clamps to MAX_SCENE_COUNT", () => {
    expect(autoSceneCount(9999, "fast")).toBe(MAX_SCENE_COUNT);
  });

  it("autoSceneCount clamps to MIN_SCENE_COUNT", () => {
    expect(autoSceneCount(1, "slow")).toBe(MIN_SCENE_COUNT);
  });

  it("autoSceneCount accepts numeric speechRate", () => {
    expect(autoSceneCount(120, 5)).toBe(24);
  });

  it("clampSceneCount clamps below MIN", () => {
    expect(clampSceneCount(-5)).toBe(MIN_SCENE_COUNT);
  });

  it("clampSceneCount clamps above MAX", () => {
    expect(clampSceneCount(999)).toBe(MAX_SCENE_COUNT);
  });

  it("clampSceneCount returns null for NaN", () => {
    expect(clampSceneCount("abc")).toBeNull();
  });

  it("clampSceneCount accepts string number", () => {
    expect(clampSceneCount("25")).toBe(25);
  });
});
```

---

## 2.2 Mode Auto di GeneratorForm

**Masalah:** `GeneratorForm.tsx` mempunyai field `targetSceneCount` di `videoConfig`, tetapi nilainya hardcoded tanpa batasan. Tidak ada mode "Auto" di mana AI menentukan jumlah scene dari durasi target.

### Langkah
1. Di `GeneratorForm.tsx`, cari field `targetSceneCount` (gunakan `grep -n "targetSceneCount" src/components/generator/GeneratorForm.tsx`). Tambahkan import:
   ```ts
   import {
     MAX_SCENE_COUNT, MIN_SCENE_COUNT, DEFAULT_SCENE_COUNT,
     MIN_TARGET_DURATION_SEC, MAX_TARGET_DURATION_SEC, DEFAULT_TARGET_DURATION_SEC,
     autoSceneCount, clampSceneCount,
   } from "@/lib/sceneLimits";
   import { useStorageGuard } from "@/lib/clientStorage"; // dari Fase 1
   ```

2. Tambahkan state baru di dekat state `videoConfig` yang sudah ada. **Gunakan `useStorageGuard` agar mode tidak hilang saat reload:**
   ```ts
   const [sceneCountMode, setSceneCountMode] = useStorageGuard<"auto" | "manual">(
     "sceneCountMode",
     "auto"
   );
   ```
   > **Catatan untuk AI agent:** `useStorageGuard` adalah hook dari `clientStorage.ts` (Fase 1) yang menyimpan/membaca state ke localStorage dengan key `pg:<userId>:sceneCountMode`. Jika hook ini belum ada, buat sebagai wrapper sederhana:
   > ```ts
   > function useStorageGuard<T>(key: string, defaultValue: T): [T, (v: T) => void] {
   >   const userId = useSession()?.data?.user?.id;
   >   const storageKey = userId ? `pg:${userId}:${key}` : null;
   >   const [value, setValue] = useState<T>(() => {
   >     if (!storageKey) return defaultValue;
   >     try {
   >       const raw = localStorage.getItem(storageKey);
   >       return raw !== null ? JSON.parse(raw) : defaultValue;
   >     } catch { return defaultValue; }
   >   });
   >   useEffect(() => {
   >     if (storageKey) localStorage.setItem(storageKey, JSON.stringify(value));
   >   }, [value, storageKey]);
   >   return [value, setValue];
   > }
   > ```

3. **Pastikan field `targetDurationSec` ada di `videoConfig`.** Cari dengan `grep -n "targetDurationSec" src/components/generator/GeneratorForm.tsx`. Jika field ini BELUM ada di state `videoConfig`, tambahkan input durasi target:
   ```tsx
   <div className="space-y-2">
     <label className="pg-text-sub text-sm font-medium">{t("targetDurationLabel")}</label>
     <input
       type="number"
       min={MIN_TARGET_DURATION_SEC}
       max={MAX_TARGET_DURATION_SEC}
       value={videoConfig.targetDurationSec ?? DEFAULT_TARGET_DURATION_SEC}
       onChange={(e) => {
         const v = parseInt(e.target.value, 10);
         if (Number.isFinite(v)) {
           setVideoConfig((prev) => ({
             ...prev,
             targetDurationSec: Math.max(MIN_TARGET_DURATION_SEC, Math.min(MAX_TARGET_DURATION_SEC, v)),
           }));
         }
       }}
       className="w-full px-3 py-2 rounded-lg neu-pressed pg-text-heading text-sm"
     />
     <p className="pg-text-muted text-xs">{t("targetDurationHint")}</p>
   </div>
   ```
   Jika field `targetDurationSec` SUDAH ada, JANGAN menambah input baru. Hanya pastikan validasinya memakai konstanta dari `sceneLimits.ts`.

4. Ganti UI input `targetSceneCount` yang ada menjadi:
   ```tsx
   {/* Scene Count Mode */}
   <div className="space-y-2">
     <label className="pg-text-sub text-sm font-medium">{t("sceneCountLabel")}</label>
     <div className="flex gap-2">
       <button
         type="button"
         onClick={() => setSceneCountMode("auto")}
         className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
           sceneCountMode === "auto" ? "neu-btn-brand" : "neu-btn"
         }`}
       >
         {t("sceneCountAuto")}
       </button>
       <button
         type="button"
         onClick={() => setSceneCountMode("manual")}
         className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
           sceneCountMode === "manual" ? "neu-btn-brand" : "neu-btn"
         }`}
       >
         {t("sceneCountManual")}
       </button>
     </div>
     {sceneCountMode === "manual" && (
       <input
         type="number"
         min={MIN_SCENE_COUNT}
         max={MAX_SCENE_COUNT}
         value={videoConfig.targetSceneCount ?? DEFAULT_SCENE_COUNT}
         onChange={(e) => {
           const clamped = clampSceneCount(e.target.value);
           if (clamped !== null) {
             setVideoConfig((prev) => ({ ...prev, targetSceneCount: clamped }));
           }
         }}
         className="w-full px-3 py-2 rounded-lg neu-pressed pg-text-heading text-sm"
       />
     )}
     {sceneCountMode === "auto" && (
       <p className="pg-text-muted text-xs">
         {t("sceneCountAutoHint", {
           count: autoSceneCount(
             videoConfig.targetDurationSec ?? DEFAULT_TARGET_DURATION_SEC,
             videoConfig.speechRate ?? "medium"
           ),
         })}
       </p>
     )}
   </div>
   ```

5. Di payload yang dikirim ke `/api/generate` (cari `fetch.*generate` di `GeneratorForm.tsx`), tambahkan field:
   ```ts
   sceneCountMode,
   targetSceneCount: sceneCountMode === "auto"
     ? autoSceneCount(
         videoConfig.targetDurationSec ?? DEFAULT_TARGET_DURATION_SEC,
         videoConfig.speechRate ?? "medium"
       )
     : (videoConfig.targetSceneCount ?? DEFAULT_SCENE_COUNT),
   ```

6. Key i18n baru di `messages/id.json` namespace `Generator`:
   ```json
   "sceneCountLabel": "Jumlah Scene",
   "sceneCountAuto": "Otomatis",
   "sceneCountManual": "Manual",
   "sceneCountAutoHint": "AI akan membuat ~{count} scene berdasarkan durasi dan kecepatan bicara.",
   "targetDurationLabel": "Durasi Target (detik)",
   "targetDurationHint": "Masukkan durasi video yang diinginkan (10–600 detik)."
   ```
   Salin key yang SAMA ke `messages/en.json`:
   ```json
   "sceneCountLabel": "Scene Count",
   "sceneCountAuto": "Auto",
   "sceneCountManual": "Manual",
   "sceneCountAutoHint": "AI will create ~{count} scenes based on duration and speech rate.",
   "targetDurationLabel": "Target Duration (seconds)",
   "targetDurationHint": "Enter desired video duration (10–600 seconds)."
   ```

---

## 2.3 Validasi di API generate

### Langkah
1. Di `src/app/api/generate/route.ts`, cari skema zod (biasanya `z.object({...})`). Tambahkan:
   ```ts
   sceneCountMode: z.enum(["auto", "manual"]).default("auto"),
   targetSceneCount: z.coerce.number().int().min(1).max(MAX_SCENE_COUNT).default(DEFAULT_SCENE_COUNT),
   ```
   Import `MAX_SCENE_COUNT` dan `DEFAULT_SCENE_COUNT` dari `@/lib/sceneLimits`.

2. Di blok yang membangun parameter untuk `promptGenerator`, teruskan `targetSceneCount` hasil validasi. Jangan menerima angka mentah dari client tanpa clamp; pakai `clampSceneCount()` sebagai lapisan kedua:
   ```ts
   const sceneCount = clampSceneCount(validated.targetSceneCount) ?? DEFAULT_SCENE_COUNT;
   ```

---

## 2.4 Injeksi ke promptGenerator

**Masalah:** `src/lib/promptGenerator.ts` (~114 KB) saat ini TIDAK menyebutkan batas jumlah scene di instruksi AI. AI bebas membuat berapa pun scene.

### Langkah
1. Cari fungsi utama yang membangun prompt (biasanya `buildPrompt` atau `generatePromptText`). Gunakan `grep -n "function build\|function generate" src/lib/promptGenerator.ts | head -20`.

2. Di bagian `buildStructuralInstructions` (atau blok yang setara — cari `SCENE 1` atau `structural` di file), tambahkan instruksi SEBELUM daftar scene:
   ```
   BATAS SCENE: Buat TEPAT ${sceneCount} scene (SCENE 1 sampai SCENE ${sceneCount}). DILARANG membuat lebih dari ${sceneCount} scene. Jika konten tidak cukup, gabungkan ke scene yang ada. Jika konten terlalu banyak, pilih yang paling penting.
   ```

3. Pastikan parameter `sceneCount` diterima dari argumen fungsi, BUKAN dari konstanta hardcoded. Tambahkan ke interface parameter:
   ```ts
   targetSceneCount?: number;
   ```
   Dengan default:
   ```ts
   const sceneCount = params.targetSceneCount ?? DEFAULT_SCENE_COUNT;
   ```
   Import `DEFAULT_SCENE_COUNT` dari `@/lib/sceneLimits`.

4. JANGAN mengubah logika lain di `promptGenerator.ts`. Hanya tambahkan baris instruksi scene count dan terima parameter baru. Minimal edit, maksimal dampak.

---

## 2.5 Proteksi di parser

### Langkah
1. Di `src/lib/parsers.ts`, cari fungsi `parseScenes` (gunakan `grep -n "parseScenes\|function parse" src/lib/parsers.ts`).

2. Tambahkan proteksi overflow di loop parsing:
   ```ts
   import { MAX_SCENE_COUNT } from "@/lib/sceneLimits";
   ```
   Di dalam loop yang mengumpulkan scene:
   ```ts
   if (scenes.length >= MAX_SCENE_COUNT) break;
   ```
   Ini mencegah AI yang "bandel" membuat 200+ scene dari membuat UI hang.

3. JANGAN mengubah regex atau logika parsing yang sudah ada. Hanya tambahkan guard `break`.

---

## 2.6 Update ContentArchetype (opsional)

Jika `ContentArchetype` di `prisma/schema.prisma` sudah punya field JSON `features` atau `settings`:
1. Tambahkan `defaultSceneCount` ke dokumentasi field tersebut (komentar Prisma).
2. Di `AdminArchetypesTab.tsx` form edit, tambahkan input `defaultSceneCount` (opsional) dengan clamp `MIN_SCENE_COUNT`-`MAX_SCENE_COUNT`.

Jika TIDAK ada field settings di `ContentArchetype`, LEWATI langkah ini dan catat di laporan. Jangan menambah migrasi baru hanya untuk field opsional.

---

## 2.7 Test parser guard

Tambahkan test di `src/lib/__tests__/parsers.test.ts`:

```ts
import { MAX_SCENE_COUNT } from "@/lib/sceneLimits";

describe("parseScenes overflow guard", () => {
  it("stops parsing at MAX_SCENE_COUNT even if AI returns more", () => {
    // Bangun output AI palsu dengan 200 scene
    const lines: string[] = [];
    for (let i = 1; i <= 200; i++) {
      lines.push(`**SCENE ${i}:**`);
      lines.push(`Narasi: Scene ${i} narration text.`);
      lines.push(`Visual Prompt: Scene ${i} visual.`);
      lines.push("");
    }
    const fakeOutput = lines.join("\n");

    // parseScenes harus berhenti di MAX_SCENE_COUNT
    const result = parseScenes(fakeOutput);
    expect(result.length).toBe(MAX_SCENE_COUNT);
    expect(result[result.length - 1].id).toBe(MAX_SCENE_COUNT);
  });
});
```

> **Catatan:** Sesuaikan format `**SCENE N:**` di test dengan regex yang dipakai di `parseScenes`. Gunakan `grep -n "SCENE\|sceneRegex" src/lib/parsers.ts` untuk menemukan pattern yang benar.

---

## 2.8 Definition of Done Fase 2

- [ ] `sceneLimits.ts` dibuat dengan `MAX_SCENE_COUNT = 120`, `autoSceneCount()`, `clampSceneCount()`, dan konstanta durasi.
- [ ] `GeneratorForm.tsx` memiliki toggle Auto/Manual, input scene count di-clamp, **mode persisten via `useStorageGuard`**.
- [ ] Field `targetDurationSec` terverifikasi ada di `videoConfig` (atau ditambahkan dengan min/max validasi).
- [ ] `/api/generate` memvalidasi `targetSceneCount` dengan zod + `clampSceneCount()`.
- [ ] `promptGenerator.ts` menyuntikkan instruksi `BATAS SCENE: Buat TEPAT N scene`.
- [ ] `parsers.ts parseScenes` punya guard `MAX_SCENE_COUNT` break.
- [ ] 11 test lulus: 10 unit `sceneLimits` + 1 parser guard test.
- [ ] Key i18n id/en paritas (termasuk `targetDurationLabel` dan `targetDurationHint`).
- [ ] `[#94]` di PATCH_NOTES + Bagian 44 di blueprint.
- [ ] 7 perintah verifikasi lulus.
