// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CAMERA_ZOOM_EVENT,
  requestCameraZoom,
  type CameraZoomDetail,
} from '../office-3d/cameraState';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const controller = read('../office-3d/CameraController.tsx');
const office3d = read('../office-3d/Office3D.tsx');
const agent3d = read('../office-3d/Agent3D.tsx');

describe('Camera Zoom System & Controls (Poin 6)', () => {
  it('requestCameraZoom dispatches CAMERA_ZOOM_EVENT with detail', () => {
    const handler = vi.fn();
    window.addEventListener(CAMERA_ZOOM_EVENT, handler);

    requestCameraZoom({ fov: 35 });
    expect(handler).toHaveBeenCalledTimes(1);

    const event = handler.mock.calls[0][0] as CustomEvent<CameraZoomDetail>;
    expect(event.detail).toEqual({ fov: 35 });

    window.removeEventListener(CAMERA_ZOOM_EVENT, handler);
  });

  it('CameraController handles CAMERA_ZOOM_EVENT and clamps fov', () => {
    expect(controller).toContain('CAMERA_ZOOM_EVENT');
    expect(controller).toContain('window.addEventListener(CAMERA_ZOOM_EVENT, onZoom)');
    expect(controller).toContain('window.removeEventListener(CAMERA_ZOOM_EVENT, onZoom)');
    expect(controller).toContain('Math.max(MIN_FOV, Math.min(MAX_FOV, custom.detail.fov))');
  });

  it('Office3D includes dynamic zoom slider and buttons', () => {
    expect(office3d).toContain('data-testid="camera-zoom-controls"');
    expect(office3d).toContain('type="range"');
    expect(office3d).toContain('requestCameraZoom');
    expect(office3d).toContain('handleZoomChange(zoomLevel - 10)');
    expect(office3d).toContain('handleZoomChange(zoomLevel + 10)');
  });
});

describe('Agent3D label cleansing (Poin 7)', () => {
  it('hides 3D character name label visually with sr-only', () => {
    // Label nama model karakter 3D tidak lagi muncul mengganggu di atas kepala agen
    expect(agent3d).toContain('className="sr-only"');
    expect(agent3d).toContain('data-testid="agent3d-character"');
    expect(agent3d).toContain('data-testid="agent3d-name"');
  });
});
