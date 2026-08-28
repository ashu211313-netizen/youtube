const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./fixtures/app-harness.cjs');
test('nullable snapshot metrics stay unknown, not a fabricated zero',()=>{
  const h=harness();
  for(const value of [null,undefined,'']) {h.context.value=value;assert.equal(h.run(`mapAchievementSnapshot({month_key:'2026-08',subscriber_count:value}).metrics.subscribers`),null);}
  for(const value of [0,50,'100',125]) {h.context.value=value;assert.equal(h.run(`mapAchievementSnapshot({month_key:'2026-08',subscriber_count:value}).metrics.subscribers`),Number(value));}
});
test('JST seven weekdays and 23:59 → 00:00, invalid date',()=>{
  const h=harness();
  for(let day=0;day<7;day++) {
    const iso=`2026-08-${String(24+day).padStart(2,'0')}T00:00:00+09:00`;
    assert.equal(h.run(`getWeeklyScheduleDay(new Date('${iso}'))`),(day+1)%7);
    h.run(`renderWeeklyUploadSchedule(new Date('${iso}'))`);
    const html=h.node('weeklyScheduleList').innerHTML;
    assert.equal((html.match(/aria-current="date"/g)||[]).length,1);
    assert.equal((html.match(/昨日の競艇ニュース/g)||[]).length,7);
    assert.equal((html.match(/<h4>/g)||[]).length,7);
  }
  assert.equal(h.run(`getWeeklyScheduleDay(new Date('2026-08-24T14:59:59Z'))`),1);
  assert.equal(h.run(`getWeeklyScheduleDay(new Date('2026-08-24T15:00:00Z'))`),2);
  assert.equal(h.run(`getWeeklyScheduleDay(new Date('invalid'))`),null);
});
test('schedule and all nine exact rules use one immutable configuration',()=>{
  const h=harness();h.run('renderWeeklyUploadSchedule()');
  const config=JSON.parse(h.run('JSON.stringify(WEEKLY_UPLOAD_SCHEDULE)'));
  assert.deepEqual(config.days.map(d=>d.feature),['選手紹介','用語解説','競艇場紹介','疑問解決Shorts','横動画の切り抜き投稿','横動画の切り抜き投稿','横動画の切り抜き投稿']);
  assert.equal(config.rules.length,9);assert.equal((h.node('weeklyScheduleRules').innerHTML.match(/<li>/g)||[]).length,9);
  assert(config.rules.includes('学校、勉強、編集を両立できることを最優先にする。'));
  assert.equal(h.run('Object.isFrozen(WEEKLY_UPLOAD_SCHEDULE) && Object.isFrozen(WEEKLY_UPLOAD_SCHEDULE.days[0])'),true);
  assert.equal(h.timers.size,0);
});
test('schedule renders on core DB failure and foreground while offline; missing DOM is safe',()=>{
  const h=harness();h.run(`data=createEmptyDataState();renderDashboard();navigator.onLine=false;scheduleAppResume('focus')`);
  assert(h.node('weeklyScheduleList').innerHTML.includes('今日'));
  h.run('elements.weeklyScheduleList=null; renderWeeklyUploadSchedule()');
});
test('six metric refactor returns byte-identical HTML to main across current/past and missing values',()=>{
  const baseline=harness({ref:'d680bbaaf421918128a0b738ca5e79904e325a55'}), current=harness();
  for(const isCurrentMonth of [true,false]) for(const missing of [true,false]) for(const value of [0,50,100,125]) {
    const view={isCurrentMonth,snapshot:null,values:{},available:{},tagCounts:{},targets:{}};
    for(const key of ['subscribers','highest_views','posts','monthly_views','average_views','likes']) {view.values[key]=missing?null:value;view.available[key]=!missing;view.targets[key]=100;}
    for(const h of [baseline,current]) {h.context.view=view;h.run(`renderAchievementMonthOptions=()=>{};selectedAchievementMonth='2026-08';getAchievementMonthView=()=>view;renderAchievements()`);}
    assert.equal(current.node('achievementMetricGrid').innerHTML,baseline.node('achievementMetricGrid').innerHTML);
  }
});
test('progress 0 / 50 / 100 / 125 and absent/invalid values never overflow or show NaN',()=>{
  const h=harness();
  for(const value of [0,50,100,125,-1,null,undefined,NaN,Infinity]) {
    h.context.value=value;
    const progress=h.run('getAchievementProgress(value,100)');
    assert(Number.isFinite(progress.width));assert(progress.width>=0&&progress.width<=100);
    const html=h.run(`renderAchievementMetric({key:'posts',label:'投稿本数',value,target:100,suffix:'本'})`);
    assert(!/NaN|Infinity|undefined/.test(html));
  }
});
test('seven tags; targets alone control achievement cards (zero counts included)',()=>{
  const h=harness();assert.equal(h.run('VIDEO_TAGS.length'),7);
  const html=h.run(`renderMonthlyTagRows({'横動画':0,'選手解説':5,'競艇ニュース':2},{targets:{tag_horizontal:10,tag_news:3}})`);
  assert(html.includes('横動画'));assert(html.includes('競艇ニュース'));assert(!html.includes('選手解説'));
  assert(html.includes('0本'));
  assert(h.run(`renderVideoTagChoices('競艇ニュース')`).includes('競艇ニュース'));
});
test('past snapshot is immutable input, not supplemented with current targets or current views',()=>{
  const h=harness(); h.run(`currentMonthKey=()=> '2026-09';
    data.achievementGoals=[{monthKey:'2026-09',key:'tag_news',target:100}];
    data.achievementSnapshots=[mapAchievementSnapshot({month_key:'2026-08',subscriber_count:null,post_count:4,monthly_views:50,tag_counts:{'横動画':4},tag_targets:{tag_horizontal:5}})];`);
  const before=h.run('JSON.stringify(data.achievementSnapshots)');
  h.run(`selectedAchievementMonth='2026-08';renderAchievements()`);
  assert(h.node('achievementGoalButton').classList.contains('is-hidden'));
  assert(h.node('achievementTagBreakdown').innerHTML.includes('横動画'));
  assert(!h.node('achievementTagBreakdown').innerHTML.includes('競艇ニュース'));
  assert(h.node('achievementMetricGrid').innerHTML.includes('履歴データなし'));
  assert.equal(h.run('JSON.stringify(data.achievementSnapshots)'),before);
  h.run(`selectedAchievementMonth='2026-09';renderAchievements()`);
  assert(!h.node('achievementGoalButton').classList.contains('is-hidden'));
});
test('reward priority, Shorts/news combined once; paid rows unchanged',()=>{
  const h=harness();
  const cases=[['Shorts','',100],['横動画','競艇ニュース',100],['Shorts','競艇ニュース',100],['横動画','競艇ニュース、レース映像',0],['横動画','',1000],['Shorts','横動画',100],['Shorts','レース映像',0]];
  for(const [type,tags,expected] of cases) assert.equal(h.run(`getVideoReward(${JSON.stringify({type,tags})})`),expected);
  h.context.videos=cases.map(([type,tags])=>({type,tags,status:'投稿済み',postDate:'2026-08-10'}));
  h.run(`data.videos=videos;data.monthlyPayments=[{monthKey:'2026-07',isPaid:true,paidAt:'2026-08-01'}]`);
  const before=h.run('JSON.stringify(data.monthlyPayments)');
  const result=h.run(`calculateMonthlyReward(getMonthlyPostStats('2026-08'))`);
  assert.equal(result.totalAmount,1400);assert.equal(result.paidShortsCount,4);assert.equal(result.raceVideoCount,2);
  assert.equal(h.run(`getMonthlyPostStats('2026-08').total`),7);
  assert.equal(h.run('JSON.stringify(data.monthlyPayments)'),before);
});
test('video actual publication order; edits and new app registration do not move old posts',()=>{
  const h=harness();h.run(`data.videos=[
    {id:'B',postDate:'2026-08-12',createdAt:'2026-08-29'},
    {id:'A',youtubePublishedAt:'2026-08-14T03:00:00Z',createdAt:'2026-08-14'},
    {id:'C',postDate:'2025-08-10',createdAt:'2026-08-30'},
    {id:'unknown',createdAt:'2026-08-31'}]`);
  const order=()=>h.run(`sortByPostedAtDesc(data.videos).map(v=>v.id).join(',')`);
  assert.equal(order(),'A,B,C,unknown');
  h.run(`Object.assign(data.videos[0],{title:'edited',tags:'競艇ニュース',status:'投稿済み',youtubeViews:500,updatedAt:'2027-01-01'})`);
  assert.equal(order(),'A,B,C,unknown');
  h.run(`data.videos[3].youtubePublishedAt='2026-08-15T03:00:00Z'`);assert.equal(order(),'unknown,A,B,C');
});
test('YouTube latest successful timestamp survives reload-style mapping and stale channel row',()=>{
  const h=harness();h.run(`data.videos=[mapVideo({id:'v',youtube_synced_at:'2026-08-29T02:00:00Z'})];data.channelStats={syncedAt:'2026-08-28T02:00:00Z'};renderDashboard()`);
  assert(!h.node('dashboardMonthlySyncLabel').textContent.includes('未同期'));
  assert.equal(h.run('getLatestYouTubeSyncAt()'),'2026-08-29T02:00:00.000Z');
});
test('user text escaping remains inert',()=>{
  const h=harness();assert.equal(h.run(`escapeHtml('<img src=x onerror="alert(1)">')`),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('video/idea trash, restore and explicit permanent deletion keep exact ID scope',async()=>{
  const writes=[];
  const client={from:table=>{const q={update:payload=>{writes.push({table,payload});return q;},delete:()=>{writes.push({table,deleted:true});return q;},eq:(key,id)=>{writes.at(-1).filter=[key,id];return Promise.resolve({error:null});}};return q;}};
  const h=harness({client});h.run(`window.confirm=()=>true;addActivityLog=async()=>{};loadAllData=async()=>true;cleanupIdeaImages=async()=>{};data.videos=[{id:'v',title:'video'}];data.ideas=[{id:'i',title:'idea'}]`);
  for(const [kind,id] of [['video','v'],['idea','i']]) {
    await h.run(`deleteItem('${kind}','${id}')`);assert(writes.at(-1).payload.deleted_at);assert.deepEqual(writes.at(-1).filter,['id',id]);
    h.run(`data.trash=[{entityType:'${kind}',id:'${id}',title:'trash'}]`);
    await h.run(`restoreItem('${kind}','${id}',null)`);assert.equal(writes.at(-1).payload.deleted_at,null);
    await h.run(`permanentDeleteItem('${kind}','${id}',null)`);assert.equal(writes.at(-1).deleted,true);assert.deepEqual(writes.at(-1).filter,['id',id]);
  }
});
