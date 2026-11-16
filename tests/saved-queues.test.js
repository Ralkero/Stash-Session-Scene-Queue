const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../saved-queues-core');
test('lookup requests use nullable individual lookups for missing IDs on this Stash fork', () => {
  const q=c.lookupRequest(['1','999999999']);
  assert.equal(q.query,'query($id0:ID!,$id1:ID!) { s0:findScene(id:$id0){id} s1:findScene(id:$id1){id} }');
  assert.deepEqual(q.variables,{id0:'1',id1:'999999999'});
});
function memory() { const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}; }
test('save/reopen/rename/save-as/delete preserve order and timestamps', () => {
  const storage=memory();let id=0,time=0;
  const store=c.createStore(storage,()=>String(++time),()=>String(++id));
  const saved=store.save('First',['3','1','3','2']);
  assert.deepEqual(saved.sceneIDs,['3','1','2']);
  assert.deepEqual(c.createStore(storage).list()[0],saved);
  const renamed=store.rename(saved.id,'Renamed'); assert.equal(renamed.createdAt,saved.createdAt); assert.notEqual(renamed.updatedAt,saved.updatedAt);
  store.save('Copy',['3']);store.save('Renamed',['2','1'],saved.id);
  assert.equal(store.list().length,2); assert.deepEqual(store.list()[0].sceneIDs,['2','1']);
  store.remove(saved.id);assert.equal(store.list()[0].name,'Copy');
});
test('unknown schema and corrupted records never get silently overwritten', () => {
  const storage=memory();
  for(const raw of ['{bad',JSON.stringify({schemaVersion:99,queues:[]}),JSON.stringify({schemaVersion:1,queues:[{id:'x'}]})]){
    storage.setItem(c.KEY,raw);assert.throws(()=>c.createStore(storage).save('A',['1']));assert.equal(storage.getItem(c.KEY),raw);
  }
});

test('future per-queue schemas remain untouched even in a known envelope', () => {
  const storage=memory();
  const raw=JSON.stringify({schemaVersion:1,queues:[{schemaVersion:2,type:'static',id:'q',name:'Future',sceneIDs:['1']}]});
  storage.setItem(c.KEY,raw);
  assert.throws(()=>c.createStore(storage).save('New',['2']),/preserved/);
  assert.equal(storage.getItem(c.KEY),raw);
});
test('large saved queues validate in bounded batches, preserve order and skip missing scenes', async () => {
  const queue={sceneIDs:Array.from({length:2518},(_,i)=>String(i+1))}, batches=[];
  const result=await c.validateQueue(queue,async ids=>{batches.push(ids);return ids.filter(x=>x!=='5').reverse();});
  assert.equal(batches.length,11);assert.ok(batches.every(x=>x.length<=250));assert.deepEqual(result.missingIDs,['5']);assert.deepEqual(result.sceneIDs,queue.sceneIDs.filter(x=>x!=='5'));
});
test('append deduplicates, replace preserves order, validation failure keeps session', async () => {
  let ids=['1','2'];const session={getSceneIDs:()=>ids.slice(),replace:value=>{ids=value.slice();},addMany:value=>{ids=c.ids(ids.concat(value));}};
  const queue={sceneIDs:['3','2','4']};
  await c.loadIntoSession(queue,'append',session,async x=>x);assert.deepEqual(ids,['1','2','3','4']);
  await c.loadIntoSession(queue,'replace',session,async x=>x);assert.deepEqual(ids,['3','2','4']);
  await assert.rejects(c.loadIntoSession(queue,'replace',session,async()=>{throw Error('offline');}),/offline/);assert.deepEqual(ids,['3','2','4']);
  await assert.rejects(c.loadIntoSession(queue,'replace',session,async()=>[]),/missing/);assert.deepEqual(ids,['3','2','4']);
});
test('in-flight session changes are not overwritten and storage failures are reported', async () => {
  let ids=['1'];const session={getSceneIDs:()=>ids.slice(),replace:()=>{},addMany:()=>{}};
  await assert.rejects(c.loadIntoSession({sceneIDs:['2']},'replace',session,async x=>{ids=['3'];return x;}),/changed/);
  await assert.rejects(c.loadIntoSession({sceneIDs:['2']},'replace',session,async x=>x),/could not be saved/);
  assert.deepEqual(ids,['3']);
});

test('navigation cancellation cannot commit a late queue load', async () => {
  const controller=new AbortController();let ids=['1'];
  const session={getSceneIDs:()=>ids.slice(),replace:value=>{ids=value;},addMany:value=>{ids=ids.concat(value);}};
  await assert.rejects(c.loadIntoSession({sceneIDs:['2']},'replace',session,async x=>{controller.abort();return x;},controller.signal),/cancelled/);
  assert.deepEqual(ids,['1']);
});
test('tabs reread latest saved lists and stale selected IDs cannot resurrect removals', () => {
  const storage=memory(),a=c.createStore(storage,()=>'',()=> 'a'),b=c.createStore(storage,()=>'',()=> 'b');
  a.save('A',['1']);b.save('B',['2']);assert.equal(a.list().length,2);
  b.remove('a');assert.throws(()=>a.save('A',['1'],'a'),/removed/);
  assert.throws(()=>b.save('B',['3']),/already exists/);
});

