import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOperations, invalidateOperationsRequests, startOperationsRefresh, OPERATIONS_CHANGED_EVENT } from '../lib/operations-events.ts';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function browser(t) {
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 const window=new EventTarget(),document=new EventTarget();document.visibilityState='visible';
 window.setInterval=(...args)=>globalThis.setInterval(...args);window.clearInterval=id=>globalThis.clearInterval(id);
 globalThis.window=window;globalThis.document=document;
 t.mock.timers.enable({apis:['Date','setInterval'],now:100000});
 t.after(()=>{globalThis.window=oldWindow;globalThis.document=oldDocument;t.mock.timers.reset();invalidateOperationsRequests();});
 return {window,document,tick:ms=>t.mock.timers.tick(ms)};
}

test('polling pauses in hidden tabs and foreground events coalesce',async t=>{
 const b=browser(t);let calls=0;const stop=startOperationsRefresh(async()=>{calls++;});t.after(stop);
 b.tick(60000);await flush();assert.equal(calls,1);
 b.document.visibilityState='hidden';b.document.dispatchEvent(new Event('visibilitychange'));b.tick(180000);await flush();assert.equal(calls,1);
 b.document.visibilityState='visible';b.document.dispatchEvent(new Event('visibilitychange'));b.window.dispatchEvent(new Event('focus'));b.window.dispatchEvent(new Event('pageshow'));await flush();assert.equal(calls,2);
 b.tick(1000);b.window.dispatchEvent(new Event('focus'));await flush();assert.equal(calls,2);
 stop();b.tick(120000);b.window.dispatchEvent(new Event(OPERATIONS_CHANGED_EVENT));await flush();assert.equal(calls,2);
});

test('operations refresh immediately and a change during an in-flight refresh is not lost',async t=>{
 const b=browser(t);let calls=0,release;
 const stop=startOperationsRefresh(()=>{calls++;return new Promise(resolve=>{release=resolve;});});t.after(stop);
 b.window.dispatchEvent(new Event(OPERATIONS_CHANGED_EVENT));assert.equal(calls,1);
 b.tick(180000);assert.equal(calls,1,'polls cannot overlap');
 b.window.dispatchEvent(new Event(OPERATIONS_CHANGED_EVENT));const first=release;first();await flush();assert.equal(calls,2,'a mutation gets a fresh read after the running read');
 stop();release();await flush();b.tick(120000);assert.equal(calls,2);
});

test('concurrent identical reads share a request and have independent response bodies',async()=>{
 invalidateOperationsRequests();let calls=0,release;
 const fetcher=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
 const a=fetchOperations('/api/rooms',{},fetcher),b=fetchOperations('/api/rooms',{},fetcher);assert.equal(calls,1);
 release(Response.json([{id:'101'}]));const responses=await Promise.all([a,b]);assert.deepEqual(await responses[0].json(),[{id:'101'}]);assert.deepEqual(await responses[1].json(),[{id:'101'}]);
 const c=fetchOperations('/api/rooms',{},fetcher);assert.equal(calls,2,'completed hotel data must not be cached');release(Response.json([]));await c;invalidateOperationsRequests();
});

test('writes never coalesce or retry',async()=>{
 invalidateOperationsRequests();let calls=0;const fetcher=async()=>{calls++;return Response.json({ok:true});};
 await Promise.all([fetchOperations('/api/stays',{method:'POST',body:'{}'},fetcher),fetchOperations('/api/stays',{method:'POST',body:'{}'},fetcher)]);assert.equal(calls,2);
});

test('quota failures pause read traffic for one minute and invalidate on session change',async t=>{
 t.mock.timers.enable({apis:['Date'],now:100000});t.after(()=>{t.mock.timers.reset();invalidateOperationsRequests();});
 invalidateOperationsRequests();let calls=0;
 const fetcher=async()=>{calls++;return Response.json({error:'d1_read_limit_exceeded'},{status:503});};
 assert.equal((await fetchOperations('/api/rooms',{},fetcher)).status,503);
 assert.equal((await fetchOperations('/api/requests',{},fetcher)).status,503);assert.equal(calls,1);
 t.mock.timers.tick(60001);await fetchOperations('/api/rooms',{},fetcher);assert.equal(calls,2);
 invalidateOperationsRequests();await fetchOperations('/api/auth/me',{},fetcher);assert.equal(calls,3);
});

test('an old in-flight response cannot delete a newer request or pause a new session',async()=>{
 invalidateOperationsRequests();let calls=0;const releases=[];const fetcher=()=>{calls++;return new Promise(resolve=>releases.push(resolve));};
 const a=fetchOperations('/api/rooms',{},fetcher);invalidateOperationsRequests();
 const b=fetchOperations('/api/rooms',{},fetcher);releases[0](Response.json({error:'d1_read_limit_exceeded'},{status:503}));await a;
 const c=fetchOperations('/api/rooms',{},fetcher);assert.equal(calls,2);
 releases[1](Response.json([]));await Promise.all([b,c]);invalidateOperationsRequests();
});

test('a successful write invalidates reads that started while the write was pending',async()=>{
 invalidateOperationsRequests();let calls=0,releaseRead,releaseWrite;
 const fetcher=(input,init)=>{calls++;return new Promise(resolve=>{if(init.method==='POST')releaseWrite=resolve;else releaseRead=resolve;});};
 const write=fetchOperations('/api/stays',{method:'POST'},fetcher);
 const oldRead=fetchOperations('/api/rooms',{},fetcher);const oldRelease=releaseRead;
 releaseWrite(Response.json({ok:true}));await write;
 const freshRead=fetchOperations('/api/rooms',{},fetcher);assert.equal(calls,3);
 releaseRead(Response.json([{id:'fresh'}]));assert.deepEqual(await (await freshRead).json(),[{id:'fresh'}]);
 oldRelease(Response.json([{id:'old'}]));await oldRead;invalidateOperationsRequests();
});
