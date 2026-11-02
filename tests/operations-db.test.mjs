import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare/src/index.ts';
import { createDatabase } from './helpers/sqlite-d1.mjs';

function seedHotel(f) {
  const {sqlite}=f;
  sqlite.prepare("INSERT INTO stays(id,room_id,guest_name,checkin_at,expected_checkout_at,status) VALUES(?,?,?,?,?,'in_house')").run('stay-101','101','Current Guest','2026-11-01T12:00:00Z','2026-11-05T12:00:00Z');
  const booking=sqlite.prepare("INSERT INTO reservations(id,room_id,guest_name,checkin_at,checkout_at,status) VALUES(?,?,?,?,?,?)");
  booking.run('overlap','102','Booked Guest','2026-11-04T12:00:00Z','2026-11-06T12:00:00Z','booked');
  booking.run('edge','103','Boundary Guest','2026-11-06T12:00:00Z','2026-11-07T12:00:00Z','booked');
  booking.run('cancelled','104','Cancelled Guest','2026-11-04T12:00:00Z','2026-11-06T12:00:00Z','cancelled');
  sqlite.prepare("UPDATE rooms SET operational_status='out_of_service' WHERE id='105'").run();
  const req=sqlite.prepare("INSERT INTO service_requests(id,stay_id,room_id,status,business_day) VALUES(?,?,?,?,?)");
  for(const [id,status] of [['r1','new'],['r2','approval_required'],['r3','delivered'],['r4','cancelled']])req.run(id,'stay-101','101',status,'2026-11-02');
}

for(const extraRooms of [0,100])test(`calendar data uses three bulk queries for ${49+extraRooms} rooms`,async()=>{
  const f=createDatabase({extraRooms});try{
    seedHotel(f);
    for(let i=0;i<105;i++) f.sqlite.prepare("INSERT INTO reservations(id,room_id,guest_name,checkin_at,checkout_at,status) VALUES(?,?,?,?,?,'booked')").run('limit-'+i,'106','Limit Guest',`2027-01-01T${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}:00Z`,'2027-01-03T12:00:00Z');
    let response=await worker.fetch(f.request('/api/reservations/calendar'),f.env);assert.equal(response.status,200);
    const rows=await response.json();assert.equal(rows.length,49+extraRooms);
    assert.equal(rows.find(r=>r.id==='101').activeStay.guest_name,'Current Guest');
    assert.equal(rows.find(r=>r.id==='102').reservations[0].id,'overlap');
    assert.equal(rows.find(r=>r.id==='104').reservations.length,0);
    assert.equal(rows.find(r=>r.id==='106').reservations.length,100);
    assert.ok(!('room_id' in rows.find(r=>r.id==='101').activeStay));
    const ddl=f.statements.filter(x=>/CREATE /i.test(x.sql));assert.ok(ddl.some(row=>row.sql.includes("CREATE TRIGGER")));
    f.reset();response=await worker.fetch(f.request('/api/reservations/calendar'),f.env);assert.equal(response.status,200);
    assert.equal(f.statements.length,2,'a warm cache performs only authorization and revision reads');
    assert.equal(f.statements.filter(x=>/CREATE /i.test(x.sql)).length,0,'schema is not rebuilt on refresh');
  }finally{f.close();}
});

test('availability preserves overlap, exact date boundaries and unavailable rooms',async()=>{
 const f=createDatabase();try{
  seedHotel(f);const path='/api/reservations/availability?from=2026-11-04T12:00:00Z&to=2026-11-06T12:00:00Z';
  const response=await worker.fetch(f.request(path),f.env);assert.equal(response.status,200);const rows=await response.json();
  assert.match(rows.find(r=>r.id==='101').reason,/إقامة حالية/);
  assert.equal(rows.find(r=>r.id==='102').reason,'حجز متداخل');
  assert.equal(rows.find(r=>r.id==='103').available,true,'a booking starting at checkout does not overlap');
  assert.equal(rows.find(r=>r.id==='104').available,true,'cancelled bookings do not block');
  assert.equal(rows.find(r=>r.id==='105').reason,'الغرفة خارج الخدمة');
  f.reset();assert.equal((await worker.fetch(f.request(path),f.env)).status,200);assert.equal(f.statements.length,2);
 }finally{f.close();}
});

test('room aggregates count active requests only for the current stay',async()=>{
 const f=createDatabase();try{
  seedHotel(f);let response=await worker.fetch(f.request('/api/rooms'),f.env);assert.equal(response.status,200);let rows=await response.json();
  assert.equal(rows.find(r=>r.id==='101').open_requests,2);assert.equal(rows.find(r=>r.id==='102').open_requests,0);assert.equal(rows.length,49);
  const sql=f.statements.find(s=>s.sql.includes('COALESCE(open_requests')).sql;
  f.reset();response=await worker.fetch(f.request('/api/rooms'),f.env);assert.equal(response.status,200);assert.equal(f.statements.length,2);
  const plan=f.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail).join('\n');
  assert.ok(!plan.includes('CORRELATED SCALAR SUBQUERY'),'request counting must not rescan history for every room');
 }finally{f.close();}
});

test('session permissions stay live and last-seen writes occur at most once per five minutes',async()=>{
 const f=createDatabase();try{
  for(let i=0;i<5;i++){const r=await worker.fetch(f.request('/api/auth/me'),f.env);assert.equal(r.status,200);assert.ok(!('last_seen_at' in (await r.json()).user));}
  assert.equal(f.statements.filter(x=>/UPDATE sessions/.test(x.sql)).length,0);
  f.sqlite.exec("UPDATE sessions SET last_seen_at=datetime('now','-10 minutes')");f.reset();
  for(let i=0;i<5;i++)assert.equal((await worker.fetch(f.request('/api/auth/me'),f.env)).status,200);
  assert.equal(f.statements.filter(x=>/UPDATE sessions/.test(x.sql)).length,1);
  f.sqlite.exec('UPDATE users SET active=0');assert.equal((await worker.fetch(f.request('/api/auth/me'),f.env)).status,401);
 }finally{f.close();}
});

test('unauthenticated reservation calls cannot initialize database schema',async()=>{
 const f=createDatabase();try{const r=await worker.fetch(new Request('https://example.test/api/reservations/calendar'),f.env);assert.equal(r.status,401);assert.equal(f.statements.length,0);}finally{f.close();}
});
