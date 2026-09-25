import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SHAPES,emptyBoard,valid,landing,moved,placed,placements,shortlist,metrics,cells} from '../public/engine.js';

test('seven-bag gives every shape once, and hold can only happen once per piece',()=>{
  const g=new Game({random:()=>.5});const types=[];
  for(let i=0;i<7;i++){types.push(g.active.type);g.board=emptyBoard();g.drop();}
  assert.equal(new Set(types).size,7);
  const before=g.active.type;assert.equal(g.hold(),true);assert.equal(g.held,before);assert.equal(g.hold(),false);
  g.drop();assert.equal(g.hold(),true);assert.equal(g.active.type,before);
});
test('four-line clear collapses rows and scores a Tetris',()=>{
  const g=new Game();g.board=emptyBoard();
  for(let y=16;y<20;y++)g.board[y]=Array.from({length:10},(_,x)=>x===5?0:'G');
  g.active={type:'I',r:1,x:3,y:0};g.drop();
  assert.equal(g.lines,4);assert.equal(g.board.flat().filter(Boolean).length,0);assert.ok(g.score>=800);
});
test('all enumerated placements replay legally and match simulated outcomes',()=>{
  const board=emptyBoard();for(let y=16;y<20;y++)for(let x=0;x<10;x++)if((x+y)%4)board[y][x]='G';
  for(const type of Object.keys(SHAPES)){
    const start={type,r:0,x:type==='O'?4:3,y:0};const options=placements(board,start);assert.ok(options.length>0);
    for(const option of options){
      let p=start;
      for(const a of option.path){p=a==='drop'?landing(board,p):moved(board,p,a);assert.ok(p);assert.ok(valid(board,p));}
      assert.deepEqual(cells(p).sort(),cells(option.target).sort());
      const result=placed(board,p);assert.equal(result.lines,option.lines);assert.equal(metrics(result.board).holes,option.holes);
    }
  }
});
test('wall collision, spawn collision, garbage bounds and hole counting',()=>{
  const g=new Game({garbage:8});assert.equal(g.board.filter(r=>r.some(Boolean)).length,8);
  g.active={type:'O',r:0,x:0,y:0};assert.equal(g.move('left'),false);
  g.board=Array.from({length:20},()=>Array(10).fill('G'));g.spawn();assert.equal(g.over,true);
  const b=emptyBoard();b[17][0]='I';assert.equal(metrics(b).holes,2);
});
test('shortlist prioritizes minimum holes and permits a single best option',()=>{
  const g=new Game({garbage:3,random:()=>.5});
  for(const type of Object.keys(SHAPES)){
    const p={type,r:0,x:3,y:0},all=placements(g.board,p),short=shortlist(g.board,p);
    assert.ok(short.length>0&&short.length<=6);
    assert.equal(short[0].holes,Math.min(...all.map(a=>a.holes)));
    assert.ok(short.length>=1);
  }
});
test('a single narrow well has exactly one reachable landing',()=>{
  const board=Array.from({length:20},()=>Array.from({length:10},(_,x)=>x===5?0:'G'));
  assert.equal(shortlist(board,{type:'I',r:1,x:3,y:0}).length,1);
});
