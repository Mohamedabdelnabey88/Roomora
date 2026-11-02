CREATE TABLE IF NOT EXISTS roomora_read_state (
  id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL DEFAULT 0,
  counters_initialized INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO roomora_read_state(id) VALUES(1);

CREATE TABLE IF NOT EXISTS request_status_counts (
  status TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0 CHECK(total>=0)
);

INSERT INTO request_status_counts(status,total)
  SELECT status,COUNT(*) FROM service_requests
  WHERE (SELECT counters_initialized FROM roomora_read_state WHERE id=1)=0
  GROUP BY status
  ON CONFLICT(status) DO UPDATE SET total=excluded.total;

UPDATE roomora_read_state SET counters_initialized=1 WHERE id=1 AND counters_initialized=0;

CREATE INDEX IF NOT EXISTS idx_requests_requested_utc ON service_requests(datetime(requested_at),id);

CREATE TRIGGER IF NOT EXISTS roomora_revision_rooms_insert AFTER INSERT ON rooms
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_rooms_update AFTER UPDATE ON rooms
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_rooms_delete AFTER DELETE ON rooms
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_stays_insert AFTER INSERT ON stays
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_stays_update AFTER UPDATE ON stays
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_stays_delete AFTER DELETE ON stays
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_stay_extensions_insert AFTER INSERT ON stay_extensions
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_stay_extensions_update AFTER UPDATE ON stay_extensions
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_stay_extensions_delete AFTER DELETE ON stay_extensions
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_reservations_insert AFTER INSERT ON reservations
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_reservations_update AFTER UPDATE ON reservations
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_reservations_delete AFTER DELETE ON reservations
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_service_requests_insert AFTER INSERT ON service_requests
BEGIN
  INSERT INTO request_status_counts(status,total) VALUES(NEW.status,1) ON CONFLICT(status) DO UPDATE SET total=total+1;
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_service_requests_update AFTER UPDATE ON service_requests
BEGIN
  UPDATE request_status_counts SET total=total-1 WHERE status=OLD.status AND OLD.status<>NEW.status;
    INSERT INTO request_status_counts(status,total) SELECT NEW.status,1 WHERE OLD.status<>NEW.status
    ON CONFLICT(status) DO UPDATE SET total=total+1;
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_service_requests_delete AFTER DELETE ON service_requests
BEGIN
  UPDATE request_status_counts SET total=total-1 WHERE status=OLD.status;
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_service_request_lines_insert AFTER INSERT ON service_request_lines
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_service_request_lines_update AFTER UPDATE ON service_request_lines
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_service_request_lines_delete AFTER DELETE ON service_request_lines
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_approval_requests_insert AFTER INSERT ON approval_requests
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_approval_requests_update AFTER UPDATE ON approval_requests
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_approval_requests_delete AFTER DELETE ON approval_requests
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_hotel_settings_insert AFTER INSERT ON hotel_settings
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_hotel_settings_update AFTER UPDATE ON hotel_settings
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_hotel_settings_delete AFTER DELETE ON hotel_settings
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_users_insert AFTER INSERT ON users
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_users_update AFTER UPDATE ON users
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_users_delete AFTER DELETE ON users
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_request_items_insert AFTER INSERT ON request_items
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_request_items_update AFTER UPDATE ON request_items
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_request_items_delete AFTER DELETE ON request_items
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_shifts_insert AFTER INSERT ON shifts
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_shifts_update AFTER UPDATE ON shifts
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS roomora_revision_shifts_delete AFTER DELETE ON shifts
BEGIN
  
  UPDATE roomora_read_state SET version=version+1 WHERE id=1;
END;
