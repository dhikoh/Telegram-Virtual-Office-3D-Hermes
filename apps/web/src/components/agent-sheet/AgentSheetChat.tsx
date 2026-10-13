import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, History, RefreshCw } from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { MarkdownView } from '../common/MarkdownView';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

export const AgentSheetChat: React.FC<AgentSheetChatProps> = ({ agent }) => {
  // Tahap 8: no invented welcome message — the transcript is exactly what the
  // gateway session holds, and an empty history says so instead of pretending.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>('loading');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    setHistoryState('loading');
    setHistoryError(null);
    try {
      const res = await api.getChatHistory(agent.id);
      setMessages(
        res.messages.map((m, i) => ({
          id: `hist-${i}-${m.timestamp}`,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }))
      );
      setHistoryState('ready');
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
      setHistoryState('error');
    }
  }, [agent.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    tma.hapticImpact('light');
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsgId = `reply-${Date.now()}`;
    const newMessages = [...messages, userMsg];
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
      content: m.content,
    }));

    await api.streamChat(
      agent.id,
      historyPayload,
      (delta) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + delta } : m))
        );
      },
      () => {
        setIsStreaming(false);
        tma.hapticNotification('success');
      },
      (err) => {
        setIsStreaming(false);
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

  return (
    <div className="flex-1 flex flex-col justify-between overflow-hidden">
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
            <span className="font-mono text-[10px] text-office-muted break-all">{historyError}</span>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="self-start px-3 py-1.5 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-text min-h-[36px]"
            >
              Coba lagi
            </button>
          </div>
        )}

        {historyState === 'ready' && messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <History className="w-5 h-5 text-office-muted" />
            <span className="text-[11px] text-office-muted">
              Belum ada percakapan dengan {agent.name}.
            </span>
            <span className="text-[10px] text-office-muted">
              Percakapan tersimpan di sesi agen, jadi tetap ada setelah aplikasi ditutup.
            </span>
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
              }`}
            >
              <MarkdownView content={m.content} />
            </div>
            <span className="text-[9px] font-mono text-office-muted mt-1 px-1">
              {formatTime(m.timestamp)}
            </span>
          </div>
        ))}
        {isStreaming && (
          <div className="self-start flex items-center gap-1 text-[11px] text-office-accent-ink font-mono animate-pulse pl-2">
            <span>{agent.name} sedang mengetik...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-3 py-1 flex gap-1.5 overflow-x-auto no-scrollbar">
        {['Status tugas saat ini?', 'Analisis performa minggu ini', 'Cek anomali divisi'].map((pill) => (
          <button
            key={pill}
            onClick={() => handleSendMessage(pill)}
            disabled={isStreaming}
            type="button"
            className="px-2.5 py-1.5 rounded-full bg-office-hover hover:bg-office-hover border border-office-border text-[10px] text-office-muted hover:text-office-text whitespace-nowrap shrink-0 transition-colors min-h-[36px]"
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <div className="p-2.5 border-t border-office-border bg-office-elevated flex items-center gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          placeholder={`Instruksi untuk ${agent.name}...`}
          disabled={isStreaming}
          className="flex-1 bg-office-inset border border-office-border rounded-xl px-3 py-2 text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-accent min-h-[44px]"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputMessage.trim() || isStreaming}
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
