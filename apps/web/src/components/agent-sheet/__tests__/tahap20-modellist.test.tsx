// @vitest-environment jsdom
/**
 * Tahap 20 (ST-5) — panel daftar model auto-detect.
 *
 *  - daftar diambil otomatis saat panel terbuka lewat endpoint read-only
 *    `GET /api/agents/:id/models` (tombol "Uji Koneksi" tetap untuk kunci baru);
 *  - urutan dijamin: dedupe → A-Z (locale en, angka numerik) → model aktif di
 *    baris pertama;
 *  - model aktif yang sudah tidak tercantum di gateway TETAP ditampilkan (tidak
 *    hilang diam-diam);
 *  - filter pencarian menutupi daftar panjang; maksimum 60 baris dirender dan
 *    sisanya disebut jumlahnya, bukan dipotong tanpa kabar;
 *  - kegagalan memuat menampilkan pesan server apa adanya.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AgentSheetProfile } from '../AgentSheetProfile';
import '../../../i18n';
import type { OfficeAgent } from '../../../stores/office';

const apiMock = vi.hoisted(() => ({
  listAgentModels: vi.fn(),
  getAgentModelPriority: vi.fn(),
  saveAgentModelPriority: vi.fn(),
  setAgentModel: vi.fn(),
  saveAgentEndpoint: vi.fn(),
  resetAgentEndpoint: vi.fn(),
  probeConnection: vi.fn(),
  updateAgent: vi.fn(),
  getAgentHealth: vi.fn(),
}));

const fetchInitialData = vi.hoisted(() => vi.fn());

const tmaMock = vi.hoisted(() => ({
  hapticImpact: vi.fn(),
  hapticNotification: vi.fn(),
  hapticSelection: vi.fn(),
  close: vi.fn(),
}));

vi.mock('../../../services/api', () => ({ api: apiMock }));
vi.mock('../../../stores/office', () => ({
  useOfficeStore: (selector: (s: { fetchInitialData: typeof fetchInitialData }) => unknown) =>
    selector({ fetchInitialData }),
}));
vi.mock('../../../services/tma', () => ({ tma: tmaMock }));
vi.mock('../../office/office-3d/glbCharacter', () => ({
  CHARACTER_MODEL_IDS: ['male-a'],
  CHARACTER_MODEL_LABELS: { 'male-a': 'Command' },
  CHARACTER_MODEL_URLS: { 'male-a': 'x.glb' },
  characterModelFor: () => 'male-a',
}));

const makeAgent = (over: Partial<OfficeAgent> = {}): OfficeAgent =>
  ({
    id: 'agent_raka',
    name: 'Raka',
    role: 'Sales',
    department: 'Sales',
    avatar: '🤖',
    soul_summary: 'Menjual.',
    hermes_profile: 'default',
    model: 'beta',
    active: 1,
    hired_at: 0,
    created_at: 0,
    is_system: false,
    avatar_style: { shirt: '#38BDF8', character: 'male-a' },
    key_stored: true,
    endpoint_configured: false,
    status: 'idle',
    ...over,
  }) as OfficeAgent;

const listPayload = (models: string[]) => ({
  models,
  current_model: null,
  endpoint_source: 'server' as const,
  base_url_used: 'http://127.0.0.1:8642',
  status_code: 200,
  latency_ms: 10,
});

/**
 * Render lalu tunggu beban selesai: spinner `Memuat model` hilang dan panel
 * sudah berhenti berubah (atau memang tidak dirender, kalau tidak ada daftar
 * dan tidak ada galat). Tanpa ini, membaca baris langsung setelah render
 * menangkap keadaan loading yang masih kosong.
 */
const renderAndSettle = async (over: Partial<OfficeAgent> = {}) => {
  render(<AgentSheetProfile agent={makeAgent(over)} />);
  await waitFor(() => {
    if (document.querySelector('[aria-label="Memuat model"]')) throw new Error('masih memuat');
    const panel = document.querySelector('[data-testid="model-list"]');
    if (!panel) return; // tanpa daftar dan tanpa galat → panel memang disembunyikan
    if (panel.querySelector('[data-testid="model-list-error"]')) return;
    if (panel.querySelector('button')) return;
    throw new Error('render belum stabil');
  });
  await waitFor(() => expect(apiMock.listAgentModels).toHaveBeenCalled());
};

/** Urutan tombol model di dalam panel daftar. */
const modelRows = () =>
  screen.queryByTestId('model-list')
    ? within(screen.getByTestId('model-list')).queryAllByRole('button')
    : [];

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.setAgentModel.mockResolvedValue(makeAgent());
  apiMock.getAgentModelPriority.mockResolvedValue({ models: ['beta'], current_model: 'beta', max_models: 5 });
  apiMock.listAgentModels.mockResolvedValue(listPayload([]));
});

describe('panel daftar model', () => {
  it('refreshes priority after the legacy picker and only offers detected models', async () => {
    apiMock.listAgentModels.mockResolvedValue(listPayload(['alpha', 'beta']));
    await renderAndSettle({ model: 'retired' });
    const editor = within(screen.getByRole('region', { name: 'Prioritas model' }));
    await editor.findByText('beta');
    expect(editor.queryByRole('option', { name: 'retired' })).toBeNull();
    apiMock.getAgentModelPriority.mockResolvedValue({ models: ['alpha', 'beta'], current_model: 'alpha', max_models: 5 });
    fireEvent.click(within(screen.getByTestId('model-list')).getByRole('button', { name: 'alpha' }));
    await waitFor(() => expect(apiMock.getAgentModelPriority).toHaveBeenCalledTimes(2));
    await editor.findByText('alpha');
    expect(editor.getAllByRole('listitem').map((row) => row.getAttribute('data-model'))).toEqual(['alpha', 'beta']);
  });
  it('memuat daftar otomatis saat panel terbuka, tanpa query (read-only)', async () => {
    apiMock.listAgentModels.mockResolvedValue(listPayload(['zeta', 'alpha']));

    await renderAndSettle();

    await waitFor(() => expect(apiMock.listAgentModels).toHaveBeenCalledWith('agent_raka'));
    const rows = await modelRows();
    expect(rows.map((r) => r.textContent)).toEqual(['beta • aktif', 'alpha', 'zeta']);
  });

  it('mengurutkan A-Z dengan angka numerik dan meniadakan duplikat', async () => {
    apiMock.listAgentModels.mockResolvedValue(
      listPayload(['zeta', 'apple10', 'apple2', 'Alpha', 'zeta', ''])
    );

    await renderAndSettle({ model: null });
    const rows = await modelRows();

    // Tidak ada model aktif tersimpan → baris aktif bawaan ('hermes-agent') di atas.
    expect(rows.map((r) => r.textContent)).toEqual([
      'hermes-agent • aktif',
      'Alpha',
      'apple2',
      'apple10',
      'zeta',
    ]);
  });

  it('tetap menampilkan model aktif yang sudah tidak ada di daftar gateway', async () => {
    apiMock.listAgentModels.mockResolvedValue(listPayload(['alpha']));

    await renderAndSettle({ model: 'gamma-retired' });
    const rows = await modelRows();

    expect(rows.map((r) => r.textContent)).toEqual(['gamma-retired • aktif', 'alpha']);
  });

  it('merender maksimum 60 baris dan menyebut jumlah sisanya', async () => {
    const many = Array.from({ length: 100 }, (_, i) => `model-${String(i).padStart(3, '0')}`);
    apiMock.listAgentModels.mockResolvedValue(listPayload(many));

    await renderAndSettle({ model: 'model-050' });
    const rows = await modelRows();

    expect(rows).toHaveLength(60);
    expect(rows[0]?.textContent).toBe('model-050 • aktif'); // dipin di baris pertama
    expect(screen.getByTestId('model-list-truncated').textContent).toContain(
      '40 model lainnya disembunyikan'
    );
  });

  it('filter menyaring daftar dan punya pesan kosong yang jujur', async () => {
    apiMock.listAgentModels.mockResolvedValue(
      listPayload(['anthropic/claude-3', 'openai/gpt-4', 'openai/gpt-3.5'])
    );

    await renderAndSettle({ model: 'openai/gpt-4' });
    await modelRows();

    fireEvent.change(screen.getByLabelText('Filter daftar model'), {
      target: { value: 'openai' },
    });
    expect(modelRows().map((r) => r.textContent)).toEqual(['openai/gpt-4 • aktif', 'openai/gpt-3.5']);

    fireEvent.change(screen.getByLabelText('Filter daftar model'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('model-list-empty').textContent).toContain('Tidak ada model');
  });

  it('menyimpan model yang dipilih dan memuat ulang data kantor', async () => {
    apiMock.listAgentModels.mockResolvedValue(listPayload(['alpha', 'beta']));

    await renderAndSettle();
    const rows = await modelRows();
    fireEvent.click(rows[rows.length - 1] as HTMLElement);

    await waitFor(() => expect(apiMock.setAgentModel).toHaveBeenCalledWith('agent_raka', 'alpha'));
    expect(fetchInitialData).toHaveBeenCalled();
  });

  it('menampilkan pesan galat server apa adanya ketika daftar gagal dimuat', async () => {
    apiMock.listAgentModels.mockRejectedValue(
      new Error('Kunci API ditolak gateway (401).')
    );

    await renderAndSettle({ model: null });

    expect(screen.getByTestId('model-list-error').textContent).toBe(
      'Kunci API ditolak gateway (401).'
    );
    expect(modelRows()).toHaveLength(0);
  });
});
