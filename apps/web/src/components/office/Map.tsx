/**
 * 2D Interactive SVG Floor Plan (Rule REQ-071 & Section 8)
 * 8 Department Rooms + Lounge + Approval Gate.
 * Smooth avatar placement and movement based on status.
 *
 * Tahap 17 — every room now takes its footprint, its floor and its glazing
 * from `roomVariants.ts` in the shared package (Rule 9.1), the same table the
 * 3D diorama reads. The room rectangles come from `ROOM_LAYOUTS` /
 * `LOUNGE_AREA` / `APPROVAL_GATE`; this file declares no room geometry of its
 * own, so the plan and the diorama cannot disagree about where a room is or
 * what it looks like.
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
  ROOM_LAYOUTS,
  LOUNGE_AREA,
  APPROVAL_GATE,
  roomVariant,
  roomShapePoints,
  roomFrontEdge,
  roomFloorBand2d,
  GLAZING,
  type PlanRect,
  type RoomFloor,
  type RoomVariant,
} from '@hermes-office/shared';
import { Avatar } from './Avatar';
import { useOfficeStore, type OfficeAgent } from '../../stores/office';
import { usePowerStore } from '../../stores/power';
import { useRoomFocusStore } from '../../stores/room-focus';
import { spriteDataUrl } from '../../lib/sprites';
import { STREET_PROPS, STREET_PROP_SIZE, streetTileUrl } from '../../lib/streetTiles';

/** Tahap 5: the street strip below the rooms, 380 px wide like the canvas. */
const STRIP_TOP = 354;
const CURB_Y = 366;
const ROAD_BOTTOM = 414;
/** Lane centre lines, in canvas pixels (lane 0 runs left, lane 1 right). */
const LANE_Y = [372, 396];
/** world units (STREET_SPAN either side) mapped onto the canvas width. */
const STRIP_UNIT_PX = 380 / (2 * STREET_SPAN);

/**
 * Tahap 16 — Kenney CC0 pixel tiles (see lib/streetTiles.ts for the atlas
 * index table). One 16 px tile per pattern, snapped to the same grid as the
 * lane geometry: `patternTransform` is the tile's offset mod 16, so with
 * `translate(0 14)` every tile starts on y ≡ 14 (mod 16) — 350, 366, 382,
 * 398 — and the kerb line, the dash row and the far edge line land exactly on
 * the numbers the flat street already used.
 */
const PIXELATED: React.CSSProperties = { imageRendering: 'pixelated' };

/** y offset (mod 16) that puts a tile's top edge at `tileTopY`. */
const patternOffset = (tileTopY: number) => `translate(0 ${tileTopY % 16})`;

const StreetTilePattern: React.FC<{
  id: string;
  tile: Parameters<typeof streetTileUrl>[0];
  tileTopY: number;
}> = ({ id, tile, tileTopY }) => (
  <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform={patternOffset(tileTopY)}>
    <image href={streetTileUrl(tile)} width="16" height="16" style={PIXELATED} />
  </pattern>
);

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
      {/* --- flat fallback, drawn first: a pattern whose <image> 404s
          renders nothing, so the street below is what shows through. --- */}
      <rect x="0" y={STRIP_TOP} width="380" height={CURB_Y - STRIP_TOP} fill="#D2D8E2" />
      <rect x="0" y={CURB_Y} width="380" height={ROAD_BOTTOM - CURB_Y} fill="#B9C0CD" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={8 + i * 48} y={389} width="24" height="3" fill="#FFFFFF" />
      ))}
      <rect x="0" y={ROAD_BOTTOM} width="380" height="6" fill="#D2D8E2" />

      {/* --- Tahap 16: the same street, tiled with Kenney's 16 px CC0 tiles.
          All static (no per-frame work), so ECO keeps them on screen. --- */}
      <defs>
        {/* pavement rows 4–15 land in the 12 px band: flat, then the 4 px
            checker, then row 15 (dark #69717B) as the kerb at y = 365. */}
        <StreetTilePattern id="tile-sidewalk-near" tile="sidewalk" tileTopY={STRIP_TOP - 4} />
        {/* far pavement: row 15 lands on y = 414, the road's bottom edge. */}
        <StreetTilePattern id="tile-sidewalk-far" tile="sidewalk" tileTopY={ROAD_BOTTOM - 15} />
        {/* road base: three tiles at 366 / 382 / 398 cover 366–414. */}
        <StreetTilePattern id="tile-asphalt" tile="asphalt" tileTopY={CURB_Y} />
        {/* solid kerb line on row 2 → y = 368, just under the curb face. */}
        <StreetTilePattern id="tile-edge-top" tile="edgeTop" tileTopY={CURB_Y} />
        {/* dash on rows 7–8 → y = 389–390, where the flat dashes were. */}
        <StreetTilePattern id="tile-lane-dash" tile="laneDash" tileTopY={389 - 7} />
        {/* solid line on row 13 → y = 411, just above ROAD_BOTTOM. */}
        <StreetTilePattern id="tile-edge-bottom" tile="edgeBottom" tileTopY={ROAD_BOTTOM - 16} />
      </defs>

      <rect x="0" y={STRIP_TOP} width="380" height={CURB_Y - STRIP_TOP} fill="url(#tile-sidewalk-near)" />
      <rect x="0" y={ROAD_BOTTOM} width="380" height="6" fill="url(#tile-sidewalk-far)" />
      <rect x="0" y={CURB_Y} width="380" height={ROAD_BOTTOM - CURB_Y} fill="url(#tile-asphalt)" />
      <rect x="0" y={CURB_Y} width="380" height={8} fill="url(#tile-edge-top)" />
      <rect x="0" y={382} width="380" height={16} fill="url(#tile-lane-dash)" />
      <rect x="0" y={ROAD_BOTTOM - 8} width="380" height={8} fill="url(#tile-edge-bottom)" />

      {/* Kerb face: unchanged flat colour, drawn over the tiled layers so the
          curb reads exactly as it did; the flat sidewalk/road behind it is
          what shows if a tile PNG ever fails to load. */}
      <rect x="0" y={CURB_Y} width="380" height="2" fill="#8A97A9" />

      {/* Dressing props stand on the curb, 12 px tall so they stay inside the
          strip — the floor plan above y = 354 and the lanes below y = 366 are
          untouched. Drawn before the fleet: a passing vehicle is never
          covered by a prop. */}
      {STREET_PROPS.map((prop) => (
        <image
          key={`${prop.id}-${prop.x}`}
          href={streetTileUrl(prop.id)}
          x={prop.x}
          y={CURB_Y - STREET_PROP_SIZE}
          width={STREET_PROP_SIZE}
          height={STREET_PROP_SIZE}
          style={PIXELATED}
        />
      ))}

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

/**
 * Approval gate plate: 90 x 34 centred on the shared gate point, so the drawn
 * plate and `getRoomFocusRect2d('approvalGate')` describe the same place.
 */
const GATE_RECT: PlanRect = {
  x: APPROVAL_GATE.pos2d.x - 45,
  y: APPROVAL_GATE.pos2d.y - 18,
  width: 90,
  height: 34,
};

/**
 * The body of one room's floor `<pattern>`. Tile pitch, base fill, rule ink
 * and accent all come from the shared `floor` data, so Finance's ledger tiles
 * cannot come out looking like Social's studio dots.
 */
const floorPatternBody = (floor: RoomFloor): React.ReactElement => {
  const t = floor.tile;
  const half = t / 2;
  switch (floor.pattern) {
    case 'grid':
      return (
        <>
          <rect width={t} height={t} fill={floor.base} />
          <path d={`M ${t} 0 L 0 0 0 ${t}`} fill="none" stroke={floor.line} strokeWidth="1" />
        </>
      );
    case 'stripe':
      return (
        <>
          <rect width={t} height={t} fill={floor.base} />
          <rect y={half - 1} width={t} height="1.4" fill={floor.line} />
          <rect y={t - 2.4} width={t} height="1.4" fill={floor.accent} fillOpacity="0.4" />
        </>
      );
    case 'checker':
      return (
        <>
          <rect width={t} height={t} fill={floor.base} />
          <rect width={half} height={half} fill={floor.line} />
          <rect x={half} y={half} width={half} height={half} fill={floor.accent} fillOpacity="0.3" />
        </>
      );
    case 'dots':
      return (
        <>
          <rect width={t} height={t} fill={floor.base} />
          <circle cx={half} cy={half} r={Math.max(1, t / 8)} fill={floor.accent} fillOpacity="0.45" />
          <path d={`M ${t} 0 L 0 0 0 ${t}`} fill="none" stroke={floor.line} strokeWidth="0.6" />
        </>
      );
    case 'ledger':
      return (
        <>
          <rect width={t} height={t} fill={floor.base} />
          <rect y={t - 1} width={t} height="1" fill={floor.line} />
          <rect x={half - 0.5} width="1" height={t} fill={floor.line} />
          <rect x={t - 2} y={t / 3} width="1.6" height={t / 3} fill={floor.accent} fillOpacity="0.55" />
        </>
      );
    case 'plain':
      return <rect width={t} height={t} fill={floor.base} />;
  }
};

/** The footprint outline of a room as an SVG `points` string. */
const polygonPoints = (variant: RoomVariant, rect: PlanRect): string =>
  roomShapePoints(variant.shape, rect)
    .map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`)
    .join(' ');

/**
 * One room's shell: the footprint cut from the shared `shape`, painted with
 * the room's own floor pattern, edged with its outline ink, with the accent
 * band and the `partition` glazing along the front edge.
 */
const RoomShell: React.FC<{ variant: RoomVariant; rect: PlanRect; children?: React.ReactNode }> = ({
  variant,
  rect,
  children,
}) => {
  const points = polygonPoints(variant, rect);
  const band = roomFloorBand2d(variant.floor, variant.shape, rect);
  const front = roomFrontEdge(variant.shape, rect);
  const glazingHeight = variant.partition === 'half-wall' ? 5 : 3;

  return (
    <>
      {/* Flat base under the pattern: if a pattern def ever goes missing the
          room still reads as a room instead of a hole. */}
      <polygon points={points} fill={variant.floor.base} />
      <polygon points={points} fill={`url(#room-floor-${variant.id})`} />
      {band && (
        <rect
          x={band.x}
          y={band.y}
          width={band.width}
          height={band.height}
          fill={variant.floor.accent}
          fillOpacity="0.6"
        />
      )}
      <polygon points={points} fill="none" stroke={variant.stroke} strokeWidth="1.2" />
      {/* Partition glazing: a pane standing just inside the room's front edge. */}
      {variant.partition !== 'none' && (
        <rect
          x={front.x}
          y={front.y - glazingHeight}
          width={front.width}
          height={glazingHeight}
          rx="1"
          fill={variant.partition === 'half-wall' ? GLAZING.halfWall : GLAZING.pane}
          stroke={GLAZING.frame}
          strokeWidth="0.6"
        />
      )}
      {children}
    </>
  );
};

export const Map: React.FC<MapProps> = ({ onSelectAgent, onOpenRecruitment }) => {
  const { t } = useTranslation();
  const { agents, selectedAgentId, departments } = useOfficeStore();
  const { activeRoom } = useRoomFocusStore();

  // Tahap 10 — the eight rects below stay static (the 380×420 canvas is
  // full), but their labels now come from the departments table: a rename in
  // More shows up here, and a hidden room dims. Custom rooms have no rect —
  // their agents stand at the shared fallback desk (see shared placement).
  const deptById: Record<string, { name: string | null; hidden: boolean }> = {};
  for (const d of departments) deptById[d.id] = { name: d.name, hidden: d.hidden };
  const roomLabel = (id: string) => deptById[id]?.name ?? t(`rooms.${id}`);
  const MAP_ROOM_IDS = [
    'command',
    'social',
    'marketing',
    'sales',
    'analytics',
    'finance',
    'support',
    'hr',
    'lounge',
    'approvalGate',
  ];

  // Tahap 17 — one lookup for the whole table: footprint, floor recipe and
  // glazing come from the shared module, the room rectangles from the shared
  // layout module. An unknown id falls back to a plain office room.
  const variantOf = (id: string) => roomVariant(id);
  const rectOf = (id: string): PlanRect =>
    id === 'lounge'
      ? LOUNGE_AREA.pos2d
      : id === 'approvalGate'
        ? GATE_RECT
        : ROOM_LAYOUTS[id].pos2d;

  // Tahap 4b: only the active room stays fully lit, the rest recede.
  // Tahap 10: focusing a custom room (no rect on the map) dims nothing, so
  // the agent cluster stays readable instead of fading the whole floor.
  const focusKey = activeRoom === 'all' ? null : activeRoom;
  const focusOnMap = focusKey === null || MAP_ROOM_IDS.includes(focusKey);
  const roomStyle = (roomId: string) => ({
    opacity: !focusOnMap || !focusKey || focusKey === roomId
      ? (deptById[roomId]?.hidden ? 0.4 : 1)
      : 0.3,
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

          {/* Tahap 17 — one floor pattern per room, straight from the shared
              variant table: tile pitch, base fill, rule ink and accent. */}
          {MAP_ROOM_IDS.map((id) => {
            const floor = variantOf(id).floor;
            return (
              <pattern
                key={id}
                id={`room-floor-${id}`}
                width={floor.tile}
                height={floor.tile}
                patternUnits="userSpaceOnUse"
              >
                {floorPatternBody(floor)}
              </pattern>
            );
          })}
        </defs>

        {/* Floor Background Grid over the pixel tiles */}
        <rect width="380" height="420" fill="url(#pixel-tile)" />
        <rect width="380" height="420" fill="url(#floor-grid)" />

        {/* 1. Command Center (Center Top) */}
        <g id="room-command" style={roomStyle('command')}>
          <RoomShell variant={variantOf('command')} rect={rectOf('command')}>
            <polygon points={polygonPoints(variantOf('command'), rectOf('command'))} fill="url(#command-glow)" />
          </RoomShell>
          {/* Desk console */}
          <rect x="160" y="45" width="60" height="20" rx="4" fill="rgba(245, 158, 11, 0.16)" stroke="rgba(180, 83, 9, 0.55)" />
          <text x="190" y="27" textAnchor="middle" fill={variantOf('command').labelInk} fontSize="9" fontWeight="bold" letterSpacing="0.8">
            {roomLabel('command')}
          </text>
        </g>

        {/* 2. Approval Gate (Below Command Center) */}
        <g id="room-approval-gate" style={roomStyle('approvalGate')}>
          <RoomShell variant={variantOf('approvalGate')} rect={rectOf('approvalGate')}>
            <rect x="145" y="90" width="90" height="34" rx="6" fill="url(#caution-stripes)" />
          </RoomShell>
          <text x="190" y="103" textAnchor="middle" fill={variantOf('approvalGate').labelInk} fontSize="7" fontWeight="600" letterSpacing="0.3">
            {t('rooms.approvalGate')}
          </text>
        </g>

        {/* 3. Social Studio (Left Top) */}
        <g id="room-social" style={roomStyle('social')}>
          <RoomShell variant={variantOf('social')} rect={rectOf('social')} />
          <rect x="36" y="46" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="61" y="26" textAnchor="middle" fill={variantOf('social').labelInk} fontSize="8.5" fontWeight="600">
            {roomLabel('social')}
          </text>
        </g>

        {/* 4. Marketing Lab (Right Top) */}
        <g id="room-marketing" style={roomStyle('marketing')}>
          <RoomShell variant={variantOf('marketing')} rect={rectOf('marketing')} />
          <rect x="294" y="46" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="319" y="26" textAnchor="middle" fill={variantOf('marketing').labelInk} fontSize="8.5" fontWeight="600">
            {roomLabel('marketing')}
          </text>
        </g>

        {/* 5. Sales Floor (Left Mid) */}
        <g id="room-sales" style={roomStyle('sales')}>
          <RoomShell variant={variantOf('sales')} rect={rectOf('sales')} />
          <rect x="36" y="130" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="61" y="110" textAnchor="middle" fill={variantOf('sales').labelInk} fontSize="8.5" fontWeight="600">
            {roomLabel('sales')}
          </text>
        </g>

        {/* 6. Analytics Hub (Right Mid) */}
        <g id="room-analytics" style={roomStyle('analytics')}>
          <RoomShell variant={variantOf('analytics')} rect={rectOf('analytics')} />
          <rect x="294" y="130" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="319" y="110" textAnchor="middle" fill={variantOf('analytics').labelInk} fontSize="8.5" fontWeight="600">
            {roomLabel('analytics')}
          </text>
        </g>

        {/* 7. Finance Vault (Left Lower) */}
        <g id="room-finance" style={roomStyle('finance')}>
          <RoomShell variant={variantOf('finance')} rect={rectOf('finance')} />
          <rect x="36" y="214" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="61" y="194" textAnchor="middle" fill={variantOf('finance').labelInk} fontSize="8.5" fontWeight="600">
            {roomLabel('finance')}
          </text>
        </g>

        {/* 8. Support Desk (Right Lower) */}
        <g id="room-support" style={roomStyle('support')}>
          <RoomShell variant={variantOf('support')} rect={rectOf('support')} />
          <rect x="294" y="214" width="50" height="18" rx="4" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="319" y="194" textAnchor="middle" fill={variantOf('support').labelInk} fontSize="8.5" fontWeight="600">
            {roomLabel('support')}
          </text>
        </g>

        {/* 9. HR / Recruitment Room (Left Bottom with '+' Door) */}
        <g id="room-hr" style={roomStyle('hr')}>
          <RoomShell variant={variantOf('hr')} rect={rectOf('hr')} />
          <rect x="36" y="304" width="50" height="18" rx="4" fill="rgba(124, 92, 252, 0.1)" stroke="rgba(124, 92, 252, 0.45)" />
          <text x="61" y="279" textAnchor="middle" fill={variantOf('hr').labelInk} fontSize="8.5" fontWeight="600">
            {roomLabel('hr')}
          </text>
        </g>

        {/* 10. Central Lounge (Center Large Zone for Idle agents) */}
        <g id="room-lounge" style={roomStyle('lounge')}>
          <RoomShell variant={variantOf('lounge')} rect={rectOf('lounge')}>
            <polygon points={polygonPoints(variantOf('lounge'), rectOf('lounge'))} fill="url(#lounge-glow)" />
          </RoomShell>
          {/* Coffee table in lounge center */}
          <circle cx="190" cy="225" r="18" fill="#EEF3F9" stroke="#D6DEEA" />
          <text x="190" y="311" textAnchor="middle" fill={variantOf('lounge').labelInk} fontSize="9" fontWeight="bold" letterSpacing="0.6">
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
        className="absolute left-[96px] top-[312px] w-6 h-6 rounded-full bg-office-violet/20 border border-office-violet text-office-violet hover:bg-office-violet hover:text-office-text flex items-center justify-center text-xs font-bold shadow-nu-raised transition-transform active:scale-90 z-20"
      >
        <UserPlus className="w-3.5 h-3.5" />
      </button>

      {/* Agent Avatars Layer.
          Hidden while a sheet/modal is open: the overlay already covers it,
          and dropping the layer removes any chance of the pills painting on
          top of the sheet content (review defect #1, 2026-10-13).
          Tahap 17 — `showLabel` now means wide vs compact, not visible vs
          invisible: an idle agent in the packed lounge still shows its name,
          just in the 38 px pill (see Avatar.tsx). */}
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
