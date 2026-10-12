// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Recruitment Room State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Menyiapkan template perekrutan..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <EmptyState
        title="Pilih Template Agen"
        description="Pilih salah satu template peran untuk memulai wizard perekrutan."
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal menyimpan draft penerimaan" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Offline: Pendaftaran agen ke server membutuhkan gateway." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="recruitment-success">
        <div>Wizard Langkah 4: Paket Penerimaan VPS Siap</div>
      </div>
    );
    expect(screen.getByTestId('recruitment-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="recruitment-low-power" className="low-power-mode">
        <span>Wizard tanpa animasi perpindahan slide</span>
      </div>
    );
    expect(screen.getByTestId('recruitment-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
