import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, History, RefreshCw, Plus, Archive, ArrowLeft, Pencil, Paperclip } from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { MarkdownView } from '../common/MarkdownView';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Tahap 9 — pesan user yang digantikan versi koreksinya (tetap tampil, dicoret). */
  replaced?: boolean;
  /** Tahap 9 — pesan user yang lahir dari tombol "Ubah". */
  edited?: boolean;
  /** Tahap 12 — gambar yang dilampirkan (object URL untuk bubble + media id tersimpan). */
  imageUrl?: string;
  mediaId?: string;
}

interface SessionRow {
  session_id: string;
  created_at: number;
  archived_at: number | null;
  is_current: boolean;
}

interface AgentSheetChatProps {
  agent: OfficeAgent;
}

type HistoryState = 'loading' | 'ready' | 'error';

function formatTime(ts: number): string {
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSessionDate(ts: number): string {
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const AgentSheetChat: React.FC<AgentSheetChatProps> = ({ agent }) => {
  const recordSpeech = useOfficeStore((s) => s.recordSpeech);
  // Tahap 8: no invented welcome message — the transcript is exactly what the
  // gateway session holds, and an empty history says so instead of pretending.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>('loading');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Tahap 9 — sesi baru / arsip / edit & kirim ulang.
  const [sessionsPanel, setSessionsPanel] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tahap 12 — lampiran gambar chat.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  // Fase 2e — status lanjutan bila balasan sebelumnya terpotong di tengah jalan.
  const [canContinue, setCanContinue] = useState(false);

  /** Batas yang sama dengan server (MEDIA_UPLOAD_MAX_MB); dicek di klien dulu. */
  const MAX_IMAGE_MB = 8;

  const isViewingArchive = viewingSession !== null;

  const loadHistory = useCallback(
    async (sessionId?: string) => {
      setHistoryState('loading');
      setHistoryError(null);
      try {
        const res = await api.getChatHistory(agent.id, sessionId);
        setCanContinue(Boolean(res.can_continue));
        setMessages(
          res.messages.map((m, i) => ({
            id: m.id || `hist-${i}-${m.timestamp}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          }))
        );
        setViewingSession(sessionId ?? null);
        setHistoryState('ready');
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : String(err));
        setHistoryState('error');
      }
    },
    [agent.id]
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  /** Tahap 9 — "Sesi baru": sesi sekarang diarsipkan, kanvas percakapan dikosongkan. */
  const handleNewSession = async () => {
    if (isStreaming) return;
    tma.hapticImpact('medium');
    try {
      await api.resetAgentSession(agent.id);
      setMessages([]);
      setCanContinue(false);
      setHistoryState('ready');
      setViewingSession(null);
      setSessionsPanel(false);
      setNotice('Sesi baru dimulai. Riwayat sebelumnya tetap tersimpan di arsip.');
    } catch (err) {
      setNotice(`Gagal memulai sesi baru: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggleSessions = async () => {
    if (!sessionsPanel) {
      try {
        const res = await api.getAgentSessions(agent.id);
        setSessions(res.sessions);
      } catch {
        setSessions([]);
      }
    }
    setSessionsPanel((v) => !v);
  };

  const backToCurrentSession = () => {
    setSessionsPanel(false);
    void loadHistory();
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming || isViewingArchive) return;

    tma.hapticImpact('light');
    // Tahap 9 — edit & kirim ulang hanya dari composer (pil prompt cepat tidak
    // memicu mode edit). Gateway menyimpan sesi apa adanya, jadi koreksi dikirim
    // sebagai pesan baru dengan penanda eksplisit [koreksi] di konten kawat.
    const editedId = textToSend === undefined ? editingId : null;
    const wireContent = editedId ? `[koreksi] ${text}` : text;
    setEditingId(null);

    const priorMessages: ChatMessage[] = editedId
      ? messages.map((m) => (m.id === editedId ? { ...m, replaced: true } : m))
      : messages;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      edited: Boolean(editedId),
    };

    const assistantMsgId = `reply-${Date.now()}`;
    const newMessages = [...priorMessages, userMsg];
    setMessages([
      ...newMessages,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      },
    ]);
    setInputMessage('');
    setIsStreaming(true);
    if (historyState !== 'ready') setHistoryState('ready');

    const historyPayload = newMessages.map((m) => ({
      role: m.role,
      content: m.id === userMsg.id ? wireContent : m.content,
    }));

    // Tahap 17 — assemble the reply here so the office floor can show its last
    // line as a bubble. `recordSpeech` normalises and clips it.
    let assembled = '';

    await api.streamChat(
      agent.id,
      historyPayload,
      (delta) => {
        assembled += delta;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + delta } : m))
        );
      },
      () => {
        setIsStreaming(false);
        setCanContinue(false);
        if (assembled.trim()) recordSpeech(agent.id, assembled);
        tma.hapticNotification('success');
      },
      (err) => {
        setIsStreaming(false);
        setCanContinue(assembled.trim().length > 0);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: m.content || `⚠️ Galat komunikasi agen: ${err.message}` }
              : m
          )
        );
      }
    );
  };

  // Tahap 9 — hanya pesan user terakhir yang belum tergantikan yang bisa diubah.
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user' && !m.replaced);
  const canEdit = !isStreaming && !isViewingArchive && historyState === 'ready';

  /**
   * Tahap 12 — lampirkan gambar ke percakapan.
   * Gambar dikirim multipart ke server, yang menyimpannya DAN meneruskannya ke
   * sesi gateway sebagai content part. Bila gateway menolak, bubble gambar tetap
   * muncul (berkasnya memang tersimpan) tapi peringatan apa adanya ikut tampil.
   */
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (isStreaming || isViewingArchive || isUploading) return;

    if (!file.type.startsWith('image/')) {
      setNotice(`"${file.name}" bukan gambar — lampirkan PNG, JPEG, WebP, atau GIF.`);
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setNotice(
        `Gambar ${Math.round(file.size / (1024 * 1024))} MB melebihi batas ${MAX_IMAGE_MB} MB. Kompres dulu sebelum dikirim.`
      );
      return;
    }

    tma.hapticImpact('light');
    setIsUploading(true);
    setGatewayError(null);
    const previewUrl = URL.createObjectURL(file);
    try {
      const media = await api.uploadChatImage(agent.id, file);
      setMessages((prev) => [
        ...prev,
        {
          id: `media-${media.id}`,
          role: 'user',
          content: '[gambar terlampir]',
          timestamp: media.created_at || Date.now(),
          imageUrl: previewUrl,
          mediaId: media.id,
        },
      ]);
      setHistoryState('ready');
      if (media.gateway_error) {
        // Jangan disembunyikan: gambar tersimpan, tapi agent belum melihatnya.
        setGatewayError(media.gateway_error);
      }
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setNotice(`Gagal unggah gambar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between overflow-hidden">
      {/* Session toolbar — Tahap 9: Sesi baru + arsip */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-office-border bg-office-elevated">
        <button
          type="button"
          onClick={() => void handleNewSession()}
          disabled={isStreaming}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-office-inset border border-office-border text-[10px] font-semibold text-office-text hover:border-office-accent/70 transition-colors min-h-[36px] disabled:opacity-40"
        >
          <Plus className="w-3 h-3" />
          Sesi baru
        </button>
        <button
          type="button"
          onClick={() => void toggleSessions()}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-office-inset border border-office-border text-[10px] font-semibold text-office-text hover:border-office-accent/70 transition-colors min-h-[36px]"
        >
          <Archive className="w-3 h-3" />
          Riwayat sesi
        </button>
        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="flex-1 truncate text-left text-[10px] text-office-accent-ink hover:underline"
            title={notice}
          >
            {notice}
          </button>
        )}
      </div>

      {/* Panel daftar sesi (arsip) */}
      {sessionsPanel && (
        <div className="px-3 py-2 border-b border-office-border bg-office-inset flex flex-col gap-1 max-h-32 overflow-y-auto">
          {sessions.length === 0 && (
            <span className="text-[10px] text-office-muted">
              Belum ada sesi tercatat — sesi pertama muncul setelah chat pertama.
            </span>
          )}
          {sessions.map((s) => (
            <button
              key={s.session_id}
              type="button"
              onClick={() => {
                if (s.is_current) {
                  backToCurrentSession();
                } else {
                  setSessionsPanel(false);
                  void loadHistory(s.session_id);
                }
              }}
              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-[10px] min-h-[36px] text-left ${
                s.is_current
                  ? 'border-office-accent/60 bg-office-hover text-office-text'
                  : 'border-office-border bg-office-elevated text-office-muted hover:text-office-text'
              }`}
            >
              <span className="font-mono">{formatSessionDate(s.created_at)}</span>
              <span className="text-[9px] font-bold">{s.is_current ? 'SEKARANG' : 'ARSIP'}</span>
            </button>
          ))}
        </div>
      )}

      {/* Peringatan galat gateway dari lampiran gambar (Tahap 12, apa adanya) */}
      {gatewayError && (
        <div
          className="px-3 py-1.5 border-b border-office-danger/40 bg-office-danger/10 flex items-start justify-between gap-2"
          data-testid="media-gateway-error"
        >
          <span className="text-[10px] text-office-danger leading-snug">
            Gambar tersimpan, tetapi agent belum menerimanya — gateway menolak: {gatewayError}
          </span>
          <button
            type="button"
            onClick={() => setGatewayError(null)}
            className="text-[10px] text-office-muted hover:text-office-text shrink-0"
            aria-label="Tutup peringatan gateway"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner mode arsip (hanya baca) */}
      {isViewingArchive && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-office-warn/50 bg-office-warn/15">
          <span className="text-[10px] text-office-text">
            Anda melihat arsip sesi (hanya baca).
          </span>
          <button
            type="button"
            onClick={backToCurrentSession}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-office-inset border border-office-border text-[10px] font-semibold text-office-text min-h-[36px]"
          >
            <ArrowLeft className="w-3 h-3" />
            Sesi sekarang
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {historyState === 'loading' && (
          <div className="flex items-center gap-2 text-[11px] text-office-muted font-mono pl-1">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Memuat riwayat percakapan...</span>
          </div>
        )}

        {historyState === 'error' && (
          <div className="rounded-xl border border-office-danger/40 bg-office-elevated p-3 text-[11px] text-office-danger flex flex-col gap-2">
            <span>Riwayat percakapan gagal dimuat dari gateway.</span>
            <span className="font-mono text-[10px] text-office-muted break-all">
              {historyError}
            </span>
            <button
              type="button"
              onClick={() => void loadHistory(viewingSession ?? undefined)}
              className="self-start px-3 py-1.5 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-text min-h-[36px]"
            >
              Coba lagi
            </button>
          </div>
        )}

        {historyState === 'ready' && messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <History className="w-5 h-5 text-office-muted" />
            <span className="text-[11px] text-office-muted">
              {isViewingArchive
                ? 'Sesi ini tidak memiliki percakapan.'
                : `Belum ada percakapan dengan ${agent.name}.`}
            </span>
            {!isViewingArchive && (
              <span className="text-[10px] text-office-muted">
                Percakapan tersimpan di sesi agen, jadi tetap ada setelah aplikasi ditutup.
              </span>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col max-w-[85%] ${
              m.role === 'user' ? 'self-end items-end' : 'self-start items-start'
            }`}
          >
            <div
              className={`rounded-2xl p-3 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-office-accent text-office-on-accent font-medium rounded-br-none shadow-nu-raised'
                  : 'glass-panel bg-office-hover text-office-text border border-office-border rounded-bl-none'
              } ${m.replaced ? 'opacity-50' : ''}`}
            >
              {m.imageUrl && (
                <img
                  src={m.imageUrl}
                  alt={m.content || 'Gambar terlampir'}
                  data-testid="chat-image-attachment"
                  className="mb-1.5 max-h-48 w-full object-cover rounded-xl border border-office-border"
                />
              )}
              <MarkdownView content={m.content} />
            </div>
            <div className="flex items-center gap-2 mt-1 px-1">
              <span className="text-[9px] font-mono text-office-muted">
                {formatTime(m.timestamp)}
              </span>
              {m.edited && (
                <span className="text-[8px] font-mono font-bold px-1 rounded bg-office-inset border border-office-border text-office-muted">
                  diedit
                </span>
              )}
              {m.replaced && (
                <span className="text-[8px] font-mono font-bold px-1 rounded bg-office-inset border border-office-border text-office-danger/70 line-through">
                  digantikan
                </span>
              )}
              {m === lastUserMsg && canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(m.id);
                    setInputMessage(m.content);
                  }}
                  className="flex items-center gap-1 text-[9px] font-mono text-office-muted hover:text-office-accent-ink px-1 py-0.5 rounded min-h-[32px]"
                >
                  <Pencil className="w-3 h-3" />
                  Ubah
                </button>
              )}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="self-start flex items-center gap-1 text-[11px] text-office-accent-ink font-mono animate-pulse pl-2">
            <span>{agent.name} sedang mengetik...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Fase 2e — Tombol Lanjutkan saat balasan sebelumnya terpotong */}
      {canContinue && !isStreaming && (
        <div
          data-testid="chat-continue-banner"
          className="mx-3 my-1.5 p-2 rounded-xl bg-office-warn/15 border border-office-warn/40 flex items-center justify-between gap-2"
        >
          <span className="text-[10px] text-office-text leading-tight">
            Balasan sebelumnya terputus. Lanjutkan percakapan?
          </span>
          <button
            type="button"
            data-testid="continue-chat-button"
            onClick={() => void handleSendMessage('Lanjutkan jawaban sebelumnya dari bagian terakhir yang terpotong.')}
            className="px-2.5 py-1 rounded-lg bg-office-accent text-office-on-accent text-[10px] font-bold hover:brightness-110 shrink-0 shadow-nu-raised min-h-[32px]"
          >
            Lanjutkan
          </button>
        </div>
      )}

      {/* Quick Prompts */}
      <div className="px-3 py-1 flex gap-1.5 overflow-x-auto no-scrollbar">
        {['Status tugas saat ini?', 'Analisis performa minggu ini', 'Cek anomali divisi'].map(
          (pill) => (
            <button
              key={pill}
              onClick={() => handleSendMessage(pill)}
              disabled={isStreaming || isViewingArchive}
              type="button"
              className="px-2.5 py-1.5 rounded-full bg-office-hover hover:bg-office-hover border border-office-border text-[10px] text-office-muted hover:text-office-text whitespace-nowrap shrink-0 transition-colors min-h-[36px]"
            >
              {pill}
            </button>
          )
        )}
      </div>

      {/* Chat Input Bar */}
      <div className="p-2.5 border-t border-office-border bg-office-elevated flex items-center gap-2">
        {editingId && <Pencil className="w-3.5 h-3.5 text-office-accent-ink shrink-0" />}
        {/* Tahap 12 — lampirkan gambar ke percakapan */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => void handleFileSelected(e)}
          className="hidden"
          data-testid="chat-image-input"
          aria-label="Pilih gambar untuk dilampirkan"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || isViewingArchive || isUploading}
          aria-label={isUploading ? 'Mengunggah gambar…' : 'Lampirkan gambar'}
          data-testid="chat-attach-button"
          className="w-11 h-11 rounded-xl bg-office-inset border border-office-border text-office-muted hover:text-office-text hover:border-office-accent/70 flex items-center justify-center transition-colors disabled:opacity-40 shrink-0 min-h-[44px] min-w-[44px]"
        >
          {isUploading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
        </button>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          placeholder={
            isViewingArchive
              ? 'Kembali ke sesi sekarang untuk mengirim pesan…'
              : editingId
                ? 'Kirim sebagai koreksi pesan sebelumnya…'
                : `Instruksi untuk ${agent.name}...`
          }
          disabled={isStreaming || isViewingArchive}
          className="flex-1 bg-office-inset border border-office-border rounded-xl px-3 py-2 text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent min-h-[44px]"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputMessage.trim() || isStreaming || isViewingArchive}
          type="button"
          aria-label="Kirim instruksi chat"
          className="w-11 h-11 rounded-xl bg-office-accent text-office-on-accent font-bold flex items-center justify-center hover:bg-cyan-300 disabled:opacity-40 transition-all shadow-nu-raised shrink-0 min-h-[44px] min-w-[44px]"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
