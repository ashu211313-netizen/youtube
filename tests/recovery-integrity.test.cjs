// Isolated SDK contract/lifecycle tests. No emails, real Auth, or production writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness,deferred}=require('./fixtures/app-harness.cjs');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function recoveryHarness(options={}){
  const user={id:'recovery-user'},state={requests:[],updates:[],signouts:[],session:null,user,error:null,updateError:null};
  let listener=()=>{};
  const client={removeChannel:async()=>{},auth:{
    onAuthStateChange(cb){listener=cb;return {data:{subscription:{unsubscribe(){}}}};},
    getSession:async()=>({data:{session:state.session},error:null}),
    getUser:async()=>({data:{user:state.user},error:state.error}),
    resetPasswordForEmail:async(email,options)=>{state.requests.push({email,options});return {error:state.error};},
    updateUser:async(payload)=>{state.updates.push(payload);return {data:{user:state.user},error:state.updateError};},
    signOut:async(options)=>{state.signouts.push(options);state.session=null;listener('SIGNED_OUT',null);return {error:null};}
  }};
  const h=harness({client,...options});h.run('setupAuthStateListener()');
  return {...h,state,client,emit:(event,session=state.session)=>listener(event,session),async activate(){state.session={user,expires_at:Date.now()/1000+3600};listener('PASSWORD_RECOVERY',state.session);await h.tick(0);}};
}
test('reset email uses actual app subdirectory and neutral non-enumerating delivery response',async()=>{
  for(const error of [null,{code:'user_not_found'}]){
    const h=recoveryHarness();h.state.error=error;h.node('passwordResetEmail').value=' qa@example.test ';
    assert.equal(await h.run('requestPasswordReset()'),true);
    assert.deepEqual(JSON.parse(JSON.stringify(h.state.requests)),[{email:'qa@example.test',options:{redirectTo:'https://qa.invalid/repo/?recovery=1'}}]);
    assert.match(h.node('passwordRecoveryMessage').textContent,/登録されている場合/);
    assert.equal(await h.run('requestPasswordReset()'),false);assert.equal(h.state.requests.length,1);
  }
});
test('reset request single-flight; rate limit/network failure do not expose server text',async()=>{
  const h=recoveryHarness(),gate=deferred();h.client.auth.resetPasswordForEmail=()=>gate.promise;
  const a=h.run('requestPasswordReset()');assert.equal(await h.run('requestPasswordReset()'),false);
  gate.resolve({error:{status:429,message:'sensitive server text'}});await a;
  assert.match(h.node('passwordRecoveryMessage').textContent,/上限/);assert(!JSON.stringify(h.logs).includes('sensitive server text'));
});
test('direct recovery URL cannot authorize update or reveal application data',async()=>{
  const h=recoveryHarness({href:'https://qa.invalid/repo/?recovery=1'});
  assert.equal(await h.run(`startAuthenticatedApp({id:'recovery-user'})`),false);
  h.node('recoveryPassword').value=h.node('recoveryPasswordConfirm').value='strong-fixture-password';
  assert.equal(await h.run('updateRecoveryPassword()'),false);assert.equal(h.state.updates.length,0);
  assert.equal(await h.run('performAppResume()'),false);
});
test('SDK callback cleanup removes credentials but retains non-secret reload guard until finish',async()=>{
  const h=recoveryHarness({href:'https://qa.invalid/repo/?recovery=1&code=never-log-code#access_token=never-log-token&type=recovery'}),urls=[];
  h.context.window.history.replaceState=(a,b,url)=>urls.push(url);await h.activate();
  assert.equal(urls.at(-1),'/repo/?recovery=1');assert(!JSON.stringify(h.logs).includes('never-log'));
  await h.run('finishPasswordRecovery()');assert.equal(urls.at(-1),'/repo/');
});
test('PASSWORD_RECOVERY wins over startup/SIGNED_IN and validates user outside SDK callback',async()=>{
  const h=recoveryHarness();h.run(`var starts=0;startAuthenticatedApp=async()=>{starts++;}`);
  h.state.session={user:h.state.user,expires_at:Date.now()/1000+3600};
  h.emit('SIGNED_IN');h.emit('PASSWORD_RECOVERY');await h.tick(0);
  assert.equal(h.run('starts'),0);assert.equal(h.run('passwordRecoveryUserId'),'recovery-user');
  assert(!h.node('passwordUpdateForm').classList.contains('is-hidden'));assert(h.node('appRoot').classList.contains('is-hidden'));
});
test('successful recovery updates once, clears fields, locally signs out, returns to login',async()=>{
  const h=recoveryHarness();await h.activate();h.node('recoveryPassword').value=h.node('recoveryPasswordConfirm').value='strong-fixture-password';
  assert.equal(await h.run('updateRecoveryPassword()'),true);assert.equal(h.state.updates.length,1);assert.equal(h.state.updates[0].password,'strong-fixture-password');
  assert.equal(h.state.signouts[0].scope,'local');assert.equal(h.node('recoveryPassword').value,'');assert.equal(h.node('recoveryPasswordConfirm').value,'');
  assert.equal(h.run('passwordRecoveryIntent'),false);assert(!h.node('loginForm').classList.contains('is-hidden'));assert.match(h.node('loginMessage').textContent,/変更しました/);
  assert(!JSON.stringify(h.logs).includes('strong-fixture-password'));
});
test('weak/mismatched password and expired/used recovery session never update',async()=>{
  const h=recoveryHarness();await h.activate();
  for(const [password,confirm] of [['short','short'],['long-password','different']]){
    h.node('recoveryPassword').value=password;h.node('recoveryPasswordConfirm').value=confirm;assert.equal(await h.run('updateRecoveryPassword()'),false);
  }
  h.node('recoveryPassword').value=h.node('recoveryPasswordConfirm').value='strong-fixture-password';h.state.error={code:'session_expired'};
  assert.equal(await h.run('updateRecoveryPassword()'),false);assert.equal(h.state.updates.length,0);
});
test('server weak-password and network rejection leave retry usable, with no credential log',async()=>{
  const h=recoveryHarness();await h.activate();h.node('recoveryPassword').value=h.node('recoveryPasswordConfirm').value='strong-fixture-password';
  h.state.updateError={code:'weak_password',message:'secret-password-text'};assert.equal(await h.run('updateRecoveryPassword()'),false);
  assert.equal(h.node('passwordUpdateButton').disabled,false);assert.match(h.node('passwordRecoveryMessage').textContent,/安全性/);assert(!JSON.stringify(h.logs).includes('secret-password-text'));
});
test('invalid recovery event cannot prove account ownership; stale verification after signout discarded',async()=>{
  const h=recoveryHarness();h.state.error={code:'session_expired'};await h.activate();assert.equal(h.run('passwordRecoveryUserId'),'');assert(h.node('passwordUpdateForm').classList.contains('is-hidden'));
  const gate=deferred(),other=recoveryHarness();other.client.auth.getUser=()=>gate.promise;
  const pending=other.activate();await flush();other.emit('SIGNED_OUT');gate.resolve({data:{user:other.state.user},error:null});await pending;await flush();
  assert.equal(other.run('passwordRecoveryUserId'),'');
});
test('account switch while recovery update validates cannot update another user',async()=>{
  const h=recoveryHarness();await h.activate();h.node('recoveryPassword').value=h.node('recoveryPasswordConfirm').value='strong-fixture-password';
  const gate=deferred();h.client.auth.getUser=()=>gate.promise;const pending=h.run('updateRecoveryPassword()');await flush();
  h.emit('SIGNED_IN',{user:{id:'other'}});gate.resolve({data:{user:h.state.user}});assert.equal(await pending,false);assert.equal(h.state.updates.length,0);
});
test('repeated recovery submit sends one update request; failed local signout does not open home',async()=>{
  const h=recoveryHarness();await h.activate();h.node('recoveryPassword').value=h.node('recoveryPasswordConfirm').value='strong-fixture-password';
  const gate=deferred();h.client.auth.updateUser=payload=>{h.state.updates.push(payload);return gate.promise;};
  h.client.auth.signOut=async()=>({error:{status:503}});
  const first=h.run('updateRecoveryPassword()');await flush();assert.equal(await h.run('updateRecoveryPassword()'),false);gate.resolve({data:{user:h.state.user}});await first;
  assert.equal(h.state.updates.length,1);assert.equal(h.run('passwordRecoveryIntent'),true);assert.equal(await h.run(`startAuthenticatedApp({id:'recovery-user'})`),false);
  assert(!h.node('finishRecoveryButton').classList.contains('is-hidden'));
});
test('queued SIGNED_IN cannot resurrect a session after immediate SIGNED_OUT',async()=>{
  const h=recoveryHarness();h.run(`var starts=0;startAuthenticatedApp=()=>{starts++;}`);h.state.session={user:h.state.user};h.emit('SIGNED_IN');h.emit('SIGNED_OUT');await h.tick(0);assert.equal(h.run('starts'),0);
});
test('recovery target/session change always clears both password fields',async()=>{
  const h=recoveryHarness();await h.activate();
  const fill=()=>{h.node('recoveryPassword').value=h.node('recoveryPasswordConfirm').value='never-reuse-this-password';};
  const empty=()=>{assert.equal(h.node('recoveryPassword').value,'');assert.equal(h.node('recoveryPasswordConfirm').value,'');};
  fill();h.emit('SIGNED_IN',{user:{id:'another-user'}});empty();
  fill();h.emit('SIGNED_OUT');empty();
  fill();h.state.user={id:'another-user'};h.state.session={user:h.state.user};h.emit('PASSWORD_RECOVERY');await h.tick(0);empty();
  assert.equal(h.run('passwordRecoveryUserId'),'another-user');
  fill();h.state.user={id:'third-user'};h.state.session={user:h.state.user};h.emit('PASSWORD_RECOVERY');await h.tick(0);empty();
  assert.equal(h.run('passwordRecoveryUserId'),'third-user');
});
test('transient resume failure preserves cached data; definite invalid refresh requires login',async()=>{
  for(const [error,expected] of [[{status:503,message:'offline'},1],[{code:'refresh_token_not_found'},0]]){
    const h=harness({client:{removeChannel:async()=>{}}});h.context.failure=error;h.run(`authenticatedUserId='qa';data.videos=[{id:'kept'}];validateAuthenticatedSession=async()=>{throw failure;}`);
    assert.equal(await h.run('performAppResume()'),false);assert.equal(h.run('data.videos.length'),expected);
  }
});
test('Realtime connected cannot replace partial/error data-read result',async()=>{
  const h=harness({client:{removeChannel:async()=>{},channel:()=>({on(){return this;},subscribe(cb){cb('SUBSCRIBED');}})}});
  h.run(`authenticatedUserId='qa';fetchAllDataOnce=async()=>({ok:true,optionalErrors:[{label:'月間目標',error:{code:'08006'}}]})`);
  await h.run('performDataLoad()');await h.run('subscribeRealtime()');assert.match(h.node('syncStatus').textContent,/Realtime/);assert.equal(h.node('dataLoadStatus').textContent,'一部データ未取得');
});
test('all warning views distinguish missing/invalid URL, valid ID, zero/null and posted/waiting',()=>{
  const h=harness();
  const rows=[
    [{status:'投稿済み',post_date:'2026-10-01'},['YouTube URL未設定']],
    [{status:'投稿済み',post_date:'2026-10-01',youtube_url:'https://evil.invalid/x'},['YouTube URLを確認']],
    [{status:'投稿済み',post_date:'2026-10-01',youtube_video_id:'abcdefghijk',youtube_views:0},[]],
    [{status:'投稿済み',post_date:'2026-10-01',youtube_video_id:'abcdefghijk'},['YouTube情報未同期']],
    [{status:'編集待ち',youtube_video_id:'abcdefghijk'},['投稿日未設定']]
  ];
  for(const [row,expected] of rows){h.context.row={id:'qa',title:'<title>',...row};h.run('var video=mapVideo(row)');assert.deepEqual(Array.from(h.run('getVideoDataWarnings(video)')),expected);
    h.run(`data.videos=[video];setVideoViewMode('card')`);for(const text of expected)assert(h.node('videoList').innerHTML.includes(text));
    h.run(`setVideoViewMode('minimal')`);for(const text of expected)assert(h.node('videoList').innerHTML.includes(text));
    for(const text of expected)assert(h.run('renderVideoWarnings(video)').includes(text));
    if(expected.length)assert(h.run('renderVideoWarnings(video)').includes(row.status==='投稿済み'?'⚠':'ⓘ'));
  }
});
