const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, deferred } = require('./fixtures/app-harness.cjs');
const flush = async () => { for(let i=0;i<20;i++) await Promise.resolve(); };
test('YouTube completion after logout must not start a new data read',async()=>{
  const gate=deferred(),h=harness({client:{functions:{invoke:()=>gate.promise},removeChannel:async()=>{}}});
  h.run(`authenticatedUserId='qa';var reloads=0;loadAllData=async()=>{reloads++;}`);
  const pending=h.run(`syncYouTubeVideos(['v'],null,{silent:true})`);await h.run('resetAuthenticatedApp()');
  gate.resolve({data:{updated:['v'],failed:[]},error:null});await pending;assert.equal(h.run('reloads'),0);
});

test('restart / stop owns and cancels the startup timeout as well as the interval', () => {
  const h=harness(); h.run('startYouTubeAutoSync(); startYouTubeAutoSync()');
  assert.equal([...h.timers.values()].filter(t=>!t.interval).length,1);
  assert.equal([...h.timers.values()].filter(t=>t.interval).length,1);
  h.run('stopYouTubeAutoSync()'); assert.equal(h.timers.size,0);
});
test('optional query completing after logout is discarded too',async()=>{
  const gate=deferred(),q={select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return this;},maybeSingle(){return this;},then(a,b){return gate.promise.then(a,b);}};
  const h=harness({client:{from:()=>q,removeChannel:async()=>{}}});
  h.run(`authenticatedUserId='user';selectNewestRows=async()=>({data:[],error:null});renderLoadedDataViews=()=>{}`);
  const pending=h.run('loadAllData()');await flush();await h.run('resetAuthenticatedApp()');
  gate.resolve({data:[{id:'old',goal_month:'2026-08',goal_key:'posts',target_value:50}],error:null});await pending;
  assert.equal(h.run('data.achievementGoals.length'),0);
});
test('old finally cannot clear a new session data single-flight',async()=>{
  const a=deferred(),b=deferred(),h=harness({client:{removeChannel:async()=>{}}});h.context.a=a.promise;h.context.b=b.promise;
  h.run(`authenticatedUserId='old';performDataLoad=()=>a`);const old=h.run('loadAllData()');
  await h.run('resetAuthenticatedApp()');h.run(`authenticatedUserId='new';performDataLoad=()=>b`);
  const current=h.run('loadAllData()');a.resolve(false);await old;assert.equal(h.run('dataLoadInFlight'),current);
  b.resolve(true);await current;assert.equal(h.run('dataLoadInFlight'),null);
});
test('Auth expired session refreshes once, concurrent callers share validation',async()=>{
  let refreshes=0,users=0;const user={id:'qa'},session={user,expires_at:1};
  const h=harness({client:{auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>{refreshes++;return {data:{session:{...session,expires_at:Date.now()/1000+3600}}};},getUser:async()=>{users++;return {data:{user}};}}}});
  const a=h.run('validateAuthenticatedSession()'),b=h.run('validateAuthenticatedSession()');assert.equal(a,b);
  assert.equal((await a).user.id,'qa');assert.equal(refreshes,1);assert.equal(users,1);
});
test('future-issued JWT recovery is bounded and does not log credentials',async()=>{
  let refreshes=0,checks=0;const user={id:'qa'},session={user,access_token:'never-log-this-token',expires_at:Date.now()/1000+3600};
  const h=harness({client:{auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>{refreshes++;return {data:{session}};},getUser:async()=>{checks++;return {data:{user:null},error:{code:'PGRST303',message:'JWT issued at future'}};}}}});
  const pending=h.run('validateAuthenticatedSession()');const rejection=assert.rejects(pending);await flush();await h.tick(800);await rejection;
  assert.equal(refreshes,1);assert.equal(checks,2);assert(!JSON.stringify(h.logs).includes('never-log-this-token'));
});
test('core DB failure keeps shell and schedule, exposes retry; optional failure keeps core data',async()=>{
  const h=harness();h.run(`authenticatedUserId='qa';fetchAllDataOnce=async()=>({ok:false,error:new Error('network unavailable')})`);
  assert.equal(await h.run('loadAllData()'),false);assert(!h.node('appLoadError').classList.contains('is-hidden'));
  h.run(`fetchAllDataOnce=async()=>({ok:true,optionalErrors:[{label:'月間目標',error:{message:'offline'}}]})`);
  assert.equal(await h.run('loadAllData()'),true);assert(h.node('appLoadError').classList.contains('is-hidden'));
});
test('resume event storm debounces once; hidden/offline do not contact Auth',async()=>{
  const h=harness();h.run(`var resumes=0;resumeAuthenticatedApp=async()=>{resumes++;};scheduleAppResume('focus');scheduleAppResume('pageshow');scheduleAppResume('online')`);
  assert.equal([...h.timers.values()].filter(t=>t.ms===250).length,1);await h.tick(250);assert.equal(h.run('resumes'),1);
  h.run(`validateAuthenticatedSession=()=>{throw Error('must not call Auth');};document.visibilityState='hidden'`);
  assert.equal(await h.run('performAppResume()'),false);
  h.run(`document.visibilityState='visible';navigator.onLine=false`);assert.equal(await h.run('performAppResume()'),false);
});
test('normal startup and concurrent Realtime calls create only one subscription',async()=>{
  let count=0;const h=harness({client:{removeChannel:async()=>{},channel:()=>{count++;return {on(){return this;},subscribe(cb){cb('SUBSCRIBED');}};}}});
  h.run(`loadAllData=async()=>true;renderAll=()=>{}`);
  await h.run(`startAuthenticatedApp({id:'qa'})`);await Promise.all([h.run('subscribeRealtime()'),h.run('subscribeRealtime()')]);
  assert.equal(count,1);await h.run('resetAuthenticatedApp()');assert.equal(h.timers.size,0);
});
test('version mismatch blocks boot with a reload recovery action',()=>{
  const h=harness();h.context.document.querySelector=()=>({content:'obsolete'});
  assert.equal(h.run('ensureAppVersionMatch()'),false);assert.equal(h.run('versionMismatchDetected'),true);
  assert(!h.node('authRetryButton').classList.contains('is-hidden'));
});
test('stop / restart cannot unlock a still-pending YouTube auto request', async () => {
  const gate=deferred(), h=harness(); h.context.gate=gate.promise;
  h.run(`authenticatedUserId='user'; data.videos=[{id:'v',status:'投稿済み',youtubeVideoId:'abcdefghijk'}];
    var calls=0; syncYouTubeVideos=async()=>{calls++;await gate;};`);
  const first=h.run('runAutoYouTubeSync({force:true})'); h.run('stopYouTubeAutoSync()');
  const second=h.run('runAutoYouTubeSync({force:true})');
  const calls=h.run('calls'); gate.resolve(); await Promise.all([first,second]);
  assert.equal(calls,1);
  assert.equal(h.run('youtubeAutoSyncInFlight'),false);
});
test('a data response after logout cannot repopulate the cleared state', async () => {
  const gate=deferred();
  const query={select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return this;},maybeSingle(){return this;},then(ok,bad){return Promise.resolve({data:[],error:null}).then(ok,bad);}};
  const h=harness({client:{from:()=>query,removeChannel:async()=>{}}}); h.context.gate=gate.promise;
  h.run(`authenticatedUserId='user'; selectNewestRows=()=>gate; renderLoadedDataViews=()=>{};`);
  const load=h.run('loadAllData()'); await flush(); await h.run('resetAuthenticatedApp()');
  gate.resolve({data:[{id:'old',title:'old session'}],error:null}); await load;
  assert.equal(h.run('data.videos.length'),0); assert.equal(h.run('lastSuccessfulDataLoadAt'),0);
});
test('logout closes open dialogs and clears state before slow channel removal', async () => {
  const gate=deferred(), h=harness({client:{removeChannel:()=>gate.promise}});
  h.run(`authenticatedUserId='user';realtimeChannel={};elements.formModal.open=true;data.videos=[{id:'old'}]`);
  const reset=h.run('resetAuthenticatedApp()');
  assert.equal(h.node('formModal').open,false); assert.equal(h.run('data.videos.length'),0);
  gate.resolve(); await reset;
});
test('stale startup cannot install a Realtime subscription or auto timer after logout', async () => {
  const gate=deferred(), h=harness({client:{removeChannel:async()=>{}}}); h.context.gate=gate.promise;
  h.run(`loadAllData=()=>gate;renderAll=()=>{};var subscriptions=0;subscribeRealtime=async()=>{subscriptions++;}`);
  const start=h.run(`startAuthenticatedApp({id:'user',email:'qa@example.test'})`);
  await h.run('resetAuthenticatedApp()'); gate.resolve(true); await start;
  assert.equal(h.run('subscriptions'),0); assert.equal(h.timers.size,0);
});
test('a pending resume cannot sign a user back in after logout', async () => {
  const gate=deferred(),h=harness({client:{removeChannel:async()=>{}}}); h.context.gate=gate.promise;
  h.run(`authenticatedUserId='user'; validateAuthenticatedSession=()=>gate;var starts=0;startAuthenticatedApp=()=>{starts++;}`);
  const resume=h.run('resumeAuthenticatedApp()'); await h.run('resetAuthenticatedApp()');
  gate.resolve({user:{id:'user'}}); await resume; assert.equal(h.run('starts'),0);
});
test('Realtime subscribe / force recovery single-flight; logout cancels pending subscribe', async () => {
  const gate=deferred(); let channels=0;
  const h=harness({client:{removeChannel:()=>gate.promise,channel:()=>{channels++;return {on(){return this;},subscribe(cb){cb('SUBSCRIBED');}};}}});
  h.run(`authenticatedUserId='user';realtimeChannel={};`);
  const a=h.run('subscribeRealtime({force:true})'),b=h.run('subscribeRealtime({force:true})');
  assert.equal(a,b); await h.run('resetAuthenticatedApp()'); gate.resolve(); await a;
  assert.equal(channels,0);
});
