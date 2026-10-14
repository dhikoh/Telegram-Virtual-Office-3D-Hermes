/**
 * Diorama Camera Controller (Rule REQ-110, Tahap 4a).
 *
 * Gestures:
 *  - one finger / left drag .... rotate (azimuth + tilt), clamped so the view
 *                                stays isometric-ish instead of free orbit
 *  - shift + drag (desktop) .... pan along the floor
 *  - two fingers ............... pan (midpoint) + pinch (field of view)
 *  - "reset view" button ....... back to the framing the diorama was cut for
 *
 * The rotate gesture is the point of 4a: dragging used to slide the floor
 * plan under the camera, now it swings the camera around the room, which is
 * what makes the back wall, the window and the street behind it worth having.
 */

import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3, PerspectiveCamera } from 'three';
import { cameraDrag, CAMERA_RESET_EVENT, getCameraGestureMode } from './cameraState';
import { getRoomFocusTarget } from '@hermes-office/shared';
import { useRoomFocusStore } from '../../../stores/room-focus';

/** Framing the diorama was designed for: direction of (10,12,12), radius 17. */
export const DEFAULT_VIEW = {
  azimuth: Math.atan2(10, 12),
  elevation: Math.atan2(12, Math.hypot(10, 12)),
  radius: 17,
};
const DEFAULT_FOV = 38;

const MIN_ELEVATION = (18 * Math.PI) / 180;
const MAX_ELEVATION = (72 * Math.PI) / 180;
const MIN_FOV = 25;
const MAX_FOV = 60;
/** Closer than the overview: a focused room should fill the diorama. */
const FOCUS_RADIUS = 11;
/** Pointer travel that turns a tap into a camera drag (and blocks selection). */
const TAP_SLOP_PX = 6;
/**
 * Fingers travel a shorter distance than a mouse to cover the same intent, and
 * a fingertip reports its position with more lag than a cursor. Without this
 * the same swipe rotated far less on a phone than on a desktop (audit 2026-10-14).
 */
const TOUCH_GAIN = 1.5;
/** Desktop: wheel = zoom in/out, which until now had no handler at all. */
const WHEEL_ZOOM_PER_TICK = 0.04;

export const CameraController: React.FC = () => {
  const { camera, gl, invalidate } = useThree();
  const target = useRef(new Vector3(0, 0, 0));
  const view = useRef({ ...DEFAULT_VIEW });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gestureStart = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ midX: number; midY: number; dist: number } | null>(null);
  const panMode = useRef(false);
  /** Gain for the *current* gesture: 1 for a cursor, TOUCH_GAIN for a finger. */
  const gain = useRef(1);
  const activeRoom = useRoomFocusStore((s) => s.activeRoom);

  // Recompute the camera from the spherical state. Reads refs, so every
  // handler — however old its closure — applies the current view.
  const apply = () => {
    const { azimuth, elevation, radius } = view.current;
    const cosEl = Math.cos(elevation);
    camera.position.set(
      target.current.x + radius * Math.sin(azimuth) * cosEl,
      target.current.y + radius * Math.sin(elevation),
      target.current.z + radius * Math.cos(azimuth) * cosEl
    );
    camera.lookAt(target.current);
    invalidate();
  };

  const clampTarget = () => {
    target.current.x = Math.max(-7, Math.min(7, target.current.x));
    target.current.z = Math.max(-7, Math.min(7, target.current.z));
  };

  useEffect(() => {
    apply();

    const onReset = () => {
      view.current = { ...DEFAULT_VIEW };
      target.current.set(0, 0, 0);
      if (camera instanceof PerspectiveCamera) {
        camera.fov = DEFAULT_FOV;
        camera.updateProjectionMatrix();
      }
      apply();
    };
    window.addEventListener(CAMERA_RESET_EVENT, onReset);
    return () => window.removeEventListener(CAMERA_RESET_EVENT, onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, invalidate]);

  // Tahap 4b: the chip row drives the camera. Angling and rotation stay where
  // the user left them — only the look-at point and the distance change.
  useEffect(() => {
    const focus = getRoomFocusTarget(activeRoom);
    target.current.set(focus[0], 0, focus[2]);
    clampTarget();
    view.current.radius = activeRoom === 'all' ? DEFAULT_VIEW.radius : FOCUS_RADIUS;
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom]);

  useEffect(() => {
    const dom = gl.domElement;

    /** Slide the look-at point with a screen-space delta (pan gesture). */
    const panBy = (dxScreen: number, dyScreen: number) => {
      const az = view.current.azimuth;
      const scale = 0.012;
      const right = new Vector3(Math.cos(az), 0, -Math.sin(az));
      const forward = new Vector3(-Math.sin(az), 0, -Math.cos(az)); // camera -> target
      target.current.addScaledVector(right, -dxScreen * scale);
      target.current.addScaledVector(forward, dyScreen * scale);
      clampTarget();
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Keep the gesture even if the webview tries to claim it. Without capture
      // a touch drag silently dies the moment the browser starts scrolling.
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        /* very old webviews: degrade to the previous behaviour */
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        cameraDrag.down = true;
        cameraDrag.moved = false;
        gain.current = e.pointerType === 'touch' ? TOUCH_GAIN : 1;
        gestureStart.current = { x: e.clientX, y: e.clientY };
        // Right button or shift = pan on desktop; on touch the one-finger
        // gesture follows the mode chosen in the stage overlay.
        panMode.current =
          e.shiftKey || e.button === 2 || (e.pointerType === 'touch' && getCameraGestureMode() === 'pan');
      }
      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        pinch.current = {
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
          dist: Math.hypot(a.x - b.x, a.y - b.y),
        };
        panMode.current = false;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const pts = pointers.current;
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // A tap must stay a tap: ignore sub-slop movement entirely, so an agent
      // can still be selected with a normal click.
      if (!cameraDrag.moved) {
        if (
          cameraDrag.down &&
          Math.hypot(e.clientX - gestureStart.current.x, e.clientY - gestureStart.current.y) >
            TAP_SLOP_PX
        ) {
          cameraDrag.moved = true;
        } else {
          return;
        }
      }

      if (pts.size >= 2 && pinch.current) {
        // Two fingers: pan with the midpoint, pinch with the distance.
        const [a, b] = Array.from(pts.values());
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        panBy(midX - pinch.current.midX, midY - pinch.current.midY);
        const d = dist - pinch.current.dist;
        if (Math.abs(d) > 0.5 && camera instanceof PerspectiveCamera) {
          camera.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, camera.fov - d * 0.02));
          camera.updateProjectionMatrix();
        }
        pinch.current = { midX, midY, dist };
        apply();
        return;
      }

      if (panMode.current) {
        panBy(dx * gain.current, dy * gain.current);
        apply();
        return;
      }

      // Rotate: horizontal swings around the room, vertical tilts the diorama.
      view.current.azimuth -= dx * gain.current * 0.006;
      view.current.elevation = Math.max(
        MIN_ELEVATION,
        Math.min(MAX_ELEVATION, view.current.elevation + dy * gain.current * 0.005)
      );
      apply();
    };

    /** Desktop zoom: a wheel tick narrows/widens the field of view. */
    const handleWheel = (e: WheelEvent) => {
      if (!(camera instanceof PerspectiveCamera)) return;
      e.preventDefault();
      camera.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, camera.fov + e.deltaY * WHEEL_ZOOM_PER_TICK));
      camera.updateProjectionMatrix();
      apply();
    };

    const finishPointer = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      try {
        if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) {
        cameraDrag.down = false;
        // Keep `moved` true until after the click R3F may already have queued.
        window.setTimeout(() => {
          cameraDrag.moved = false;
        }, 0);
      }
    };

    const blockContextMenu = (e: Event) => e.preventDefault();

    dom.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishPointer);
    window.addEventListener('pointercancel', finishPointer);
    // The browser can revoke a capture of its own accord — treat it as a lift.
    dom.addEventListener('lostpointercapture', finishPointer);
    dom.addEventListener('wheel', handleWheel, { passive: false });
    dom.addEventListener('contextmenu', blockContextMenu);

    return () => {
      dom.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPointer);
      window.removeEventListener('pointercancel', finishPointer);
      dom.removeEventListener('lostpointercapture', finishPointer);
      dom.removeEventListener('wheel', handleWheel);
      dom.removeEventListener('contextmenu', blockContextMenu);
    };
  }, [camera, gl, invalidate]);

  return null;
};
