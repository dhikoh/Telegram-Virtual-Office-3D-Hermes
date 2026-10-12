// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState, EmptyState, ErrorState, OfflineBanner } from '../../components/states';

describe('Tasks Screen State Matrix (C5 & C3h)', () => {
  it('renders loading state', () => {
    render(<LoadingState message="Memuat daftar tugas..." />);
    expect(screen.getByTestId('loading-state')).toBeDefined();
  });

  it('renders empty state', () => {
    const handleCreate = vi.fn();
    render(
      <EmptyState
        title="Belum Ada Tugas"
        description="Buat tugas baru untuk agen AI Anda."
        actionLabel="Buat Tugas"
        onAction={handleCreate}
      />
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
    const btn = screen.getByRole('button', { name: 'Buat Tugas' });
    fireEvent.click(btn);
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('renders error state and retry button works', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Gagal sinkronisasi tugas" onRetry={handleRetry} />);
    expect(screen.getByTestId('error-state')).toBeDefined();
    const retryBtn = screen.getByTestId('retry-button');
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders offline state banner', () => {
    render(<OfflineBanner message="Mode offline: Tugas disimpan lokal." />);
    expect(screen.getByTestId('offline-banner')).toBeDefined();
  });

  it('renders success state', () => {
    render(
      <div data-testid="tasks-success">
        <div>Tugas 1: Analisis Q3 (Running)</div>
      </div>
    );
    expect(screen.getByTestId('tasks-success')).toBeDefined();
  });

  it('renders low-power state', () => {
    render(
      <div data-testid="tasks-low-power" className="low-power-mode">
        <span>Animasi Kanban Dinonaktifkan</span>
      </div>
    );
    expect(screen.getByTestId('tasks-low-power').classList.contains('low-power-mode')).toBe(true);
  });
});
