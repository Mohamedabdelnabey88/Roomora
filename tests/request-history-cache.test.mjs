import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker from '../cloudflare/src/index.ts';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { requestFilterQuery, riyadhDateKey } from '../lib/request-query.ts';

function seed(f,count=60){
 f.sqlite.prepare("INSERT INTO stays(id,room_id,guest_name,checkin_at,expected_checkout_at) VALUES('stay-101','101','نزيل أحمد','2026-11-01T12:00:00Z','2026-12-01T12:00:00Z')").run();
 const insert=f.sqlite.prepare('INSERT INTO service_requests(id,stay_id,room_id,status,business_day,requested_at) VALUES(?,?,?,?,?,?)');
 for(let i=0;i<count;i++)insert.run('history-'+String(i).padStart(3,'0'),'stay-101','101',i<5?'new':'delivered','2026-11-02','2026-11-02T'+String(Math.floor(i/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0')+':00Z');
 if(count>10)f.sqlite.prepare("INSERT INTO service_request_lines(id,request_id,item_id,quantity) VALUES('line-1','history-010','water',2)").run();
}
async function list(f,query='scope=active'){
 const response=await worker.fetch(f.request('/api/requests?paged=1&'+query),f.env);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return {response,body:await response.json()};
}

test('active view does not fetch historical records and counters include the full history',async()=>{
 const f=createDatabase();try{seed(f);const {body}=await list(f);assert.equal(body.items.length,5);assert.ok(body.items.every(r=>r.status==='new'));assert.equal(body.counts.completed,55);assert.equal(body.counts.active,5);assert.equal(body.role,'admin');assert.equal(body.hasMore,false);
 const sql=f.statements.find(r=>r.sql.includes('WITH selected AS')).sql;assert.ok(sql.indexOf('LIMIT')<sql.indexOf('LEFT JOIN service_request_lines'),'joins must apply only to selected page records');
 }finally{f.close();}
});

test('cursor pagination has no duplicates or gaps even at identical timestamps',async()=>{
 const f=createDatabase();try{seed(f);f.sqlite.exec("UPDATE service_requests SET requested_at='2026-11-02T12:00:00Z'");let cursor='',seen=[];
 do{const {body}=await list(f,'scope=all&page_size=17'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.ok(body.items.length<=17);seen.push(...body.items.map(r=>r.id));cursor=body.nextCursor||'';assert.equal(body.hasMore,Boolean(cursor));}while(cursor);
 assert.equal(seen.length,60);assert.equal(new Set(seen).size,60);
 }finally{f.close();}
});

test('server filtering supports history status, literal search and Riyadh date boundaries',async()=>{
 const f=createDatabase();try{seed(f);
 f.sqlite.prepare("UPDATE service_requests SET requested_at=? WHERE id=?").run('2026-11-01T21:00:00Z','history-010');
 let result=await list(f,'scope=completed&q='+encodeURIComponent('مياه')+'&from=2026-11-02&to=2026-11-02');assert.equal(result.body.items.length,1);assert.equal(result.body.items[0].id,'history-010');
 result=await list(f,'scope=all&q='+encodeURIComponent("%' OR 1=1 --"));assert.equal(result.body.items.length,0);
 result=await list(f,'scope=all&status=new');assert.equal(result.body.items.length,5);
 for(const query of ['from=2026-02-30','from=2026-11-03&to=2026-11-02','cursor=invalid','page_size=100000','status=unknown']){
  const response=await worker.fetch(f.request('/api/requests?paged=1&'+query),f.env);assert.equal(response.status,400,query);
 }
 }finally{f.close();}
});

test('cached reads still authorize every call and expire after fifteen seconds',async t=>{
 const f=createDatabase();try{seed(f);t.mock.timers.enable({apis:['Date'],now:Date.now()});t.after(()=>t.mock.timers.reset());
 let {response}=await list(f);assert.equal(response.headers.get('x-roomora-cache'),'MISS');f.reset();
 ({response}=await list(f));assert.equal(response.headers.get('x-roomora-cache'),'HIT');assert.equal(f.statements.length,2);assert.match(f.statements[0].sql,/FROM sessions/);
 t.mock.timers.tick(15001);({response}=await list(f));assert.equal(response.headers.get('x-roomora-cache'),'MISS');
 f.sqlite.exec('UPDATE users SET active=0');const denied=await worker.fetch(f.request('/api/requests?paged=1&scope=active'),f.env);assert.equal(denied.status,401);
 }finally{f.close();}
});

test('database triggers invalidate another isolate cache and update counters atomically',async()=>{
 const f=createDatabase();try{seed(f);const other={...f,env:{DB:{...f.DB}}};
 await list(f);await list(other);assert.equal((await list(other)).response.headers.get('x-roomora-cache'),'HIT');
 f.sqlite.exec("UPDATE service_requests SET status='delivered' WHERE id='history-000'");
 let result=await list(other);assert.equal(result.response.headers.get('x-roomora-cache'),'MISS');assert.equal(result.body.counts.active,4);assert.equal(result.body.counts.completed,56);assert.equal(result.body.items.length,4);
 const version=f.sqlite.prepare('SELECT version FROM roomora_read_state').get().version;
 f.sqlite.exec('BEGIN');f.sqlite.exec("UPDATE service_requests SET status='new' WHERE id='history-010'");f.sqlite.exec('ROLLBACK');
 assert.equal(f.sqlite.prepare('SELECT version FROM roomora_read_state').get().version,version);assert.equal((await list(other)).response.headers.get('x-roomora-cache'),'HIT');
 f.sqlite.exec("DELETE FROM service_requests WHERE id='history-001'");result=await list(other);assert.equal(result.body.counts.active,3);assert.equal(result.body.counts.completed,56);
 }finally{f.close();}
});

test('counter initialization is idempotent and caches are separated by database and role',async()=>{
 const f=createDatabase(),g=createDatabase();try{seed(f);seed(g,10);await list(f);assert.equal((await list(g)).body.counts.completed,5);
 const other={...f,env:{DB:{...f.DB}}};assert.equal((await list(other)).body.counts.completed,55,'cold isolate must not double counters');
 f.sqlite.prepare("INSERT INTO users(id,name,username,password_hash,role) VALUES('staff','Staff','staff','fixture','reception')").run();
 const hash=createHash('sha256').update('staff-token').digest('hex');f.sqlite.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES('staff-session','staff',?,datetime('now','+12 hours'))").run(hash);
 await list(f);const staff=await worker.fetch(new Request('https://example.test/api/requests?paged=1&scope=active',{headers:{authorization:'Bearer staff-token'}}),f.env);assert.equal(staff.headers.get('x-roomora-cache'),'MISS');assert.equal((await staff.json()).role,'reception');
 f.sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0007_request_paging_cache.sql',import.meta.url),'utf8'));assert.equal((await list(f)).body.counts.completed,55,'running the migration after runtime initialization must be safe');
 }finally{f.close();g.close();}
});

test('counter triggers roll back when a batched write fails',async()=>{
 const f=createDatabase();try{seed(f);await list(f);const before=f.sqlite.prepare('SELECT version FROM roomora_read_state').get().version;
 await assert.rejects(f.DB.batch([f.DB.prepare("UPDATE service_requests SET status='new' WHERE id='history-010'"),f.DB.prepare("INSERT INTO rooms(id,number,floor,room_type) VALUES('101','101',1,'duplicate')")]));
 assert.equal(f.sqlite.prepare('SELECT version FROM roomora_read_state').get().version,before);assert.equal((await list(f)).body.counts.completed,55);
 }finally{f.close();}
});

test('client filters generate the selected scope and local date range without loading history',()=>{
 const initial={scope:'active',status:'all',query:'',quickFilter:'active',dateMode:'all',dateFrom:'',dateTo:''};
 let parsed=new URLSearchParams(requestFilterQuery(initial,'2026-11-02').query);assert.equal(parsed.get('scope'),'active');assert.equal(parsed.get('paged'),'1');assert.equal(parsed.get('page_size'),'25');
 parsed=new URLSearchParams(requestFilterQuery({...initial,dateMode:'month'},'2026-02-08').query);assert.equal(parsed.get('from'),'2026-02-01');assert.equal(parsed.get('to'),'2026-02-28');
 assert.equal(riyadhDateKey(new Date('2026-11-01T21:00:00Z')),'2026-11-02');assert.ok(requestFilterQuery({...initial,dateMode:'custom'},'2026-11-02').error);
});

test('concurrent cache misses share one data query and preserve the legacy array response',async()=>{
 const f=createDatabase();try{seed(f);await list(f);f.sqlite.exec("UPDATE rooms SET operational_status='maintenance' WHERE id='102'");f.reset();
 const [a,b]=await Promise.all([list(f),list(f)]);assert.deepEqual(a.body,b.body);assert.equal(f.statements.filter(s=>s.sql.includes('WITH selected AS')).length,1);
 const legacy=await worker.fetch(f.request('/api/requests?scope=all'),f.env);assert.equal(legacy.status,200);assert.ok(Array.isArray(await legacy.json()));
 }finally{f.close();}
});

test('data read failures are not cached and room changes invalidate room responses',async()=>{
 const f=createDatabase();try{seed(f);await list(f);
 let rooms=await worker.fetch(f.request('/api/rooms'),f.env);assert.equal(rooms.headers.get('x-roomora-cache'),'MISS');
 rooms=await worker.fetch(f.request('/api/rooms'),f.env);assert.equal(rooms.headers.get('x-roomora-cache'),'HIT');
 f.sqlite.exec("UPDATE rooms SET operational_status='maintenance' WHERE id='102'");
 rooms=await worker.fetch(f.request('/api/rooms'),f.env);assert.equal(rooms.headers.get('x-roomora-cache'),'MISS');assert.equal((await rooms.json()).find(r=>r.id==='102').operational_status,'maintenance');
 const original=f.DB.prepare;let fail=true;f.DB.prepare=(sql)=>{if(sql.includes('WITH selected AS')&&fail){fail=false;throw new Error('D1_ERROR: fixture data read failure');}return original(sql);};
 const failed=await worker.fetch(f.request('/api/requests?paged=1&scope=active'),f.env);assert.equal(failed.status,503);
 const recovered=await list(f);assert.equal(recovered.response.headers.get('x-roomora-cache'),'MISS');assert.equal(recovered.body.items.length,5);
 }finally{f.close();}
});

test('history selection uses the date index before joining request details',async()=>{
 const f=createDatabase();try{seed(f);await list(f,'scope=all');const selected=f.statements.find(s=>s.sql.includes('WITH selected AS'));
 const plan=await f.DB.prepare('EXPLAIN QUERY PLAN '+selected.sql).bind(...selected.params).all();assert.match(plan.results.map(r=>r.detail).join('\n'),/idx_requests_requested_utc/);
 }finally{f.close();}
});
