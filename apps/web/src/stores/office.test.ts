import { describe, it, expect, beforeEach } from 'vitest';
import { useOfficeStore } from './office';
import { usePowerStore } from './power';

describe('Web Shell & Office Store (Phase 3)', () => {
  beforeEach(() => {
    useOfficeStore.setState({
      agents: [],
      tasks: [],
      approvals: [],
      streamStatus: 'connecting',
      ticker: [],
      selectedAgentId: null,
      isLoading: false,
      error: null,
    });
  });

  it('initializes with empty agents and default state', () => {
    const state = useOfficeStore.getState();
    expect(state.agents).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it('loads demo office with 8 department agents marked with DEMO badge', async () => {
    await useOfficeStore.getState().loadDemoOffice();
    const state = useOfficeStore.getState();

    expect(state.agents.length).toBe(8);
    const departments = state.agents.map((a) => a.department);
    expect(departments).toContain('command');
    expect(departments).toContain('social');
    expect(departments).toContain('sales');
    expect(departments).toContain('finance');
    expect(departments).toContain('marketing');
    expect(departments).toContain('analytics');
    expect(departments).toContain('support');
    expect(departments).toContain('hr');

    // Rule REQ-074: all demo items carry visible DEMO badge
    state.agents.forEach((agent) => {
      expect(agent.isDemo).toBe(true);
      expect(agent.status).toBe('idle');
    });

    expect(state.ticker.length).toBeGreaterThan(0);
  });

  it('updates agent status dynamically and records ticker message', async () => {
    await useOfficeStore.getState().loadDemoOffice();
    const initialStore = useOfficeStore.getState();
    const firstAgent = initialStore.agents[0];

    useOfficeStore.getState().setAgentStatus(firstAgent.id, 'working', 'browser_tool');
    const updatedStore = useOfficeStore.getState();
    const updatedAgent = updatedStore.agents.find((a) => a.id === firstAgent.id);

    expect(updatedAgent?.status).toBe('working');
    expect(updatedAgent?.currentTool).toBe('browser_tool');

    const latestTicker = updatedStore.ticker[0];
    expect(latestTicker.text).toContain(firstAgent.name);
    expect(latestTicker.text).toContain('working');
  });

  it('toggles low power mode and stores state', () => {
    const initialPower = usePowerStore.getState().isLowPower;
    usePowerStore.getState().toggleLowPower();
    expect(usePowerStore.getState().isLowPower).toBe(!initialPower);
  });
});
