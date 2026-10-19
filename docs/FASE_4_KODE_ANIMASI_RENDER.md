# FASE 4 — KODE ANIMASI & RENDER ENGINE (PATCH `[#96]`, BLUEPRINT BAGIAN 46)

Prasyarat: baca `00_ATURAN_UMUM.md` dan pastikan Fase 3 sudah lulus semua verifikasi. Fase ini adalah inti fitur: AI eksternal menulis kode animasi HTML dari skrip, aplikasi merender di browser via sandbox iframe, dan hasilnya diunduh sebagai video.

**Arsitektur inti (dikonfirmasi pemilik):**
- AI EKSTERNAL (bukan server) menulis kode animasi baru dari skrip.
- Aplikasi hanya merender kode tersebut di browser.
- Satu file HTML self-contained, tanpa library eksternal, tanpa akses network.
- Render deterministik via `window.__anim.seek(t)`.

Mulai fase ini dengan:
1. Tambahkan Bagian 46 ke `Project Prompt Gen.txt`.
2. Kerjakan tugas 4.1 s/d 4.10 berurutan.
3. Akhiri dengan verifikasi, entri PATCH_NOTES `[#96]`, dan laporan.

---

## 4.1 Kontrak kode animasi

Buat `src/lib/animationContract.ts`:

```ts
/**
 * Kontrak yang WAJIB dipenuhi oleh kode HTML animasi buatan AI.
 *
 * AI menghasilkan SATU file HTML self-contained yang:
 * 1. Tidak memuat library eksternal (no CDN, no import, no fetch).
 * 2. Tidak mengakses jaringan (no XMLHttpRequest, no WebSocket, no fetch).
 * 3. Menyediakan objek global window.__anim dengan method:
 *    - seek(timeSec: number): void  -- lompat ke waktu tertentu
 *    - getDuration(): number        -- total durasi animasi (detik)
 *    - getReadyPromise(): Promise<void> -- resolve saat siap render
 * 4. Merender ke <canvas id="anim-canvas"> berukuran 1920x1080 (atau sesuai aspect ratio).
 * 5. Tidak memunculkan alert/confirm/prompt.
 * 6. Tidak mengakses localStorage/sessionStorage/IndexedDB.
 */

export const ANIMATION_CONTRACT_VERSION = 1;

export const CANVAS_ID = "anim-canvas";
export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;
export const DEFAULT_FPS = 30;

/** Batas ukuran kode HTML animasi: 2 MB */
export const MAX_HTML_SIZE = 2 * 1024 * 1024;

export interface AnimationContract {
  /** seek ke waktu tertentu (detik). Frame harus ter-render sinkron setelah panggilan ini. */
  seek(timeSec: number): void;
  /** Total durasi animasi dalam detik. */
  getDuration(): number;
  /** Promise yang resolve saat animasi siap dirender (aset internal dimuat, canvas siap). */
  getReadyPromise(): Promise<void>;
}

/**
 * Template minimal yang WAJIB ada di HTML animasi.
 * AI menyisipkan logika animasi di dalam blok <script>.
 */
export const HTML_TEMPLATE_SKELETON = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: {{WIDTH}}px; height: {{HEIGHT}}px; overflow: hidden; background: #000; }
  #${CANVAS_ID} { width: {{WIDTH}}px; height: {{HEIGHT}}px; }
</style>
</head>
<body>
<canvas id="${CANVAS_ID}" width="{{WIDTH}}" height="{{HEIGHT}}"></canvas>
<script>
(function() {
  const canvas = document.getElementById("${CANVAS_ID}");
  const ctx = canvas.getContext("2d");

  // === KODE ANIMASI AI DIMULAI DI SINI ===
  {{ANIMATION_CODE}}
  // === KODE ANIMASI AI SELESAI ===

  window.__anim = {
    seek: function(t) { /* AI implementasi */ },
    getDuration: function() { return {{TOTAL_DURATION}}; },
    getReadyPromise: function() { return Promise.resolve(); }
  };
})();
</script>
</body>
</html>`;

/**
 * Validasi kode HTML animasi sebelum dimasukkan ke iframe.
 * Mengembalikan array string error (kosong = valid).
 *
 * PENTING: Semua regex TANPA flag `g` (global). Flag `g` menyebabkan
 * `.test()` menjadi stateful via `lastIndex`, sehingga panggilan
 * kedua berturut-turut bisa memberi hasil berbeda. Hanya flag `i`
 * (case-insensitive) yang dipakai.
 */
export function validateAnimationCode(html: string): string[] {
  const errors: string[] = [];

  // Batas ukuran
  if (html.length > MAX_HTML_SIZE) {
    errors.push(`Kode HTML terlalu besar: ${(html.length / 1024 / 1024).toFixed(1)} MB (maks ${MAX_HTML_SIZE / 1024 / 1024} MB).`);
    return errors; // Langsung return, tidak perlu parse lebih lanjut
  }

  // Wajib ada canvas
  if (!html.includes(CANVAS_ID)) {
    errors.push(`Canvas dengan id "${CANVAS_ID}" tidak ditemukan.`);
  }

  // Wajib ada window.__anim
  if (!html.includes("window.__anim") && !html.includes("__anim")) {
    errors.push("window.__anim tidak ditemukan.");
  }

  // Dilarang: akses jaringan
  // CATATAN: Flag `i` saja, TANPA `g` — lihat komentar di atas.
  const networkPatterns: [RegExp, string][] = [
    [/\bfetch\s*\(/i, "fetch()"],
    [/\bXMLHttpRequest\b/i, "XMLHttpRequest"],
    [/\bWebSocket\b/i, "WebSocket"],
    [/\bimport\s*\(/i, "dynamic import()"],
    [/\bimport\s+/i, "static import"],
    [/src\s*=\s*["']https?:/i, "external src"],
    [/href\s*=\s*["']https?:/i, "external href"],
  ];
  for (const [pat, label] of networkPatterns) {
    if (pat.test(html)) {
      errors.push(`Akses jaringan terdeteksi: ${label}`);
    }
  }

  // Dilarang: storage
  const storagePatterns: [RegExp, string][] = [
    [/\blocalStorage\b/i, "localStorage"],
    [/\bsessionStorage\b/i, "sessionStorage"],
    [/\bindexedDB\b/i, "indexedDB"],
  ];
  for (const [pat, label] of storagePatterns) {
    if (pat.test(html)) {
      errors.push(`Akses storage terdeteksi: ${label}`);
    }
  }

  // Dilarang: dialog
  const dialogPatterns: [RegExp, string][] = [
    [/\balert\s*\(/i, "alert()"],
    [/\bconfirm\s*\(/i, "confirm()"],
    [/\bprompt\s*\(/i, "prompt()"],
  ];
  for (const [pat, label] of dialogPatterns) {
    if (pat.test(html)) {
      errors.push(`Dialog terdeteksi: ${label}`);
    }
  }

  return errors;
}
```

---

## 4.2 Prompt builder untuk AI animasi

Buat `src/lib/animationPromptBuilder.ts`:

```ts
import type { VideoTimeline } from "@/types/videoTimeline";
import { CANVAS_ID, DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_FPS, ANIMATION_CONTRACT_VERSION } from "@/lib/animationContract";

/**
 * Bangun prompt yang diberikan ke AI eksternal untuk menghasilkan kode animasi HTML.
 *
 * Prompt ini berisi:
 * 1. Kontrak teknis (apa yang wajib dan dilarang).
 * 2. Timeline scene (nomor, durasi, narasi, visual prompt, overlay).
 * 3. Daftar judul terpakai (agar AI tidak membahas topik yang sama).
 * 4. Instruksi output (satu blok HTML).
 */
export function buildAnimationPrompt(
  timeline: VideoTimeline,
  opts?: {
    width?: number;
    height?: number;
    fps?: number;
    additionalInstructions?: string;
  }
): string {
  const w = opts?.width ?? DEFAULT_WIDTH;
  const h = opts?.height ?? DEFAULT_HEIGHT;
  const fps = opts?.fps ?? DEFAULT_FPS;

  const lines: string[] = [];

  // === HEADER ===
  lines.push("# INSTRUKSI PEMBUATAN KODE ANIMASI VIDEO");
  lines.push("");
  lines.push(`Contract Version: ${ANIMATION_CONTRACT_VERSION}`);
  lines.push(`Canvas: ${w}x${h} px, ${fps} FPS`);
  lines.push(`Canvas ID: "${CANVAS_ID}"`);
  lines.push(`Total Durasi: ${timeline.totalDurationSec} detik`);
  lines.push(`Jumlah Scene: ${timeline.scenes.length}`);
  lines.push("");

  // === KONTRAK WAJIB ===
  lines.push("## KONTRAK WAJIB (SEMUA POIN HARUS DIPENUHI)");
  lines.push("");
  lines.push("1. Output HANYA satu file HTML lengkap (dari <!DOCTYPE html> sampai </html>).");
  lines.push("2. Semua kode JavaScript di dalam <script> tag. Tidak ada file eksternal.");
  lines.push(`3. Canvas element: <canvas id="${CANVAS_ID}" width="${w}" height="${h}">.`);
  lines.push("4. Wajib menyediakan objek global window.__anim dengan:");
  lines.push("   - seek(timeSec): render frame pada waktu tertentu secara SINKRON.");
  lines.push("   - getDuration(): return total durasi dalam detik.");
  lines.push("   - getReadyPromise(): return Promise yang resolve saat siap.");
  lines.push("5. DILARANG: fetch(), XMLHttpRequest, WebSocket, import, CDN.");
  lines.push("6. DILARANG: localStorage, sessionStorage, IndexedDB.");
  lines.push("7. DILARANG: alert(), confirm(), prompt().");
  lines.push("8. DILARANG: requestAnimationFrame loop. Animasi dikontrol sepenuhnya via seek().");
  lines.push("9. Semua aset visual (warna, bentuk, teks) dibangun lewat Canvas 2D API.");
  lines.push("10. Teks narasi TIDAK ditampilkan di canvas (audio terpisah).");
  lines.push("11. Text overlay (jika ada) DITAMPILKAN di canvas sesuai timing.");
  lines.push("");

  // === TIMELINE SCENE ===
  lines.push("## TIMELINE SCENE");
  lines.push("");
  for (const scene of timeline.scenes) {
    lines.push(`### SCENE ${scene.sceneNumber}`);
    lines.push(`- Mulai: ${scene.startOffsetSec}s | Durasi: ${scene.durationSec}s`);
    lines.push(`- Visual: ${scene.visualPrompt || "(tidak ada)"}`);
    lines.push(`- Konteks: ${scene.sceneContext || "(tidak ada)"}`);
    if (scene.textOverlay) {
      lines.push(`- Text Overlay: "${scene.textOverlay}"`);
    }
    if (scene.chapterTitle) {
      lines.push(`- Bab: ${scene.chapterTitle}`);
    }
    lines.push("");
  }

  // === JUDUL TERPAKAI (BLACKLIST) ===
  if (timeline.usedTitleTexts && timeline.usedTitleTexts.length > 0) {
    lines.push("## JUDUL & TOPIK YANG SUDAH TERPAKAI (DILARANG DIBAHAS ULANG)");
    lines.push("");
    lines.push("Berikut daftar judul yang sudah pernah digunakan di channel ini.");
    lines.push("DILARANG membuat animasi yang membahas topik atau judul yang sama:");
    lines.push("");
    for (const title of timeline.usedTitleTexts) {
      lines.push(`- "${title}"`);
    }
    lines.push("");
  }

  // === INSTRUKSI TAMBAHAN ===
  if (opts?.additionalInstructions) {
    lines.push("## INSTRUKSI TAMBAHAN DARI KREATOR");
    lines.push("");
    lines.push(opts.additionalInstructions);
    lines.push("");
  }

  // === OUTPUT ===
  lines.push("## FORMAT OUTPUT");
  lines.push("");
  lines.push("Berikan HANYA kode HTML lengkap. Tidak ada penjelasan, tidak ada markdown.");
  lines.push("Mulai dengan <!DOCTYPE html> dan akhiri dengan </html>.");

  return lines.join("\n");
}
```

---

## 4.3 Sandbox iframe renderer

Buat `src/components/video/AnimationRenderer.tsx`:

```tsx
"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { validateAnimationCode, CANVAS_ID } from "@/lib/animationContract";

interface Props {
  htmlCode: string | null;
  onReady: () => void;
  onError: (error: string) => void;
  width?: number;
  height?: number;
}

/**
 * Merender kode HTML animasi di dalam iframe sandbox.
 *
 * KEAMANAN:
 * - sandbox="allow-scripts" (TANPA allow-same-origin)
 * - Iframe tidak bisa mengakses parent DOM, cookie, localStorage
 * - Komunikasi via postMessage saja
 * - Kode divalidasi sebelum dimasukkan
 */
export default function AnimationRenderer({
  htmlCode,
  onReady,
  onError,
  width = 1920,
  height = 1080,
}: Props) {
  const t = useTranslations("VideoStudio");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const loadAnimation = useCallback(() => {
    if (!htmlCode || !iframeRef.current) return;

    // Validasi keamanan
    const errors = validateAnimationCode(htmlCode);
    if (errors.length > 0) {
      setStatus("error");
      onError(errors.join("; "));
      return;
    }

    setStatus("loading");

    // Inject kode ke iframe via srcdoc
    // PENTING: sandbox="allow-scripts" tanpa allow-same-origin
    // berarti iframe tidak bisa mengakses parent window.
    // Komunikasi via postMessage.
    const wrappedHtml = htmlCode.replace(
      "</body>",
      `<script>
        // Bridge: expose __anim via postMessage ke parent
        window.addEventListener("message", function(e) {
          if (e.data && e.data.type === "seek" && window.__anim) {
            window.__anim.seek(e.data.time);
            // Capture canvas frame dan kirim balik
            var canvas = document.getElementById("${CANVAS_ID}");
            if (canvas) {
              parent.postMessage({
                type: "frame",
                dataUrl: canvas.toDataURL("image/png"),
                time: e.data.time
              }, "*");
            }
          }
          if (e.data && e.data.type === "getDuration" && window.__anim) {
            parent.postMessage({
              type: "duration",
              value: window.__anim.getDuration()
            }, "*");
          }
        });

        // Notify parent saat ready
        if (window.__anim && window.__anim.getReadyPromise) {
          window.__anim.getReadyPromise().then(function() {
            parent.postMessage({ type: "ready" }, "*");
          });
        } else {
          parent.postMessage({ type: "ready" }, "*");
        }
      </script></body>`
    );

    iframeRef.current.srcdoc = wrappedHtml;
  }, [htmlCode, onError]);

  // Listen for messages from iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== "string") return;

      if (e.data.type === "ready") {
        setStatus("ready");
        onReady();
      } else if (e.data.type === "error") {
        setStatus("error");
        onError(e.data.message || "Unknown iframe error");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onReady, onError]);

  useEffect(() => {
    loadAnimation();
  }, [loadAnimation]);

  const displayWidth = Math.min(width, 960);
  const displayHeight = (displayWidth / width) * height;

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-xl overflow-hidden neu-pressed"
        style={{ width: displayWidth, height: displayHeight }}
      >
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          title="Animation Preview"
          style={{
            width: width,
            height: height,
            transform: `scale(${displayWidth / width})`,
            transformOrigin: "top left",
            border: "none",
          }}
        />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="pg-text-heading text-sm animate-pulse">{t("loading")}</span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <span className="text-sm" style={{ color: "var(--pg-danger)" }}>{t("renderError")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 4.4 Frame capture & video assembly (SEQUENTIAL)

Buat `src/lib/videoAssembler.ts`:

**PENTING:** Frame harus diambil secara SEQUENTIAL — kirim `seek(t)`, tunggu respons `frame` dari iframe, baru lanjut ke frame berikutnya. JANGAN gunakan loop `requestAnimationFrame` yang fire-and-forget.

```ts
import { DEFAULT_FPS } from "@/lib/animationContract";

export interface RenderProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
}

/**
 * Tunggu satu frame dari iframe via postMessage.
 * Mengembalikan data URL gambar frame tersebut.
 */
function waitForFrame(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Frame timeout"));
    }, timeoutMs);

    function handler(e: MessageEvent) {
      if (e.data?.type === "frame") {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve(e.data.dataUrl as string);
      }
    }
    window.addEventListener("message", handler);
  });
}

/**
 * Decode data URL ke Image element yang siap digambar ke canvas.
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Render semua frame dari animasi via seek(), lalu gabungkan menjadi video WebM.
 *
 * Alur SEQUENTIAL (bukan paralel):
 * 1. Hitung total frame = durasi * fps.
 * 2. Untuk tiap frame:
 *    a. Kirim seek(t) ke iframe via postMessage.
 *    b. TUNGGU respons "frame" dari iframe (dataUrl).
 *    c. Gambar dataUrl ke offscreen canvas.
 *    d. MediaRecorder merekam canvas stream.
 * 3. Setelah semua frame selesai, stop MediaRecorder dan kembalikan Blob video.
 *
 * CATATAN: Pendekatan ini berjalan di browser. Tidak ada server-side rendering.
 */
export async function assembleVideo(
  iframeEl: HTMLIFrameElement,
  totalDurationSec: number,
  onProgress?: (p: RenderProgress) => void,
  opts?: { fps?: number; mimeType?: string; frameTimeoutMs?: number }
): Promise<Blob> {
  const fps = opts?.fps ?? DEFAULT_FPS;
  const totalFrames = Math.ceil(totalDurationSec * fps);
  const frameTimeout = opts?.frameTimeoutMs ?? 5000;

  // Buat offscreen canvas untuk menampung frame
  const offscreen = document.createElement("canvas");
  offscreen.width = 1920;
  offscreen.height = 1080;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) throw new Error("Cannot get 2d context");

  const stream = offscreen.captureStream(fps);
  const mimeType = opts?.mimeType ?? "video/webm;codecs=vp9";
  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm",
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  // === RENDER LOOP SEQUENTIAL ===
  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;

    // 1. Kirim seek ke iframe
    iframeEl.contentWindow?.postMessage({ type: "seek", time: t }, "*");

    // 2. TUNGGU respons frame (BLOCKING per frame)
    const dataUrl = await waitForFrame(frameTimeout);

    // 3. Gambar ke offscreen canvas
    const img = await loadImage(dataUrl);
    offCtx.drawImage(img, 0, 0, offscreen.width, offscreen.height);

    // 4. Update progress
    onProgress?.({
      currentFrame: frame + 1,
      totalFrames,
      percent: Math.round(((frame + 1) / totalFrames) * 100),
    });

    // 5. Yield ke browser agar tidak freeze UI
    await new Promise((r) => setTimeout(r, 0));
  }

  // Stop recording dan tunggu blob
  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.onerror = (e) => reject(e);
    recorder.stop();
  });
}
```

---

## 4.5 Audio mixer (WebAudio)

Buat `src/lib/audioMixer.ts`:

```ts
import type { VideoTimelineScene } from "@/types/videoTimeline";

/**
 * Gabungkan audio narasi per-scene menjadi satu AudioBuffer sesuai timeline.
 *
 * Setiap scene.audioRef berisi base64-encoded audio (dari Voice Studio).
 * Audio ditempatkan pada posisi startOffsetSec di output buffer.
 */
export async function mixAudio(
  scenes: VideoTimelineScene[],
  totalDurationSec: number,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, sampleRate * totalDurationSec, sampleRate);

  for (const scene of scenes) {
    if (!scene.audioRef) continue;

    try {
      // Decode base64 audio
      const binary = atob(scene.audioRef.replace(/^data:[^;]+;base64,/, ""));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(scene.startOffsetSec);
    } catch {
      console.error(`Audio decode failed for scene ${scene.sceneNumber}`);
    }
  }

  return ctx.startRendering();
}

/**
 * Konversi AudioBuffer ke WAV Blob untuk download.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  const data = buffer.getChannelData(0);
  const dataLength = data.length * (bitsPerSample / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });

  function writeString(dv: DataView, pos: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      dv.setUint8(pos + i, str.charCodeAt(i));
    }
  }
}
```

**Catatan tentang penggabungan video + audio:** Saat ini video (WebM) dan audio (WAV) diunduh sebagai file terpisah. Untuk menggabungkan keduanya menjadi satu file MP4/WebM, diperlukan salah satu:
- **Opsi A (rekomendasi masa depan):** FFmpeg.wasm di browser — `npm install @ffmpeg/ffmpeg @ffmpeg/core`, lalu merge client-side.
- **Opsi B:** Server-side ffmpeg endpoint (memerlukan binary ffmpeg di server).
- **Opsi C:** Gunakan `MediaRecorder` dengan `AudioContext.destination` yang sudah di-mix ke canvas stream, sehingga audio + video direkam bersamaan.

Untuk Fase 4 ini, **Opsi terpisah (2 file download)** sudah cukup. Penggabungan bisa ditambahkan sebagai peningkatan setelah seluruh pipeline berjalan.

---

## 4.6 CSP header untuk route render

**Masalah:** Halaman yang memuat iframe sandbox memerlukan CSP yang mengizinkan `blob:` dan `data:` untuk `canvas.toDataURL()`.

### Langkah
1. Cari konfigurasi CSP: `grep -rn "Content-Security-Policy\|csp\|CSP" src/middleware.ts next.config.ts next.config.js | head -10`.
2. Pastikan CSP untuk route `/dashboard/scene-prompt` menyertakan:
   ```
   img-src 'self' blob: data:;
   media-src 'self' blob:;
   frame-src 'self' blob:;
   ```
3. Jika CSP dikonfigurasi di `next.config.ts` headers, tambahkan override khusus untuk route ini. Jika di `middleware.ts`, tambahkan kondisi path.
4. JANGAN melonggarkan CSP secara global. Hanya untuk route yang membutuhkan render.

---

## 4.7 UI: Render di Full Video Tab

Di `src/components/video/VideoTimelineTab.tsx` (dibuat di Fase 3), tambahkan bagian render:

### Langkah
1. Tambahkan import dan state:
   ```tsx
   import { useState } from "react";
   import AnimationRenderer from "@/components/video/AnimationRenderer";
   import { assembleVideo, type RenderProgress } from "@/lib/videoAssembler";
   import { MAX_HTML_SIZE } from "@/lib/animationContract";
   ```

   ```tsx
   const [animationHtml, setAnimationHtml] = useState<string | null>(null);
   const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
   const [isRendering, setIsRendering] = useState(false);
   const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
   ```

2. Tambahkan textarea untuk paste kode HTML animasi dari AI, **dengan batas ukuran:**
   ```tsx
   <div className="space-y-2">
     <label className="pg-text-sub text-sm font-medium">{t("pasteAnimationCode")}</label>
     <textarea
       value={animationHtml ?? ""}
       onChange={(e) => {
         const val = e.target.value;
         if (val.length > MAX_HTML_SIZE) {
           toast.error(t("htmlTooLarge"));
           return;
         }
         setAnimationHtml(val || null);
       }}
       placeholder={t("pasteAnimationCodeHint")}
       rows={6}
       className="w-full px-3 py-2 rounded-lg neu-pressed pg-text-heading text-xs font-mono"
     />
     <p className="pg-text-muted text-xs">
       {t("htmlSizeInfo", { current: ((animationHtml?.length ?? 0) / 1024).toFixed(0), max: (MAX_HTML_SIZE / 1024 / 1024).toFixed(0) })}
     </p>
   </div>
   ```

3. Tombol render + progress bar:
   ```tsx
   <button
     onClick={handleRender}
     disabled={!animationHtml || isRendering}
     className="neu-btn-brand px-6 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
   >
     {isRendering ? t("rendering", { percent: renderProgress?.percent ?? 0 }) : t("startRender")}
   </button>
   {renderProgress && (
     <div className="w-full h-2 rounded-full neu-pressed overflow-hidden">
       <div
         className="h-full rounded-full transition-all"
         style={{
           width: `${renderProgress.percent}%`,
           backgroundColor: "var(--pg-brand)",
         }}
       />
     </div>
   )}
   ```

4. Render `<AnimationRenderer>` saat ada kode:
   ```tsx
   {animationHtml && (
     <AnimationRenderer
       htmlCode={animationHtml}
       onReady={() => setStatus("ready")}
       onError={(err) => toast.error(err)}
     />
   )}
   ```

---

## 4.8 Download hasil

### Langkah
1. Download video:
   ```tsx
   async function handleDownloadVideo() {
     if (!videoBlob) return;
     const url = URL.createObjectURL(videoBlob);
     const a = document.createElement("a");
     a.href = url;
     a.download = `video-${timeline?.draftId || "render"}.webm`;
     a.click();
     URL.revokeObjectURL(url);
     toast.success(t("downloadComplete"));
   }
   ```

2. Download audio (jika ada):
   ```tsx
   async function handleDownloadAudio() {
     if (!timeline) return;
     const scenesWithAudio = timeline.scenes.filter((s) => s.audioRef);
     if (scenesWithAudio.length === 0) {
       toast.error(t("noAudioAvailable"));
       return;
     }
     const mixed = await mixAudio(timeline.scenes, timeline.totalDurationSec);
     const wavBlob = audioBufferToWav(mixed);
     const url = URL.createObjectURL(wavBlob);
     const a = document.createElement("a");
     a.href = url;
     a.download = `audio-${timeline.draftId || "render"}.wav`;
     a.click();
     URL.revokeObjectURL(url);
   }
   ```

---

## 4.9 Prompt copy button

### Langkah
1. Tambahkan tombol "Copy Prompt untuk AI":
   ```tsx
   async function handleCopyPrompt() {
     if (!currentTimeline) return;
     const prompt = buildAnimationPrompt(currentTimeline, {
       additionalInstructions: additionalInstructions || undefined,
     });
     await navigator.clipboard.writeText(prompt);
     toast.success(t("promptCopied"));
   }
   ```

2. UI:
   ```tsx
   <button onClick={handleCopyPrompt} className="neu-btn px-4 py-2 text-sm font-semibold">
     {t("copyAnimationPrompt")}
   </button>
   ```

---

## 4.10 Key i18n & Test

Namespace `VideoStudio` (tambahkan ke yang sudah ada dari Fase 3):

`messages/id.json`:
```json
"pasteAnimationCode": "Tempel Kode Animasi HTML",
"pasteAnimationCodeHint": "Tempel kode HTML lengkap dari AI di sini...",
"startRender": "Mulai Render",
"rendering": "Merender... {percent}%",
"downloadComplete": "Video berhasil diunduh.",
"downloadVideo": "Unduh Video",
"downloadAudio": "Unduh Audio",
"noAudioAvailable": "Tidak ada audio untuk diunduh.",
"copyAnimationPrompt": "Salin Prompt untuk AI",
"promptCopied": "Prompt disalin ke clipboard.",
"loading": "Memuat...",
"renderError": "Gagal merender. Periksa kode animasi.",
"previewTitle": "Preview Animasi",
"htmlTooLarge": "Kode HTML terlalu besar (maks 2 MB).",
"htmlSizeInfo": "{current} KB / {max} MB"
```

`messages/en.json`:
```json
"pasteAnimationCode": "Paste Animation HTML Code",
"pasteAnimationCodeHint": "Paste the complete HTML code from AI here...",
"startRender": "Start Render",
"rendering": "Rendering... {percent}%",
"downloadComplete": "Video downloaded successfully.",
"downloadVideo": "Download Video",
"downloadAudio": "Download Audio",
"noAudioAvailable": "No audio available for download.",
"copyAnimationPrompt": "Copy Prompt for AI",
"promptCopied": "Prompt copied to clipboard.",
"loading": "Loading...",
"renderError": "Render failed. Check animation code.",
"previewTitle": "Animation Preview",
"htmlTooLarge": "HTML code too large (max 2 MB).",
"htmlSizeInfo": "{current} KB / {max} MB"
```

### Test baru
- `src/lib/__tests__/animationContract.test.ts`:
  - `validateAnimationCode` menolak fetch, localStorage, alert — satu test per pattern.
  - Menerima kode valid (dengan canvas + window.__anim).
  - Mendeteksi missing canvas, missing window.__anim.
  - Menolak HTML > 2 MB.
  - **Test stateful regex bug:** panggil `validateAnimationCode` dua kali berturut-turut dengan input yang sama — hasil harus identik.
- `src/lib/__tests__/animationPromptBuilder.test.ts`: output mengandung kontrak wajib, timeline scene, used titles blacklist.

### Definition of Done Fase 4

- [ ] `animationContract.ts`: kontrak + validasi + template skeleton + `MAX_HTML_SIZE`.
- [ ] Validasi regex TANPA flag `g` (hanya `i`), ditest untuk stateful bug.
- [ ] `animationPromptBuilder.ts`: prompt builder dengan timeline + used titles blacklist.
- [ ] `AnimationRenderer.tsx`: iframe sandbox tanpa `allow-same-origin`, postMessage bridge.
- [ ] `videoAssembler.ts`: frame capture **SEQUENTIAL** — tunggu respons frame sebelum lanjut.
- [ ] `audioMixer.ts`: WebAudio OfflineAudioContext mixer + WAV encoder.
- [ ] CSP header untuk route render menyertakan `blob: data:`.
- [ ] UI: paste kode (dengan batas 2 MB), preview, render progress, download video + audio.
- [ ] Tombol "Copy Prompt untuk AI" berfungsi.
- [ ] Key i18n id/en paritas.
- [ ] Min 12 test lulus.
- [ ] `[#96]` di PATCH_NOTES + Bagian 46 di blueprint.
- [ ] 7 perintah verifikasi lulus.
