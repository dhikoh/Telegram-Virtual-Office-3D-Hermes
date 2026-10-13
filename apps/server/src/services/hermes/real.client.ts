import type {
  HermesClient,
  StartRunParams,
  StartRunResponse,
  HermesRunStatus,
  HermesSessionMessage,
} from './client.interface.js';
import { HermesTimeoutError } from './client.interface.js';
import type { HermesCapabilities } from '@hermes-office/shared';
import { config } from '../../config.js';

export class RealHermesClient implements HermesClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(baseUrl: string, apiKey: string, timeoutMs: number = config.HERMES_TIMEOUT_MS) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const signal = init?.signal ?? AbortSignal.timeout(this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal });
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error?.name === 'TimeoutError' || (error?.name === 'AbortError' && signal.aborted)) {
        throw new HermesTimeoutError(`Hermes request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
  }

  public async capabilities(): Promise<HermesCapabilities> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/capabilities`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Hermes capabilities error: ${res.status} ${res.statusText}`);
    return (await res.json()) as HermesCapabilities;
  }

  /**
   * Tahap 7 — auto-detect: ask the gateway which models it serves.
   * Falls back to the capabilities document when /v1/models is unavailable.
   */
  public async listModels(): Promise<string[]> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: { id?: string }[] };
        const ids = (body.data || []).map((m) => m?.id).filter((id): id is string => Boolean(id));
        if (ids.length > 0) return ids;
      }
    } catch {
      // fall through to capabilities
    }
    const caps = await this.capabilities();
    return caps.model ? [caps.model] : [];
  }

  public async startRun(params: StartRunParams): Promise<StartRunResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Hermes startRun error: ${res.status} ${res.statusText}`);
    return (await res.json()) as StartRunResponse;
  }

  public async getRunStatus(runId: string): Promise<HermesRunStatus> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Hermes getRunStatus error: ${res.status} ${res.statusText}`);
    return (await res.json()) as HermesRunStatus;
  }

  public async resolveApproval(
    runId: string,
    decision: 'once' | 'deny'
  ): Promise<{ status: string; decision: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}/approval`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) throw new Error(`Hermes resolveApproval error: ${res.status} ${res.statusText}`);
    return (await res.json()) as { status: string; decision: string };
  }

  public async stopRun(runId: string): Promise<{ status: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}/stop`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Hermes stopRun error: ${res.status} ${res.statusText}`);
    return (await res.json()) as { status: string };
  }

  public async streamEvents(
    runId: string,
    onEvent: (event: string, data: unknown) => void
  ): Promise<() => void> {
    const controller = new AbortController();
    fetch(`${this.baseUrl}/v1/runs/${runId}/events`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.body) {
          if (!controller.signal.aborted) {
            onEvent('stream.dropped', { reason: 'No response body' });
          }
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (!controller.signal.aborted) {
              onEvent('stream.dropped', { reason: 'Unexpected EOF mid-stream' });
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.substring(6));
                onEvent(parsed.event || 'message', parsed.data || parsed);
              } catch {
                // Ignore parse errors on malformed chunks
              }
            }
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          onEvent('stream.dropped', { error: String(err) });
        }
      });

    return () => controller.abort();
  }

  public async chatStream(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    model?: string
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: model || 'hermes-agent',
        messages,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value));
    }
  }

  /**
   * Tahap 8 — sessions: history and memory live on the gateway, so an agent's
   * chat survives reloads, restarts and redeploys without a local copy.
   */
  public async createSession(label?: string): Promise<string | null> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(label ? { label } : {}),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { session?: { id?: string } };
      return body?.session?.id ?? null;
    } catch {
      return null;
    }
  }

  public async getSessionMessages(sessionId: string): Promise<HermesSessionMessage[]> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=500`,
      { headers: this.headers() }
    );
    if (!res.ok) {
      throw new Error(`Hermes session messages error: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { data?: HermesSessionMessage[] };
    return (body.data || [])
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          !m.tool_call_id &&
          !m.tool_name &&
          typeof m.content === 'string'
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public async sessionChatStream(
    sessionId: string,
    message: string,
    onDelta: (delta: string) => void,
    _model?: string
  ): Promise<void> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ message }),
      }
    );
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Hermes session chat error: ${res.status} ${res.statusText} ${text}`.trim());
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamError: string | null = null;

    const handleFrame = (frame: string) => {
      const lines = frame.split('\n');
      let event = '';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.substring(7).trim();
        else if (line.startsWith('data: ')) data = line.substring(6);
      }
      if (!event || !data) return;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (event === 'assistant.delta') {
        const delta = parsed.delta;
        if (typeof delta === 'string' && delta) onDelta(delta);
      } else if (event === 'error' || event === 'run.failed') {
        streamError = String(
          (parsed.error as { message?: string } | undefined)?.message ||
            parsed.message ||
            parsed.error ||
            event
        );
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        if (frame.trim()) handleFrame(frame);
      }
    }
    if (buffer.trim()) handleFrame(buffer);

    if (streamError) throw new Error(streamError);
  }

  /** Tahap 8 — skills installed on the gateway. */
  public async listSkills(): Promise<unknown[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/skills`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) message = body.error.message;
      } catch {
        // keep the status line
      }
      throw new Error(message);
    }
    const body: unknown = await res.json();
    if (Array.isArray(body)) return body;
    const asRecord = body as { data?: unknown[]; skills?: unknown[] };
    return asRecord?.data || asRecord?.skills || [];
  }
}
