/**
 * Tests for View Mode & 3D WebGL Recovery (Rule 9.3 & REQ-108, REQ-117)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useViewModeStore } from './view-mode';
import { useOfficeStore } from './office';

describe('View Mode Store & 3D WebGL Fallback (Phase 9)', () => {
  beforeEach(() => {
    useViewModeStore.setState({
      viewMode: '2D',
      webGLError: null,
      webGLSupported: true,
    });
    useOfficeStore.setState({
      selectedAgentId: null,
    });
  });

  it('initializes with 2D view mode by default (Rule 9.3)', () => {
    const { viewMode, webGLError } = useViewModeStore.getState();
    expect(viewMode).toBe('2D');
    expect(webGLError).toBeNull();
  });

  it('switches to 3D when setViewMode is invoked', () => {
    useViewModeStore.getState().setViewMode('3D');
    expect(useViewModeStore.getState().viewMode).toBe('3D');
  });

  it('automatically falls back to 2D upon WebGL error or context loss (Rule REQ-117)', () => {
    // Start in 3D
    useViewModeStore.getState().setViewMode('3D');
    expect(useViewModeStore.getState().viewMode).toBe('3D');

    // Trigger WebGL failure / context lost
    useViewModeStore.getState().setWebGLError('3D tidak tersedia di perangkat ini');

    // Must immediately fallback to 2D
    const state = useViewModeStore.getState();
    expect(state.viewMode).toBe('2D');
    expect(state.webGLError).toBe('3D tidak tersedia di perangkat ini');
  });

  it('retains selected agent and open sheet when switching between 2D and 3D', () => {
    // Select an agent in 2D
    useOfficeStore.setState({ selectedAgentId: 'agent-dev-1' });
    expect(useOfficeStore.getState().selectedAgentId).toBe('agent-dev-1');

    // Switch to 3D
    useViewModeStore.getState().setViewMode('3D');
    expect(useViewModeStore.getState().viewMode).toBe('3D');
    // Selected agent must be preserved
    expect(useOfficeStore.getState().selectedAgentId).toBe('agent-dev-1');

    // Switch back to 2D
    useViewModeStore.getState().setViewMode('2D');
    expect(useViewModeStore.getState().viewMode).toBe('2D');
    // Selected agent must still be preserved
    expect(useOfficeStore.getState().selectedAgentId).toBe('agent-dev-1');
  });
});
