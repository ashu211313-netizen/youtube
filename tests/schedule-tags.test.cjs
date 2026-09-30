const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./fixtures/app-harness.cjs');
const tags=['選手解説','用語解説','競艇場解説','疑問解決系','横動画の切り抜き','レース映像','横動画','競艇ニュース'];
test('exact eight active choices in order; legacy and unknown values are hidden and preserved',()=>{
  const h=harness();assert.deepEqual(Array.from(h.run('ACTIVE_VIDEO_TAGS')),tags);
  const html=h.run("renderVideoTagChoices('用語解説、ネット競艇、旧独自タグ')");
  assert.deepEqual([...html.matchAll(/value="([^"]+)"/g)].map(x=>x[1]),tags);
  assert(!/ネット競艇|選手紹介|レース動画|競艇ピックニュース|旧独自タグ/.test(html));
  assert.equal(h.run("serializeVideoTags(['用語解説','競艇ニュース','競艇ニュース'],'ネット競艇、旧独自タグ')"),'用語解説, 競艇ニュース, ネット競艇, 旧独自タグ');
  assert(h.run("renderVideoTagChoices('疑問解決系、横動画の切り抜き')").match(/checked/g).length===2);
});
test('Dashboard counts new tags 2/3; five legacy posts still count toward ten total',()=>{
  const h=harness();h.run(`currentMonthKey=()=> '2026-10'; data.videos=['疑問解決系','疑問解決系','横動画の切り抜き','横動画の切り抜き','横動画の切り抜き',...Array(5).fill('ネット競艇')].map((tags,i)=>({id:String(i),status:'投稿済み',postDate:'2026-10-01',tags}));renderDashboard()`);
  const stats=h.run("getMonthlyPostStats('2026-10')");assert.equal(stats.total,10);assert.equal(stats.tagCounts['疑問解決系'],2);assert.equal(stats.tagCounts['横動画の切り抜き'],3);
  const html=h.node('dashboardTagSummary').innerHTML;assert(!html.includes('ネット競艇'));assert.equal((html.match(/<article/g)||[]).length,8);
});
test('new goal keys extend existing mappings; target-only cards include zero actual',()=>{
  const h=harness();const keys=JSON.parse(h.run('JSON.stringify(ACHIEVEMENT_TAG_GOAL_KEYS)'));
  assert.deepEqual(keys,{横動画:'tag_horizontal',選手解説:'tag_player',用語解説:'tag_terms',競艇場解説:'tag_venue',疑問解決系:'tag_question',横動画の切り抜き:'tag_clip',レース映像:'tag_race',競艇ニュース:'tag_news'});
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
});
test('new tags leave type-based rewards and race/news priority unchanged',()=>{
  const h=harness();for(const tag of ['疑問解決系','横動画の切り抜き'])for(const [type,reward]of [['Shorts',100],['横動画',1000]]){
    h.context.video={type,tags:tag};assert.equal(h.run('getVideoReward(video)'),reward);
    h.context.video.tags=tag+',競艇ニュース';assert.equal(h.run('getVideoReward(video)'),100);
    h.context.video.tags=tag+',競艇ニュース,レース映像';assert.equal(h.run('getVideoReward(video)'),0);
  }
});
