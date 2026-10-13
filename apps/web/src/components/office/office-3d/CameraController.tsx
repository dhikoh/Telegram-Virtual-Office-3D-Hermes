/**
 * Isometric Camera Controller with clamped touch pan and pinch zoom (Rule REQ-110).
 * Prevents free orbit, enforcing fixed isometric angle with smooth navigation.
 */

import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3, PerspectiveCamera } from 'three';

export const CameraController: React.FC = () => {
  const { camera, gl, invalidate } = useThree();
  const isDragging = useRef(false);
  const lastTouch = useRef({ x: 0, y: 0 });
  const lastDistance = useRef<number | null>(null);
  const target = useRef(new Vector3(0, 0, 0));

  useEffect(() => {
    // Initial isometric angle — Tahap 3 pulls the camera in so the room
    // reads as a place you are looking into instead of a plan seen from orbit.
    camera.position.set(10, 12, 12);
    camera.lookAt(target.current);
    invalidate();
  }, [camera, invalidate]);

  useEffect(() => {
    const dom = gl.domElement;

    const clampTarget = () => {
      target.current.x = Math.max(-7, Math.min(7, target.current.x));
      target.current.z = Math.max(-7, Math.min(7, target.current.z));
      const offset = new Vector3(10, 12, 12).multiplyScalar(camera.zoom ? 1 / camera.zoom : 1);
      camera.position.copy(target.current).add(offset);
      camera.lookAt(target.current);
      invalidate();
    };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      lastTouch.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = (e.clientX - lastTouch.current.x) * 0.025;
      const dy = (e.clientY - lastTouch.current.y) * 0.025;
      lastTouch.current = { x: e.clientX, y: e.clientY };

      // Pan along isometric floor plane
      target.current.x -= (dx - dy) * 0.7;
      target.current.z -= (dx + dy) * 0.7;
      clampTarget();
    };

    const handlePointerUp = () => {
      isDragging.current = false;
      lastDistance.current = null;
    };

    // Touch pinch-to-zoom support
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);

        if (lastDistance.current !== null) {
          const delta = (dist - lastDistance.current) * 0.005;
          if (camera instanceof PerspectiveCamera) {
            camera.fov = Math.max(25, Math.min(60, camera.fov - delta * 15));
            camera.updateProjectionMatrix();
            invalidate();
          }
        }
        lastDistance.current = dist;
      }
    };

    dom.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      dom.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      dom.removeEventListener('touchmove', handleTouchMove);
    };
  }, [camera, gl, invalidate]);

  return null;
};
