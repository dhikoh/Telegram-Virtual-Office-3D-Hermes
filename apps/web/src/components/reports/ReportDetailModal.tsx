import React from 'react';
import { FileText, Calendar, X } from 'lucide-react';
import type { Report } from '@hermes-office/shared';
import { MarkdownView } from '../common/MarkdownView';

interface ReportDetailModalProps {
  report: Report | null;
  onClose: () => void;
}

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
  report,
  onClose,
}) => {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-[100] isolate flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-office-elevated border border-office-border rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh]">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-office-violet" />
            <h3 className="text-sm font-bold text-office-text">Laporan: {report.template}</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-office-muted hover:text-office-text p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-office-muted">
          <Calendar className="w-3.5 h-3.5" />
          <span>Periode: {report.period}</span>
          <span>•</span>
          <span>{new Date(report.created_at).toLocaleString('id-ID')}</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <MarkdownView content={report.body_md} />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-text hover:bg-office-inset min-h-[44px]"
        >
          Tutup
        </button>
      </div>
    </div>
  );
};
