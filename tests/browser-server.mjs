import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, save, appendImages } from './fixtures/idea-images-db.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const origin='http://127.0.0.1:8766';
const prefix='/storage/v1/object/public/idea-images/';
const db=await createDatabase();
// Fresh in-memory fixtures only; CSP and loopback binding forbid production I/O.
await db.exec(`reset role;
  create table videos(id uuid primary key default gen_random_uuid(),title text,video_type text,status text,post_date date,youtube_url text,youtube_video_id text,youtube_views bigint,youtube_likes bigint,youtube_comments bigint,youtube_published_at timestamptz,youtube_synced_at timestamptz,tags text,memo text,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
  create table goals(id uuid primary key default gen_random_uuid(),title text,goal_scope text,goal_month text,goal_key text,target_value integer,current_value integer,achieved boolean,deadline date,achieved_date date,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz,unique(goal_scope,goal_month,goal_key));
  create table monthly_achievement_snapshots(month_key text primary key,subscriber_count bigint,highest_views bigint,post_count integer,monthly_views bigint,average_views bigint,likes bigint,tag_counts jsonb,metric_targets jsonb,tag_targets jsonb,is_finalized boolean,finalized_at timestamptz);
  create table monthly_payments(month_key text primary key,is_paid boolean,paid_at timestamptz,updated_at timestamptz);
  create table notifications(id uuid primary key default gen_random_uuid(),title text,message text,entity_type text,entity_id text,is_read boolean,created_at timestamptz default now());
  create table activity_logs(id uuid primary key default gen_random_uuid(),entity_type text,entity_id text,action text,entity_title text,details text,actor_email text,created_at timestamptz default now());
  create table channel_stats(channel_id text primary key,channel_title text,subscriber_count bigint,total_view_count bigint,video_count bigint,synced_at timestamptz);
  grant all on videos,goals,monthly_achievement_snapshots,monthly_payments,notifications,activity_logs,channel_stats to authenticated;
  set role authenticated;
`);
const thisMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
for (const [title,type,tags,day,status] of [['最新Shorts','Shorts','競艇ニュース',14,'投稿済み'],['長い動画タイトル・表示確認のために改行してもカードからはみ出さない競艇選手紹介動画','横動画','横動画、選手解説',12,'投稿済み'],['レース動画','Shorts','競艇ニュース、レース映像',10,'投稿済み'],['投稿待ち動画','Shorts','用語解説',9,'編集待ち']]) {
  await db.query('insert into videos(title,video_type,tags,post_date,status,youtube_video_id,youtube_views,youtube_likes,youtube_comments,youtube_synced_at) values($1,$2,$3,$4,$5,$6,12500,200,30,now())',[title,type,tags,`${thisMonth}-${day}`,status,'abcdefghijk']);
}
await db.query(`insert into channel_stats values('qa-channel','Local QA',500,100000,50,now())`);
for(const [key,target] of [['subscribers',1000],['highest_views',10000],['posts',10],['monthly_views',100000],['average_views',20000],['likes',1000],['tag_horizontal',10],['tag_player',5],['tag_news',30]]) await db.query(`insert into goals(title,goal_scope,goal_month,goal_key,target_value) values($1,'monthly',$2,$1,$3)`,[key,thisMonth,target]);
await db.query(`insert into monthly_payments values('2026-07',true,now(),now())`);
await db.query(`insert into notifications(title,message,entity_type,entity_id,is_read) values('旧目標通知','履歴の互換性確認','goal','legacy',false)`);
const assets=new Map();
const audit=[];
const svg=(w,h,label)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#dce9f9"/><rect x="2" y="2" width="${w-4}" height="${h-4}" fill="none" stroke="#cf4257" stroke-width="4"/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#6895bf" stroke-width="4"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="${Math.min(w,h)/8}">${label}</text></svg>`;
async function image(index) {
  const p=`ideas/qa-${index}.svg`;
  const [w,h]=[[1200,600],[900,1800],[500,7000],[64,48]][index%4];
  assets.set(p,{body:svg(w,h,`Image ${index+1}`),mime:'image/svg+xml'});
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2) on conflict do nothing',['idea-images',p]);
  return origin+prefix+p;
}
const urls=await Promise.all(Array.from({length:10},(_,i)=>image(i)));
const values=title=>({title,status:'アイデア',note:'複数画像のローカル検証です。\n既存画像を残し、追加順を維持します。',tags:'画像テスト'});
await db.query('insert into ideas(title,status,note,image_url) values($1,$2,$3,$4)',['旧データ・画像1枚','アイデア','再アップロード不要',urls[0]]);
for(const n of [0,2,5,10]) await save(db,'idea',null,values(`画像${n}枚の企画`),urls.slice(0,n));
const board=await save(db,'idea',null,{...values('複数画像の企画ボード'),status:'実行済み'},urls.slice(0,2));
for(const n of [0,1,2,5,10]) await save(db,'idea_item',null,{...values(`画像${n}枚の企画内アイデア`),parent_idea_id:board.id},urls.slice(0,n));

function mockSdk() {
  const mode=new URLSearchParams(location.search).get('qa');
  const history=[];
  async function api(endpoint,payload,options={}) {
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),...options});
    const result=await response.json(); history.push({endpoint,payload,error:result.error,images:Array.isArray(result.data)?result.data.filter(r=>r.idea_images).map(r=>({title:r.title,count:r.idea_images.length})):null});
    document.documentElement.dataset.qaHistory=JSON.stringify(history);
    return result;
  }
  function from(table) {
    const request={table,action:'select',filters:[]};
    const q={
      select(){return q;},order(){return q;},limit(){return q;},
      eq(k,v){request.filters.push([k,v]);return q;},is(k,v){request.filters.push([k,v]);return q;},
      single(){request.single=true;return q;},maybeSingle(){request.single=true;return q;},
      insert(payload){request.action='insert';request.payload=payload;return q;},
      update(payload){request.action='update';request.payload=payload;return q;},
      delete(){request.action='delete';return q;},
      upsert(payload){request.action='upsert';request.payload=payload;return q;},
      in(k,v){request.filters.push([k,v]);return q;},
      then(resolve,reject){
        if((mode==='core-error'&&table==='videos')||(mode==='optional-error'&&table==='goals'))return Promise.resolve({data:null,error:{message:'Local QA simulated network failure'}}).then(resolve,reject);
        return api('/qa-query',request).then(resolve,reject);
      }
    };return q;
  }
  const user={id:'00000000-0000-4000-8000-000000000001',email:'qa@example.test'};
  let session=mode==='logged-out'?null:{user,access_token:'local-fixture-only',expires_at:Math.floor(Date.now()/1000)+3600};
  let onAuth=()=>{};
  window.supabase={createClient:()=>({
    from,rpc:(name,params)=>api('/qa-rpc',{name,params}),
    auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user||null},error:null}),refreshSession:async()=>({data:{session},error:null}),onAuthStateChange:cb=>{onAuth=cb;return {data:{subscription:{unsubscribe(){}}}};},
      signInWithPassword:async()=>{session={user,expires_at:Date.now()/1000+3600};onAuth('SIGNED_IN',session);return {data:{user},error:null};},
      signOut:async()=>{session=null;onAuth('SIGNED_OUT',null);return {error:null};}},
    functions:{invoke:async(name,{body})=>({data:{updated:body.videoRecordIds,failed:[]},error:null})},
    channel:()=>({on(){return this;},subscribe(cb){cb('SUBSCRIBED');return this;}}),removeChannel:async()=>{},
    storage:{from:bucket=>({
      getPublicUrl:p=>({data:{publicUrl:`${location.origin}/storage/v1/object/public/${bucket}/${p}`}}),
      async upload(p,file){const response=await fetch(`/qa-upload/${encodeURIComponent(p)}`,{method:'PUT',body:file,headers:{'Content-Type':file.type}});return response.json();},
      remove:paths=>api('/qa-remove',{bucket,paths})
    })}
  })};
}
async function query(request) {
  const {table,action,filters=[],single,payload}=request;
  if(!['ideas','idea_items'].includes(table)) {
    if(!['videos','goals','monthly_achievement_snapshots','monthly_payments','notifications','activity_logs','channel_stats'].includes(table))throw Error('Unexpected table');
    const args=[];
    const column=k=>{if(!/^[a-z_]+$/.test(k))throw Error('Unexpected column');return k;};
    const where=filters.map(([k,v])=>{column(k);if(v===null)return `${k} is null`;args.push(v);return Array.isArray(v)?`${k}=any($${args.length})`:`${k}=$${args.length}`;}).join(' and ')||'true';
    if(action==='select'){
      const rows=(await db.query(`select * from ${table} where ${where}`,args)).rows.map(row=>{
        if(row.post_date instanceof Date)row.post_date=row.post_date.toISOString().slice(0,10);
        return row;
      });return {data:single?(rows[0]||null):rows,error:null};
    }
    if(action==='delete')return {data:(await db.query(`delete from ${table} where ${where} returning *`,args)).rows,error:null};
    if(action==='update'){const fields=Object.entries(payload).map(([k,v])=>{args.push(v);return `${column(k)}=$${args.length}`;});const rows=(await db.query(`update ${table} set ${fields.join(',')} where ${where} returning *`,args)).rows;return {data:single?rows[0]:rows,error:null};}
    const rows=[];
    for(const item of Array.isArray(payload)?payload:[payload]) {
      const fields=Object.keys(item).map(column),values=Object.values(item);
      const conflict=table==='goals'?'goal_scope,goal_month,goal_key':'month_key';
      const update=fields.filter(k=>!conflict.split(',').includes(k)).map(k=>`${k}=excluded.${k}`).join(',');
      rows.push(...(await db.query(`insert into ${table}(${fields}) values(${fields.map((_,i)=>'$'+(i+1))}) ${action==='upsert'?`on conflict(${conflict}) do update set ${update}`:''} returning *`,values)).rows);
    }
    return {data:single?rows[0]:rows,error:null};
  }
  const args=[];
  const where=filters.map(([k,v])=>{
    if(!['id','deleted_at','status'].includes(k))throw Error('Unexpected filter');
    if(v===null)return `t.${k} is null`;args.push(v);return `t.${k}=$${args.length}`;
  }).join(' and ')||'true';
  if(action==='select') {
    const parent=table==='ideas'?'idea_id':'idea_item_id';
    const rows=(await db.query(`select t.*,coalesce((select jsonb_agg(i order by i.sort_order) from idea_images i where i.${parent}=t.id),'[]'::jsonb) idea_images from ${table} t where ${where} order by t.created_at desc`,args)).rows;
    return {data:single?(rows[0]||null):rows,error:null};
  }
  if(action==='delete')return {data:(await db.query(`delete from ${table} t where ${where} returning *`,args)).rows,error:null};
  if(action==='update'){
    const fields=Object.entries(payload).map(([k,v])=>{if(!['title','status','note','tags','updated_at','deleted_at'].includes(k))throw Error('Unexpected update');args.push(v);return `${k}=$${args.length}`;});
    return {data:(await db.query(`update ${table} t set ${fields.join(',')} where ${where} returning *`,args)).rows,error:null};
  }
  throw Error('Unexpected direct parent insert');
}
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'");
  const pathname=new URL(req.url,origin).pathname;
  try {
    if(pathname.startsWith(prefix)){
      const asset=assets.get(pathname.slice(prefix.length));if(!asset){res.statusCode=404;return res.end('missing image');}
      res.setHeader('Content-Type',asset.mime);return res.end(asset.body);
    }
    if(pathname==='/qa-client.js'){res.setHeader('Content-Type','text/javascript');return res.end(`(${mockSdk.toString()})()`);}
    if(pathname.startsWith('/qa-thumbnails/')){res.setHeader('Content-Type','image/svg+xml');return res.end(svg(640,360,'YouTube QA'));}
    if(pathname.startsWith('/qa-')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      let result;
      if(pathname.startsWith('/qa-upload/')){
        const p=decodeURIComponent(pathname.slice('/qa-upload/'.length));
        await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['idea-images',p]);
        assets.set(p,{body,mime:req.headers['content-type']});result={data:{path:p},error:null};
      }else{
        const input=JSON.parse(body.toString());audit.push({pathname,input});
        if(pathname==='/qa-query')result=await query(input);
        else if(pathname==='/qa-rpc'){
          const p=input.params;
          if(input.name==='save_idea_with_images')result={data:await appendImages(db,p.p_kind,p.p_id,p.p_values,p.p_added_image_urls,p.p_removed_image_urls,p.p_expected_image_urls,p.p_expected_updated_at),error:null};
          else if(input.name==='move_idea_to_completed_parent')result={data:(await db.query('select public.move_idea_to_completed_parent($1,$2) result',[p.p_source_idea_id,p.p_target_idea_id])).rows[0].result,error:null};
          else throw Error('Unexpected RPC');
        }else if(pathname==='/qa-remove'){
          const removed=(await db.query('delete from storage.objects where bucket_id=$1 and name=any($2) returning name',[input.bucket,input.paths])).rows;
          removed.forEach(row=>assets.delete(row.name));result={data:removed,error:null};
        }else throw Error('Unknown local API');
      }
      res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));
    }
    const name=pathname==='/'?'index.html':pathname.slice(1);
    if(!['index.html','app.js','style.css','manifest.json','icon-180.png','icon-192.png','icon-512.png'].includes(name)){res.statusCode=404;return res.end('not found');}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png'})[path.extname(name)]);
    let content=fs.readFileSync(path.join(root,name));
    if(name==='index.html')content=content.toString().replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js','/qa-client.js');
    if(name==='index.html'&&new URL(req.url,origin).searchParams.get('qa')==='version')content=content.toString().replace('name="app-version" content="23.31"','name="app-version" content="obsolete"');
    if(name==='app.js')content=content.toString().replace('const SUPABASE_URL = "https://jyxrrnfnypqaecfojsle.supabase.co";',`const SUPABASE_URL = "${origin}";`).replaceAll('https://img.youtube.com',origin+'/qa-thumbnails');
    res.end(content);
  }catch(error){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{code:error.code,message:error.message}}));}
}).listen(8766,'127.0.0.1',()=>console.log('Multi-image QA with local Postgres at '+origin));
