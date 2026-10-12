/**
 * Audit Log Modal (Rule REQ-080 & Rule S9)
 * Displays recent mutating security actions from /api/audit.
 */

import React, { useState, useEffect } from 'react';
import type { AuditLog } from '@hermes-office/shared';
import { Shield, X, RefreshCw, Clock, User } from 'lucide-react';
import { api } from '../../services/api';
import { tma } from '../../services/tma';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAudit();
      setLogs(data);
    } catch {
      tma.hapticNotification('error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-office-elevated border border-office-border rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-office-accent-ink" />
            <h3 className="text-sm font-bold text-office-text">Log Audit Keamanan (Rule S9)</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="text-office-muted hover:text-office-text p-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              type="button"
              className="text-office-muted hover:text-office-text p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-office-muted">
              {isLoading ? 'Memuat log audit...' : 'Belum ada catatan mutasi aksi di basis data.'}
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-office-inset border border-office-border flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-office-accent-ink text-[11px]">
                    {log.action}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-office-muted font-mono">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(log.ts).toLocaleTimeString('id-ID')}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-office-muted">
                  <span className="truncate max-w-[200px]">Target: {log.target}</span>
                  <span className="text-[10px] text-office-muted flex items-center gap-1 font-mono">
                    <User className="w-3 h-3" />
                    <span>UID: {log.telegram_user_id}</span>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-muted hover:text-office-text min-h-[44px]"
        >
          Tutup
        </button>
      </div>
    </div>
  );
};
