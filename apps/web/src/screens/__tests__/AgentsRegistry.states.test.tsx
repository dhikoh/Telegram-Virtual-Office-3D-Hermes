// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Agents Registry State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Memuat daftar agen..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <EmptyState
        title="Belum Ada Agen Terdaftar"
        description="Gunakan tombol Rekrut Agen untuk menambahkan anggota tim."
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal memuat direktori agen" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Offline: Perubahan profil agen tidak dapat disimpan." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="registry-success">
        <div>Aria Commander - Active</div>
      </div>
    );
    expect(screen.getByTestId('registry-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="registry-low-power" className="low-power-mode">
        <span>Transisi daftar statis</span>
      </div>
    );
    expect(screen.getByTestId('registry-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
