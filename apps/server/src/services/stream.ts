import type { FastifyReply } from 'fastify';
import type { NormalizedOfficeEvent } from '@hermes-office/shared';

/**
 * Tahap 7 fix: emit BOTH a named SSE event (`event: agent_status`) and the
 * raw `data:` line. EventSource only fires `addEventListener('agent_status')`
 * for named events; the previous payload-only frame was delivered as the
 * default `message` event, so every listener in the web app stayed silent.
 * Keeping the bare data line means older clients still receive it via onmessage.
 */
export function sseFrame(event: NormalizedOfficeEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

class OfficeStreamManager {
  private clients = new Set<FastifyReply>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  public registerClient(reply: FastifyReply): () => void {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    this.clients.add(reply);

    // Initial connection acknowledgment
    this.sendToClient(reply, {
      type: 'heartbeat',
      timestamp: Date.now(),
    });

    const cleanup = () => {
      this.clients.delete(reply);
    };

    reply.raw.on('close', cleanup);
    reply.raw.on('finish', cleanup);

    return cleanup;
  }

  public broadcast(event: NormalizedOfficeEvent): void {
    const payload = sseFrame(event);
    for (const client of this.clients) {
      try {
        client.raw.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private sendToClient(reply: FastifyReply, event: NormalizedOfficeEvent): void {
    try {
      reply.raw.write(sseFrame(event));
    } catch {
      this.clients.delete(reply);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        timestamp: Date.now(),
      });
    }, 15000); // Heartbeat every 15s per Section 7
  }

  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const client of this.clients) {
      try {
        client.raw.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}

export const streamManager = new OfficeStreamManager();
