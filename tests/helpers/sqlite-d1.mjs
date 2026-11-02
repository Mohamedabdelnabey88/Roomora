import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function createDatabase({ extraRooms = 0 } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_initial.sql','0002_auth_sessions.sql','0003_add_extra_mattress_request_item.sql','0004_expand_request_catalog.sql','0005_reservations.sql']) {
    sqlite.exec(readFileSync(new URL('../../cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  }
  sqlite.prepare('INSERT INTO users(id,name,username,password_hash,role) VALUES(?,?,?,?,?)').run('fixture-user','Test User','fixture-user','fixture-only','admin');
  const token = 'fixture-session-token';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  sqlite.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+12 hours'))").run('fixture-session','fixture-user',tokenHash);
  for (let i=0;i<extraRooms;i++) sqlite.prepare('INSERT INTO rooms(id,number,floor,room_type) VALUES(?,?,?,?)').run('extra-'+i,'extra-'+i,5,'مفردة');
  const statements=[];
  function prepare(sql, params=[]) {
    const ordered=[];
    const query=sql.replace(/\?(\d+)/g,(_,n)=>{ordered.push(params[Number(n)-1]);return '?';});
    return {
      bind(...values){return prepare(sql,values);},
      async first(){statements.push({sql,params});return sqlite.prepare(query).get(...ordered)??null;},
      async all(){statements.push({sql,params});return {results:sqlite.prepare(query).all(...ordered)};},
      async run(){statements.push({sql,params});return {success:true,meta:sqlite.prepare(query).run(...ordered)};}
    };
  }
  const DB={ prepare,async batch(items){return Promise.all(items.map(s=>s.run()));} };
  return {sqlite,DB,statements,env:{DB},token,
    request(path,init={}){return new Request('https://example.test'+path,{...init,headers:{authorization:'Bearer '+token,...init.headers}});},
    reset(){statements.length=0;},close(){sqlite.close();}};
}
