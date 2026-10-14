/**
 * Shared camera interaction state (Tahap 4a).
 *
 * The camera controller owns pointer gestures, the agent meshes own clicks —
 * they live in different trees, so the "was this a drag or a tap?" flag has
 * to be reachable from both. Without it, releasing a rotate gesture over an
 * agent opens its sheet.
 */

export const cameraDrag = {
  /** true while a camera gesture is in progress */
  down: false,
  /** true once the pointer travelled far enough that this is a drag, not a tap */
  moved: false,
};

/**
 * Single-finger gesture mode (audit 2026-10-14).
 *
 * On a mouse, pan is reachable with Shift/right-button — on a phone there is
 * no such modifier, so one finger could only ever rotate. The mode is module
 * state (not React state) because CameraController reads it inside a pointer
 * handler; Office3D only mirrors it to redraw its toggle button.
 */
export type CameraGestureMode = 'rotate' | 'pan';

export const CAMERA_GESTURE_MODE_EVENT = 'hermes-office-camera-gesture-mode';

export const cameraGesture = { mode: 'rotate' as CameraGestureMode };

export function getCameraGestureMode(): CameraGestureMode {
  return cameraGesture.mode;
}

/** Returns the new mode so callers can update their UI without re-reading. */
export function setCameraGestureMode(mode: CameraGestureMode): CameraGestureMode {
  cameraGesture.mode = mode;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CAMERA_GESTURE_MODE_EVENT));
  }
  return mode;
}

export function toggleCameraGestureMode(): CameraGestureMode {
  return setCameraGestureMode(cameraGesture.mode === 'rotate' ? 'pan' : 'rotate');
}

/** Office3D dispatches this from its "reset view" button. */
export const CAMERA_RESET_EVENT = 'hermes-office-camera-reset';

export function requestCameraReset(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CAMERA_RESET_EVENT));
  }
}

/** Call from an agent's onClick: a camera drag must never select an agent. */
export function isCameraDrag(): boolean {
  return cameraDrag.down && cameraDrag.moved;
}
