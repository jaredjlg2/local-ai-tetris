import test from 'node:test';
import assert from 'node:assert/strict';
import {DecisionScheduler} from '../public/planner.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('mirror-match requests are FIFO while different models can infer concurrently',async()=>{
  const calls=[],scheduler=new DecisionScheduler((snapshot,model)=>new Promise(resolve=>calls.push({snapshot,model,resolve})));
  const a=scheduler.run('laya','left'),b=scheduler.run('laya','right'),c=scheduler.run('von','other');
  await flush();assert.deepEqual(calls.map(c=>c.snapshot),['left','other']);
  calls[0].resolve('A');await a;await flush();assert.equal(calls[2].snapshot,'right');
  calls[2].resolve('B');calls[1].resolve('C');assert.equal(await b,'B');assert.equal(await c,'C');
});
test('queued work cancelled by a match reset never calls the model; failures do not block the other side',async()=>{
  let reject,valid=true;const calls=[],scheduler=new DecisionScheduler(snapshot=>{calls.push(snapshot);if(snapshot==='first')return new Promise((_,r)=>reject=r);return 'done';});
  const first=scheduler.run('von','first').catch(()=>null),stale=scheduler.run('von','stale',()=>valid),next=scheduler.run('von','new match');
  await flush();valid=false;reject(new Error('test'));await first;assert.equal(await stale,null);assert.equal(await next,'done');assert.deepEqual(calls,['first','new match']);
});
