/**
 * Active room (Tahap 4b, Konsekuensi Konsep A).
 *
 * One store for both renderers: the chip row writes it, the 3D camera reads
 * it to frame the room, the 2D map reads it to dim everything else. Keeps
 * "which room am I looking at" out of either renderer's local state, so the
 * two views can never disagree (Rule 9.1 applies to positions; this is the
 * same idea for navigation).
 */

import { create } from 'zustand';
import type { RoomFocusId } from '@hermes-office/shared';

interface RoomFocusState {
  activeRoom: RoomFocusId;
  setActiveRoom: (id: RoomFocusId) => void;
}

export const useRoomFocusStore = create<RoomFocusState>((set) => ({
  activeRoom: 'all',
  setActiveRoom: (activeRoom) => set({ activeRoom }),
}));
