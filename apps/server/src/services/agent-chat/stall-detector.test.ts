import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StallDetector } from './stall-detector.js';

describe('Fase 2d — StallDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('memicu onStall jika tidak ada aktivitas dalam durasi stallMs', () => {
    const onStall = vi.fn();
    const detector = new StallDetector(1000, onStall);

    detector.start();
    expect(onStall).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(onStall).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(detector.triggered).toBe(true);

    // Tidak boleh dipanggil lagi setelah triggered
    vi.advanceTimersByTime(2000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('mereset timer saat ada aktivitas sehingga onStall tertunda', () => {
    const onStall = vi.fn();
    const detector = new StallDetector(1000, onStall);

    detector.start();

    vi.advanceTimersByTime(800);
    expect(onStall).not.toHaveBeenCalled();

    // Event masuk pada t=800ms
    detector.recordActivity();

    // Maju 800ms lagi (total 1600ms dari start, tetapi hanya 800ms dari reset)
    vi.advanceTimersByTime(800);
    expect(onStall).not.toHaveBeenCalled();

    // Maju 201ms lagi (1001ms dari reset) -> picu
    vi.advanceTimersByTime(201);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('menghentikan timer saat stop() dipanggil', () => {
    const onStall = vi.fn();
    const detector = new StallDetector(1000, onStall);

    detector.start();
    vi.advanceTimersByTime(500);
    detector.stop();

    vi.advanceTimersByTime(1000);
    expect(onStall).not.toHaveBeenCalled();
    expect(detector.triggered).toBe(false);
  });
});
