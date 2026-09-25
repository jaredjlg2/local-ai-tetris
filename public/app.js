import {Game,SHAPES,matrix,cells,landing,placements} from './engine.js';
import {DecisionPipeline,plannedAction,predictNext,boardKey,requestDecision} from './planner.js';
import {modelName,initialModel,paintModel} from './model-ui.js';
const $=id=>document.getElementById(id);
const colors={I:'#83c8cb',O:'#dfc780',T:'#b8a0cc',S:'#abd18b',Z:'#d78b79',J:'#809fce',L:'#dcab73',G:'#53614c'};
let game=new Game(), running=false, paused=false, mode='manual', ready=false;
let gravity=0,lastTime=0,epoch=0,requestInFlight=false,plan=null,lastAction=0,nextDecision=0;
let log=[],count=0,latest=null,errorText='',lastSerial=game.serial;
let selectedModel=initialModel();
const ctx=$('board').getContext('2d');
const pipeline=new DecisionPipeline(snapshot=>requestDecision(snapshot,selectedModel),()=>{
  $('pipeline-status').textContent=pipeline.description;
  $('pipeline-hits').textContent=`${pipeline.hits} reused · ${pipeline.readyHits} ready before needed`;
});
function block(context,x,y,size,color,ghost=false){
  if(ghost){context.strokeStyle=color+'77';context.lineWidth=1;context.strokeRect(x+2,y+2,size-4,size-4);return;}
  context.fillStyle=color;context.fillRect(x+1,y+1,size-2,size-2);
  context.fillStyle='#ffffff24';context.fillRect(x+2,y+2,size-4,2);
  context.fillStyle='#00000015';context.fillRect(x+2,y+size-5,size-4,3);
}
function mini(canvas,types){
  const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
  types.forEach((type,i)=>{if(!type)return;const m=matrix(type),s=16,ox=(80-m[0].length*s)/2,oy=i*57+8;m.forEach((row,y)=>row.forEach((v,x)=>{if(v)block(c,ox+x*s,oy+y*s,s,colors[type]);}));});
}
function render(){
  ctx.fillStyle='#0d140e';ctx.fillRect(0,0,300,600);
  ctx.strokeStyle='#23301d';ctx.lineWidth=.5;
  for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*30,0);ctx.lineTo(x*30,600);ctx.stroke();}
  for(let y=0;y<=20;y++){ctx.beginPath();ctx.moveTo(0,y*30);ctx.lineTo(300,y*30);ctx.stroke();}
  game.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)block(ctx,x*30,y*30,30,colors[v]);}));
  if(!game.over){
    for(const [x,y] of cells(landing(game.board,game.active)))block(ctx,x*30,y*30,30,colors[game.active.type],true);
    for(const [x,y] of cells(game.active))block(ctx,x*30,y*30,30,colors[game.active.type]);
  }
  if(plan){ctx.strokeStyle='#d8ed9a';ctx.setLineDash([3,3]);for(const[x,y]of cells(plan.target))ctx.strokeRect(x*30+1,y*30+1,28,28);ctx.setLineDash([]);}
  mini($('next'),game.queue.slice(0,4));mini($('hold'),[game.held]);
  $('score').textContent=String(game.score).padStart(6,'0');$('lines').textContent=game.lines;
  $('level').textContent=String(game.level).padStart(2,'0');$('pieces').textContent=game.pieces;
  $('actual-speed').textContent=fallSpeed().toFixed(1)+' cells / second';
  $('game-state').textContent=game.over?'GAME OVER':!running?'READY TO PLAY':paused?'PAUSED':mode==='laya'?modelName(selectedModel).toUpperCase()+' AT THE CONTROLS':'YOUR MOVE';
  $('overlay').hidden=running&&!paused&&!game.over;
  if(game.over){$('overlay-title').textContent='One more round?';$('overlay-text').textContent=`${game.score.toLocaleString()} points · ${game.lines} lines cleared`;$('start').textContent='Play again ↗';}
  else if(paused){$('overlay-title').textContent='Take a breath.';$('overlay-text').textContent='Your board is right here when you’re ready.';$('start').textContent='Resume playing ↗';}
  else if(!running){$('overlay-title').textContent='Find your flow.';$('overlay-text').textContent='A clean board. Endless possibilities.';$('start').textContent='Start playing ↗';}
  $('pause').textContent=paused?'Resume ▷':'Pause Ⅱ';
}
function fallSpeed(){return Number($('speed').value)*($('progressive').checked?Math.pow(1.15,game.level-1):1);}
function invalidate(){if(plan){plan.entry.status='Interrupted';history();}epoch++;plan=null;gravity=0;pipeline.invalidate();}
function reset(){
  invalidate();pipeline.reset();game=new Game({garbage:Number($('garbage').value)});lastSerial=game.serial;
  running=true;paused=false;log=[];latest=null;count=0;errorText='';nextDecision=performance.now()+350;
  $('decision-count').textContent='0';$('latency').textContent='— ms';
  $('decision-wait').textContent='Inference runs ahead; waiting time is shown separately.';
  $('latest').className='latest empty';$('latest').innerHTML=`<div class="empty-symbol">⌘</div><h3>A front-row seat to ${modelName(selectedModel)}.</h3><p>Hand over control to see its chosen landing, option probabilities, and predicted board effects.</p><span>GAME STATE → DECISION → MOVE</span>`;
  $('history').innerHTML='<p class="history-empty">Every move leaves a trace.</p>';
  updateBrain();render();
}
function setMode(value){
  mode=value;invalidate();errorText='';nextDecision=performance.now()+100;
  $('manual').classList.toggle('selected',mode==='manual');$('autopilot').classList.toggle('selected',mode==='laya');
  $('manual').setAttribute('aria-pressed',mode==='manual');$('autopilot').setAttribute('aria-pressed',mode==='laya');
  $('mode-tag').textContent=mode==='manual'?'YOU':modelName(selectedModel).toUpperCase();
  $('mode-help').textContent=mode==='manual'?`You’re in control. Switch to ${modelName(selectedModel)} anytime.`:`${modelName(selectedModel)} is in control. Press Esc to take over.`;
  $('controller').innerHTML=mode==='manual'?'<span class="amber-dot"></span> Manual control':`<span class="live-dot"></span> ${modelName(selectedModel)} control`;
  if(mode==='laya'&&(!running||game.over))reset();
  updateBrain();
}
function pause(){if(!running||game.over)return;paused=!paused;invalidate();updateBrain();render();}
function action(a){
  if(mode!=='manual'||!running||paused||game.over)return;
  if(a==='drop')game.drop();else if(a==='hold')game.hold();else if(a==='down'){if(game.move('down'))game.score++;}else game.move(a);
  render();
}
function updateBrain(){
  $('brain-state').textContent=errorText||(!ready?'Loading the local model…':mode==='manual'?'Waiting for the handoff':game.over?'Round complete':paused?'Paused':requestInFlight?'Evaluating legal landings…':plan?.buffering?'Aligned · falling naturally while planning':plan?'Aligning the selected placement':'Watching the board');
  $('brain-dot').className='dot'+(errorText?' error':ready?' ready':'');
}
function history(){
  $('history').replaceChildren();
  for(const entry of log.slice(0,30)){
    const row=document.createElement('div');row.className='history-entry';
    const top=document.createElement('div');const name=document.createElement('b');name.textContent=`#${String(entry.number).padStart(3,'0')} ${entry.piece} → column ${entry.column}`;
    const timing=document.createElement('span');timing.textContent=entry.latencyMs+' ms';top.append(name,timing);
    const small=document.createElement('small');small.textContent=`${modelName(entry.result.engineId)} · ${entry.status} · ${(entry.probability*100).toFixed(1)}% · ${entry.lines} line${entry.lines===1?'':'s'} predicted`;
    row.append(top,small);$('history').append(row);
  }
}
function showDecision(result,entry){
  const s=result.selected, probability=result.answer.probabilities[s.key];
  $('decision-wait').textContent=`${result.waitMs??result.latencyMs} ms wait${result.prepared?' · planned ahead':''}`;
  $('decision-count').textContent=count;$('latency').textContent=result.latencyMs+' ms';
  const latest=$('latest');latest.className='latest';latest.replaceChildren();
  const title=document.createElement('div');title.className='decision-title';
  const h=document.createElement('h3');h.textContent=`${entry.piece} → column ${entry.column}`;
  const badge=document.createElement('span');badge.textContent=result.constrained?'FORCED MOVE':(probability*100).toFixed(1)+'%';title.append(h,badge);latest.append(title);
  const effects=document.createElement('p');effects.className='effects';effects.textContent=`Predicted outcome: ${s.lines} line${s.lines===1?'':'s'} cleared, ${s.holes} total holes, stack height ${s.height}. Rotation: ${s.target.r*90}°.`;latest.append(effects);
  for(const c of [...result.candidates].sort((a,b)=>result.answer.probabilities[b.key]-result.answer.probabilities[a.key])){
    const prob=result.answer.probabilities[c.key];const row=document.createElement('div');row.className='prob-row'+(c.key===s.key?' chosen':'');
    const label=document.createElement('div');label.className='prob-label';
    const name=document.createElement('span');name.textContent=`${c.key} / col ${Math.min(...cells(c.target).map(([x])=>x))+1} · ${c.lines} lines · ${c.holes} holes`;
    const value=document.createElement('b');value.textContent=(prob*100).toFixed(1)+'%';label.append(name,value);
    const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');fill.style.width=(prob*100)+'%';bar.append(fill);row.append(label,bar);latest.append(row);
  }
  const note=document.createElement('p');note.className='source-note';note.textContent=result.constrained?'One shortlisted safe landing. Equivalent options are merged; 100% reflects a forced move, not model certainty.':`Real ${modelName(result.engineId)} probabilities · game-computed outcomes. Engine shortlists; ${modelName(result.engineId)} selects.`;latest.append(note);
  history();
}
async function decide(){
  const token=epoch,serial=game.serial,piece=game.active.type;
  requestInFlight=true;updateBrain();
  try{
    const result=await pipeline.get(game);
    if(!result||token!==epoch||mode!=='laya'||paused||game.over)return;
    count++;
    const reachable=serial===game.serial?placements(game.board,game.active).find(p=>p.id===result.selected.id):null;
    const entry={number:count,piece,column:Math.min(...cells(result.selected.target).map(([x])=>x))+1,latencyMs:result.latencyMs,probability:result.answer.probabilities[result.selected.key],lines:result.selected.lines,status:reachable?'Moving':'Expired — board advanced',result};
    log.unshift(entry);if(log.length>500)log.pop();latest=entry;showDecision(result,entry);
    if(reachable){const next=predictNext(game,result.selected);plan={...reachable,entry,serial,expectedNext:next?boardKey(next):null};lastAction=performance.now();pipeline.prepare(game,result);}
    else nextDecision=performance.now()+100;
  }catch(e){
    if(token===epoch){setMode('manual');errorText=e.message;}
  }finally{requestInFlight=false;updateBrain();}
}
function animatePlan(now){
  if(!plan||now-lastAction<65)return;
  lastAction=now;
  const step=plannedAction(game,plan,pipeline);
  if(step.transition){plan.entry.status=step.expected?'Placed by normal gravity':'Expired — board changed';history();plan=null;if(!step.expected)pipeline.invalidate();return;}
  if(step.invalid){plan.entry.status='Expired — landing no longer reachable';history();plan=null;pipeline.invalidate();nextDecision=now+100;return;}
  plan.buffering=!!step.waiting;updateBrain();if(!step.action)return;
  const move=step.action;
  if(move==='drop'){
    game.drop();plan.entry.reserveAtDrop=step.ready;plan.entry.status=`Hard drop · ${step.ready} next moves ready`;history();plan=null;gravity=0;nextDecision=now+Number($('pace').value)*1000;
  }else game.move(move);
}
function tick(now){
  const dt=Math.min(now-lastTime,100);lastTime=now;
  if(running&&!paused&&!game.over){
    if(mode==='laya'){
      animatePlan(now);
      if(ready&&!requestInFlight&&!plan&&now>=nextDecision)decide();
    }
    const freeze=mode==='laya'&&$('wait').checked&&(requestInFlight||!ready);
    if(!freeze){gravity+=dt;const interval=1000/fallSpeed();while(gravity>=interval&&!game.over){gravity-=interval;game.step();}}
    if(game.serial!==lastSerial){lastSerial=game.serial;gravity=0;}
    if(game.over){if(plan){plan.entry.status='Game over';history();}invalidate();updateBrain();}
  }
  render();requestAnimationFrame(tick);
}
$('manual').onclick=()=>setMode('manual');$('autopilot').onclick=()=>setMode('laya');
$('model-choice').onchange=()=>{
  selectedModel=$('model-choice').value;ready=false;paintModel(selectedModel);setMode('manual');
  $('latest').className='latest empty';$('latest').textContent=`${modelName(selectedModel)} selected. Hand over control when the model is ready.`;
  $('autopilot').disabled=true;status(false);
};
$('new-game').onclick=reset;$('pause').onclick=pause;
$('lookahead').onchange=()=>{pipeline.enabled=$('lookahead').checked;pipeline.invalidate();if(plan)pipeline.prepare(game,plan.entry.result);};
$('queue-depth').onchange=()=>{pipeline.depth=Number($('queue-depth').value);invalidate();};
$('start').onclick=()=>{if(paused)pause();else if(!running||game.over)reset();};
$('difficulty').onchange=()=>{const presets={easy:[.7,0],normal:[1.4,0],hard:[4,4],expert:[9,8]};const[s,g]=presets[$('difficulty').value];$('speed').value=s;$('garbage').value=g;labels();};
function labels(){
  $('speed-value').innerHTML=Number($('speed').value).toFixed(1)+' <small>cells/s</small>';
  $('garbage-value').innerHTML=$('garbage').value+' <small>rows</small>';
  $('pace-value').innerHTML=Number($('pace').value).toFixed(1)+' <small>s</small>';
}
for(const id of ['speed','garbage','pace'])$(id).oninput=labels;
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>action(button.dataset.action));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){setMode('manual');return;}
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)){
    if(event.code!=='Escape'&&event.code!=='KeyP')return;
  }
  if(event.code==='KeyP'){if(!event.repeat)pause();event.preventDefault();return;}
  const map={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',KeyX:'rotate',KeyZ:'counter',ArrowDown:'down',Space:'drop',KeyC:'hold'};
  const a=map[event.code];if(a){event.preventDefault();if(event.repeat&&['drop','hold','rotate','counter'].includes(a))return;action(a);}
});
// Return keyboard focus to the board after mouse activation, while keeping native keyboard behavior.
document.addEventListener('click',event=>{if(event.detail>0&&event.target.closest('button'))event.target.closest('button').blur();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused&&!game.over)pause();});
$('export').onclick=()=>{
  const blob=new Blob([JSON.stringify({selectedModel,exportedAt:new Date().toISOString(),score:game.score,lines:game.lines,decisions:log},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${selectedModel}-tetris-decisions.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function status(schedule=true){
  const requestedModel=selectedModel;
  try{const res=await fetch('/api/status?model='+requestedModel);const s=await res.json();if(requestedModel!==selectedModel)return;ready=s.state==='ready';$('model-status').textContent=s.message;$('model-dot').className='dot '+s.state;$('autopilot').disabled=!ready;
    $('runtime-device').textContent=s.device||'LOADING';$('runtime-device').title=s.backend||'';
    if(s.state==='error')errorText=s.message;
  }catch{if(requestedModel!==selectedModel)return;ready=false;$('model-status').textContent='Local server disconnected';$('model-dot').className='dot error';$('autopilot').disabled=true;if(mode==='laya'){setMode('manual');errorText='Local server disconnected. Manual control restored.';}}
  finally{if(schedule)setTimeout(status,3000);}
  updateBrain();
}
paintModel(selectedModel);labels();status();render();requestAnimationFrame(tick);
