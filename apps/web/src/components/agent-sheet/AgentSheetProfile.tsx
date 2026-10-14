import React, { useState } from 'react';
import { HeartPulse, CheckCircle, AlertCircle, PlugZap, Cpu, Loader2, Sparkles, Check } from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import {
  CHARACTER_MODEL_IDS,
  CHARACTER_MODEL_LABELS,
  CHARACTER_MODEL_URLS,
  characterModelFor,
} from '../office/office-3d/glbCharacter';

/** Tahap 9 — pilihan warna baju avatar (Rule 9.4: palet lokal, nol aset eksternal). */
const SHIRT_SWATCHES = [
  '#38BDF8',
  '#34D399',
  '#FBBF24',
  '#F87171',
  '#A78BFA',
  '#F472B6',
  '#94A3B8',
  '#F97316',
];

interface AgentSheetProfileProps {
  agent: OfficeAgent;
}

/**
 * Tahap 7 — auto-detect: the owner pastes a base URL + API key, we probe the
 * gateway and list the models it actually serves. The key is stored
 * server-side only (Rule S4); the browser never sees it again.
 */
export const AgentSheetProfile: React.FC<AgentSheetProfileProps> = ({ agent }) => {
  const fetchInitialData = useOfficeStore((s) => s.fetchInitialData);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'healthy' | 'error'>('idle');
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [probing, setProbing] = useState(false);
  const [probeMessage, setProbeMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Tahap 17 — avatar editor: warna baju + karakter 3D (identitas tunggal).
  const [shirt, setShirt] = useState(agent.avatar_style?.shirt ?? '');
  const [character, setCharacter] = useState(
    agent.avatar_style?.character ?? characterModelFor(agent.department, null) ?? CHARACTER_MODEL_IDS[0]
  );
  // Tahap 17 — apa yang terjadi bila agen tidak memilih: default ruangannya.
  // Dihitung sekali supaya teks bantuan tidak menyalin logika pemilihan.
  const departmentDefaultLabel =
    CHARACTER_MODEL_LABELS[characterModelFor(agent.department, null) ?? CHARACTER_MODEL_IDS[0]];
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSaveAvatar = async () => {
    setAvatarSaving(true);
    setAvatarMsg(null);
    try {
      // `character` is always sent: it IS the agent's identity, and the server
      // validates it against CHARACTER_MODEL_IDS before it reaches SQL.
      const style = { ...(shirt ? { shirt } : {}), character };
      await api.updateAgent(agent.id, { avatar_style: style });
      await fetchInitialData();
      setAvatarMsg({ ok: true, text: 'Avatar diperbarui.' });
      tma.hapticNotification('success');
    } catch (err: unknown) {
      setAvatarMsg({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan avatar' });
      tma.hapticNotification('error');
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleCheckHealth = async () => {
    setHealthStatus('checking');
    try {
      const res = await api.getAgentHealth(agent.id);
      setHealthStatus(res.status === 'healthy' ? 'healthy' : 'error');
      setHealthMessage(res.status === 'healthy' ? 'Gateway aktif & siap melayani tugas' : 'Gateway merespons dengan kendala');
      tma.hapticNotification('success');
    } catch (err: unknown) {
      setHealthStatus('error');
      setHealthMessage(err instanceof Error ? err.message : 'Gateway tidak terjangkau');
      tma.hapticNotification('error');
    }
  };

  const handleDetectModels = async () => {
    setProbing(true);
    setProbeMessage(null);
    tma.hapticImpact('medium');
    try {
      const res = await api.probeConnection(agent.id, {
        base_url: baseUrl.trim() || undefined,
        api_key: apiKey.trim() || undefined,
      });
      setModels(res.models);
      setApiKey('');
      setProbeMessage({
        ok: true,
        text: res.models.length
          ? `Terhubung. ${res.models.length} model terdeteksi (${res.latency_ms ?? '-'} ms).`
          : 'Terhubung, tetapi gateway tidak menyebutkan model.',
      });
      await fetchInitialData();
      tma.hapticNotification('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deteksi model gagal';
      setModels([]);
      setProbeMessage({ ok: false, text: msg });
      tma.hapticNotification('error');
    } finally {
      setProbing(false);
    }
  };

  const handlePickModel = async (model: string) => {
    tma.hapticSelection();
    try {
      await api.setAgentModel(agent.id, model);
      await fetchInitialData();
      setProbeMessage({ ok: true, text: `Model aktif: ${model}` });
      tma.hapticNotification('success');
    } catch (err: unknown) {
      setProbeMessage({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan model' });
      tma.hapticNotification('error');
    }
  };

  const knownModels = models.length > 0 ? models : agent.model ? [agent.model] : [];

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
      <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2">
        <span className="text-xs font-semibold text-office-accent-ink">Ringkasan Karakter (SOUL)</span>
        <p className="text-xs text-office-text/90 leading-relaxed bg-office-inset p-2.5 rounded-lg border border-office-border">
          {agent.soul_summary || 'Tidak ada deskripsi jiwa (SOUL) tersimpan.'}
        </p>
      </div>

      {/* Tahap 9 — Avatar editor dasar (warna baju + aksesori) */}
      <div
        className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2"
        data-testid="avatar-editor"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-office-accent-ink">
          <Sparkles className="w-4 h-4" />
          <span>Avatar Agen</span>
        </div>
        {agent.is_system && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-office-inset border border-office-border text-office-muted self-start">
            AGEN SISTEM — permanen, tidak bisa dihapus
          </span>
        )}
        <span className="text-[11px] text-office-muted">Warna baju (kosongkan = warna ruangan)</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {SHIRT_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Pilih warna baju ${color}`}
              onClick={() => setShirt(color)}
              className={`w-8 h-8 rounded-lg border-2 transition-transform active:scale-95 ${
                shirt === color ? 'border-office-accent scale-110' : 'border-office-border'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <button
            type="button"
            onClick={() => setShirt('')}
            className={`h-8 px-2 rounded-lg border text-[10px] font-semibold ${
              shirt === '' ? 'border-office-accent text-office-text' : 'border-office-border text-office-muted'
            }`}
          >
            Otomatis
          </button>
        </div>
        <span className="text-[11px] text-office-muted pt-1">
          Karakter 3D (identitas di kantor)
        </span>
        <div className="grid grid-cols-3 gap-1.5" data-testid="character-picker">
          {CHARACTER_MODEL_IDS.map((id) => {
            const selected = character === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                title={CHARACTER_MODEL_URLS[id].split('/').pop()}
                onClick={() => {
                  setCharacter(id);
                  tma.hapticSelection();
                }}
                className={`flex items-center justify-center gap-1 h-11 rounded-lg border text-[10px] font-semibold transition-colors min-h-[44px] ${
                  selected
                    ? 'border-office-accent text-office-text bg-office-accent/10'
                    : 'border-office-border text-office-muted'
                }`}
              >
                {selected && <Check className="w-3 h-3 shrink-0" aria-hidden />}
                <span className="truncate">{CHARACTER_MODEL_LABELS[id]}</span>
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-office-muted leading-snug">
          {`Karakter ini yang tampil di kantor 2D & 3D. Kosong = default ruangan (${departmentDefaultLabel}).`}
        </span>
        <button
          type="button"
          onClick={() => void handleSaveAvatar()}
          disabled={avatarSaving}
          className="w-full py-2.5 rounded-xl bg-office-accent/10 hover:bg-office-accent/20 border border-office-accent/30 text-xs font-semibold text-office-accent-ink transition-colors min-h-[44px] flex items-center justify-center gap-2 mt-1"
        >
          {avatarSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <span>Simpan Avatar</span>
          )}
        </button>
        {avatarMsg && (
          <span
            className={`text-[10px] font-mono ${
              avatarMsg.ok ? 'text-office-success' : 'text-office-danger'
            }`}
          >
            {avatarMsg.text}
          </span>
        )}
      </div>

      {/* Tahap 7 — connection + model auto-detect */}
      <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5" data-testid="agent-connection">
        <div className="flex items-center gap-2 text-xs font-semibold text-office-text">
          <PlugZap className="w-4 h-4 text-office-accent-ink" />
          <span>Koneksi Hermes & Model</span>
        </div>

        <div className="flex justify-between py-1 text-xs">
          <span className="text-office-muted">Endpoint:</span>
          <span className="font-mono text-office-text">
            {agent.endpoint_configured ? 'Kustom (diatur di agen)' : 'Ikut pengaturan server'}
          </span>
        </div>

        <label className="text-[11px] text-office-muted" htmlFor={`base-url-${agent.id}`}>
          Base URL Gateway (opsional)
        </label>
        <input
          id={`base-url-${agent.id}`}
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Kosongkan untuk pakai alamat server"
          className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/60 font-mono focus:outline-none focus:border-office-accent min-h-[44px]"
        />

        <label className="text-[11px] text-office-muted" htmlFor={`api-key-${agent.id}`}>
          API Key (tersimpan aman di server, tidak pernah dikirim ke aplikasi)
        </label>
        <input
          id={`api-key-${agent.id}`}
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={agent.key_stored ? 'Kunci tersimpan — isi untuk mengganti' : 'Kunci gateway Hermes'}
          className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/60 font-mono focus:outline-none focus:border-office-accent min-h-[44px]"
        />

        <button
          onClick={handleDetectModels}
          disabled={probing}
          type="button"
          className="w-full py-2.5 px-3 rounded-xl bg-office-accent/10 hover:bg-office-accent/20 border border-office-accent/30 text-xs font-semibold text-office-accent-ink transition-colors min-h-[44px] flex items-center justify-center gap-2"
        >
          {probing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Mendeteksi model...</span>
            </>
          ) : (
            <>
              <PlugZap className="w-3.5 h-3.5" />
              <span>Uji Koneksi & Deteksi Model</span>
            </>
          )}
        </button>

        {probeMessage && (
          <div
            className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
              probeMessage.ok
                ? 'bg-office-success/10 text-office-success border border-office-success/30'
                : 'bg-office-danger/10 text-office-danger border border-office-danger/30'
            }`}
          >
            {probeMessage.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span className="break-all">{probeMessage.text}</span>
          </div>
        )}

        {knownModels.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center gap-1.5 text-[11px] text-office-muted">
              <Cpu className="w-3.5 h-3.5" />
              <span>Model aktif: <strong className="text-office-text font-mono">{agent.model || 'hermes-agent'}</strong></span>
            </div>
            {knownModels.map((m) => (
              <button
                key={m}
                onClick={() => handlePickModel(m)}
                type="button"
                className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-mono transition-colors min-h-[44px] ${
                  (agent.model || 'hermes-agent') === m
                    ? 'bg-office-accent/15 border-office-accent text-office-text'
                    : 'bg-office-inset border-office-border text-office-muted hover:text-office-text'
                }`}
              >
                {m}
                {(agent.model || 'hermes-agent') === m ? ' • aktif' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2 text-xs">
        <span className="text-xs font-semibold text-office-text">Spesifikasi Profile</span>
        <div className="flex justify-between py-1 border-b border-office-border">
          <span className="text-office-muted">Hermes Profile:</span>
          <span className="font-mono text-office-text">{agent.hermes_profile}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-office-muted">Endpoint Gateway:</span>
          <span className="font-mono text-office-text">
            {agent.endpoint_configured ? 'Endpoint terpasang' : 'Ikut pengaturan server'}
          </span>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-office-text">
            <HeartPulse className="w-4 h-4 text-office-accent-ink" />
            <span>Kesehatan Gateway Agen</span>
          </div>
          <button
            onClick={handleCheckHealth}
            disabled={healthStatus === 'checking'}
            type="button"
            className="px-3 py-1.5 rounded-lg bg-office-accent/10 hover:bg-office-accent/20 border border-office-accent/30 text-xs font-semibold text-office-accent-ink transition-colors min-h-[44px] flex items-center justify-center"
          >
            {healthStatus === 'checking' ? 'Memeriksa...' : 'Uji Koneksi'}
          </button>
        </div>
        {healthMessage && (
          <div
            className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
              healthStatus === 'healthy'
                ? 'bg-office-success/10 text-office-success border border-office-success/30'
                : 'bg-office-danger/10 text-office-danger border border-office-danger/30'
            }`}
          >
            {healthStatus === 'healthy' ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span>{healthMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
