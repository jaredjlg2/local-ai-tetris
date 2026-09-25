import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {Game,emptyBoard,landing} from '../public/engine.js';
const base='http://127.0.0.1:8776';
for(let n=0;n<60;n++){
  const status=await(await fetch(base+'/api/status')).json();
  if(status.state==='ready')break;
  assert.notEqual(status.state,'error',status.message);
  if(n===59)throw new Error('Model did not become ready');
  await new Promise(resolve=>setTimeout(resolve,500));
}
let seed=42;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const game=new Game({random});const results=[];
const malformed=await fetch(base+'/api/decide',{method:'POST',body:JSON.stringify({board:[],active:{}})});
assert.equal(malformed.status,400);
for(let i=0;i<40&&!game.over;i++){
  const response=await fetch(base+'/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({board:game.board,active:game.active})});
  const decision=await response.json();assert.equal(response.status,200,JSON.stringify(decision));
  const probabilities=Object.values(decision.answer.probabilities);
  assert.ok(probabilities.every(p=>Number.isFinite(p)&&p>=0&&p<=1));
  assert.ok(Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)<.002);
  assert.equal(decision.answer.choice,decision.selected.key);
  for(const move of decision.selected.path){if(move==='drop')game.drop();else assert.equal(game.move(move),true);}
  results.push({piece:i+1,choice:decision.answer.choice,candidates:decision.candidates.length,latencyMs:decision.latencyMs,lines:game.lines,holes:decision.selected.holes});
  if((i+1)%10===0)console.log(`${i+1} real model placements, ${game.lines} lines cleared`);
}
const report={seed:42,pieces:game.pieces,lines:game.lines,score:game.score,gameOver:game.over,averageLatencyMs:Math.round(results.reduce((s,r)=>s+r.latencyMs,0)/results.length),results};
await mkdir('test-results',{recursive:true});await writeFile('test-results/live-inference.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined},null,2));
assert.ok(game.pieces>=20,'Expected at least 20 legal AI placements');
assert.ok(game.lines>0,'Expected the model-assisted player to clear lines');
