const {test} = require('node:test');
const assert = require('node:assert/strict');
const {harness} = require('./fixtures/app-harness.cjs');

const expectedOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
const fixtures = () => [
  ['A', '編集待ち', '住之江 ＡＢＣ１２３', '選手解説'],
  ['B', '投稿済み', '住之江 ABC123 速報', '競艇ニュース, 選手解説'],
  ['C', '編集待ち', '住之江 abc123', ' 、 , \n , '],
  ['D', '編集待ち', '住之江 abc123', 'ネット競艇'],
  ['E', '編集待ち', '住之江 abc123', '旧分類'],
  ['F', '投稿済み', null, null],
  ['G', '編集待ち', '多摩川 abc123', ''],
  ['H', '編集待ち', '住之江 9レース', '横動画'],
  ['I', '投稿済み', '安全 <img src=x onerror=alert(1)>', 'レース映像'],
  ['J', '編集待ち', 'Café', '   '],
  ['K', '投稿済み', '住之江 abc123', []]
].map(([id, status, title, tags], index) => ({
  id, status, title, tags, memo: 'メモ限定', youtube_url: 'https://example.test/url-only',
  video_type: 'Shorts', post_date: `2026-10-${20 - index}`
}));

function fixture() {
  const h = harness({client: new Proxy({}, {
    get(_target, property) { assert.fail(`Local filter accessed Supabase ${String(property)}`); }
  })});
  h.context.window.matchMedia = media => ({matches: media.includes('max-width')});
  const events = new Map();
  const watch = id => {
    const node = h.node(id);
    node.addEventListener = (type, listener) => {
      const key = `${id}:${type}`;
      if (!events.has(key)) events.set(key, []);
      events.get(key).push(listener);
    };
    return node;
  };
  const ids = ['videoTitleSearch', 'clearVideoTitleSearch', 'videoTagFilters', 'clearVideoTagFilters',
    'toggleVideoTagFilters', 'videoTagFilterPanel', 'videoTagSelectionCount', 'filterVideoUntagged'];
  ids.forEach(watch);
  const search = h.node('videoTitleSearch');
  const statuses = ['all', '編集待ち', '投稿済み'].map(status => {
    const node = watch(`status-${status}`);
    node.dataset.filter = status;
    return node;
  });
  const counters = statuses.map(({dataset}) => {
    const node = h.node(`count-${dataset.filter}`);
    node.dataset.filterCount = dataset.filter;
    return node;
  });
  const focused = [];
  for (const node of [search, ...statuses]) node.focus = options => focused.push({id: node.id, preventScroll: options?.preventScroll});
  const queryOne = h.context.document.querySelector;
  h.context.document.querySelector = selector => selector === '#videoFilters [data-filter="all"]' ? statuses[0] : queryOne(selector);
  const query = h.context.document.querySelectorAll;
  h.context.document.querySelectorAll = selector => {
    if (selector === '[data-filter-count]') return counters;
    if (selector === '.filter-btn[data-filter]') return statuses;
    return query(selector);
  };
  const documentClicks = [];
  h.context.document.addEventListener = (type, listener) => {
    if (type === 'click') documentClicks.push(listener);
  };
  const initialLoad = () => h.run('data.videos = rows.map(mapVideo); renderVideos()');
  h.context.rows = fixtures();
  h.run('setupEventListeners()');
  initialLoad();
  const fire = (id, type, overrides = {}, {optional = false} = {}) => {
    const node = h.node(id), listeners = events.get(`${id}:${type}`) || [];
    if (!optional) assert.equal(listeners.length, 1, `${id}:${type} must have one listener`);
    const event = {target: node, currentTarget: node, preventDefault() {}, ...overrides};
    listeners.forEach(listener => listener(event));
  };
  const enter = (value, event = {}) => {
    search.value = value;
    fire('videoTitleSearch', 'input', event);
  };
  const select = tag => fire('videoTagFilters', 'click', {
    target: {closest: () => ({dataset: {videoTagFilter: tag}})}
  });
  return {h, search, fire, enter, select, initialLoad, focused,
    shown: () => [...h.node('videoList').innerHTML.matchAll(/data-video-card-id="([^"]+)"/g)].map(match => match[1]),
    count: () => h.node('videoVisibleCount').textContent,
    selected: () => h.node('videoTagSelectionCount').textContent,
    counts: () => counters.map(node => node.textContent),
    status: status => fire(`status-${status}`, 'click'),
    untagged: () => fire('filterVideoUntagged', 'click'),
    clearSearch: () => fire('clearVideoTitleSearch', 'click'),
    clearTags: () => fire('clearVideoTagFilters', 'click'),
    toggleTags: () => fire('toggleVideoTagFilters', 'click'),
    resetAll: () => {
      assert.match(h.node('videoList').innerHTML, /id="clearAllVideoFilters"[^>]*>検索・絞り込みをリセット/);
      documentClicks.forEach(listener => listener({
        target: {closest: selector => selector === '#clearAllVideoFilters' ? h.node('clearAllVideoFilters') : null}
      }));
    }};
}

test('title search normalizes Unicode, whitespace and case; preserves Japanese and numeric substring matching', () => {
  const f = fixture();
  for (const [value, expected] of [
    ['', expectedOrder], [' 　 ', expectedOrder],
    ['住之江', ['A', 'B', 'C', 'D', 'E', 'H', 'K']],
    ['  ＡｂＣ１２３　', ['A', 'B', 'C', 'D', 'E', 'G', 'K']],
    ['多摩川 ABC123', ['G']], ['９レース', ['H']], ['cafe\u0301', ['J']], ['不一致', []]
  ]) {
    f.enter(value);
    assert.deepEqual(f.shown(), expected, value);
  }
});

test('title search ignores memo, tags, URL, and null title; literal special characters cannot become HTML', () => {
  const f = fixture();
  for (const term of ['メモ限定', '選手解説', 'url-only', 'null', '.*']) {
    f.enter(term);
    assert.deepEqual(f.shown(), [], term);
  }
  f.enter('<img src=x onerror=alert(1)>');
  assert.deepEqual(f.shown(), ['I']);
  const html = f.h.node('videoList').innerHTML;
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('Japanese composition leaves in-progress text untouched; commit updates immediately without scroll or duplicate handlers', () => {
  const f = fixture();
  f.h.context.window.scrollTo = () => assert.fail('filtering must not reposition the page');
  f.h.run('setupEventListeners()');
  f.enter('多摩川');
  f.fire('videoTitleSearch', 'compositionstart', {}, {optional:true});
  f.enter('すみ', {isComposing:true});
  assert.equal(f.search.value, 'すみ');
  assert.deepEqual(f.shown(), ['G']);
  f.search.value = '住之江';
  f.fire('videoTitleSearch', 'compositionend');
  assert.deepEqual(f.shown(), ['A', 'B', 'C', 'D', 'E', 'H', 'K']);
  assert.equal(f.search.value, '住之江');
  assert.deepEqual(f.focused, []);
  assert.equal(f.h.storage.size, 0);
});

test('untagged is raw blank or separator-only; does not include retired or unknown non-empty tags', () => {
  const h = harness();
  for (const value of [null, undefined, '', ' \u3000 ', ' 、\n,\r\n、 ', [], ['', '  ']]) {
    h.context.tagValue = value;
    assert.equal(h.run('isVideoUntagged(tagValue)'), true, JSON.stringify(value));
  }
  for (const value of ['ネット競艇', '旧分類', ' 、 旧分類,\n ', '選手解説', ['旧分類'], ['選手解説', '']]) {
    h.context.tagValue = value;
    assert.equal(h.run('isVideoUntagged(tagValue)'), false, JSON.stringify(value));
  }
  const f = fixture();
  f.untagged();
  assert.deepEqual(f.shown(), ['C', 'F', 'G', 'J', 'K']);
  assert.match(f.selected(), /0タグ選択中.*未設定あり/);
  assert.equal(f.h.node('filterVideoUntagged').getAttribute('aria-pressed'), 'true');
});

test('tag and untagged union is unique and ordered; query and status are independent intersections', () => {
  const f = fixture();
  f.select('選手解説'); f.select('競艇ニュース'); f.untagged();
  assert.deepEqual(f.shown(), ['A', 'B', 'C', 'F', 'G', 'J', 'K']);
  assert.match(f.selected(), /2タグ選択中.*未設定あり/);
  f.enter('住之江');
  assert.deepEqual(f.shown(), ['A', 'B', 'C', 'K']);
  f.status('編集待ち');
  assert.deepEqual(f.shown(), ['A', 'C']);
  f.select('競艇ニュース');
  assert.match(f.selected(), /1タグ選択中.*未設定あり/);
  f.select('選手解説');
  assert.deepEqual(f.shown(), ['C']);
  assert.match(f.selected(), /0タグ選択中.*未設定あり/);
});

test('search and tag clear operations affect only their own conditions', () => {
  const f = fixture();
  f.status('編集待ち'); f.select('選手解説'); f.untagged(); f.enter('住之江');
  f.h.run("setVideoViewMode('minimal')");
  f.clearSearch();
  assert.equal(f.search.value, '');
  assert.deepEqual(f.focused, [{id: 'videoTitleSearch', preventScroll: true}]);
  assert.deepEqual(f.shown(), ['A', 'C', 'G', 'J']);
  assert.match(f.selected(), /1タグ選択中.*未設定あり/);
  f.enter('住之江');
  f.clearTags();
  assert.equal(f.search.value, '住之江');
  assert.equal(f.h.run('activeVideoFilter'), '編集待ち');
  assert.equal(f.h.run('activeVideoViewMode'), 'minimal');
  assert.equal(f.h.node('filterVideoUntagged').getAttribute('aria-pressed'), 'false');
  assert.equal(f.selected(), '0タグ選択中');
  assert.deepEqual(f.shown(), ['A', 'C', 'D', 'E', 'H']);
});

test('disclosure preserves conditions, selected count, page navigation, and ordered IDs in both modes', () => {
  const f = fixture();
  const toggle = f.h.node('toggleVideoTagFilters'), panel = f.h.node('videoTagFilterPanel');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  f.toggleTags();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  f.untagged(); f.select('選手解説'); f.enter('住之江'); f.status('編集待ち');
  f.toggleTags();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  assert.match(f.selected(), /1タグ選択中.*未設定あり/);
  assert.deepEqual(f.shown(), ['A', 'C']);
  f.h.run("setVideoViewMode('minimal');switchPage('dashboard');switchPage('videos')");
  assert.deepEqual(f.shown(), ['A', 'C']);
  assert.equal(f.search.value, '住之江');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  f.toggleTags();
  assert.equal(f.h.node('filterVideoUntagged').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(f.shown(), ['A', 'C']);
});

test('counts distinguish unfiltered, filtered-all, no results, and no data without changing status totals', () => {
  const f = fixture();
  assert.equal(f.count(), '全11件');
  assert.deepEqual(f.counts(), [11, 7, 4]);
  f.enter(' 　 ');
  assert.equal(f.count(), '全11件');
  f.enter('住之江');
  assert.equal(f.count(), '11件中 7件を表示');
  f.h.run("rows.forEach(row=>{row.title='共通'+(row.title||'')})");
  f.initialLoad();
  f.enter('共通');
  assert.equal(f.count(), '11件中 11件を表示');
  f.enter('なし');
  assert.equal(f.count(), '11件中 0件を表示');
  assert.deepEqual(f.counts(), [11, 7, 4]);
  assert.match(f.h.node('videoList').innerHTML, /選択した条件に一致する動画はありません/);
  f.status('編集待ち'); f.untagged();
  f.h.run("setVideoViewMode('minimal')");
  f.resetAll();
  assert.equal(f.count(), '全11件');
  assert.deepEqual(f.shown(), expectedOrder);
  assert.equal(f.h.node('status-all').getAttribute('aria-pressed'), 'true');
  assert.equal(f.h.node('filterVideoUntagged').getAttribute('aria-pressed'), 'false');
  assert.equal(f.h.node('clearVideoTitleSearch').hidden, true);
  assert.equal(f.search.value, '');
  assert.deepEqual(f.focused, [{id: 'status-all', preventScroll: true}]);
  assert.equal(f.h.run('activeVideoViewMode'), 'minimal');
  f.h.run('data.videos=[];renderVideos()');
  assert.match(f.h.node('videoList').innerHTML, /動画が登録されていません/);
  assert.doesNotMatch(f.h.node('videoList').innerHTML, /選択した条件/);
});

test('detail navigation follows the integrated result and a newly excluded detail cannot jump elsewhere', () => {
  const f = fixture();
  f.select('選手解説'); f.untagged(); f.enter('住之江'); f.status('編集待ち');
  f.h.run("openVideoDetail=id=>{currentDetailVideoId=id};currentDetailVideoId='A';navigateVideoDetail(1)");
  assert.equal(f.h.run('currentDetailVideoId'), 'C');
  f.h.run('navigateVideoDetail(-1)');
  assert.equal(f.h.run('currentDetailVideoId'), 'A');
  f.enter('多摩川');
  f.h.run('navigateVideoDetail(1);navigateVideoDetail(-1)');
  assert.equal(f.h.run('currentDetailVideoId'), 'A');
  assert.deepEqual(f.shown(), ['G']);
});

test('updates and full redraw reapply all filters to current data without changing monthly totals', () => {
  const f = fixture();
  const monthly = () => f.h.run(`JSON.stringify({
    posts: getMonthlyPostStats('2026-10'),
    reward: calculateMonthlyReward(getMonthlyPostStats('2026-10')),
    achievements: getMonthlyAchievementStats('2026-10')
  })`);
  const before = monthly();
  f.untagged(); f.select('選手解説'); f.enter('住之江'); f.status('編集待ち');
  assert.deepEqual(f.shown(), ['A', 'C']);
  assert.equal(monthly(), before);
  assert.equal(JSON.parse(before).posts.total, 4);
  assert.equal(JSON.parse(before).reward.totalAmount, 300);
  f.h.run(`rows.find(video=>video.id==='A').title='平和島';
    rows.find(video=>video.id==='C').status='投稿済み';
    rows.find(video=>video.id==='E').tags='選手解説';
    data.videos=rows.map(mapVideo);renderAll()`);
  assert.deepEqual(f.shown(), ['E']);
  assert.equal(f.search.value, '住之江');
  assert.match(f.selected(), /1タグ選択中.*未設定あり/);
});

test('search and untagged filters are session-only and clear for a different account or logout', async () => {
  const f = fixture();
  f.h.run("authenticatedUserId='qa';loadAllData=async()=>false");
  f.enter('住之江'); f.untagged(); f.select('選手解説');
  await f.h.run("startAuthenticatedApp({id:'qa'})");
  assert.equal(f.search.value, '住之江');
  assert.equal(f.h.run('includeUntaggedVideos'), true);
  assert.equal(f.h.run('activeVideoTagFilters.size'), 1);
  assert.equal(f.h.storage.size, 0);
  assert.equal(harness({initialStorage:[...f.h.storage]}).run('videoTitleQuery'), '');
  assert.equal(harness({initialStorage:[...f.h.storage]}).run('includeUntaggedVideos'), false);
  await f.h.run("startAuthenticatedApp({id:'other'})");
  assert.equal(f.search.value, '');
  assert.equal(f.h.node('clearVideoTitleSearch').hidden, true);
  assert.equal(f.h.run('videoTitleQuery'), '');
  assert.equal(f.h.run('includeUntaggedVideos'), false);
  assert.equal(f.h.run('activeVideoTagFilters.size'), 0);
  f.enter('ABC'); f.untagged();
  await f.h.run('resetAuthenticatedApp()');
  assert.equal(f.search.value, '');
  assert.equal(f.h.node('clearVideoTitleSearch').hidden, true);
  assert.equal(f.h.run('videoTitleQuery'), '');
  assert.equal(f.h.run('includeUntaggedVideos'), false);
});
