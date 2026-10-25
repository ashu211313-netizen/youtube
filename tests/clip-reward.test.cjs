const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {harness,root}=require('./fixtures/app-harness.cjs');

test('clip tag takes priority over the video type',()=>{
  const h=harness();
  for(const type of ['Shorts','横動画']){
    h.context.type=type;
    assert.equal(h.run(`getVideoReward({type,tags:'横動画の切り抜き'})`),0);
  }
});

const cases=[
  ['normal Shorts','Shorts','選手解説',100],
  ['normal horizontal','横動画','用語解説',1000],
  ['race','横動画','レース映像',0],
  ['news','横動画','競艇ニュース',100],
  ['clip Shorts','Shorts','横動画の切り抜き',0],
  ['clip horizontal','横動画','横動画の切り抜き',0],
  ['clip plus news','Shorts','競艇ニュース、横動画の切り抜き',0],
  ['clip plus race','横動画','レース映像, 横動画の切り抜き',0],
  ['clip plus news and race','横動画','競艇ニュース, レース映像, 横動画の切り抜き',0],
  ['multiple ordinary tags','Shorts','横動画、疑問解決系、選手解説',100],
  ['unknown type fallback','unknown','選手解説',0],
  ['unknown type with news','unknown','競艇ニュース',100]
];
for(const [label,type,tags,expected] of cases) test(`reward priority: ${label} → ${expected} yen`,()=>{
  const h=harness();h.context.video={type,tags,youtubeViews:123};
  assert.equal(h.run('getVideoReward(video)'),expected);
  h.context.video.youtubeViews=999999;
  assert.equal(h.run('getVideoReward(video)'),expected);
});

const sevenVideos=[
  ['A','Shorts','横動画の切り抜き'],
  ['B','横動画','横動画の切り抜き'],
  ['C','Shorts','競艇ニュース, 横動画の切り抜き'],
  ['D','Shorts','レース映像'],
  ['E','Shorts','競艇ニュース'],
  ['F','Shorts','選手解説'],
  ['G','横動画','用語解説']
].map(([id,type,tags])=>({id,type,tags,status:'投稿済み',postDate:'2026-10-10'}));
function populated(){
  const h=harness();h.context.rows=structuredClone(sevenVideos);
  h.run("currentMonthKey=()=> '2026-10';data.videos=rows;selectedPostStatsMonth='2026-10'");
  return h;
}

test('required A–G: 7 posted / 5 Shorts / 2 horizontal / 1200 yen, independent tag counts',()=>{
  const h=populated(),before=h.run('JSON.stringify(data.videos)');
  const stats=h.run("getMonthlyPostStats('2026-10')"),reward=h.run("calculateMonthlyReward(getMonthlyPostStats('2026-10'))");
  assert.equal(stats.total,7);assert.equal(stats.shorts,5);assert.equal(stats.long,2);
  assert.equal(stats.tagCounts['横動画の切り抜き'],3);assert.equal(stats.tagCounts['レース映像'],1);assert.equal(stats.tagCounts['競艇ニュース'],2);
  assert.equal(reward.totalAmount,1200);assert.equal(reward.paidShortsCount,2);assert.equal(reward.paidLongCount,1);
  assert.equal(reward.clipVideoCount,3);assert.equal(reward.raceVideoCount,1);
  assert.equal(reward.paidShortsCount+reward.paidLongCount+reward.clipVideoCount+reward.raceVideoCount,7);
  assert.equal(h.run('JSON.stringify(data.videos)'),before);
});

test('clip/race/news overlaps get one reward category but count each independent tag once',()=>{
  const h=harness();h.run("data.videos=[{id:'both',type:'Shorts',tags:'横動画の切り抜き, 横動画の切り抜き, レース映像, 競艇ニュース',status:'投稿済み',postDate:'2026-10-01'}]");
  const stats=h.run("getMonthlyPostStats('2026-10')"),reward=h.run("calculateMonthlyReward(getMonthlyPostStats('2026-10'))");
  assert.equal(reward.totalAmount,0);assert.equal(reward.clipVideoCount,1);assert.equal(reward.raceVideoCount,0);assert.equal(reward.paidShortsCount,0);
  assert.equal(stats.total,1);for(const tag of ['横動画の切り抜き','レース映像','競艇ニュース'])assert.equal(stats.tagCounts[tag],1);
});

test('waiting and undated posts stay excluded; an empty month stays zero',()=>{
  const h=populated();h.run("data.videos.push({id:'waiting',type:'横動画',tags:'選手解説',status:'編集待ち',postDate:'2026-10-02'},{id:'undated',type:'横動画',status:'投稿済み'})");
  assert.equal(h.run("getMonthlyPostStats('2026-10').total"),7);
  assert.equal(h.run("calculateMonthlyReward(getMonthlyPostStats('2026-10')).totalAmount"),1200);
  const empty=h.run("calculateMonthlyReward(getMonthlyPostStats('2026-08'))");
  for(const key of ['totalAmount','shortsAmount','longAmount','paidShortsCount','paidLongCount','raceVideoCount','clipVideoCount'])assert.equal(empty[key],0);
});

test('multiple months, paid flags, snapshots and source fields are read-only during rendering',()=>{
  const writes=[],h=harness({client:{from:table=>{writes.push(table);throw Error('Unexpected database access');}}});
  h.context.rows=structuredClone(sevenVideos);
  h.run(`currentMonthKey=()=> '2026-10';data.videos=[...rows,
    {id:'sepclip',type:'横動画',tags:'横動画の切り抜き',status:'投稿済み',postDate:'2026-09-10'},
    {id:'sepnormal',type:'横動画',tags:'選手解説',status:'投稿済み',postDate:'2026-09-10'},
    {id:'augpaid',type:'横動画',tags:'選手解説',status:'投稿済み',postDate:'2026-08-10'}];
    data.monthlyPayments=[{monthKey:'2026-08',isPaid:true,paidAt:'2026-09-01T01:00:00Z'},{monthKey:'2026-09',isPaid:false,paidAt:null}];
    data.achievementSnapshots=[mapAchievementSnapshot({month_key:'2026-08',post_count:1,tag_counts:{'横動画の切り抜き':4},tag_targets:{tag_clip:5}})];
    selectedPostStatsMonth='2026-08'`);
  const before=h.run('JSON.stringify(data)');
  assert.equal(h.run("calculateMonthlyReward(getMonthlyPostStats('2026-09')).totalAmount"),1000);
  const balance=h.run("calculateOutstandingBalance(['2026-10','2026-09','2026-08'])");
  assert.equal(balance.amount,2200);assert.equal(balance.monthCount,2);
  h.run('renderPostStats()');
  assert.equal(h.node('postStatsPaymentStatusLabel').textContent,'支払済み');
  assert.equal(h.node('postStatsRewardTotal').textContent,'¥1,000');
  assert.equal(h.node('postStatsOutstandingBalance').textContent,'¥2,200');
  assert.match(h.node('postStatsMonthlyList').innerHTML,/2026年9月[\s\S]*?¥1,000/);
  assert.equal(h.run('JSON.stringify(data)'),before);assert.deepEqual(writes,[]);
});

test('breakdown, monthly list and unpaid total agree without an independent news row',()=>{
  const h=populated();h.run('renderPostStats()');
  assert.equal(h.node('postStatsMonthTotal').textContent,7);assert.equal(h.node('postStatsMonthShorts').textContent,5);assert.equal(h.node('postStatsMonthLong').textContent,2);
  for(const [id,text] of [
    ['postStatsRewardShortsFormula','2本 × 100円'],['postStatsRewardShortsAmount','¥200'],
    ['postStatsRewardLongFormula','1本 × 1,000円'],['postStatsRewardLongAmount','¥1,000'],
    ['postStatsRewardRaceFormula','1本 × 0円'],['postStatsRewardRaceAmount','¥0'],
    ['postStatsRewardClipFormula','3本 × 0円'],['postStatsRewardClipAmount','¥0'],
    ['postStatsRewardTotal','¥1,200'],['postStatsOutstandingBalance','¥1,200']
  ])assert.equal(h.node(id).textContent,text,id);
  assert.match(h.node('postStatsMonthlyList').innerHTML,/¥1,200/);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const section=html.slice(html.indexOf('<section class="post-payment-section">'),html.indexOf('<div class="payment-status-panel">'));
  assert.match(section,/横動画の切り抜き/);assert(!section.includes('<span>競艇ニュース</span>'));
  assert.match(section,/現在の報酬ルール/);assert.match(section,/実際の支払確定額ではありません/);
});

test('reload-style mapping and debounced Realtime refresh use tags, not YouTube views',async()=>{
  const h=harness();h.context.rawRows=[
    {id:'clip',video_type:'横動画',status:'投稿済み',post_date:'2026-10-10',tags:'横動画の切り抜き',youtube_views:1},
    {id:'normal',video_type:'Shorts',status:'投稿済み',post_date:'2026-10-10',tags:'選手解説',youtube_views:5}
  ];
  h.run("currentMonthKey=()=> '2026-10';selectedPostStatsMonth='2026-10';var reloadCount=0;loadAllData=async()=>{reloadCount++;data.videos=rawRows.filter(v=>!v.deleted_at).map(mapVideo);renderPostStats();return true;}");
  await h.run('loadAllData()');assert.equal(h.node('postStatsRewardTotal').textContent,'¥100');
  h.context.rawRows[0].youtube_views=999999;
  h.run('scheduleRealtimeRefresh();scheduleRealtimeRefresh();scheduleRealtimeRefresh()');await h.tick(200);
  assert.equal(h.run('reloadCount'),2);assert.equal(h.node('postStatsRewardTotal').textContent,'¥100');assert.equal(h.run("getMonthlyPostStats('2026-10').total"),2);
  h.context.rawRows[1].tags='選手解説, 横動画の切り抜き';h.run('scheduleRealtimeRefresh()');await h.tick(200);
  assert.equal(h.node('postStatsRewardTotal').textContent,'¥0');assert.equal(h.node('postStatsRewardClipFormula').textContent,'2本 × 0円');
});
