import {chromium,browserOptions} from './browser-runtime.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch(browserOptions);
try{
  const page=await browser.newPage({viewport:{width:1500,height:1120}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Expose fixtures only in this isolated browser, without adding a production debug API.
  const source=await readFile('public/versus.js','utf8');
  await page.route('**/versus.js',route=>route.fulfill({contentType:'text/javascript',body:source+'\nwindow.matchFixture=()=>match;'}));
  await page.goto('http://127.0.0.1:8776/versus');
  await page.waitForFunction(()=>!document.getElementById('start-match').disabled);
  assert.equal(await page.locator('#target-setting').isHidden(),true);
  await page.locator('#match-mode').selectOption('lines');
  assert.equal(await page.locator('#match-target').inputValue(),'20');
  assert.match(await page.locator('#match-progress').textContent(),/Human 0 \/ 20/);
  await page.locator('#start-match').click();
  assert.equal(await page.locator('#match-mode').isDisabled(),true);
  assert.equal(await page.locator('#match-target').isDisabled(),true);
  await page.evaluate(()=>{
    const g=window.matchFixture().human;g.lines=19;g.board=Array.from({length:20},()=>Array(10).fill(0));
    g.board[19]=Array.from({length:10},(_,x)=>x===5?0:'G');g.active={type:'I',r:1,x:3,y:16};
  });
  await page.keyboard.press('Space');
  assert.match(await page.locator('#match-banner').textContent(),/You win! You reached 20 lines first/);
  assert.equal(await page.locator('#ai-state').textContent(),'Match over');
  assert.equal(await page.locator('#match-mode').isDisabled(),false);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
  const download=await downloadPromise;await download.saveAs('test-results/line-race-export.json');
  const exported=JSON.parse(await readFile('test-results/line-race-export.json','utf8'));
  assert.equal(exported.mode,'lines');assert.equal(exported.target,20);assert.equal(exported.reason,'target');
  await page.locator('#match-target').selectOption('40');await page.locator('#start-match').click();
  assert.match(await page.locator('#match-progress').textContent(),/Human 0 \/ 40/);
  // End this match, then confirm the next selected mode resets its targets and board.
  await page.evaluate(()=>window.matchFixture().human.over=true);
  await page.waitForFunction(()=>!document.getElementById('match-mode').disabled);
  await page.locator('#match-mode').selectOption('score');await page.locator('#match-target').selectOption('10000');await page.locator('#start-match').click();
  await page.evaluate(()=>{window.matchFixture().human.score=9999;});await page.keyboard.press('Space');
  assert.match(await page.locator('#match-banner').textContent(),/You reached 10,000 points first/);
  await page.locator('#match-mode').selectOption('timed');await page.locator('#match-target').selectOption('180000');await page.locator('#start-match').click();
  assert.equal(await page.locator('#clock-label').textContent(),'TIME REMAINING');assert.equal(await page.locator('#clock').textContent(),'03:00');
  await page.locator('#pause-match').click();const clock=await page.locator('#clock').textContent();
  await page.waitForTimeout(1100);assert.equal(await page.locator('#clock').textContent(),clock);
  await page.evaluate(()=>{const m=window.matchFixture();m.elapsed=179950;m.human.score=200;m.ai.score=300;});
  await page.locator('#pause-match').click();
  await page.waitForFunction(()=>document.getElementById('match-banner').textContent.includes('Time is up'));
  assert.match(await page.locator('#match-banner').textContent(),/Laya wins. Time is up/);
  assert.equal(await page.locator('#clock').textContent(),'00:00');
  await page.locator('#match-mode').selectOption('lines');await page.locator('#start-match').click();await page.locator('#pause-match').click();
  await page.screenshot({path:'test-results/modes-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/modes-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Passed: mode/target controls, line and score race wins, timed result and pause, restart, exports, mobile layout; no browser errors.');
}finally{await browser.close();}
