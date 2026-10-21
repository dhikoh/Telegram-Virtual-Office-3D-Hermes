import React, { useEffect, useMemo, useState } from 'react';
import { HeartPulse, CheckCircle, AlertCircle, PlugZap, Cpu, Loader2, Sparkles, Check } from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { ModelPriorityEditor } from './ModelPriorityEditor';
import {
  CHARACTER_MODEL_IDS,
  CHARACTER_MODEL_LABELS,
  CHARACTER_MODEL_URLS,
  characterModelFor,
} from '../office/office-3d/glbCharacter';
import { AvatarSymbolPicker } from '../common/AvatarSymbolPicker';

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

const CHARACTER_ROLE_TAGS: Record<string, string> = {
  'male-a': 'Command',
  'female-a': 'Social',
  'female-b': 'Marketing',
  'male-b': 'Sales',
  'male-c': 'Analytics',
  'female-c': 'Finance',
  'male-d': 'Support',
  'female-d': 'HR',
};

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
  const [priorityRefresh, setPriorityRefresh] = useState(0);
  const [probing, setProbing] = useState(false);
  const [probeMessage, setProbeMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Tahap 17 — avatar editor: warna baju + karakter 3D (identitas tunggal).
  const [symbol, setSymbol] = useState(agent.avatar || '🤖');
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
      if (symbol && symbol !== agent.avatar) {
        await api.updateAgent(agent.id, { avatar: symbol });
      }
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
      setPriorityRefresh((value) => value + 1);
      await fetchInitialData();
      setProbeMessage({ ok: true, text: `Model aktif: ${model}` });
      tma.hapticNotification('success');
    } catch (err: unknown) {
      setProbeMessage({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan model' });
      tma.hapticNotification('error');
    }
  };

  // Tahap 20 (ST-5) — deteksi otomatis. Begitu panel terbuka, daftar model diambil
  // dari API key agen lewat endpoint read-only (tidak menyimpan apa pun, tidak
  // pernah menampilkan kunci di browser). Tombol "Uji Koneksi" tetap ada untuk
  // menguji kunci yang baru diketik.
  const [modelQuery, setModelQuery] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoadingModels(true);
      setListError(null);
      try {
        const res = await api.listAgentModels(agent.id);
        if (alive) setModels(res.models);
      } catch (err: unknown) {
        if (alive) {
          setModels([]);
          setListError(err instanceof Error ? err.message : 'Gagal memuat daftar model');
        }
      } finally {
        if (alive) setLoadingModels(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [agent.id, agent.endpoint_configured]);

  // Tahap 20 (ST-4) — sumber endpoint. `endpoint_configured` datang dari server,
  // jadi label tombol selalu mengikuti keadaan sesungguhnya, bukan state lokal.
  const [endpointSaving, setEndpointSaving] = useState(false);
  const [endpointMsg, setEndpointMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * Dua arah:
   *  - 'server' mengirim string KOSONG secara eksplisit. Server memakai '' sebagai
   *    "ikuti pengaturan server", sedangkan field yang tidak dikirim dianggap
   *    "jangan ubah" — itulah bug lama yang membuat tombol ini mustahil.
   *  - 'agent' menyimpan Base URL yang sedang diketik. Tanpa URL, tombol tidak
   *    memalsukan keadaan: ia meminta owner mengisinya dulu.
   */
  const handleEndpointSource = async (source: 'server' | 'agent') => {
    if (endpointSaving) return;
    setEndpointMsg(null);
    tma.hapticImpact('medium');

    if (source === 'server') {
      if (!agent.endpoint_configured) {
        setEndpointMsg({ ok: true, text: 'Agen sudah mengikuti pengaturan server.' });
        return;
      }
      setEndpointSaving(true);
      try {
        await api.resetAgentEndpoint(agent.id);
        setBaseUrl('');
        await fetchInitialData();
        setEndpointMsg({ ok: true, text: 'Agen kembali mengikuti pengaturan server.' });
        tma.hapticNotification('success');
      } catch (err: unknown) {
        setEndpointMsg({
          ok: false,
          text: err instanceof Error ? err.message : 'Gagal mengembalikan endpoint',
        });
        tma.hapticNotification('error');
      } finally {
        setEndpointSaving(false);
      }
      return;
    }

    if (agent.endpoint_configured) {
      setEndpointMsg({ ok: true, text: 'Endpoint kustom sudah terpasang — ubah URL lalu tekan Uji Koneksi.' });
      return;
    }
    const url = baseUrl.trim();
    if (!url) {
      setEndpointMsg({ ok: false, text: 'Isi Base URL Gateway dulu, baru pilih Kustom.' });
      return;
    }
    setEndpointSaving(true);
    try {
      await api.saveAgentEndpoint(agent.id, url);
      await fetchInitialData();
      setEndpointMsg({ ok: true, text: `Endpoint kustom tersimpan: ${url}` });
      tma.hapticNotification('success');
    } catch (err: unknown) {
      setEndpointMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Gagal menyimpan endpoint',
      });
      tma.hapticNotification('error');
    } finally {
      setEndpointSaving(false);
    }
  };

  /** Tahap 20 (ST-5) — batas baris yang dirender; sisanya dicari lewat filter. */
  const MODEL_RENDER_CAP = 60;

  const ACTIVE_MODEL = (agent.model ?? '').trim() || 'hermes-agent';

  /**
   * Tahap 20 (ST-5) — urutan yang disepakati:
   *   dedupe → A-Z (locale en, case-insensitive, angka numerik) → model aktif di
   *   baris pertama. Bila model aktif sudah tidak lagi tercantum di gateway, ia
   *   tetap ditampilkan agar owner melihat bahwa yang terpasang itu tidak ada di
   *   daftar — bukan hilang diam-diam.
   *
   * Server sudah mengurutkan (sortModels di detect.ts); urut ulang di sini supaya
   * jaminan A-Z tetap berlaku walau daftar datang dari jalur probe Connection.
   */
  const knownModels = useMemo(() => {
    const base = models.length > 0 ? models : agent.model ? [agent.model] : [];
    const unique = Array.from(
      new Set(base.filter((m): m is string => typeof m === 'string' && m.trim() !== ''))
    ).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
    if (unique.length === 0) return unique;

    const at = unique.indexOf(ACTIVE_MODEL);
    if (at === -1) unique.unshift(ACTIVE_MODEL);
    else if (at > 0) unique.unshift(...unique.splice(at, 1));
    return unique;
  }, [models, agent.model, ACTIVE_MODEL]);

  const trimmedQuery = modelQuery.trim().toLowerCase();
  const matchedModels = trimmedQuery
    ? knownModels.filter((m) => m.toLowerCase().includes(trimmedQuery))
    : knownModels;
  const visibleModels = matchedModels.slice(0, MODEL_RENDER_CAP);
  const hiddenModelCount = matchedModels.length - visibleModels.length;

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
        <span className="text-[11px] text-office-muted">Simbol Avatar (logo identitas agen)</span>
        <AvatarSymbolPicker value={symbol} onChange={setSymbol} />

        <span className="text-[11px] text-office-muted pt-1">Warna baju (kosongkan = warna ruangan)</span>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="character-picker">
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
                className={`relative flex items-center gap-2.5 p-2 rounded-xl border transition-all text-left min-h-[44px] ${
                  selected
                    ? 'border-office-accent bg-office-accent/15 shadow-sm ring-1 ring-office-accent/40'
                    : 'border-office-border hover:border-office-accent/40 bg-office-inset/40'
                }`}
              >
                {/* Visual Avatar Portrait */}
                <div
                  className={`relative w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                    id.startsWith('female')
                      ? 'bg-gradient-to-tr from-pink-500/25 to-purple-600/20 border-pink-400/30 text-pink-300'
                      : 'bg-gradient-to-tr from-cyan-500/25 to-blue-600/20 border-cyan-400/30 text-cyan-300'
                  }`}
                >
                  <svg className="w-5 h-5 fill-current opacity-90" viewBox="0 0 24 24">
                    {id.startsWith('female') ? (
                      <path d="M12 2a5 5 0 0 0-5 5c0 2.2 1.4 4.1 3.4 4.7C7.6 12.4 5 15.3 5 19v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1c0-3.7-2.6-6.6-5.4-7.3 2-.6 3.4-2.5 3.4-4.7a5 5 0 0 0-5-5zm0 2c1.7 0 3 1.3 3 3 0 1.2-.7 2.3-1.8 2.8-.8.4-1.6.4-2.4 0C9.7 9.3 9 8.2 9 7c0-1.7 1.3-3 3-3zm0 9c3.3 0 6 2.3 6 6H6c0-3.7 2.7-6 6-6z" />
                    ) : (
                      <path d="M12 2a4.5 4.5 0 0 0-4.5 4.5c0 1.9 1.2 3.5 2.9 4.1-2.9.8-5.4 3.4-5.4 6.9v1.5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V17.5c0-3.5-2.5-6.1-5.4-6.9 1.7-.6 2.9-2.2 2.9-4.1A4.5 4.5 0 0 0 12 2zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 8.5c3.6 0 6.5 2.5 6.5 6.5H5.5c0-4 2.9-6.5 6.5-6.5z" />
                    )}
                  </svg>
                  <span className="absolute -bottom-1 -right-1 text-[8px] font-mono font-bold px-1 rounded bg-office-inset text-office-text border border-office-border">
                    {id.split('-')[1]?.toUpperCase() ?? ''}
                  </span>
                </div>

                {/* Info Text */}
                <div className="flex flex-col min-w-0 flex-1 pr-3">
                  <span className="text-[11px] font-semibold text-office-text truncate leading-tight">
                    {CHARACTER_MODEL_LABELS[id]}
                  </span>
                  <span className="text-[9px] text-office-muted font-medium truncate mt-0.5">
                    {CHARACTER_ROLE_TAGS[id] ? `Default: ${CHARACTER_ROLE_TAGS[id]}` : 'Spesialis'}
                  </span>
                </div>

                {/* Selected Check Badge */}
                {selected && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-office-accent flex items-center justify-center shadow">
                    <Check className="w-2.5 h-2.5 text-office-surface stroke-[3]" aria-hidden />
                  </div>
                )}
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

        {/* Tahap 20 (ST-4) — dulu label teks mati tanpa onClick; sekarang toggle. */}
        <div className="pt-1" data-testid="endpoint-source-toggle">
          <span className="text-[11px] text-office-muted">Sumber endpoint</span>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <button
              type="button"
              data-testid="endpoint-source-server"
              aria-pressed={!agent.endpoint_configured}
              disabled={endpointSaving}
              onClick={() => void handleEndpointSource('server')}
              className={`min-h-[44px] py-2.5 rounded-xl border text-[11px] font-semibold transition-colors ${
                !agent.endpoint_configured
                  ? 'bg-office-accent/15 border-office-accent text-office-text'
                  : 'bg-office-inset border-office-border text-office-muted hover:text-office-text'
              }`}
            >
              Ikuti Server
            </button>
            <button
              type="button"
              data-testid="endpoint-source-agent"
              aria-pressed={Boolean(agent.endpoint_configured)}
              disabled={endpointSaving}
              onClick={() => void handleEndpointSource('agent')}
              className={`min-h-[44px] py-2.5 rounded-xl border text-[11px] font-semibold transition-colors ${
                agent.endpoint_configured
                  ? 'bg-office-accent/15 border-office-accent text-office-text'
                  : 'bg-office-inset border-office-border text-office-muted hover:text-office-text'
              }`}
            >
              Kustom
            </button>
          </div>
          {endpointMsg && (
            <p
              data-testid="endpoint-source-message"
              className={`mt-1.5 text-[11px] leading-relaxed ${
                endpointMsg.ok ? 'text-office-accent' : 'text-red-400'
              }`}
            >
              {endpointMsg.text}
            </p>
          )}
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

        {/* Tahap 20 (ST-5) — daftar model auto-detect: A-Z, model aktif di baris
            pertama, filter pencarian, maksimum 60 baris dirender. */}
        {(knownModels.length > 0 || loadingModels || listError) && (
          <div className="flex flex-col gap-1.5 pt-1" data-testid="model-list">
            <div className="flex items-center gap-1.5 text-[11px] text-office-muted">
              <Cpu className="w-3.5 h-3.5 shrink-0" />
              <span>
                Model tersedia:{' '}
                <strong className="text-office-text font-mono">{ACTIVE_MODEL}</strong>
                {knownModels.length > 0 ? ` — ${matchedModels.length}/${knownModels.length} ditampilkan` : ''}
              </span>
              {loadingModels && (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-label="Memuat model" />
              )}
            </div>

            {listError && (
              <p
                data-testid="model-list-error"
                className="text-[11px] text-office-danger leading-relaxed break-all"
              >
                {listError}
              </p>
            )}

            {!loadingModels && !listError && knownModels.length > 1 && (
              <input
                type="search"
                data-testid="model-filter"
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="Filter model (A-Z, bisa sebagian)..."
                aria-label="Filter daftar model"
                className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/60 font-mono focus:outline-none focus:border-office-accent min-h-[44px]"
              />
            )}

            <div className="flex flex-col gap-1">
              {visibleModels.map((m) => (
                <button
                  key={m}
                  onClick={() => handlePickModel(m)}
                  type="button"
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-mono transition-colors min-h-[44px] ${
                    ACTIVE_MODEL === m
                      ? 'bg-office-accent/15 border-office-accent text-office-text'
                      : 'bg-office-inset border-office-border text-office-muted hover:text-office-text'
                  }`}
                >
                  {m}
                  {ACTIVE_MODEL === m ? ' • aktif' : ''}
                </button>
              ))}
            </div>

            {knownModels.length > 0 && matchedModels.length === 0 && (
              <span
                data-testid="model-list-empty"
                className="text-[11px] text-office-muted"
              >
                Tidak ada model yang cocok dengan “{modelQuery}”.
              </span>
            )}

            {hiddenModelCount > 0 && (
              <span
                data-testid="model-list-truncated"
                className="text-[10px] text-office-muted leading-relaxed"
              >
                {hiddenModelCount} model lainnya disembunyikan — persempit filter untuk
                melihat sisanya.
              </span>
            )}
          </div>
        )}
      </div>

      <ModelPriorityEditor
        agentId={agent.id}
        currentModel={agent.model ?? null}
        availableModels={loadingModels || listError ? [] : models}
        refreshKey={priorityRefresh}
      />

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
