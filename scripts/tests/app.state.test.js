/**
 * เทสต์ state machine ของหน้าลงเวลา (app.js)
 * ครอบคลุมบั๊กจอค้าง: เช็คสถานะล้มเหลวแล้วปุ่มต้องไม่หมุนค้าง และ
 * callback จาก GPS/กล้องต้องไม่เขียนทับสถานะ error กลับเป็นสปินเนอร์
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/browser-env');

const pad = (n) => String(n).padStart(2, '0');
const todayThai = () => {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

test('getAttendanceDateKey แปลงวันที่ไทย/ISO ได้ถูกต้อง', () => {
  const { evalIn } = loadApp();
  assert.equal(evalIn(`getAttendanceDateKey('12/08/2026 09:15:00')`), '2026-08-12');
  assert.equal(evalIn(`getAttendanceDateKey('2026-08-12T09:15:00')`), '2026-08-12');
  assert.equal(evalIn(`getAttendanceDateKey('5/1/2026 07:00:00')`), '2026-01-05');
  assert.equal(evalIn(`getAttendanceDateKey('ขยะ')`), '');
});

test('เช็คสถานะล้มเหลว → เข้าสถานะ error พร้อมปุ่มลองอีกครั้ง (ไม่ใช่สปินเนอร์)', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  evalIn(`callAPI = async () => ({ success: false, message: 'เชื่อมต่อระบบไม่สำเร็จ' })`);

  const res = await evalIn(`checkTodayStatus(true, false)`);
  assert.equal(res.success, false);
  assert.equal(evalIn('attendanceStatusFailed'), true);
  assert.equal(evalIn('isAttendanceStatusResolved'), false);
  assert.match(ui('#btnIn').html, /เช็คไม่สำเร็จ/);
  assert.match(ui('#btnOut').html, /เช็คไม่สำเร็จ/);
  assert.match(ui('#attendanceHint').html, /ลองอีกครั้ง/);
  assert.equal(ui('#btnIn').prop.disabled, true);
  assert.equal(ui('#btnOut').prop.disabled, true);
});

test('REGRESSION: callback จาก GPS/กล้อง (checkButtonStatus) ต้องไม่ทับ error กลับเป็น "กำลังตรวจสอบ"', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  evalIn(`callAPI = async () => { throw new Error('network down') }`);
  await evalIn(`checkTodayStatus(true, false)`);
  assert.equal(evalIn('attendanceStatusFailed'), true);

  // จำลองสิ่งที่เกิดจริงบนมือถือ: GPS มาถึง / ผู้ใช้ถ่ายรูป → เรียก checkButtonStatus()
  evalIn(`checkButtonStatus()`);
  evalIn(`checkButtonStatus()`);

  assert.match(ui('#attendanceHint').html, /ลองอีกครั้ง/, 'hint ต้องคง error + ปุ่มลองใหม่');
  assert.doesNotMatch(ui('#attendanceHint').html, /กำลังตรวจสอบสถานะเข้างานของวันนี้/, 'ห้ามกลับไปข้อความกำลังตรวจสอบ');
  assert.doesNotMatch(ui('#btnIn').html, /กำลังตรวจสอบ/, 'ปุ่มห้ามกลับไปหมุนค้าง');
});

test('เช็คสถานะสำเร็จ → ปลดปุ่มตามข้อมูลจริงของวันนี้', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  const history = JSON.stringify([
    { date: `${todayThai()} 08:00:00`, status: 'เข้างาน' },
    { date: '01/01/2026 08:00:00', status: 'เข้างาน' },
  ]);
  evalIn(`callAPI = async () => ({ success: true, history: ${history} })`);

  const res = await evalIn(`checkTodayStatus(true, false)`);
  assert.equal(res.success, true);
  assert.equal(evalIn('attendanceStatusFailed'), false);
  assert.equal(evalIn('isAttendanceStatusResolved'), true);
  assert.equal(evalIn('hasCheckedInToday'), true);
  assert.equal(evalIn('hasCheckedOutToday'), false);
  assert.equal(ui('#btnIn').prop.disabled, true, 'เข้างานแล้ว ปุ่มเข้างานต้องปิด');
  assert.equal(ui('#btnOut').prop.disabled, false, 'ยังไม่ออกงาน ปุ่มออกงานต้องเปิด');
});

test('ปุ่มลองอีกครั้ง → เช็คซ้ำแบบ force_fresh และฟื้นจาก error ได้', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  evalIn(`callAPI = async () => { throw new Error('network down') }`);
  await evalIn(`checkTodayStatus(true, false)`);
  assert.equal(evalIn('attendanceStatusFailed'), true);

  evalIn(`__calls = []; callAPI = async (action, payload) => { __calls.push({ action, payload }); return { success: true, history: [] }; }`);
  await evalIn(`retryAttendanceStatus()`);

  const calls = evalIn('JSON.parse(JSON.stringify(__calls))');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'get_history');
  assert.equal(calls[0].payload.force_fresh, true, 'retry ต้องข้าม cache ด้วย force_fresh');
  assert.equal(evalIn('attendanceStatusFailed'), false);
  assert.equal(evalIn('isAttendanceStatusResolved'), true);
  assert.doesNotMatch(ui('#btnIn').html, /เช็คไม่สำเร็จ/);
});

test('REGRESSION: สลับแอปกลับมา — ไม่ throw, เช็คเมื่อจำเป็น และไม่วนตรวจถี่ ๆ', async () => {
  const { evalIn, fireDocument } = loadApp();

  // ก่อนล็อกอิน (หน้า login) — ห้าม throw (บั๊กเดิม: currentView is not defined ทุกครั้งที่สลับแอป)
  assert.doesNotThrow(() => fireDocument('visibilitychange'));

  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  evalIn(`currentView = 'dashboard'`);
  evalIn(`__calls = []; callAPI = async (action, payload) => { __calls.push({ action, payload }); return { success: true, history: [] }; }`);

  // ยังไม่รู้ผล → กลับเข้าแอปต้องเช็ค 1 ครั้ง (แบบไม่บังคับข้าม cache)
  const fired = fireDocument('visibilitychange');
  assert.ok(fired >= 1, 'app.js ต้องลงทะเบียน visibilitychange handler');
  await new Promise((r) => setTimeout(r, 10));
  let calls = evalIn('JSON.parse(JSON.stringify(__calls))');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'get_history');
  assert.ok(!calls[0].payload.force_fresh, 'ห้าม force_fresh ตอนสลับแอป — ให้ใช้ cache ได้');

  // รู้ผลสด ๆ แล้ว → สลับแอปซ้ำกี่รอบก็ห้ามยิงเพิ่ม (แก้อาการวนตรวจซ้ำ)
  fireDocument('visibilitychange');
  fireDocument('visibilitychange');
  await new Promise((r) => setTimeout(r, 10));
  calls = evalIn('JSON.parse(JSON.stringify(__calls))');
  assert.equal(calls.length, 1, 'ผลยังสดอยู่ ห้ามเช็คซ้ำ');

  // ผลเก่าเกิน 60 วิ → ค่อยเช็คใหม่ 1 ครั้ง
  evalIn('lastStatusCheckAt = Date.now() - 61000');
  fireDocument('visibilitychange');
  await new Promise((r) => setTimeout(r, 10));
  calls = evalIn('JSON.parse(JSON.stringify(__calls))');
  assert.equal(calls.length, 2, 'ผลเก่าแล้วต้องรีเฟรช 1 ครั้ง');
});

test('ระหว่างตรวจสอบ: มีตัวเลขนับถอยหลัง และปุ่มใช้สไตล์ตัวอักษรขาว', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  evalIn(`callAPI = () => new Promise(() => {})`); // ค้างไว้เพื่อดูสถานะระหว่างรอ
  evalIn(`checkTodayStatus(true, false)`);
  await new Promise((r) => setTimeout(r, 10));

  assert.match(ui('#attendanceHint').text, /กำลังตรวจสอบสถานะเข้างานของวันนี้.*\(\d+ วิ\)/, 'hint ต้องบอกจำนวนวินาที');
  assert.ok(ui('#btnIn').classes.has('attendance-checking'), 'ปุ่มต้องได้ class ตัวอักษรขาวระหว่างตรวจสอบ');
  assert.ok(ui('#btnOut').classes.has('attendance-checking'));
  evalIn('stopAttendanceCountdown()');
});

test('ล้มเหลว → ลองใหม่อัตโนมัติ 1 รอบ (force_fresh) ก่อนขึ้น error', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  evalIn(`__payloads = []; callAPI = async (a, p) => { __payloads.push(p); throw new Error('server down'); }`);

  const res = await evalIn(`checkTodayStatus(true, false)`);
  assert.equal(res.success, false);
  const payloads = evalIn('JSON.parse(JSON.stringify(__payloads))');
  assert.equal(payloads.length, 2, 'ต้องลองซ้ำอัตโนมัติ 1 ครั้ง (รวมเป็น 2)');
  assert.ok(!payloads[0].force_fresh && payloads[1].force_fresh === true, 'รอบ retry ต้อง force_fresh');
  assert.match(ui('#btnIn').html, /เช็คไม่สำเร็จ/);
  assert.match(ui('#attendanceHint').html, /ลองอีกครั้ง/);
});

test('ลองใหม่อัตโนมัติสำเร็จ → ผู้ใช้ไม่เห็น error เลย', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  const history = JSON.stringify([{ date: `${todayThai()} 08:00:00`, status: 'เข้างาน' }]);
  evalIn(`__n = 0; callAPI = async () => { __n++; if (__n === 1) throw new Error('cold start'); return { success: true, history: ${history} }; }`);

  const res = await evalIn(`checkTodayStatus(true, false)`);
  assert.equal(res.success, true);
  assert.equal(evalIn('__n'), 2);
  assert.equal(evalIn('attendanceStatusFailed'), false);
  assert.equal(evalIn('isAttendanceStatusResolved'), true);
  assert.equal(ui('#btnIn').prop.disabled, true, 'เข้างานแล้วตาม history');
  assert.doesNotMatch(ui('#btnIn').html, /เช็คไม่สำเร็จ/);
});

test('เปิดแอปซ้ำ: แสดงสถานะจาก cache ทันที ไม่ต้องรอเครือข่าย', async () => {
  const { evalIn, ui } = loadApp();
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  const history = JSON.stringify([{ date: `${todayThai()} 08:00:00`, status: 'เข้างาน' }]);
  evalIn(`setCache('get_history', { user_id: 'U001' }, { success: true, history: ${history} })`);
  evalIn(`callAPI = () => new Promise(() => {})`); // เน็ตช้าสุด ๆ — cache ต้องช่วยให้เห็นผลทันที

  evalIn(`checkTodayStatus(true, false)`);
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(evalIn('isAttendanceStatusResolved'), true, 'ต้อง resolve จาก cache ทันที');
  assert.equal(ui('#btnIn').prop.disabled, true, 'สถานะเข้างานแล้วจาก cache');
  assert.equal(ui('#btnOut').prop.disabled, false);
  assert.equal(evalIn('attendanceCountdownTimer'), null, 'ไม่ต้องโชว์นับถอยหลังเมื่อมี cache');
  assert.doesNotMatch(ui('#attendanceHint').text, /กำลังตรวจสอบสถานะเข้างานของวันนี้/);
});

test('ออกงาน: ส่งรูปเพียงฟิลด์เดียว และ retry อัตโนมัติเมื่อ backend กำลังบันทึกอยู่', async () => {
  const { evalIn } = loadApp();
  evalIn(`
    currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' };
    currentCoords = { lat: 17.4, lng: 102.8 };
    currentLocationName = 'อุดรธานี';
    lastCapturedPhoto = 'data:image/jpeg;base64,' + 'O'.repeat(200);
    compressImage = async () => 'data:image/jpeg;base64,' + 'C'.repeat(200);
    resetDashboardState = () => { __resetDashboardCalled = true; };
    __requests = [];
    __resetDashboardCalled = false;
    callAPI = async (action, payload) => {
      __requests.push({ action, payload });
      return __requests.length === 1
        ? { success: false, code: 'ATTENDANCE_BUSY', retry_after_ms: 1 }
        : { success: true };
    };
  `);

  await evalIn(`submitAttendance('ออกงาน')`);
  const requests = evalIn('JSON.parse(JSON.stringify(__requests))');
  const attendanceRequests = requests.filter((request) => request.action === 'save_attendance');
  assert.equal(attendanceRequests.length, 2, 'ต้องลองใหม่หนึ่งครั้งเมื่อมีการเขียนพร้อมกัน');
  assert.ok(attendanceRequests.every((request) => request.payload.selfie_base64 === 'data:image/jpeg;base64,' + 'C'.repeat(200)));
  assert.ok(attendanceRequests.every((request) => !Object.hasOwn(request.payload, 'selfie')), 'ห้ามส่งรูปซ้ำสองฟิลด์');
  assert.equal(evalIn('__resetDashboardCalled'), true, 'retry สำเร็จต้องจบกระบวนการออกงานตามปกติ');
});

test('REGRESSION: POST และ GET fetch ล้มหมด ("Load failed") → ต้อง fallback JSONP โดยตัดรูปออก', async () => {
  const { evalIn } = loadApp();
  // fetch ใน harness reject เสมอ = จำลอง WebKit ตัดทุก fetch (TypeError: Load failed)
  evalIn(`
    __jsonpCalls = [];
    callAPIJsonp = async (action, payload, silent) => {
      __jsonpCalls.push({ action, payload, silent });
      return { success: true };
    };
  `);

  const res = await evalIn(`callAPI('save_attendance', { user_id: 'U001', status: 'ออกงาน', selfie_base64: 'data:image/jpeg;base64,XXXX' }, true)`);
  assert.equal(res.success, true, 'JSONP สำเร็จต้องนับเป็นบันทึกสำเร็จ');

  const calls = evalIn('JSON.parse(JSON.stringify(__jsonpCalls))');
  assert.equal(calls.length, 1, 'fetch ล้มหมดต้องลอง JSONP หนึ่งครั้ง');
  assert.equal(calls[0].action, 'save_attendance');
  assert.equal(calls[0].payload.user_id, 'U001');
  assert.ok(!Object.hasOwn(calls[0].payload, 'selfie_base64'), 'JSONP fallback ห้ามพก base64 รูปใน URL');
});

test('ทุกช่องทางล้มหมด → ข้อความ error ต้องเป็นภาษาไทย ไม่ใช่ error ดิบของเบราว์เซอร์', async () => {
  const { evalIn } = loadApp();
  evalIn(`callAPIJsonp = async () => { throw new Error('Load failed'); }`);

  const res = await evalIn(`callAPI('save_attendance', { user_id: 'U001' }, true)`);
  assert.equal(res.success, false);
  assert.match(res.message, /เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ/, 'ต้องขึ้นข้อความภาษาไทยที่ผู้ใช้เข้าใจได้');
});

test('เวอร์ชัน frontend/backend/index.html ต้องตรงกัน (กันแอปเก่าค้างในเบราว์เซอร์)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', '..');
  const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const gsSrc = fs.readFileSync(path.join(root, 'apps-script.gs'), 'utf8');

  const frontend = appSrc.match(/const CURRENT_VERSION = "([^"]+)"/)[1];
  const backend = gsSrc.match(/const APP_VERSION = "([^"]+)"/)[1];
  assert.equal(frontend, backend, 'CURRENT_VERSION (app.js) ต้องเท่ากับ APP_VERSION (apps-script.gs) ไม่งั้นผู้ใช้จะเจอ reload/แจ้งเตือนเวอร์ชันวนซ้ำ');

  // ทุกหน้า HTML ที่โหลด app.js ต้อง bump ?v= พร้อมกัน — เคยหลุดที่ login.html มาแล้ว
  for (const page of ['index.html', 'login.html']) {
    const htmlSrc = fs.readFileSync(path.join(root, page), 'utf8');
    const tags = [...htmlSrc.matchAll(/src="app\.js\?v=([^"]+)"/g)].map((m) => m[1]);
    assert.ok(tags.length >= 1, `${page} ต้องโหลด app.js ผ่าน ?v=`);
    for (const tag of tags) {
      assert.ok(tag.includes(frontend), `?v= ของ app.js ใน ${page} (${tag}) ต้องมีเลขเวอร์ชัน ${frontend} เพื่อ bust cache เบราว์เซอร์`);
    }
  }
});

test('งบเวลา get_history ทุกชั้นรวมกันต้องไม่เกิน 20 วินาที', () => {
  const { source } = loadApp();

  const getTimeout = Number(source.match(/action === 'get_history' \? (\d+) : 12000/)[1]);
  const getHedge = Number(source.match(/action === 'login' \|\| action === 'get_history' \? (\d+) : 4000/)[1]);
  const jsonpTimeout = Number(source.match(/action === 'get_history' \? (\d+) : \(action === 'login' \? 10000/)[1]);
  const jsonpHedge = Number(source.match(/action === 'login' \|\| action === 'get_history' \? (\d+) : 8000/)[1]);

  const worstCaseMs = (getHedge + getTimeout) + (jsonpHedge + jsonpTimeout);
  assert.ok(
    worstCaseMs <= 20000,
    `worst case ${worstCaseMs}ms เกินเกณฑ์ 20000ms (GET ${getHedge}+${getTimeout}, JSONP ${jsonpHedge}+${jsonpTimeout})`,
  );
  assert.match(source, /let attendanceStatusFailed = false;/, 'ตัวแปรสถานะ error ต้องถูกประกาศ');
});
