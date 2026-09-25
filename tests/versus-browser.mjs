import {chromium,browserOptions} from './browser-runtime.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch(browserOptions);
try{
  const page=await browser.newPage({viewport:{width:1500,height:1120}}),errors=[],responses=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',async r=>{if(r.url().endsWith('/api/decide')&&r.ok())responses.push(await r.json());});
  let requests=0,releaseReserve;
  const reserveGate=new Promise(resolve=>releaseReserve=resolve);
  await page.route('**/api/decide',async route=>{
    if(++requests===4){const response=await route.fetch();await reserveGate;await route.fulfill({response});}
    else await route.continue();
  });
  await page.goto('http://127.0.0.1:8776/versus');await page.waitForFunction(()=>!document.getElementById('start-match').disabled);
  await page.locator('#speed').fill('0.5');await page.locator('#speed').dispatchEvent('input');
  await page.locator('#start-match').click();
  assert.equal(await page.locator('#speed').isDisabled(),true);
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');await page.keyboard.press('Space');await page.keyboard.press('KeyC');
  assert.equal(await page.locator('#human-pieces').textContent(),'1');
  await page.waitForFunction(()=>document.getElementById('pipeline-status').textContent.startsWith('2/3 ready'),{},{timeout:30000});
  assert.equal(await page.locator('#ai-pieces').textContent(),'0','must not hard-drop with only two of three future decisions ready');
  const activeRow=()=>page.evaluate(()=>{
    const c=document.getElementById('ai-board').getContext('2d');
    const palette=['131,200,203','223,199,128','184,160,204','171,209,139','215,139,121','128,159,206','220,171,115'];
    for(let y=0;y<20;y++)for(let x=0;x<10;x++){const p=c.getImageData(x*30+15,y*30+15,1,1).data;if(palette.includes([...p].slice(0,3).join(',')))return y;}
    return -1;
  });
  const rowBefore=await activeRow();await page.waitForTimeout(2500);const rowAfter=await activeRow();
  assert.ok(rowBefore>=0&&rowAfter>rowBefore,'normal gravity continues during reserve building');
  assert.equal(await page.locator('#ai-pieces').textContent(),'0');releaseReserve();
  await page.waitForFunction(()=>Number(document.getElementById('ai-pieces').textContent)>=8,{},{timeout:60000});
  assert.ok(Number((await page.locator('#pipeline-hits').textContent()).split(' ')[0])>0,'AI must consume advance plans');
  await page.locator('#pause-match').click();const aiPieces=await page.locator('#ai-pieces').textContent(),humanPieces=await page.locator('#human-pieces').textContent(),clock=await page.locator('#clock').textContent();
  await page.keyboard.press('Space');await page.waitForTimeout(1000);
  assert.equal(await page.locator('#ai-pieces').textContent(),aiPieces);assert.equal(await page.locator('#human-pieces').textContent(),humanPieces);assert.equal(await page.locator('#clock').textContent(),clock);
  await page.screenshot({path:'test-results/versus-desktop.png',fullPage:true});
  await page.locator('#pause-match').click();
  await page.waitForFunction(previous=>Number(document.getElementById('ai-pieces').textContent)>Number(previous),aiPieces,{timeout:30000});
  for(let i=0;i<25;i++){
    if((await page.locator('#match-banner').textContent()).includes('wins'))break;
    await page.keyboard.press('Space');
  }
  assert.match(await page.locator('#match-banner').textContent(),/Laya wins/);
  assert.equal(await page.locator('#speed').isDisabled(),false);
  const lostPieces=await page.locator('#human-pieces').textContent();await page.keyboard.press('Space');assert.equal(await page.locator('#human-pieces').textContent(),lostPieces);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;await download.saveAs('test-results/versus-export.json');
  const exported=JSON.parse(await readFile('test-results/versus-export.json','utf8'));
  const drops=exported.decisions.filter(d=>d.status.startsWith('Hard drop'));
  assert.ok(drops.length>=8);assert.ok(drops.every(d=>d.reserveAtDrop>=3),'every accelerated placement requires its full reserve');
  await page.locator('#start-match').click();assert.equal(await page.locator('#human-pieces').textContent(),'0');assert.equal(await page.locator('#decision-count').textContent(),'0');
  await page.locator('#pause-match').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/versus-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['human keyboard and hold','AI autoplay with advance plans','shared pause and frozen clock','human top-out and declared winner','finished match rejects moves','match export','restart','mobile layout'],liveResponses:responses.length,browserErrors:errors},null,2));
}finally{await browser.close();}
