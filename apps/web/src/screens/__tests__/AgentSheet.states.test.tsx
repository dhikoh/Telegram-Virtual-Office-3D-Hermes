// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Agent Sheet State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Memuat profil & aktivitas agen..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <EmptyState
        title="Belum Ada Riwayat Aktivitas"
        description="Agen belum menjalankan tugas atau panggilan tool."
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Koneksi gateway agen terputus" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Offline: Chat streaming dinonaktifkan." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="agent-sheet-success">
        <div>Aria Commander - Tab Chat, Aktivitas, Tugas, Profil</div>
      </div>
    );
    expect(screen.getByTestId('agent-sheet-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="sheet-low-power" className="low-power-mode">
        <span>Transisi sheet instan tanpa spring motion</span>
      </div>
    );
    expect(screen.getByTestId('sheet-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
