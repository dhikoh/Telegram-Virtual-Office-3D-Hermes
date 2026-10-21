/**
 * Audit 2026-10-21 — aksi tugas pada store: hentikan, hapus, ubah.
 *
 * Kontrak yang dikunci di sini:
 *  - stopTask selalu menyelesaikan dengan status 'cancelled' pada state lokal,
 *    dan galat hubungan (`gateway_error`) diumumkan sebagai ticker bertipe
 *    'error', bukan diam;
 *  - removeTask benar-benar memanggil DELETE dan membuang baris dari papan;
 *  - updateTask mengirim PATCH dan menuliskan hasil balik server ke state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOfficeStore } from '../office';

vi.mock('../../services/tma', () => ({
  tma: { getInitData: () => 'init-data-terpalsu', hapticNotification: () => {} },
}));

const baseTask = (over: Record<string, unknown> = {}) => ({
  id: 'task_x',
  title: 'Tugas X',
  description: '',
  agent_id: 'agent_finance_01',
  priority: 'normal',
  status: 'running',
  run_id: 'run_1',
  result_md: null,
  due_at: null,
  depends_on: null,
  source: 'manual',
  tool_calls_count: 0,
  created_at: 1,
  updated_at: 1,
  ...over,
}) as never;

describe('store: stopTask / removeTask / updateTask (audit 2026-10-21)', () => {
  const fetchMock = vi.fn();
  let bodies: string[];
  let methods: string[];

  beforeEach(() => {
    bodies = [];
    methods = [];
    useOfficeStore.setState({ tasks: [baseTask()], ticker: [] });
    fetchMock.mockImplementation((_input: string, init?: RequestInit) => {
      methods.push(init?.method || 'GET');
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stopTask menutup task secara lokal dan melaporkan galat gateway sebagai ticker error', async () => {
    fetchMock.mockImplementation((_input: string, init?: RequestInit) => {
      methods.push(init?.method || 'GET');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'cancelled',
            reason: 'gateway_error',
            stopped: false,
            gateway_error: 'fetch failed',
          }),
      });
    });

    const result = await useOfficeStore.getState().stopTask('task_x');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/tasks/task_x/stop');
    expect(methods[0]).toBe('POST');

    expect(result.gateway_error).toBe('fetch failed');
    const state = useOfficeStore.getState();
    expect(state.tasks[0].status).toBe('cancelled');
    expect(state.ticker.at(-1)?.type).toBe('error');
  });

  it('stopTask sukses memberi umpan balik sukses tanpa galat gateway', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'cancelled', reason: 'stopped', stopped: true, gateway_error: null }),
      })
    );

    const result = await useOfficeStore.getState().stopTask('task_x');

    expect(result).toEqual({ reason: 'stopped', gateway_error: null });
    expect(useOfficeStore.getState().tasks[0].status).toBe('cancelled');
    expect(useOfficeStore.getState().ticker.at(-1)?.type).toBe('success');
  });

  it('removeTask mengirim DELETE dan menghapus kartu dari papan', async () => {
    await useOfficeStore.getState().removeTask('task_x');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/tasks/task_x');
    expect(methods[0]).toBe('DELETE');
    expect(useOfficeStore.getState().tasks).toEqual([]);
  });

  it('removeTask gagal mempertahankan kartu dan tetap melaporkan kegagalannya', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('rusak'),
        json: () => Promise.resolve({ message: 'Server sedang sibuk' }),
      })
    );

    await expect(useOfficeStore.getState().removeTask('task_x')).rejects.toThrow();
    expect(useOfficeStore.getState().tasks).toHaveLength(1);
  });

  it('updateTask mengirim PATCH dan menuliskan hasil balik server', async () => {
    fetchMock.mockImplementation((_input: string, init?: RequestInit) => {
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      methods.push(init?.method || 'GET');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(baseTask({ title: 'Judul Baru', status: 'backlog', priority: 'high' })),
      });
    });

    const updated = await useOfficeStore
      .getState()
      .updateTask('task_x', { title: 'Judul Baru', priority: 'high' });

    expect(methods[0]).toBe('PATCH');
    expect(JSON.parse(bodies[0])).toEqual({ title: 'Judul Baru', priority: 'high' });
    expect(updated.title).toBe('Judul Baru');
    expect(useOfficeStore.getState().tasks[0].title).toBe('Judul Baru');
    expect(useOfficeStore.getState().tasks[0].priority).toBe('high');
  });
});
