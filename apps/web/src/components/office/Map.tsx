/**
 * 2D Interactive SVG Floor Plan (Rule REQ-071 & Section 8)
 * 8 Department Rooms + Lounge + Approval Gate.
 * Smooth avatar placement and movement based on status.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { getAgentPlacement } from '@hermes-office/shared';
import { Avatar } from './Avatar';
import { useOfficeStore, type OfficeAgent } from '../../stores/office';

interface MapProps {
  onSelectAgent: (agent: OfficeAgent) => void;
  onOpenRecruitment?: () => void;
}

export const Map: React.FC<MapProps> = ({ onSelectAgent, onOpenRecruitment }) => {
  const { t } = useTranslation();
  const { agents } = useOfficeStore();

  // Compute coordinate for each agent using shared single source of truth (Rule 9.1)
  let idleCount = 0;
  const agentPositions = agents.map((agent) => {
    const slotIdx = agent.status === 'idle' ? idleCount++ : 0;
    const placement = getAgentPlacement(agent, agent.status, slotIdx);
    return { agent, pos: placement.pos2d };
  });

  return (
    <div className="relative w-full max-w-[390px] mx-auto aspect-[380/420] rounded-xl overflow-hidden border border-office-border bg-office-bg shadow-2xl select-none">
      {/* SVG Floor Architecture */}
      <svg
        viewBox="0 0 380 420"
        className="w-full h-full absolute inset-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Floor grid pattern */}
          <pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(34, 211, 238, 0.05)" strokeWidth="0.8" />
          </pattern>

          {/* Lounge carpet gradient */}
          <radialGradient id="lounge-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.15)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.01)" />
          </radialGradient>

          {/* Command center glow */}
          <radialGradient id="command-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.18)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.02)" />
          </radialGradient>

          {/* Approval gate caution stripe pattern */}
          <pattern id="caution-stripes" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(251, 191, 36, 0.25)" strokeWidth="4" />
          </pattern>
        </defs>

        {/* Floor Background Grid */}
        <rect width="380" height="420" fill="url(#floor-grid)" />

        {/* 1. Command Center (Center Top) */}
        <g id="room-command">
          <rect
            x="120"
            y="12"
            width="140"
            height="70"
            rx="8"
            fill="url(#command-glow)"
            stroke="rgba(34, 211, 238, 0.35)"
            strokeWidth="1.2"
          />
          {/* Desk console */}
          <rect x="160" y="45" width="60" height="20" rx="4" fill="rgba(34, 211, 238, 0.12)" stroke="rgba(34, 211, 238, 0.4)" />
          <text x="190" y="27" textAnchor="middle" fill="#22D3EE" fontSize="9" fontWeight="bold" letterSpacing="0.8">
            {t('rooms.command')}
          </text>
        </g>

        {/* 2. Approval Gate (Below Command Center) */}
        <g id="room-approval-gate">
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
          <text x="190" y="103" textAnchor="middle" fill="#FBBF24" fontSize="8" fontWeight="600" letterSpacing="0.5">
            {t('rooms.approvalGate')}
          </text>
        </g>

        {/* 3. Social Studio (Left Top) */}
        <g id="room-social">
          <rect x="12" y="12" width="98" height="74" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" />
          <rect x="36" y="46" width="50" height="18" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="61" y="26" textAnchor="middle" fill="#94A3B8" fontSize="8.5" fontWeight="600">
            {t('rooms.social')}
          </text>
        </g>

        {/* 4. Marketing Lab (Right Top) */}
        <g id="room-marketing">
          <rect x="270" y="12" width="98" height="74" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" />
          <rect x="294" y="46" width="50" height="18" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="319" y="26" textAnchor="middle" fill="#94A3B8" fontSize="8.5" fontWeight="600">
            {t('rooms.marketing')}
          </text>
        </g>

        {/* 5. Sales Floor (Left Mid) */}
        <g id="room-sales">
          <rect x="12" y="96" width="98" height="74" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" />
          <rect x="36" y="130" width="50" height="18" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="61" y="110" textAnchor="middle" fill="#94A3B8" fontSize="8.5" fontWeight="600">
            {t('rooms.sales')}
          </text>
        </g>

        {/* 6. Analytics Hub (Right Mid) */}
        <g id="room-analytics">
          <rect x="270" y="96" width="98" height="74" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" />
          <rect x="294" y="130" width="50" height="18" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="319" y="110" textAnchor="middle" fill="#94A3B8" fontSize="8.5" fontWeight="600">
            {t('rooms.analytics')}
          </text>
        </g>

        {/* 7. Finance Vault (Left Lower) */}
        <g id="room-finance">
          <rect x="12" y="180" width="98" height="74" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" />
          <rect x="36" y="214" width="50" height="18" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="61" y="194" textAnchor="middle" fill="#94A3B8" fontSize="8.5" fontWeight="600">
            {t('rooms.finance')}
          </text>
        </g>

        {/* 8. Support Desk (Right Lower) */}
        <g id="room-support">
          <rect x="270" y="180" width="98" height="74" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" />
          <rect x="294" y="214" width="50" height="18" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <text x="319" y="194" textAnchor="middle" fill="#94A3B8" fontSize="8.5" fontWeight="600">
            {t('rooms.support')}
          </text>
        </g>

        {/* 9. HR / Recruitment Room (Left Bottom with '+' Door) */}
        <g id="room-hr">
          <rect x="12" y="264" width="98" height="84" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(139, 92, 246, 0.3)" />
          <rect x="36" y="304" width="50" height="18" rx="4" fill="rgba(139, 92, 246, 0.08)" stroke="rgba(139, 92, 246, 0.25)" />
          <text x="61" y="279" textAnchor="middle" fill="#A78BFA" fontSize="8.5" fontWeight="600">
            {t('rooms.hr')}
          </text>
        </g>

        {/* 10. Central Lounge (Center Large Zone for Idle agents) */}
        <g id="room-lounge">
          <rect
            x="125"
            y="136"
            width="130"
            height="180"
            rx="12"
            fill="url(#lounge-glow)"
            stroke="rgba(139, 92, 246, 0.25)"
            strokeWidth="1"
          />
          {/* Coffee table in lounge center */}
          <circle cx="190" cy="225" r="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" />
          <text x="190" y="152" textAnchor="middle" fill="#C084FC" fontSize="9" fontWeight="bold" letterSpacing="0.6">
            {t('rooms.lounge')}
          </text>
          <text x="190" y="228" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="10">
            ☕
          </text>
        </g>
      </svg>

      {/* HR Door with '+' Button (Rule REQ-071: door with "+") */}
      <button
        onClick={onOpenRecruitment}
        type="button"
        title={t('rooms.hr')}
        className="absolute left-[92px] top-[266px] w-6 h-6 rounded-full bg-office-violet/20 border border-office-violet text-office-violet hover:bg-office-violet hover:text-white flex items-center justify-center text-xs font-bold shadow-glow-violet transition-transform active:scale-90 z-20"
      >
        <UserPlus className="w-3.5 h-3.5" />
      </button>

      {/* Agent Avatars Layer */}
      <div className="absolute inset-0 pointer-events-auto">
        {agentPositions.map(({ agent, pos }) => (
          <Avatar
            key={agent.id}
            agent={agent}
            targetX={pos.x}
            targetY={pos.y}
            onClick={onSelectAgent}
          />
        ))}
      </div>
    </div>
  );
};
