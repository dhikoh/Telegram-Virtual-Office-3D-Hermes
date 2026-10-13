/**
 * Agent Avatar Chip Component (Rule REQ-072 & Section 8)
 * Renders avatar with status ring and animation:
 * - idle: Lounge, slow breathing glow
 * - thinking: own desk, pulsing ring, "..." bubble
 * - working: own desk, spinning ring + tool-name chip
 * - waiting_approval: Approval Gate, amber blink
 * - error: red glitch shake
 * - offline: greyed with "zzz"
 */

import React from 'react';
import { motion } from 'framer-motion';
import type { OfficeAgent } from '../../stores/office';
import { usePowerStore } from '../../stores/power';
import { tma } from '../../services/tma';

interface AvatarProps {
  agent: OfficeAgent;
  targetX: number;
  targetY: number;
  onClick: (agent: OfficeAgent) => void;
  /**
   * The name pill is 70 px wide but the idle lounge packs agents 40 px apart,
   * so labels are only drawn where there is room (and for the tapped agent).
   */
  showLabel?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ agent, targetX, targetY, onClick, showLabel = true }) => {
  const { isLowPower } = usePowerStore();

  const handleClick = () => {
    tma.hapticSelection();
    onClick(agent);
  };

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

  const animationProps = isLowPower
    ? { style: { transform: `translate(${targetX}px, ${targetY}px)` } }
    : {
        animate: { x: targetX, y: targetY },
        transition: { type: 'spring', damping: 22, stiffness: 140 },
      };

  return (
    <motion.div
      {...animationProps}
      onClick={handleClick}
      className="absolute top-0 left-0 cursor-pointer flex flex-col items-center select-none z-20 group"
      style={{
        width: '54px',
        marginLeft: '-27px',
        marginTop: '-27px',
      }}
    >
      {/* Avatar circular frame with glowing status ring */}
      <div className="relative flex items-center justify-center">
        <div
          className={`w-10 h-10 rounded-full bg-office-elevated flex items-center justify-center text-lg transition-transform group-hover:scale-105 active:scale-95 ${ringClasses}`}
        >
          <span>{agent.avatar || '🤖'}</span>
        </div>
        {badgeContent}
      </div>

      {/* Agent Name & DEMO Badge */}
      <div className={`mt-1 flex flex-col items-center ${showLabel ? '' : 'invisible'}`}>
        <div className="flex items-center gap-1 bg-office-inset backdrop-blur-xs px-1.5 py-0.5 rounded border border-office-border max-w-[70px]">
          <span className="text-[10px] font-medium text-office-text truncate leading-none">
            {agent.name}
          </span>
          {agent.isDemo && (
            <span className="text-[7px] font-mono font-bold bg-office-accent/20 text-office-accent-ink px-0.5 rounded leading-none">
              DEMO
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};
