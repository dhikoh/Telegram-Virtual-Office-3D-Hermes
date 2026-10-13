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
