/**
 * Recruitment Wizard - Step 2: Specification Form (Rule REQ-082)
 */

import React, { useState } from 'react';
import type { AgentHiringSpec, Department } from '@hermes-office/shared';
import { DEPARTMENTS, DEFAULT_APPROVAL_ACTIONS } from '@hermes-office/shared';
import { Plus, Trash2, ArrowLeft, ArrowRight, ShieldAlert, Check } from 'lucide-react';
import { tma } from '../../services/tma';

interface Step2SpecFormProps {
  initialSpec: AgentHiringSpec;
  onSubmit: (spec: AgentHiringSpec) => void;
  onBack: () => void;
}

export const Step2SpecForm: React.FC<Step2SpecFormProps> = ({
  initialSpec,
  onSubmit,
  onBack,
}) => {
  const [name, setName] = useState(initialSpec.name);
  const [role, setRole] = useState(initialSpec.role);
  const [department, setDepartment] = useState<Department>(initialSpec.department);
  const [avatar, setAvatar] = useState(initialSpec.avatar || '🤖');
  const [mission, setMission] = useState(initialSpec.mission);
  const [tone, setTone] = useState(initialSpec.tone);
  const [responsibilities, setResponsibilities] = useState<string[]>(initialSpec.responsibilities);
  const [newResp, setNewResp] = useState('');
  const [allowedTools, setAllowedTools] = useState<string[]>(initialSpec.allowed_tools);
  const [newTool, setNewTool] = useState('');
  const [boundaries, setBoundaries] = useState<string[]>(initialSpec.boundaries);
  const [newBoundary, setNewBoundary] = useState('');
  const [approvalActions, setApprovalActions] = useState<string[]>(initialSpec.approval_actions);
  const [reportingCadence, setReportingCadence] = useState(initialSpec.reporting_cadence);

  const handleAddResponsibility = () => {
    if (!newResp.trim()) return;
    setResponsibilities([...responsibilities, newResp.trim()]);
    setNewResp('');
  };

  const handleRemoveResponsibility = (index: number) => {
    setResponsibilities(responsibilities.filter((_, i) => i !== index));
  };

  const handleAddTool = () => {
    if (!newTool.trim()) return;
    const clean = newTool.trim().toLowerCase().replace(/\s+/g, '_');
    if (!allowedTools.includes(clean)) {
      setAllowedTools([...allowedTools, clean]);
    }
    setNewTool('');
  };

  const handleRemoveTool = (tool: string) => {
    setAllowedTools(allowedTools.filter((t) => t !== tool));
  };

  const handleAddBoundary = () => {
    if (!newBoundary.trim()) return;
    setBoundaries([...boundaries, newBoundary.trim()]);
    setNewBoundary('');
  };

  const handleRemoveBoundary = (index: number) => {
    setBoundaries(boundaries.filter((_, i) => i !== index));
  };

  const toggleApprovalAction = (action: string) => {
    tma.hapticSelection();
    if (approvalActions.includes(action)) {
      setApprovalActions(approvalActions.filter((a) => a !== action));
    } else {
      setApprovalActions([...approvalActions, action]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !mission.trim()) return;

    tma.hapticImpact('medium');
    onSubmit({
      name: name.trim(),
      role: role.trim(),
      department,
      avatar: avatar.trim() || '🤖',
      mission: mission.trim(),
      tone: tone.trim(),
      responsibilities: responsibilities.filter((r) => r.trim().length > 0),
      allowed_tools: allowedTools,
      boundaries: boundaries.filter((b) => b.trim().length > 0),
      approval_actions: approvalActions,
      reporting_cadence: reportingCadence.trim() || 'Harian',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Identity row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <label className="text-[11px] text-office-muted block mb-1">Avatar</label>
          <input
            type="text"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            className="w-full text-center text-lg px-2 py-2 rounded-xl bg-black/60 border border-white/15 text-white focus:outline-none focus:border-office-cyan"
            maxLength={4}
          />
        </div>
        <div className="col-span-2">
          <label className="text-[11px] text-office-muted block mb-1">Nama Agen</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aura"
            required
            className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-office-muted block mb-1">Peran / Jabatan</label>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Social Media Manager"
            required
            className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
          />
        </div>
        <div>
          <label className="text-[11px] text-office-muted block mb-1">Departemen</label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
            className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[11px] text-office-muted block mb-1">Misi Utama</label>
        <textarea
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          rows={2}
          required
          className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-cyan"
        />
      </div>

      <div>
        <label className="text-[11px] text-office-muted block mb-1">Tone & Gaya Komunikasi</label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="Antusias, kreatif, komunikatif"
          className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
        />
      </div>

      {/* Responsibilities list */}
      <div>
        <label className="text-[11px] text-office-muted block mb-1">Tanggung Jawab Utama</label>
        <div className="flex flex-col gap-1.5 mb-2">
          {responsibilities.map((resp, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-black/40 p-2 rounded-lg border border-white/10 text-xs text-slate-200">
              <span className="flex-1">{resp}</span>
              <button
                type="button"
                onClick={() => handleRemoveResponsibility(idx)}
                className="text-office-muted hover:text-office-danger p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newResp}
            onChange={(e) => setNewResp(e.target.value)}
            placeholder="Tambah tanggung jawab..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddResponsibility();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddResponsibility}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Allowed Tools */}
      <div>
        <label className="text-[11px] text-office-muted block mb-1">Alat Bantu yang Diizinkan</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {allowedTools.map((tool) => (
            <span
              key={tool}
              className="px-2 py-1 rounded-md bg-office-cyan/15 border border-office-cyan/30 text-[11px] text-office-cyan font-mono flex items-center gap-1"
            >
              <span>{tool}</span>
              <button type="button" onClick={() => handleRemoveTool(tool)} className="hover:text-white">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newTool}
            onChange={(e) => setNewTool(e.target.value)}
            placeholder="web_search, crm_lookup..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTool();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddTool}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Boundaries (What it must NEVER do) */}
      <div>
        <label className="text-[11px] text-office-muted block mb-1">Batasan Mutlak (Boundaries)</label>
        <div className="flex flex-col gap-1.5 mb-2">
          {boundaries.map((b, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-office-danger/10 border border-office-danger/30 p-2 rounded-lg text-xs text-red-300">
              <span className="flex-1">{b}</span>
              <button
                type="button"
                onClick={() => handleRemoveBoundary(idx)}
                className="text-red-400 hover:text-white p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newBoundary}
            onChange={(e) => setNewBoundary(e.target.value)}
            placeholder="Dilarang membocorkan kredensial..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddBoundary();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddBoundary}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Actions requiring human approval */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-office-warn" />
          <label className="text-[11px] font-bold text-office-warn">Aksi Wajib Persetujuan Manusia</label>
        </div>
        <div className="flex flex-col gap-1.5">
          {DEFAULT_APPROVAL_ACTIONS.map((action) => {
            const isSelected = approvalActions.includes(action);
            return (
              <div
                key={action}
                onClick={() => toggleApprovalAction(action)}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-office-warn/15 border-office-warn/50 text-white'
                    : 'bg-black/40 border-white/10 text-office-muted hover:text-white'
                }`}
              >
                <span className="flex-1 pr-2">{action}</span>
                <div
                  className={`w-4 h-4 rounded flex items-center justify-center border ${
                    isSelected
                      ? 'bg-office-warn border-office-warn text-slate-950 font-bold'
                      : 'border-white/20'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-office-muted block mb-1">Frekuensi Pelaporan (Reporting Cadence)</label>
        <input
          type="text"
          value={reportingCadence}
          onChange={(e) => setReportingCadence(e.target.value)}
          placeholder="Harian atau Mingguan"
          className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan font-mono"
        />
      </div>

      <div className="flex gap-2 pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-office-muted hover:text-white min-h-[44px] flex items-center justify-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali</span>
        </button>
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl bg-office-cyan text-slate-950 text-xs font-bold hover:bg-cyan-300 min-h-[44px] shadow-glow-cyan flex items-center justify-center gap-1.5"
        >
          <span>Generate SOUL.md</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
};
