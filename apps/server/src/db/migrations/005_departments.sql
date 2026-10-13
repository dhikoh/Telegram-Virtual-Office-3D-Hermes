-- Tahap 10 (docs/DESIGN_DIRECTION.md §5, keputusan 7.10): departments as data.
--
-- The eight rooms stop being a compile-time enum: the owner can rename them,
-- recolor them, reorder the chip row, hide a room, and add custom rooms from
-- the More screen. Agents keep their department as a plain string that must
-- resolve to one of these rows (validated at every write).
--
--   name        NULL -> UI falls back to the i18n label (office.rooms.<id>)
--   color       chip accent + avatar shirt for the room
--   sort_order  chip row order between "all" and the fixed lounge/gate tail
--   is_system   the eight seeded rooms (custom rooms are deletable)
--   hidden      1 -> chip hidden from the office UI (agents may still live there)

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Seed the eight original rooms in chip order (command, social, sales,
-- finance, marketing, analytics, support, hr) with the layout colors so the
-- map's static diorama and the data-driven chips agree (Rule 9.1).
INSERT OR IGNORE INTO departments (id, name, color, sort_order, is_system, hidden, created_at)
SELECT * FROM (
  SELECT 'command' AS id, NULL AS name, '#22D3EE' AS color, 10 AS sort_order, 1 AS is_system, 0 AS hidden, CAST(strftime('%s','now') AS INTEGER) * 1000 AS created_at
  UNION ALL SELECT 'social', NULL, '#8B5CF6', 20, 1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
  UNION ALL SELECT 'sales', NULL, '#34D399', 30, 1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
  UNION ALL SELECT 'finance', NULL, '#FBBF24', 40, 1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
  UNION ALL SELECT 'marketing', NULL, '#EC4899', 50, 1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
  UNION ALL SELECT 'analytics', NULL, '#38BDF8', 60, 1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
  UNION ALL SELECT 'support', NULL, '#A78BFA', 70, 1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
  UNION ALL SELECT 'hr', NULL, '#F43F5E', 80, 1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
);
