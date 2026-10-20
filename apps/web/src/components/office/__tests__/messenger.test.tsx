// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessengerFAB } from '../MessengerFAB';
import { AgentMessengerModal } from '../AgentMessengerModal';
import { useOfficeStore, type OfficeAgent } from '../../../stores/office';
import { tma } from '../../../services/tma';

// Mock tma
vi.mock('../../../services/tma', () => ({
  tma: {
    hapticImpact: vi.fn(),
    hapticNotification: vi.fn(),
    isTelegram: vi.fn().mockReturnValue(false),
  },
}));

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        'messenger.title': 'Obrolan Agen',
        'messenger.searchPlaceholder': 'Cari agen atau divisi...',
        'messenger.activeAgent': 'Sedang Dibuka',
        'messenger.noSpeech': 'Belum ada obrolan terkini',
        'messenger.allAgents': 'Semua Agen',
        'messenger.switchAgent': 'Ganti Agen',
        'messenger.emptySearch': 'Tidak ada agen yang cocok',
      };
      return dict[key] || key;
    },
  }),
}));

const mockAgents: OfficeAgent[] = [
  {
    id: 'agent-1',
    name: 'Atlas Prime',
    role: 'Chief Orchestrator',
    department: 'command',
    avatar: '⚡',
    status: 'idle',
    active: 1,
    hired_at: 1000,
    created_at: 1000,
    soul_summary: 'Chief Orchestrator',
    hermes_profile: 'default',
    endpoint_configured: true,
  },
  {
    id: 'agent-2',
    name: 'Nova Spark',
    role: 'Social Media Strategist',
    department: 'social',
    avatar: '✨',
    status: 'working',
    active: 1,
    hired_at: 1000,
    created_at: 1000,
    soul_summary: 'Social Media Strategist',
    hermes_profile: 'social',
    endpoint_configured: true,
  },
];

describe('MessengerFAB & AgentMessengerModal (Fase 5b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfficeStore.setState({
      agents: mockAgents,
      selectedAgentId: null,
      speech: {
        'agent-1': {
          text: 'Rencana kerja mingguan telah disusun.',
          at: Date.now(),
        },
      },
    });
  });

  describe('MessengerFAB', () => {
    it('renders FAB with agent counter and triggers onClick', () => {
      const handleClick = vi.fn();
      render(<MessengerFAB onClick={handleClick} />);

      expect(screen.getByText('Obrolan Agen')).toBeDefined();
      expect(screen.getByText('2')).toBeDefined();

      const btn = screen.getByRole('button', { name: 'Obrolan Agen' });
      fireEvent.click(btn);

      expect(tma.hapticImpact).toHaveBeenCalledWith('medium');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('AgentMessengerModal', () => {
    it('returns null when isOpen is false', () => {
      const { container } = render(
        <AgentMessengerModal isOpen={false} onClose={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders agent list with status and last speech when isOpen is true', () => {
      const handleClose = vi.fn();
      render(
        <AgentMessengerModal
          isOpen={true}
          onClose={handleClose}
          currentAgentId="agent-1"
        />
      );

      expect(screen.getByText('Atlas Prime')).toBeDefined();
      expect(screen.getByText('Nova Spark')).toBeDefined();
      expect(screen.getByText('Rencana kerja mingguan telah disusun.')).toBeDefined();
      expect(screen.getByText('Sedang Dibuka')).toBeDefined();
    });

    it('filters agents by search keyword', () => {
      render(
        <AgentMessengerModal
          isOpen={true}
          onClose={vi.fn()}
          currentAgentId="agent-1"
        />
      );

      const searchInput = screen.getByPlaceholderText('Cari agen atau divisi...');
      fireEvent.change(searchInput, { target: { value: 'Nova' } });

      expect(screen.queryByText('Atlas Prime')).toBeNull();
      expect(screen.getByText('Nova Spark')).toBeDefined();

      fireEvent.change(searchInput, { target: { value: 'nonexistent-agent' } });
      expect(screen.getByText('Tidak ada agen yang cocok')).toBeDefined();
    });

    it('selects agent, updates store, triggers haptic, and closes modal', () => {
      const handleClose = vi.fn();
      render(
        <AgentMessengerModal
          isOpen={true}
          onClose={handleClose}
          currentAgentId="agent-1"
        />
      );

      const agentBtn = screen.getByText('Nova Spark').closest('button');
      expect(agentBtn).toBeDefined();
      fireEvent.click(agentBtn!);

      expect(tma.hapticImpact).toHaveBeenCalledWith('light');
      expect(useOfficeStore.getState().selectedAgentId).toBe('agent-2');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
