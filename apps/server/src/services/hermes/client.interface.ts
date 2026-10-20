import type { HermesCapabilities } from '@hermes-office/shared';

export interface StartRunParams {
  input: string;
  sessionId?: string;
  instructions?: string;
  conversationHistory?: unknown[];
  model?: string;
  signal?: AbortSignal;
}

/**
 * Tahap 12 — konten pesan OpenAI-compatible: teks polos ATAU content part
 * (teks + gambar data URL) untuk jalur multimodal /v1/chat/completions.
 */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessageContent = string | ChatContentPart[];

export interface ChatRequestMessage {
  role: string;
  content: ChatMessageContent;
}

export class HermesTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HermesTimeoutError';
  }
}

export interface StartRunResponse {
  run_id: string;
  status: string;
}

export interface HermesRunStatus {
  object: string;
  run_id: string;
  status: 'started' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  output?: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface RunChatStreamHandlers {
  onRunId?: (runId: string) => void;
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError?: (message: string) => void;
  onEvent?: (event: string, data: unknown) => void;
}

export interface HermesClient {
  capabilities(): Promise<HermesCapabilities>;
  startRun(params: StartRunParams): Promise<StartRunResponse>;
  /**
   * Fase 2b — chat lewat Runs API: buka run dulu, baru baca peristiwanya.
   * `onRunId` dipanggil SEBELUM delta apa pun, supaya rute bisa menyerahkan
   * run_id ke klien untuk sambung-ulang.
   */
  runChatStream(params: StartRunParams, handlers: RunChatStreamHandlers): Promise<void>;
  getRunStatus(runId: string): Promise<HermesRunStatus>;
  resolveApproval(runId: string, decision: 'once' | 'deny'): Promise<{ status: string; decision: string }>;
  stopRun(runId: string): Promise<{ status: string }>;
  streamEvents(runId: string, onEvent: (event: string, data: unknown) => void): Promise<() => void>;
  chatStream(
    messages: ChatRequestMessage[],
    onChunk: (chunk: string) => void,
    model?: string,
    /** Fase 1 — identitas agen, dikirim sebagai pesan system pertama. */
    systemPrompt?: string
  ): Promise<void>;
  /** Tahap 7 — auto-detect: models advertised by the gateway. */
  listModels(): Promise<string[]>;

  /** Tahap 8 — chat history lives in a session on the gateway. */
  createSession(label?: string): Promise<string | null>;
  getSessionMessages(sessionId: string): Promise<HermesSessionMessage[]>;
  sessionChatStream(
    sessionId: string,
    message: ChatMessageContent,
    onDelta: (delta: string) => void,
    model?: string,
    /** Fase 1 — identitas agen, diteruskan sebagai `system_message`. */
    systemPrompt?: string
  ): Promise<void>;
  /** Tahap 8 — skills installed on the gateway (throws when it cannot enumerate). */
  listSkills(): Promise<unknown[]>;
  /** Fase 5 — list cron / scheduled jobs on the gateway. */
  listJobs(): Promise<HermesJob[]>;
}

/** Fase 5 — raw scheduled cron job returned by Hermes gateway. */
export interface HermesJob {
  id: string;
  name: string;
  schedule?: string;
  cron?: string;
  skills?: string[];
  agent_id?: string;
  state?: string;
  last_status?: string | null;
  last_run_at?: number | null;
  next_run_at?: number | null;
  created_at?: number | null;
}

/** Tahap 8 — one persisted message from a gateway session. */
export interface HermesSessionMessage {
  id: number | string;
  role: string;
  content: string;
  timestamp: number;
  tool_call_id?: string | null;
  tool_name?: string | null;
}
