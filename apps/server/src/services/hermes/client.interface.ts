import type { HermesCapabilities } from '@hermes-office/shared';

export interface StartRunParams {
  input: string;
  sessionId?: string;
  instructions?: string;
  conversationHistory?: unknown[];
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

export interface HermesClient {
  capabilities(): Promise<HermesCapabilities>;
  startRun(params: StartRunParams): Promise<StartRunResponse>;
  getRunStatus(runId: string): Promise<HermesRunStatus>;
  resolveApproval(runId: string, decision: 'once' | 'deny'): Promise<{ status: string; decision: string }>;
  stopRun(runId: string): Promise<{ status: string }>;
  streamEvents(runId: string, onEvent: (event: string, data: unknown) => void): Promise<() => void>;
  chatStream(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void
  ): Promise<void>;
}
