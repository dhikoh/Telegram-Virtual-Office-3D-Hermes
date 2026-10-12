import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Department, KpiSource } from '@hermes-office/shared';
import { tma } from '../../services/tma';

interface KpiEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDept: Department;
  onSave: (kpi: {
    key: string;
    label: string;
    value: number;
    unit: string;
    period: string;
    source: KpiSource;
    source_note: string;
  }) => Promise<void>;
}

export const KpiEntryModal: React.FC<KpiEntryModalProps> = ({
  isOpen,
  onClose,
  activeDept,
  onSave,
}) => {
  const [kpiKey, setKpiKey] = useState('');
  const [kpiLabel, setKpiLabel] = useState('');
  const [kpiValue, setKpiValue] = useState<string>('');
  const [kpiUnit, setKpiUnit] = useState('');
  const [kpiPeriod, setKpiPeriod] = useState('2026-Q3');
  const [kpiSource, setKpiSource] = useState<KpiSource>('manual');
  const [kpiNote, setKpiNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kpiKey || !kpiLabel || !kpiValue) return;

    setIsSubmitting(true);
    tma.hapticImpact('medium');

    try {
      await onSave({
        key: kpiKey.trim().toLowerCase(),
        label: kpiLabel.trim(),
        value: parseFloat(kpiValue),
        unit: kpiUnit.trim(),
        period: kpiPeriod.trim(),
        source: kpiSource,
        source_note: kpiNote.trim(),
      });
      tma.hapticNotification('success');
      onClose();
    } catch {
      tma.hapticNotification('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-office-elevated border border-office-accent/40 rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-office-accent-ink" />
            <h3 className="text-sm font-bold text-office-text">Input KPI Manual ({activeDept})</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-office-muted hover:text-office-text p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] text-office-muted block mb-1">Kunci Teknis * (misal: mrr, cac)</label>
            <input
              type="text"
              value={kpiKey}
              onChange={(e) => setKpiKey(e.target.value)}
              placeholder="mrr"
              required
              className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent font-mono min-h-[44px]"
            />
          </div>

          <div>
            <label className="text-[11px] text-office-muted block mb-1">Label Deskriptif *</label>
            <input
              type="text"
              value={kpiLabel}
              onChange={(e) => setKpiLabel(e.target.value)}
              placeholder="Monthly Recurring Revenue"
              required
              className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-office-muted block mb-1">Nilai Angka *</label>
              <input
                type="number"
                step="any"
                value={kpiValue}
                onChange={(e) => setKpiValue(e.target.value)}
                placeholder="125000"
                required
                className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent font-mono min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-[11px] text-office-muted block mb-1">Satuan (Unit)</label>
              <input
                type="text"
                value={kpiUnit}
                onChange={(e) => setKpiUnit(e.target.value)}
                placeholder="USD / % / deals"
                className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent font-mono min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-office-muted block mb-1">Periode</label>
              <input
                type="text"
                value={kpiPeriod}
                onChange={(e) => setKpiPeriod(e.target.value)}
                placeholder="2026-Q3"
                className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent font-mono min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-[11px] text-office-muted block mb-1">Sumber Data</label>
              <select
                value={kpiSource}
                onChange={(e) => setKpiSource(e.target.value as KpiSource)}
                className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
              >
                <option value="manual">Manual</option>
                <option value="import">Imported</option>
                <option value="agent">Agen (Unverified)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-office-muted block mb-1">Catatan Sumber (Opsional)</label>
            <input
              type="text"
              value={kpiNote}
              onChange={(e) => setKpiNote(e.target.value)}
              placeholder="Buku kas / rekening koran Q3"
              className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent min-h-[44px]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-muted hover:text-office-text min-h-[44px]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-office-accent text-office-muted text-xs font-bold hover:bg-cyan-300 min-h-[44px] shadow-nu-raised disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan KPI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
