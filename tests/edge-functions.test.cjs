// Node 24+ syntax/behavior checks. No Deno deployment, real API or production writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const base=path.resolve(__dirname,'../supabase/functions');
function fixture(slug,client={}) {
  const env={SUPABASE_URL:'https://qa.invalid',SUPABASE_ANON_KEY:'fixture-public',YOUTUBE_API_KEY:'fixture-only',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'};
  const context=vm.createContext({URL,URLSearchParams,Request,Response,Date,Intl,console,
    corsHeaders:{'Access-Control-Allow-Origin':'*'},createClient:()=>client,
    Deno:{env:{get:key=>env[key]},serve:fn=>{context.handler=fn;}},
    fetch:()=>{throw Error('Network is not allowed in tests');}});
  const compile=file=>stripTypeScriptTypes(fs.readFileSync(path.join(base,file),'utf8'),{mode:'transform'}).replace(/^import\b[\s\S]*?;\s*/gm,'').replace(/\bexport /g,'');
  vm.runInContext(compile('_shared/youtube.ts'),context);
  if(slug)vm.runInContext(compile(`${slug}/index.ts`),context);
  return {context,run:code=>vm.runInContext(code,context),request:(method,headers={},body)=>context.handler(new Request('https://qa.invalid',{method,headers,body}))};
}
test('shared YouTube URL variants and unsafe/invalid hosts',()=>{
  const h=fixture();
  for(const url of ['abcdefghijk','https://youtu.be/abcdefghijk','https://youtube.com/watch?v=abcdefghijk','https://youtube.com/shorts/abcdefghijk','https://youtube.com/embed/abcdefghijk','https://youtube.com/live/abcdefghijk']) assert.equal(h.run(`extractYouTubeVideoId(${JSON.stringify(url)})`),'abcdefghijk');
  for(const url of ['','https://youtube.com.evil.invalid/watch?v=abcdefghijk','javascript:alert(1)']) assert.equal(h.run(`extractYouTubeVideoId(${JSON.stringify(url)})`),null);
  assert.equal(h.run(`parseCount(null)`),null);assert.equal(h.run(`parseCount('12500')`),12500);
});
test('YouTube batching is 50 + 1, API error propagates',async()=>{
  const h=fixture(),sizes=[];
  h.context.fetch=async url=>{sizes.push(new URL(url).searchParams.get('id').split(',').length);return {ok:true,json:async()=>({items:[]})};};
  await h.run(`fetchYouTubeVideos(Array.from({length:51},(_,i)=>String(i).padStart(11,'0')),'fixture')`);assert.deepEqual(sizes,[50,1]);
  h.context.fetch=async()=>({ok:false,json:async()=>({error:{message:'quota fixture'}})});
  await assert.rejects(h.run(`fetchYouTubeVideos(['abcdefghijk'],'fixture')`),/quota fixture/);
});
for(const slug of ['sync-youtube-video','finalize-monthly-achievements']) test(`${slug}: TypeScript, CORS, method and missing-auth rejection`,async()=>{
  const h=fixture(slug);
  assert.equal((await h.request('OPTIONS')).status,200);
  assert.equal((await h.request('GET')).status,405);
  assert.equal((await h.request('POST',{},'{}')).status,401);
});
test('sync: authenticated empty/over-limit IDs rejected before DB',async()=>{
  const h=fixture('sync-youtube-video',{auth:{getUser:async()=>({data:{user:{id:'qa'}}})}});
  const headers={Authorization:'Bearer fixture','Content-Type':'application/json'};
  assert.equal((await h.request('POST',headers,'{}')).status,400);
  assert.equal((await h.request('POST',headers,JSON.stringify({videoRecordIds:Array.from({length:201},(_,i)=>String(i))}))).status,400);
});
test('monthly finalization: existing snapshot is skipped, no update or recalculation',async()=>{
  let reads=0;const q={select(){return this;},eq(){return this;},maybeSingle:async()=>{reads++;return {data:{month_key:'2026-08',finalized_at:'2026-09-01'}};}};
  const h=fixture('finalize-monthly-achievements',{from:table=>{assert.equal(table,'monthly_achievement_snapshots');return q;}});
  h.run(`currentJstMonthKey=()=> '2026-09'`);
  const response=await h.request('POST',{apikey:'fixture-public'},'{}');assert.equal(response.status,200);
  assert.equal((await response.json()).skipped,'already_finalized');assert.equal(reads,1);
});
test('future monthly finalization captures both new tag counts and targets, keeping legacy data',async()=>{
  let saved;
  const rows=[{id:'a',status:'投稿済み',post_date:'2026-09-01',tags:'疑問解決系,横動画の切り抜き,ネット競艇',youtube_views:0,youtube_likes:0},{id:'b',status:'投稿済み',post_date:'2026-09-02',tags:'横動画の切り抜き',youtube_views:5,youtube_likes:1}];
  const client={from(table){const q={select(){return q;},eq(){return q;},is(){return q;},order(){return q;},maybeSingle:async()=>({data:null}),insert(value){saved=value;return Promise.resolve({error:null});},then(resolve){return Promise.resolve({data:table==='videos'?rows:table==='goals'?[{goal_key:'tag_question',target_value:2},{goal_key:'tag_clip',target_value:3},{goal_key:'tag_online',target_value:4}]:[],error:null}).then(resolve);}};return q;}};
  const h=fixture('finalize-monthly-achievements',client);h.run("currentJstMonthKey=()=> '2026-10'");
  assert.equal((await h.request('POST',{apikey:'fixture-public'},'{}')).status,200);
  assert.equal(saved.tag_counts['疑問解決系'],1);assert.equal(saved.tag_counts['横動画の切り抜き'],2);assert.equal(saved.tag_counts['ネット競艇'],1);
  assert.equal(saved.tag_targets.tag_question,2);assert.equal(saved.tag_targets.tag_clip,3);assert.equal(saved.tag_targets.tag_online,4);
});

test('monthly finalization: JST month boundary and publication date take precedence',()=>{
  const h=fixture('finalize-monthly-achievements');
  assert.equal(h.run(`currentJstMonthKey(new Date('2026-10-31T14:59:59Z'))`),'2026-10');
  assert.equal(h.run(`currentJstMonthKey(new Date('2026-10-31T15:00:00Z'))`),'2026-11');
  assert.equal(h.run(`shiftMonthKey('2027-01',-1)`),'2026-12');
  assert.equal(h.run(`videoMonthKey({youtube_published_at:'2026-09-30T15:00:00Z',post_date:'2026-09-30'})`),'2026-10');
  assert.equal(h.run(`videoMonthKey({youtube_published_at:null,post_date:'2026-09-30'})`),'2026-09');
});

// In-memory fluent client: all writes are isolated; no production function is invoked.
function monthlyClient({rows=[],goals=[],existing=null,readError=null,insertError=null,updateError=null}={}) {
  const state={existing,insertError,readError,updateError,saved:[],updates:[],reads:[]};
  return {state,from(table){
    const q={select(){return q;},eq(){return q;},is(){return q;},order(){return q;},
      maybeSingle:async()=>({data:state.existing,error:state.readError}),
      update(value){state.updates.push({table,value});q.then=resolve=>Promise.resolve({error:state.updateError}).then(resolve);return q;},
      insert(value){if(!state.insertError){state.saved.push(value);state.existing={month_key:value.month_key,finalized_at:value.finalized_at};}return Promise.resolve({error:state.insertError});},
      then(resolve){state.reads.push(table);return Promise.resolve({data:table==='videos'?structuredClone(rows):table==='goals'?goals:[],error:null}).then(resolve);}};
    return q;
  }};
}

test('monthly finalization: first success, repeated run skips all stats and snapshot writes',async()=>{
  const client=monthlyClient({rows:[{status:'投稿済み',post_date:'2026-10-03',tags:'疑問解決系,横動画の切り抜き,レース映像'}],goals:[{goal_key:'tag_question',target_value:3},{goal_key:'tag_clip',target_value:4}]});
  const h=fixture('finalize-monthly-achievements',client);h.run(`currentJstMonthKey=()=> '2026-11'`);
  const first=await h.request('POST',{apikey:'fixture-public'},'{}');assert.equal(first.status,200);assert.equal((await first.json()).finalized,true);
  const before=client.state.reads.length;
  const second=await h.request('POST',{Authorization:'Bearer fixture-public'},'{}');
  assert.equal((await second.json()).skipped,'already_finalized');assert.equal(client.state.saved.length,1);assert.equal(client.state.reads.length,before);assert.equal(client.state.updates.length,0);
  assert.equal(client.state.saved[0].tag_counts['レース映像'],1);assert.equal(client.state.saved[0].tag_targets.tag_question,3);
});

test('monthly finalization: concurrent unique conflict is skipped, never overwritten',async()=>{
  const client=monthlyClient({insertError:{code:'23505'}}),h=fixture('finalize-monthly-achievements',client);h.run(`currentJstMonthKey=()=> '2026-11'`);
  const response=await h.request('POST',{apikey:'fixture-public'},'{}');assert.equal(response.status,200);assert.equal((await response.json()).skipped,'already_finalized');assert.equal(client.state.saved.length,0);
});

test('monthly finalization: DB failure can retry successfully without partial snapshot',async()=>{
  const client=monthlyClient({insertError:{code:'08006'}}),h=fixture('finalize-monthly-achievements',client);h.context.console={error(){}};h.run(`currentJstMonthKey=()=> '2026-11'`);
  assert.equal((await h.request('POST',{apikey:'fixture-public'},'{}')).status,500);assert.equal(client.state.saved.length,0);
  client.state.insertError=null;
  assert.equal((await h.request('POST',{apikey:'fixture-public'},'{}')).status,200);assert.equal(client.state.saved.length,1);
});

for(const failure of ['network','missing-video','video-update']) test(`monthly finalization: ${failure} failure prevents snapshot and allows retry`,async()=>{
  const client=monthlyClient({rows:[{id:'a',status:'投稿済み',post_date:'2026-10-03',youtube_video_id:'abcdefghijk',tags:'疑問解決系,横動画の切り抜き'}],updateError:failure==='video-update'?{code:'08006'}:null});
  const h=fixture('finalize-monthly-achievements',client);h.context.console={error(){}};h.run(`currentJstMonthKey=()=> '2026-11'`);
  if(failure==='missing-video')h.run(`fetchYouTubeVideos=async()=>new Map()`);
  if(failure==='video-update')h.run(`fetchYouTubeVideos=async()=>new Map([['abcdefghijk',{statistics:{viewCount:'0'},snippet:{publishedAt:'2026-10-03T00:00:00Z'}}]])`);
  assert.equal((await h.request('POST',{apikey:'fixture-public'},'{}')).status,500);assert.equal(client.state.saved.length,0);
  client.state.updateError=null;
  h.run(`fetchYouTubeVideos=async()=>new Map([['abcdefghijk',{statistics:{viewCount:'0'},snippet:{publishedAt:'2026-10-03T00:00:00Z'}}]])`);
  assert.equal((await h.request('POST',{apikey:'fixture-public'},'{}')).status,200);assert.equal(client.state.saved.length,1);
});

test('monthly finalization: before supported month exits without DB or API',async()=>{
  const h=fixture('finalize-monthly-achievements',{from(){throw Error('Unexpected DB access');}});h.run(`currentJstMonthKey=()=> '2026-08'`);
  const response=await h.request('POST',{apikey:'fixture-public'},'{}');assert.equal(response.status,200);assert.equal((await response.json()).skipped,'snapshot_start_month_not_reached');
});
