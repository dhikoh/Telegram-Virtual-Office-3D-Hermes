import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { MarkdownView } from '../common/MarkdownView';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface AgentSheetChatProps {
  agent: OfficeAgent;
}

export const AgentSheetChat: React.FC<AgentSheetChatProps> = ({ agent }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Halo, saya **${agent.name}** (${agent.role}). Siap membantu operasional divisi **${agent.department}**. Ada yang bisa saya bantu?`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsgId = `reply-${Date.now()}`;
    const newMessages = [...messages, userMsg];
    setMessages([
      ...newMessages,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setInputMessage('');
    setIsStreaming(true);

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
                  ? 'bg-office-cyan text-office-bg font-medium rounded-br-none shadow-glow-cyan'
                  : 'glass-panel bg-white/5 text-office-text border border-white/10 rounded-bl-none'
              }`}
            >
              <MarkdownView content={m.content} />
            </div>
            <span className="text-[9px] font-mono text-office-muted/70 mt-1 px-1">
              {m.timestamp}
            </span>
          </div>
        ))}
        {isStreaming && (
          <div className="self-start flex items-center gap-1 text-[11px] text-office-cyan font-mono animate-pulse pl-2">
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
            className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-office-muted hover:text-white whitespace-nowrap shrink-0 transition-colors min-h-[36px]"
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <div className="p-2.5 border-t border-white/10 bg-slate-900/80 flex items-center gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          placeholder={`Instruksi untuk ${agent.name}...`}
          disabled={isStreaming}
          className="flex-1 bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-office-muted/50 focus:outline-none focus:border-office-cyan min-h-[44px]"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputMessage.trim() || isStreaming}
          type="button"
          aria-label="Kirim instruksi chat"
          className="w-11 h-11 rounded-xl bg-office-cyan text-office-bg font-bold flex items-center justify-center hover:bg-cyan-300 disabled:opacity-40 transition-all shadow-glow-cyan shrink-0 min-h-[44px] min-w-[44px]"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
