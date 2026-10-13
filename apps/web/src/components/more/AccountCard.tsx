/**
 * Tahap 8 — Kartu Akun.
 *
 * Menampilkan identitas yang benar-benar diautentikasi server (/api/me):
 * ID Telegram pemilik, peran, dan daftar hak akses. Bila panggilan gagal,
 * keadaan galat ditampilkan apa adanya — tidak ada nama/peran karangan.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { User, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';

type LoadState = 'loading' | 'ready' | 'error';

interface MeShape {
  user: { id: number; username?: string; first_name?: string; name?: string; role?: string };
  role: string;
  permissions: string[];
}

export const AccountCard: React.FC = () => {
  const [state, setState] = useState<LoadState>('loading');
  const [me, setMe] = useState<MeShape | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const res = await api.getMe();
      setMe(res as unknown as MeShape);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-office-text">
          <User className="w-4 h-4 text-office-accent-ink" />
          <span>Akun Kantor</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Muat ulang akun"
          className="text-office-muted hover:text-office-text p-1.5 min-h-[36px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {state === 'loading' && (
        <span className="text-[11px] text-office-muted font-mono">Memeriksa sesi masuk...</span>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-office-danger">Akun gagal dimuat dari server.</span>
          <span className="text-[10px] font-mono text-office-muted break-all">{error}</span>
        </div>
      )}

      {state === 'ready' && me && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-office-muted">
            Teridentifikasi sebagai{' '}
            <span className="font-semibold text-office-text">
              {me.user?.first_name || me.user?.username || me.user?.name || 'Pemilik'}
            </span>{' '}
            <span className="font-mono">ID {me.user?.id}</span>
          </span>
          <span className="text-[11px] text-office-muted flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-office-success" />
            Peran: <span className="font-semibold text-office-text">{me.role}</span>
          </span>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(me.permissions || []).map((p) => (
              <span
                key={p}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-office-hover text-office-accent-ink"
              >
                {p}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-office-muted pt-1">
            Masuk lewat sesi Telegram — identitas berasal dari login asli, bukan dari penyimpanan
            browser.
          </span>
        </div>
      )}
    </div>
  );
};
