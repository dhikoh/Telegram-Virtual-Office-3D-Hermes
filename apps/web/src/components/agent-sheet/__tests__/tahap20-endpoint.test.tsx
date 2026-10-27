// @vitest-environment jsdom
/**
 * Tahap 20 (ST-4) — sakelar sumber endpoint per agen.
 *
 *  - "Ikuti Server" / "Kustom" adalah tombol sungguhan (dulu hanya label teks
 *    tanpa onClick);
 *  - "Ikuti Server" mengirim string KOSONG secara eksplisit — itulah bug lama:
 *    `base_url.trim() || undefined` membuat server menganggap "tidak usah diubah";
 *  - "Kustom" tidak memalsukan keadaan: tanpa URL ia meminta owner mengisinya
 *    dulu, dan tidak pernah mengirim permintaan;
 *  - pesan galat server tampil apa adanya (Rule: jangan diam optimis);
 *  - label selalu mengikuti endpoint_configured milik server, bukan state lokal.
 *
 * Perilaku server-nya (accept '' sebagai reset, tolak loopback, dinormalisasi)
 * dikunci oleh apps/server/src/routes/agents.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentSheetProfile } from '../AgentSheetProfile';
import '../../../i18n';
import type { OfficeAgent } from '../../../stores/office';

const apiMock = vi.hoisted(() => ({
  saveAgentEndpoint: vi.fn(),
  resetAgentEndpoint: vi.fn(),
  probeConnection: vi.fn(),
  updateAgent: vi.fn(),
  setAgentModel: vi.fn(),
  listAgentModels: vi.fn(),
  getAgentHealth: vi.fn(),
  getAgentModelPriority: vi.fn(),
  saveAgentModelPriority: vi.fn(),
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
    model: 'gpt-x',
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

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getAgentModelPriority.mockResolvedValue({ models: ['gpt-x'], current_model: 'gpt-x', max_models: 5 });
  // Tahap 20 (ST-5): panel memuat daftar model secara otomatis saat terbuka.
  apiMock.listAgentModels.mockResolvedValue({
    models: [],
    current_model: null,
    endpoint_source: 'server',
    base_url_used: '',
  });
});

const renderProfile = async (agent: OfficeAgent) => {
  const view = render(<AgentSheetProfile agent={agent} />);
  await waitFor(() => {
    expect(apiMock.listAgentModels).toHaveBeenCalled();
    expect(screen.queryByText('Memuat prioritas model...')).toBeNull();
  });
  return view;
};

describe('sumber endpoint per agen', () => {
  it('menekan tombol yang sesuai keadaan server', async () => {
    const { unmount } = await renderProfile(makeAgent({ endpoint_configured: false }));
    expect(screen.getByTestId('endpoint-source-server').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('endpoint-source-agent').getAttribute('aria-pressed')).toBe('false');

    unmount();

    await renderProfile(makeAgent({ endpoint_configured: true }));
    expect(screen.getByTestId('endpoint-source-server').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('endpoint-source-agent').getAttribute('aria-pressed')).toBe('true');
  });

  it('mengirim string kosong eksplisit saat kembali ke endpoint server', async () => {
    apiMock.resetAgentEndpoint.mockResolvedValue(makeAgent({ endpoint_configured: false }));

    await renderProfile(makeAgent({ endpoint_configured: true }));
    fireEvent.click(screen.getByTestId('endpoint-source-server'));

    await waitFor(() => expect(apiMock.resetAgentEndpoint).toHaveBeenCalledWith('agent_raka'));
    expect(fetchInitialData).toHaveBeenCalled();
    await screen.findByText('Agen kembali mengikuti pengaturan server.');
    // Tidak boleh ada panggilan simpan lain yang menimpa reset.
    expect(apiMock.saveAgentEndpoint).not.toHaveBeenCalled();
  });

  it('menolak memasang endpoint kustom ketika Base URL masih kosong', async () => {
    await renderProfile(makeAgent({ endpoint_configured: false }));
    fireEvent.click(screen.getByTestId('endpoint-source-agent'));

    await screen.findByText('Isi Base URL Gateway dulu, baru pilih Kustom.');
    expect(apiMock.saveAgentEndpoint).not.toHaveBeenCalled();
    expect(apiMock.resetAgentEndpoint).not.toHaveBeenCalled();
    expect(fetchInitialData).not.toHaveBeenCalled();
  });

  it('menyimpan Base URL yang diketik ketika memilih Kustom', async () => {
    apiMock.saveAgentEndpoint.mockResolvedValue(makeAgent({ endpoint_configured: true }));

    await renderProfile(makeAgent({ endpoint_configured: false }));
    fireEvent.change(screen.getByLabelText(/Base URL Gateway/), {
      target: { value: ' https://openrouter.ai/api/v1 ' },
    });
    fireEvent.click(screen.getByTestId('endpoint-source-agent'));

    await waitFor(() =>
      expect(apiMock.saveAgentEndpoint).toHaveBeenCalledWith(
        'agent_raka',
        'https://openrouter.ai/api/v1'
      )
    );
    expect(fetchInitialData).toHaveBeenCalled();
    await screen.findByText(/Endpoint kustom tersimpan/);
  });

  it('menampilkan pesan galat server apa adanya, bukan diam optimis', async () => {
    apiMock.saveAgentEndpoint.mockRejectedValue(
      new Error('Alamat loopback hanya boleh dipakai oleh server (Rule S5).')
    );

    await renderProfile(makeAgent({ endpoint_configured: false }));
    fireEvent.change(screen.getByLabelText(/Base URL Gateway/), {
      target: { value: 'http://127.0.0.1:8642' },
    });
    fireEvent.click(screen.getByTestId('endpoint-source-agent'));

    await screen.findByText('Alamat loopback hanya boleh dipakai oleh server (Rule S5).');
    expect(fetchInitialData).not.toHaveBeenCalled();
  });
});
