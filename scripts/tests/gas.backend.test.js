/**
 * เทสต์ backend (apps-script.gs) ด้วย mock ของบริการ GAS
 * ครอบคลุม: cache ของ getUserHistory, การล้าง cache ตอนบันทึกเวลา,
 * และ REGRESSION ที่ saveAttendance ห้ามอ่านทั้งชีท (คอลัมน์ selfie) ใต้ lock
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGas, formatDateLike } = require('./helpers/gas-env');

const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const todayStr = (hhmmss) => `${formatDateLike(now, 'dd/MM/yyyy')} ${hhmmss}`;
const yesterdayStr = (hhmmss) => `${formatDateLike(yesterday, 'dd/MM/yyyy')} ${hhmmss}`;

const BIG_SELFIE = 'S'.repeat(2000); // จำลองรูป base64 ก้อนใหญ่ในชีท

function seededEnv() {
  return loadGas({
    attendanceRows: [
      ['A1', 'U001', yesterdayStr('08:01:00'), 'เข้างาน', 17.4, 102.8, 'map', 'อุดรธานี', BIG_SELFIE, 'Web'],
      ['A2', 'U001', yesterdayStr('17:02:00'), 'ออกงาน', 17.4, 102.8, 'map', 'อุดรธานี', BIG_SELFIE, 'Web'],
      ['A3', 'U002', yesterdayStr('08:03:00'), 'เข้างาน', 17.4, 102.8, 'map', 'อุดรธานี', BIG_SELFIE, 'Web'],
      ['A4', 'U001', todayStr('08:04:00'), 'เข้างาน', 17.4, 102.8, 'map', 'อุดรธานี', BIG_SELFIE, 'Web'],
    ],
  });
}

test('getUserHistory: ครั้งแรกสแกนชีท คืนเฉพาะแถวของ user และเขียน cache', () => {
  const env = seededEnv();
  const res = env.call('getUserHistory', 'U001');

  assert.equal(res.success, true);
  assert.equal(res.history.length, 3);
  assert.ok(res.history.every((h) => ['เข้างาน', 'ออกงาน'].includes(h.status)));
  assert.equal(res.history[0].status, 'เข้างาน', 'เรียงจากแถวล่าสุดขึ้นก่อน');
  assert.ok(env.cacheOps.put.includes('db_history_U001'), 'ต้องเขียน cache key db_history_U001');
});

test('getUserHistory: ครั้งที่สองต้องตอบจาก cache โดยไม่อ่านชีทเพิ่ม', () => {
  const env = seededEnv();
  env.call('getUserHistory', 'U001');
  const readsAfterFirst = env.attendance.calls.getRange.length;

  const res2 = env.call('getUserHistory', 'U001');
  assert.equal(res2.success, true);
  assert.equal(res2.history.length, 3);
  assert.equal(env.attendance.calls.getRange.length, readsAfterFirst, 'cache hit ห้ามอ่านชีทเพิ่ม');
});

test('getUserHistory: force_fresh ข้าม cache และสแกนชีทใหม่ (ผ่าน handleAction ด้วย)', () => {
  const env = seededEnv();
  env.call('getUserHistory', 'U001');
  const readsAfterFirst = env.attendance.calls.getRange.length;

  const res = env.call('handleAction', 'get_history', { user_id: 'U001', force_fresh: true });
  assert.equal(res.success, true);
  assert.ok(env.attendance.calls.getRange.length > readsAfterFirst, 'force_fresh ต้องอ่านชีทจริง');
  assert.ok(typeof res.server_ms === 'number');
});

test('REGRESSION: saveAttendance ห้ามใช้ getDataRange และช่วงอ่านต้องไม่คร่อมคอลัมน์ selfie', () => {
  const env = seededEnv();
  const res = env.call('saveAttendance', {
    user_id: 'U001', status: 'ออกงาน', latitude: 17.4, longitude: 102.8,
    location_name: 'อุดรธานี', selfie_base64: 'data:image/jpeg;base64,TESTPHOTO',
  });

  assert.equal(res.success, true);
  assert.equal(env.attendance.calls.getDataRange, 0, 'ห้ามอ่านทั้งชีท (คอลัมน์ selfie) ใต้ lock');

  // ชีทคอลัมน์: id(1) user_id(2) datetime(3) status(4) ... selfie(9)
  const guardReads = env.attendance.calls.getRange.filter((c) => c.row === 2 && c.numRows > 1);
  assert.ok(guardReads.length >= 1, 'ต้องมีการอ่าน guard ช่วงแถวข้อมูล');
  for (const read of guardReads) {
    assert.equal(read.col, 2, 'เริ่มอ่านที่คอลัมน์ user_id');
    assert.equal(read.numCols, 3, 'อ่านแค่ user_id/datetime/status');
    assert.ok(read.col + read.numCols - 1 < 9, 'ช่วงอ่านต้องไม่ถึงคอลัมน์ selfie');
  }
  assert.equal(env.lockOps.try, 1);
  assert.equal(env.lockOps.release, 1);
});

test('saveAttendance: ถ้า lock ไม่ว่างต้องตอบให้ client retry โดยไม่เขียนแถว', () => {
  const env = loadGas({ lockAvailable: false });
  const res = env.call('saveAttendance', {
    user_id: 'U009', status: 'เข้างาน', latitude: 17.4, longitude: 102.8,
    location_name: 'อุดรธานี', selfie_base64: 'data:image/jpeg;base64,TESTPHOTO',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(res)), {
    success: false,
    code: 'ATTENDANCE_BUSY',
    retry_after_ms: 1200,
    message: 'ระบบกำลังบันทึกการลงเวลาหลายรายการ กรุณาลองใหม่อีกครั้ง',
  });
  assert.equal(env.attendance.calls.setValues.length, 0);
  assert.equal(env.lockOps.try, 1);
  assert.equal(env.lockOps.release, 0, 'ห้าม release lock ที่ยังไม่ได้รับ');
});

test('REGRESSION: grid ว่างที่ Google ขยายเผื่อ ต้องถูกตัดทิ้งอัตโนมัติหลังบันทึกเวลา', () => {
  const env = seededEnv();
  // จำลองไฟล์ที่ Google ขยาย grid เผื่อไว้ 5,000 แถวว่าง (อาการก่อนไฟล์ DB ตัวแรกพัง)
  env.attendance.sheet.__extraGridRows = 5000;

  const res = env.call('saveAttendance', {
    user_id: 'U002', status: 'เข้างาน',
    latitude: 17.4, longitude: 102.8, location_name: 'อุดรธานี',
    selfie_base64: 'S'.repeat(500),
  });
  assert.equal(res.success, true);
  assert.ok(env.attendance.calls.deleteRows.length >= 1, 'ต้องเรียก deleteRows เก็บกวาด grid');
  assert.ok(env.attendance.sheet.getMaxRows() <= env.attendance.sheet.getLastRow() + 100 + 2000,
    'grid หลังเก็บกวาดต้องไม่บวมเกินเกณฑ์');
});

test('trimSheetGrid: grid ไม่บวมต้องไม่แตะชีทเลย (ไม่เสียเวลา request ปกติ)', () => {
  const env = seededEnv();
  env.attendance.sheet.__extraGridRows = 50; // เผื่อนิดหน่อย ยังไม่ถึงเกณฑ์
  env.call('trimSheetGrid', env.attendance.sheet, 2000);
  assert.equal(env.attendance.calls.deleteRows.length, 0, 'ต่ำกว่าเกณฑ์ห้ามลบ');
});

test('sanitizeLogData: ห้ามเก็บภาพหรือรหัสผ่านลง SYS_LOG', () => {
  const env = seededEnv();
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(50000);
  const safe = env.call('sanitizeLogData', {
    user_id: 'U001',
    selfie_base64: photo,
    selfie: photo,
    password: 'secret',
    note: 'x'.repeat(2000),
  });
  const result = JSON.parse(JSON.stringify(safe));

  assert.deepEqual(result, {
    user_id: 'U001',
    selfie_base64_omitted_chars: photo.length,
    selfie_omitted_chars: photo.length,
    password_omitted_chars: 6,
    note: 'x'.repeat(1000),
  });
  assert.doesNotMatch(JSON.stringify(result), /data:image|secret/);
});

test('saveAttendance: บันทึกสำเร็จ → เพิ่มแถวถูกต้อง + ล้าง cache ประวัติ + bump data version', () => {
  const env = seededEnv();
  env.call('getUserHistory', 'U001'); // ให้มี cache ค้างไว้ก่อน
  assert.ok(env.cacheStore.has('db_history_U001'));

  const res = env.call('saveAttendance', {
    user_id: 'U001', status: 'ออกงาน', latitude: 17.4, longitude: 102.8,
    location_name: 'อุดรธานี', selfie_base64: 'data:image/jpeg;base64,TESTPHOTO',
  });
  assert.equal(res.success, true);

  const appended = env.attendance.calls.setValues.at(-1).values[0];
  assert.equal(appended[1], 'U001');
  assert.equal(appended[3], 'ออกงาน');
  assert.match(appended[0], /^A\d+/);
  assert.ok(env.cacheOps.removeAll.flat().includes('db_history_U001'), 'บันทึกแล้วต้องล้าง cache ประวัติของ user');
  assert.equal(env.props.get('data_version_attendance'), '2');

  // วงจรครบ: หลังบันทึก getUserHistory ต้องเห็นรายการใหม่ (cache ถูกล้างแล้วจริง)
  const fresh = env.call('getUserHistory', 'U001');
  assert.equal(fresh.history.length, 4);
  assert.equal(fresh.history[0].status, 'ออกงาน');
});

test('saveAttendance: กันลำดับผิดฝั่ง server ยังทำงานเหมือนเดิม', () => {
  const env = seededEnv();

  // U001 เข้างานวันนี้แล้ว → ขอ "เข้างาน" ซ้ำต้องโดนปฏิเสธพร้อมบอกสถานะที่ถูก
  const dupIn = env.call('saveAttendance', { user_id: 'U001', status: 'เข้างาน', latitude: 1, longitude: 1, location_name: 'x', selfie: 'p' });
  assert.equal(dupIn.success, false);
  assert.equal(dupIn.code, 'ATTENDANCE_STATUS_MISMATCH');
  assert.equal(dupIn.expected_status, 'ออกงาน');

  // U002 วันนี้ยังไม่มีรายการ → เข้างานได้ปกติ
  const okIn = env.call('saveAttendance', { user_id: 'U002', status: 'เข้างาน', latitude: 1, longitude: 1, location_name: 'x', selfie: 'p' });
  assert.equal(okIn.success, true);

  // สถานะที่ไม่รู้จักต้องถูกปฏิเสธ
  const bad = env.call('saveAttendance', { user_id: 'U002', status: 'พักเที่ยง', latitude: 1, longitude: 1, location_name: 'x', selfie: 'p' });
  assert.equal(bad.success, false);
});

test('REGRESSION: เซลล์ datetime ที่เป็นค่าวันที่จริง ต้องคืนเวลาออกมาครบ (เคยโดน getDisplayValues ตัดทิ้ง)', () => {
  // ชีทจริงเก็บ datetime เป็นค่าวันที่ ไม่ใช่ข้อความ — ถ้าเซลล์ถูกตั้งรูปแบบเป็น "วันที่ล้วน"
  // getDisplayValues() จะคืนแค่ "18/8/2026" ทำให้เวลาหายและหน้าจอโชว์ 00:00
  const stamp = new Date(2026, 7, 18, 8, 58, 7); // 18/08/2026 08:58:07 เวลาท้องถิ่น
  const env = loadGas({
    attendanceRows: [
      ['A1', 'U001', stamp, 'เข้างาน', 17.4, 102.8, 'map', 'อุดรธานี', BIG_SELFIE, 'Web'],
    ],
  });

  const res = env.call('getUserHistory', 'U001');
  assert.equal(res.success, true);
  assert.equal(res.history.length, 1);
  assert.equal(res.history[0].date, '18/08/2026 08:58:07', 'ต้องได้ dd/MM/yyyy HH:mm:ss ครบ ไม่ใช่วันที่ล้วน');
});

test('normalizeDateTimeCell: รองรับทั้ง Date, ข้อความเดิม และค่าว่าง', () => {
  const env = loadGas({ attendanceRows: [] });
  const call = (v) => env.context.normalizeDateTimeCell(v);

  assert.equal(call(new Date(2026, 7, 18, 8, 58, 7)), '18/08/2026 08:58:07');
  assert.equal(call('19/08/2026 08:58:07'), '19/08/2026 08:58:07', 'ข้อความเดิมต้องผ่านไปเหมือนเดิม');
  assert.equal(call('  18/8/2026  '), '18/8/2026', 'ตัดช่องว่างหัวท้าย');
  assert.equal(call(''), '');
  assert.equal(call(null), '');
  assert.equal(call(undefined), '');
});

test('dateToIsoDate: อ่านได้ทั้ง Date, เลขเติมศูนย์ และเลขไม่เติมศูนย์ (ตัวกรองวันที่ฝั่งแอดมิน)', () => {
  const env = loadGas({ attendanceRows: [] });
  const call = (v) => env.context.dateToIsoDate(v);

  assert.equal(call(new Date(2026, 7, 18, 8, 58, 7)), '2026-08-18');
  assert.equal(call('19/08/2026 08:58:07'), '2026-08-19');
  assert.equal(call('18/8/2026'), '2026-08-18', 'เลขไม่เติมศูนย์ต้องอ่านออก ไม่งั้นตัวกรองวันที่พัง');
  assert.equal(call('5/1/2026 07:00:00'), '2026-01-05');
});

test('REGRESSION: guard กันลงเวลาซ้ำต้องทำงานแม้ datetime เป็นค่าวันที่จริง', () => {
  // เดิม guard เทียบ prefix จากข้อความที่ชีทแสดง ถ้าเซลล์เป็นค่าวันที่จะเทียบไม่ติด
  // แล้วปล่อยให้กด "เข้างาน" ซ้ำได้ทั้งที่ลงไปแล้ว
  const todayStamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 4, 0);
  const env = loadGas({
    attendanceRows: [
      ['A1', 'U001', todayStamp, 'เข้างาน', 17.4, 102.8, 'map', 'อุดรธานี', BIG_SELFIE, 'Web'],
    ],
  });

  const res = env.call('saveAttendance', {
    user_id: 'U001', status: 'เข้างาน', latitude: 17.4, longitude: 102.8,
    location_name: 'อุดรธานี', selfie_base64: 'data:image/jpeg;base64,TESTPHOTO',
  });

  assert.equal(res.success, false, 'ต้องกันการเข้างานซ้ำของวันเดียวกัน');
});
