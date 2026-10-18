const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./fixtures/app-harness.cjs');
const key='boat-manager-video-view';
function seed(h) {
  h.run(`data.videos=Array.from({length:10},(_,i)=>mapVideo({id:String(i),title:'動画'+i,video_type:'Shorts',status:i%2?'編集待ち':'投稿済み',post_date:'2026-09-01',tags:'選手解説,ネット競艇',youtube_views:i}));`);
}
const ids=html=>[...html.matchAll(/data-video-card-id="([^"]+)"/g)].map(m=>m[1]);
// Only the explicitly requested warning additions differ from the canonical view.
const withoutWarnings=html=>html.replace(/\s*<div class="video-data-warnings[^>]*>.*?<\/div>/gs,'').replace(/<span class="video-warning-summary[^>]*>.*?<\/span>/gs,'').replace(/<div class="video-minimal-heading">(<h4>.*?<\/h4>)<\/div>/gs,'$1').replace(/\n\s*\n/g,'\n');
test('default card; minimal then card restores latest-main card markup exactly',()=>{
  const h=harness(),base=harness({ref:'3d5470c7ccccf6e315d9f9d850869e4db0885012'});seed(h);seed(base);
  h.run('renderVideos()');base.run('renderVideos()');
  assert.equal(h.run('activeVideoViewMode'),'card');
  assert.equal(withoutWarnings(h.node('videoList').innerHTML),withoutWarnings(base.node('videoList').innerHTML));
  h.run(`setVideoViewMode('minimal')`);assert.match(h.node('videoList').innerHTML,/video-minimal-row/);
  h.run(`setVideoViewMode('card')`);assert.equal(withoutWarnings(h.node('videoList').innerHTML),withoutWarnings(base.node('videoList').innerHTML));
});
test('all three filters retain exactly the same ordered IDs in either mode',()=>{
  const h=harness();seed(h);
  for(const filter of ['all','編集待ち','投稿済み']) {
    h.context.filter=filter;h.run(`activeVideoFilter=filter;setVideoViewMode('card')`);
    const card=ids(h.node('videoList').innerHTML);
    h.run(`setVideoViewMode('minimal')`);
    assert.deepEqual(ids(h.node('videoList').innerHTML),card);
    assert.equal(card.length,filter==='all'?10:5);assert.equal(h.run('activeVideoFilter'),filter);
  }
});
test('selection persists across a fresh app and invalid/unavailable storage falls back safely',()=>{
  const h=harness();h.run(`setVideoViewMode('minimal')`);
  assert.equal(harness({initialStorage:[...h.storage]}).run('activeVideoViewMode'),'minimal');
  h.run(`setVideoViewMode('card')`);assert.equal(harness({initialStorage:[...h.storage]}).run('activeVideoViewMode'),'card');
  for(const value of ['compact','{broken','list','true','obsolete','']) assert.equal(harness({initialStorage:[[key,value]]}).run('activeVideoViewMode'),'card');
  const denied=harness({storageError:true});assert.equal(denied.run('activeVideoViewMode'),'card');
  denied.run(`setVideoViewMode('minimal')`);assert.equal(denied.run('activeVideoViewMode'),'minimal');
});
test('updated metrics and Realtime renderAll keep minimal mode and current filter',()=>{
  const h=harness();seed(h);h.run(`activeVideoFilter='投稿済み';setVideoViewMode('minimal');data.videos[0].youtubeViews=123456789;renderAll()`);
  assert.equal(h.run('activeVideoViewMode'),'minimal');assert.equal(h.run('activeVideoFilter'),'投稿済み');
  assert.match(h.node('videoList').innerHTML,/123,456,789回/);assert.equal(ids(h.node('videoList').innerHTML).length,5);
});
test('minimal preserves status/detail attributes and escapes text; unavailable views are not zero',()=>{
  const h=harness();h.run(`data.videos=[mapVideo({id:'x',title:'<unsafe>',video_type:'Shorts',status:'編集待ち',tags:'ネット競艇,選手解説,競艇ニュース'})];setVideoViewMode('minimal')`);
  const html=h.node('videoList').innerHTML;
  assert.match(html,/data-video-status-id="x"/);assert.match(html,/data-video-card-id="x"/);
  assert.match(html,/role="button"/);assert.match(html,/tabindex="0"/);assert.match(html,/video-row-status/);
  assert.match(html,/value="編集待ち" selected>投稿待ち/);assert(!html.includes('<img'));
  assert(!html.includes('ネット競艇'));assert(!html.includes('<unsafe>'));assert(!html.includes('>0回<'));
});
test('status filter removes changed row and empty state is identical',()=>{
  const h=harness();seed(h);h.run(`activeVideoFilter='投稿済み';setVideoViewMode('minimal');data.videos[0].status='編集待ち';renderVideos()`);
  assert(!ids(h.node('videoList').innerHTML).includes('0'));
  h.run(`data.videos=[];renderVideos()`);const minimal=h.node('videoList').innerHTML;
  h.run(`setVideoViewMode('card')`);assert.equal(h.node('videoList').innerHTML,minimal);assert.match(minimal,/該当する動画はありません/);
});

test('resume, debounced Realtime refresh and successful sync preserve the selected view/filter',async()=>{
  const h=harness({client:{functions:{invoke:async()=>({data:{updated:['0'],failed:[]}})}}});seed(h);
  h.run(`authenticatedUserId='qa';activeVideoFilter='投稿済み';setVideoViewMode('minimal');
    validateAuthenticatedSession=async()=>({user:{id:'qa'}});subscribeRealtime=async()=>{};
    runAutoYouTubeSync=async()=>{};var reloads=0;loadAllData=async()=>{reloads++;renderAll();return true;}`);
  assert.equal(await h.run('resumeAuthenticatedApp({forceDataReload:true})'),true);
  h.run('scheduleRealtimeRefresh();scheduleRealtimeRefresh()');await h.tick(200);
  await h.run(`syncYouTubeVideos(['0'],null,{silent:true})`);
  assert.equal(h.run('reloads'),3);assert.equal(h.run('activeVideoViewMode'),'minimal');
  assert.equal(h.run('activeVideoFilter'),'投稿済み');assert.equal(ids(h.node('videoList').innerHTML).length,5);
});

test('minimal markup matches latest main except neutral status class; obsolete thumbnail key is inert',()=>{
  const h=harness({initialStorage:[['boat-manager-video-thumbnail','off']]}),base=harness({ref:'3d5470c7ccccf6e315d9f9d850869e4db0885012'});seed(h);seed(base);
  h.run(`setVideoViewMode('minimal')`);base.run(`setVideoViewMode('minimal')`);
  assert.equal(withoutWarnings(h.node('videoList').innerHTML),withoutWarnings(base.node('videoList').innerHTML.replaceAll('video-compact-status','video-row-status')));
  h.run(`setVideoViewMode('card')`);assert(h.node('videoList').innerHTML.includes('video-thumbnail-shell'));
});
test('exactly two HTML choices; no obsolete runtime/style/DOM leftovers',()=>{
  const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../style.css'),'utf8'),h=harness();
  assert.deepEqual([...html.matchAll(/data-video-view="([^"]+)"/g)].map(m=>m[1]),['card','minimal']);
  for(const token of ['renderVideoCompactRow','videoThumbnailToggle','videoThumbnailVisible','VIDEO_THUMBNAIL_STORAGE_KEY','video-list--compact','video-compact-'])assert(![html,css,h.source].some(s=>s.includes(token)),token);
});
