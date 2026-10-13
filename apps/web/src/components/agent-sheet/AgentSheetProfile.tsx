import React, { useState } from 'react';
import { HeartPulse, CheckCircle, AlertCircle, PlugZap, Cpu, Loader2 } from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';

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
