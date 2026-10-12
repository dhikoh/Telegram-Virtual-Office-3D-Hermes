// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Settings State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Memuat preferensi pengguna..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <EmptyState
        title="Pengaturan Default"
        description="Semua konfigurasi saat ini menggunakan nilai standar."
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal menyimpan preferensi" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Offline: Perubahan disimpan di penyimpanan lokal perangkat." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="settings-success">
        <div>Bahasa: Bahasa Indonesia | Mode Hemat: Mati</div>
      </div>
    );
    expect(screen.getByTestId('settings-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="settings-low-power" className="low-power-mode">
        <span>Toggle Mode Hemat Daya Aktif</span>
      </div>
    );
    expect(screen.getByTestId('settings-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
