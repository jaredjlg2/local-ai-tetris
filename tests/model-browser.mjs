import {chromium,browserOptions} from './browser-runtime.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch(browserOptions);
try{
  const page=await browser.newPage({viewport:{width:1500,height:1120}}),errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().endsWith('/api/decide')&&r.ok())results.push(await r.json());});
  let releaseOld,holdFirst=true;const gate=new Promise(resolve=>releaseOld=resolve);
  await page.route('**/api/decide',async route=>{
    if(holdFirst&&route.request().postDataJSON().model==='laya'){holdFirst=false;const response=await route.fetch();await gate;await route.fulfill({response});}else await route.continue();
  });
  await page.goto('http://127.0.0.1:8776/');await page.waitForFunction(()=>!document.getElementById('autopilot').disabled);
  await page.locator('#autopilot').click();await page.waitForFunction(()=>document.getElementById('brain-state').textContent.includes('Evaluating'));
  await page.locator('#model-choice').selectOption('von');assert.equal(await page.locator('#manual').getAttribute('aria-pressed'),'true');
  releaseOld();await page.waitForTimeout(800);assert.equal(await page.locator('#decision-count').textContent(),'0','old-model answer must be discarded');
  await page.waitForFunction(()=>!document.getElementById('autopilot').disabled);assert.match(await page.locator('#autopilot').textContent(),/Von/);
  await page.locator('#pace').fill('0');await page.locator('#autopilot').click();
  await page.waitForFunction(()=>Number(document.getElementById('pieces').textContent)>=5,{},{timeout:60000});
  await page.locator('#manual').click();assert.ok(results.some(r=>r.engineId==='von'));
  await page.screenshot({path:'test-results/von-solo.png',fullPage:true});
  const source=await readFile('public/versus.js','utf8');
  await page.route('**/versus.js',route=>route.fulfill({contentType:'text/javascript',body:source+'\nwindow.matchFixture=()=>match;'}));
  await page.goto('http://127.0.0.1:8776/versus');assert.equal(await page.locator('#model-choice').inputValue(),'von','selection persists across modes');
  await page.waitForFunction(()=>!document.getElementById('start-match').disabled);
  for(const mode of ['survival','lines','score','timed']){
    await page.locator('#match-mode').selectOption(mode);await page.locator('#start-match').click();
    assert.equal(await page.locator('#model-choice').isDisabled(),true);
    await page.waitForFunction(()=>Number(document.getElementById('ai-pieces').textContent)>=3,{},{timeout:60000});
    await page.evaluate(()=>{const m=window.matchFixture();if(m.mode==='survival')m.human.over=true;else if(m.mode==='lines')m.ai.lines=m.target;else if(m.mode==='score')m.ai.score=m.target;else{m.elapsed=m.durationMs;m.ai.score=10000;}});
    await page.waitForFunction(()=>document.getElementById('match-banner').textContent.includes('Von wins'));
    assert.equal(await page.locator('#model-choice').isDisabled(),false);
  }
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;await download.saveAs('test-results/von-match-export.json');
  const exported=JSON.parse(await readFile('test-results/von-match-export.json','utf8'));
  assert.equal(exported.players[1].type,'von');assert.equal(exported.winner,'right');assert.ok(exported.decisions.every(d=>d.result.engineId==='von'));
  await page.screenshot({path:'test-results/von-versus.png',fullPage:true});
  await page.locator('#model-choice').selectOption('laya');await page.waitForFunction(()=>!document.getElementById('start-match').disabled);await page.locator('#start-match').click();
  await page.waitForFunction(()=>Number(document.getElementById('ai-pieces').textContent)>=3,{},{timeout:60000});await page.locator('#pause-match').click();
  assert.match(await page.locator('.ai-board .player-heading h2').textContent(),/Laya/);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,vonResponses:results.filter(r=>r.engineId==='von').length,layaResponses:results.filter(r=>r.engineId==='laya').length,checks:['mid-inference model switch rejects stale answer','Von solo autoplay','persistent selector','Von in all four match modes','match model locked','Von winner and export labels','Laya still plays after switch','mobile layout'],errors},null,2));
}finally{await browser.close();}
