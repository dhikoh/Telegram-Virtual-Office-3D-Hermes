/**
 * Fase 2d — Detektor Stall Stream Chat (45 Detik).
 *
 * Mencegah stream menggantung tanpa kepastian saat gateway atau provider LLM
 * berhenti mengirimkan event / delta.
 *
 * Sesuai rencana integrasi:
 * 45 detik tanpa event dari gateway → picu status "agen sedang menjalankan tool",
 * lalu lakukan retry sekali dengan model fallback.
 */

export class StallDetector {
  private timer: NodeJS.Timeout | null = null;
  private isTriggered = false;

  constructor(
    private stallMs: number,
    private onStall: () => void | Promise<void>
  ) {}

  public start(): void {
    this.stop();
    this.isTriggered = false;
    this.schedule();
  }

  public recordActivity(): void {
    if (this.isTriggered) return;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.isTriggered = true;
      this.timer = null;
      void this.onStall();
    }, this.stallMs);
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public get triggered(): boolean {
    return this.isTriggered;
  }
}
