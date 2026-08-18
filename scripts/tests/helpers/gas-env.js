/**
 * โหลด apps-script.gs เข้า Node VM พร้อม mock บริการของ Google Apps Script
 * (SpreadsheetApp / CacheService / LockService / PropertiesService / Utilities)
 * เพื่อทดสอบ getUserHistory + saveAttendance โดยไม่แตะ Google จริง
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GS_PATH = path.join(__dirname, '..', '..', '..', 'apps-script.gs');

const ATT_HEADERS = ['id', 'user_id', 'datetime', 'status', 'latitude', 'longitude', 'map_link', 'location_name', 'selfie', 'device'];

function pad(n) { return String(n).padStart(2, '0'); }

function formatDateLike(date, fmt) {
  const d = pad(date.getDate());
  const M = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const H = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  if (fmt === 'dd/MM/yyyy') return `${d}/${M}/${y}`;
  if (fmt === 'dd/MM/yyyy HH:mm:ss') return `${d}/${M}/${y} ${H}:${m}:${s}`;
  throw new Error('unsupported format in mock: ' + fmt);
}

function createMockSheet(name, rows) {
  const data = rows.map((r) => r.slice());
  const calls = { getRange: [], getDataRange: 0, setValues: [], appendRow: 0 };

  const sheet = {
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    getDataRange() {
      calls.getDataRange += 1;
      return makeRange(1, 1, data.length, sheet.getLastColumn());
    },
    getRange(row, col, numRows = 1, numCols = 1) {
      calls.getRange.push({ row, col, numRows, numCols });
      return makeRange(row, col, numRows, numCols);
    },
    appendRow(row) { calls.appendRow += 1; data.push(row.slice()); },
    insertColumnAfter: () => {},
    deleteRows: () => {},
  };

  function makeRange(row, col, numRows, numCols) {
    return {
      getValues() { return slice(); },
      getDisplayValues() { return slice().map((r) => r.map((c) => String(c == null ? '' : c))); },
      getDisplayValue() { return String(slice()[0][0] == null ? '' : slice()[0][0]); },
      setValues(values) {
        calls.setValues.push({ row, col, values });
        values.forEach((vRow, i) => {
          while (data.length < row + i) data.push(new Array(sheet.getLastColumn()).fill(''));
          vRow.forEach((v, j) => { data[row - 1 + i][col - 1 + j] = v; });
        });
      },
      setValue(v) { this.setValues([[v]]); },
    };
    function slice() {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        const src = data[row - 1 + r] || [];
        const line = [];
        for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] !== undefined ? src[col - 1 + c] : '');
        out.push(line);
      }
      return out;
    }
  }

  return { sheet, data, calls };
}

function loadGas({ attendanceRows = [], lockAvailable = true } = {}) {
  const attendance = createMockSheet('ATTENDANCE', [ATT_HEADERS, ...attendanceRows]);
  const sheets = { ATTENDANCE: attendance };

  const cacheStore = new Map();
  const cacheOps = { put: [], removeAll: [], get: [] };
  const scriptCache = {
    get(k) { cacheOps.get.push(k); return cacheStore.has(k) ? cacheStore.get(k) : null; },
    put(k, v) { cacheOps.put.push(k); cacheStore.set(k, String(v)); },
    putAll(entries) { Object.entries(entries).forEach(([k, v]) => { cacheOps.put.push(k); cacheStore.set(k, String(v)); }); },
    getAll(keys) { const out = {}; keys.forEach((k) => { if (cacheStore.has(k)) out[k] = cacheStore.get(k); }); return out; },
    remove(k) { cacheStore.delete(k); },
    removeAll(keys) { cacheOps.removeAll.push(keys.slice()); keys.forEach((k) => cacheStore.delete(k)); },
  };

  const props = new Map();
  const lockOps = { try: 0, release: 0 };

  const sandbox = {
    console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (n) => (sheets[n] ? sheets[n].sheet : null), insertSheet: (n) => { sheets[n] = createMockSheet(n, [[]]); return sheets[n].sheet; } }),
    },
    CacheService: { getScriptCache: () => scriptCache },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { lockOps.try += 1; return lockAvailable; },
        waitLock: () => { lockOps.wait = (lockOps.wait || 0) + 1; },
        releaseLock: () => { lockOps.release += 1; },
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)) }) },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    Utilities: {
      Charset: { UTF_8: 'UTF_8' },
      DigestAlgorithm: { MD5: 'MD5' },
      formatDate: (date, _tz, fmt) => formatDateLike(date, fmt),
      base64Encode: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
      base64Decode: (s) => Array.from(Buffer.from(String(s), 'base64')),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
      computeDigest: (_alg, s) => Array.from(require('node:crypto').createHash('md5').update(String(s)).digest()),
    },
    ContentService: { createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }), MimeType: { JAVASCRIPT: 'JAVASCRIPT', JSON: 'JSON' } },
    UrlFetchApp: { fetch: () => { throw new Error('UrlFetchApp disabled in tests'); } },
    Logger: { log: () => {} },
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  const source = fs.readFileSync(GS_PATH, 'utf8');
  new vm.Script(source, { filename: GS_PATH }).runInContext(context);

  return {
    context,
    call: (fnName, ...args) => context[fnName](...args),
    attendance,
    cacheStore,
    cacheOps,
    props,
    lockOps,
    formatDateLike,
    ATT_HEADERS,
  };
}

module.exports = { loadGas, GS_PATH, ATT_HEADERS, formatDateLike };
