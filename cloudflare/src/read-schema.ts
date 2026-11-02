// Runtime fallback for Git deployments; migration 0007 contains the same schema.
// All table and event names below are constants, never request input.
export function cacheSchemaStatements(): string[] {
  const statements = [
    `CREATE TABLE IF NOT EXISTS roomora_read_state (
      id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL DEFAULT 0,
      counters_initialized INTEGER NOT NULL DEFAULT 0
    )`,
    "INSERT OR IGNORE INTO roomora_read_state(id) VALUES(1)",
    `CREATE TABLE IF NOT EXISTS request_status_counts (
      status TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0 CHECK(total>=0)
    )`,
    `INSERT INTO request_status_counts(status,total)
      SELECT status,COUNT(*) FROM service_requests
      WHERE (SELECT counters_initialized FROM roomora_read_state WHERE id=1)=0
      GROUP BY status ON CONFLICT(status) DO UPDATE SET total=excluded.total`,
    "UPDATE roomora_read_state SET counters_initialized=1 WHERE id=1 AND counters_initialized=0",
    "CREATE INDEX IF NOT EXISTS idx_requests_requested_utc ON service_requests(datetime(requested_at),id)"
  ];
  const tables=["rooms","stays","stay_extensions","reservations","service_requests","service_request_lines","approval_requests","hotel_settings","users","request_items","shifts"];
  for(const table of tables){
    for(const event of ["INSERT","UPDATE","DELETE"]){
      let counter="";
      if(table==="service_requests"){
        if(event==="INSERT")counter="INSERT INTO request_status_counts(status,total) VALUES(NEW.status,1) ON CONFLICT(status) DO UPDATE SET total=total+1;";
        if(event==="DELETE")counter="UPDATE request_status_counts SET total=total-1 WHERE status=OLD.status;";
        if(event==="UPDATE")counter=`UPDATE request_status_counts SET total=total-1 WHERE status=OLD.status AND OLD.status<>NEW.status;
          INSERT INTO request_status_counts(status,total) SELECT NEW.status,1 WHERE OLD.status<>NEW.status
          ON CONFLICT(status) DO UPDATE SET total=total+1;`;
      }
      statements.push(`CREATE TRIGGER IF NOT EXISTS roomora_revision_${table}_${event.toLowerCase()} AFTER ${event} ON ${table}
        BEGIN ${counter} UPDATE roomora_read_state SET version=version+1 WHERE id=1; END`);
    }
  }
  return statements;
}
