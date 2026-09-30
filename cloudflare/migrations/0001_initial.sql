PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hotel_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), hotel_name TEXT NOT NULL DEFAULT 'Roomora', timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  business_day_start TEXT NOT NULL DEFAULT '06:00', default_checkout_time TEXT NOT NULL DEFAULT '12:00', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO hotel_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','reception')), active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, floor INTEGER NOT NULL, room_type TEXT NOT NULL,
  operational_status TEXT NOT NULL DEFAULT 'available' CHECK(operational_status IN ('available','occupied','cleaning','maintenance','out_of_service')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stays (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), guest_name TEXT NOT NULL, guest_phone TEXT,
  checkin_at TEXT NOT NULL, expected_checkout_at TEXT NOT NULL, actual_checkout_at TEXT,
  status TEXT NOT NULL DEFAULT 'in_house' CHECK(status IN ('in_house','checked_out','cancelled')),
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stays_room_status ON stays(room_id,status);

CREATE TABLE IF NOT EXISTS stay_extensions (
  id TEXT PRIMARY KEY, stay_id TEXT NOT NULL REFERENCES stays(id), previous_checkout_at TEXT NOT NULL, new_checkout_at TEXT NOT NULL,
  reason TEXT, changed_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS request_items (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL DEFAULT 'قطعة', max_per_request INTEGER,
  max_per_business_day INTEGER, max_per_stay INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY, stay_id TEXT NOT NULL REFERENCES stays(id), room_id TEXT NOT NULL REFERENCES rooms(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','acknowledged','preparing','delivered','cancelled','approval_required')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','warning','critical')),
  business_day TEXT NOT NULL, requested_by TEXT REFERENCES users(id), acknowledged_by TEXT REFERENCES users(id), delivered_by TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, delivered_at TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_day_room ON service_requests(business_day, room_id, status);

CREATE TABLE IF NOT EXISTS service_request_lines (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES request_items(id), quantity INTEGER NOT NULL CHECK(quantity > 0)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY, service_request_id TEXT NOT NULL REFERENCES service_requests(id), reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  decided_by TEXT REFERENCES users(id), decision_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, start_time TEXT NOT NULL, end_time TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO shifts (id,name,start_time,end_time) VALUES
('morning','الصباحية','06:00','14:00'),('evening','المسائية','14:00','22:00'),('night','الليلية','22:00','06:00');

INSERT OR IGNORE INTO request_items (id,name,unit,max_per_request,max_per_business_day,max_per_stay) VALUES
('water','مياه','عبوة',6,12,30),('pillow','مخدة','قطعة',2,2,4),('blanket','بطانية','قطعة',1,2,3),('sheet','شرشف','قطعة',2,3,6),
('towel','منشفة','قطعة',4,6,12),('toothbrush','فرشاة أسنان','قطعة',2,4,8),('soap','صابون','قطعة',3,4,10),('shampoo','شامبو','عبوة',3,4,10);

INSERT OR IGNORE INTO rooms (id,number,floor,room_type) VALUES
('G1','G1',0,'غرفة وصالة'),('G2','G2',0,'غرفة وصالة'),
('101','101',1,'غرفة وصالة'),('102','102',1,'غرفة وصالة'),('103','103',1,'غرفة وصالة'),('104','104',1,'غرفة وصالة'),('105','105',1,'غرفتين وصالة'),('106','106',1,'مفردة'),('107','107',1,'VIP'),('108','108',1,'غرفة وصالة'),('109','109',1,'غرفة وصالة'),('110','110',1,'غرفة وصالة'),('111','111',1,'غرفة وصالة'),('112','112',1,'مفردة'),
('201','201',2,'غرفة وصالة'),('202','202',2,'غرفة وصالة'),('203','203',2,'غرفة وصالة'),('204','204',2,'غرفة وصالة'),('205','205',2,'غرفتين وصالة'),('206','206',2,'مفردة'),('207','207',2,'VIP'),('208','208',2,'غرفة وصالة'),('209','209',2,'غرفة وصالة'),('210','210',2,'غرفة وصالة'),('211','211',2,'غرفة وصالة'),('212','212',2,'مفردة'),
('301','301',3,'غرفة وصالة'),('302','302',3,'غرفة وصالة'),('303','303',3,'غرفة وصالة'),('304','304',3,'غرفة وصالة'),('305','305',3,'غرفتين وصالة'),('306','306',3,'مفردة'),('307','307',3,'VIP'),('308','308',3,'غرفة وصالة'),('309','309',3,'غرفة وصالة'),('310','310',3,'غرفة وصالة'),('311','311',3,'غرفة وصالة'),('312','312',3,'مفردة'),
('401','401',4,'غرفة وصالة'),('402','402',4,'غرفة وصالة'),('403','403',4,'غرفة وصالة'),('404','404',4,'غرفة وصالة'),('405','405',4,'غرفتين وصالة'),('406','406',4,'مفردة'),('407','407',4,'VIP'),('408','408',4,'غرفة وصالة'),('409','409',4,'غرفة وصالة'),('410','410',4,'غرفة وصالة'),('411','411',4,'غرفتين وصالة');