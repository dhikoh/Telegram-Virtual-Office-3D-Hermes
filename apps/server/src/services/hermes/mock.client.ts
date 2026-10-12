import type {
  HermesClient,
  StartRunParams,
  StartRunResponse,
  HermesRunStatus,
} from './client.interface.js';
import { HermesTimeoutError } from './client.interface.js';
import type { HermesCapabilities } from '@hermes-office/shared';
import { config } from '../../config.js';

export class MockHermesClient implements HermesClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl = 'http://127.0.0.1:8642', timeoutMs: number = config.HERMES_TIMEOUT_MS) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
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
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/capabilities`);
    if (!res.ok) throw new Error(`MockHermes error: ${res.statusText}`);
    return (await res.json()) as HermesCapabilities;
  }

  public async startRun(params: StartRunParams): Promise<StartRunResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`MockHermes startRun error: ${res.statusText}`);
    return (await res.json()) as StartRunResponse;
  }

  public async getRunStatus(runId: string): Promise<HermesRunStatus> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}`);
    if (!res.ok) throw new Error(`MockHermes getRunStatus error: ${res.statusText}`);
    return (await res.json()) as HermesRunStatus;
  }

  public async resolveApproval(runId: string, decision: 'once' | 'deny'): Promise<{ status: string; decision: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) throw new Error(`MockHermes resolveApproval error: ${res.statusText}`);
    return (await res.json()) as { status: string; decision: string };
  }

  public async stopRun(runId: string): Promise<{ status: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/runs/${runId}/stop`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`MockHermes stopRun error: ${res.statusText}`);
    return (await res.json()) as { status: string };
  }

  public async streamEvents(
    runId: string,
    onEvent: (event: string, data: unknown) => void
  ): Promise<() => void> {
    const controller = new AbortController();
    fetch(`${this.baseUrl}/v1/runs/${runId}/events`, {
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
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hermes-agent',
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
}
