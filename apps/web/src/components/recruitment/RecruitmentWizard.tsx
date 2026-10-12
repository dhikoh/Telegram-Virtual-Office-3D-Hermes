/**
 * Recruitment Wizard Modal (Rule REQ-081 through REQ-084)
 * Coordinates Step 1 (Template), Step 2 (Spec Form), Step 3 (SOUL.md Preview), and Step 4 (Hiring Package).
 */

import React, { useState } from 'react';
import type { AgentHiringSpec } from '@hermes-office/shared';
import { UserPlus, X } from 'lucide-react';
import { Step1Template } from './Step1Template';
import { Step2SpecForm } from './Step2SpecForm';
import { Step3SoulPreview } from './Step3SoulPreview';
import { Step4HiringPackage } from './Step4HiringPackage';
import { tma } from '../../services/tma';

interface RecruitmentWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecruitmentWizard: React.FC<RecruitmentWizardProps> = ({
  isOpen,
  onClose,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [spec, setSpec] = useState<AgentHiringSpec | null>(null);

  if (!isOpen) return null;

  const handleSelectTemplate = (selectedSpec: AgentHiringSpec) => {
    setSpec(selectedSpec);
    setStep(2);
  };

  const handleSpecSubmit = (submittedSpec: AgentHiringSpec) => {
    setSpec(submittedSpec);
    setStep(3);
  };

  const handleSoulConfirm = () => {
    setStep(4);
  };

  const handleFinish = () => {
    tma.hapticNotification('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-office-violet/40 rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col gap-3.5 max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-office-violet" />
            <h3 className="text-sm font-bold text-white">Ruang Rekrutmen Agen (HR)</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-office-muted hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-black/50 rounded-xl border border-white/10 text-[10px]">
          {[
            { num: 1, label: 'Template' },
            { num: 2, label: 'Spesifikasi' },
            { num: 3, label: 'SOUL.md' },
            { num: 4, label: 'Paket VPS' },
          ].map((s) => (
            <div
              key={s.num}
              className={`flex items-center gap-1.5 ${
                step === s.num
                  ? 'text-office-cyan font-bold'
                  : step > s.num
                  ? 'text-emerald-400'
                  : 'text-office-muted'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono ${
                  step === s.num
                    ? 'bg-office-cyan text-slate-950 font-bold'
                    : step > s.num
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-white/10 text-office-muted'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        {step === 1 && (
          <Step1Template
            onSelect={handleSelectTemplate}
            onCancel={onClose}
          />
        )}

        {step === 2 && spec && (
          <Step2SpecForm
            initialSpec={spec}
            onSubmit={handleSpecSubmit}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && spec && (
          <Step3SoulPreview
            spec={spec}
            onConfirm={handleSoulConfirm}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && spec && (
          <Step4HiringPackage
            spec={spec}
            onFinish={handleFinish}
            onBack={() => setStep(3)}
          />
        )}
      </div>
    </div>
  );
};
