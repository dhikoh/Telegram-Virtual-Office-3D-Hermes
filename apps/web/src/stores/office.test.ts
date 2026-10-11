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

  it('manages tasks list and status transitions', () => {
    const newTask = {
      id: 'task-test-1',
      title: 'Uji Analisis Sentimen',
      description: 'Lakukan analisis postingan sosial',
      agent_id: 'demo-social',
      priority: 'high' as const,
      status: 'backlog' as const,
      run_id: null,
      result_md: null,
      due_at: null,
      created_by: 123456789,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    useOfficeStore.setState({ tasks: [newTask] });
    expect(useOfficeStore.getState().tasks.length).toBe(1);

    // Update status to running
    useOfficeStore.setState((state) => ({
      tasks: state.tasks.map((t) => (t.id === newTask.id ? { ...t, status: 'running' as const } : t)),
    }));
    expect(useOfficeStore.getState().tasks[0].status).toBe('running');

    // Update status to done with markdown result
    useOfficeStore.setState((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === newTask.id
          ? { ...t, status: 'done' as const, result_md: '## Hasil Analisis\nSemua metrik positif.' }
          : t
      ),
    }));
    const doneTask = useOfficeStore.getState().tasks[0];
    expect(doneTask.status).toBe('done');
    expect(doneTask.result_md).toContain('Hasil Analisis');
  });

  it('handles approvals queue and decision resolution', () => {
    const mockApproval = {
      id: 'app-test-1',
      run_id: 'run-999',
      agent_id: 'demo-finance',
      summary: 'Konfirmasi transfer biaya server ke host provider',
      payload_json: '{"amount": 150, "currency": "USD"}',
      status: 'pending' as const,
      decided_by: null,
      decided_at: null,
      created_at: Date.now(),
    };

    useOfficeStore.setState({ approvals: [mockApproval] });
    expect(useOfficeStore.getState().approvals.length).toBe(1);

    // Simulate approval resolution
    useOfficeStore.setState((state) => ({
      approvals: state.approvals.map((a) =>
        a.id === mockApproval.id ? { ...a, status: 'approved' as const, decided_by: 123456789, decided_at: Date.now() } : a
      ),
    }));

    const resolved = useOfficeStore.getState().approvals[0];
    expect(resolved.status).toBe('approved');
    expect(resolved.decided_by).toBe(123456789);
  });
});
