import {placed,valid,placements} from './engine.js';

export const boardKey = g => `${g.serial}:${g.active.type}:${JSON.stringify(g.board)}`;
// FIFO per model: mirror matches share one runtime without starving either board.
// Different models may infer concurrently. Stale queued work never reaches the server.
export class DecisionScheduler {
  constructor(request=requestDecision){this.request=request;this.tails=new Map();}
  run(model,snapshot,isCurrent=()=>true){
    const result=(this.tails.get(model)??Promise.resolve()).then(()=>isCurrent()?this.request(snapshot,model):null);
    this.tails.set(model,result.catch(()=>null));return result;
  }
}
export function predictNext(g,selected) {
  const type=g.queue[0];if(!type)return null;
  const board=placed(g.board,selected.target).board;
  const active={type,r:0,x:type==='O'?4:3,y:0};
  return valid(board,active)?{board,active,serial:g.serial+1,queue:g.queue.slice(1)}:null;
}
export async function requestDecision(snapshot,model='laya') {
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
    const response=await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,board:snapshot.board,active:snapshot.active,nextPiece:snapshot.queue?.[0]}),signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});
    if(response.status===429){await new Promise(resolve=>setTimeout(resolve,120));continue;}
    const result=await response.json();if(!response.ok)throw new Error(result.error||'The model could not decide.');return result;
  }
  throw new Error('Local decision timed out');
}
// One inference at a time, chained through each predicted placement and line clear.
export class DecisionPipeline {
  constructor(request=requestDecision,onChange=()=>{}) {
    this.request=request;this.onChange=onChange;this.epoch=0;this.futures=[];this.anchor=null;this.tail=Promise.resolve();this.enabled=true;this.depth=3;
    this.hits=0;this.readyHits=0;this.discarded=0;
  }
  get future(){return this.futures[0]??null;}
  invalidate(){this.epoch++;this.discarded+=this.futures.length;this.futures=[];this.anchor=null;this.onChange();}
  reset(){this.invalidate();this.hits=0;this.readyHits=0;this.discarded=0;this.onChange();}
  enqueue(snapshot,epoch){
    const copy={board:snapshot.board.map(row=>row.slice()),active:{...snapshot.active},serial:snapshot.serial,queue:snapshot.queue?.slice()??[]};
    const promise=this.tail.then(()=>epoch===this.epoch?this.request(copy):null);
    this.tail=promise.catch(()=>null);return promise;
  }
  async get(g){
    let epoch=this.epoch;const started=performance.now(),key=boardKey(g);
    let result,prepared=false,readyBeforeNeeded=false;
    const f=this.future;
    if(f&&f.key===key&&!f.error){
      prepared=true;readyBeforeNeeded=!!f.result;
      result=await f.promise;
      if(epoch!==this.epoch)return null;
      if(result){this.futures.shift();this.hits++;if(readyBeforeNeeded)this.readyHits++;}
    }else if(f){this.invalidate();epoch=this.epoch;}
    if(!result&&epoch===this.epoch){
      if(this.future){this.invalidate();epoch=this.epoch;}
      prepared=false;readyBeforeNeeded=false;result=await this.enqueue(g,epoch);
    }
    if(epoch!==this.epoch||!result)return null;
    this.onChange();return {...result,prepared,readyBeforeNeeded,waitMs:Math.round(performance.now()-started)};
  }
  prepare(g,result){
    if(!this.enabled)return;
    const next=predictNext(g,result.selected);
    if(this.future&&(!next||this.future.key!==boardKey(next)))this.invalidate();
    this.anchor={snapshot:{board:g.board.map(row=>row.slice()),active:{...g.active},serial:g.serial,queue:g.queue.slice()},result};
    // Refresh preview tails as new pieces become visible, without changing predicted boards.
    this.futures.forEach((f,i)=>{f.snapshot.queue=g.queue.slice(i+1);});
    this.fill();this.onChange();
  }
  fill(){
    if(!this.enabled||!this.anchor||this.futures.length>=this.depth)return;
    const previous=this.futures.at(-1)??this.anchor;
    if(!previous.result)return;
    const snapshot=predictNext(previous.snapshot,previous.result.selected);if(!snapshot)return;
    const epoch=this.epoch,f={snapshot,key:boardKey(snapshot),type:snapshot.active.type,result:null,error:null};this.futures.push(f);
    f.promise=this.enqueue(snapshot,epoch).then(result=>{
      if(epoch!==this.epoch)return null;f.result=result;
      if(this.futures.includes(f))this.fill();this.onChange();return result;
    }).catch(error=>{f.error=error;this.onChange();return null;});
    this.onChange();
  }
  readyCount(g,result){
    let next=predictNext(g,result.selected),count=0;
    for(const f of this.futures){
      if(!next||f.key!==boardKey(next)||!f.result)break;
      count++;next=predictNext(f.snapshot,f.result.selected);
    }
    return count;
  }
  canDrop(g,result){return this.enabled&&this.readyCount(g,result)>=this.depth;}
  get description(){
    if(!this.enabled)return 'Normal fall · advance planning off';
    const ready=this.futures.filter(f=>f.result).length;
    return `${ready}/${this.depth} ready${this.futures.some(f=>f.error)?' · retry on next turn':this.futures.some(f=>!f.result)?' · planning…':''}${ready?' · '+this.futures.filter(f=>f.result).map(f=>f.type).join(' → '):''}`;
  }
}

// Never accelerate a descent until the reserve is full; lateral alignment stays immediate.
export function plannedAction(game,plan,pipeline){
  if(plan.serial!==game.serial)return {action:null,transition:true,expected:plan.expectedNext===boardKey(game)};
  const reachable=placements(game.board,game.active).find(p=>p.id===plan.id);
  if(!reachable)return {action:null,invalid:true};
  const move=reachable.path[0],ready=pipeline.readyCount(game,plan.entry.result);
  if(['drop','down'].includes(move)&&!pipeline.canDrop(game,plan.entry.result))return {action:null,waiting:true,ready};
  return {action:move,ready};
}
