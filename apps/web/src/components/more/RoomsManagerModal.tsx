/**
 * Kelola Ruang modal (Tahap 10, docs/DESIGN_DIRECTION.md §5 & keputusan 7.10).
 *
 * The office floor is data now: rename a room, recolor it (chips + avatars
 * follow), reorder it in the chip row, hide it, add a custom room, or delete
 * one you created. The eight seeded rooms are never deletable — hiding is the
 * supported way to reduce the floor — and the server refuses to delete a room
 * that still has active agents (409), so nothing silently loses occupants.
 */

import React, { useState } from 'react';
import { Building2, Eye, EyeOff, Trash2, X, Pencil, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';

interface RoomsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Swatches offered next to the color input (same family as the map). */
const ROOM_SWATCHES = [
  '#0EA5E9',
  '#8B5CF6',
  '#EC4899',
  '#34D399',
  '#38BDF8',
  '#FBBF24',
  '#A78BFA',
  '#F43F5E',
];

export const RoomsManagerModal: React.FC<RoomsManagerModalProps> = ({ isOpen, onClose }) => {
  const { departments, agents, reloadDepartments, addTickerMessage } = useOfficeStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#94A3B8');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#38BDF8');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen) return null;

  const label = (d: (typeof departments)[number]) => d.name ?? d.id;
  const agentsIn = (id: string) =>
    agents.filter((a) => a.department === id && a.status !== 'idle').length;

  const run = async (id: string | null, fn: () => Promise<void>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      await reloadDepartments();
      tma.hapticNotification('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      tma.hapticNotification('error');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (id: string) => {
    const dept = departments.find((d) => d.id === id);
    if (!dept) return;
    setEditingId(id);
    setEditName(dept.name ?? dept.id);
    setEditColor(dept.color);
    setActionError(null);
  };

  const saveEdit = (id: string) => {
    const name = editName.trim();
    if (!name || name.length > 40) {
      setActionError('Nama ruang wajib diisi (maks. 40 karakter).');
      return;
    }
    if (!HEX.test(editColor)) {
      setActionError('Warna harus heksa 6 digit (contoh #0EA5E9).');
      return;
    }
    void run(id, async () => {
      await api.updateDepartment(id, { name, color: editColor });
      setEditingId(null);
      addTickerMessage(`Ruang "${name}" diperbarui.`, 'info');
    });
  };

  const toggleHidden = (id: string, hidden: boolean) => {
    void run(id, async () => {
      await api.updateDepartment(id, { hidden: hidden ? 1 : 0 });
    });
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = departments.findIndex((d) => d.id === id);
    const other = departments[idx + dir];
    if (idx < 0 || !other) return;
    const me = departments[idx];
    void run(id, async () => {
      await api.updateDepartment(me.id, { sort_order: other.sort_order });
      await api.updateDepartment(other.id, { sort_order: me.sort_order });
    });
  };

  const addRoom = () => {
    const name = newName.trim();
    if (!name || name.length > 40) {
      setActionError('Nama ruang wajib diisi (maks. 40 karakter).');
      return;
    }
    if (!HEX.test(newColor)) {
      setActionError('Warna harus heksa 6 digit (contoh #0EA5E9).');
      return;
    }
    void run(null, async () => {
      await api.createDepartment({ name, color: newColor });
      setAdding(false);
      setNewName('');
      addTickerMessage(`Ruang baru "${name}" ditambahkan.`, 'success');
    });
  };

  const removeRoom = (id: string) => {
    void run(id, async () => {
      await api.deleteDepartment(id);
      addTickerMessage(`Ruang "${id}" dihapus.`, 'error');
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] isolate flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200"
      data-testid="rooms-manager"
    >
      <div className="bg-office-elevated border border-office-accent/40 rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-office-accent-ink" />
            <h3 className="text-sm font-bold text-office-text">Kelola Ruang ({departments.length})</h3>
          </div>
          <button onClick={onClose} type="button" className="text-office-muted hover:text-office-text p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-[58vh] overflow-y-auto pr-1">
          {departments.map((dept, idx) => (
            <React.Fragment key={dept.id}>
              <div
                className={`p-3 rounded-xl bg-office-inset border border-office-border flex items-center justify-between gap-2 ${
                  dept.hidden ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-office-border"
                    style={{ backgroundColor: dept.color }}
                    aria-hidden
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-office-text truncate">{label(dept)}</span>
                      {dept.is_system && (
                        <span className="text-[9px] font-mono font-bold bg-office-violet/20 text-office-violet px-1.5 py-0.5 rounded leading-none shrink-0">
                          BAWAAN
                        </span>
                      )}
                      {dept.hidden && (
                        <span className="text-[9px] font-mono font-bold bg-office-hover text-office-muted px-1.5 py-0.5 rounded leading-none shrink-0">
                          TERSEMBUNYI
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-office-muted">
                      {dept.id} · {agentsIn(dept.id)} agen bekerja
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(dept.id, -1)}
                    disabled={idx === 0 || busyId === dept.id}
                    aria-label={`Naikkan ${label(dept)}`}
                    title="Naikkan urutan"
                    className="p-2 rounded-lg bg-office-hover text-office-muted hover:text-office-text transition-colors min-h-[36px] disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(dept.id, 1)}
                    disabled={idx === departments.length - 1 || busyId === dept.id}
                    aria-label={`Turunkan ${label(dept)}`}
                    title="Turunkan urutan"
                    className="p-2 rounded-lg bg-office-hover text-office-muted hover:text-office-text transition-colors min-h-[36px] disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHidden(dept.id, !dept.hidden)}
                    disabled={busyId === dept.id}
                    aria-label={dept.hidden ? `Tampilkan ${label(dept)}` : `Sembunyikan ${label(dept)}`}
                    title={dept.hidden ? 'Tampilkan ruang' : 'Sembunyikan ruang'}
                    className="p-2 rounded-lg bg-office-hover text-office-muted hover:text-office-text transition-colors min-h-[36px] disabled:opacity-30"
                  >
                    {dept.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(dept.id)}
                    aria-label={`Edit ${label(dept)}`}
                    title="Ubah nama & warna"
                    className="p-2 rounded-lg bg-office-hover text-office-muted hover:text-office-text transition-colors min-h-[36px]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {/* Ruang bawaan tak bisa dihapus (juga dijaga server) — sembunyikan saja. */}
                  {!dept.is_system && (
                    <button
                      type="button"
                      onClick={() => removeRoom(dept.id)}
                      disabled={busyId === dept.id}
                      aria-label={`Hapus ${label(dept)}`}
                      title="Hapus ruang custom"
                      className="p-2 rounded-lg bg-office-hover text-office-danger hover:text-office-danger transition-colors min-h-[36px] disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {editingId === dept.id && (
                <div className="p-3 rounded-xl bg-office-elevated border border-office-accent/40 flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama ruang"
                    aria-label="Nama ruang"
                    maxLength={40}
                    className="bg-office-inset border border-office-border rounded-lg px-3 py-2 text-xs text-office-text min-h-[40px]"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      aria-label="Warna ruang"
                      className="h-9 w-11 rounded bg-office-inset border border-office-border cursor-pointer"
                    />
                    {ROOM_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Pilih warna ${c}`}
                        onClick={() => setEditColor(c)}
                        className={`w-6 h-6 rounded-full border-2 ${
                          editColor.toLowerCase() === c.toLowerCase()
                            ? 'border-office-text'
                            : 'border-office-border'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(dept.id)}
                      disabled={busyId === dept.id}
                      className="px-3 py-2 rounded-lg bg-office-accent text-office-on-accent text-[11px] font-bold min-h-[36px] disabled:opacity-50"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-2 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-muted min-h-[36px]"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}

          {adding ? (
            <div className="p-3 rounded-xl bg-office-elevated border border-office-accent/40 flex flex-col gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nama ruang baru (mis. Riset)"
                aria-label="Nama ruang baru"
                maxLength={40}
                className="bg-office-inset border border-office-border rounded-lg px-3 py-2 text-xs text-office-text min-h-[40px]"
                data-testid="new-room-name"
              />
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  aria-label="Warna ruang baru"
                  className="h-9 w-11 rounded bg-office-inset border border-office-border cursor-pointer"
                />
                <button
                  type="button"
                  onClick={addRoom}
                  disabled={busyId === null}
                  className="px-3 py-2 rounded-lg bg-office-accent text-office-on-accent text-[11px] font-bold min-h-[36px] disabled:opacity-50"
                >
                  Tambah
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="px-3 py-2 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-muted min-h-[36px]"
                >
                  Batal
                </button>
              </div>
              <span className="text-[10px] text-office-muted">
                Ruang baru muncul sebagai chip; agennya bekerja di meja fallback sampai denah
                diperluas (Tahap 13).
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setActionError(null);
              }}
              data-testid="add-room"
              className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-office-accent/50 text-xs font-bold text-office-accent-ink hover:bg-office-hover min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Tambah ruang baru
            </button>
          )}

          {actionError && (
            <div
              className="p-2 rounded-lg bg-office-danger/10 border border-office-danger/40 text-[10px] text-office-danger break-all"
              data-testid="rooms-manager-error"
            >
              {actionError}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-muted hover:text-office-text min-h-[44px]"
        >
          Tutup
        </button>
      </div>
    </div>
  );
};

export default RoomsManagerModal;
