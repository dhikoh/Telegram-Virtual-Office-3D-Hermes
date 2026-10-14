/**
 * Agent Avatar Chip Component (Rule REQ-072 & Section 8)
 * Renders avatar with status ring and animation:
 * - idle: Lounge, slow breathing glow
 * - thinking: own desk, pulsing ring, "..." bubble
 * - working: own desk, spinning ring + tool-name chip
 * - waiting_approval: Approval Gate, amber blink
 * - error: red glitch shake
 * - offline: greyed with "zzz"
 *
 * Tahap 5 (DESIGN_DIRECTION 4): the emoji-on-a-circle pawn is now a pixel
 * sprite - a text map painted to a data URL, nearest-neighbour upscaled and
 * wearing its department colour. The status ring becomes the sprite's hard
 * pixel frame, so every badge and animation above still hangs off it, and the
 * four walk frames cycle on one shared CSS loop that Rule 9.3 turns off for
 * free under .low-power.
 *
 * Tahap 17: the Tahap 9 accessory glyph is gone — it never reached the 3D
 * character, so it was a second identity that lied. What replaces it is the
 * name, and the name is now always drawn: the wide pill when there is room,
 * a 38 px compact pill when the idle lounge packs slots 40 px apart, so the
 * collision rule above still holds. The bubble also carries the agent's last
 * real chat line from the office store when there is one; the status text is
 * only the fallback for "nothing said yet".
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useAnimationFrame,
} from 'framer-motion';
import {
  agentMotion,
  directionFrames,
  ROOM_LAYOUTS,
  spritePalette,
  speechLine,
  PX_PER_UNIT,
} from '@hermes-office/shared';
import type { OfficeAgent } from '../../stores/office';
import { useOfficeStore } from '../../stores/office';
import { usePowerStore } from '../../stores/power';
import { spriteDataUrl } from '../../lib/sprites';
import { tma } from '../../services/tma';
import {
  CHARACTER_MODEL_LABELS,
  characterModelFor,
} from './office-3d/glbCharacter';

/** Walk cycle length; index.css splits it into four step-end frames. */
const CYCLE_SECONDS = 0.8;
/** 10x15 cells at scale 2 = 20x30 px inside the 54 px hit area. */
const SPRITE_W = 20;
const SPRITE_H = 30;

function shirtOf(agent: OfficeAgent, deptColor?: string): string {
  // Tahap 9 — warna baju kustom milik agen (avatar editor) mengalahkan warna
  // departemen; kalau belum diatur, jatuh ke warna ruangannya seperti biasa.
  const custom = agent.avatar_style?.shirt;
  if (custom) return custom;
  // Tahap 10 — warna ruang dari tabel departments mengalahkan warna statis
  // ROOM_LAYOUTS (Owner bisa mengganti warna dari More → Kelola Ruang).
  if (deptColor) return deptColor;
  const dept = agent.department;
  return dept && dept in ROOM_LAYOUTS
    ? ROOM_LAYOUTS[dept as keyof typeof ROOM_LAYOUTS].color
    : '#94A3B8';
}

/**
 * Tahap 17 — the avatar wears the same identity as the 3D office: the model
 * its owner picked (or the department default). The 2D sprite cannot render a
 * GLB, so it names the model instead — one identity, shown honestly, instead
 * of the Tahap 9 accessory glyph that the 3D character never had.
 */
function characterLabelOf(agent: OfficeAgent): string | null {
  const id = characterModelFor(agent.department, agent.avatar_style);
  return id ? CHARACTER_MODEL_LABELS[id] : null;
}

interface AvatarProps {
  agent: OfficeAgent;
  targetX: number;
  targetY: number;
  onClick: (agent: OfficeAgent) => void;
  /**
   * The wide name pill is 70 px but the idle lounge packs agents 40 px apart.
   * `true` draws it in full; `false` draws a 38 px compact pill. The name is
   * never hidden — "which agent is this?" must always have an answer.
   */
  showLabel?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ agent, targetX, targetY, onClick, showLabel = true }) => {
  const { isLowPower } = usePowerStore();
  const [bubbleText, setBubbleText] = useState<string | null>(null);

  // Tahap 17 — what this agent last actually SAID (from the chat sheet, via
  // the office store). One map feeds both the 2D sprite and the 3D character,
  // so the two views can never show different words.
  const lastSpeech = useOfficeStore((s) => s.speech[agent.id]);
  const [now, setNow] = useState(() => Date.now());
  const speech = speechLine(lastSpeech, now);

  // A bubble expires on its own after SPEECH_TTL_MS, and nothing else would
  // re-render this avatar in the meantime — so while there is a line to show,
  // re-check it on a slow tick (5 s) and stop the moment it expires.
  useEffect(() => {
    if (!lastSpeech) return undefined;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, [lastSpeech]);

  // Tahap 9 — status fallback bubble: muncul saat status berubah, hilang
  // sendiri ~4 dtk (satu bubble per perubahan status = throttle, tidak menumpuk).
  // Status 'working' dengan alat tertentu tidak ikut — chip alat di bawah sudah
  // mewakilinya, bubble hanya muncul saat bekerja tanpa alat terlihat.
  // Tahap 17: hanya dipakai bila agen belum pernah bicara.
  useEffect(() => {
    if (speech) {
      setBubbleText(null);
      return undefined;
    }
    const text =
      agent.status === 'thinking'
        ? 'sedang berpikir…'
        : agent.status === 'working'
          ? agent.currentTool
            ? null
            : 'sedang mengerjakan tugas…'
          : agent.status === 'waiting_approval'
            ? 'butuh persetujuanmu'
            : agent.status === 'error'
              ? 'ada kendala…'
              : null;
    if (!text) {
      setBubbleText(null);
      return undefined;
    }
    setBubbleText(text);
    const timer = setTimeout(() => setBubbleText(null), 4200);
    return () => clearTimeout(timer);
  }, [agent.status, agent.currentTool, speech]);

  const bubble = speech ?? bubbleText;
  const characterLabel = characterLabelOf(agent);

  const handleClick = () => {
    tma.hapticSelection();
    onClick(agent);
  };

  // Tahap 5: four walk frames of the front-facing sprite in the wearer's
  // department colour. spriteDataUrl is null without a canvas, so the emoji
  // path below keeps the avatar visible instead of leaving an empty frame.
  // Tahap 10: the room's data color (if the owner recolored it) wins.
  const deptColor = useOfficeStore((s) =>
    s.departments.find((d) => d.id === agent.department)?.color
  );
  const palette = useMemo(
    () => spritePalette(directionFrames('south').frames[0], shirtOf(agent, deptColor)),
    [agent, deptColor]
  );
  const spriteUrls = useMemo(
    () => directionFrames('south').frames.map((frame) => spriteDataUrl(frame, palette, 2)),
    [palette]
  );

  // Ring style determination
  let ringClasses = 'border-2 border-office-border';
  let badgeContent: React.ReactNode = null;

  switch (agent.status) {
    case 'idle':
      ringClasses = isLowPower
        ? 'border-2 border-office-success/60'
        : 'border-2 border-office-success/80 animate-breathe-ring shadow-[0_0_10px_rgba(52,211,153,0.3)]';
      break;

    case 'thinking':
      ringClasses = isLowPower
        ? 'border-2 border-office-accent'
        : 'border-2 border-office-accent animate-pulse-ring shadow-nu-raised';
      badgeContent = (
        <span className="absolute -top-2 -right-2 bg-office-accent text-office-on-accent text-[9px] font-bold px-1 rounded-full shadow-nu-raised animate-bounce">
          ...
        </span>
      );
      break;

    case 'working':
      ringClasses = isLowPower
        ? 'border-2 border-office-violet'
        : 'border-2 border-dashed border-office-violet animate-spin-ring shadow-nu-raised';
      if (agent.currentTool) {
        badgeContent = (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-office-violet text-office-on-violet text-[8px] font-mono px-1 py-0.2 rounded shadow-nu-raised whitespace-nowrap max-w-[60px] truncate">
            {agent.currentTool}
          </span>
        );
      }
      break;

    case 'waiting_approval':
      ringClasses = isLowPower
        ? 'border-2 border-office-warn'
        : 'border-2 border-office-warn animate-pulse shadow-nu-raised';
      badgeContent = (
        <span className="absolute -top-2 -right-2 bg-office-warn text-office-on-accent font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-nu-raised animate-ping">
          !
        </span>
      );
      break;

    case 'error':
      ringClasses = isLowPower
        ? 'border-2 border-office-danger'
        : 'border-2 border-office-danger animate-glitch shadow-nu-raised';
      badgeContent = (
        <span className="absolute -top-2 -right-2 bg-office-danger text-office-text font-bold text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center">
          ✕
        </span>
      );
      break;

    case 'offline':
      ringClasses = 'border-2 border-office-border opacity-50 grayscale';
      badgeContent = (
        <span className="absolute -top-2 -right-2 bg-office-inset text-office-muted text-[8px] font-mono px-1 rounded">
          zzz
        </span>
      );
      break;
  }

  // Tahap 3.5: spring to the placement from layout.ts, then add the shared
  // ambient drift on top. Motion values keep the per-frame work off the React
  // render path, and ECO (low power) reports zero drift from agentMotion.
  const baseX = useMotionValue(targetX);
  const baseY = useMotionValue(targetY);
  const driftX = useMotionValue(0);
  const driftY = useMotionValue(0);

  useEffect(() => {
    baseX.set(targetX);
    baseY.set(targetY);
  }, [targetX, targetY, baseX, baseY]);

  const springX = useSpring(baseX, { damping: 22, stiffness: 140 });
  const springY = useSpring(baseY, { damping: 22, stiffness: 140 });

  useAnimationFrame((tMs) => {
    const motion = agentMotion(agent.id, agent.status, tMs / 1000, isLowPower);
    driftX.set(motion.offsetX * PX_PER_UNIT);
    driftY.set(motion.offsetZ * PX_PER_UNIT);
  });

  const x = useTransform<number, number>([springX, driftX], ([bx, dx]) => bx + dx);
  const y = useTransform<number, number>([springY, driftY], ([by, dy]) => by + dy);

  return (
    <motion.div
      style={{ x, y, width: '54px', marginLeft: '-27px', marginTop: '-24px' }}
      onClick={handleClick}
      className="absolute top-0 left-0 cursor-pointer flex flex-col items-center select-none z-20 group"
    >
      {/* Pixel frame + sprite, standing in for the old circular status ring */}
      <div className="relative flex items-center justify-center">
        {/* Tahap 17 — the agent's last real line from the chat sheet; falls
            back to the Tahap 9 status text when it has not spoken yet. */}
        {bubble && (
          <div
            data-testid="avatar-bubble"
            title={bubble}
            className="absolute bottom-full left-1/2 z-30 mb-2 max-w-[76px] -translate-x-1/2 truncate rounded-[3px] border border-office-border bg-white px-1 py-px text-center font-mono text-[7px] leading-tight text-black shadow-nu-raised"
          >
            {bubble}
          </div>
        )}
        <div
          className={`relative flex items-end justify-center w-[26px] h-[34px] bg-office-elevated transition-transform group-hover:scale-105 active:scale-95 ${ringClasses}`}
        >
          {spriteUrls.map((url, i) =>
            url ? (
              <img
                key={i}
                src={url}
                alt=""
                width={SPRITE_W}
                height={SPRITE_H}
                draggable={false}
                className="sprite-cycle absolute bottom-[1px] left-1/2"
                style={{
                  animationDelay: `${-i * (CYCLE_SECONDS / 4)}s`,
                  transform: `translateX(-50%) scaleX(${i === 3 ? -1 : 1})`,
                }}
              />
            ) : null
          )}
          {!spriteUrls.some(Boolean) && (
            <span className="text-lg leading-none pb-0.5">{agent.avatar || '🤖'}</span>
          )}
        </div>
        {badgeContent}
      </div>

      {/* Agent Name & DEMO Badge — Tahap 17: always drawn (compact when the
          lounge packs slots 40 px apart), because the name is now the only
          identity marker the 2D sprite and the 3D character share. */}
      <div className="mt-1 flex flex-col items-center" data-testid="avatar-name">
        <div
          title={agent.name}
          className={`flex items-center gap-1 bg-office-inset backdrop-blur-xs px-1.5 py-0.5 rounded border border-office-border ${
            showLabel ? 'max-w-[70px]' : 'max-w-[38px]'
          }`}
        >
          <span className="text-[10px] font-medium text-office-text truncate leading-none">
            {agent.name}
          </span>
          {showLabel && agent.isDemo && (
            <span className="text-[7px] font-mono font-bold bg-office-accent/20 text-office-accent-ink px-0.5 rounded leading-none">
              DEMO
            </span>
          )}
        </div>
        {showLabel && characterLabel && (
          <span
            data-testid="avatar-character"
            className="mt-0.5 text-[7px] font-mono text-office-muted leading-none"
          >
            {characterLabel}
          </span>
        )}
      </div>
    </motion.div>
  );
};
