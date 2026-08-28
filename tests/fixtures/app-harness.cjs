// Local-only VM: no real Auth, API, Storage, network or browser persistence.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function harness({ client = {}, ref = process.env.APP_REF } = {}) {
  const nodes = new Map(), timers = new Map(), logs = [], storage = new Map();
  let timerId = 0;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    const value = {
      id, dataset: {}, style: {}, textContent: '', innerHTML: '', value: '', open: false,
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n), toggle(n, force) { const add = force ?? !classes.has(n); add ? classes.add(n) : classes.delete(n); return add; } },
      addEventListener() {}, querySelector: selector => node(id + selector), querySelectorAll: () => [],
      setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; },
      removeAttribute(name) { delete this[name]; }, showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 500, bottom: 500 }), focus() {}
    };
    nodes.set(id, value); return value;
  }
  const setTimer = (fn, ms, interval = false) => { timers.set(++timerId, { fn, ms, interval }); return timerId; };
  const document = {
    visibilityState: 'visible', body: node('body'), documentElement: node('html'),
    getElementById: node, querySelector: selector => selector === 'meta[name="app-version"]' ? { content: '23.31' } : node(selector),
    querySelectorAll: selector => selector === 'dialog[open]' ? [...nodes.values()].filter(n => n.open) : [],
    addEventListener() {}
  };
  const context = vm.createContext({
    document, navigator: { onLine: true }, URL, URLSearchParams, Blob, Intl, Date,
    console: Object.fromEntries(['log','info','warn','error','debug'].map(level => [level, (...args) => logs.push({ level, args })])),
    setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    window: { supabase: { createClient: () => client }, setTimeout: setTimer, clearTimeout: id => timers.delete(id),
      setInterval: (fn,ms) => setTimer(fn,ms,true), clearInterval: id => timers.delete(id),
      location: { reload() {} }, matchMedia: () => ({ matches: false }), scrollTo() {}, scrollY: 0, addEventListener() {} }
  });
  const source = ref ? execFileSync('git', ['show', `${ref}:app.js`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root,'app.js'),'utf8');
  vm.runInContext(source.slice(0,source.lastIndexOf('\ninitialize().catch')),context);
  return { run: code => vm.runInContext(code,context), node, timers, logs, context, source,
    async tick(ms) { for (const [id,timer] of [...timers]) if (timer.ms === ms) { if (!timer.interval) timers.delete(id); timer.fn(); } for (let i=0;i<20;i++) await Promise.resolve(); } };
}
module.exports = { harness, deferred, root };
