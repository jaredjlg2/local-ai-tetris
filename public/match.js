import {Game} from './engine.js';
export function seededRandom(seed){let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
export class VersusMatch {
  constructor({seed=42,garbage=0,mode='survival',target=20,durationMs=120000}={}){
    if(!['survival','lines','score','timed'].includes(mode))throw new Error('Unknown match mode');
    if(!Number.isFinite(target)||target<=0||!Number.isFinite(durationMs)||durationMs<=0)throw new Error('Invalid match target');
    this.mode=mode;this.target=target;this.durationMs=durationMs;this.reason=null;
    this.seed=seed>>>0;this.human=new Game({garbage,random:seededRandom(this.seed)});this.ai=new Game({garbage,random:seededRandom(this.seed)});
    this.elapsed=0;this.accumulators=[0,0];this.finished=false;this.winner=null;
  }
  // Check both boards together after the same gravity tick, allowing a true draw.
  judge(){
    if(this.finished)return this.winner;
    if(this.human.over||this.ai.over){this.finished=true;this.reason='topout';this.winner=this.human.over&&this.ai.over?'draw':this.human.over?'laya':'human';}
    else if(this.mode==='lines'||this.mode==='score'){
      const stat=this.mode==='lines'?'lines':'score',human=this.human[stat]>=this.target,ai=this.ai[stat]>=this.target;
      if(human||ai){this.finished=true;this.reason='target';this.winner=human&&ai?'draw':human?'human':'laya';}
    }else if(this.mode==='timed'&&this.elapsed>=this.durationMs){
      this.finished=true;this.reason='time';this.winner=this.human.score===this.ai.score?'draw':this.human.score>this.ai.score?'human':'laya';
    }
    return this.winner;
  }
  tick(dt,speed){
    if(this.finished)return;
    if(this.mode==='timed')dt=Math.min(dt,Math.max(0,this.durationMs-this.elapsed));
    this.elapsed+=dt;
    for(const [i,g] of [this.human,this.ai].entries()){
      this.accumulators[i]+=dt;const interval=1000/speed;
      while(this.accumulators[i]>=interval&&!g.over){this.accumulators[i]-=interval;const serial=g.serial;g.step();if(g.serial!==serial)this.accumulators[i]=0;}
    }
    this.judge();
  }
  act(player,action,{deferJudge=false}={}){
    if(this.finished)return false;
    const g=player==='human'?this.human:this.ai,serial=g.serial;
    if(action==='drop')g.drop();else if(action==='hold')g.hold();else if(action==='down'){if(g.move('down'))g.score++;}else g.move(action);
    if(g.serial!==serial)this.accumulators[player==='human'?0:1]=0;
    if(!deferJudge)this.judge();return true;
  }
}
export {VersusMatch as SurvivalMatch};
