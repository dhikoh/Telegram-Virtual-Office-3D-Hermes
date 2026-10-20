/**
 * Fase 2d — Pelacak Idempotensi Pesan Chat Klien.
 *
 * Mencegah pengiriman ganda (double-click, reconnect, network retry).
 * Setiap permintaan chat membawa `client_message_id`. Jika request kedua tiba
 * dengan ID yang sama untuk agen yang sama, server tidak memulai pekerjaan baru,
 * melainkan menyambung ke pekerjaan yang sedang berjalan atau memutar ulang
 * peristiwa pekerjaan yang sudah selesai.
 */

export const DEFAULT_IDEMPOTENCY_TTL_MS = 15 * 60 * 1000;

export interface IdempotentTurn {
  agentId: string;
  clientMessageId: string;
  runIdPromise: Promise<string | null>;
  resolveRunId: (runId: string | null) => void;
  runId: string | null;
  createdAt: number;
}

export class ChatIdempotencyHub {
  private turns = new Map<string, IdempotentTurn>();

  constructor(
    private ttlMs: number = DEFAULT_IDEMPOTENCY_TTL_MS,
    private clock: () => number = Date.now
  ) {}

  private key(agentId: string, clientMessageId: string): string {
    return `${agentId}:${clientMessageId}`;
  }

  public register(agentId: string, clientMessageId: string): IdempotentTurn {
    const k = this.key(agentId, clientMessageId);
    const existing = this.turns.get(k);
    if (existing) return existing;

    let resolver!: (runId: string | null) => void;
    const runIdPromise = new Promise<string | null>((resolve) => {
      resolver = resolve;
    });

    const turn: IdempotentTurn = {
      agentId,
      clientMessageId,
      runIdPromise,
      resolveRunId: resolver,
      runId: null,
      createdAt: this.clock(),
    };

    this.turns.set(k, turn);
    return turn;
  }

  public get(agentId: string, clientMessageId: string): IdempotentTurn | null {
    return this.turns.get(this.key(agentId, clientMessageId)) ?? null;
  }

  public setRunId(agentId: string, clientMessageId: string, runId: string): void {
    const turn = this.turns.get(this.key(agentId, clientMessageId));
    if (!turn) return;
    turn.runId = runId;
    turn.resolveRunId(runId);
  }

  public remove(agentId: string, clientMessageId: string): void {
    const k = this.key(agentId, clientMessageId);
    const turn = this.turns.get(k);
    if (turn) {
      turn.resolveRunId(null);
      this.turns.delete(k);
    }
  }

  public prune(now: number = this.clock()): number {
    let removed = 0;
    for (const [k, turn] of this.turns) {
      if (now - turn.createdAt > this.ttlMs) {
        this.turns.delete(k);
        removed++;
      }
    }
    return removed;
  }

  public get size(): number {
    return this.turns.size;
  }
}

export const chatIdempotencyHub = new ChatIdempotencyHub();
