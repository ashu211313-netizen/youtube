// Isolated loopback Postgres and mock SDK. Desktop WebKit/touch emulation is not a physical iPhone.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const origin = 'http://127.0.0.1:8766';
const engines = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const engineNames = process.env.QA_ENGINE ? [process.env.QA_ENGINE] : ['chromium', 'webkit'];
assert(engineNames.every(name => ['chromium', 'webkit'].includes(name)), 'supported QA browser engines');
const output = new URL('../../../outputs/video-tag-filter/', import.meta.url);
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, [fileURLToPath(new URL('./browser-server.mjs', import.meta.url))], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
});
const tags = ['選手解説', '用語解説', '競艇場解説', '疑問解決系', '横動画の切り抜き', 'レース映像', '横動画', '競艇ニュース'];
const [player, terms, , unused, clip, , , news] = tags;
const measurements = [];
const fixtureId = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const viewports = [[390, 844], [430, 932], [768, 1024], [1280, 900]];
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
    ...Array.from({ length: 16 }, () => player)];
  const seed = fixtureTags.map((value, index) => ({ id: fixtureId(index + 1), title: `QA tag filter ${index + 1}`,
    video_type: 'Shorts', status: index === 4 ? '編集待ち' : '投稿済み', tags: value,
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
              const buttonMetrics = [...tagArea.querySelectorAll('button')].map(button => ({ ...rect(button),
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
            if (width <= 430) assert(new Set(geometry.buttons.filter(b => tags.includes(b.label)).map(b => Math.round(b.top))).size > 1, `${label}: tags naturally wrap`);
            if (touch) {
              assert.equal(geometry.navPosition, 'fixed', label);
              assert(Math.abs(geometry.nav.bottom - geometry.visibleBottom) <= 1, `${label}: nav viewport gap`);
              assert.equal(geometry.navButtons.length, 4);
              assert(geometry.navButtons.every(button => button.hit && button.height >= 44), `${label}: 4 accessible nav controls`);
              if (geometry.scroll < 1) assert(geometry.tagArea.bottom <= geometry.nav.top, `${label}: filter and nav do not overlap at top`);
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
          const stored = (await fixtureQuery(page, 'select')).filter(row => !row.deleted_at);
          const byId = new Map(stored.map(row => [row.id, row]));
          const all = await ids();
          assert.deepEqual(new Set(all), new Set(byId.keys()), 'no tag selection includes all active rows');
          assert.deepEqual(all.filter(id => seed.some(row => row.id === id)), seed.map(row => row.id).reverse(), 'initial publication date order');
          const expected = (selected, state = 'all') => all.filter(id => {
            const row = byId.get(id), rowTags = String(row.tags || '').split(/[,、]/).map(s => s.trim());
            return (state === 'all' || state === row.status) && (!selected.length || selected.some(value => rowTags.includes(value)));
          });
          const check = async (selected, state = 'all') => {
            const shown = await ids();
            assert.deepEqual(shown, expected(selected, state), `ordered ${state} × (${selected.join(' OR ')})`);
            assert.equal(new Set(shown).size, shown.length, 'one DOM row per video');
            assert.equal((await page.locator('#videoVisibleCount').textContent()).trim(), `表示中 ${shown.length}件`);
            const aria = await page.locator('#videoTagFilters [data-video-tag-filter]').evaluateAll(buttons => buttons.map(button => ({ tag: button.dataset.videoTagFilter,
              pressed: button.getAttribute('aria-pressed'), check: getComputedStyle(button.querySelector('.video-tag-filter-check')).visibility })));
            assert.deepEqual(aria.map(row => row.tag), tags, 'exact active labels/order, no legacy selector');
            assert(aria.every(row => row.pressed === String(selected.includes(row.tag)) && row.check === (selected.includes(row.tag) ? 'visible' : 'hidden')), 'aria and non-colour checkmark agree');
            assert.equal(await clear.getAttribute('aria-disabled'), String(!selected.length));
            for (const filter of ['all', '編集待ち', '投稿済み']) assert.equal(await page.locator(`[data-filter-count="${filter}"]`).textContent(), String(expected([], filter).length));
          };
          await check([]);
          assert(all.includes(fixtureId(6)) && all.includes(fixtureId(8)), 'legacy-only and untagged included in all');
          const before = apiRequests.length;
          await scroll(page, 70);
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
          assert.deepEqual(apiRequests.slice(before), [], 'filter/view/page/detail controls issue no fetch/XHR');
          assert.deepEqual(await fixtureQuery(page, 'select'), stored, 'filter controls never mutate stored videos');

          // Trigger the application's existing debounced Realtime refresh path; the local SDK has no WebSocket.
          await fixtureQuery(page, 'update', { filters: [['id', fixtureId(3)]], payload: { tags: `${terms},${news}` } });
          await page.evaluate(() => scheduleRealtimeRefresh());
          await page.waitForFunction(id => !!document.querySelector(`#videoList [data-video-card-id="${id}"]`), fixtureId(3));
          byId.get(fixtureId(3)).tags = `${terms},${news}`;
          await check([player, news], '投稿済み');
          await fixtureQuery(page, 'update', { filters: [['id', fixtureId(3)]], payload: { tags: terms } });
          await page.evaluate(() => scheduleRealtimeRefresh());
          await page.waitForFunction(id => !document.querySelector(`#videoList [data-video-card-id="${id}"]`), fixtureId(3));
          byId.get(fixtureId(3)).tags = terms;
          await check([player, news], '投稿済み');

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
            await check([player, news], '投稿済み');
          }
          assert.deepEqual(external, [], 'no requests outside the isolated loopback origin');
          assert.deepEqual(issues, [], 'console error/warning and page errors');
          console.log(`PASS ${engineName} ${width}x${height} ${touch ? 'touch' : 'desktop'}: ordered OR/AND, keyboard/ARIA, 0 API calls on controls, fixed nav and final row, refresh/updates`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  await writeFile(new URL('measurements.json', output), JSON.stringify(measurements, null, 2));
  console.log(`PASS ${engineNames.length * viewports.length} integrated browser configurations, ${measurements.length} geometry records, console error/warning 0`);
} finally { server.kill(); }
