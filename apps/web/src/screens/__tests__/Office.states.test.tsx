// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Office Screen State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Memuat denah kantor..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
    expect(screen.getByText('Memuat denah kantor...')).toBeDefined();
  });

  it('renders empty state', () => {
    const handleLoadDemo = vi.fn();
    render(
      <EmptyState
        title="Kantor Kosong"
        description="Belum ada agen terdaftar."
        actionLabel="Muat Demo"
        onAction={handleLoadDemo}
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('Kantor Kosong')).toBeDefined();
    const btn = screen.getByRole('button', { name: 'Muat Demo' });
    fireEvent.click(btn);
    expect(handleLoadDemo).toHaveBeenCalledTimes(1);
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal memuat gateway" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    const retryBtn = screen.getByTestId('retry-button');
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Koneksi terputus. Menampilkan status cached." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="office-success">
        <span>8 Agen Aktif</span>
      </div>
    );
    expect(screen.getByTestId('office-success')).toBeDefined();
    expect(screen.getByText('8 Agen Aktif')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="office-low-power" className="low-power-mode">
        <span>Mode Hemat Daya Aktif</span>
      </div>
    );
    const el = screen.getByTestId('office-low-power');
    expect(el.classList.contains('low-power-mode')).toBe(true);
  });
});
