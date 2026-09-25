import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {Game,shortlist} from '../public/engine.js';
import {seededRandom} from '../public/match.js';
const base='http://127.0.0.1:8776';
async function decide(model,snapshot){
  const response=await fetch(base+'/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...snapshot,model}),signal:AbortSignal.timeout(45000)});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
  assert.equal(result.engineId,model);assert.ok(result.model.toLowerCase().includes(model));
  assert.ok(result.candidates.some(c=>c.id===result.selected.id));
  const probs=Object.values(result.answer.probabilities);assert.ok(probs.every(p=>Number.isFinite(p)&&p>=0&&p<=1));assert.ok(Math.abs(probs.reduce((a,b)=>a+b,0)-1)<.001);
  return result;
}
for(const model of ['laya','von']){
  const status=await(await fetch(base+'/api/status?model='+model)).json();assert.equal(status.state,'ready',JSON.stringify(status));
}
const report={date:new Date().toISOString(),states:[],timing:{}};
const game=new Game({random:seededRandom(2026)});
for(let i=0;i<16;i++){
  const snapshot={board:game.board,active:game.active,nextPiece:game.queue[0]};
  const answers={};for(const model of i%2?['von','laya']:['laya','von'])answers[model]=await decide(model,snapshot);
  report.states.push({snapshot,laya:answers.laya,von:answers.von});
  const choice=shortlist(game.board,game.active,game.queue[0])[0];for(const action of choice.path){if(action==='drop')game.drop();else game.move(action);}
}
for(const model of ['laya','von']){
  const times=report.states.slice(2).map(s=>s[model].latencyMs).sort((a,b)=>a-b);
  report.timing[model]={meanMs:Math.round(times.reduce((a,b)=>a+b,0)/times.length),medianMs:times[Math.floor(times.length/2)],samples:times.length,backend:report.states[0][model].backend};
  const board=Array.from({length:20},()=>Array.from({length:10},(_,x)=>x===5?0:'G'));
  const forced=await decide(model,{board,active:{type:'I',r:1,x:3,y:0}});
  assert.equal(forced.constrained,true);assert.equal(forced.answer.probabilities.A,1);assert.ok(Object.hasOwn(forced.rawAnswer.probabilities,'EQUIVALENT'));
}
const badStatus=await fetch(base+'/api/status?model=unknown');assert.equal(badStatus.status,400);
const badDecision=await fetch(base+'/api/decide',{method:'POST',body:JSON.stringify({model:'unknown',board:game.board,active:game.active})});assert.equal(badDecision.status,400);
await mkdir('test-results',{recursive:true});await writeFile('test-results/model-comparison.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,timing:report.timing,matchingChoices:report.states.filter(s=>s.laya.selected.id===s.von.selected.id).length,total:report.states.length},null,2));
