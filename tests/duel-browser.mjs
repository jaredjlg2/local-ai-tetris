import {chromium,browserOptions} from './browser-runtime.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch(browserOptions);
try{
  const page=await browser.newPage({viewport:{width:1500,height:1120}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const source=await readFile('public/versus.js','utf8');
  await page.route('**/versus.js',route=>route.fulfill({contentType:'text/javascript',body:source+'\nwindow.matchFixture=()=>match;'}));
  await page.goto('http://127.0.0.1:8776/versus');
  const ready=()=>page.waitForFunction(()=>!document.getElementById('start-match').disabled);
  await ready();await page.locator('#speed').fill('0.5');
  const pairs=[['laya','von','survival'],['von','laya','lines'],['laya','laya','score'],['von','von','timed']];
  for(const [left,right,mode] of pairs){
    await page.locator('#left-player').selectOption(left);await page.locator('#model-choice').selectOption(right);await page.locator('#match-mode').selectOption(mode);await ready();await page.locator('#start-match').click();
    assert.equal(await page.locator('#left-player').isDisabled(),true);assert.equal(await page.locator('#model-choice').isDisabled(),true);
    assert.equal(await page.locator('#human-controls').isHidden(),true);
    await page.keyboard.press('Space');assert.equal(await page.locator('#human-pieces').textContent(),'0','spectator keyboard cannot drop either model piece');
    await page.waitForFunction(()=>Number(document.getElementById('human-pieces').textContent)>=3&&Number(document.getElementById('ai-pieces').textContent)>=3,{},{timeout:90000});
    await page.locator('#pause-match').click();const frozen=await page.evaluate(()=>[document.getElementById('human-pieces').textContent,document.getElementById('ai-pieces').textContent,document.getElementById('clock').textContent]);
    await page.waitForTimeout(600);assert.deepEqual(await page.evaluate(()=>[document.getElementById('human-pieces').textContent,document.getElementById('ai-pieces').textContent,document.getElementById('clock').textContent]),frozen);
    for(const side of ['left','right']){await page.locator('#watch-'+side).click();assert.ok(Number(await page.locator('#decision-count').textContent())>=3);assert.match(await page.locator('#history').textContent(),new RegExp(side));}
    if(left!==right&&mode==='survival')await page.screenshot({path:'test-results/duel-desktop.png',fullPage:true});
    await page.evaluate(()=>{const m=window.matchFixture();if(m.mode==='survival')m.human.over=true;else if(m.mode==='lines')m.human.lines=m.target;else if(m.mode==='score')m.ai.score=m.target;else{m.elapsed=m.durationMs;m.human.score=10000;m.ai.score=100;}});
    await page.locator('#pause-match').click();await page.waitForFunction(()=>document.getElementById('pause-match').disabled);
    const promised=page.waitForEvent('download');await page.locator('#export').click();const download=await promised;const path=`test-results/duel-${left}-${right}.json`;await download.saveAs(path);const exported=JSON.parse(await readFile(path,'utf8'));
    assert.deepEqual(exported.players.map(p=>p.type),[left,right]);assert.equal(exported.winner,['survival','score'].includes(mode)?'right':'left');
    for(const [i,side] of ['left','right'].entries()){
      const decisions=exported.decisions.filter(d=>d.side===side);assert.ok(decisions.length>=3);assert.ok(decisions.every(d=>d.result.engineId===[left,right][i]));
      const drops=decisions.filter(d=>d.status.startsWith('Hard drop'));assert.ok(drops.length>=3);assert.ok(drops.every(d=>d.reserveAtDrop>=3));
    }
    console.log(`Passed ${left} vs ${right}: independent autoplay, queue gate, pause, ${mode} result, panel histories and export.`);
  }
  // Human controls follow the manual board, including when it is on the right.
  await page.locator('#left-player').selectOption('laya');await page.locator('#model-choice').selectOption('human');await ready();await page.locator('#start-match').click();await page.keyboard.press('Space');
  assert.equal(await page.locator('#ai-pieces').textContent(),'1');assert.equal(await page.locator('#human-pieces').textContent(),'0');assert.match(await page.locator('#control-label').textContent(),/right board/);
  await page.evaluate(()=>window.matchFixture().ai.over=true);await page.waitForFunction(()=>document.getElementById('pause-match').disabled);
  await page.locator('#left-player').selectOption('human');await page.locator('#model-choice').selectOption('von');await ready();await page.locator('#start-match').click();await page.keyboard.press('Space');assert.equal(await page.locator('#human-pieces').textContent(),'1');
  await page.locator('#pause-match').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/duel-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('Passed human on either side and mobile layout. No browser errors.');
}finally{await browser.close();}
