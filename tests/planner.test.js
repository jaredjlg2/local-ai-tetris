import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,emptyBoard,shortlist,placements,placed,valid} from '../public/engine.js';
import {DecisionPipeline,predictNext,boardKey,plannedAction} from '../public/planner.js';
import {SurvivalMatch} from '../public/match.js';
const choose=g=>({selected:shortlist(g.board,g.active)[0],latencyMs:10});
const play=(g,result)=>{for(const a of result.selected.path){if(a==='drop')g.drop();else assert.ok(g.move(a));}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function single(request){const p=new DecisionPipeline(request);p.depth=1;return p;}

test('next inference starts during current move and is reused only on its predicted board',async()=>{
  const calls=[];const pipeline=single(g=>new Promise(resolve=>calls.push({g,resolve})));
  const game=new Game({random:()=>.5});const firstPromise=pipeline.get(game);await flush();
  calls[0].resolve(choose(calls[0].g));const first=await firstPromise;
  pipeline.prepare(game,first);await flush();assert.equal(calls.length,2);assert.equal(game.pieces,0,'next inference overlaps current piece');
  calls[1].resolve(choose(calls[1].g));await flush();
  play(game,first);const next=await pipeline.get(game);
  assert.equal(next.prepared,true);assert.equal(next.readyBeforeNeeded,true);assert.equal(pipeline.hits,1);assert.equal(calls.length,2);
  play(game,next);assert.equal(game.pieces,2);
});
test('prediction includes line collapse and correct next spawn',()=>{
  const game=new Game();game.board=emptyBoard();for(let y=16;y<20;y++)game.board[y]=Array.from({length:10},(_,x)=>x===5?0:'G');
  game.active={type:'I',r:1,x:3,y:0};const result=choose(game),predicted=predictNext(game,result.selected);
  play(game,result);assert.ok(game.lines>0);assert.equal(boardKey(game),boardKey(predicted));
});
test('board changes discard a speculative plan even if the next piece is the same',async()=>{
  let calls=0;const p=single(async g=>{calls++;return choose(g);});
  const g=new Game(),first=await p.get(g);p.prepare(g,first);await flush();play(g,first);g.board[19][9]=g.board[19][9]?0:'G';
  const next=await p.get(g);assert.equal(next.prepared,false);assert.equal(calls,3);assert.equal(p.discarded,1);
});
test('pause/reset invalidates an in-flight answer and disabling ahead makes no speculative call',async()=>{
  let resolve;const p=new DecisionPipeline(()=>new Promise(r=>resolve=r)),g=new Game();
  const pending=p.get(g);await flush();p.invalidate();resolve(choose(g));assert.equal(await pending,null);
  let calls=0;const q=new DecisionPipeline(async g=>{calls++;return choose(g);});q.enabled=false;
  const result=await q.get(g);q.prepare(g,result);await flush();assert.equal(calls,1);assert.equal(q.future,null);
});
test('hold changes serial and cannot consume a predicted next-piece plan',async()=>{
  const p=single(async g=>choose(g)),g=new Game();const first=await p.get(g);p.prepare(g,first);await flush();g.hold();
  const result=await p.get(g);assert.equal(result.prepared,false);
});
test('failed speculation retries when the next piece actually needs a decision',async()=>{
  let calls=0;const p=single(async g=>{calls++;if(calls===2)throw new Error('temporary failure');return choose(g);});
  const g=new Game(),first=await p.get(g);p.prepare(g,first);await flush();play(g,first);
  assert.equal((await p.get(g)).prepared,false);assert.equal(calls,3);
});
test('survival has identical independent bags and garbage, and both boards obey the same gravity',()=>{
  const m=new SurvivalMatch({seed:773,garbage:4});assert.deepEqual(m.human.board,m.ai.board);assert.deepEqual(m.human.active,m.ai.active);assert.deepEqual(m.human.queue,m.ai.queue);
  m.tick(1000,2);assert.equal(m.human.active.y,2);assert.equal(m.ai.active.y,2);assert.equal(m.elapsed,1000);
  const queue=m.ai.queue.slice();m.act('human','drop');assert.deepEqual(m.ai.queue,queue,'human actions do not mutate AI bag');
  m.act('ai','drop');assert.deepEqual(m.human.active,m.ai.active);assert.deepEqual(m.human.queue,m.ai.queue);
});
test('survival declares winner, freezes result and supports simultaneous top-out',()=>{
  const m=new SurvivalMatch();m.human.over=true;assert.equal(m.judge(),'laya');m.ai.over=true;assert.equal(m.judge(),'laya');
  m.tick(1000,20);assert.equal(m.elapsed,0);assert.equal(m.act('human','drop'),false);
  const draw=new SurvivalMatch();draw.human.over=true;draw.ai.over=true;assert.equal(draw.judge(),'draw');
});

test('three chained decisions gate accelerated descent, then one is consumed and refilled',async()=>{
  const calls=[],p=new DecisionPipeline(g=>new Promise(resolve=>calls.push({g,resolve}))),g=new Game({random:()=>.5});
  const firstPromise=p.get(g);await flush();calls[0].resolve(choose(calls[0].g));const first=await firstPromise;
  p.prepare(g,first);await flush();
  const plan={...first.selected,serial:g.serial,entry:{result:first},expectedNext:boardKey(predictNext(g,first.selected))};
  for(let i=0;i<20;i++){const step=plannedAction(g,plan,p);if(step.waiting)break;assert.ok(!['drop','down'].includes(step.action));g.move(step.action);}
  assert.equal(plannedAction(g,plan,p).waiting,true);assert.equal(g.pieces,0);
  for(let i=1;i<=3;i++){
    assert.equal(calls.length,i+1);calls[i].resolve(choose(calls[i].g));await flush();
    assert.equal(p.readyCount(g,first),i);
    if(i<3)assert.equal(plannedAction(g,plan,p).waiting,true);
  }
  assert.equal(calls.length,4,'never speculates beyond three upcoming moves');
  assert.equal(plannedAction(g,plan,p).action,'drop');g.drop();
  const next=await p.get(g);assert.equal(next.prepared,true);assert.equal(p.readyCount(g,next),2);
  p.prepare(g,next);await flush();assert.equal(calls.length,5,'replenishes exactly one consumed decision');
  calls[4].resolve(choose(calls[4].g));await flush();assert.equal(p.readyCount(g,next),3);
});

test('natural gravity can lock safely before reserve fills without discarding a valid prediction',async()=>{
  const calls=[],p=new DecisionPipeline(g=>new Promise(resolve=>calls.push({g,resolve}))),g=new Game();
  const result=choose(g);const plan={...result.selected,serial:g.serial,entry:{result},expectedNext:boardKey(predictNext(g,result.selected))};
  p.prepare(g,result);await flush();
  for(const a of result.selected.path){if(a==='drop')break;g.move(a);}
  assert.equal(plannedAction(g,plan,p).waiting,true);
  const serial=g.serial;while(g.serial===serial)g.step();
  const transition=plannedAction(g,plan,p);assert.equal(transition.transition,true);assert.equal(transition.expected,true);
  calls[0].resolve(choose(calls[0].g));await flush();assert.equal((await p.get(g)).prepared,true);
  p.invalidate();
});

test('two-move reserve unlocks only at two and stale entire chains are rejected',async()=>{
  const p=new DecisionPipeline(async g=>choose(g)),g=new Game();p.depth=2;
  const result=await p.get(g);p.prepare(g,result);await flush();
  assert.equal(p.readyCount(g,result),2);assert.equal(p.canDrop(g,result),true);
  // Keep the changed cell above any opening landing so placement cannot overwrite it.
  g.board[10][9]='G';assert.equal(p.canDrop(g,result),false);
  p.invalidate();assert.equal(p.futures.length,0);assert.equal(p.canDrop(g,result),false);
});

test('next spawn survival overrides otherwise attractive top-out placements',()=>{
  const board=emptyBoard();for(let y=3;y<20;y++)for(let x=2;x<10;x++)board[y][x]='G';
  const active={type:'O',r:0,x:0,y:0},next={type:'I',r:0,x:3,y:0};
  const options=placements(board,active);
  assert.ok(options.some(p=>!valid(placed(board,p.target).board,next)));
  const safe=shortlist(board,active,'I');assert.ok(safe.length);
  assert.ok(safe.every(p=>valid(placed(board,p.target).board,next)));
});
test('reserve replenishes across many turns beyond the original preview window',async()=>{
  const p=new DecisionPipeline(async g=>choose(g)),g=new Game({random:()=>.5});
  for(let turn=0;turn<18&&!g.over;turn++){
    const result=await p.get(g);if(turn)assert.equal(result.prepared,true);
    p.prepare(g,result);await flush();assert.equal(p.readyCount(g,result),3);
    assert.equal(p.futures.length,3);play(g,result);
  }
  assert.equal(g.pieces,18);
});
