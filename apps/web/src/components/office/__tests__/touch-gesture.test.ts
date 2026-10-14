// @vitest-environment jsdom
/**
 * Touch vs pointer parity (audit 2026-10-14).
 *
 * Owner report: dragging the camera in the Telegram Mini App on a phone did
 * not feel like the mouse cursor on desktop. Root causes and their guards:
 *
 *  1. `touch-action: manipulation` on <body> let the browser claim the drag
 *     for scrolling → `pointercancel` → the camera stopped mid-swipe. Desktop
 *     mouse input never hit that path, so only the phone felt broken.
 *  2. No pointer capture: once the webview took over, `pointermove` went quiet.
 *  3. One finger could only rotate — a mouse reaches pan with Shift/right
 *     button, a finger has no modifier, so the gestures were not equivalent.
 *  4. A finger travels less than a cursor for the same intent: same gain as
 *     a mouse made every swipe feel heavy.
 *
 * Behaviour of the handlers themselves is asserted on source (jsdom cannot
 * deliver real pointer capture), the mode switch is exercised as a unit.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraGesture,
  getCameraGestureMode,
  setCameraGestureMode,
  toggleCameraGestureMode,
  CAMERA_GESTURE_MODE_EVENT,
} from '../office-3d/cameraState';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const controller = read('../office-3d/CameraController.tsx');
const office3d = read('../office-3d/Office3D.tsx');
const indexCss = read('../../../index.css');

describe('browser must not steal the gesture', () => {
  it('disables touch scrolling on the 3D stage and its canvas', () => {
    expect(indexCss).toMatch(/\.office-3d-stage,\s*\.office-3d-stage canvas\s*\{\s*touch-action:\s*none/);
    // The stage carries the hook class so the rule above actually matches it.
    expect(office3d).toContain('office-3d-stage');
  });

  it('kills the overscroll rubber-band that fires pointercancel mid-drag', () => {
    expect(indexCss).toContain('overscroll-behavior: none');
  });
});

describe('camera controller handles pointers like a mouse', () => {
  it('captures the pointer for the whole gesture and releases it on every lift path', () => {
    expect(controller).toContain('dom.setPointerCapture(e.pointerId)');
    expect(controller).toContain('dom.hasPointerCapture(e.pointerId)');
    expect(controller).toContain('dom.releasePointerCapture(e.pointerId)');
    // pointerup, pointercancel and a browser-revoked capture all end the gesture.
    expect(controller).toContain("window.addEventListener('pointercancel', finishPointer)");
    expect(controller).toContain("dom.addEventListener('lostpointercapture', finishPointer)");
  });

  it('reads the one-finger mode at pointerdown instead of hardcoding rotate', () => {
    expect(controller).toContain('getCameraGestureMode()');
    expect(controller).toMatch(/e\.pointerType === 'touch' && getCameraGestureMode\(\) === 'pan'/);
    // Shift / right-button pan still works for mouse and trackpad users.
    expect(controller).toContain('e.shiftKey || e.button === 2');
  });

  it('gives a finger the extra travel a cursor does not need', () => {
    expect(controller).toContain('const TOUCH_GAIN = 1.5');
    expect(controller).toContain("e.pointerType === 'touch' ? TOUCH_GAIN : 1");
    // Both single-finger gestures are scaled, pinch is left untouched.
    expect(controller).toContain('dx * gain.current * 0.006');
    expect(controller).toContain('panBy(dx * gain.current, dy * gain.current)');
  });

  it('offers wheel zoom on desktop, which had no handler before', () => {
    expect(controller).toContain("dom.addEventListener('wheel', handleWheel, { passive: false })");
    expect(controller).toContain('camera.fov + e.deltaY * WHEEL_ZOOM_PER_TICK');
  });
});

describe('one-finger gesture mode switch', () => {
  beforeEach(() => {
    setCameraGestureMode('rotate');
  });

  it('starts on rotate and flips to pan', () => {
    expect(getCameraGestureMode()).toBe('rotate');
    expect(toggleCameraGestureMode()).toBe('pan');
    expect(toggleCameraGestureMode()).toBe('rotate');
  });

  it('notifies listeners so the overlay button and hint follow', () => {
    const seen = vi.fn();
    window.addEventListener(CAMERA_GESTURE_MODE_EVENT, seen);
    setCameraGestureMode('pan');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(cameraGesture.mode).toBe('pan');
    window.removeEventListener(CAMERA_GESTURE_MODE_EVENT, seen);
  });

  it('exposes the switch in the stage overlay with a 44 px target and a matching hint', () => {
    expect(office3d).toContain('toggleCameraGestureMode');
    expect(office3d).toContain('aria-pressed={gestureMode === \'pan\'}');
    expect(office3d).toMatch(/w-11 h-11/);
    expect(office3d).toContain('Seret: geser • 2 jari: zoom');
    expect(office3d).toContain('Seret: putar • 2 jari: geser & zoom');
  });
});
