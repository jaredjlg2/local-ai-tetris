export const W = 10, H = 20;
export const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]], T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]], Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]], L: [[0,0,1],[1,1,1],[0,0,0]]
};
export function matrix(type, rotation = 0) {
  let m = SHAPES[type];
  for (let i=0; i<rotation; i++) m = m[0].map((_,x) => m.map(row=>row[x]).reverse());
  return m;
}
export function cells(p) {
  return matrix(p.type,p.r).flatMap((row,y)=>row.flatMap((v,x)=>v ? [[p.x+x,p.y+y]] : []));
}
export const emptyBoard = () => Array.from({length:H},()=>Array(W).fill(0));
export function valid(board,p) {
  return cells(p).every(([x,y])=>x>=0 && x<W && y>=0 && y<H && !board[y][x]);
}
export function moved(board,p,action) {
  if (action==='rotate' || action==='counter') {
    const r=(p.r+(action==='rotate'?1:3))%4;
    for (const dx of [0,-1,1,-2,2]) {
      const q={...p,r,x:p.x+dx}; if(valid(board,q)) return q;
    }
    return null;
  }
  const q={...p,x:p.x+(action==='left'?-1:action==='right'?1:0),y:p.y+(action==='down'?1:0)};
  return valid(board,q)?q:null;
}
export function landing(board,p) {
  let q={...p}; while(valid(board,{...q,y:q.y+1}))q.y++; return q;
}
export function placed(board,p) {
  const b=board.map(row=>row.slice());
  for(const [x,y] of cells(p)) b[y][x]=p.type;
  const rest=b.filter(row=>row.some(v=>!v)); const lines=H-rest.length;
  return {board:[...Array.from({length:lines},()=>Array(W).fill(0)),...rest],lines};
}
export function metrics(board) {
  const heights=Array(W).fill(0); let holes=0;
  for(let x=0;x<W;x++) {
    let seen=false;
    for(let y=0;y<H;y++) {
      if(board[y][x]){if(!seen) heights[x]=H-y;seen=true;}
      else if(seen)holes++;
    }
  }
  return {holes,height:Math.max(...heights),aggregate:heights.reduce((a,b)=>a+b,0),bumpiness:heights.slice(1).reduce((a,h,i)=>a+Math.abs(h-heights[i]),0)};
}
// Enumerate reachable states, so suggested landings always have a legal input path.
export function placements(board,start) {
  if(!valid(board,start))return [];
  const queue=[{p:start,path:[]}], seen=new Set(), goals=new Map();
  for(let i=0;i<queue.length;i++) {
    const {p,path}=queue[i], key=`${p.x},${p.y},${p.r}`;
    if(seen.has(key))continue; seen.add(key);
    const target=landing(board,p);
    const id=cells(target).map(([x,y])=>`${x},${y}`).sort().join(';');
    if(!goals.has(id)) {
      const after=placed(board,target), m=metrics(after.board);
      goals.set(id,{id,target,path:[...path,'drop'],lines:after.lines,...m,
        value:after.lines*8-m.holes*7-m.aggregate*.48-m.bumpiness*.35-m.height*.8});
    }
    for(const action of ['left','right','rotate','counter','down']) {
      const next=moved(board,p,action);
      if(next&&!seen.has(`${next.x},${next.y},${next.r}`))queue.push({p:next,path:[...path,action]});
    }
  }
  return [...goals.values()].sort((a,b)=>b.value-a.value);
}
export function shortlist(board,start,nextPiece) {
  let options=placements(board,start);
  if(nextPiece){
    const spawn={type:nextPiece,r:0,x:nextPiece==='O'?4:3,y:0};
    const survivable=options.filter(p=>valid(placed(board,p.target).board,spawn));
    if(survivable.length)options=survivable;
  }
  // Preserve headroom before optimizing holes when the stack approaches the top.
  const headroom=options.filter(p=>p.height<14);
  if(headroom.length)options=headroom;
  const fewestHoles=Math.min(...options.map(p=>p.holes));
  const safe=options.filter(p=>p.holes===fewestHoles);
  // Remove strictly dominated outcomes; retain genuine tradeoffs for the model.
  const frontier=safe.filter(a=>!safe.some(b=>
    b.lines>=a.lines&&b.height<=a.height&&b.aggregate<=a.aggregate&&b.bumpiness<=a.bumpiness&&
    (b.lines>a.lines||b.height<a.height||b.aggregate<a.aggregate||b.bumpiness<a.bumpiness)
  )).slice(0,6);
  // A sole safe option is supported by the worker's explicitly labeled equivalent alias.
  // Do not reintroduce an inferior landing merely to satisfy ONNX TopK(2).
  return frontier;
}
export class Game {
  constructor({garbage=0,random=Math.random}={}) {
    this.random=random;this.board=emptyBoard();this.queue=[];this.bag=[];
    this.score=0;this.lines=0;this.pieces=0;this.serial=0;this.held=null;this.holdUsed=false;this.over=false;
    for(let y=H-garbage;y<H;y++) {
      const hole=Math.floor(random()*W);this.board[y]=Array.from({length:W},(_,x)=>x===hole?0:'G');
    }
    this.fillQueue();this.spawn();
  }
  fillQueue() {
    while(this.queue.length<5) {
      if(!this.bag.length) {
        this.bag=Object.keys(SHAPES);
        for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
      }
      this.queue.push(this.bag.pop());
    }
  }
  spawn(type) {
    const t=type??this.queue.shift();this.fillQueue();
    this.active={type:t,r:0,x:t==='O'?4:3,y:0};this.serial++;
    if(!valid(this.board,this.active))this.over=true;
  }
  move(action) {
    if(this.over)return false;
    const next=moved(this.board,this.active,action);
    if(next){this.active=next;return true;}return false;
  }
  step() {if(!this.move('down'))this.lock();}
  drop() {
    if(this.over)return;
    const target=landing(this.board,this.active);this.score+=(target.y-this.active.y)*2;this.active=target;this.lock();
  }
  lock() {
    if(this.over)return;
    const result=placed(this.board,this.active);
    this.score += [0,100,300,500,800][result.lines]*this.level;
    this.board=result.board;this.lines+=result.lines;this.pieces++;this.holdUsed=false;this.spawn();
  }
  hold() {
    if(this.over||this.holdUsed)return false;
    const t=this.active.type, held=this.held;this.held=t;this.spawn(held??undefined);this.holdUsed=true;return true;
  }
  get level(){return 1+Math.floor(this.lines/10);}
}
