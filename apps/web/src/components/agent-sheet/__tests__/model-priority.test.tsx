// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../../../i18n';
import { ModelPriorityEditor } from '../ModelPriorityEditor';

const apiMock = vi.hoisted(() => ({ getAgentModelPriority: vi.fn(), saveAgentModelPriority: vi.fn() }));
const fetchInitialData = vi.hoisted(() => vi.fn());
vi.mock('../../../services/api', () => ({ api: apiMock }));
vi.mock('../../../stores/office', () => ({
  useOfficeStore: (selector: (s: { fetchInitialData: typeof fetchInitialData }) => unknown) => selector({ fetchInitialData }),
}));
const payload = (models: string[]) => ({ models, current_model: models[0] ?? null, max_models: 5 });
const props = { agentId: 'agent_raka', currentModel: 'alpha', availableModels: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'] };
const rows = () => screen.getAllByRole('listitem').map((row) => row.getAttribute('data-model'));

beforeEach(() => {
  vi.resetAllMocks();
  apiMock.getAgentModelPriority.mockResolvedValue(payload(['alpha', 'beta']));
  apiMock.saveAgentModelPriority.mockResolvedValue(payload(['beta', 'alpha']));
  fetchInitialData.mockResolvedValue(undefined);
});

describe('ModelPriorityEditor', () => {
  it('blocks editing after a failed load until retry succeeds', async () => {
    apiMock.getAgentModelPriority.mockRejectedValueOnce(new Error('Agen belum dapat dibaca.'));
    render(<ModelPriorityEditor {...props} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Agen belum dapat dibaca.'));
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await screen.findByText('alpha');
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false);
  });
  it('keeps pending controls disabled until read-back and office refresh finish', async () => {
    let resolveRead!: (result: ReturnType<typeof payload>) => void;
    render(<ModelPriorityEditor {...props} />);
    await screen.findByText('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Turunkan alpha' }));
    apiMock.getAgentModelPriority.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan prioritas' }));
    await waitFor(() => expect(apiMock.getAgentModelPriority).toHaveBeenCalledTimes(2));
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Prioritas model tersimpan.')).toBeNull();
    expect(fetchInitialData).not.toHaveBeenCalled();
    await act(async () => { resolveRead(payload(['beta', 'alpha'])); });
    expect(await screen.findByText('Prioritas model tersimpan.')).toBeTruthy();
  });
  it.each(['write', 'read', 'mismatch'])('does not claim success after %s failure', async (failure) => {
    render(<ModelPriorityEditor {...props} />);
    await screen.findByText('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Naikkan beta' }));
    if (failure === 'write') apiMock.saveAgentModelPriority.mockRejectedValueOnce(new Error('Penyimpanan ditolak.'));
    if (failure === 'read') apiMock.getAgentModelPriority.mockRejectedValueOnce(new Error('Pembacaan ulang gagal.'));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan prioritas' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Prioritas model tersimpan.')).toBeNull();
    expect(fetchInitialData).not.toHaveBeenCalled();
    expect(rows()).toEqual(['beta', 'alpha']);
    expect((screen.getByRole('button', { name: 'Simpan prioritas' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('ignores stale loads and saves after agent change or unmount', async () => {
    let resolveOld!: (result: ReturnType<typeof payload>) => void;
    apiMock.getAgentModelPriority.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<ModelPriorityEditor {...props} />);
    view.rerender(<ModelPriorityEditor {...props} agentId="agent_new" />);
    await screen.findByText('alpha');
    await act(async () => { resolveOld(payload(['old-agent-model'])); });
    expect(rows()).toEqual(['alpha', 'beta']);
    let resolveSave!: (result: ReturnType<typeof payload>) => void;
    apiMock.saveAgentModelPriority.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Naikkan beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan prioritas' }));
    view.unmount();
    await act(async () => { resolveSave(payload(['beta', 'alpha'])); });
    expect(apiMock.getAgentModelPriority).toHaveBeenCalledTimes(2);
    expect(fetchInitialData).not.toHaveBeenCalled();
  });
  it('shows empty state, detected-model guidance and never saves zero entries', async () => {
    apiMock.getAgentModelPriority.mockResolvedValue(payload([]));
    render(<ModelPriorityEditor {...props} availableModels={[]} />);
    expect(await screen.findByText('Belum ada prioritas model. Tambahkan model terdeteksi.')).toBeTruthy();
    expect(screen.getByText('Belum ada model terdeteksi. Uji koneksi untuk memuat pilihan.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Simpan prioritas' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('uses the English translations when selected', async () => {
    const { default: i18n } = await import('../../../i18n');
    await act(async () => { await i18n.changeLanguage('en'); });
    try {
      render(<ModelPriorityEditor {...props} />);
      await screen.findByText('alpha');
      expect(screen.getByRole('region', { name: 'Model priority' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save priority' })).toBeTruthy();
    } finally { await act(async () => { await i18n.changeLanguage('id'); }); }
  });
  it('only adds detected unique nonempty models up to five and supports removal', async () => {
    render(<ModelPriorityEditor {...props} availableModels={[...props.availableModels, 'alpha', '', '   ']} />);
    await screen.findByText('alpha');
    expect(screen.queryByRole('textbox')).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Pilih model terdeteksi' });
    expect(within(select).queryByRole('option', { name: 'alpha' })).toBeNull();
    for (const model of ['gamma', 'delta', 'epsilon']) {
      fireEvent.change(select, { target: { value: model } });
      fireEvent.click(screen.getByRole('button', { name: 'Tambah model' }));
    }
    expect(rows()).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
    expect((select as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Tambah model' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus beta' }));
    expect(rows()).toEqual(['alpha', 'gamma', 'delta', 'epsilon']);
    fireEvent.change(select, { target: { value: 'zeta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah model' }));
    expect(rows()).toEqual(['alpha', 'gamma', 'delta', 'epsilon', 'zeta']);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan prioritas' }));
    await waitFor(() => expect(apiMock.saveAgentModelPriority).toHaveBeenCalledWith('agent_raka', ['alpha', 'gamma', 'delta', 'epsilon', 'zeta']));
  });
  it('loads saved ordering, reorders and verifies persistence before reporting success', async () => {
    render(<ModelPriorityEditor {...props} />);
    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(rows()).toEqual(['alpha', 'beta']);
    expect(within(screen.getAllByRole('listitem')[0]!).getByText('Utama')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Naikkan beta' }));
    expect(rows()).toEqual(['beta', 'alpha']);
    apiMock.getAgentModelPriority.mockResolvedValue(payload(['beta', 'alpha']));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan prioritas' }));
    expect(await screen.findByText('Prioritas model tersimpan.')).toBeTruthy();
    expect(apiMock.saveAgentModelPriority).toHaveBeenCalledWith('agent_raka', ['beta', 'alpha']);
    expect(apiMock.getAgentModelPriority).toHaveBeenCalledTimes(2);
    expect(fetchInitialData).toHaveBeenCalledTimes(1);
  });
});
