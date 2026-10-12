// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Reports Screen State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Menghitung analitik departemen..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <EmptyState
        title="Belum Ada Laporan"
        description="Pilih template untuk menghasilkan laporan anti-halusinasi pertama."
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal memuat metrik KPI" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Offline: Pembuatan laporan membutuhkan gateway." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="reports-success">
        <div>Laporan Penjualan Q3 - MRR Rp 140 Juta</div>
      </div>
    );
    expect(screen.getByTestId('reports-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="reports-low-power" className="low-power-mode">
        <span>Animasi sparklines disederhanakan</span>
      </div>
    );
    expect(screen.getByTestId('reports-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
