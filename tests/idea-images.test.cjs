// Run with: node tests/idea-images.test.cjs (no dependencies or live services).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260827110343_multi_idea_images.sql'), 'utf8');
const base = 'https://jyxrrnfnypqaecfojsle.supabase.co/storage/v1/object/public/idea-images/';
const url = name => `${base}ideas/${name}.png`;
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

function fixture(initial = []) {
  const mock = { objects: new Map(initial.map(u => [u.slice(base.length), true])), dbUrls: [...initial], uploaded: 0, rpcCalls: 0, removed: [], failUpload: 0, failDb: false, lostResponse: false, failCleanup: false };
  const stored = new Map();
  const nodes = new Map();
  const editorNodes = { '[data-image-error]': { textContent: '' }, '[data-image-previews]': { innerHTML: '' }, '[data-image-count]': { textContent: '' } };
  const editor = { disabled: false, dataset: { imageInitial: JSON.stringify({ urls: initial, updatedAt: null }) }, querySelector: selector => editorNodes[selector] };
  const client = {
    storage: { from() { return {
      getPublicUrl(p) { return { data: { publicUrl: base + p } }; },
      async upload(p, file) {
        mock.uploaded++; mock.objects.set(p, file);
        return { error: mock.failUpload === mock.uploaded ? new Error('simulated upload failure') : null };
      },
      async remove(paths) {
        if (mock.failCleanup) return { error: new Error('cleanup offline') };
        const deleted = [];
        for (const p of paths) if (!mock.dbUrls.includes(base + p)) {
          mock.objects.delete(p); mock.removed.push(p); deleted.push({ name: p });
        }
        return { data: deleted, error: null };
      }
    }; } },
    async rpc(name, payload) {
      assert.equal(name, 'save_idea_with_images'); mock.rpcCalls++; mock.payload = payload;
      if (mock.failDb) return { error: new Error('database rejected save') };
      assert(!Object.hasOwn(payload,'p_image_urls'),'client must not send a replacement image list');
      mock.dbUrls = mock.dbUrls.filter(url=>!payload.p_removed_image_urls.includes(url)).concat(payload.p_added_image_urls);
      if (mock.lostResponse) return { error: new Error('response lost after commit') };
      return { data: { id: 'saved', image_url: mock.dbUrls[0] || null }, error: null };
    }
  };
  const context = vm.createContext({
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } },
    window: { supabase: { createClient: () => client } },
    localStorage: { getItem: k => stored.get(k) || null, setItem: (k,v) => stored.set(k,v) },
    URL, Blob, Intl, Date, console, editor
  });
  vm.runInContext(source.slice(0, source.lastIndexOf('\ninitialize().catch')), context);
  const run = code => vm.runInContext(code, context);
  const files = count => run(`getIdeaImageEditorState(editor).pendingImages.push(...Array.from({length:${count}},(_,i)=>({file:{name:'file'+i+'.png',size:100,type:'image/png'},previewUrl:'blob:fixture-'+i})));`);
  const save = () => run(`saveIdeaImageRecord('idea','fixture',{title:'テスト',status:'アイデア'},editor)`);
  return { mock, run, files, save, editor };
}

(async () => {
  await test('JavaScript / manifest parse', () => {
    new vm.Script(source);
    JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const version = source.match(/const APP_VERSION = "([^"]+)"/)[1];
    assert(html.includes(`name="app-version" content="${version}"`));
    for (const asset of ['app.js', 'style.css', 'manifest.json']) assert(html.includes(`${asset}?v=${version}`));
  });
  await test('HTML IDs / JS DOM references / duplicate functions', () => {
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, new Set(ids).size);
    const allIds = new Set([...ids, ...[...source.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])]);
    for (const m of source.matchAll(/getElementById\("([^"]+)"\)/g)) assert(allIds.has(m[1]),m[1]);
    const names = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)].map(m=>m[1]);
    assert.equal(names.length, new Set(names).size);
  });
  await test('CSS braces / SQL non-destructive migration', () => {
    const css = fs.readFileSync(path.join(root,'style.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');
    let depth=0; for(const c of css) { if(c==='{')depth++; if(c==='}')depth--; assert(depth>=0); } assert.equal(depth,0);
    assert(!/\b(?:drop\s+(?:table|column)|truncate|disable\s+row\s+level\s+security)\b/i.test(sql));
    assert(!/delete\s+from\s+storage\./i.test(sql));
  });
  for (const count of [0,1,2,5,10]) await test(`${count} selected images save in one RPC`, async () => {
    const f=fixture(); f.files(count); await f.save();
    assert.equal(f.mock.dbUrls.length,count); assert.equal(f.mock.rpcCalls,1); assert.equal(f.mock.objects.size,count);
    assert.equal(f.editor.disabled,false);
  });
  await test('legacy image + 2 new images; no reupload of legacy', async () => {
    const f=fixture([url('legacy')]); f.files(2); await f.save();
    assert.equal(f.mock.dbUrls.length,3); assert.equal(f.mock.dbUrls[0],url('legacy')); assert.equal(f.mock.uploaded,2);
  });
  await test('remove B + add D/E keeps A/C and deletes B only after commit', async () => {
    const f=fixture([url('A'),url('B'),url('C')]); f.run('removeIdeaImage(editor,1)'); f.files(2);
    assert(f.mock.objects.has('ideas/B.png')); await f.save();
    assert.deepEqual(f.mock.dbUrls.slice(0,2),[url('A'),url('C')]); assert.equal(f.mock.dbUrls.length,4);
    assert(!f.mock.objects.has('ideas/B.png')); assert(f.mock.objects.has('ideas/A.png')); assert(f.mock.objects.has('ideas/C.png'));
  });
  await test('remove all images is an explicit empty save', async () => {
    const f=fixture([url('A')]); f.run('removeIdeaImage(editor,0)'); await f.save();
    assert.equal(f.mock.dbUrls.length,0); assert.equal(f.mock.objects.size,0);
  });
  await test('cancel before save keeps existing Storage images', async () => {
    const f=fixture([url('A')]); f.run('getIdeaImageEditorState(editor).cancelled=true');
    await assert.rejects(f.save(),/キャンセル/); assert(f.mock.objects.has('ideas/A.png')); assert.equal(f.mock.rpcCalls,0);
  });
  await test('repeated FileList selections append; duplicates/overflow are skipped without replacing images', () => {
    const f=fixture([url('A')]);
    f.run(`var input = {files:[],value:'',closest:()=>editor};
      var file = Object.assign(new Blob(['image'],{type:'image/png'}),{name:'test.png',lastModified:1});
      var file2 = Object.assign(new Blob(['image'],{type:'image/png'}),{name:'test.png',lastModified:2});
      input.files=[file]; selectIdeaImages(input); input.files=[file2]; selectIdeaImages(input);`);
    assert.equal(f.run('getIdeaImageEditorEntries(getIdeaImageEditorState(editor)).length'),3);
    assert(f.run('editor.querySelector("[data-image-previews]").innerHTML').includes('追加予定'));
    f.run('input.files=[file,file2]; selectIdeaImages(input)');
    assert.equal(f.run('getIdeaImageEditorEntries(getIdeaImageEditorState(editor)).length'),3);
    assert.match(f.run('editor.querySelector("[data-image-error]").textContent'),/同じ画像2枚/);
    f.run(`input.files=Array.from({length:9},(_,i)=>Object.assign(new Blob(['image'],{type:'image/png'}),{name:'extra'+i+'.png',lastModified:3})); selectIdeaImages(input)`);
    assert.equal(f.run('getIdeaImageEditorEntries(getIdeaImageEditorState(editor)).length'),10);
    assert.match(f.run('editor.querySelector("[data-image-error]").textContent'),/超過2枚/);
    f.run(`input.files=[{name:'wrong.txt',size:1,type:'text/plain'}]; selectIdeaImages(input)`);
    assert.equal(f.run('getIdeaImageEditorEntries(getIdeaImageEditorState(editor)).length'),10);
    assert.match(f.run('editor.querySelector("[data-image-error]").textContent'),/画像ファイル/);
    f.run('var beforeClose = getIdeaImageEditorState(editor); releaseIdeaImageEditors({querySelectorAll:()=>[editor]})');
    assert.equal(f.run('beforeClose.cancelled'),true);
    assert.equal(f.mock.rpcCalls,0); assert.equal(f.mock.uploaded,0);
    assert(f.mock.objects.has('ideas/A.png'));
  });
  await test('three separate selections persist all files once, not only the last FileList', async () => {
    const f=fixture();
    f.run(`var input = {files:[],value:'',closest:()=>editor};
      for (const name of ['A','B','C']) {
        input.files=[Object.assign(new Blob([name],{type:'image/png'}),{name:name+'.png',lastModified:1})];
        selectIdeaImages(input);
      }`);
    assert.match(f.run('editor.querySelector("[data-image-count]").textContent'),/保存予定 3枚/);
    await f.save();
    assert.equal(f.mock.uploaded,3); assert.equal(f.mock.dbUrls.length,3);
    assert.equal(new Set(f.mock.dbUrls).size,3); assert.equal(f.mock.objects.size,3);
  });
  await test('8 existing + 5 selected accepts 2 and reports 3 skipped; existing images are never reuploaded', async () => {
    const existing=Array.from({length:8},(_,i)=>url('existing'+i));
    const f=fixture(existing);
    f.run(`var input = {value:'',closest:()=>editor,
      files:Array.from({length:5},(_,i)=>Object.assign(new Blob(['image'],{type:'image/png'}),{name:'new'+i+'.png',lastModified:1}))};
      selectIdeaImages(input);`);
    assert.match(f.run('editor.querySelector("[data-image-error]").textContent'),/超過3枚/);
    await f.save();
    assert.equal(f.mock.dbUrls.length,10); assert.equal(f.mock.uploaded,2);
    assert.deepEqual(f.mock.dbUrls.slice(0,8),existing);
  });
  await test('partial upload failure cleans successful/ambiguous new uploads and keeps old images', async () => {
    const f=fixture([url('old')]); f.files(5); f.mock.failUpload=3;
    await assert.rejects(f.save(),/アップロード/); assert.equal(f.mock.rpcCalls,0);
    assert.deepEqual([...f.mock.objects.keys()],['ideas/old.png']); assert.equal(f.editor.disabled,false);
  });
  await test('DB rejection rolls back new uploads, not legacy images', async () => {
    const f=fixture([url('old')]); f.files(2); f.mock.failDb=true;
    await assert.rejects(f.save(),/保存できません/); assert.deepEqual([...f.mock.objects.keys()],['ideas/old.png']);
  });
  await test('lost response after commit cannot delete referenced uploads', async () => {
    const f=fixture([url('old')]); f.files(2); f.mock.lostResponse=true;
    await assert.rejects(f.save(),/保存できません/); assert.equal(f.mock.objects.size,3);
  });
  await test('cleanup failure is queued; subsequent attempt retries', async () => {
    const f=fixture([url('A'),url('B')]); f.run('removeIdeaImage(editor,1)'); f.mock.failCleanup=true;
    await f.save(); assert.equal(f.mock.dbUrls.length,1); assert(f.mock.objects.has('ideas/B.png'));
    assert.equal(f.run('pendingIdeaImageCleanup.size'),1); f.mock.failCleanup=false;
    await f.run('cleanupIdeaImages()'); assert(!f.mock.objects.has('ideas/B.png')); assert.equal(f.run('pendingIdeaImageCleanup.size'),0);
  });
  await test('only this project/bucket/generated paths can be cleaned up', () => {
    const f=fixture();
    for(const value of ['https://other.example/storage/v1/object/public/idea-images/ideas/A.png',base+'../A.png',base+'ideas/%2e%2e/A.png','javascript:alert(1)']) assert.equal(f.run(`getIdeaImageStoragePath(${JSON.stringify(value)})`),'');
    assert.equal(f.run(`getIdeaImageStoragePath(${JSON.stringify(url('A'))})`),'ideas/A.png');
  });
  await test('legacy fallback, stable order and deduplication', () => {
    const f=fixture(); const urls=f.run(`normalizeIdeaImageUrls('A',[{image_url:'C',sort_order:2},{image_url:'A',sort_order:0},{image_url:'B',sort_order:1}])`);
    assert.deepEqual(Array.from(urls),['A','B','C']);
    assert.deepEqual(Array.from(f.run(`normalizeIdeaImageUrls('legacy',[])`)),['legacy']);
  });
  await test('10-image card is bounded; detail renders all; empty has no frame', () => {
    const f=fixture(); const entity={imageUrls:Array.from({length:10},(_,i)=>url(i))};
    const card=f.run(`renderIdeaImages(${JSON.stringify(entity)},'画像')`);
    const detail=f.run(`renderIdeaImages(${JSON.stringify(entity)},'画像',true)`);
    assert.equal((card.match(/<img /g)||[]).length,3); assert(card.includes('+7'));
    assert.equal((detail.match(/<img /g)||[]).length,10); assert.equal(f.run(`renderIdeaImages({},'画像')`),'');
  });
  console.log(`\n${passed} tests passed`);
})().catch(error => { console.error(error); process.exitCode=1; });
