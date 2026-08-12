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
  assert.equal(env.lockOps.wait, 1);
  assert.equal(env.lockOps.release, 1);
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
