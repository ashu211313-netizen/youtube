const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./fixtures/app-harness.cjs');
const key='boat-manager-video-view';
function seed(h) {
  h.run(`data.videos=Array.from({length:10},(_,i)=>mapVideo({id:String(i),title:'動画'+i,video_type:'Shorts',status:i%2?'編集待ち':'投稿済み',post_date:'2026-09-01',tags:'選手解説,ネット競艇',youtube_views:i}));`);
}
const ids=html=>[...html.matchAll(/data-video-card-id="([^"]+)"/g)].map(m=>m[1]);
test('default card; compact then card restores existing card markup exactly',()=>{
  const h=harness(),base=harness({ref:'033bbdc5fb9e4cd724c0ec8b71862aff61bcfead'});seed(h);seed(base);
  h.run('renderVideos()');base.run('renderVideos()');
  assert.equal(h.run('activeVideoViewMode'),'card');
  assert.equal(h.node('videoList').innerHTML,base.node('videoList').innerHTML);
  h.run(`setVideoViewMode('compact')`);assert.match(h.node('videoList').innerHTML,/video-compact-row/);
  h.run(`setVideoViewMode('card')`);assert.equal(h.node('videoList').innerHTML,base.node('videoList').innerHTML);
});
test('all three filters retain exactly the same ordered IDs in either mode',()=>{
  const h=harness();seed(h);
  for(const filter of ['all','編集待ち','投稿済み']) {
    h.context.filter=filter;h.run(`activeVideoFilter=filter;setVideoViewMode('card')`);
    const card=ids(h.node('videoList').innerHTML);
    h.run(`setVideoViewMode('compact')`);
    assert.deepEqual(ids(h.node('videoList').innerHTML),card);
    assert.equal(card.length,filter==='all'?10:5);assert.equal(h.run('activeVideoFilter'),filter);
  }
});
test('selection persists across a fresh app and invalid/unavailable storage falls back safely',()=>{
  const h=harness();h.run(`setVideoViewMode('compact')`);
  assert.equal(harness({initialStorage:[...h.storage]}).run('activeVideoViewMode'),'compact');
  for(const value of ['{broken','list','true','obsolete','']) assert.equal(harness({initialStorage:[[key,value]]}).run('activeVideoViewMode'),'card');
  const denied=harness({storageError:true});assert.equal(denied.run('activeVideoViewMode'),'card');
  denied.run(`setVideoViewMode('compact')`);assert.equal(denied.run('activeVideoViewMode'),'compact');
});
test('updated metrics and Realtime renderAll keep compact mode and current filter',()=>{
  const h=harness();seed(h);h.run(`activeVideoFilter='投稿済み';setVideoViewMode('compact');data.videos[0].youtubeViews=123456789;renderAll()`);
  assert.equal(h.run('activeVideoViewMode'),'compact');assert.equal(h.run('activeVideoFilter'),'投稿済み');
  assert.match(h.node('videoList').innerHTML,/123,456,789回/);assert.equal(ids(h.node('videoList').innerHTML).length,5);
});
test('compact uses existing status/detail attributes, fallback and active tags; unavailable views are not zero',()=>{
  const h=harness();h.run(`data.videos=[mapVideo({id:'x',title:'<unsafe>',video_type:'Shorts',status:'編集待ち',tags:'ネット競艇,選手解説,競艇ニュース'})];setVideoViewMode('compact')`);
  const html=h.node('videoList').innerHTML;
  assert.match(html,/data-video-status-id="x"/);assert.match(html,/data-video-card-id="x"/);
  assert.match(html,/role="button"/);assert.match(html,/tabindex="0"/);assert.match(html,/is-thumbnail-error/);
  assert.match(html,/value="編集待ち" selected>投稿待ち/);assert.match(html,/#選手解説/);assert.match(html,/\+1/);
  assert(!html.includes('ネット競艇'));assert(!html.includes('<unsafe>'));assert(!html.includes('>0回<'));
});
test('status filter removes changed row and empty state is identical',()=>{
  const h=harness();seed(h);h.run(`activeVideoFilter='投稿済み';setVideoViewMode('compact');data.videos[0].status='編集待ち';renderVideos()`);
  assert(!ids(h.node('videoList').innerHTML).includes('0'));
  h.run(`data.videos=[];renderVideos()`);const compact=h.node('videoList').innerHTML;
  h.run(`setVideoViewMode('card')`);assert.equal(h.node('videoList').innerHTML,compact);assert.match(compact,/該当する動画はありません/);
});

test('resume, debounced Realtime refresh and successful sync preserve the selected view/filter',async()=>{
  const h=harness({client:{functions:{invoke:async()=>({data:{updated:['0'],failed:[]}})}}});seed(h);
  h.run(`authenticatedUserId='qa';activeVideoFilter='投稿済み';setVideoViewMode('compact');
    validateAuthenticatedSession=async()=>({user:{id:'qa'}});subscribeRealtime=async()=>{};
    runAutoYouTubeSync=async()=>{};var reloads=0;loadAllData=async()=>{reloads++;renderAll();return true;}`);
  assert.equal(await h.run('resumeAuthenticatedApp({forceDataReload:true})'),true);
  h.run('scheduleRealtimeRefresh();scheduleRealtimeRefresh()');await h.tick(200);
  await h.run(`syncYouTubeVideos(['0'],null,{silent:true})`);
  assert.equal(h.run('reloads'),3);assert.equal(h.run('activeVideoViewMode'),'compact');
  assert.equal(h.run('activeVideoFilter'),'投稿済み');assert.equal(ids(h.node('videoList').innerHTML).length,5);
});
