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
