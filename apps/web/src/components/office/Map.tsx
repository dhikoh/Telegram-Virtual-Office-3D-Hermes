/**
 * 2D Interactive SVG Floor Plan (Rule REQ-071 & Section 8)
 * 8 Department Rooms + Lounge + Approval Gate.
 * Smooth avatar placement and movement based on status.
 */

import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { useAnimationFrame } from 'framer-motion';
import {
  getAgentPlacement,
  streetTraffic,
  spritePalette,
  STREET_SPAN,
  VEHICLE_BUS,
  VEHICLE_CAR,
} from '@hermes-office/shared';
import { Avatar } from './Avatar';
import { useOfficeStore, type OfficeAgent } from '../../stores/office';
import { usePowerStore } from '../../stores/power';
import { useRoomFocusStore } from '../../stores/room-focus';
import { spriteDataUrl } from '../../lib/sprites';

/** Tahap 5: the street strip below the rooms, 380 px wide like the canvas. */
const STRIP_TOP = 354;
const CURB_Y = 366;
const ROAD_BOTTOM = 414;
/** Lane centre lines, in canvas pixels (lane 0 runs left, lane 1 right). */
const LANE_Y = [372, 396];
/** world units (STREET_SPAN either side) mapped onto the canvas width. */
const STRIP_UNIT_PX = 380 / (2 * STREET_SPAN);

const StreetStrip: React.FC = () => {
  const isLowPower = usePowerStore((s) => s.isLowPower);
  const groupRefs = useRef<Record<string, SVGGElement | null>>({});
  // Deterministic base fleet: ids and vehicle kinds never change (ambient.ts).
  const fleet = useMemo(() => streetTraffic(0, false), []);

  const urls = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const v of fleet) {
      const map = v.kind === 'bus' ? VEHICLE_BUS : VEHICLE_CAR;
      out[v.id] = spriteDataUrl(map, spritePalette(map, v.color), v.kind === 'bus' ? 3 : 2);
    }
    return out;
  }, [fleet]);

  useAnimationFrame((tMs) => {
    // Rule 9.3: ECO freezes the street; the static t=0 frame stays on screen.
    if (isLowPower) return;
    for (const v of streetTraffic(tMs / 1000, false)) {
      const el = groupRefs.current[v.id];
      if (!el) continue;
      const px = 190 + v.x * STRIP_UNIT_PX;
      el.setAttribute(
        'transform',
        `translate(${px.toFixed(1)} ${LANE_Y[v.lane]}) scale(${v.lane === 0 ? -1 : 1} 1)`
      );
    }
  });

  return (
    <g id="street-strip" role="img" aria-label="Jalan di depan kantor">
      <rect x="0" y={STRIP_TOP} width="380" height={CURB_Y - STRIP_TOP} fill="#D2D8E2" />
      <rect x="0" y={CURB_Y} width="380" height={ROAD_BOTTOM - CURB_Y} fill="#B9C0CD" />
      <rect x="0" y={CURB_Y} width="380" height="2" fill="#8A97A9" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={8 + i * 48} y={389} width="24" height="3" fill="#FFFFFF" />
      ))}
      <rect x="0" y={ROAD_BOTTOM} width="380" height="6" fill="#D2D8E2" />
      {fleet.map((v) => {
        const url = urls[v.id];
        if (!url) return null;
        const w = v.kind === 'bus' ? 30 : 20;
        const h = v.kind === 'bus' ? 15 : 10;
        return (
          <g
            key={v.id}
            ref={(el) => {
              groupRefs.current[v.id] = el;
            }}
            transform={`translate(${(190 + v.x * STRIP_UNIT_PX).toFixed(1)} ${LANE_Y[v.lane]}) scale(${
              v.lane === 0 ? -1 : 1
            } 1)`}
          >
            <image href={url} x={-w / 2} y={-h / 2} width={w} height={h} style={{ imageRendering: 'pixelated' }} />
          </g>
        );
      })}
    </g>
  );
};

interface MapProps {
  onSelectAgent: (agent: OfficeAgent) => void;
  onOpenRecruitment?: () => void;
}

export const Map: React.FC<MapProps> = ({ onSelectAgent, onOpenRecruitment }) => {
  const { t } = useTranslation();
  const { agents, selectedAgentId } = useOfficeStore();
  const { activeRoom } = useRoomFocusStore();

  // Tahap 4b: only the active room stays fully lit, the rest recede.
  const focusKey = activeRoom === 'all' ? null : activeRoom;
  const roomStyle = (roomId: string) => ({
    opacity: !focusKey || focusKey === roomId ? 1 : 0.3,
    transition: 'opacity 160ms ease',
  });

  // Compute coordinate for each agent using shared single source of truth (Rule 9.1)
  let idleCount = 0;
  const agentPositions = agents.map((agent) => {
    const slotIdx = agent.status === 'idle' ? idleCount++ : 0;
    const placement = getAgentPlacement(agent, agent.status, slotIdx);
    return { agent, pos: placement.pos2d };
  });

  return (
    <div className="relative w-full max-w-[390px] mx-auto aspect-[380/420] rounded-xl overflow-hidden border border-office-border bg-office-surface shadow-2xl select-none">
      {/* SVG Floor Architecture */}
      <svg
        viewBox="0 0 380 420"
        className="w-full h-full absolute inset-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Floor grid pattern */}
          <pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="0.8" />
          </pattern>

          {/* Lounge carpet gradient */}
          <radialGradient id="lounge-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(124, 92, 252, 0.12)" />
            <stop offset="100%" stopColor="rgba(124, 92, 252, 0.02)" />
          </radialGradient>

          {/* Command center glow */}
          <radialGradient id="command-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(245, 158, 11, 0.14)" />
            <stop offset="100%" stopColor="rgba(245, 158, 11, 0.04)" />
          </radialGradient>

          {/* Tahap 5: 16 px pixel tiles under the whole plan */}
          <pattern id="pixel-tile" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#F1F5FA" />
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#E2E9F2" strokeWidth="1" />
          </pattern>

          {/* Approval gate caution stripe pattern */}
          <pattern id="caution-stripes" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(180, 83, 9, 0.14)" strokeWidth="4" />
          </pattern>
        </defs>

        {/* Floor Background Grid over the pixel tiles */}
        <rect width="380" height="420" fill="url(#pixel-tile)" />
        <rect width="380" height="420" fill="url(#floor-grid)" />

        {/* 1. Command Center (Center Top) */}
        <g id="room-command" style={roomStyle('command')}>
          <rect
            x="120"
            y="12"
            width="140"
            height="70"
            rx="8"
            fill="url(#command-glow)"
            stroke="rgba(180, 83, 9, 0.5)"
            strokeWidth="1.2"
          />
          {/* Desk console */}
          <rect x="160" y="45" width="60" height="20" rx="4" fill="rgba(245, 158, 11, 0.16)" stroke="rgba(180, 83, 9, 0.55)" />
          <text x="190" y="27" textAnchor="middle" fill="#B45309" fontSize="9" fontWeight="bold" letterSpacing="0.8">
            {t('rooms.command')}
          </text>
        </g>

        {/* 2. Approval Gate (Below Command Center) */}
        <g id="room-approval-gate" style={roomStyle('approvalGate')}>
          <rect
            x="145"
            y="90"
            width="90"
            height="34"
            rx="6"
            fill="url(#caution-stripes)"
            stroke="rgba(251, 191, 36, 0.45)"
            strokeWidth="1"
          />
          <text x="190" y="103" textAnchor="middle" fill="#7C2D12" fontSize="8" fontWeight="600" letterSpacing="0.5">
            {t('rooms.approvalGate')}
          </text>
        </g>

        {/* 3. Social Studio (Left Top) */}
        <g id="room-social" style={roomStyle('social')}>
          <rect x="12" y="12" width="98" height="74" rx="8" fill="#FBFDFF" stroke="#D6DEEA" />
          <rect x="36" y="46" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="61" y="26" textAnchor="middle" fill="#64748B" fontSize="8.5" fontWeight="600">
            {t('rooms.social')}
          </text>
        </g>

        {/* 4. Marketing Lab (Right Top) */}
        <g id="room-marketing" style={roomStyle('marketing')}>
          <rect x="270" y="12" width="98" height="74" rx="8" fill="#FBFDFF" stroke="#D6DEEA" />
          <rect x="294" y="46" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="319" y="26" textAnchor="middle" fill="#64748B" fontSize="8.5" fontWeight="600">
            {t('rooms.marketing')}
          </text>
        </g>

        {/* 5. Sales Floor (Left Mid) */}
        <g id="room-sales" style={roomStyle('sales')}>
          <rect x="12" y="96" width="98" height="74" rx="8" fill="#FBFDFF" stroke="#D6DEEA" />
          <rect x="36" y="130" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="61" y="110" textAnchor="middle" fill="#64748B" fontSize="8.5" fontWeight="600">
            {t('rooms.sales')}
          </text>
        </g>

        {/* 6. Analytics Hub (Right Mid) */}
        <g id="room-analytics" style={roomStyle('analytics')}>
          <rect x="270" y="96" width="98" height="74" rx="8" fill="#FBFDFF" stroke="#D6DEEA" />
          <rect x="294" y="130" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="319" y="110" textAnchor="middle" fill="#64748B" fontSize="8.5" fontWeight="600">
            {t('rooms.analytics')}
          </text>
        </g>

        {/* 7. Finance Vault (Left Lower) */}
        <g id="room-finance" style={roomStyle('finance')}>
          <rect x="12" y="180" width="98" height="74" rx="8" fill="#FBFDFF" stroke="#D6DEEA" />
          <rect x="36" y="214" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="61" y="194" textAnchor="middle" fill="#64748B" fontSize="8.5" fontWeight="600">
            {t('rooms.finance')}
          </text>
        </g>

        {/* 8. Support Desk (Right Lower) */}
        <g id="room-support" style={roomStyle('support')}>
          <rect x="270" y="180" width="98" height="74" rx="8" fill="#FBFDFF" stroke="#D6DEEA" />
          <rect x="294" y="214" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="319" y="194" textAnchor="middle" fill="#64748B" fontSize="8.5" fontWeight="600">
            {t('rooms.support')}
          </text>
        </g>

        {/* 9. HR / Recruitment Room (Left Bottom with '+' Door) */}
        <g id="room-hr" style={roomStyle('hr')}>
          <rect x="12" y="264" width="98" height="84" rx="8" fill="#FBFDFF" stroke="rgba(124, 92, 252, 0.5)" />
          <rect x="36" y="304" width="50" height="18" rx="4" fill="rgba(124, 92, 252, 0.1)" stroke="rgba(124, 92, 252, 0.45)" />
          <text x="61" y="279" textAnchor="middle" fill="#6D28D9" fontSize="8.5" fontWeight="600">
            {t('rooms.hr')}
          </text>
        </g>

        {/* 10. Central Lounge (Center Large Zone for Idle agents) */}
        <g id="room-lounge" style={roomStyle('lounge')}>
          <rect
            x="125"
            y="136"
            width="130"
            height="180"
            rx="12"
            fill="url(#lounge-glow)"
            stroke="rgba(124, 92, 252, 0.45)"
            strokeWidth="1"
          />
          {/* Coffee table in lounge center */}
          <circle cx="190" cy="225" r="18" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="190" y="152" textAnchor="middle" fill="#6D28D9" fontSize="9" fontWeight="bold" letterSpacing="0.6">
            {t('rooms.lounge')}
          </text>
          <text x="190" y="228" textAnchor="middle" fill="rgba(31, 41, 55, 0.35)" fontSize="10">
            ☕
          </text>
        </g>

        {/* Tahap 5: the street outside, drawn from the same numbers the 3D
            diorama uses (Rule 9.1 parity, ambient.ts streetTraffic). */}
        <StreetStrip />
      </svg>

      {/* HR Door with '+' Button (Rule REQ-071: door with "+") */}
      <button
        onClick={onOpenRecruitment}
        type="button"
        title={t('rooms.hr')}
        style={roomStyle('hr')}
        className="absolute left-[92px] top-[266px] w-6 h-6 rounded-full bg-office-violet/20 border border-office-violet text-office-violet hover:bg-office-violet hover:text-office-text flex items-center justify-center text-xs font-bold shadow-nu-raised transition-transform active:scale-90 z-20"
      >
        <UserPlus className="w-3.5 h-3.5" />
      </button>

      {/* Agent Avatars Layer.
          Hidden while a sheet/modal is open: the overlay already covers it,
          and dropping the layer removes any chance of the pills painting on
          top of the sheet content (review defect #1, 2026-10-13). */}
      <div
        className={`absolute inset-0 pointer-events-auto transition-opacity duration-150 ${
          selectedAgentId ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {agentPositions.map(({ agent, pos }) => (
          <Avatar
            key={agent.id}
            agent={agent}
            targetX={pos.x}
            targetY={pos.y}
            onClick={onSelectAgent}
            showLabel={agent.status !== 'idle' || agent.id === selectedAgentId}
          />
        ))}
      </div>
    </div>
  );
};
