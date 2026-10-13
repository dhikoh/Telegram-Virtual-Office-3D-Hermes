/**
 * Room chips (Tahap 4b, docs/DESIGN_DIRECTION.md 7.4 "Konsekuensi Konsep A").
 *
 * Replaces the "ten rooms at once" navigation with an active room plus a
 * chip row to jump between them. Shared by the 2D map and the 3D diorama:
 * the chips write the room-focus store, each renderer reacts in its own way
 * (3D frames the camera, 2D dims the rest).
 *
 * Chips are 44 px tall for the touch-target rule (section 6), the row scrolls
 * horizontally instead of wrapping, and every chip carries an agent count so
 * the row doubles as "who is where".
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ROOM_FOCUS_IDS,
  getRoomFocusNameKey,
  type RoomFocusId,
} from '@hermes-office/shared';
import { useOfficeStore } from '../../stores/office';
import { useRoomFocusStore } from '../../stores/room-focus';

/** Agents worth counting for a focus id (Rule: numbers come from live state). */
function countAgents(agents: Array<{ department?: string; status: string }>, id: RoomFocusId): number {
  if (id === 'all') return agents.length;
  if (id === 'lounge') return agents.filter((a) => a.status === 'idle').length;
  if (id === 'approvalGate') return agents.filter((a) => a.status === 'waiting_approval').length;
  return agents.filter((a) => a.department === id && a.status !== 'idle').length;
}

export const RoomChips: React.FC = () => {
  const { t } = useTranslation();
  const { agents } = useOfficeStore();
  const { activeRoom, setActiveRoom } = useRoomFocusStore();

  return (
    <div className="w-full max-w-[390px] mx-auto mb-2">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 px-0.5" role="tablist" aria-label="Fokus ruang">
        {ROOM_FOCUS_IDS.map((id) => {
          const isActive = id === activeRoom;
          const count = countAgents(agents, id);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-pressed={isActive}
              onClick={() => setActiveRoom(id)}
              className={[
                'h-11 shrink-0 px-3 rounded-full border text-xs font-semibold',
                'flex items-center gap-1.5 whitespace-nowrap select-none',
                'transition-colors active:scale-95',
                isActive
                  ? 'bg-office-accent text-office-on-accent border-office-accent shadow-nu-raised'
                  : 'bg-office-inset text-office-text/75 border-office-border hover:border-office-accent/70',
              ].join(' ')}
            >
              <span>{t(getRoomFocusNameKey(id))}</span>
              <span
                className={[
                  'text-[10px] font-mono tabular-nums',
                  isActive ? 'text-office-on-accent/80' : 'text-office-muted',
                ].join(' ')}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RoomChips;
