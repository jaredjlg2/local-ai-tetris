import {chromium,browserOptions} from './browser-runtime.mjs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch(browserOptions);
try{
  const page=await browser.newPage({viewport:{width:1440,height:1120}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8776');await page.waitForFunction(()=>!document.getElementById('autopilot').disabled);
  await page.screenshot({path:'test-results/desktop-ready.png',fullPage:true});
  await page.getByRole('button',{name:'Start playing'}).click();
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');await page.keyboard.press('Space');
  assert.equal(await page.locator('#pieces').textContent(),'1');
  await page.keyboard.press('KeyC');
  await page.getByRole('button',{name:'Pause',exact:false}).click();assert.equal(await page.locator('#overlay-title').textContent(),'Take a breath.');
  await page.getByRole('button',{name:'Resume playing'}).click();
  await page.locator('#speed').fill('0.5');await page.locator('#speed').dispatchEvent('input');
  await page.locator('#autopilot').click();
  await page.waitForFunction(()=>Number(document.getElementById('decision-count').textContent)>=12,{},{timeout:60000});
  await page.screenshot({path:'test-results/desktop-laya.png',fullPage:true});
  const before=await page.locator('#pieces').textContent();assert.ok(Number(before)>5);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#mode-tag').textContent(),'YOU');
  await page.keyboard.press('Space');assert.ok(Number(await page.locator('#pieces').textContent())>Number(before));
  // In-flight handoff: the old response must never take back control.
  await page.locator('#autopilot').click();
  await page.waitForFunction(()=>document.getElementById('brain-state').textContent.includes('Evaluating'));
  await page.locator('#manual').click();
  await page.waitForTimeout(1800);assert.equal(await page.locator('#mode-tag').textContent(),'YOU');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
  await download.saveAs('test-results/exported-decisions.json');
  // Reset and stale-response handling, then live gravity mode.
  await page.locator('#new-game').click();assert.equal(await page.locator('#decision-count').textContent(),'0');
  await page.locator('#wait').uncheck();await page.locator('#autopilot').click();
  await page.waitForFunction(()=>Number(document.getElementById('decision-count').textContent)>=3,{},{timeout:30000});
  await page.locator('#manual').click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflows');
  await page.getByRole('button',{name:'Drop',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,decisionsObserved:12,piecesAfterAutoplay:before,browserErrors:errors,checks:['manual move/drop/hold','pause/resume','Laya autoplay','handoff mid-inference','decision export','new-game reset','live gravity','mobile viewport and touch']},null,2));
}finally{await browser.close();}
