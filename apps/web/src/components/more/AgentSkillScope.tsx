/**
 * Tahap 11 (bagian 2) — Sakelar skill aktif per agen (layer SOUL).
 *
 * Data SELALU dari server: daftar skill = katalog gateway lewat
 * GET /api/agents/:id/skills, penyimpanan lewat PATCH. Tidak ada daftar skill
 * karangan di sisi klien, dan kegagalan simpan ditampilkan apa adanya dari
 * balasan server (bukan diam secara optimis).
 *
 * Label memakai bahasa Indonesia hard-coded — sama dengan SkillsModal /
 * AgentsRegistryModal di sebelahnya (layar More tidak memakai i18n `t()`).
 * Target sentuh semua kontrol ≥ 44px.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks, Loader2, Save, ShieldAlert } from 'lucide-react';
import { api, type AgentSkillScope as SkillScopeData } from '../../services/api';
import { tma } from '../../services/tma';

export interface SkillScopeAgent {
  id: string;
  name: string;
  is_system?: boolean;
  /** Agen demo tidak punya baris nyata di server — disembunyikan dari pilihan. */
  isDemo?: boolean;
}

interface AgentSkillScopeProps {
  agents: SkillScopeAgent[];
}

/** Galat request() membawa bodi JSON server di ujung pesan — ambil pesannya. */
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

export const AgentSkillScope: React.FC<AgentSkillScopeProps> = ({ agents }) => {
  const list = useMemo(
    () =>
      agents.filter(
        (a) => Boolean(a.id) && !a.isDemo && !String(a.id).startsWith('demo-')
      ),
    [agents]
  );
  const [agentId, setAgentId] = useState<string>(() => list[0]?.id || '');
  const [scope, setScope] = useState<SkillScopeData | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Keadaan yang belum disimpan — sumber kebenaran tetap server.
  const [pending, setPending] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const selected = list.find((a) => a.id === agentId) || list[0] || null;

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setState('loading');
    setLoadError(null);
    setSaveError(null);
    setSaved(null);
    try {
      const res = await api.getAgentSkills(id);
      setScope(res);
      setPending(null);
      setState('idle');
    } catch (err) {
      setScope(null);
      setLoadError(serverMessage(err));
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (selected) void load(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (list.length === 0) {
    return (
      <span className="text-[11px] text-office-muted" data-testid="agent-skill-empty">
        Belum ada agen untuk dipilih.
      </span>
    );
  }

  const active = pending ?? scope?.skills ?? [];
  const isSystem = Boolean(selected?.is_system);
  const dirty =
    scope !== null && [...active].sort().join(',') !== [...scope.skills].sort().join(',');

  const toggle = (name: string, on: boolean) => {
    setSaveError(null);
    setSaved(null);
    const next = on ? [...new Set([...active, name])] : active.filter((n) => n !== name);
    setPending(next);
  };

  const save = async () => {
    if (!selected || !scope || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      const res = await api.updateAgentSkills(selected.id, [...active]);
      setScope(res);
      setPending(null);
      setSaved('Cakupan skill tersimpan.');
      tma.hapticNotification('success');
    } catch (err) {
      // Galat server apa adanya — tidak pernah diganti pesan sukses.
      setSaveError(serverMessage(err));
      tma.hapticNotification('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="agent-skill-scope">
      <span className="text-[11px] font-bold text-office-muted uppercase tracking-wider flex items-center gap-1.5">
        <ListChecks className="w-3.5 h-3.5" />
        Skill aktif per agen
      </span>

      <label className="flex flex-col gap-1" htmlFor="agent-skill-select">
        <span className="text-[10px] text-office-muted">Agen</span>
        <select
          id="agent-skill-select"
          value={selected?.id || ''}
          onChange={(e) => setAgentId(e.target.value)}
          data-testid="agent-skill-agent-select"
          className="bg-office-inset border border-office-border rounded-lg px-3 py-2.5 text-xs text-office-text min-h-[44px]"
        >
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.is_system ? ' (sistem)' : ''}
            </option>
          ))}
        </select>
      </label>

      <span className="text-[10px] text-office-muted">
        {scope?.mode === 'default'
          ? 'Bawaan: seluruh skill katalog aktif untuk agen ini.'
          : 'Pembatasan aktif: skill di luar daftar ini dimatikan untuk agen ini.'}
      </span>

      {isSystem && (
        <span
          className="text-[10px] text-office-warn flex items-center gap-1.5"
          data-testid="agent-skill-system-note"
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          Agen sistem orkestrator — cakupan skill-nya dikunci oleh server (403).
        </span>
      )}

      {state === 'loading' && (
        <span className="text-[11px] text-office-muted flex items-center gap-2" data-testid="agent-skill-loading">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Memuat cakupan skill...
        </span>
      )}

      {state === 'error' && (
        <span className="text-[10px] font-mono text-office-danger break-all" data-testid="agent-skill-load-error">
          {loadError}
        </span>
      )}

      {scope && !scope.available && (
        <span className="text-[10px] font-mono text-office-danger break-all" data-testid="agent-skill-catalog-error">
          Katalog skill gateway tidak bisa dibaca: {scope.error || 'tanpa keterangan'}
        </span>
      )}

      {scope && scope.available && scope.catalog.length === 0 && (
        <span className="text-[11px] text-office-muted" data-testid="agent-skill-catalog-empty">
          Gateway melaporkan tidak ada skill terpasang.
        </span>
      )}

      {scope &&
        scope.catalog.map((s) => {
          const on = active.includes(s.name);
          return (
            <button
              key={s.name}
              type="button"
              role="switch"
              aria-checked={on}
              disabled={isSystem || saving}
              onClick={() => toggle(s.name, !on)}
              data-testid={`agent-skill-toggle-${s.name}`}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors disabled:opacity-60 ${
                on
                  ? 'bg-office-accent/15 border-office-accent/50 text-office-text'
                  : 'bg-office-inset border-office-border text-office-muted'
              }`}
            >
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-bold truncate">{s.name}</span>
                {s.description && (
                  <span className="text-[10px] text-office-muted truncate">{s.description}</span>
                )}
              </span>
              <span
                className={`text-[9px] font-mono font-bold px-1.5 py-1 rounded shrink-0 ${
                  on ? 'bg-office-accent text-office-on-accent' : 'bg-office-hover text-office-muted'
                }`}
              >
                {on ? 'AKTIF' : 'MATI'}
              </span>
            </button>
          );
        })}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || isSystem || !dirty}
        data-testid="agent-skill-save"
        className="w-full py-2.5 rounded-xl bg-office-accent text-office-on-accent text-[11px] font-bold min-h-[44px] flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Menyimpan...' : 'Simpan cakupan skill'}
      </button>

      {saved && (
        <span className="text-[10px] font-mono text-office-success break-all" data-testid="agent-skill-status">
          {saved}
        </span>
      )}
      {saveError && (
        <span className="text-[10px] font-mono text-office-danger break-all" data-testid="agent-skill-error">
          {saveError}
        </span>
      )}
    </div>
  );
};
