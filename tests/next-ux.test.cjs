const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./fixtures/app-harness.cjs');

test('navigation handlers share the existing once-only event guard',()=>{
  const h=harness();let registrations=0;
  for(const id of ['videoDetailModal']) h.node(id).addEventListener=()=>registrations++;
  h.run('setupEventListeners()');const first=registrations;assert(first>0);
  h.run('setupEventListeners()');assert.equal(registrations,first);
});

test('touch handlers ignore interactive controls, scrolling, cancel and multitouch',()=>{
  const h=harness(), handlers={};
  h.node('videoDetailModal').addEventListener=(name,handler)=>{handlers[name]=handler;};
  h.context.window.matchMedia=()=>({matches:true});
  h.run("currentDetailVideoId='A';setupVideoDetailNavigation();navigateVideoDetail=step=>{currentDetailVideoId=String(step)}");
  const dialog=h.node('videoDetailModal');dialog.open=true;dialog.scrollTop=0;
  const start=(interactive=false,count=1)=>handlers.touchstart({target:{closest:()=>interactive?{}:null},touches:Array.from({length:count},()=>({clientX:200,clientY:100}))});
  const end=()=>handlers.touchend({touches:[],changedTouches:[{clientX:100,clientY:103}]});
  start(true);end();assert.equal(h.run('currentDetailVideoId'),'A');
  start(false,2);end();assert.equal(h.run('currentDetailVideoId'),'A');
  start();dialog.scrollTop=40;end();assert.equal(h.run('currentDetailVideoId'),'A');
  start();handlers.touchcancel();end();assert.equal(h.run('currentDetailVideoId'),'A');
  start();end();assert.equal(h.run('currentDetailVideoId'),'1');
});

test('managed dialogs reopen at top and capture background before native focus',()=>{
  const h=harness();h.context.requestAnimationFrame=fn=>fn();
  for(const id of ['formModal','videoDetailModal','ideaDetailModal','ideaItemDetailModal','achievementGoalModal','notificationModal','trashModal','postStatsModal']) {
    const dialog=h.node(id);dialog.scrollTop=800;h.context.window.scrollY=1000;
    dialog.showModal=function(){this.open=true;h.context.window.scrollY=40;};
    h.run(`openManagedDialog(elements.${id})`);
    assert.equal(dialog.scrollTop,0,id);assert.equal(h.run('lockedPageScrollY'),1000,id);
    dialog.scrollTop=900;h.run(`closeManagedDialog(elements.${id});syncDialogScrollLock()`);
    h.context.window.scrollY=1000;h.run(`openManagedDialog(elements.${id})`);assert.equal(dialog.scrollTop,0,id);
    h.run(`closeManagedDialog(elements.${id});syncDialogScrollLock()`);
  }
});

test('swipe intent rejects vertical/short/slow movement and respects filtered boundaries',()=>{
  const h=harness();
  for(const [dx,dy,ms,expected] of [[-80,5,300,1],[80,5,300,-1],[-80,90,300,0],[-30,0,100,0],[-80,0,2000,0]]) {
    assert.equal(h.run(`getVideoSwipeStep(${dx},${dy},${ms})`),expected);
  }
  h.run(`data.videos=[{id:'A',status:'投稿済み'},{id:'X',status:'編集待ち'},{id:'B',status:'投稿済み'},{id:'C',status:'投稿済み'}];activeVideoFilter='投稿済み';currentDetailVideoId='B';openVideoDetail=id=>{currentDetailVideoId=id;}`);
  for(const [step,id] of [[-1,'A'],[-1,'A'],[1,'B'],[1,'C'],[1,'C']]){h.run(`navigateVideoDetail(${step})`);assert.equal(h.run('currentDetailVideoId'),id);}
});

test('JST pace has explicit tolerance, remaining days includes today and month end is finite',()=>{
  const h=harness();
  for(const [actual,label] of [[30,'予定通り'],[40,'目標より速い'],[20,'目標より遅い']]) {
    assert.equal(h.run(`calculatePostingPace(60,${actual},new Date('2026-09-15T03:00:00Z')).label`),label);
  }
  assert.equal(h.run(`calculatePostingPace(60,35,new Date('2026-09-21T03:00:00Z')).requiredPerDay`),2.5);
  assert.equal(h.run(`calculatePostingPace(60,60,new Date('2026-09-30T03:00:00Z')).requiredPerDay`),0);
  assert.equal(h.run(`calculatePostingPace(60,35,new Date('2026-09-30T03:00:00Z')).requiredPerDay`),25);
  assert.equal(h.run(`calculatePostingPace(null,35).label`),'投稿目標未設定');
  assert.equal(h.run(`calculatePostingPace(60,30,new Date('2026-09-15T15:00:00Z')).day`),16);
});

test('month comparison preserves null, uses signed change and zero-base absolute difference',()=>{
  const h=harness();
  for(const [current,previous,expected] of [[120,100,'前月比 +20%'],[80,100,'前月比 -20%'],[100,100,'前月比 ±0%'],[10,0,'前月比 +10'],[10,null,'比較データなし'],[null,10,'比較データなし']]) {
    h.context.current=current;h.context.previous=previous;assert.equal(h.run('getMetricComparison(current,previous)'),expected);
  }
});

test('high badge uses two known months minimum, ignores null/future and includes ties',()=>{
  const h=harness();h.run(`currentMonthKey=()=> '2026-09';data.channelStats={subscriberCount:null};data.achievementSnapshots=[mapAchievementSnapshot({month_key:'2026-07',subscriber_count:100}),mapAchievementSnapshot({month_key:'2026-08',subscriber_count:200}),mapAchievementSnapshot({month_key:'2026-10',subscriber_count:999})]`);
  assert.equal(h.run(`isAchievementRecord('2026-08','subscribers')`),true);
  assert.equal(h.run(`isAchievementRecord('2026-07','subscribers')`),false);
  assert.equal(h.run(`isAchievementRecord('2026-09','subscribers')`),false);
  h.run(`data.achievementSnapshots[0].metrics.subscribers=200`);assert.equal(h.run(`isAchievementRecord('2026-07','subscribers')`),true);
  h.run(`data.achievementSnapshots.splice(0,1)`);assert.equal(h.run(`isAchievementRecord('2026-08','subscribers')`),false);
});

test('three views and thumbnail preference keep ordered IDs in all filters and persist',()=>{
  const h=harness();h.run(`data.videos=Array.from({length:10},(_,i)=>mapVideo({id:String(i),title:'動画'+i,status:i%2?'編集待ち':'投稿済み',youtube_video_id:'abcdefghijk'}));`);
  for(const filter of ['all','編集待ち','投稿済み']) {
    h.context.filter=filter;h.run('activeVideoFilter=filter');let expected;
    for(const mode of ['card','compact','minimal']) {
      h.context.mode=mode;h.run('setVideoViewMode(mode)');
      const ids=[...h.node('videoList').innerHTML.matchAll(/data-video-card-id="([^"]+)"/g)].map(m=>m[1]);
      if(!expected)expected=ids;assert.deepEqual(ids,expected);
    }
  }
  h.run(`setVideoViewMode('compact');setVideoThumbnailVisible(false)`);
  assert(!h.node('videoList').innerHTML.includes('video-compact-thumbnail'));
  const fresh=harness({initialStorage:[...h.storage]});assert.equal(fresh.run('videoThumbnailVisible'),false);
  h.run(`setVideoViewMode('minimal')`);assert.equal(harness({initialStorage:[...h.storage]}).run('activeVideoViewMode'),'minimal');
  assert(!h.node('videoList').innerHTML.includes('<img'));
  const denied=harness({storageError:true});denied.run('setVideoThumbnailVisible(false)');assert.equal(denied.run('videoThumbnailVisible'),false);
});

test('warnings distinguish absent data from zero views and canonical ID from missing URL',()=>{
  const h=harness();
  assert.equal(h.run(`getVideoDataWarnings(mapVideo({})).length`),2);
  assert(h.run(`getVideoDataWarnings(mapVideo({status:'投稿済み',youtube_video_id:'abcdefghijk'})).includes('YouTube情報未同期')`));
  for(const row of [{youtube_views:0},{youtube_synced_at:'2026-09-01T00:00:00Z'}]) {
    h.context.row=row;
    assert(!h.run(`getVideoDataWarnings(mapVideo({...row,status:'投稿済み',youtube_video_id:'abcdefghijk'})).includes('YouTube情報未同期')`));
  }
});
