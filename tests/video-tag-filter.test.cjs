const {test} = require('node:test');
const assert = require('node:assert/strict');
const {harness} = require('./fixtures/app-harness.cjs');

test('selecting multiple video tags returns their ordered union', () => {
  const h = harness();
  h.run(`data.videos = [
    {id:'A',status:'投稿済み',tags:'選手解説'},
    {id:'B',status:'投稿済み',tags:'競艇ニュース'},
    {id:'C',status:'投稿済み',tags:'用語解説'},
    {id:'D',status:'投稿済み',tags:'選手解説、競艇ニュース'}
  ];activeVideoTagFilters.add('選手解説');activeVideoTagFilters.add('競艇ニュース');`);
  assert.equal(h.run("getVisibleVideos().map(video => video.id).join(',')"), 'A,B,D');
});

const activeTags = ['選手解説', '用語解説', '競艇場解説', '疑問解決系', '横動画の切り抜き', 'レース映像', '横動画', '競艇ニュース'];
const tagRows = () => [
  ['A', '投稿済み', '選手解説, ネット競艇'],
  ['C', '編集待ち', '用語解説'],
  ['D', '投稿済み', '選手解説、競艇ニュース'],
  ['B', '編集待ち', ['競艇ニュース']],
  ['E', '投稿済み', 'ネット競艇'],
  ['F', '投稿済み', null],
  ['G', '編集待ち', '横動画の切り抜き']
].map(([id, status, tags], index) => ({
  id, title: id, status, tags, video_type: 'Shorts', post_date: `2026-10-${17 - index}`
}));

function fixture(client = {from() { assert.fail('tag controls must not access the database'); }}) {
  const h = harness({client});
  const tagRoot = h.node('videoTagFilters'), clear = h.node('clearVideoTagFilters');
  const callbacks = [], clearCallbacks = [], chips = new Map();
  let markup = '', builds = 0;
  Object.defineProperty(tagRoot, 'innerHTML', {
    get: () => markup,
    set(value) {
      markup = value; builds++; chips.clear();
      for (const [, tag] of value.matchAll(/data-video-tag-filter="([^"]+)"/g)) {
        const button = h.node('tag-' + tag);
        button.dataset.videoTagFilter = tag;
        button.setAttribute('aria-pressed', 'false');
        chips.set(tag, button);
      }
    }
  });
  tagRoot.querySelectorAll = () => [...chips.values()];
  tagRoot.addEventListener = (event, fn) => { if (event === 'click') callbacks.push(fn); };
  clear.addEventListener = (event, fn) => { if (event === 'click') clearCallbacks.push(fn); };
  const counts = new Map(), statuses = new Map(), statusClicks = new Map();
  for (const status of ['all', '編集待ち', '投稿済み']) {
    const count = h.node('count-' + status), button = h.node('status-' + status);
    count.dataset.filterCount = status; counts.set(status, count);
    button.dataset.filter = status; statuses.set(status, button);
    button.addEventListener = (event, fn) => { if (event === 'click') statusClicks.set(status, fn); };
  }
  const query = h.context.document.querySelectorAll;
  h.context.document.querySelectorAll = selector => {
    if (selector === '[data-filter-count]') return [...counts.values()];
    if (selector === '.filter-btn[data-filter]') return [...statuses.values()];
    return query(selector);
  };
  h.context.rows = tagRows();
  h.run("data.videos=rows.map(mapVideo);setupEventListeners();renderVideos()");
  const ids = () => [...h.node('videoList').innerHTML.matchAll(/data-video-card-id="([^"]+)"/g)].map(match => match[1]);
  const select = tag => callbacks.forEach(fn => fn({target: {closest: () => chips.get(tag) || {dataset: {videoTagFilter: tag}}}}));
  return {h, chips, clear, counts, tagRoot, ids, select, builds: () => builds, listeners: () => callbacks.length,
    clearTags: () => clearCallbacks.forEach(fn => fn()), status: name => statusClicks.get(name)(),
    countText: () => h.node('videoVisibleCount').textContent};
}

test('exact eight active tags in canonical order, no legacy choice; unselected includes legacy and no-tag rows', () => {
  const f = fixture();
  assert.deepEqual([...f.chips.keys()], activeTags);
  assert.doesNotMatch(f.tagRoot.innerHTML, /ネット競艇/);
  assert.deepEqual(f.ids(), ['A', 'C', 'D', 'B', 'E', 'F', 'G']);
  assert.equal(f.countText(), '全7件');
  assert.equal(f.clear.getAttribute('aria-disabled'), 'true');
  for (const button of f.chips.values()) assert.equal(button.getAttribute('aria-pressed'), 'false');
  f.select('ネット競艇');
  assert.equal(f.countText(), '全7件');
});

test('click toggles 1/2/3 tags, keeps node identity, does not register twice, scroll, save or query', () => {
  const f = fixture();
  f.h.context.window.scrollTo = () => assert.fail('tag controls must not scroll');
  f.h.run('setupEventListeners()');
  assert.equal(f.listeners(), 1);
  const chip = f.chips.get('選手解説');
  f.select('選手解説');
  assert.deepEqual(f.ids(), ['A', 'D']);
  assert.equal(chip.getAttribute('aria-pressed'), 'true');
  assert.equal(f.clear.getAttribute('aria-disabled'), 'false');
  f.select('競艇ニュース');
  assert.deepEqual(f.ids(), ['A', 'D', 'B']);
  f.select('用語解説');
  assert.deepEqual(f.ids(), ['A', 'C', 'D', 'B']);
  assert.equal(f.countText(), '7件中 4件を表示');
  f.select('選手解説');
  assert.deepEqual(f.ids(), ['C', 'D', 'B']);
  assert.equal(chip.getAttribute('aria-pressed'), 'false');
  f.clearTags();
  assert.equal(f.countText(), '全7件');
  assert.equal(f.clear.getAttribute('aria-disabled'), 'true');
  assert.equal(f.chips.get('選手解説'), chip);
  assert.equal(f.builds(), 1);
  assert.equal(f.h.storage.size, 0);
});

test('status AND tags; clearing tags preserves status and status counts reflect all stored videos', () => {
  const f = fixture();
  f.select('選手解説'); f.select('競艇ニュース');
  f.status('編集待ち');
  assert.deepEqual(f.ids(), ['B']);
  assert.equal(f.countText(), '7件中 1件を表示');
  f.status('投稿済み');
  assert.deepEqual(f.ids(), ['A', 'D']);
  assert.equal(f.countText(), '7件中 2件を表示');
  f.clearTags();
  assert.deepEqual(f.ids(), ['A', 'D', 'E', 'F']);
  assert.equal(f.h.run('activeVideoFilter'), '投稿済み');
  assert.deepEqual([...f.counts.values()].map(node => node.textContent), [7, 3, 4]);
});

test('empty result with registered videos distinguishes filter mismatch and provides a tag-clear action', () => {
  const f = fixture();
  f.select('競艇場解説');
  assert.equal(f.countText(), '7件中 0件を表示');
  assert.match(f.h.node('videoList').innerHTML, /選択した条件に一致する動画はありません/);
  assert.equal(f.clear.getAttribute('aria-disabled'), 'false');
  f.clearTags();
  assert.equal(f.countText(), '全7件');
  f.h.run('data.videos=[];renderVideos()');
  assert.match(f.h.node('videoList').innerHTML, /動画が登録されていません/);
  assert.doesNotMatch(f.h.node('videoList').innerHTML, /選択した条件/);
});

test('card/minimal and page navigation retain tag selection and result ID order', () => {
  const f = fixture();
  f.select('選手解説'); f.select('競艇ニュース');
  const card = f.ids();
  f.h.run("setVideoViewMode('minimal');switchPage('dashboard');switchPage('videos')");
  assert.match(f.h.node('videoList').innerHTML, /video-minimal-row/);
  assert.deepEqual(f.ids(), card);
  assert.deepEqual(card, ['A', 'D', 'B']);
  assert.equal(f.chips.get('競艇ニュース').getAttribute('aria-pressed'), 'true');
  assert.equal(f.h.run('activeVideoTagFilters.size'), 2);
  assert.equal(f.builds(), 1);
  assert.equal(harness({initialStorage:[...f.h.storage]}).run('activeVideoTagFilters.size'), 0);
});

test('detail navigation and touch swipes step over tag-mismatched and status-mismatched rows', () => {
  const f = fixture(), handlers = {};
  f.select('選手解説'); f.select('競艇ニュース'); f.status('投稿済み');
  f.h.node('videoDetailModal').addEventListener = (event, fn) => { handlers[event] = fn; };
  f.h.context.window.matchMedia = () => ({matches: true});
  f.h.run("setupVideoDetailNavigation();currentDetailVideoId='A';openVideoDetail=id=>{currentDetailVideoId=id}");
  const dialog = f.h.node('videoDetailModal'); dialog.open = true; dialog.scrollTop = 0;
  handlers.touchstart({target:{closest:()=>null},touches:[{clientX:200,clientY:100}]});
  handlers.touchend({touches:[],changedTouches:[{clientX:100,clientY:101}]});
  assert.equal(f.h.run('currentDetailVideoId'), 'D');
  f.h.run('navigateVideoDetail(1)');
  assert.equal(f.h.run('currentDetailVideoId'), 'D');
  f.h.run('navigateVideoDetail(-1)');
  assert.equal(f.h.run('currentDetailVideoId'), 'A');
});

test('logout and new account clear filter state but not the view; same-account startup retains selection', async () => {
  const f = fixture();
  f.h.run("authenticatedUserId='qa';loadAllData=async()=>false;setVideoViewMode('minimal')");
  f.status('投稿済み'); f.select('選手解説');
  await f.h.run("startAuthenticatedApp({id:'qa'})");
  assert.equal(f.h.run('activeVideoTagFilters.size'), 1);
  assert.equal(f.h.run('activeVideoFilter'), '投稿済み');
  await f.h.run("startAuthenticatedApp({id:'other'})");
  assert.equal(f.h.run('activeVideoTagFilters.size'), 0);
  assert.equal(f.chips.get('選手解説').getAttribute('aria-pressed'), 'false');
  assert.equal(f.h.run('activeVideoFilter'), 'all');
  f.status('投稿済み');
  f.select('競艇ニュース');
  await f.h.run('resetAuthenticatedApp()');
  assert.equal(f.h.run('activeVideoTagFilters.size'), 0);
  assert.equal(f.h.run('activeVideoFilter'), 'all');
  assert.equal(f.h.run('activeVideoViewMode'), 'minimal');
});

test('older cached HTML without tag controls still reaches the version-mismatch recovery UI', async () => {
  const h = harness();
  h.run(`for (const id of ['videoTagFilters', 'clearVideoTagFilters', 'videoVisibleCount',
    'videoTitleSearch', 'clearVideoTitleSearch', 'toggleVideoTagFilters', 'videoTagFilterPanel',
    'videoTagSelectionCount', 'filterVideoUntagged']) elements[id] = null`);
  h.context.document.querySelector = () => ({content:'obsolete'});
  await h.run('initialize()');
  assert.equal(h.run('versionMismatchDetected'), true);
  assert.equal(h.node('authRetryButton').classList.contains('is-hidden'), false);
});

test('a filtered-out video still contributes to full-data monthly totals, achievements and rewards', () => {
  const f = fixture();
  const results = () => f.h.run(`JSON.stringify({
    videos:data.videos,posts:getMonthlyPostStats('2026-10'),
    reward:calculateMonthlyReward(getMonthlyPostStats('2026-10')),
    achievements:getMonthlyAchievementStats('2026-10')
  })`);
  const before = results();
  f.select('競艇場解説'); f.status('編集待ち');
  assert.deepEqual(f.ids(), []);
  assert.equal(results(), before);
  assert.equal(JSON.parse(before).posts.total, 4);
  assert.equal(JSON.parse(before).reward.totalAmount, 400);
});

test('actual video save, soft delete/restore, and debounced Realtime re-read re-evaluate current tags', async () => {
  const rows = tagRows(), mutations = [];
  let videoReads = 0;
  const f = fixture({from(table) {
    let id, payload, insert = false, one = false;
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, is() { return q; },
      eq(key, value) { if (key === 'id') id = value; return q; },
      abortSignal() { return q; }, single() { one = true; return q; }, maybeSingle() { one = true; return q; },
      update(data) { payload = data; return q; }, insert(data) { payload = data; insert = true; return q; },
      then(resolve, reject) {
        if (table !== 'videos') return Promise.resolve({data: one ? null : [], error: null}).then(resolve, reject);
        if (!payload) {
          videoReads++;
          return Promise.resolve({data: structuredClone(rows), error: null}).then(resolve, reject);
        }
        mutations.push({id, payload});
        const row = insert ? {...payload, id:'N'} : rows.find(item => item.id === id);
        if (insert) rows.push(row); else Object.assign(row, payload);
        return Promise.resolve({data: structuredClone(row), error: null}).then(resolve, reject);
      }
    };
    return q;
  }});
  f.h.run("authenticatedUserId='qa';window.confirm=()=>true;addActivityLog=async()=>true");
  f.select('選手解説'); f.select('競艇ニュース');
  assert.equal(videoReads, 0);
  await f.h.run('loadAllData({silent:true})');
  assert.deepEqual(f.ids(), ['A', 'D', 'B']);
  await f.h.run(`saveVideo({title:'新動画',type:'Shorts',status:'投稿済み',postDate:'2026-10-20',
    youtubeUrl:'',tags:['競艇ニュース']},'add')`);
  await f.h.run('loadAllData({silent:true})');
  assert.deepEqual(f.ids(), ['N', 'A', 'D', 'B']);
  await f.h.run(`saveVideo({title:'A',type:'Shorts',status:'投稿済み',postDate:'2026-10-17',
    youtubeUrl:'',tags:['用語解説'],legacyVideoTags:'ネット競艇'},'edit','A')`);
  await f.h.run('loadAllData({silent:true})');
  assert.deepEqual(f.ids(), ['N', 'D', 'B']);
  assert.equal(rows.find(row => row.id === 'A').tags, '用語解説, ネット競艇');
  await f.h.run("deleteItem('video','N')");
  assert.deepEqual(f.ids(), ['D', 'B']);
  await f.h.run("restoreItem('video','N',null)");
  assert.deepEqual(f.ids(), ['N', 'D', 'B']);
  const previousReads = videoReads;
  rows.find(row => row.id === 'C').tags = '選手解説';
  f.h.run('scheduleRealtimeRefresh();scheduleRealtimeRefresh()');
  await f.h.tick(200);
  await f.h.run('dataLoadInFlight');
  assert.equal(videoReads, previousReads + 1);
  assert.deepEqual(f.ids(), ['N', 'C', 'D', 'B']);
  assert.equal(f.h.run('activeVideoTagFilters.size'), 2);
  assert.equal(f.builds(), 1);
  assert.equal(mutations.length, 4);
});
