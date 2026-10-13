/**
 * Tahap 8 — Modal Kemampuan Gateway (Skills).
 *
 * Menampilkan apa yang benar-benar dilaporkan gateway lewat /api/skills:
 * - daftar skill terpasang, ATAU
 * - alasan jujur kenapa daftar tidak bisa diambil (gateway 500 / versi beda),
 *   plus capabilities nyata (fitur & endpoint) sebagai gantinya.
 * Tidak ada daftar skill karangan di sisi klien.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, X, RefreshCw, AlertTriangle, Cpu, Download, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { useOfficeStore } from '../../stores/office';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SkillItem {
  name: string;
  description: string;
  enabled?: boolean;
  source: string;
}

interface CapabilitiesShape {
  platform?: string;
  model?: string;
  runtime?: { mode?: string; tool_execution?: string };
  features?: Record<string, boolean>;
  endpoints?: Record<string, { method?: string; path?: string }>;
}

/**
 * Galat dari request() membawa bodi JSON server di ujung pesannya —
 * tampilkan pesan server apa adanya (409/400/404), bukan teks teknis.
 */
function serverMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const start = raw.indexOf('{');
  if (start >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as { message?: string; error?: string };
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
    } catch {
      // bukan JSON — pakai pesan mentah
    }
  }
  return raw;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({ isOpen, onClose }) => {
  const { addTickerMessage } = useOfficeStore();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [available, setAvailable] = useState(false);
  const [gateway, setGateway] = useState('');
  const [capabilities, setCapabilities] = useState<CapabilitiesShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tahap 11 — instal/hapus skill lewat orkestrator.
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [busySkill, setBusySkill] = useState<string | null>(null);
  const [uninstallError, setUninstallError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const res = await api.getSkills();
      setSkills(res.skills);
      setAvailable(res.available);
      setGateway(res.gateway);
      setCapabilities((res.capabilities as CapabilitiesShape) || null);
      setError(res.error);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, []);

  /**
   * Tahap 11 — permintaan instal diteruskan ke orkestrator lewat pipeline
   * tugas; layar ini hanya mengirim permintaan, bukan memasang sendiri.
   */
  const install = async () => {
    const name = installName.trim();
    if (!name) {
      setInstallError('Nama skill wajib diisi (huruf kecil, angka, tanda hubung).');
      return;
    }
    setInstalling(true);
    setInstallError(null);
    setInstallStatus(null);
    try {
      await api.installSkill(name);
      setInstallName('');
      setInstallStatus('Permintaan dikirim — pantau progres di layar Tugas.');
      addTickerMessage(`Permintaan instal skill "${name}" dikirim ke orkestrator.`, 'success');
      tma.hapticNotification('success');
    } catch (err) {
      setInstallError(serverMessage(err));
      tma.hapticNotification('error');
    } finally {
      setInstalling(false);
    }
  };

  const uninstall = async (name: string) => {
    setBusySkill(name);
    setUninstallError(null);
    try {
      await api.uninstallSkill(name);
      setConfirmUninstall(null);
      addTickerMessage(`Permintaan hapus skill "${name}" dikirim ke orkestrator.`, 'info');
      tma.hapticNotification('success');
      await load();
    } catch (err) {
      setUninstallError(serverMessage(err));
      tma.hapticNotification('error');
    } finally {
      setBusySkill(null);
    }
  };

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const features = Object.entries(capabilities?.features || {}).filter(([, on]) => on === true);
  const endpoints = Object.values(capabilities?.endpoints || {});

  return (
    <div className="fixed inset-0 z-[100] isolate flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-office-elevated border border-office-accent/40 rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-office-accent-ink" />
            <h3 className="text-sm font-bold text-office-text">Kemampuan Gateway</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                tma.hapticImpact('light');
                void load();
              }}
              aria-label="Muat ulang kemampuan gateway"
              className="text-office-muted hover:text-office-text p-2 min-h-[36px]"
            >
              <RefreshCw className={`w-4 h-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="text-office-muted hover:text-office-text p-2 min-h-[36px]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {gateway && (
            <span className="text-[10px] font-mono text-office-muted break-all">
              Gateway: {gateway}
            </span>
          )}

          {state === 'loading' && (
            <div className="flex items-center gap-2 text-[11px] text-office-muted font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Menanyakan gateway...</span>
            </div>
          )}

          {state === 'ready' && !available && (
            <div className="rounded-xl border border-office-warn/40 bg-office-warn/10 p-3 flex flex-col gap-1.5">
              <span className="text-[11px] text-office-warn font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Gateway tidak bisa mendaftar skill
              </span>
              <span className="text-[10px] text-office-muted">
                Ini laporan apa adanya dari gateway, bukan kegagalan aplikasi. Daftar di bawah
                menunjukkan kemampuan yang tetap tersedia.
              </span>
              {error && (
                <span className="text-[10px] font-mono text-office-danger break-all">{error}</span>
              )}
            </div>
          )}

          {state === 'ready' && available && skills.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-office-muted uppercase tracking-wider">
                Skill terpasang ({skills.length})
              </span>
              {skills.map((s) => (
                <div
                  key={s.name}
                  className="p-3 rounded-xl bg-office-inset border border-office-border flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-office-text">{s.name}</span>
                    {s.enabled === false && (
                      <span className="text-[9px] font-mono text-office-muted">NONAKTIF</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmUninstall(confirmUninstall === s.name ? null : s.name);
                        setUninstallError(null);
                      }}
                      aria-label={`Minta hapus ${s.name}`}
                      data-testid={`skill-remove-${s.name}`}
                      className="ml-auto px-2 py-1 rounded-lg bg-office-hover text-office-danger hover:text-office-danger text-[10px] font-bold min-h-[32px] flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Minta Hapus
                    </button>
                  </div>
                  {s.description && (
                    <span className="text-[10px] text-office-muted">{s.description}</span>
                  )}
                  {confirmUninstall === s.name && (
                    <div className="mt-1 p-3 rounded-xl bg-office-elevated border border-office-danger/50 flex flex-col gap-2">
                      <span className="text-[11px] text-office-text">
                        Hapus skill <strong>{s.name}</strong> dari gateway?
                      </span>
                      <span className="text-[10px] text-office-muted">
                        Penghapusan dijalankan orkestrator lewat tugas; progres tampil di layar
                        Tugas. Skill lain tidak disentuh.
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void uninstall(s.name)}
                          disabled={busySkill === s.name}
                          className="px-3 py-2 rounded-lg bg-office-danger text-office-on-accent text-[11px] font-bold min-h-[36px] disabled:opacity-50"
                        >
                          {busySkill === s.name ? 'Mengirim...' : 'Ya, hapus'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmUninstall(null)}
                          className="px-3 py-2 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-muted min-h-[36px]"
                        >
                          Batal
                        </button>
                      </div>
                      {uninstallError && (
                        <span
                          className="text-[10px] font-mono text-office-danger break-all"
                          data-testid="skill-uninstall-error"
                        >
                          {uninstallError}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {state === 'ready' && available && skills.length === 0 && (
            <span className="text-[11px] text-office-muted">
              Gateway melaporkan tidak ada skill terpasang.
            </span>
          )}

          {capabilities && (
            <div className="flex flex-col gap-2 pt-1 border-t border-office-border">
              <span className="text-[11px] font-bold text-office-muted uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Kemampuan runtime
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-office-muted">
                  Platform: <span className="font-mono text-office-text">{capabilities.platform || '—'}</span>
                </span>
                <span className="text-[10px] text-office-muted">
                  Model: <span className="font-mono text-office-text">{capabilities.model || '—'}</span>
                </span>
                {capabilities.runtime?.mode && (
                  <span className="text-[10px] text-office-muted">
                    Mode: <span className="font-mono text-office-text">{capabilities.runtime.mode}</span>
                  </span>
                )}
              </div>
              {features.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {features.map(([name]) => (
                    <span
                      key={name}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-office-hover text-office-accent-ink"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {endpoints.length > 0 && (
                <span className="text-[10px] text-office-muted">
                  {endpoints.length} endpoint gateway dilaporkan aktif.
                </span>
              )}
            </div>
          )}

          {/* Tahap 11 — instal skill: permintaan diteruskan ke orkestrator. */}
          <div className="flex flex-col gap-2 pt-1 border-t border-office-border" data-testid="skill-install-panel">
            <span className="text-[11px] font-bold text-office-muted uppercase tracking-wider flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Instal dari katalog
            </span>
            <span className="text-[10px] text-office-muted">
              Nama skill dicari &amp; dipasang orkestrator dari katalog. Progres tampil di layar
              Tugas.
            </span>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={installName}
                onChange={(e) => {
                  setInstallName(e.target.value);
                  setInstallError(null);
                  setInstallStatus(null);
                }}
                placeholder="nama-skill"
                aria-label="Nama skill yang mau dipasang"
                data-testid="skill-install-input"
                className="bg-office-inset border border-office-border rounded-lg px-3 py-2 text-xs text-office-text min-h-[40px]"
              />
              <button
                type="button"
                onClick={() => void install()}
                disabled={installing}
                data-testid="skill-install-submit"
                className="w-full py-2.5 rounded-xl bg-office-accent text-office-on-accent text-[11px] font-bold min-h-[40px] disabled:opacity-50"
              >
                {installing ? 'Mengirim...' : 'Minta Orkestrator Install'}
              </button>
            </div>
            {installStatus && (
              <span
                className="text-[10px] font-mono text-office-success break-all"
                data-testid="skill-install-status"
              >
                {installStatus}
              </span>
            )}
            {installError && (
              <span
                className="text-[10px] font-mono text-office-danger break-all"
                data-testid="skill-install-error"
              >
                {installError}
              </span>
            )}
          </div>

          {state === 'error' && (
            <div className="rounded-xl border border-office-danger/40 bg-office-elevated p-3 flex flex-col gap-2">
              <span className="text-[11px] text-office-danger">
                Gagal menghubungi server kantor.
              </span>
              <span className="text-[10px] font-mono text-office-muted break-all">{error}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="self-start px-3 py-1.5 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-text min-h-[36px]"
              >
                Coba lagi
              </button>
            </div>
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
