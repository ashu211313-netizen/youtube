const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./fixtures/app-harness.cjs');
const tags=['選手解説','用語解説','競艇場解説','疑問解決系','横動画の切り抜き','レース映像','横動画','競艇ニュース','競艇クイズ','競艇値段'];
test('exact ten active choices in order; legacy and unknown values are hidden and preserved',()=>{
  const h=harness();assert.deepEqual(Array.from(h.run('ACTIVE_VIDEO_TAGS')),tags);
  const html=h.run("renderVideoTagChoices('用語解説、ネット競艇、旧独自タグ')");
  assert.deepEqual([...html.matchAll(/value="([^"]+)"/g)].map(x=>x[1]),tags);
  assert(!/ネット競艇|選手紹介|レース動画|競艇ピックニュース|旧独自タグ/.test(html));
  assert.equal(h.run("serializeVideoTags(['用語解説','競艇ニュース','競艇ニュース'],'ネット競艇、旧独自タグ')"),'用語解説, 競艇ニュース, ネット競艇, 旧独自タグ');
  assert(h.run("renderVideoTagChoices('疑問解決系、横動画の切り抜き')").match(/checked/g).length===2);
});
test('all ten saved video tags render as selected choices and visible chips without expanding idea tags',()=>{
  const h=harness();h.context.tags=tags;
  const html=h.run("renderVideoTagChoices(tags.join(', ')+', ネット競艇')");
  assert.deepEqual([...html.matchAll(/<input[^>]*value="([^"]+)"[^>]*\bchecked\b[^>]*>/g)].map(match=>match[1]),tags);
  const chips=h.run("renderVideoTagChips(tags.join(', ')+', 競艇クイズ, ネット競艇')");
  assert.deepEqual([...chips.matchAll(/class="tag-chip">#([^<]+)<\/span>/g)].map(match=>match[1]),tags);
  assert.equal(h.run('parseTags(tags).length'),8);
});
test('Dashboard counts new tags 2/3; five legacy posts still count toward ten total',()=>{
  const h=harness();h.run(`currentMonthKey=()=> '2026-10'; data.videos=['疑問解決系','疑問解決系','横動画の切り抜き','横動画の切り抜き','横動画の切り抜き',...Array(5).fill('ネット競艇')].map((tags,i)=>({id:String(i),status:'投稿済み',postDate:'2026-10-01',tags}));renderDashboard()`);
  const stats=h.run("getMonthlyPostStats('2026-10')");assert.equal(stats.total,10);assert.equal(stats.tagCounts['疑問解決系'],2);assert.equal(stats.tagCounts['横動画の切り抜き'],3);
  const html=h.node('dashboardTagSummary').innerHTML;assert(!html.includes('ネット競艇'));assert.equal((html.match(/<article/g)||[]).length,10);
});
test('new goal keys extend existing mappings; target-only cards include zero actual',()=>{
  const h=harness();const keys=JSON.parse(h.run('JSON.stringify(ACHIEVEMENT_TAG_GOAL_KEYS)'));
  assert.deepEqual(keys,{横動画:'tag_horizontal',選手解説:'tag_player',用語解説:'tag_terms',競艇場解説:'tag_venue',疑問解決系:'tag_question',横動画の切り抜き:'tag_clip',レース映像:'tag_race',競艇ニュース:'tag_news',競艇クイズ:'tag_quiz',競艇値段:'tag_price'});
  const html=h.run("renderMonthlyTagRows({'疑問解決系':0,'横動画の切り抜き':3,'競艇ニュース':9},{targets:{tag_question:2,tag_clip:5}})");
  assert(html.includes('疑問解決系'));assert(html.includes('0本'));assert(html.includes('横動画の切り抜き'));assert(!html.includes('競艇ニュース'));
  h.run('renderAchievementGoalFields()');assert(h.node('achievementGoalFields').innerHTML.includes('name="tag_question"'));assert(h.node('achievementGoalFields').innerHTML.includes('name="tag_clip"'));
});
test('old snapshot and raw legacy JSON remain unchanged after rendering new tags',()=>{
  const h=harness();const raw={month_key:'2026-09',post_count:5,tag_counts:{用語解説:1,ネット競艇:4,旧独自タグ:2},tag_targets:{tag_terms:2,tag_online:5}};
  const before=JSON.stringify(raw);h.context.raw=raw;h.run("currentMonthKey=()=> '2026-10';data.achievementSnapshots=[mapAchievementSnapshot(raw)];selectedAchievementMonth='2026-09'");
  const mappedBefore=h.run('JSON.stringify(data.achievementSnapshots)');h.run('renderAchievements()');
  assert.equal(JSON.stringify(raw),before);assert.equal(h.run('JSON.stringify(data.achievementSnapshots)'),mappedBefore);
  assert(!h.node('achievementTagBreakdown').innerHTML.includes('疑問解決系'));
  assert.doesNotMatch(h.node('achievementTagBreakdown').innerHTML,/競艇クイズ|競艇値段/);
});
test('quiz and price count independently once per posted video and render with the configured current-month targets',()=>{
  const h=harness();h.run(`currentMonthKey=()=> '2026-10';selectedAchievementMonth='2026-10';
    data.videos=[
      {id:'both',status:'投稿済み',postDate:'2026-10-01',tags:'競艇クイズ, 競艇値段, 競艇クイズ'},
      {id:'quiz',status:'投稿済み',postDate:'2026-10-02',tags:'競艇クイズ'},
      {id:'waiting',status:'編集待ち',postDate:'2026-10-03',tags:'競艇値段'},
      {id:'past',status:'投稿済み',postDate:'2026-09-01',tags:'競艇値段'}
    ];data.achievementGoals=[
      {monthKey:'2026-10',key:'tag_quiz',target:4},{monthKey:'2026-10',key:'tag_price',target:3}
    ];renderDashboard();renderAchievements()`);
  const stats=h.run("getMonthlyPostStats('2026-10')");
  assert.equal(stats.total,2);
  assert.equal(stats.tagCounts['競艇クイズ'],2);
  assert.equal(stats.tagCounts['競艇値段'],1);
  assert.match(h.node('dashboardTagSummary').innerHTML,/<span>競艇クイズ<\/span><strong>2本/);
  assert.match(h.node('dashboardTagSummary').innerHTML,/<span>競艇値段<\/span><strong>1本/);
  assert.match(h.node('achievementTagBreakdown').innerHTML,/<span>競艇クイズ<\/span><strong>2本[\s\S]*?目標 4本/);
  assert.match(h.node('achievementTagBreakdown').innerHTML,/<span>競艇値段<\/span><strong>1本[\s\S]*?目標 3本/);
});
test('question tag keeps type rates; clip tag takes priority over news and type rates',()=>{
  const h=harness();for(const tag of ['疑問解決系','横動画の切り抜き'])for(const [type,reward]of [['Shorts',100],['横動画',1000]]){
    h.context.video={type,tags:tag};assert.equal(h.run('getVideoReward(video)'),tag==='横動画の切り抜き'?0:reward);
    h.context.video.tags=tag+',競艇ニュース';assert.equal(h.run('getVideoReward(video)'),tag==='横動画の切り抜き'?0:100);
    h.context.video.tags=tag+',競艇ニュース,レース映像';assert.equal(h.run('getVideoReward(video)'),0);
  }
});
