// Isolated loopback Postgres and mock SDK. Desktop WebKit/touch emulation is not a physical iPhone.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const origin = 'http://127.0.0.1:8766';
const engines = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const engineNames = process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'];
assert(engineNames.every(name => ['chromium', 'webkit'].includes(name)), 'supported QA browser engines');
const baseline = process.env.QA_BASELINE_DIR && resolve(process.env.QA_BASELINE_DIR);
const output = new URL('../../../outputs/video-quiz-price-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const appRoot = baseline || fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, [join(appRoot, 'tests', 'browser-server.mjs')], {
  cwd: appRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
});
const tags = ['選手解説', '用語解説', '競艇場解説', '疑問解決系', '横動画の切り抜き', 'レース映像', '横動画', '競艇ニュース', '競艇クイズ', '競艇値段'];
const [player, terms, , unused, clip, , , news, quiz, price] = tags;
const measurements = [];
const fixtureId = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const viewports = [[390, 844], [430, 932], [768, 1024], [1280, 900], [320, 640], [844, 390]];
async function fixtureQuery(page, action, args = {}) {
  const result = await page.evaluate(async input => {
    if (location.origin !== 'http://127.0.0.1:8766') throw new Error('Not the local fixture');
    const response = await fetch('/qa-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error(`Local fixture HTTP ${response.status}`);
    return response.json();
  }, { table: 'videos', action, ...args });
  assert.equal(result.error, null, JSON.stringify(result.error));
  return result.data;
}
const scroll = (page, top) => page.evaluate(async value => {
  window.scrollTo({ top: value, behavior: 'instant' });
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
}, top);

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Loopback fixture startup timeout')), 20000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.stdout.on('data', chunk => { if (String(chunk).includes(origin)) { clearTimeout(timer); resolve(); } });
    server.stderr.on('data', chunk => { clearTimeout(timer); reject(Error(String(chunk))); });
    server.once('exit', code => { clearTimeout(timer); reject(Error(`Fixture exited: ${code}`)); });
  });
  const fixtureTags = [player, news, terms, `${player}、${news}`, player, 'ネット競艇', `ネット競艇、${player}`, null,
    ' \t ', ', 、\n,', '過去独自タグ', '', null,
    quiz, price, `${quiz}、${price}`, ...Array.from({ length: 13 }, () => player)];
  const fixtureTitles = ['住之江 Cup １１２', '住之江 ＣＵＰ 2026', 'QA <img> [#1]', '住之江 Cup 404', '住之江 Cup 待ち',
    '住之江 Legacy', '住之江 Active+Legacy', '住之江 Cup 未設定', '住之江 空白', '住之江 Cup 区切り', '住之江 歴史', '住之江 空文字', null];
  const seed = fixtureTags.map((value, index) => ({ id: fixtureId(index + 1), title: index < fixtureTitles.length ? fixtureTitles[index] : `QA tag filter ${index + 1}`,
    video_type: 'Shorts', status: [4, 7].includes(index) ? '編集待ち' : '投稿済み', tags: value,
    memo: index === 2 ? 'memo-only-token' : '', youtube_url: index === 1 ? 'https://www.youtube.com/@QAfixture01' : '',
    post_date: `2020-01-${String(index + 1).padStart(2, '0')}` }));
  let seeded = false;

  for (const engineName of engineNames) {
    const browser = await engines[engineName].launch({ headless: true });
    try {
      for (const [width, height] of viewports) {
        const touch = width < 900;
        const context = await browser.newContext({ viewport: { width, height }, ...(touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
        try {
          const external = [];
          await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            external.push(url.origin);
            return route.abort();
          });
          const page = await context.newPage();
          const issues = [], apiRequests = [];
          page.on('pageerror', error => issues.push(error.message));
          page.on('console', message => { if (['error', 'warning'].includes(message.type())) issues.push(message.text()); });
          page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())) apiRequests.push(new URL(request.url()).pathname); });
          const press = locator => touch ? locator.tap() : locator.click();
          const go = id => press(page.locator(`[data-page="${id}"]:visible`).first());
          const tag = value => page.locator(`#videoTagFilters [data-video-tag-filter="${value}"]`);
          const clear = page.locator('#clearVideoTagFilters');
          const status = value => page.locator(`#videoFilters [data-filter="${value}"]`);
          const mode = value => page.locator(`[data-video-view="${value}"]`);
          const cards = page.locator('#videoList [data-video-card-id]');
          const ids = () => cards.evaluateAll(rows => rows.map(row => row.dataset.videoCardId));
          const checkUi = async (label, checkLast = false) => {
            const geometry = await page.evaluate(() => {
              const rect = element => element.getBoundingClientRect().toJSON();
              const nav = document.querySelector('#mobileNav');
              const viewport = visualViewport;
              const tagArea = document.querySelector('.video-tag-filter');
              const buttonMetrics = [...tagArea.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => ({ ...rect(button),
                label: button.dataset.videoTagFilter || button.textContent.trim(), overflow: button.scrollWidth > button.clientWidth + 1 }));
              return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                width: document.documentElement.clientWidth, scroll: scrollY,
                visibleBottom: (viewport?.offsetTop || 0) + (viewport?.height || innerHeight),
                nav: rect(nav), navPosition: getComputedStyle(nav).position, navDisplay: getComputedStyle(nav).display,
                navButtons: [...nav.querySelectorAll('button')].map(button => {
                  const r = rect(button);
                  return { height: r.height, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-page]') === button };
                }), tagArea: rect(tagArea), buttons: buttonMetrics,
                last: document.querySelector('#videoList [data-video-card-id]:last-child') ? rect(document.querySelector('#videoList [data-video-card-id]:last-child')) : null };
            });
            assert.equal(geometry.overflow, false, label);
            assert(geometry.buttons.every(button => button.left >= -1 && button.right <= geometry.width + 1 && !button.overflow && button.height >= 44), `${label}: tag and clear controls fit at >=44px`);
            if (touch) {
              assert.equal(geometry.navPosition, 'fixed', label);
              assert(Math.abs(geometry.nav.bottom - geometry.visibleBottom) <= 1, `${label}: nav viewport gap`);
              assert.equal(geometry.navButtons.length, 4);
              assert(geometry.navButtons.every(button => button.hit && button.height >= 44), `${label}: 4 accessible nav controls`);
              if (geometry.scroll < 1 && label.includes('collapsed') && height >= 640) assert(geometry.tagArea.bottom <= geometry.nav.top, `${label}: collapsed header and nav do not overlap at top`);
              if (checkLast) assert(geometry.last && geometry.last.bottom <= geometry.nav.top - 1, `${label}: last video fully above nav`);
            } else {
              assert.equal(geometry.navDisplay, 'none', label);
              if (checkLast) assert(geometry.last && geometry.last.bottom <= geometry.visibleBottom + 1, `${label}: last video reachable`);
            }
            measurements.push({ engineName, width, height, touch, label, ...geometry });
          };
          await page.goto(`${origin}/`);
          await page.waitForFunction(() => document.querySelector('#dataLoadStatus').textContent === 'データ取得済み');
          if (touch) await page.evaluate(() => document.documentElement.style.setProperty('--mobile-nav-safe-bottom', '34px'));
          if (!seeded) {
            assert.equal((await fixtureQuery(page, 'insert', { payload: seed })).length, seed.length);
            assert.equal(await page.evaluate(() => loadAllData({ silent: true })), true);
            seeded = true;
          }
          await go('videos');
          const measureOverview = async label => {
            await scroll(page, 0);
            const overview = await page.evaluate(() => {
              const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
              const dimensions = [...document.querySelectorAll('#videoTagFilters button')].map(button => ({
                tag: button.dataset.videoTagFilter, ...button.getBoundingClientRect().toJSON()
              }));
              return {
                firstCardTop: rect('#videoList [data-video-card-id]')?.top, title: rect('#pageTitle'),
                videoHead: rect('#videos .page-section-head'), tagArea: rect('#videos .video-tag-filter'), dimensions,
                nav: rect('#mobileNav'), navFaceHeight: getComputedStyle(document.querySelector('#mobileNav'), '::before').height,
                topLevelVideoHeadings: [...document.querySelectorAll('#pageTitle, #videos h3')].filter(el => el.textContent.trim() === '動画管理' && el.getBoundingClientRect().height > 0).length
              };
            });
            measurements.push({ engineName, width, height, touch, label, ...overview });
            return overview;
          };
          const initialOverview = await measureOverview(baseline ? 'baseline default' : 'candidate default');
          assert(Number.isFinite(initialOverview.firstCardTop), 'measure distance from viewport top to first card');
          if (baseline) continue;
          const search = page.locator('#videoTitleSearch'), clearSearch = page.locator('#clearVideoTitleSearch');
          const disclosure = page.locator('#toggleVideoTagFilters'), panel = page.locator('#videoTagFilterPanel');
          const untaggedControl = page.locator('#filterVideoUntagged'), selectionCount = page.locator('#videoTagSelectionCount');
          const checkDisclosure = async expanded => {
            assert.equal(await disclosure.getAttribute('aria-expanded'), String(expanded));
            assert.equal(await disclosure.getAttribute('aria-controls'), 'videoTagFilterPanel');
            assert.equal(await disclosure.textContent(), expanded ? '閉じる' : '開く');
            assert.equal(await panel.isVisible(), expanded);
            assert(await selectionCount.isVisible(), 'count is visible even with the panel closed');
          };
          assert.equal(initialOverview.topLevelVideoHeadings, 1, 'exactly one visible 動画管理 heading');
          await checkDisclosure(false);
          assert(!await tag(player).evaluate(button => { button.focus(); return document.activeElement === button; }), 'a collapsed tag is not focusable');
          await checkUi('collapsed initial');
          await page.screenshot({ path: fileURLToPath(new URL(`${engineName}-${width}-collapsed.png`, output)) });
          const checkControlGeometry = async () => {
            const controls = await page.evaluate(() => {
              const inspect = selector => [...document.querySelectorAll(selector)].map(element => ({
                w: element.getBoundingClientRect().width, h: element.getBoundingClientRect().height,
                font: parseFloat(getComputedStyle(element).fontSize), scroll: element.scrollWidth, client: element.clientWidth
              }));
              return { search: inspect('#videoTitleSearch')[0], actions: inspect('#videos .video-management-actions button, #toggleVideoTagFilters') };
            });
            assert(controls.search.font >= 16 && controls.search.h >= 44, 'search meets iOS input sizing');
            assert(controls.actions.every(item => item.w >= 44 && item.h >= 44 && item.scroll <= item.client + 1), 'actions and disclosure have >=44px target and fit');
          };
          await checkControlGeometry();
          await disclosure.focus(); await page.keyboard.press('Enter'); await checkDisclosure(true);
          assert(await disclosure.evaluate(element => element === document.activeElement), 'disclosure preserves keyboard focus');
          if (touch) {
            await scroll(page, 0);
            for (const control of await panel.locator('button').all()) {
              await page.keyboard.press('Tab');
              await control.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
              assert(await control.evaluate(button => {
                const box = button.getBoundingClientRect();
                const nav = document.querySelector('#mobileNav').getBoundingClientRect();
                const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                return document.activeElement === button && box.top >= 0 && box.bottom <= nav.top + 1 && button.contains(hit);
              }), 'keyboard-focused tag controls remain visible above the fixed nav');
            }
          }
          const expandedOverview = await measureOverview('candidate expanded');
          const columns = width >= 768 ? 4 : 2;
          const grid = expandedOverview.dimensions;
          assert.deepEqual(grid.map(button => button.tag), tags, 'exactly ten tags, fixed order');
          assert.equal(new Set(grid.map(button => Math.round(button.x))).size, columns, 'equal-width grid column count');
          assert.equal(new Set(grid.map(button => Math.round(button.y))).size, Math.ceil(tags.length / columns), 'grid row count');
          assert(grid.every((button, i) => Math.abs(button.width - grid[0].width) < 1 && Math.abs(button.height - grid[0].height) < 1 && button.width >= 44 && button.height >= 44 &&
            (i % columns ? button.x > grid[i - 1].x && button.y === grid[i - 1].y : i === 0 || button.y > grid[i - 1].y)), 'grid sizes/tap targets and reading order');
          const labelsFit = await page.locator('#videoTagFilters .video-tag-filter-chip-label').evaluateAll(labels => labels.every(label => {
            const range = document.createRange();
            range.selectNodeContents(label);
            const outer = label.parentElement.getBoundingClientRect();
            return [...range.getClientRects()].every(line => line.left >= outer.left && line.right <= outer.right && line.top >= outer.top && line.bottom <= outer.bottom);
          }));
          assert(labelsFit, 'tag labels including 横動画の切り抜き are not clipped');
          const untaggedBox = await untaggedControl.boundingBox();
          assert(untaggedBox.y >= grid.at(-1).bottom && untaggedBox.height >= 44, 'untagged control is separate from the 10-tag grid');
          const stored = (await fixtureQuery(page, 'select')).filter(row => !row.deleted_at);
          const byId = new Map(stored.map(row => [row.id, row]));
          const all = await ids();
          assert.deepEqual(new Set(all), new Set(byId.keys()), 'no tag selection includes all active rows');
          assert.deepEqual(all.filter(id => seed.some(row => row.id === id)), seed.map(row => row.id).reverse(), 'initial publication date order');
          const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
          const expected = (selected, state = 'all', { query = '', untagged = false } = {}) => all.filter(id => {
            const row = byId.get(id), rowTags = String(row.tags ?? '').split(/[,、\n]/).map(s => s.trim()).filter(Boolean);
            return (state === 'all' || state === row.status) && normalize(row.title).includes(normalize(query)) &&
              ((!selected.length && !untagged) || selected.some(value => rowTags.includes(value)) || (untagged && !rowTags.length));
          });
          const check = async (selected, state = 'all', { query = '', untagged = false } = {}) => {
            const shown = await ids();
            assert.deepEqual(shown, expected(selected, state, { query, untagged }), `ordered ${state} × ${query} × (${selected.join(' OR ')}, untagged=${untagged})`);
            assert.equal(new Set(shown).size, shown.length, 'one DOM row per video');
            const filtered = state !== 'all' || normalize(query) || selected.length || untagged;
            assert.equal((await page.locator('#videoVisibleCount').textContent()).trim(), filtered ? `${all.length}件中 ${shown.length}件を表示` : `全${all.length}件`);
            assert.equal(await search.inputValue(), query, 'search keeps original user input');
            assert.equal(await clearSearch.isVisible(), Boolean(query));
            const aria = await page.locator('#videoTagFilters [data-video-tag-filter]').evaluateAll(buttons => buttons.map(button => ({ tag: button.dataset.videoTagFilter,
              pressed: button.getAttribute('aria-pressed'), check: getComputedStyle(button.querySelector('.video-tag-filter-check')).visibility })));
            assert.deepEqual(aria.map(row => row.tag), tags, 'exact active labels/order, no legacy selector');
            assert(aria.every(row => row.pressed === String(selected.includes(row.tag)) && row.check === (selected.includes(row.tag) ? 'visible' : 'hidden')), 'aria and non-colour checkmark agree');
            assert.equal(await selectionCount.textContent(), `${selected.length}タグ選択中${untagged ? '・未設定あり' : ''}`);
            assert.equal(await untaggedControl.getAttribute('aria-pressed'), String(untagged));
            assert.equal(await clear.getAttribute('aria-disabled'), String(!selected.length && !untagged));
            for (const filter of ['all', '編集待ち', '投稿済み']) assert.equal(await page.locator(`[data-filter-count="${filter}"]`).textContent(), String(expected([], filter).length));
          };
          await check([]);
          assert(all.includes(fixtureId(6)) && all.includes(fixtureId(8)), 'legacy-only and untagged included in all');
          await press(tag(quiz)); await check([quiz]);
          await press(tag(price)); await check([quiz, price]);
          assert.deepEqual(await ids(), [fixtureId(16), fixtureId(15), fixtureId(14)], 'two new tags OR, without double-counting the mixed video');
          await press(clear); await check([]);
          await scroll(page, 0);
          const monthlyTotals = () => page.evaluate(() => {
            const { videos, ...posts } = getMonthlyPostStats('2020-01');
            const { videos: _, ...achievements } = getMonthlyAchievementStats('2020-01');
            return { posts, achievements, reward: calculateMonthlyReward({ videos }), historical: getAchievementMonthView('2026-07'), payment: getMonthlyPayment('2026-07') };
          });
          const totals = await monthlyTotals();
          const before = apiRequests.length;
          await search.focus();
          const inputElement = await search.elementHandle();
          const searchY = await page.evaluate(() => scrollY);
          for (const query of ['   ', '住之江', '住之江 Cup 404', '  cUp  ', '112', '[#1]', '<img>', 'memo-only-token', 'QAfixture01', player, '一致しない']) {
            await search.fill(query); await check([], 'all', { query });
            assert(await inputElement.evaluate(element => element.isConnected && element === document.activeElement), 'search DOM/focus is preserved');
            if (query === '<img>') {
              assert.deepEqual(await ids(), [fixtureId(3)]);
              assert.equal(await cards.locator('img').count(), 0, 'title and search text are never interpreted as markup');
            }
          }
          assert(Math.abs(await page.evaluate(() => scrollY) - searchY) <= 1, 'search does not jump scroll position');
          assert.match(await page.locator('#videoList .empty-state').textContent(), /選択した条件に一致する動画はありません/);
          await press(clearSearch); await check([]);
          assert(await search.evaluate(element => element === document.activeElement), 'title clear restores search focus');
          await search.evaluate(input => {
            input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            input.value = '住之江';
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '住之江', inputType: 'insertCompositionText', isComposing: true }));
          });
          assert.deepEqual(await ids(), all, 'intermediate Japanese IME text does not re-render');
          await search.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '住之江' })));
          await check([], 'all', { query: '住之江' });
          await press(untaggedControl); await check([], 'all', { query: '住之江', untagged: true });
          assert.deepEqual(await ids(), [fixtureId(12), fixtureId(10), fixtureId(9), fixtureId(8)], 'empty tokens match, known and unknown legacy tags do not');
          await press(status('編集待ち')); await check([], '編集待ち', { query: '住之江', untagged: true });
          assert.deepEqual(await ids(), [fixtureId(8)], 'waiting AND Japanese title AND untagged');
          await press(tag(player)); await check([player], '編集待ち', { query: '住之江', untagged: true });
          await press(tag(news)); await check([player, news], '編集待ち', { query: '住之江', untagged: true });
          await disclosure.focus(); await page.keyboard.press('Space'); await checkDisclosure(false);
          await check([player, news], '編集待ち', { query: '住之江', untagged: true });
          await press(mode('minimal')); await check([player, news], '編集待ち', { query: '住之江', untagged: true });
          for (const id of ['dashboard', 'videos']) await go(id);
          await checkDisclosure(false); await check([player, news], '編集待ち', { query: '住之江', untagged: true });
          assert.deepEqual(await monthlyTotals(), totals, 'display filters do not affect post totals, rewards, achievements, snapshots or paid status');
          await press(disclosure); await checkDisclosure(true);
          await press(clear); await check([], '編集待ち', { query: '住之江' });
          assert.equal(await mode('minimal').getAttribute('aria-pressed'), 'true', 'tag clear keeps the presentation mode');
          await search.fill('一致しない'); await check([], '編集待ち', { query: '一致しない' });
          const reset = page.locator('#clearAllVideoFilters');
          await reset.focus();
          const resetBeforeRefresh = await reset.elementHandle();
          await page.evaluate(() => renderVideos());
          assert(await resetBeforeRefresh.evaluate(button => button.isConnected && document.activeElement === button),
            'an unchanged no-results redraw preserves the reset control and focus');
          await press(reset); await check([]); await checkDisclosure(true);
          assert.equal(await mode('minimal').getAttribute('aria-pressed'), 'true', 'reset-all keeps the presentation mode');
          await press(mode('card'));
          const scrollToTag = await tag(player).evaluate(element => element.getBoundingClientRect().top + scrollY - Math.min(180, innerHeight / 4));
          await scroll(page, scrollToTag);
          const initialY = await page.evaluate(() => scrollY);
          await press(tag(player)); await check([player]);
          assert(Math.abs(await page.evaluate(() => scrollY) - initialY) <= 1, 'tag toggle does not jump scroll position');
          assert((await ids()).includes(fixtureId(7)) && !(await ids()).includes(fixtureId(6)), 'legacy mixed matches active tag, legacy-only does not');
          await press(tag(news)); await check([player, news]);
          await press(tag(terms)); await check([player, news, terms]);
          await press(tag(terms)); await check([player, news]);
          await press(status('編集待ち')); await check([player, news], '編集待ち');
          await press(clear); await check([], '編集待ち');
          await press(tag(unused)); await check([unused], '編集待ち');
          assert.match(await page.locator('#videoList .empty-state').textContent(), /選択した条件に一致する動画はありません/);
          await press(clear); await check([], '編集待ち');
          await press(status('投稿済み')); await check([], '投稿済み');
          await tag(player).focus(); await page.keyboard.press('Space'); await check([player], '投稿済み');
          assert(await tag(player).evaluate(button => button === document.activeElement && button.matches(':focus-visible') && getComputedStyle(button).outlineStyle !== 'none'), 'keyboard toggle preserves visible focus');
          await page.keyboard.press('Enter'); await check([], '投稿済み');
          await press(tag(player)); await press(tag(news)); await check([player, news], '投稿済み');
          await scroll(page, 0); await checkUi('filtered card top');
          await page.screenshot({ path: fileURLToPath(new URL(`${engineName}-${width}-card.png`, output)) });
          await scroll(page, 100000); await checkUi('filtered card end', true);
          const opener = cards.last().locator('h4').first();
          await opener.scrollIntoViewIfNeeded();
          const box = await opener.boundingBox();
          assert(box, 'detail opener is visible');
          const beforeModalY = await page.evaluate(() => scrollY);
          // Coordinate input avoids a second locator auto-scroll after we capture scrollY.
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
          const detail = page.locator('#videoDetailModal');
          await detail.waitFor({ state: 'visible' });
          const lockedY = await page.evaluate(() => Number(document.body.dataset.lockedScrollY));
          assert(Math.abs(lockedY - beforeModalY) <= 1, `opening detail captures scroll: ${lockedY} vs ${beforeModalY}`);
          await press(detail.locator('[data-close]').first());
          await page.waitForFunction(() => !document.body.classList.contains('modal-scroll-locked'));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const restoredY = await page.evaluate(() => scrollY);
          assert(Math.abs(restoredY - beforeModalY) <= 1, `closing detail restores filtered list scroll: ${restoredY} vs ${beforeModalY}`);
          await scroll(page, 0); await press(mode('minimal')); await check([player, news], '投稿済み');
          await checkUi('filtered minimal top');
          await page.screenshot({ path: fileURLToPath(new URL(`${engineName}-${width}-minimal.png`, output)) });
          await scroll(page, 100000); await checkUi('filtered minimal end', true);
          for (const id of ['dashboard', 'ideas', 'achievements', 'videos']) { await go(id); assert(await page.locator(`#${id}`).evaluate(element => element.classList.contains('active')), `${id} reachable`); }
          await check([player, news], '投稿済み');
          await press(mode('card')); await check([player, news], '投稿済み');
          await search.fill('住之江 Cup'); await check([player, news], '投稿済み', { query: '住之江 Cup' });
          const filteredDetailIds = await ids();
          assert.deepEqual(filteredDetailIds, [fixtureId(4), fixtureId(2), fixtureId(1)]);
          await press(cards.first().locator('h4'));
          const detailTitle = detail.locator('#videoDetailTitle');
          await detail.waitFor({ state: 'visible' });
          assert.equal(await detailTitle.textContent(), byId.get(filteredDetailIds[0]).title);
          assert(await detail.locator('[data-video-step="-1"]').isDisabled(), 'start of filtered detail navigation');
          if (touch) {
            // Synthetic TouchEvent coordinates exercise the existing swipe handler, not OS gesture recognition.
            await detailTitle.evaluate(element => {
              const start = new Event('touchstart', { bubbles: true }), end = new Event('touchend', { bubbles: true });
              Object.defineProperty(start, 'touches', { value: [{ clientX: 240, clientY: 120 }] });
              Object.defineProperties(end, { touches: { value: [] }, changedTouches: { value: [{ clientX: 120, clientY: 120 }] } });
              element.dispatchEvent(start); element.dispatchEvent(end);
            });
          } else {
            await press(detail.locator('[data-video-step="1"]'));
          }
          assert.equal(await detailTitle.textContent(), byId.get(filteredDetailIds[1]).title, 'detail swipe/next skips filtered-out videos');
          await press(detail.locator('[data-video-step="1"]'));
          assert.equal(await detailTitle.textContent(), byId.get(filteredDetailIds[2]).title);
          assert(await detail.locator('[data-video-step="1"]').isDisabled(), 'end of filtered detail navigation');
          await press(detail.locator('[data-close]').first());
          await page.evaluate(id => openVideoDetail(id), fixtureId(6));
          assert(await detail.locator('[data-video-step="-1"]').isDisabled());
          assert(await detail.locator('[data-video-step="1"]').isDisabled(), 'detail opened elsewhere does not navigate an unrelated result set');
          await press(detail.locator('[data-close]').first());
          await search.fill('QA'); await check([player, news], '投稿済み', { query: 'QA' });
          assert.deepEqual(apiRequests.slice(before), [], 'filter/view/page/detail controls issue no fetch/XHR');
          assert.deepEqual(await fixtureQuery(page, 'select'), stored, 'filter controls never mutate stored videos');

          // Trigger the application's existing debounced Realtime refresh path; the local SDK has no WebSocket.
          await fixtureQuery(page, 'update', { filters: [['id', fixtureId(3)]], payload: { tags: `${terms},${news}` } });
          await page.evaluate(() => scheduleRealtimeRefresh());
          await page.waitForFunction(id => !!document.querySelector(`#videoList [data-video-card-id="${id}"]`), fixtureId(3));
          byId.get(fixtureId(3)).tags = `${terms},${news}`;
          await check([player, news], '投稿済み', { query: 'QA' });
          await fixtureQuery(page, 'update', { filters: [['id', fixtureId(3)]], payload: { tags: terms } });
          await page.evaluate(() => scheduleRealtimeRefresh());
          await page.waitForFunction(id => !document.querySelector(`#videoList [data-video-card-id="${id}"]`), fixtureId(3));
          byId.get(fixtureId(3)).tags = terms;
          await check([player, news], '投稿済み', { query: 'QA' });

          // Use the existing app save/delete/restore flows with the isolated DB, never production.
          if (width === 390) {
            const title = 'QA mutation tag filter';
            const mutation = { title, type: 'Shorts', status: '投稿済み', postDate: '2020-02-01', youtubeUrl: '', tags: [clip], memo: '' };
            const newId = await page.evaluate(async values => { await saveVideo(values, 'new'); await loadAllData({ silent: true }); return data.videos.find(row => row.title === values.title).id; }, mutation);
            assert(!(await ids()).includes(newId), 'new nonmatching video remains hidden');
            await page.evaluate(async ({ values, id, tag }) => { await saveVideo({ ...values, tags: [tag] }, 'edit', id); await loadAllData({ silent: true }); }, { values: mutation, id: newId, tag: news });
            assert((await ids()).includes(newId), 'editing tags makes newly matching video visible');
            page.on('dialog', dialog => dialog.accept());
            await page.evaluate(id => deleteItem('video', id), newId);
            assert(!(await ids()).includes(newId), 'soft deleted video disappears');
            await page.evaluate(id => restoreItem('video', id), newId);
            assert((await ids()).includes(newId), 'restored video returns without resetting filters');
            await fixtureQuery(page, 'delete', { filters: [['id', newId]] });
            await page.evaluate(() => loadAllData({ silent: true }));
            await check([player, news], '投稿済み', { query: 'QA' });
            // The action controls still invoke the real local form and sync flows, not just a label.
            await press(page.locator('#videos [data-open-form="video"]'));
            const form = page.locator('#formModal');
            await form.waitFor({ state: 'visible' });
            assert.equal(await form.locator('#formTitle').textContent(), '動画を追加');
            assert.deepEqual(await form.locator('input[name="tags"]').evaluateAll(inputs => inputs.map(input => input.value)), tags, 'existing video form offers the same 8 tags');
            await press(form.locator('[data-close]').first());
            // Add the valid URL only here so startup auto-sync cannot contaminate the zero-request test.
            await fixtureQuery(page, 'update', { filters: [['id', fixtureId(2)]], payload: { youtube_url: 'https://www.youtube.com/watch?v=QAfixture01' } });
            await page.evaluate(() => loadAllData({ silent: true }));
            const syncRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/qa-youtube-sync');
            await press(page.locator('#syncAllYoutubeButton'));
            assert((await syncRequest).postDataJSON().ids.includes(fixtureId(2)), 'bulk sync includes even the video filtered out of this view');
            await page.waitForFunction(() => !document.querySelector('#syncAllYoutubeButton').disabled);
            await check([player, news], '投稿済み', { query: 'QA' });
            const { youtube_url, youtube_views, youtube_likes, youtube_comments, youtube_synced_at } = byId.get(fixtureId(2));
            await fixtureQuery(page, 'update', { filters: [['id', fixtureId(2)]], payload: { youtube_url, youtube_views, youtube_likes, youtube_comments, youtube_synced_at } });
            await page.evaluate(() => loadAllData({ silent: true }));
            const beforeEmpty = await page.evaluateHandle(() => data.videos);
            await page.evaluate(() => { data.videos = []; renderVideos(); });
            assert.equal(await page.locator('#videoList .empty-state').textContent(), '動画が登録されていません');
            assert.equal(await page.locator('#clearAllVideoFilters').count(), 0, 'no reset affordance when no data exists');
            await page.evaluate(videos => { data.videos = videos; renderVideos(); }, beforeEmpty);
            await check([player, news], '投稿済み', { query: 'QA' });
            await page.reload();
            await page.waitForFunction(() => document.querySelector('#dataLoadStatus').textContent === 'データ取得済み');
            await go('videos'); await check([]); await checkDisclosure(false);
          }
          assert.deepEqual(external, [], 'no requests outside the isolated loopback origin');
          assert.deepEqual(issues, [], 'console error/warning and page errors');
          console.log(`PASS ${engineName} ${width}x${height} ${touch ? 'touch' : 'desktop'}: grid, search/IME, OR/AND, keyboard/ARIA, filtered detail, zero filter requests, fixed nav/final row, refresh`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  await writeFile(new URL(baseline ? 'baseline-measurements.json' : 'measurements.json', output), JSON.stringify(measurements, null, 2));
  console.log(`PASS ${engineNames.length * viewports.length} integrated browser configurations, ${measurements.length} geometry records, console error/warning 0`);
} finally { server.kill(); }
