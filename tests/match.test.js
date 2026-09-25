import test from 'node:test';
import assert from 'node:assert/strict';
import {VersusMatch} from '../public/match.js';
import {emptyBoard} from '../public/engine.js';

function readyClear(g,lines=1){
  g.board=emptyBoard();for(let y=20-lines;y<20;y++)g.board[y]=Array.from({length:10},(_,x)=>x===5?0:'G');
  g.active={type:'I',r:1,x:3,y:16};
}
test('line race ends on an actual clear, including overshoot, and freezes both boards',()=>{
  const m=new VersusMatch({mode:'lines',target:20});m.human.lines=19;readyClear(m.human,4);
  m.act('human','drop');assert.equal(m.human.lines,23);assert.equal(m.winner,'human');assert.equal(m.reason,'target');
  const snapshot=JSON.stringify(m);m.tick(1000,2);assert.equal(m.act('ai','drop'),false);assert.equal(JSON.stringify(m),snapshot);
});
test('Laya can win the line race; simultaneous gravity clears draw',()=>{
  const m=new VersusMatch({mode:'lines',target:40});m.ai.lines=39;readyClear(m.ai);m.act('ai','drop');assert.equal(m.winner,'laya');
  const draw=new VersusMatch({mode:'lines',target:20});for(const g of [draw.human,draw.ai]){g.lines=19;readyClear(g);}
  draw.tick(1000,1);assert.equal(draw.winner,'draw');assert.equal(draw.reason,'target');
});
test('score race accepts drop points and line-clear points but not a near miss',()=>{
  const m=new VersusMatch({mode:'score',target:5000});m.ai.score=4998;
  m.act('ai','down');assert.equal(m.finished,false);m.act('ai','down');assert.equal(m.winner,'laya');
  const clear=new VersusMatch({mode:'score',target:10000});clear.human.score=9990;readyClear(clear.human);clear.act('human','drop');assert.equal(clear.winner,'human');
});
test('timed mode stops exactly at its deadline, compares scores, and freezes result',()=>{
  for(const [human,ai,winner] of [[300,100,'human'],[100,300,'laya'],[300,300,'draw']]){
    const m=new VersusMatch({mode:'timed',durationMs:120000});m.human.score=human;m.ai.score=ai;m.elapsed=119950;
    m.tick(49,1);assert.equal(m.finished,false);m.tick(100,1);
    assert.equal(m.elapsed,120000);assert.equal(m.winner,winner);assert.equal(m.reason,'time');
    m.tick(5000,20);assert.equal(m.elapsed,120000);assert.equal(m.act('human','drop'),false);
  }
});
test('top-out is an immediate loss in every mode even when a target is met',()=>{
  for(const mode of ['survival','lines','score','timed']){
    const m=new VersusMatch({mode});m.human.lines=100;m.human.score=99999;m.human.over=true;
    assert.equal(m.judge(),'laya');assert.equal(m.reason,'topout');
  }
});
test('two AI target clears in one animation frame are judged together',()=>{
  const m=new VersusMatch({mode:'lines',target:20});
  for(const g of [m.human,m.ai]){g.lines=19;readyClear(g);}
  m.act('human','drop',{deferJudge:true});assert.equal(m.finished,false);
  m.act('ai','drop',{deferJudge:true});assert.equal(m.judge(),'draw');assert.equal(m.reason,'target');
});
