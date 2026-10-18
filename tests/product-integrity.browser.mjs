// Local isolated Postgres + mock SDK. Never touches real accounts or sends email.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const engines=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const engine=process.env.QA_ENGINE||'chromium';
const output=`../../outputs/product-integrity-${engine}`;
await fs.mkdir(output,{recursive:true});
const browser=await engines[engine].launch({headless:true});
const context=await browser.newContext();
await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
const page=await context.newPage(),issues=[],measurements=[];
page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});page.on('pageerror',e=>issues.push(e.message));
const url='http://127.0.0.1:8766/';
const nav=async name=>page.locator(`[data-page="${name}"]:visible`).first().click();
const layout=async label=>{
  const metrics=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
    controls:[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e=>e.getClientRects().length).map(e=>({font:parseFloat(getComputedStyle(e).fontSize),overflow:e.scrollWidth>e.clientWidth+1})),
    cards:[...document.querySelectorAll('.video-minimal-row,.video-card,.achievement-tag-card,.auth-card')].filter(e=>e.getClientRects().length).map(e=>({overflow:e.scrollWidth>e.clientWidth+1}))}));
  assert.equal(metrics.overflow,false,label);assert(metrics.controls.every(c=>c.font>=16),label+' input font');assert(metrics.cards.every(c=>!c.overflow),label+' card overflow');measurements.push({label,...metrics});
  await page.screenshot({path:`${output}/${metrics.width}-${label}.png`,fullPage:true});
};
for(const width of [390,430,768,1280]){
  await page.setViewportSize({width,height:900});await page.goto(url);await page.locator('#appRoot').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#dataLoadStatus').textContent==='データ取得済み'&&document.querySelector('#syncStatus').textContent.includes('Realtime'));
  assert.equal(await page.locator('#dataLoadStatus').textContent(),'データ取得済み');assert.match(await page.locator('#syncStatus').textContent(),/Realtime/);
  await nav('videos');
  await page.locator('[data-video-view="card"]').click();assert(await page.locator('.video-card .video-data-warnings').count()>0);await layout('card-warnings');
  await page.locator('[data-video-view="minimal"]').click();assert(await page.locator('.video-warning-summary').count()>0);await layout('minimal-warnings');
  await page.locator('.video-minimal-row').first().click();await page.locator('#videoDetailModal').waitFor({state:'visible'});await layout('video-detail');await page.locator('#videoDetailModal [data-close]').click();
  await nav('achievements');await layout('achievements');
  const select=page.locator('#achievementMonthSelect'),months=await select.locator('option').evaluateAll(es=>es.map(e=>e.value));
  if(months.length>1){await select.selectOption(months[1]);assert.equal(await page.locator('#achievementGoalButton').isVisible(),false);await layout('past-month');await select.selectOption(months[0]);}
  await page.goto(url+'?qa=logged-out');await page.locator('#loginForm').waitFor({state:'visible'});await page.locator('#forgotPasswordButton').click();await page.locator('#passwordResetEmail').fill('qa@example.test');
  await page.locator('#passwordResetRequestButton').click();await page.waitForFunction(()=>document.querySelector('#passwordRecoveryMessage').textContent.includes('登録されている場合'));
  assert.equal(await page.evaluate(()=>window.qaAuth.resetRequests),1);await layout('reset-request');
  await page.goto(url+'?qa=recovery&recovery=1');await page.locator('#passwordUpdateForm').waitFor({state:'visible'});assert.equal(await page.locator('#appRoot').isVisible(),false);await layout('recovery');
  await page.locator('#recoveryPassword').fill('test-only-new-password');await page.locator('#recoveryPasswordConfirm').fill('test-only-new-password');await page.locator('#passwordUpdateButton').click();
  await page.locator('#loginForm').waitFor({state:'visible'});assert.match(await page.locator('#loginMessage').textContent(),/変更しました/);assert.equal(await page.evaluate(()=>window.qaAuth.passwordUpdates),1);assert.equal(await page.locator('#appRoot').isVisible(),false);
  await page.goto(url+'?recovery=1');await page.locator('#passwordResetRequestForm').waitFor({state:'visible'});assert.equal(await page.locator('#appRoot').isVisible(),false);await layout('invalid-link');
  console.log(`PASS ${engine} ${width}: warnings, goals lock, request/recovery/invalid callback, no overflow`);
}
await page.goto(url+'?qa=optional-error');await page.locator('#appRoot').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Realtime'));
assert.equal(await page.locator('#dataLoadStatus').textContent(),'一部データ未取得');
// This one intentional partial-read warning is expected; all normal flows above must be clean.
assert(issues.every(x=>x.startsWith('一部データの読み込み:')),JSON.stringify(issues));
await fs.writeFile(`${output}/measurements.json`,JSON.stringify({measurements,expectedPartialWarnings:issues.length},null,2));
await browser.close();console.log(`PASS ${engine}: 4 widths, console errors 0; expected partial-read warning ${issues.length}`);
