// Local-only headless QA; no user's browser session or production requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const output=process.env.QA_OUTPUT||'../../outputs/two-views-delete-qa';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
const page=await context.newPage(),consoleIssues=[];
page.on('console',m=>{if(['error','warning'].includes(m.type()))consoleIssues.push(m.text());});
page.on('pageerror',e=>consoleIssues.push(e.message));
page.on('dialog',d=>d.accept());
const url='http://127.0.0.1:8766/';
const navigate=async name=>page.locator(`[data-page="${name}"]:visible`).first().click();
await page.goto(url);await page.locator('#appRoot').waitFor({state:'visible'});
const measurements=[];
for(const [width,height]of [[390,844],[430,932],[768,1024],[1280,900]]){
  await page.setViewportSize({width,height});await navigate('videos');
  assert.deepEqual(await page.locator('#videoViewToggle button').evaluateAll(es=>es.map(e=>e.dataset.videoView)),['card','minimal']);
  for(const mode of ['card','minimal']){
    await page.locator(`[data-video-view="${mode}"]`).click();
    const metric=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,rows:[...document.querySelectorAll('#videoList [data-video-card-id]')].map(e=>({height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth})),status:[...document.querySelectorAll('.video-row-status')].map(e=>({font:getComputedStyle(e).fontSize,height:e.getBoundingClientRect().height})),buttons:[...document.querySelectorAll('#videoViewToggle button')].map(e=>e.textContent.trim())}));
    assert.equal(metric.overflow,false);assert(metric.rows.every(r=>!r.overflow));if(mode==='minimal')assert(metric.status.every(s=>s.font==='16px'&&s.height>=44));
    measurements.push({mode,...metric});await page.screenshot({path:`${output}/${width}-${mode}.png`,fullPage:true});
    await page.reload();await page.locator('#appRoot').waitFor({state:'visible'});await navigate('videos');assert.equal(await page.locator(`[data-video-view="${mode}"]`).getAttribute('aria-pressed'),'true');
  }
  console.log(`PASS ${width}x${height}: two modes, no overflow, minimal status, reload persistence`);
}
await page.setViewportSize({width:390,height:844});await page.goto(url+'?qa=delete-error');await page.locator('#appRoot').waitFor({state:'visible'});await navigate('videos');
await page.locator('.video-minimal-row').first().click();await page.locator('#detailDeleteButton').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('移動できませんでした'));
assert.equal(await page.locator('#detailDeleteButton').isEnabled(),true);assert.equal(await page.locator('#detailDeleteButton').textContent(),'削除');assert.equal(await page.locator('#videoDetailModal').evaluate(e=>e.open),true);
await page.screenshot({path:`${output}/delete-error.png`,fullPage:false});
console.log('PASS detail DB failure: no success, modal retained, original enabled button');
await page.goto(url);await page.locator('#appRoot').waitFor({state:'visible'});await navigate('videos');await page.locator('.video-minimal-row').first().click();
const videoId=await page.locator('#detailDeleteButton').getAttribute('data-delete-id');await page.locator('#detailDeleteButton').click();await page.waitForFunction(()=>!document.querySelector('#videoDetailModal').open);
await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('ゴミ箱へ移動しました'));
assert.equal(await page.locator(`[data-video-card-id="${videoId}"]`).count(),0);await page.reload();await page.locator('#appRoot').waitFor({state:'visible'});await navigate('videos');assert.equal(await page.locator(`[data-video-card-id="${videoId}"]`).count(),0);
console.log('PASS detail soft delete persists after reload');
await page.locator('#trashButton').click();const permanent=page.locator(`[data-permanent-delete-id="${videoId}"]`);await permanent.click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('完全に削除しました'));
assert.equal(await page.locator(`[data-permanent-delete-id="${videoId}"]`).count(),0);await page.locator('#trashModal [data-close]').click();
console.log('PASS trash permanent delete settles and disappears');
await navigate('ideas');await page.getByText('旧データ・画像1枚',{exact:true}).click();await page.locator('#ideaDetailDeleteButton').click();await page.waitForFunction(()=>!document.querySelector('#ideaDetailModal').open);
console.log('PASS idea detail soft delete closes matching modal');
await page.getByText('複数画像の企画ボード',{exact:true}).click();await page.getByText('画像1枚の企画内アイデア',{exact:true}).click();await page.locator('#ideaItemDetailDeleteButton').click();await page.waitForFunction(()=>!document.querySelector('#ideaItemDetailModal').open);
console.log('PASS nested detail delete closes matching modal');
assert.deepEqual(consoleIssues,[]);console.log('PASS console error/warning 0');
await fs.writeFile(`${output}/measurements.json`,JSON.stringify(measurements,null,2));
await browser.close();console.log('10 browser checks passed');
