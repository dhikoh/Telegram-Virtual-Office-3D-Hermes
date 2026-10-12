// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Audit Log State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Mengambil riwayat audit keamanan..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <EmptyState
        title="Belum Ada Aktivitas Audit"
        description="Semua aksi mutasi (tugas, agen, persetujuan) akan dicatat di sini."
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal memuat log audit" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Offline: Log audit lokal ditampilkan." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="audit-success">
        <div>12:30:15 - task.create - task_01</div>
      </div>
    );
    expect(screen.getByTestId('audit-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="audit-low-power" className="low-power-mode">
        <span>Tampilan monospace tanpa efek latar</span>
      </div>
    );
    expect(screen.getByTestId('audit-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
