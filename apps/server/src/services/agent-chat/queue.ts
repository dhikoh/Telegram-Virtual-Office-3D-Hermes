/**
 * Fase 2c — antrian giliran chat per agen (FIFO, 1 aktif, maks 5 antrian).
 *
 * Mengapa ini mutlak diperlukan:
 * Jika pengguna mengirim 3 pesan beruntun dalam 5 detik, tanpa antrian giliran-giliran
 * tersebut akan bertabrakan di gateway/sesi Hermes secara paralel, menyebabkan
 * race condition dan riwayat percakapan yang kacau.
 *
 * Kontrak Antrian:
 *  - Konkurensi per agen: TEPAT 1 run aktif pada satu waktu.
 *  - Pesan berikutnya mengantri secara FIFO (First-In, First-Out).
 *  - Kapasitas antrian tertunda: maksimal 5 item. Melebihi ini langsung ditolak (QueueFullError).
 *  - Isolasi: Setiap agen memiliki antrian terpisah, tidak saling menghambat.
 *  - Pembatalan: Jika signal dibatalkan sebelum giliran dimulai, tugas dilewati tanpa dieksekusi.
 */

export class QueueFullError extends Error {
  constructor(message = 'Antrian pesan agen penuh (maksimal 5 pesan). Tunggu hingga giliran sebelumnya selesai.') {
    super(message);
    this.name = 'QueueFullError';
  }
}

interface QueueItem<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
}

interface AgentQueueState {
  active: boolean;
  items: QueueItem<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class AgentChatQueue {
  private queues = new Map<string, AgentQueueState>();

  constructor(private maxPending: number = 5) {}

  /**
   * Daftarkan tugas giliran chat ke antrian agen.
   * Mengembalikan Promise yang selesai ketika tugas giliran selesai diproses.
   */
  public enqueue<T>(agentId: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let state = this.queues.get(agentId);
    if (!state) {
      state = { active: false, items: [] };
      this.queues.set(agentId, state);
    }

    if (signal?.aborted) {
      return Promise.reject(new Error('Giliran dibatalkan sebelum masuk antrian.'));
    }

    // Jika sedang aktif memproses dan antrian tertunda sudah mencapai batas
    if (state.active && state.items.length >= this.maxPending) {
      return Promise.reject(new QueueFullError());
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { task, resolve, reject, signal };

      if (!state.active) {
        state.active = true;
        this.runTask(agentId, state, item);
      } else {
        state.items.push(item);
      }
    });
  }

  private async runTask<T>(agentId: string, state: AgentQueueState, item: QueueItem<T>): Promise<void> {
    if (item.signal?.aborted) {
      item.reject(new Error('Giliran dibatalkan saat mengantri.'));
      this.processNext(agentId, state);
      return;
    }

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      // Berikan giliran microtask agar callback penyelesaian tugas sebelumnya tuntas
      await Promise.resolve();
      this.processNext(agentId, state);
    }
  }

  private processNext(agentId: string, state: AgentQueueState): void {
    if (state.items.length > 0) {
      const nextItem = state.items.shift()!;
      this.runTask(agentId, state, nextItem);
    } else {
      state.active = false;
      // Bersihkan entri map jika kosong agar memori tidak bocor
      this.queues.delete(agentId);
    }
  }

  /**
   * Jumlah pesan yang sedang mengantri (di luar yang sedang aktif berjalan).
   */
  public getPendingCount(agentId: string): number {
    return this.queues.get(agentId)?.items.length ?? 0;
  }

  /**
   * Apakah agen saat ini sedang aktif memproses suatu giliran chat.
   */
  public isBusy(agentId: string): boolean {
    return Boolean(this.queues.get(agentId)?.active);
  }

  /**
   * Bersihkan antrian (berguna untuk pengujian atau reset).
   */
  public clear(agentId?: string): void {
    if (agentId) {
      const state = this.queues.get(agentId);
      if (state) {
        for (const item of state.items) {
          item.reject(new Error('Antrian dibersihkan.'));
        }
        this.queues.delete(agentId);
      }
    } else {
      for (const [, state] of this.queues) {
        for (const item of state.items) {
          item.reject(new Error('Antrian dibersihkan.'));
        }
      }
      this.queues.clear();
    }
  }
}

/**
 * Singleton antrian chat untuk seluruh server.
 */
export const agentChatQueue = new AgentChatQueue();
