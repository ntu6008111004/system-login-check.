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

test('REGRESSION: สลับแอปกลับมา (visibilitychange) ต้องไม่ throw และต้องเช็คสถานะซ้ำเมื่ออยู่หน้าลงเวลา', async () => {
  const { evalIn, fireDocument } = loadApp();

  // ก่อนล็อกอิน (หน้า login) — ห้าม throw (บั๊กเดิม: currentView is not defined ทุกครั้งที่สลับแอป)
  assert.doesNotThrow(() => fireDocument('visibilitychange'));

  // ล็อกอิน + อยู่หน้าลงเวลา → ต้องเรียก get_history แบบ force_fresh อัตโนมัติ
  evalIn(`currentUser = { id: 'U001', name: 'ทดสอบ', company: 'บ.ทดสอบ', role: 'user' }`);
  evalIn(`currentView = 'dashboard'`);
  evalIn(`__calls = []; callAPI = async (action, payload) => { __calls.push({ action, payload }); return { success: true, history: [] }; }`);

  const fired = fireDocument('visibilitychange');
  assert.ok(fired >= 1, 'app.js ต้องลงทะเบียน visibilitychange handler');
  await new Promise((r) => setTimeout(r, 10));

  const calls = evalIn('JSON.parse(JSON.stringify(__calls))');
  assert.equal(calls.length, 1, 'กลับเข้าแอปที่หน้าลงเวลาต้องเช็คสถานะซ้ำ 1 ครั้ง');
  assert.equal(calls[0].action, 'get_history');
  assert.equal(calls[0].payload.force_fresh, true);
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
