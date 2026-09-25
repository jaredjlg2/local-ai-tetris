import {matrix,cells,landing,placements} from './engine.js';
import {VersusMatch} from './match.js';
import {DecisionPipeline,DecisionScheduler,plannedAction,predictNext,boardKey} from './planner.js';
import {modelName,initialModel} from './model-ui.js';
const $=id=>document.getElementById(id);
const colors={I:'#83c8cb',O:'#dfc780',T:'#b8a0cc',S:'#abd18b',Z:'#d78b79',J:'#809fce',L:'#dcab73',G:'#53614c'};
const ids=['human','ai'],sideIds=['left','right'];
let match=new VersusMatch(),running=false,paused=false,ready=false,epoch=0,lastFrame=0,errorText='',watched=1,humanSide=0;
let selected=['human',initialModel()],statuses={};
const scheduler=new DecisionScheduler();
const controllers=ids.map((id,i)=>{
  const controller={waiting:false,plan:null,lastAction:0,log:[],count:0};
  controller.pipeline=new DecisionPipeline(snapshot=>{
    const token=epoch,current=match,model=current.players[i];
    return scheduler.run(model,snapshot,()=>token===epoch&&current===match&&!paused&&!match.finished);
  });
  return controller;
});
const board=i=>i===0?match.human:match.ai;
const players=()=>running?match.players:selected;
const name=(i,list=players())=>list[i]==='human'?'Human':modelName(list[i]);
const label=(i,list=players())=>list[0]===list[1]?`${name(i,list)} · ${sideIds[i]}`:name(i,list);
const winnerSide=()=>match.winner==='human'?0:match.winner==='laya'?1:null;
function resultMessage(){
  const win=winnerSide(),prefix=win===null?'A draw.':players()[win]==='human'?'You win!':`${label(win)} wins.`;
  if(match.reason==='topout')return prefix+' '+(win===null?'Both boards topped out together.':players()[1-win]==='human'?'Your board topped out first.':`${label(1-win)} topped out first.`);
  if(match.reason==='time')return `${prefix} Time is up. ${label(0)}: ${match.human.score.toLocaleString()} · ${label(1)}: ${match.ai.score.toLocaleString()} points.`;
  const goal=`${match.target.toLocaleString()} ${match.mode==='lines'?'lines':'points'}`;
  return prefix+' '+(win===null?`Both reached ${goal} on the same tick.`:`${players()[win]==='human'?'You':label(win)} reached ${goal} first.`);
}
const modes={
  survival:{name:'Survival',title:'Last player standing',description:'The first board to top out loses.',options:[]},
  lines:{name:'Line race',title:'First to clear the target',description:'Reach the line target first to win. Top out and you lose. Reaching the target on the same gravity tick is a draw.',label:'Lines to clear',options:[[20,'20 lines'],[40,'40 lines'],[100,'100 lines']]},
  score:{name:'Score race',title:'First to the target score',description:'Reach the score target first to win. Drop points and line clears both count. Top out and you lose. A target reached on the same gravity tick is a draw.',label:'Target score',options:[[5000,'5,000 points'],[10000,'10,000 points'],[25000,'25,000 points']]},
  timed:{name:'Score attack',title:'Highest score when time runs out',description:'Outscore your opponent before the countdown ends. Top out and you lose immediately. Equal final scores are a draw.',label:'Match length',options:[[120000,'2 minutes'],[180000,'3 minutes'],[300000,'5 minutes']]}
};
function selectedRules(){const mode=$('match-mode').value,value=Number($('match-target').value);return {mode,target:mode==='lines'||mode==='score'?value:20,durationMs:mode==='timed'?value:120000};}
function configureMode(){
  const rule=modes[$('match-mode').value];$('target-setting').hidden=!rule.options.length;
  $('match-target').replaceChildren(...rule.options.map(([value,label])=>new Option(label,value)));
  $('target-label').textContent=rule.label||'Target';$('mode-tag').textContent=rule.name.toUpperCase();
  $('rule-title').textContent=rule.title;$('rule-description').textContent=rule.description+' Both players get the same piece sequence, starting garbage, and fall speed.';
  render();
}
function tile(c,x,y,s,color,ghost=false){
  if(ghost){c.strokeStyle=color+'77';c.strokeRect(x+2,y+2,s-4,s-4);return;}
  c.fillStyle=color;c.fillRect(x+1,y+1,s-2,s-2);c.fillStyle='#ffffff24';c.fillRect(x+2,y+2,s-4,2);
}
function preview(id,types){
  const canvas=$(id),c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
  types.forEach((type,i)=>{if(!type)return;const m=matrix(type),s=11,ox=i*55+(55-m[0].length*s)/2;m.forEach((row,y)=>row.forEach((v,x)=>{if(v)tile(c,ox+x*s,5+y*s,s,colors[type]);}));});
}

function drawBoard(i){
  const id=ids[i],g=board(i),controller=controllers[i],plan=controller.plan;
  const c=$(id+'-board').getContext('2d');c.fillStyle='#0d140e';c.fillRect(0,0,300,600);c.strokeStyle='#26351f';c.lineWidth=.5;
  for(let x=0;x<=10;x++){c.beginPath();c.moveTo(x*30,0);c.lineTo(x*30,600);c.stroke();}
  for(let y=0;y<=20;y++){c.beginPath();c.moveTo(0,y*30);c.lineTo(300,y*30);c.stroke();}
  g.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)tile(c,x*30,y*30,30,colors[v]);}));
  if(!g.over){for(const[x,y]of cells(landing(g.board,g.active)))tile(c,x*30,y*30,30,colors[g.active.type],true);for(const[x,y]of cells(g.active))tile(c,x*30,y*30,30,colors[g.active.type]);}
  if(plan){c.strokeStyle='#d8ed9a';c.setLineDash([3,3]);for(const[x,y]of cells(plan.target))c.strokeRect(x*30+1,y*30+1,28,28);c.setLineDash([]);}
  if(!running||paused||match.finished){c.fillStyle='#0c140dbb';c.fillRect(0,0,300,600);c.textAlign='center';c.fillStyle='#d8ed9a';c.font='24px Segoe UI';c.fillText(!running?'READY':paused?'PAUSED':match.winner==='draw'?'DRAW':winnerSide()===i?'WINNER':g.over?'TOPPED OUT':'MATCH OVER',150,295);}
  $(id+'-score').textContent=String(g.score).padStart(6,'0');$(id+'-lines').textContent=g.lines;$(id+'-pieces').textContent=g.pieces;
  $(id+'-state').textContent=g.over?'Topped out':match.finished?(match.winner==='draw'?'Draw':winnerSide()===i?'Winner':'Match over'):paused?'Paused':running?(players()[i]==='human'?'Your move':controller.waiting?'Deciding…':plan?.buffering?'Planning ahead':'Playing'):'Ready';
  $(id+'-name').textContent=label(i);$(id+'-type').textContent=`${i+1===1?'01':'02'} / ${players()[i]==='human'?'HUMAN':'LOCAL AI'}`;
  $(id+'-board').setAttribute('aria-label',`${label(i)} game grid`);
  preview(id+'-next',g.queue.slice(0,3));preview(id+'-hold',[g.held]);
}
function render(){
  drawBoard(0);drawBoard(1);
  $('match-title').textContent=`${label(0)} versus ${label(1)}.`;
  const rules=running?match:selectedRules(),seconds=rules.mode==='timed'?Math.ceil(Math.max(0,rules.durationMs-match.elapsed)/1000):Math.floor(match.elapsed/1000);
  $('clock').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('clock-label').textContent=rules.mode==='timed'?'TIME REMAINING':rules.mode==='survival'?'TIME SURVIVED':'RACE TIME';
  $('match-progress').textContent=rules.mode==='survival'?'':`${modes[rules.mode].name.toUpperCase()} · `+[0,1].map(i=>`${label(i)} ${board(i)[rules.mode==='lines'?'lines':'score'].toLocaleString()}${rules.mode==='timed'?'':` / ${rules.target.toLocaleString()}`}`).join(' · ');
  $('pause-match').textContent=paused?'Resume both ▷':'Pause both Ⅱ';$('pause-match').disabled=!running||match.finished;
  $('start-match').disabled=!ready;$('start-match').textContent=running?'New match ↻':'Start match ↗';
  $('match-banner').classList.toggle('finished',match.finished);
  $('match-banner').textContent=match.finished?resultMessage():errorText||(!running?'Choose both players, then start the match.':paused?'Match paused. Both clocks and boards are stopped.':`${modes[match.mode].name} is live. ${match.mode==='survival'?'First board to top out loses.':match.mode==='timed'?'Highest score at the buzzer wins.':`First to ${match.target.toLocaleString()} ${match.mode==='lines'?'lines':'points'} wins.`}`);
  const humans=players().map((p,i)=>p==='human'?i:-1).filter(i=>i>=0);
  if(!humans.includes(humanSide))humanSide=humans[0]??0;
  $('human-controls').hidden=!humans.length;$('human-control-choice').hidden=humans.length<2;$('human-control-choice').value=String(humanSide);
  $('control-label').textContent=humans.length?`Controls: ${label(humanSide)} (${sideIds[humanSide]} board)`:'Spectator match · both players are AI';
  const ctl=controllers[watched],human=players()[watched]==='human',s=statuses[players()[watched]];
  $('panel-title').textContent=`${label(watched)}’s game plan`;
  $('watch-left').textContent=label(0);$('watch-right').textContent=label(1);
  for(const i of [0,1]){$('watch-'+sideIds[i]).classList.toggle('selected',watched===i);$('watch-'+sideIds[i]).setAttribute('aria-pressed',String(watched===i));}
  $('brain-state').textContent=errorText||(human?'Manual player · no model decisions':!ready?'Waiting for local models…':match.finished?'Match complete':!running?'Waiting for the match':paused?'Both boards paused':ctl.waiting?'Evaluating the current piece…':ctl.plan?.buffering?'Aligned · falling naturally while planning':ctl.plan?'Aligning the selected placement':'Watching the board');
  $('brain-dot').className='dot'+(errorText?' error':ready?' ready':'');$('runtime-device').textContent=human?'MANUAL':s?.device||'LOADING';
  $('pipeline-status').textContent=human?'Manual control':ctl.pipeline.description;
  $('pipeline-hits').textContent=`${ctl.pipeline.hits} reused · ${ctl.pipeline.readyHits} ready before needed`;
}
function invalidate(){
  epoch++;
  for(const ctl of controllers){if(ctl.plan)ctl.plan.entry.status='Interrupted';ctl.plan=null;ctl.pipeline.invalidate();}
  history();
}
function settingsLocked(locked){for(const id of ['left-player','model-choice','match-mode','match-target','speed','difficulty','garbage','lookahead','queue-depth'])$(id).disabled=locked;}
function start(){
  if(!ready)return;invalidate();
  match=new VersusMatch({seed:crypto.getRandomValues(new Uint32Array(1))[0],garbage:Number($('garbage').value),...selectedRules()});match.players=selected.slice();
  for(const ctl of controllers){ctl.pipeline.reset();ctl.pipeline.enabled=$('lookahead').checked;ctl.pipeline.depth=Number($('queue-depth').value);ctl.count=0;ctl.log=[];ctl.plan=null;}
  running=true;paused=false;errorText='';watched=selected[1]!=='human'?1:0;
  $('match-seed').textContent=`Shared sequence seed: ${match.seed}`;settingsLocked(true);refreshPanel();render();
}
function pause(){if(!running||match.finished)return;paused=!paused;invalidate();render();}
function finish(){if(!match.finished)return;invalidate();settingsLocked(false);render();}
function action(a){if(!running||paused||match.finished||players()[humanSide]!=='human')return;match.act(ids[humanSide],a);if(match.finished)finish();render();}
function history(){
  $('history').replaceChildren();
  for(const entry of controllers[watched].log.slice(0,25)){
    const row=document.createElement('div');row.className='history-entry';const top=document.createElement('div'),title=document.createElement('b'),timing=document.createElement('span');
    title.textContent=`#${String(entry.number).padStart(3,'0')} ${entry.piece} → col ${entry.column}`;timing.textContent=`${entry.result.waitMs} ms wait`;top.append(title,timing);
    const small=document.createElement('small');small.textContent=`${modelName(entry.result.engineId)} · ${entry.side} · ${entry.status} · ${entry.result.latencyMs} ms inference${entry.result.prepared?' · planned ahead':''}`;row.append(top,small);$('history').append(row);
  }
}
function refreshPanel(){
  const ctl=controllers[watched],entry=ctl.log[0];
  if(entry)showDecision(entry.result,entry);
  else{$('decision-count').textContent=ctl.count;$('latency').textContent='— ms';$('decision-wait').textContent='No decision yet';$('latest').className='latest empty';$('latest').textContent=players()[watched]==='human'?'This board is controlled by a human. Choose an AI board above to inspect its decisions.':'Decisions for this board will appear here.';history();}
}
function showDecision(result,entry){
  $('decision-count').textContent=controllers[watched].count;$('latency').textContent=result.latencyMs+' ms';$('decision-wait').textContent=`${result.waitMs} ms waited${result.prepared?' · used advance plan':''}`;
  const root=$('latest');root.className='latest';root.replaceChildren();
  const title=document.createElement('div');title.className='decision-title';const h=document.createElement('h3');h.textContent=`${entry.piece} → column ${entry.column}`;
  const badge=document.createElement('span');badge.textContent=result.constrained?'FORCED':(result.answer.probabilities[result.selected.key]*100).toFixed(1)+'%';title.append(h,badge);root.append(title);
  const effects=document.createElement('p');effects.className='effects';effects.textContent=`Predicted: ${result.selected.lines} lines cleared · ${result.selected.holes} holes · height ${result.selected.height}`;root.append(effects);
  for(const c of [...result.candidates].sort((a,b)=>result.answer.probabilities[b.key]-result.answer.probabilities[a.key])){
    const p=result.answer.probabilities[c.key],row=document.createElement('div');row.className='prob-row'+(c.key===result.selected.key?' chosen':'');
    const label=document.createElement('div');label.className='prob-label';const text=document.createElement('span'),value=document.createElement('b');
    text.textContent=`${c.key} / ${c.lines} lines · ${c.holes} holes`;value.textContent=(p*100).toFixed(1)+'%';label.append(text,value);
    const bar=document.createElement('div'),fill=document.createElement('i');bar.className='bar';fill.style.width=p*100+'%';bar.append(fill);row.append(label,bar);root.append(row);
  }
  const note=document.createElement('p');note.className='source-note';note.textContent=result.constrained?'One shortlisted safe landing; merged probability reflects a forced move.':`Actual ${modelName(result.engineId)} probabilities. Engine proposes; ${modelName(result.engineId)} selects.`;root.append(note);history();
}

async function decide(i){
  const ctl=controllers[i],token=epoch,current=match,g=board(i),serial=g.serial,piece=g.active.type;ctl.waiting=true;
  try{
    const result=await ctl.pipeline.get(g);
    if(!result||token!==epoch||current!==match||paused||match.finished)return;
    ctl.count++;const reachable=serial===g.serial?placements(g.board,g.active).find(p=>p.id===result.selected.id):null;
    const entry={side:sideIds[i],number:ctl.count,piece,column:Math.min(...cells(result.selected.target).map(([x])=>x))+1,status:reachable?'Moving':'Expired — board advanced',result};ctl.log.unshift(entry);if(ctl.log.length>500)ctl.log.pop();
    if(i===watched)showDecision(result,entry);
    if(reachable){const next=predictNext(g,result.selected);ctl.plan={...reachable,serial,entry,expectedNext:next?boardKey(next):null};ctl.lastAction=performance.now();ctl.pipeline.prepare(g,result);}
  }catch(error){if(token===epoch){paused=true;invalidate();errorText=`Match paused: ${label(i)} — ${error.message}`;}}
  finally{ctl.waiting=false;render();}
}
function animate(i,now){
  const ctl=controllers[i],plan=ctl.plan;if(!plan||now-ctl.lastAction<65)return;ctl.lastAction=now;
  const step=plannedAction(board(i),plan,ctl.pipeline);
  if(step.transition){plan.entry.status=step.expected?'Placed by normal gravity':'Expired — board changed';ctl.plan=null;if(!step.expected)ctl.pipeline.invalidate();history();return;}
  if(step.invalid){plan.entry.status='Expired — landing changed';ctl.plan=null;ctl.pipeline.invalidate();history();return;}
  plan.buffering=!!step.waiting;if(!step.action)return;
  match.act(ids[i],step.action,{deferJudge:true});
  if(step.action==='drop'){plan.entry.reserveAtDrop=step.ready;plan.entry.status=`Hard drop · ${step.ready} next moves ready`;ctl.plan=null;history();}
}
function tick(now){
  const dt=Math.min(now-lastFrame,100);lastFrame=now;
  if(running&&!paused&&!match.finished){
    match.tick(dt,Number($('speed').value));
    if(!match.finished){
      for(const i of [0,1])if(players()[i]!=='human')animate(i,now);
      match.judge();
    }
    if(match.finished)finish();else for(const i of [0,1]){
      const ctl=controllers[i];if(players()[i]!=='human'&&ready&&!ctl.waiting&&!ctl.plan)decide(i);
    }
  }
  render();requestAnimationFrame(tick);
}
function labels(){ $('speed-value').innerHTML=Number($('speed').value).toFixed(1)+' <small>cells/s</small>';$('garbage-value').innerHTML=$('garbage').value+' <small>rows</small>'; }
$('difficulty').onchange=()=>{const [speed,garbage]={easy:[.7,0],normal:[1.4,0],hard:[4,4],expert:[9,8]}[$('difficulty').value];$('speed').value=speed;$('garbage').value=garbage;labels();};
$('speed').oninput=labels;$('garbage').oninput=labels;$('start-match').onclick=start;$('pause-match').onclick=pause;
$('match-mode').onchange=configureMode;$('match-target').onchange=render;
function choosePlayers(){selected=[$('left-player').value,$('model-choice').value];ready=false;errorText='';invalidate();if(!running)watched=selected[1]==='human'?0:1;status(false);refreshPanel();render();}
$('left-player').onchange=choosePlayers;$('model-choice').onchange=choosePlayers;
for(const i of [0,1])$('watch-'+sideIds[i]).onclick=()=>{watched=i;refreshPanel();render();};
$('human-control-choice').onchange=()=>{humanSide=Number($('human-control-choice').value);render();};
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
document.addEventListener('keydown',e=>{
  if(['KeyP','Escape'].includes(e.code)){if(!e.repeat)pause();e.preventDefault();return;}
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;
  const a={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',KeyX:'rotate',KeyZ:'counter',ArrowDown:'down',Space:'drop',KeyC:'hold'}[e.code];
  if(a){e.preventDefault();if(e.repeat&&['drop','hold','rotate','counter'].includes(a))return;action(a);}
});
document.addEventListener('click',e=>{if(e.detail>0)e.target.closest('button')?.blur();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused&&!match.finished)pause();});
$('export').onclick=()=>{
  const win=winnerSide(),data={mode:match.mode,target:match.mode==='lines'||match.mode==='score'?match.target:null,durationMs:match.mode==='timed'?match.durationMs:null,reason:match.reason,seed:match.seed,elapsedMs:match.elapsed,winner:match.finished?(win===null?'draw':sideIds[win]):null,players:players().map((type,i)=>({side:sideIds[i],type,score:board(i).score,lines:board(i).lines,pieces:board(i).pieces,pipeline:{reused:controllers[i].pipeline.hits,readyBeforeNeeded:controllers[i].pipeline.readyHits,discarded:controllers[i].pipeline.discarded}})),decisions:controllers.flatMap(c=>c.log)};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${players().join('-vs-')}-${match.mode}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function status(schedule=true){
  const selection=selected.join(','),models=[...new Set(selected.filter(p=>p!=='human'))];
  try{
    const results=await Promise.all(models.map(async id=>{const res=await fetch('/api/status?model='+id);if(!res.ok)throw new Error('Model status unavailable');return [id,await res.json()];}));
    if(selection!==selected.join(','))return;statuses=Object.fromEntries(results);ready=results.every(([,s])=>s.state==='ready');
    $('model-status').textContent=results.length?results.map(([id,s])=>`${modelName(id)}: ${s.state==='ready'?'ready':s.message}`).join(' · '):'Local human match';$('model-dot').className='dot '+(ready?'ready':'loading');
    if(!ready&&running&&!paused&&!match.finished){paused=true;invalidate();errorText='Match paused while a local model is unavailable.';}
    if(ready&&['Match paused while a local model is unavailable.','Local server disconnected.'].includes(errorText))errorText='';
  }catch{if(selection!==selected.join(','))return;ready=false;$('model-status').textContent='Local server disconnected';$('model-dot').className='dot error';if(running&&!paused&&!match.finished){paused=true;invalidate();}errorText='Local server disconnected.';}
  finally{if(schedule)setTimeout(status,3000);}
  render();
}
$('left-player').value=selected[0];$('model-choice').value=selected[1];labels();configureMode();status();refreshPanel();render();requestAnimationFrame(tick);
