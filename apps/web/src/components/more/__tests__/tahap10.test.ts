/**
 * Tahap 10 acceptance — ruang jadi data:
 *  - More screen punya pintu "Kelola Ruang Kantor" yang membuka RoomsManagerModal;
 *  - modal Kelola Ruang: testid, tambah ruang, edit nama/warna/urut/sembunyikan,
 *    tombol hapus hanya untuk ruang non-system (server juga menjaga 403/409);
 *  - chip ruang, denah, dan warna baju avatar ikut tabel departments;
 *  - select departemen di Reports & wizard rekrutmen ikut data, dengan fallback
 *    DEPARTMENTS statis;
 *  - api.ts punya empat endpoint departemen, skema publik ada di shared.
 *
 * Layout/wiring asserted on source; route behaviour covered by
 * apps/server/src/tahap10.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const more = read('../../../screens/More.tsx');
const rooms = read('../RoomsManagerModal.tsx');
const roomChips = read('../../office/RoomChips.tsx');
const map = read('../../office/Map.tsx');
const avatar = read('../../office/Avatar.tsx');
const reports = read('../../../screens/Reports.tsx');
const step2 = read('../../recruitment/Step2SpecForm.tsx');
const api = read('../../../services/api.ts');
const shared = read('../../../../../../packages/shared/src/schemas.ts');
const migration = read('../../../../../../apps/server/src/db/migrations/005_departments.sql');
const endpoints = read('../../../../../../packages/shared/src/endpoints.ts');

describe('More → Kelola Ruang Kantor', () => {
  it('exposes a Building2 shortcut that opens the rooms modal', () => {
    expect(more).toContain('Building2');
    expect(more).toContain('Kelola Ruang Kantor');
    expect(more).toContain('{departments.length} ruang • Nama, warna, urutan, sembunyikan');
    expect(more).toContain('const [isRoomsOpen, setIsRoomsOpen] = useState(false);');
    expect(more).toContain('<RoomsManagerModal');
  });
});

describe('RoomsManagerModal', () => {
  it('is findable by testid and can add a room', () => {
    expect(rooms).toContain('data-testid="rooms-manager"');
    expect(rooms).toContain('data-testid="add-room"');
    expect(rooms).toContain('data-testid="new-room-name"');
    expect(rooms).toContain('data-testid="rooms-manager-error"');
    expect(rooms).toContain('api.createDepartment(');
  });

  it('never offers delete for a seeded room, and saves edits through the API', () => {
    // The delete button is rendered inside the is_system guard only.
    expect(rooms).toContain('{!dept.is_system && (');
    expect(rooms).toContain('api.updateDepartment(');
    expect(rooms).toContain('api.deleteDepartment(');
    expect(rooms).toContain('sort_order: other.sort_order');
    expect(rooms).toContain('hidden: hidden ? 1 : 0');
  });
});

describe('office chrome follows the departments table', () => {
  it('builds the chip row from rooms, hiding the hidden ones', () => {
    expect(roomChips).toContain('function chipIds(departments:');
    expect(roomChips).toContain('.filter((d) => !d.hidden)');
    expect(roomChips).toContain("['all', ...rooms, 'lounge', 'approvalGate']");
    expect(roomChips).toContain('{ id: string; hidden: boolean }[]');
  });

  it('labels map rooms from data and dims hidden rooms', () => {
    expect(map).toContain('const roomLabel = (id: string)');
    expect(map).toContain('deptById[id]?.name ?? t(`rooms.${id}`)');
    expect(map).toContain('deptById[roomId]?.hidden ? 0.4 : 1');
    // Focusing a custom room (no rect on the map) dims nothing.
    expect(map).toContain('MAP_ROOM_IDS.includes(focusKey)');
  });

  it('paints the avatar shirt with the room colour as a fallback', () => {
    expect(avatar).toContain('function shirtOf(agent: OfficeAgent, deptColor?: string)');
    expect(avatar).toContain('s.departments.find((d) => d.id === agent.department)?.color');
  });
});

describe('department selects are data-driven', () => {
  it('Reports filters by live rooms with a static fallback', () => {
    expect(reports).toContain('.getDepartments()');
    expect(reports).toContain("import { api } from '../services/api';");
    expect(reports).toContain('DEPARTMENTS.map((id)');
    expect(reports).toContain('label: room.name ?? room.id');
  });

  it('the recruitment wizard offers live rooms too', () => {
    expect(step2).toContain('.getDepartments()');
    expect(step2).toContain("import { api } from '../../services/api';");
    expect(step2).toContain('? rooms.map((room) => room.id) : [...DEPARTMENTS]');
    expect(step2).toContain('?.name ?? id');
  });
});

describe('departments API & schema', () => {
  it('wires the four department endpoints in the client', () => {
    expect(api).toContain('getDepartments');
    expect(api).toContain("'/departments'");
    expect(api).toContain('createDepartment:');
    expect(api).toContain('updateDepartment:');
    expect(api).toContain('deleteDepartment:');
    expect(endpoints).toContain('/api/departments');
  });

  it('shares an open room shape with a nullable name', () => {
    expect(shared).toContain('export const DepartmentSchema = z.string().min(1);');
    expect(shared).toContain('export const OfficeDepartmentSchema');
    expect(shared).toContain('name: z.string().nullable()');
    expect(shared).toContain('hidden: z.boolean()');
  });

  it('seeds the eight rooms from the migration', () => {
    expect(migration).toContain('is_system INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('hidden INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('INSERT OR IGNORE INTO departments');
  });
});
