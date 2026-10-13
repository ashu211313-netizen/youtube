const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness,deferred}=require('./fixtures/app-harness.cjs');
const variants=[['soft-video','deleteItem("video","v",button)','videos','videoDetailModal','移動しました'],['soft-idea','deleteItem("idea","i",button)','ideas','ideaDetailModal','移動しました'],['permanent-video','permanentDeleteItem("video","v",button)','videos',null,'削除しました'],['permanent-idea','permanentDeleteItem("idea","i",button)','ideas',null,'削除しました'],['nested','deleteIdeaItem("n",button)','idea_items','ideaItemDetailModal','削除しました']];
async function flush(){for(let i=0;i<40;i++)await Promise.resolve();}
function fixture(variant,options={}){
  const writes=[];let signal;
  const client={from(table){let id;const q={update(payload){writes.push({table,action:'update',payload});return q;},delete(){writes.push({table,action:'delete'});return q;},eq(k,v){id=v;writes.at(-1).filter=[k,v];return q;},select(){return q;},maybeSingle(){return q;},abortSignal(s){signal=s;return q;},then(resolve,reject){return (options.result?options.result():Promise.resolve({data:{id},error:null})).then(resolve,reject);}};return q;}};
  const h=harness({client});h.context.AbortController=AbortController;h.context.button=h.node('delete-trigger');h.node('delete-trigger').textContent='削除';
  h.run(`window.confirm=()=>true;authenticatedUserId='qa';data.videos=[{id:'v',title:'video'}];data.ideas=[{id:'i',title:'idea'}];data.ideaItems=[{id:'n',title:'nested',parentIdeaId:'i'}];data.trash=[{id:'v',title:'trash video',entityType:'video'},{id:'i',title:'trash idea',entityType:'idea'}];currentDetailVideoId='v';currentDetailIdeaId='i';currentDetailIdeaItemId='n';var realImageCleanup=cleanupIdeaImages;addActivityLog=async()=>true;cleanupIdeaImages=async()=>{};loadAllData=async()=>true;renderAll=()=>{};renderTrash=()=>{};`);
  if(variant[3])h.node(variant[3]).open=true;
  return {h,writes,start:()=>h.run(variant[1]),button:h.node('delete-trigger'),signal:()=>signal};
}
function restored(f){assert.equal(f.button.disabled,false);assert.equal(f.button.textContent,'削除');}
for(const v of variants){
  test(v[0]+': success confirms DB, restores detached button and closes only matching detail',async()=>{
    const f=fixture(v);f.button.isConnected=false;await f.start();restored(f);assert.equal(f.writes.length,1);assert.equal(f.writes[0].table,v[2]);assert.match(f.h.node('toast').textContent,new RegExp(v[4]));if(v[3])assert.equal(f.h.node(v[3]).open,false);
    assert.equal(f.writes[0].action,v[0].startsWith('soft')?'update':'delete');
  });
  for(const failure of ['error','rejection','zero'])test(v[0]+': '+failure+' is not success; detail remains open',async()=>{
    const f=fixture(v,{result:()=>failure==='rejection'?Promise.reject(Error('network rejected')):Promise.resolve(failure==='error'?{error:{message:'invalid JWT'}}:{data:null,error:null})});
    await f.start();restored(f);assert.match(f.h.node('toast').className,/error/);assert(!f.h.node('toast').textContent.includes(v[4]));if(v[3])assert.equal(f.h.node(v[3]).open,true);
  });
  test(v[0]+': offline exits without mutation',async()=>{const f=fixture(v);f.h.context.navigator.onLine=false;await f.start();restored(f);assert.equal(f.writes.length,0);assert.match(f.h.node('toast').textContent,/オフライン/);});
  test(v[0]+': duplicate call sends exactly one request and restores original text',async()=>{
    const gate=deferred(),f=fixture(v,{result:()=>gate.promise});const first=f.start();await flush();assert.equal(f.button.disabled,true);await f.start();assert.equal(f.writes.length,1);gate.resolve({data:{id:'ok'},error:null});await first;restored(f);
  });
  test(v[0]+': hanging mutation aborts request, reports unknown, never resends',async()=>{
    const gate=deferred(),f=fixture(v,{result:()=>gate.promise});const first=f.start();await flush();await f.h.tick(30000);await first;restored(f);assert.equal(f.signal().aborted,true);assert.match(f.h.node('toast').textContent,/結果.*確認/);if(v[3])assert.equal(f.h.node(v[3]).open,true);
    await f.start();assert.equal(f.writes.length,1);gate.resolve({data:{id:'late'},error:null});await flush();await f.start();assert.equal(f.writes.length,1);
  });
  for(const stage of ['addActivityLog','loadAllData',...(v[0]==='permanent-idea'||v[0]==='nested'?['cleanupIdeaImages']:[])])for(const failure of ['throw','hang'])test(v[0]+': '+stage+' '+failure+' cannot strand loading or misreport committed DB',async()=>{
    const f=fixture(v);f.h.run(`${stage}=${failure==='throw'?'async()=>{throw Error("aux failure")}':'()=>new Promise(()=>{})'}`);const task=f.start();await flush();if(failure==='hang')await f.h.tick(10000);await task;restored(f);assert.match(f.h.node('toast').textContent,new RegExp(v[4]));assert.match(f.h.node('toast').textContent,/ただし/);if(v[3])assert.equal(f.h.node(v[3]).open,false);
  });
}
test('shared in-flight reload cannot resurrect confirmed-deleted local rows',async()=>{
  const f=fixture(variants[0]);f.h.run(`loadAllData=async()=>{data.videos=[{id:'v',title:'stale'}];return true;}`);await f.start();assert.equal(f.h.run('data.videos.length'),0);assert.equal(f.h.run('data.trash.filter(x=>x.id==="v").length'),1);
});
test('logout during mutation prevents stale UI/data work; finally still restores button',async()=>{
  const gate=deferred(),f=fixture(variants[4],{result:()=>gate.promise});const task=f.start();await flush();f.h.run('appSessionGeneration++;data=createEmptyDataState()');gate.resolve({data:{id:'n'},error:null});await task;restored(f);assert.equal(f.h.run('data.ideaItems.length'),0);assert.equal(f.h.node('toast').textContent,'');
});
test('SDK returned fetch failure is an unknown outcome and cannot be blindly resent',async()=>{
  const f=fixture(variants[2],{result:()=>Promise.resolve({data:null,error:{message:'TypeError: Failed to fetch',code:''}})});await f.start();restored(f);assert.match(f.h.node('toast').textContent,/結果.*確認/);await f.start();assert.equal(f.writes.length,1);
});
test('restore cannot race a still-running deletion',async()=>{
  const gate=deferred(),f=fixture(variants[0],{result:()=>gate.promise});const task=f.start();await flush();await f.h.run('restoreItem("video","v",button)');assert.equal(f.writes.length,1);gate.resolve({data:{id:'v'},error:null});await task;restored(f);
});
for(const stage of ['addActivityLog','loadAllData'])test(stage+' false result reports incomplete follow-up, not failed mutation',async()=>{
  const f=fixture(variants[2]);f.h.run(`${stage}=async()=>false`);await f.start();restored(f);assert.match(f.h.node('toast').textContent,/削除しました.*ただし/);
});
for(const failure of ['returned-error','rejection','hang'])test('actual Storage cleanup '+failure+' keeps pending paths and finishes deletion UI',async()=>{
  const f=fixture(variants[3]);const gate=deferred();f.h.context.cleanupStorage={from:()=>({remove:()=>failure==='hang'?gate.promise:failure==='rejection'?Promise.reject(Error('Storage offline')):Promise.resolve({error:{message:'protected reference'}})})};
  f.h.run('supabaseClient.storage=cleanupStorage;cleanupIdeaImages=realImageCleanup;data.trash[1].imageUrl=SUPABASE_URL+"/storage/v1/object/public/idea-images/ideas/retained.png"');
  const task=f.start();await flush();if(failure==='hang')await f.h.tick(10000);await task;restored(f);assert.equal(f.h.run('pendingIdeaImageCleanup.size'),1);assert.match(f.h.node('toast').textContent,/削除しました.*ただし/);
  if(failure==='hang'){gate.reject(Error('late failure'));await flush();}
});
