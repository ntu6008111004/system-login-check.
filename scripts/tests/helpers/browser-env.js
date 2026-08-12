/**
 * โหลด app.js เข้า Node VM พร้อม stub ของ browser/jQuery แบบบันทึกค่า
 * เพื่อทดสอบ state machine ของหน้าลงเวลาโดยไม่ต้องเปิด browser จริง
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS_PATH = path.join(__dirname, '..', '..', '..', 'app.js');

function createRecordingJQuery() {
  const elements = new Map();

  function el(id) {
    if (!elements.has(id)) {
      elements.set(id, { text: '', html: '', prop: {}, attr: {}, classes: new Set() });
    }
    return elements.get(id);
  }

  function jq(arg) {
    if (typeof arg === 'function') return api([]); // $(fn) — ไม่รัน init อัตโนมัติในเทสต์
    const ids = typeof arg === 'string' ? arg.split(',').map((s) => s.trim()) : ['(node)'];
    return api(ids);
  }

  function api(ids) {
    const self = {
      length: ids.length,
      text(v) {
        if (v === undefined) return ids.length ? el(ids[0]).text : '';
        ids.forEach((id) => { el(id).text = String(v); el(id).html = String(v); });
        return self;
      },
      html(v) {
        if (v === undefined) return ids.length ? el(ids[0]).html : '';
        ids.forEach((id) => { el(id).html = String(v); });
        return self;
      },
      prop(name, v) {
        if (v === undefined) return ids.length ? el(ids[0]).prop[name] : undefined;
        ids.forEach((id) => { el(id).prop[name] = v; });
        return self;
      },
      attr(name, v) {
        if (v === undefined) return ids.length ? el(ids[0]).attr[name] : undefined;
        ids.forEach((id) => { el(id).attr[name] = v; });
        return self;
      },
      addClass(c) { ids.forEach((id) => String(c).split(/\s+/).forEach((x) => el(id).classes.add(x))); return self; },
      removeClass(c) { ids.forEach((id) => String(c).split(/\s+/).forEach((x) => el(id).classes.delete(x))); return self; },
      toggleClass() { return self; },
      hasClass() { return false; },
      val(v) { if (v === undefined) return ''; return self; },
      on() { return self; }, off() { return self; }, one() { return self; },
      click() { return self; }, trigger() { return self; },
      show() { return self; }, hide() { return self; },
      fadeIn() { return self; }, fadeOut() { return self; }, fadeTo() { return self; },
      slideUp() { return self; }, slideDown() { return self; },
      append() { return self; }, prepend() { return self; }, before() { return self; }, after() { return self; },
      remove() { return self; }, empty() { return self; }, detach() { return self; },
      css() { return self; }, animate() { return self; },
      each(fn) { ids.forEach((id, i) => fn.call({ id }, i, { id })); return self; },
      find() { return api([]); }, closest() { return api([]); }, parent() { return api([]); },
      children() { return api([]); }, siblings() { return api([]); },
      first() { return self; }, last() { return self; }, eq() { return self; },
      filter() { return api([]); }, not() { return api([]); },
      is() { return false; }, data() { return undefined; },
      removeAttr() { return self; }, focus() { return self; }, blur() { return self; },
      scrollTop() { return 0; }, ready() { return self; },
      get() { return []; },
    };
    return self;
  }

  jq.fn = {};
  jq.ajax = () => {};
  return { jq, elements, el };
}

function makeLocalStorage() {
  const store = {};
  for (const [name, fn] of Object.entries({
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  })) {
    Object.defineProperty(store, name, { value: fn, enumerable: false });
  }
  return store;
}

function loadApp() {
  const { jq, elements, el } = createRecordingJQuery();
  const noop = () => {};

  const documentStub = {
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      setAttribute: noop, addEventListener: noop, appendChild: noop, remove: noop,
    }),
    head: { appendChild: noop, removeChild: noop },
    body: { appendChild: noop, classList: { add: noop, remove: noop } },
    documentElement: { style: {}, classList: { add: noop, remove: noop } },
    hidden: false,
    visibilityState: 'visible',
  };

  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set,
    URLSearchParams, encodeURIComponent, decodeURIComponent, escape, unescape,
    AbortController,
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    fetch: () => Promise.reject(new Error('fetch disabled in tests')),
    localStorage: makeLocalStorage(),
    sessionStorage: makeLocalStorage(),
    document: documentStub,
    navigator: {
      userAgent: 'node-test',
      geolocation: { getCurrentPosition: noop, watchPosition: noop, clearWatch: noop },
      mediaDevices: { getUserMedia: () => Promise.reject(new Error('no camera')), enumerateDevices: () => Promise.resolve([]) },
      permissions: { query: () => Promise.resolve({ state: 'granted', addEventListener: noop }) },
      clipboard: { writeText: () => Promise.resolve() },
    },
    location: { href: 'https://test.local/index.html', pathname: '/index.html', search: '', origin: 'https://test.local', reload: noop, replace: noop },
    history: { replaceState: noop, pushState: noop },
    matchMedia: () => ({ matches: false, addListener: noop, addEventListener: noop }),
    addEventListener: noop,
    removeEventListener: noop,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: clearTimeout,
    Image: class { constructor() { this.style = {}; } },
    Swal: {
      fire: () => Promise.resolve({ isConfirmed: false, isDismissed: true }),
      mixin: () => ({ fire: () => Promise.resolve({}) }),
      close: noop, showLoading: noop, isVisible: () => false, update: noop,
    },
    $: jq,
    jQuery: jq,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  const source = fs.readFileSync(APP_JS_PATH, 'utf8');
  new vm.Script(source, { filename: APP_JS_PATH }).runInContext(context);

  // ตัวแปร let/const ระดับบนของ app.js มองไม่เห็นจาก context object ตรง ๆ
  // ต้องอ่าน/เขียนผ่านสคริปต์ที่รันใน context เดียวกัน
  const evalIn = (code) => vm.runInContext(code, context);

  return { context, evalIn, ui: el, elements, source };
}

module.exports = { loadApp, APP_JS_PATH };
