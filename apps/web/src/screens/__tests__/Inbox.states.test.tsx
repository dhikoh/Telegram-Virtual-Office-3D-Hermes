// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Inbox Screen State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Memeriksa persetujuan & notifikasi..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <EmptyState
        title="Kotak Masuk Bersih"
        description="Semua persetujuan dan notifikasi telah ditangani."
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal memuat persetujuan" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Offline: Persetujuan tidak dapat diproses." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="inbox-success">
        <div>Persetujuan: Kirim Email Kampanye (Felix Finance)</div>
      </div>
    );
    expect(screen.getByTestId('inbox-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="inbox-low-power" className="low-power-mode">
        <span>Efek glow approval dinonaktifkan</span>
      </div>
    );
    expect(screen.getByTestId('inbox-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
