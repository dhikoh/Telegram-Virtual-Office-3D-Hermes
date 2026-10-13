/**
 * Recruitment Wizard - Step 2: Specification Form (Rule REQ-082)
 */

import React, { useEffect, useState } from 'react';
import type { AgentHiringSpec, Department, OfficeDepartment } from '@hermes-office/shared';
import { DEPARTMENTS, DEFAULT_APPROVAL_ACTIONS } from '@hermes-office/shared';
import { ArrowLeft, ArrowRight, ShieldAlert, Check } from 'lucide-react';
import { tma } from '../../services/tma';
import { api } from '../../services/api';
import { SpecListEditor } from './SpecListEditor';

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
  const [allowedTools, setAllowedTools] = useState<string[]>(initialSpec.allowed_tools);
  const [boundaries, setBoundaries] = useState<string[]>(initialSpec.boundaries);
  const [approvalActions, setApprovalActions] = useState<string[]>(initialSpec.approval_actions);
  const [reportingCadence, setReportingCadence] = useState(initialSpec.reporting_cadence);

  // Tahap 10 — ruang jadi data: pilihan departemen ikut tabel departments,
  // dengan fallback ke daftar statis kalau fetch gagal / kosong.
  const [rooms, setRooms] = useState<OfficeDepartment[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .getDepartments()
      .then((rows) => {
        if (alive && Array.isArray(rows) && rows.length > 0) setRooms(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const departmentOptions: Department[] =
    rooms.length > 0 ? rooms.map((room) => room.id) : [...DEPARTMENTS];
  const departmentLabel = (id: Department) => rooms.find((room) => room.id === id)?.name ?? id;

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
    tma.hapticImpact('medium');

    onSubmit({
      name: name.trim(),
      role: role.trim(),
      department,
      avatar: avatar.trim(),
      mission: mission.trim(),
      tone: tone.trim(),
      responsibilities,
      allowed_tools: allowedTools,
      boundaries,
      approval_actions: approvalActions,
      reporting_cadence: reportingCadence.trim(),
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
            className="w-full text-center text-lg px-2 py-2 rounded-xl bg-office-inset border border-office-border text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
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
            className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
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
            className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
          />
        </div>
        <div>
          <label className="text-[11px] text-office-muted block mb-1">Departemen</label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
            className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
          >
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {departmentLabel(d).toUpperCase()}
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
          className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent min-h-[56px]"
        />
      </div>

      <div>
        <label className="text-[11px] text-office-muted block mb-1">Tone & Gaya Komunikasi</label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="Antusias, kreatif, komunikatif"
          className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
        />
      </div>

      {/* Dynamic Responsibilities Editor */}
      <SpecListEditor
        label="Tanggung Jawab Utama"
        items={responsibilities}
        placeholder="Tambah tanggung jawab..."
        onAdd={(item) => setResponsibilities([...responsibilities, item])}
        onRemove={(idx) => setResponsibilities(responsibilities.filter((_, i) => i !== idx))}
      />

      {/* Dynamic Allowed Tools Editor */}
      <SpecListEditor
        label="Alat Bantu yang Diizinkan"
        items={allowedTools}
        placeholder="web_search, crm_lookup..."
        isTag={true}
        formatItem={(raw) => raw.trim().toLowerCase().replace(/\s+/g, '_')}
        onAdd={(item) => {
          if (!allowedTools.includes(item)) setAllowedTools([...allowedTools, item]);
        }}
        onRemove={(idx) => setAllowedTools(allowedTools.filter((_, i) => i !== idx))}
      />

      {/* Dynamic Boundaries Editor */}
      <SpecListEditor
        label="Batasan & Larangan Keras (Boundaries)"
        items={boundaries}
        placeholder="Dilarang keras melakukan..."
        onAdd={(item) => setBoundaries([...boundaries, item])}
        onRemove={(idx) => setBoundaries(boundaries.filter((_, i) => i !== idx))}
      />

      {/* Approval Actions checklist */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-1.5 text-[11px] text-office-warn font-semibold">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Aksi yang Memerlukan Persetujuan CEO</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {DEFAULT_APPROVAL_ACTIONS.map((action) => {
            const isChecked = approvalActions.includes(action);
            return (
              <div
                key={action}
                onClick={() => toggleApprovalAction(action)}
                className={`p-2 rounded-lg border text-[11px] cursor-pointer flex items-center gap-2 transition-all min-h-[44px] ${
                  isChecked
                    ? 'bg-office-warn/15 border-office-warn/40 text-office-text'
                    : 'bg-office-inset border-office-border text-office-muted hover:text-office-text'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isChecked
                      ? 'bg-office-warn border-office-warn text-office-muted font-bold'
                      : 'border-office-border'
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span className="leading-tight">{action}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-office-muted block mb-1">Ritme Pelaporan</label>
        <input
          type="text"
          value={reportingCadence}
          onChange={(e) => setReportingCadence(e.target.value)}
          placeholder="Harian dan Mingguan"
          className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 pb-1">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl bg-office-hover hover:bg-office-hover text-xs font-semibold text-office-muted hover:text-office-text flex items-center justify-center gap-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali</span>
        </button>
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl bg-office-accent text-office-on-accent text-xs font-bold hover:opacity-90 flex items-center justify-center gap-1.5 shadow-nu-raised min-h-[44px]"
        >
          <span>Lanjut ke Preview SOUL</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
};
