/**
 * Tests for Low-Power ECO mode (Rule 9.3 & REQ-067).
 * ECO must genuinely disable the 3D view, not just grey out its button.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePowerStore } from './power';
import { useViewModeStore } from './view-mode';

describe('Low-Power ECO mode vs 3D view (Rule 9.3)', () => {
  beforeEach(() => {
    useViewModeStore.setState({
      viewMode: '2D',
      webGLError: null,
      webGLSupported: true,
    });
    usePowerStore.setState({ isLowPower: false, autoDetected: false });
  });

  it('turning ECO on while in 3D forces the 2D fallback', () => {
    useViewModeStore.getState().setViewMode('3D');
    expect(useViewModeStore.getState().viewMode).toBe('3D');

    usePowerStore.getState().toggleLowPower();

    expect(usePowerStore.getState().isLowPower).toBe(true);
    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });

  it('turning ECO off does not flip the view back on its own', () => {
    useViewModeStore.getState().setViewMode('3D');
    usePowerStore.getState().setLowPower(true);
    expect(useViewModeStore.getState().viewMode).toBe('2D');

    usePowerStore.getState().setLowPower(false);

    expect(usePowerStore.getState().isLowPower).toBe(false);
    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });

  it('setLowPower(true) enforces 2D too, not only the toggle', () => {
    useViewModeStore.getState().setViewMode('3D');

    usePowerStore.getState().setLowPower(true);

    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });

  it('ECO off leaves an already-2D view untouched', () => {
    usePowerStore.getState().setLowPower(true);
    usePowerStore.getState().setLowPower(false);

    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });
});
