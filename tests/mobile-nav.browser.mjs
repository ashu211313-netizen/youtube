// Local Postgres + mock SDK only. Desktop WebKit is not physical iPhone Safari.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const engineName=process.env.QA_ENGINE||'webkit';
const touch=process.env.QA_MOBILE==='1';
const { [engineName]:engine }=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const output=process.env.QA_OUTPUT||`../../outputs/ios-nav-clip-${engineName}${touch?'-touch':''}`;
await fs.mkdir(output,{recursive:true});
const server=spawn(process.execPath,[fileURLToPath(new URL('./browser-server.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:process.env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let browser;
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Local fixture startup timeout')),20000);
    server.stdout.on('data',chunk=>{if(String(chunk).includes('http://127.0.0.1:8766')){clearTimeout(timer);resolve();}});
    server.stderr.on('data',chunk=>{clearTimeout(timer);reject(Error(String(chunk)));});
    server.on('exit',code=>{clearTimeout(timer);if(code)reject(Error('Fixture exited: '+code));});
  });
  browser=await engine.launch({headless:true});
  const context=await browser.newContext(touch?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await context.newPage(),issues=[],measurements=[];
  page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});
  const go=async id=>{const button=page.locator(`[data-page="${id}"]:visible`).first();if(touch)await button.tap();else await button.click();};
  const afterPaint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const scroll=async y=>page.evaluate(async y=>{window.scrollTo({top:y,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);},y);
  const measure=async label=>{
    const m=await page.evaluate(()=>{
      const nav=document.querySelector('#mobileNav'),r=nav.getBoundingClientRect(),v=visualViewport;
      const s=getComputedStyle(nav),ps=getComputedStyle(nav,'::before');
      const safe=parseFloat(s.paddingBottom),first=nav.querySelector('button').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,scrollY,visualHeight:v?.height,visualTop:v?.offsetTop,visualScale:v?.scale,
        visibleBottom:(v?.offsetTop||0)+(v?.height||innerHeight),nav:{top:r.top,bottom:r.bottom,height:r.height,position:s.position,paddingBottom:s.paddingBottom,background:s.backgroundColor,blur:s.backdropFilter},
        panel:{height:parseFloat(ps.height),background:ps.backgroundColor,topGap:first.top-r.top-parseFloat(ps.top),bottomGap:r.bottom-parseFloat(ps.bottom)-first.bottom},
        transparentBand:parseFloat(ps.bottom),
        safeAreaHit:safe>0&&!!document.elementFromPoint(r.x+r.width/2,r.bottom-safe/2)?.closest('#mobileNav'),
        mainPadding:parseFloat(getComputedStyle(document.querySelector('.main')).paddingBottom),
        horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
        buttons:[...nav.querySelectorAll(':scope > button')].map(b=>{const r=b.getBoundingClientRect();return {page:b.dataset.page,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-page]')===b};})};
    });
    assert.equal(m.horizontalOverflow,false,label);assert.equal(m.nav.position,'fixed',label);
    assert(Math.abs(m.nav.bottom-m.visibleBottom)<=1,`${label}: visible bottom gap ${m.visibleBottom-m.nav.bottom}`);
    assert.equal(m.nav.background,'rgba(0, 0, 0, 0)',label+' host is transparent');
    assert.equal(m.nav.blur,'none',label+' host has no backdrop filter');
    assert.notEqual(m.panel.background,m.nav.background,label+' panel keeps its background');
    assert.equal(m.panel.height,60,label+' white panel stays 60px');
    assert.equal(m.panel.topGap,8,label+' top padding plus border');
    assert.equal(m.panel.bottomGap,8,label+' bottom padding plus border');
    assert.equal(m.transparentBand,parseFloat(m.nav.paddingBottom),label+' separate safe-area');
    assert.equal(m.nav.height,m.panel.height+m.transparentBand,label+' full fixed footprint');
    assert.equal(m.mainPadding,m.nav.height+16,label+' shared main clearance');
    assert.equal(m.safeAreaHit,false,label+' safe-area does not catch touches');
    assert.equal(m.buttons.length,4,label);
    assert(m.buttons.every(b=>b.height>=44&&b.hit),label+' four tappable controls');measurements.push({label,...m});return m;
  };
  for(const [width,height] of [[390,844],[430,932],[768,1024],[1280,900],[844,390]]){
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:8766/');
    await page.waitForFunction(()=>document.querySelector('#dataLoadStatus').textContent==='データ取得済み');
    await afterPaint();
    if(width>900){
      assert.equal(await page.locator('#mobileNav').isVisible(),false);assert.equal(await page.locator('.sidebar').isVisible(),true);
      await page.locator('#postStatsButton').click();await page.mouse.click(2,2);assert.equal(await page.locator('#postStatsModal').evaluate(d=>d.open),true);
      await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#postStatsModal').open);
      console.log('PASS PC navigation and backdrop/Escape unchanged');continue;
    }
    await measure('initial');
    for(const id of ['dashboard','videos','ideas','achievements']){
      await go(id);assert.equal(await page.locator(`#mobileNav [data-page="${id}"]`).getAttribute('class'),'mobile-nav-item active');
      await scroll(0);await measure(id+'-top');await scroll(await page.evaluate(()=>document.documentElement.scrollHeight/2));await measure(id+'-middle');
      await scroll(100000);const end=await measure(id+'-end');
      const activePage=await page.locator(`#${id}`).boundingBox();
      assert(activePage.y+activePage.height<=end.nav.top-8,id+' last content is reachable above nav');
      if(id==='dashboard'){
        const last=await page.locator('#weeklyScheduleList .weekly-schedule-day').last().boundingBox();assert(last.y+last.height<=end.nav.top-8,'last weekday card is reachable above nav');
      }
      for(const y of [0,100000,100,100000,0])await scroll(y);await measure(id+'-rapid-roundtrip');
    }
    await go('dashboard');await scroll(500);const before=await page.evaluate(()=>scrollY);
    for(const call of ['openForm("video")','openForm("video",data.videos[0].id)','openVideoDetail(data.videos[0].id)','openForm("idea")','openForm("idea",data.ideas[0].id)','openIdeaDetail(data.ideas[0].id)','openIdeaItemDetail(data.ideaItems[0].id)','openAchievementGoalModal()']){
      await page.evaluate(call);
      const dialog=page.locator('dialog[open]').last();await dialog.waitFor({state:'visible'});
      assert.equal(await dialog.evaluate(d=>d.scrollTop),0,call+' starts at top');
      assert.equal(await page.locator('body').evaluate(b=>getComputedStyle(b).position),'fixed');
      assert.equal(await page.locator('#mobileNav').getAttribute('aria-hidden'),'true');
      const input=dialog.locator('input:not([type=hidden]),textarea').first();if(await input.count()){await input.focus();await input.blur();}
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await page.waitForFunction(()=>appResumeTimer===null&&appResumeInFlight===null);
      assert.equal(await dialog.evaluate(d=>d.open),true,'open dialog survives foreground recovery');
      await dialog.locator('[data-close]').first().click();await page.waitForFunction(()=>!document.body.classList.contains('modal-scroll-locked'));
      assert.equal(await page.evaluate(()=>document.body.style.top),'');assert(Math.abs(await page.evaluate(()=>scrollY)-before)<=1,'background restored');await measure('after-'+call.split('(')[0]);
    }
    for(const shortHeight of [Math.max(320,height-280),height]){
      await page.setViewportSize({width,height:shortHeight});
      // WebKit can deliver the visual viewport resize after setViewportSize resolves.
      await page.waitForFunction(h=>innerHeight===h&&Math.abs((visualViewport?.height??innerHeight)-h)<=1,shortHeight);
      await afterPaint();
      await measure('visible-region-resize');
    }
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new Event('focus'));});
    await page.waitForFunction(()=>appResumeTimer===null&&appResumeInFlight===null);await measure('foreground-resume');
    // Simulated non-zero env substitute: verifies shared CSS geometry, not device OS insets.
    await page.evaluate(()=>document.documentElement.style.setProperty('--mobile-nav-safe-bottom','34px'));await scroll(100000);const inset=await measure('synthetic-safe-area');assert.equal(inset.nav.paddingBottom,'34px');
    assert.equal(inset.nav.height,94);assert.equal(inset.mainPadding,110);
    await page.evaluate(()=>document.querySelector('.main').style.setProperty('--mobile-nav-height','initial'));
    await measure('missing-inherited-nav-height');
    await page.evaluate(()=>document.querySelector('.main').style.removeProperty('--mobile-nav-height'));
    const last=await page.locator('#weeklyScheduleList .weekly-schedule-day').last().boundingBox();assert(last.y+last.height<=inset.nav.top-8);
    await page.evaluate(()=>document.documentElement.style.removeProperty('--mobile-nav-safe-bottom'));await page.screenshot({path:`${output}/${width}x${height}-nav.png`,fullPage:true});
    console.log(`PASS ${engineName} ${width}x${height}: four pages, scroll bounds, eight dialogs, resize/resume`);
  }
  await page.goto('http://127.0.0.1:8766/');await page.waitForFunction(()=>document.querySelector('#dataLoadStatus').textContent==='データ取得済み');
  const rewardMonth=await page.evaluate(async()=>{
    const month=shiftMonthKey(currentMonthKey(),-2);
    const rows=[['Shorts','横動画の切り抜き'],['横動画','横動画の切り抜き'],['Shorts','競艇ニュース,横動画の切り抜き'],['Shorts','レース映像'],['Shorts','競艇ニュース'],['Shorts','選手解説'],['横動画','用語解説']];
    const response=await fetch('/qa-query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:'videos',action:'insert',payload:rows.map(([video_type,tags],i)=>({title:'reward fixture '+i,video_type,tags,status:'投稿済み',post_date:month+'-12'}))})});
    const result=await response.json();if(result.error)throw Error('Local reward fixture insert failed');await loadAllData();return month;
  });
  for(const [width,height] of [[390,844],[430,932],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});await page.locator('#postStatsButton').click();await page.locator('#postStatsMonthSelect').selectOption(rewardMonth);
    assert.equal(await page.locator('#postStatsMonthTotal').textContent(),'7');assert.equal(await page.locator('#postStatsRewardTotal').textContent(),'¥1,200');
    assert.equal(await page.locator('#postStatsRewardClipFormula').textContent(),'3本 × 0円');assert.equal(await page.locator('#postStatsRewardRaceFormula').textContent(),'1本 × 0円');
    const layout=await page.locator('#postStatsModal').evaluate(d=>({overflow:d.scrollWidth>d.clientWidth,rows:[...d.querySelectorAll('.reward-breakdown article')].map(e=>({overflow:e.scrollWidth>e.clientWidth,label:e.querySelector('span').getBoundingClientRect().right,amount:e.querySelector('strong').getBoundingClientRect().left}))}));
    assert.equal(layout.overflow,false);assert(layout.rows.every(r=>!r.overflow&&r.label<r.amount),'long clip label and amount never overlap');
    await page.locator('#postStatsRewardClipFormula').evaluate(e=>e.closest('article').scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:`${output}/${width}-clip-breakdown.png`});
    await page.locator('#postStatsModal [data-close]').click();await page.waitForFunction(()=>!document.body.classList.contains('modal-scroll-locked'));
  }
  console.log('PASS four-width reward modal: 7 posts, 1200 yen, clip 3/race 1; no overlap');
  assert.deepEqual(issues,[]);await fs.writeFile(`${output}/measurements.json`,JSON.stringify(measurements,null,2));
  console.log(`PASS ${engineName}: ${measurements.length} geometry assertions, console error/warning 0`);
} finally {if(browser)await browser.close();server.kill();}
