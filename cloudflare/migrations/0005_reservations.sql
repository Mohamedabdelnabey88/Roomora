CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  checkin_at TEXT NOT NULL,
  checkout_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','checked_in','cancelled')),
  note TEXT,
  stay_id TEXT REFERENCES stays(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reservations_room_dates ON reservations(room_id,checkin_at,checkout_at,status);
CREATE INDEX IF NOT EXISTS idx_reservations_status_checkin ON reservations(status,checkin_at);
