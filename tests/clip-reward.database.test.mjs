// Actual frontend mutations against an isolated in-memory Postgres only.
// No real Supabase credentials, API, schema changes or production writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createDatabase} from './fixtures/idea-images-db.mjs';
const {harness}=createRequire(import.meta.url)('./fixtures/app-harness.cjs');
const db=await createDatabase();
await db.exec(`reset role;
  create table videos(id uuid primary key default gen_random_uuid(),title text,video_type text,status text,post_date date,youtube_url text,youtube_video_id text,youtube_views bigint,youtube_likes bigint,youtube_comments bigint,youtube_published_at timestamptz,youtube_synced_at timestamptz,tags text,memo text,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
  create table monthly_payments(month_key text primary key,is_paid boolean,paid_at timestamptz,updated_at timestamptz);
  create table monthly_achievement_snapshots(month_key text primary key,post_count integer,tag_counts jsonb,tag_targets jsonb,is_finalized boolean,finalized_at timestamptz);
  grant select,insert,update,delete on videos to authenticated;
  grant select on monthly_payments,monthly_achievement_snapshots to authenticated;
  insert into monthly_payments values('2026-09',true,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
  insert into monthly_achievement_snapshots values('2026-09',8,'{"横動画の切り抜き":3,"レース映像":2,"ネット競艇":1}','{"tag_clip":5,"tag_online":2}',true,'2026-10-01T00:05:00+09:00');
  insert into videos(title,video_type,status,post_date,youtube_url,tags) values('historical','横動画','投稿済み','2026-09-10','','横動画の切り抜き');
  set role authenticated;`);
const writes=[];
// PostgREST sends date-only strings, whereas PGlite returns JS Date objects.
const apiRow=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[
  key,value instanceof Date?(key==='post_date'?value.toISOString().slice(0,10):value.toISOString()):value
]));
const client={from(table){
  assert.equal(table,'videos','frontend may only mutate the explicit test video');
  let action,payload,id;
  const q={insert(p){action='insert';payload=p;return q;},update(p){action='update';payload=p;return q;},eq(k,v){assert.equal(k,'id');id=v;return q;},select(){return q;},single(){return q;},maybeSingle(){return q;},abortSignal(){return q;},then(resolve,reject){return (async()=>{
    writes.push({table,action,id,payload:structuredClone(payload)});
    const keys=Object.keys(payload),values=Object.values(payload),params=keys.map((_,i)=>'$'+(i+1));
    let result;
    if(action==='update'){
      values.push(id);result=await db.query(`update videos set ${keys.map((k,i)=>k+'='+params[i]).join(',')} where id=$${values.length} returning *`,values);
    }else result=await db.query(`insert into videos (${keys.join(',')}) values (${params.join(',')}) returning *`,values);
    return {data:result.rows[0],error:null};
  })().then(resolve,reject);}};
  return q;
}};
function fresh(){
  const h=harness({client});
  h.context.readDatabase=async()=>{
    const rows=(await db.query('select * from videos order by id')).rows.map(apiRow);
    h.context.readRows=rows;
    h.context.paymentRows=(await db.query('select * from monthly_payments order by month_key')).rows;
    h.context.snapshotRows=(await db.query('select * from monthly_achievement_snapshots order by month_key')).rows;
    h.run(`data.videos=readRows.filter(v=>!v.deleted_at).map(mapVideo);
      data.trash=readRows.filter(v=>v.deleted_at).map(v=>({...mapVideo(v),entityType:'video'}));
      data.monthlyPayments=paymentRows.map(mapMonthlyPayment);data.achievementSnapshots=snapshotRows.map(mapAchievementSnapshot);renderPostStats()`);
    return true;
  };
  h.run("currentMonthKey=()=> '2026-10';selectedPostStatsMonth='2026-10';authenticatedUserId='local-qa';window.confirm=()=>true;addActivityLog=async()=>true;loadAllData=readDatabase;renderAll=()=>{};renderTrash=()=>{}");
  return h;
}
const protect=async()=>JSON.stringify({
  payments:(await db.query('select * from monthly_payments order by month_key')).rows,
  snapshots:(await db.query('select * from monthly_achievement_snapshots order by month_key')).rows,
  historical:(await db.query("select * from videos where title='historical'")).rows
});
const protectedBefore=await protect();
let h=fresh(),clipId,normalId;
await test('actual add persists clip tag: posted Shorts count increases, reward stays zero',async()=>{
  await h.run('loadAllData()');
  const row=await h.run("saveVideo({title:'clip',type:'Shorts',status:'投稿済み',postDate:'2026-10-10',youtubeUrl:'',tags:['横動画の切り抜き'],memo:''},'add')");
  clipId=row.id;await h.run('loadAllData()');
  assert.equal(h.run("getMonthlyPostStats('2026-10').total"),1);
  assert.equal(h.run("getMonthlyPostStats('2026-10').shorts"),1);
  assert.equal(h.node('postStatsRewardClipFormula').textContent,'1本 × 0円');
  assert.equal(h.node('postStatsRewardTotal').textContent,'¥0');
});
await test('ordinary add and explicit tag edit preserve video type/date and recompute one reward',async()=>{
  const row=await h.run("saveVideo({title:'ordinary',type:'横動画',status:'投稿済み',postDate:'2026-10-11',youtubeUrl:'',tags:['選手解説'],memo:''},'add')");
  normalId=row.id;await h.run('loadAllData()');assert.equal(h.node('postStatsRewardTotal').textContent,'¥1,000');
  h.context.editId=normalId;
  await h.run("saveVideo({title:'ordinary',type:'横動画',status:'投稿済み',postDate:'2026-10-11',youtubeUrl:'',tags:['選手解説','競艇ニュース','横動画の切り抜き'],memo:''},'edit',editId)");
  await h.run('loadAllData()');assert.equal(h.node('postStatsRewardTotal').textContent,'¥0');
  const stored=apiRow((await db.query('select * from videos where id=$1',[normalId])).rows[0]);
  assert.equal(stored.video_type,'横動画');assert.equal(stored.post_date,'2026-10-11');
  assert.equal(h.run("getMonthlyPostStats('2026-10').total"),2);
  assert.equal(h.run("getMonthlyPostStats('2026-10').tagCounts['横動画の切り抜き']"),2);
});
await test('actual tag removal restores news 100-yen rate after fresh state and database reads',async()=>{
  h.context.editId=clipId;
  await h.run("saveVideo({title:'clip removed',type:'Shorts',status:'投稿済み',postDate:'2026-10-10',youtubeUrl:'',tags:['競艇ニュース'],memo:''},'edit',editId)");
  h=fresh();await h.run('loadAllData()');
  assert.equal(h.node('postStatsRewardShortsFormula').textContent,'1本 × 100円');
  assert.equal(h.node('postStatsRewardClipFormula').textContent,'1本 × 0円');
  assert.equal(h.node('postStatsRewardTotal').textContent,'¥100');
});
await test('actual soft delete and restore update counts without losing the zero-yen tag',async()=>{
  h.context.targetId=normalId;
  await h.run('deleteItem("video",targetId,null)');
  assert((await db.query('select deleted_at from videos where id=$1',[normalId])).rows[0].deleted_at);
  assert.equal(h.run("getMonthlyPostStats('2026-10').total"),1);assert.equal(h.node('postStatsRewardTotal').textContent,'¥100');
  await h.run('restoreItem("video",targetId,null)');
  assert.equal((await db.query('select deleted_at from videos where id=$1',[normalId])).rows[0].deleted_at,null);
  assert.equal(h.run("getMonthlyPostStats('2026-10').total"),2);assert.equal(h.node('postStatsRewardClipFormula').textContent,'1本 × 0円');
  assert.equal(h.node('postStatsRewardTotal').textContent,'¥100');
});
await test('YouTube-view-only Realtime-style reload never changes the reward or saved tags',async()=>{
  const before=(await db.query('select tags,video_type,post_date from videos where id=$1',[normalId])).rows[0];
  await db.query('update videos set youtube_views=999999 where id=$1',[normalId]);
  h.run('scheduleRealtimeRefresh();scheduleRealtimeRefresh()');await h.tick(200);
  // The timer starts an asynchronous SQL read; wait for its normal completion.
  await h.run('loadAllData()');
  assert.equal(h.node('postStatsRewardTotal').textContent,'¥100');
  assert.deepEqual((await db.query('select tags,video_type,post_date from videos where id=$1',[normalId])).rows[0],before);
});
await test('paid_at/is_paid, historical source row and immutable achievement snapshot stay byte-equivalent',async()=>{
  h=fresh();await h.run('loadAllData()');
  assert.equal(h.run("getMonthlyPayment('2026-09').isPaid"),true);
  assert.equal(h.run("calculateMonthlyReward(getMonthlyPostStats('2026-09')).totalAmount"),0);
  assert.equal(h.run("calculateOutstandingBalance(['2026-09','2026-10']).amount"),100);
  assert.equal(await protect(),protectedBefore);
  assert(writes.every(write=>write.table==='videos'));
  assert(writes.every(write=>!write.payload.paid_at&&!Object.hasOwn(write.payload,'is_paid')));
});
await db.close();
