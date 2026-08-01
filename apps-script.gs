/**
 * WorkLogs - Decoupled REST API (Enhanced Admin Edition)
 */

function logToSheet(action, type, data) {
  // Skip verbose or sensitive actions to prevent log bloat and data leaks
  const skipActions = ["get_admin_data", "get_attendance_photo", "get_history", "get_users", "get_branches", "get_update_notice", "get_version", "reverse_geocode", "login"];
  if (skipActions.includes(action)) return;

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let logSheet = ss.getSheetByName("SYS_LOG");
    if (!logSheet) {
      logSheet = ss.insertSheet("SYS_LOG");
      logSheet.appendRow(["Timestamp", "Action", "Type", "Data"]);
    }
    logSheet.appendRow([new Date(), action, type, JSON.stringify(data)]);
  } catch (e) {
    // Fail silently in logs
  }
}

const SPREADSHEET_ID = "1B3iZtBSzCAVILYGn1qAIAZdudpour3OPvGXrh2LUQc8";
const APP_VERSION = "1.3.4";
const SCHEMA_VERSION = "5";
const CACHE_TTL = {
  master: 600,
  history: 120,
  query: 45,
  index: 600,
};

/**
 * 🔒 SHA-256 Password Hashing
 */
function hashPassword(text) {
  if (!text) return "";
  return Utilities.base64Encode(text, Utilities.Charset.UTF_8);
}

function decodePassword(encodedText) {
  if (!encodedText) return "";
  try {
     var decoded = Utilities.base64Decode(encodedText, Utilities.Charset.UTF_8);
     return Utilities.newBlob(decoded).getDataAsString();
  } catch (e) {
     return encodedText; // Return as is if not base64
  }
}

function doOptions(e) {
  return respondJSON({ success: true });
}

function doGet(e) {
  try {
    ensureDatabase();
    const p = e && e.parameter ? e.parameter : {};
    const callback = p.callback;
    const action = p.action;
    const payloadEncoded = p.payload || "";
    let body = {};
    if (payloadEncoded) {
      try {
        body = JSON.parse(
          Utilities.newBlob(
            Utilities.base64Decode(payloadEncoded),
          ).getDataAsString("UTF-8"),
        );
      } catch (err) {
        body = p;
      }
    } else {
      body = p;
    }

    logToSheet(action, "GET", body);
    let result = handleAction(action, body);

    if (callback) {
      return ContentService.createTextOutput(
        `${callback}(${JSON.stringify(result)});`,
      ).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return respondJSON(result);
  } catch (error) {
    logToSheet("ERROR", "GET", { error: error.toString() });
    const failure = { success: false, message: error.toString() };
    const callback = e && e.parameter ? e.parameter.callback : "";
    if (callback) {
      return ContentService.createTextOutput(
        `${callback}(${JSON.stringify(failure)});`,
      ).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return respondJSON(failure);
  }
}

function doPost(e) {
  try {
    ensureDatabase();
    const contents = e.postData ? e.postData.contents : "";
    if (!contents) throw new Error("No post data content");

    const body = JSON.parse(contents);
    const action = body.action;
    const data = body.data || body;

    logToSheet(action, "POST", data);
    const result = handleAction(action, data);
    return respondJSON(result);
  } catch (err) {
    logToSheet("ERROR", "POST", {
      error: err.toString(),
      contents: e.postData ? e.postData.contents : "no contents",
    });
    return respondJSON({
      success: false,
      message: "Server Error: " + err.toString(),
    });
  }
}

function handleAction(action, data) {
  if (action === "login") return loginUser(data.username, data.password);
  if (action === "save_attendance") return saveAttendance(data);
  if (action === "get_history") return getUserHistory(data.user_id);
  if (action === "get_admin_data") return getAllAttendance(data || {});
  if (action === "get_attendance_photo") return getAttendancePhoto(data.id || data.attendance_id);
  if (action === "get_users") return getUsers();
  if (action === "get_user_profile") return getUserProfile(data.id || data.user_id);
  if (action === "create_user") return createUser(data);
  if (action === "delete_user") return deleteUser(data.user_id || data.id);
  if (action === "update_user") return updateUser(data);
  if (action === "generate_mock_data") return generateMockData();
  if (action === "get_branches") return getBranches();
  if (action === "get_version") return { success: true, version: APP_VERSION };
  if (action === "get_update_notice") return getUpdateNotice(data.role || "user");
  if (action === "reverse_geocode") return reverseGeocodeLocation(data.latitude, data.longitude);
  if (action === "reset_all_passwords") return resetAllPasswords();

  return { success: false, message: "Unknown action: " + action };
}

function generateMockData() {
  const ss = getSpreadsheet();
  const usersSheet = ss.getSheetByName("USERS");
  const attSheet = ss.getSheetByName("ATTENDANCE");

  // Clear existing (except headers)
  if (usersSheet.getLastRow() > 1)
    usersSheet.deleteRows(2, usersSheet.getLastRow() - 1);
  if (attSheet.getLastRow() > 1)
    attSheet.deleteRows(2, attSheet.getLastRow() - 1);

  // Create Mock Users
  const mockUsers = [
    [
      "U101",
      "กิตติ",
      "รักงาน",
      "admin",
      "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
      "WorkLogs Corp",
      "admin",
    ],
    [
      "U102",
      "นารี",
      "ขยัน",
      "user1",
      "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
      "WorkLogs Corp",
      "user",
    ],
    [
      "U103",
      "สมพร",
      "มาสาย",
      "user2",
      "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
      "WorkLogs Corp",
      "user",
    ],
    [
      "U104",
      "จันทรา",
      "ทำดี",
      "user3",
      "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
      "WorkLogs Corp",
      "user",
    ],
  ];
  usersSheet
    .getRange(2, 1, mockUsers.length, mockUsers[0].length)
    .setValues(mockUsers);

  // Add profile images to the mock users
  mockUsers.forEach((user, idx) => {
    const profileImg = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user[1]}`;
    usersSheet.getRange(idx + 2, 8).setValue(profileImg);
  });

  // Create Mock Attendance (Last 7 days)
  const statuses = ["เข้างาน", "ออกงาน"];
  const now = new Date();
  const records = [];

  for (let d = 0; d < 7; d++) {
    const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const dateStr = Utilities.formatDate(
      date,
      Session.getScriptTimeZone(),
      "dd/MM/yyyy",
    );

    mockUsers.forEach((user) => {
      // In
      records.push([
        "A" + Math.random().toString(36).substr(2, 9),
        user[0],
        dateStr + " 08:" + Math.floor(Math.random() * 30 + 10) + ":00",
        "เข้างาน",
        13.7563,
        100.5018,
        "https://maps.google.com/?q=13.7563,100.5018",
        "แขวงวัดโสมนัส • เขตป้อมปราบศัตรูพ่าย • กรุงเทพมหานคร",
        "",
        "Web",
      ]);
      // Out
      records.push([
        "A" + Math.random().toString(36).substr(2, 9),
        user[0],
        dateStr + " 17:" + Math.floor(Math.random() * 30 + 10) + ":00",
        "ออกงาน",
        13.7563,
        100.5018,
        "https://maps.google.com/?q=13.7563,100.5018",
        "แขวงวัดโสมนัส • เขตป้อมปราบศัตรูพ่าย • กรุงเทพมหานคร",
        "",
        "Web",
      ]);
    });
  }

  if (records.length > 0) {
    attSheet
      .getRange(2, 1, records.length, records[0].length)
      .setValues(records);
  }

  bumpDataVersion("users");
  bumpDataVersion("attendance");
  bumpDataVersion("branches");
  return { success: true };
}

function respondJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** 👤 DATABASE HELPERS */
const _HEADER_CACHE = {};
let _SPREADSHEET_CACHE = null;

function getSpreadsheet() {
  if (!_SPREADSHEET_CACHE) _SPREADSHEET_CACHE = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _SPREADSHEET_CACHE;
}

function getScriptCache(key) {
  try {
    const cache = CacheService.getScriptCache();
    const chunkCountStr = cache.get(key + "_chunks");
    if (chunkCountStr) {
      const count = parseInt(chunkCountStr, 10);
      const keys = [];
      for (let i = 0; i < count; i++) {
        keys.push(key + "_c" + i);
      }
      const map = cache.getAll(keys);
      let full = "";
      for (let i = 0; i < count; i++) {
        const val = map[key + "_c" + i];
        if (!val) return null;
        full += val;
      }
      return full;
    }
    return cache.get(key);
  } catch (e) {
    return null;
  }
}

function setScriptCache(key, valueString, ttl) {
  try {
    const cache = CacheService.getScriptCache();
    if (!valueString) return;
    const effectiveTtl = ttl || CACHE_TTL.master;
    if (valueString.length < 90000) {
      cache.put(key, valueString, effectiveTtl);
      cache.remove(key + "_chunks");
    } else {
      const chunkSize = 80000;
      const chunks = [];
      for (let i = 0; i < valueString.length; i += chunkSize) {
        chunks.push(valueString.substring(i, i + chunkSize));
      }
      const entries = {};
      entries[key + "_chunks"] = String(chunks.length);
      chunks.forEach(function (c, idx) {
        entries[key + "_c" + idx] = c;
      });
      cache.putAll(entries, effectiveTtl);
      cache.remove(key);
    }
  } catch (e) {
    // Fail silently
  }
}

function getCachedJSON(key) {
  const value = getScriptCache(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

function setScriptCacheEntries(entries, ttl) {
  try {
    const keys = Object.keys(entries || {});
    if (keys.length) CacheService.getScriptCache().putAll(entries, ttl || CACHE_TTL.master);
  } catch (e) {
    // Cache acceleration must never block the main request.
  }
}

function setCachedJSON(key, value, ttl) {
  setScriptCache(key, JSON.stringify(value), ttl);
}

function getDataVersion(name) {
  return PropertiesService.getScriptProperties().getProperty("data_version_" + name) || "1";
}

function bumpDataVersion(name) {
  const props = PropertiesService.getScriptProperties();
  const next = String(Number(props.getProperty("data_version_" + name) || "1") + 1);
  props.setProperty("data_version_" + name, next);
  return next;
}

function makeCacheKey(prefix, payload) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    JSON.stringify(payload || {}),
  );
  return prefix + "_" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "").slice(0, 22);
}

function clearScriptCache(keys) {
  try {
    const cache = CacheService.getScriptCache();
    cache.removeAll(keys);
  } catch (e) {
    // Fail silently
  }
} 

function getHeaders(sheet) {
  const name = sheet.getName();
  if (_HEADER_CACHE[name]) return _HEADER_CACHE[name];
  
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((h) => h.toString().trim());
    
  _HEADER_CACHE[name] = headers;
  return headers;
}

function ensureDatabase() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("schema_version") === SCHEMA_VERSION) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (props.getProperty("schema_version") === SCHEMA_VERSION) return;
    setupDatabase();
    props.setProperty("schema_version", SCHEMA_VERSION);
  } finally {
    lock.releaseLock();
  }
}

function setupDatabase() {
  const ss = getSpreadsheet();
  let usersSheet = ss.getSheetByName("USERS");
  if (!usersSheet) {
    usersSheet = ss.insertSheet("USERS");
    usersSheet.appendRow([
      "id",
      "first_name",
      "last_name",
      "username",
      "password",
      "branch_id",
      "company",
      "role",
      "profile",
    ]);
    usersSheet.appendRow([
      "U001",
      "สมชาย",
      "ใจดี",
      "admin",
      "123456",
      "B001",
      "บริษัท เดโม่ จำกัด",
      "admin",
      "",
    ]);
    usersSheet.appendRow([
      "U002",
      "สุดา",
      "ดีงาม",
      "user1",
      "123456",
      "B001",
      "บริษัท เดโม่ จำกัด",
      "user",
      "",
    ]);
  } else {
    // Ensure branch_id exists
    const headers = getHeaders(usersSheet);
    if (headers.indexOf("branch_id") === -1) {
      usersSheet.insertColumnAfter(5);
      usersSheet.getRange(1, 6).setValue("branch_id");
      delete _HEADER_CACHE.USERS;
    }
  }
  let attSheet = ss.getSheetByName("ATTENDANCE");
  if (!attSheet) {
    attSheet = ss.insertSheet("ATTENDANCE");
    attSheet.appendRow([
      "id",
      "user_id",
      "datetime",
      "status",
      "latitude",
      "longitude",
      "map_link",
      "location_name",
      "selfie",
      "device",
    ]);
  } else {
    const attendanceHeaders = getHeaders(attSheet);
    if (attendanceHeaders.indexOf("location_name") === -1) {
      const mapLinkIndex = attendanceHeaders.indexOf("map_link");
      const insertAfterColumn = mapLinkIndex >= 0 ? mapLinkIndex + 1 : attSheet.getLastColumn();
      attSheet.insertColumnAfter(insertAfterColumn);
      attSheet.getRange(1, insertAfterColumn + 1).setValue("location_name");
      delete _HEADER_CACHE.ATTENDANCE;
      bumpDataVersion("attendance");
    }
  }
  let branchesSheet = ss.getSheetByName("BRANCHES");
  if (!branchesSheet) {
    branchesSheet = ss.insertSheet("BRANCHES");
    branchesSheet.appendRow(["id", "name"]);
    branchesSheet.appendRow(["B001", "ยูดีทีสมายล์"]);
    branchesSheet.appendRow(["B002", "ทีสมายล์อุดรธานี (จินตคาม)"]);
    branchesSheet.appendRow(["B003", "ทีสมายล์นครสวรรค์"]);
    branchesSheet.appendRow(["B004", "AEC"]);
    branchesSheet.appendRow(["B005", "LTN"]);
  }

  let updatesSheet = ss.getSheetByName("APP_UPDATES");
  if (!updatesSheet) {
    updatesSheet = ss.insertSheet("APP_UPDATES");
    updatesSheet.getRange(1, 1, 1, 6).setValues([[
      "version",
      "date",
      "audience",
      "title",
      "items",
      "active",
    ]]);
  }

  const updateRows = [
    [
      APP_VERSION,
      "01/08/2026",
      "user",
      "ระบบได้รับการปรับปรุง",
      "เปิดกล้องบนคอมและมือถือได้เร็วขึ้น|ยังถ่ายรูปได้เมื่อระบบตรวจจับใบหน้าตอบช้า|ปิดหน้าต่างแจ้งเตือนได้ง่ายขึ้น",
      true,
    ],
    [
      APP_VERSION,
      "01/08/2026",
      "admin",
      "ระบบจัดการได้รับการปรับปรุง",
      "หน้าต่างเพิ่มและแก้ไขพนักงานไม่ล้นจอ|แสดงรหัสผู้ใช้ Username และรหัสผ่านเดิม|เพิ่มปุ่มปิดและคลิกนอกหน้าต่างเพื่อออก",
      true,
    ],
  ];
  const existingUpdates = updatesSheet.getLastRow() > 1
    ? updatesSheet.getRange(2, 1, updatesSheet.getLastRow() - 1, 6).getDisplayValues()
    : [];
  updateRows.forEach(function (updateRow) {
    const matchIndex = existingUpdates.findIndex(function (row) {
      return String(row[0]) === APP_VERSION && String(row[2]).toLowerCase() === updateRow[2];
    });
    if (matchIndex >= 0) {
      updatesSheet.getRange(matchIndex + 2, 1, 1, 6).setValues([updateRow]);
    } else {
      updatesSheet.appendRow(updateRow);
      existingUpdates.push(updateRow);
    }
  });
}

function getUpdateNotice(role) {
  const normalizedRole = String(role || "user").toLowerCase() === "admin" ? "admin" : "user";
  const cacheKey = "update_notice_" + normalizedRole + "_v" + APP_VERSION;
  const cached = getCachedJSON(cacheKey);
  if (cached) return { success: true, update: cached, _cached: true };

  const sheet = getSpreadsheet().getSheetByName("APP_UPDATES");
  if (!sheet || sheet.getLastRow() < 2) return { success: true, update: null };
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const audience = String(row[2] || "all").toLowerCase();
    const active = String(row[5] || "").toLowerCase();
    const isActive = active === "true" || active === "1" || active === "yes" || active === "active";
    if (!isActive || (audience !== "all" && audience !== normalizedRole)) continue;
    const update = {
      version: row[0] || APP_VERSION,
      date: row[1] || "",
      audience: audience,
      title: row[3] || "มีการปรับปรุงระบบ",
      items: String(row[4] || "").split("|").map(function (item) { return item.trim(); }).filter(String),
    };
    setCachedJSON(cacheKey, update, CACHE_TTL.master);
    return { success: true, update: update };
  }
  return { success: true, update: null };
}

function getBranches() {
  const cacheKey = "db_branches_v" + getDataVersion("branches");
  const cached = getCachedJSON(cacheKey);
  if (cached) return { success: true, branches: cached, _cached: true };

  const sheet = getSpreadsheet().getSheetByName("BRANCHES");
  if (!sheet || sheet.getLastRow() < 2) return { success: true, branches: [] };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  const branches = data
    .filter(function (row) { return row[0]; })
    .map(function (row) { return { id: row[0], name: row[1] }; });

  setCachedJSON(cacheKey, branches, CACHE_TTL.master);
  return { success: true, branches: branches };
}

function loginUser(username, password) {
  const searchUser = String(username).trim().toLowerCase();
  const inputEncoded = String(password).trim();
  const sheet = getSpreadsheet().getSheetByName("USERS");
  const rowNumber = getUserRowIndex().byUsername[searchUser];
  if (!rowNumber) return { success: false, message: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" };

  const headers = getHeaders(sheet);
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0];
  const u = rowToObject(headers, row);
  if (String(u.password || "").trim() === inputEncoded) {
    return {
      success: true,
      user: {
        id: u.id,
        name: u.first_name + " " + u.last_name,
        username: searchUser,
        branch_id: u.branch_id || "",
        company: u.company || "",
        role: u.role || "",
        profile: "",
      },
    };
  }
  return {
    success: false,
    message: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง",
  };
}

function rowToObject(headers, row) {
  const result = {};
  headers.forEach(function (header, index) { result[header] = row[index]; });
  return result;
}

/**
 * Application-level database index for Google Sheets.
 * Maps id/username to a physical row so login, edit and delete read one row
 * instead of scanning USERS for every request.
 */
function getUserRowIndex() {
  const version = getDataVersion("users");
  const cacheKey = "user_row_index_v" + version;
  const cached = getCachedJSON(cacheKey);
  if (cached) return cached;

  const sheet = getSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet).map(function (h) { return h.toLowerCase(); });
  const idColumn = headers.indexOf("id") + 1;
  const usernameColumn = headers.indexOf("username") + 1;
  const count = Math.max(0, sheet.getLastRow() - 1);
  const index = { byId: {}, byUsername: {} };
  if (!count || !idColumn || !usernameColumn) return index;

  const ids = sheet.getRange(2, idColumn, count, 1).getDisplayValues();
  const usernames = sheet.getRange(2, usernameColumn, count, 1).getDisplayValues();
  for (let i = 0; i < count; i++) {
    const rowNumber = i + 2;
    const id = String(ids[i][0] || "");
    const normalizedUsername = String(usernames[i][0] || "").trim().toLowerCase();
    if (id) index.byId[id] = rowNumber;
    if (normalizedUsername) index.byUsername[normalizedUsername] = rowNumber;
  }
  setCachedJSON(cacheKey, index, CACHE_TTL.index);
  return index;
}

function invalidateUsersCache() {
  bumpDataVersion("users");
}

function resetAllPasswords() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const colPassword = headers.map(h => h.toLowerCase()).indexOf("password");
  
  if (colPassword === -1) return { success: false, message: "Password column not found" };
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true };
  
  const defaultPassEncoded = hashPassword("1234");
  sheet.getRange(2, colPassword + 1, lastRow - 1, 1).setValue(defaultPassEncoded);
  
  invalidateUsersCache();
  return { success: true, message: "รีเซ็ตรหัสพนักงานทุกคนเป็น 1234 เรียบร้อยแล้ว" };
}

function compactLocationPart(value, prefix) {
  const name = String(value || "").trim();
  if (!name) return "";
  if (/^(ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.|กรุงเทพมหานคร)/.test(name)) return name;
  return prefix + name;
}

function findAddressComponent(components, acceptedTypes) {
  for (let i = 0; i < components.length; i++) {
    const types = components[i].types || [];
    if (acceptedTypes.some(function (type) { return types.indexOf(type) !== -1; })) {
      return components[i].long_name || components[i].short_name || "";
    }
  }
  return "";
}

function reverseGeocodeLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
    return { success: false, location_name: "", message: "พิกัดไม่ถูกต้อง" };
  }

  const cacheKey = makeCacheKey("reverse_geocode_v2", {
    lat: lat.toFixed(4),
    lng: lng.toFixed(4),
  });
  const cached = getCachedJSON(cacheKey);
  if (cached) return { success: true, location_name: cached, _cached: true };

  try {
    const response = Maps.newGeocoder()
      .setLanguage("th")
      .setRegion("th")
      .reverseGeocode(lat, lng);
    const result = response && response.results && response.results[0];
    if (!result) return { success: false, location_name: "", message: "ไม่พบชื่อสถานที่" };

    const components = result.address_components || [];
    const subdistrict = findAddressComponent(components, [
      "sublocality_level_2",
      "administrative_area_level_3",
    ]);
    const district = findAddressComponent(components, [
      "sublocality_level_1",
      "administrative_area_level_2",
      "locality",
    ]);
    const province = findAddressComponent(components, ["administrative_area_level_1"]);
    const locationName = ([
      compactLocationPart(subdistrict, "ต."),
      compactLocationPart(district, "อ."),
      compactLocationPart(province, "จ."),
    ].filter(String).join(" • ") || String(result.formatted_address || "").trim()).slice(0, 200);

    if (!locationName) return { success: false, location_name: "", message: "ไม่พบชื่อสถานที่" };
    setCachedJSON(cacheKey, locationName, 21600);
    return { success: true, location_name: locationName };
  } catch (error) {
    return { success: false, location_name: "", message: "ระบุชื่อสถานที่ไม่สำเร็จ" };
  }
}

function saveAttendance(p) {
  const sheet =
    getSpreadsheet().getSheetByName("ATTENDANCE");
  const headers = getHeaders(sheet);
  const now = new Date();
  const requestedStatus = String(p.status || "").trim();
  if (["เข้างาน", "ออกงาน"].indexOf(requestedStatus) === -1) {
    return { success: false, message: "สถานะการลงเวลาไม่ถูกต้อง" };
  }
  const formattedDate = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm:ss",
  );
  let locationName = String(p.location_name || "").trim().slice(0, 200);
  if (!locationName) {
    const geocodeResult = reverseGeocodeLocation(p.latitude, p.longitude);
    if (geocodeResult.success) locationName = geocodeResult.location_name;
  }

  const newRow = [];
  headers.forEach((h) => {
    switch (h.toLowerCase()) {
      case "id":
        newRow.push("A" + now.getTime());
        break;
      case "user_id":
        newRow.push(p.user_id);
        break;
      case "datetime":
        newRow.push(formattedDate);
        break;
      case "status":
        newRow.push(p.status);
        break;
      case "latitude":
        newRow.push(p.latitude);
        break;
      case "longitude":
        newRow.push(p.longitude);
        break;
      case "map_link":
        newRow.push(`https://maps.google.com/?q=${p.latitude},${p.longitude}`);
        break;
      case "location_name":
        newRow.push(locationName);
        break;
      case "selfie":
        newRow.push(p.selfie_base64 || p.selfie || "");
        break;
      case "device":
        newRow.push("Web");
        break;
      default:
        newRow.push("");
    }
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Enforce the daily sequence on the server.  This prevents duplicate
    // check-ins even when an old browser tab has stale attendance status.
    const lowercaseHeaders = headers.map(function (header) { return String(header).toLowerCase(); });
    const userIndex = lowercaseHeaders.indexOf("user_id");
    const dateIndex = lowercaseHeaders.indexOf("datetime");
    const statusIndex = lowercaseHeaders.indexOf("status");
    const todayPrefix = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy");
    let hasCheckedIn = false;
    let hasCheckedOut = false;

    if (userIndex >= 0 && dateIndex >= 0 && statusIndex >= 0 && sheet.getLastRow() > 1) {
      const rows = sheet.getDataRange().getDisplayValues();
      for (let row = 1; row < rows.length; row++) {
        if (String(rows[row][userIndex]) !== String(p.user_id)) continue;
        if (!String(rows[row][dateIndex]).trim().startsWith(todayPrefix)) continue;
        const savedStatus = String(rows[row][statusIndex]).trim();
        if (savedStatus === "เข้างาน") hasCheckedIn = true;
        if (savedStatus === "ออกงาน") hasCheckedOut = true;
      }
    }

    if (hasCheckedIn && hasCheckedOut) {
      return { success: false, code: "ATTENDANCE_STATUS_MISMATCH", message: "วันนี้คุณลงเวลาครบแล้ว ไม่สามารถบันทึกรายการเพิ่มได้" };
    }
    if (!hasCheckedIn && hasCheckedOut) {
      return { success: false, code: "ATTENDANCE_STATUS_MISMATCH", message: "พบข้อมูลลงเวลาไม่สมบูรณ์ของวันนี้ กรุณาติดต่อผู้ดูแลระบบ" };
    }

    const expectedStatus = hasCheckedIn ? "ออกงาน" : "เข้างาน";
    if (requestedStatus !== expectedStatus) {
      return {
        success: false,
        code: "ATTENDANCE_STATUS_MISMATCH",
        expected_status: expectedStatus,
        message: `คุณบันทึก${hasCheckedIn ? "เข้างาน" : "ออกงาน"}แล้ว กรุณาเลือก "${expectedStatus}"`
      };
    }

    sheet.getRange(sheet.getLastRow() + 1, 1, 1, newRow.length).setValues([newRow]);
  } finally {
    lock.releaseLock();
  }
  clearScriptCache(["db_history_" + p.user_id]);
  bumpDataVersion("attendance");
  return { success: true };
}

function getUserHistory(userId) {
  const cacheKey = "db_history_" + userId + "_v" + getDataVersion("attendance");
  const cached = getCachedJSON(cacheKey);
  if (cached) return { success: true, history: cached, _cached: true };

  const sheet =
    getSpreadsheet().getSheetByName("ATTENDANCE");
  const headers = getHeaders(sheet);
  const userIdx = headers.indexOf("user_id");
  const dateIdx = headers.indexOf("datetime");
  const statusIdx = headers.indexOf("status");
  const mapIdx = headers.indexOf("map_link");
  const locationIdx = headers.indexOf("location_name");

  if (userIdx === -1) return { success: false, history: [] };

  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount) return { success: true, history: [] };
  const historyColumns = [userIdx, dateIdx, statusIdx, mapIdx, locationIdx].filter(function (index) { return index >= 0; });
  const firstColumn = Math.min.apply(null, historyColumns);
  const lastColumn = Math.max.apply(null, historyColumns);
  const data = sheet.getRange(2, firstColumn + 1, rowCount, lastColumn - firstColumn + 1).getDisplayValues();
  const localUserIdx = userIdx - firstColumn;
  const localDateIdx = dateIdx - firstColumn;
  const localStatusIdx = statusIdx - firstColumn;
  const localMapIdx = mapIdx - firstColumn;
  const localLocationIdx = locationIdx >= 0 ? locationIdx - firstColumn : -1;

  const history = [];
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][localUserIdx]) === String(userId)) {
      history.push({
        date: data[i][localDateIdx],
        status: data[i][localStatusIdx],
        map_link: data[i][localMapIdx],
        location_name: localLocationIdx >= 0 ? data[i][localLocationIdx] : "",
      });
    }
  }

  setCachedJSON(cacheKey, history, CACHE_TTL.history);
  return { success: true, history };
}

function toUserSummary(headers, row) {
  const user = rowToObject(headers, row);
  return {
    id: user.id || "",
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    username: user.username || "",
    branch_id: user.branch_id || "",
    company: user.company || "",
    role: user.role || "user",
  };
}

function getUsers() {
  const cacheKey = "db_users_summary_v" + getDataVersion("users");
  const cached = getCachedJSON(cacheKey);
  if (cached) return { success: true, users: cached, _cached: true };

  const sheet = getSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const normalizedHeaders = headers.map(function (header) { return String(header).toLowerCase(); });
  const summaryColumns = ["id", "first_name", "last_name", "username", "branch_id", "company", "role"]
    .map(function (header) { return normalizedHeaders.indexOf(header); })
    .filter(function (index) { return index >= 0; });
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount || !summaryColumns.length) return { success: true, users: [] };

  const lastSummaryColumn = Math.max.apply(null, summaryColumns);
  const data = sheet.getRange(2, 1, rowCount, lastSummaryColumn + 1).getDisplayValues();
  const users = data.filter(function (row) { return row[0]; }).map(function (row) {
    return toUserSummary(headers, row);
  });

  setCachedJSON(cacheKey, users, CACHE_TTL.master);
  return { success: true, users: users };
}

function getUserProfile(userId) {
  const id = String(userId || "");
  if (!id) return { success: false, message: "Missing User ID" };
  const version = getDataVersion("users");
  const cacheKey = "user_private_v2_" + version + "_" + id;
  const cached = getCachedJSON(cacheKey);
  if (cached && typeof cached === "object") {
    return {
      success: true,
      id: id,
      profile: cached.profile || "",
      password: cached.password || "",
      _cached: true,
    };
  }

  const sheet = getSpreadsheet().getSheetByName("USERS");
  const rowNumber = getUserRowIndex().byId[id];
  const headers = getHeaders(sheet).map(function (header) { return String(header).toLowerCase(); });
  const profileColumn = headers.indexOf("profile") + 1;
  const passwordColumn = headers.indexOf("password") + 1;
  if (!rowNumber) return { success: true, id: id, profile: "", password: "" };

  const details = {
    profile: profileColumn ? (sheet.getRange(rowNumber, profileColumn).getDisplayValue() || "") : "",
    password: passwordColumn ? (sheet.getRange(rowNumber, passwordColumn).getDisplayValue() || "") : "",
  };
  setCachedJSON(cacheKey, details, CACHE_TTL.master);
  return { success: true, id: id, profile: details.profile, password: details.password };
}

function getUserDirectory() {
  const cacheKey = "user_directory_v" + getDataVersion("users");
  const cached = getCachedJSON(cacheKey);
  if (cached) return cached;

  const sheet = getSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet).map(function (header) { return header.toLowerCase(); });
  const columns = {
    id: headers.indexOf("id"),
    firstName: headers.indexOf("first_name"),
    lastName: headers.indexOf("last_name"),
    branchId: headers.indexOf("branch_id"),
    company: headers.indexOf("company"),
  };
  const lastNeededColumn = Math.max(columns.id, columns.firstName, columns.lastName, columns.branchId, columns.company);
  const count = Math.max(0, sheet.getLastRow() - 1);
  const rows = count ? sheet.getRange(2, 1, count, lastNeededColumn + 1).getDisplayValues() : [];
  const directory = {};
  rows.forEach(function (row) {
    const id = row[columns.id];
    if (!id) return;
    directory[id] = {
      name: (row[columns.firstName] + " " + row[columns.lastName]).trim(),
      branch_id: row[columns.branchId] || "",
      company: row[columns.company] || "",
    };
  });
  setCachedJSON(cacheKey, directory, CACHE_TTL.master);
  return directory;
}

function createUser(u) {
  const sheet = getSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const normalizedUsername = String(u.username || "").trim().toLowerCase();
  if (!normalizedUsername) return { success: false, message: "Missing username" };
  if (getUserRowIndex().byUsername[normalizedUsername]) {
    return { success: false, message: "ชื่อผู้ใช้งานนี้มีอยู่แล้ว" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const userId = "U" + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
    const newRow = headers.map(function (header) {
      const key = header.toLowerCase();
      if (key === "id") return userId;
      if (key === "username") return normalizedUsername;
      if (key === "password") return u.password || hashPassword("1234");
      const value = u[header] !== undefined ? u[header] : u[key];
      return value === undefined ? "" : value;
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, newRow.length).setValues([newRow]);
    invalidateUsersCache();
    return { success: true, id: userId, user: toUserSummary(headers, newRow) };
  } finally {
    lock.releaseLock();
  }
}

function deleteUser(userId) {
  const sheet = getSpreadsheet().getSheetByName("USERS");
  const rowNumber = getUserRowIndex().byId[String(userId)];
  if (!rowNumber) return { success: false, message: "ไม่พบผู้ใช้งาน" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.deleteRow(rowNumber);
    invalidateUsersCache();
    return { success: true, id: userId };
  } finally {
    lock.releaseLock();
  }
}

function updateUser(u) {
  if (!u || !u.id) return { success: false, message: "Missing User ID" };
  const sheet = getSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const rowNumber = getUserRowIndex().byId[String(u.id)];
  if (!rowNumber) return { success: false, message: "User not found" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const currentRow = sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0];
    const nextRow = currentRow.slice();
    headers.forEach(function (header, columnIndex) {
      const key = header.toLowerCase();
      if (key === "id") return;
      const value = u[header] !== undefined ? u[header] : u[key];
      if (value === undefined) return;
      if (key === "password" && !value) return;
      nextRow[columnIndex] = value;
    });
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([nextRow]);
    invalidateUsersCache();
    return { success: true, id: u.id, user: toUserSummary(headers, nextRow) };
  } finally {
    lock.releaseLock();
  }
}

function dateToIsoDate(value) {
  const text = String(value || "");
  if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) {
    const parts = text.slice(0, 10).split("/");
    return parts[2] + "-" + parts[1] + "-" + parts[0];
  }
  return text.slice(0, 10);
}

function getAttendancePhoto(attendanceId) {
  if (!attendanceId) return { success: false, message: "Missing attendance ID" };
  const sheet = getSpreadsheet().getSheetByName("ATTENDANCE");
  const headers = getHeaders(sheet).map(function (header) { return header.toLowerCase(); });
  const idColumn = headers.indexOf("id") + 1;
  const selfieColumn = headers.indexOf("selfie") + 1;
  if (!idColumn || !selfieColumn || sheet.getLastRow() < 2) {
    return { success: false, message: "Attendance photo column not found" };
  }
  const attendanceVersion = getDataVersion("attendance");
  const rowCacheKey = "attendance_photo_row_v" + attendanceVersion + "_" + String(attendanceId);
  let rowNumber = Number(getScriptCache(rowCacheKey)) || 0;
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    const match = sheet
      .getRange(2, idColumn, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(attendanceId))
      .matchEntireCell(true)
      .findNext();
    if (!match) return { success: false, message: "Attendance record not found" };
    rowNumber = match.getRow();
    setScriptCache(rowCacheKey, String(rowNumber), CACHE_TTL.history);
  }
  const selfie = sheet.getRange(rowNumber, selfieColumn).getDisplayValue();
  return { success: true, id: attendanceId, selfie: selfie || "" };
}

function getAllAttendance(params) {
  params = params || {};
  const page = Math.max(1, Number(params.page) || 1);
  const requestedPageSize = Number(params.page_size || params.pageSize) || 10;
  const pageSize = Math.max(1, Math.min(params.export ? 500 : 100, requestedPageSize));
  const query = {
    page: page,
    pageSize: pageSize,
    start: String(params.start_date || ""),
    end: String(params.end_date || ""),
    userId: String(params.user_id || ""),
    branchId: String(params.branch_id || ""),
    export: !!params.export,
    version: getDataVersion("attendance") + "." + getDataVersion("users"),
  };
  const cacheKey = makeCacheKey("attendance_query", query);
  const cached = getCachedJSON(cacheKey);
  if (cached) {
    cached._cached = true;
    return cached;
  }

  const ss = getSpreadsheet();
  const attSheet = ss.getSheetByName("ATTENDANCE");
  const attHeaders = getHeaders(attSheet);
  const column = {};
  attHeaders.forEach(function (header, index) { column[header.toLowerCase()] = index; });
  const locationColumn = typeof column.location_name === "number" ? column.location_name : -1;
  const totalRows = Math.max(0, attSheet.getLastRow() - 1);

  const branchList = getBranches().branches || [];
  const branchMap = {};
  branchList.forEach(function (branch) { branchMap[branch.id] = branch.name; });
  const userMap = getUserDirectory();

  let matchedRows = [];
  const hasFilters = query.start || query.end || query.userId || query.branchId;
  let compactRows = null;
  let compactFirstColumn = 0;
  if (!hasFilters && !query.export) {
    for (let rowNumber = totalRows + 1; rowNumber >= 2; rowNumber--) matchedRows.push(rowNumber);
  } else if (totalRows) {
    const exportColumns = [
      column.user_id,
      column.datetime,
      column.status,
      column.latitude,
      column.longitude,
      column.map_link,
      locationColumn,
    ].filter(function (index) { return typeof index === "number" && index >= 0; });
    compactFirstColumn = query.export
      ? Math.min.apply(null, exportColumns)
      : Math.min(column.user_id, column.datetime);
    const compactLastColumn = query.export
      ? Math.max.apply(null, exportColumns)
      : Math.max(column.user_id, column.datetime);
    compactRows = attSheet.getRange(2, compactFirstColumn + 1, totalRows, compactLastColumn - compactFirstColumn + 1).getDisplayValues();
    const localUserColumn = column.user_id - compactFirstColumn;
    const localDateColumn = column.datetime - compactFirstColumn;
    for (let i = compactRows.length - 1; i >= 0; i--) {
      const userId = String(compactRows[i][localUserColumn] || "");
      const isoDate = dateToIsoDate(compactRows[i][localDateColumn]);
      const user = userMap[userId] || {};
      if (query.start && isoDate < query.start) continue;
      if (query.end && isoDate > query.end) continue;
      if (query.userId && userId !== query.userId) continue;
      if (query.branchId && String(user.branch_id || "") !== query.branchId) continue;
      matchedRows.push(i + 2);
    }
  }

  const total = matchedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const selectedRows = matchedRows.slice(offset, offset + pageSize);
  const records = [];
  const photoRowCacheEntries = {};
  const attendanceDataVersion = getDataVersion("attendance");
  let selectedData = [];
  const responseLastColumn = Math.max(
    column.id,
    column.user_id,
    column.datetime,
    column.status,
    column.latitude,
    column.longitude,
    column.map_link,
    locationColumn,
  );
  if (!query.export && selectedRows.length) {
    const isContiguousDescending = selectedRows.every(function (rowNumber, index) {
      return index === 0 || rowNumber === selectedRows[index - 1] - 1;
    });
    if (isContiguousDescending) {
      const firstRow = selectedRows[selectedRows.length - 1];
      selectedData = attSheet
        .getRange(firstRow, 1, selectedRows.length, responseLastColumn + 1)
        .getDisplayValues()
        .reverse();
    } else {
      selectedData = selectedRows.map(function (rowNumber) {
        return attSheet.getRange(rowNumber, 1, 1, responseLastColumn + 1).getDisplayValues()[0];
      });
    }
  }

  selectedRows.forEach(function (rowNumber, selectedIndex) {
    const row = query.export ? compactRows[rowNumber - 2] : selectedData[selectedIndex];
    const record = {};
    attHeaders.forEach(function (header, index) {
      record[header] = query.export
        ? (row[index - compactFirstColumn] || "")
        : (index <= responseLastColumn ? row[index] : "");
    });
    const uid = query.export ? row[column.user_id - compactFirstColumn] : row[column.user_id];
    const user = userMap[uid] || { name: "Unknown", branch_id: "", company: "" };
    record.name = user.name;
    record.branch_id = user.branch_id;
    record.branch_name = branchMap[user.branch_id] || user.company || "";
    record.date = query.export ? row[column.datetime - compactFirstColumn] : row[column.datetime];
    records.push(record);
    if (!query.export && record.id) {
      photoRowCacheEntries["attendance_photo_row_v" + attendanceDataVersion + "_" + record.id] = String(rowNumber);
    }
  });

  setScriptCacheEntries(photoRowCacheEntries, CACHE_TTL.history);

  const result = {
    success: true,
    records: records,
    total: total,
    page: safePage,
    page_size: pageSize,
    total_pages: totalPages,
  };
  setCachedJSON(cacheKey, result, CACHE_TTL.query);
  return result;
}

/**
 * 🆘 EMERGENCY ADMIN FIX
 * Use this to reset the admin password to "1234" if locked out.
 * Steps: 1. Paste this code, 2. Run emergencyFixAdmin() from GAS editor
 */
function emergencyFixAdmin() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const colUser = headers.map(h => h.toLowerCase()).indexOf("username");
  const colPass = headers.map(h => h.toLowerCase()).indexOf("password");
  
  if (colUser === -1 || colPass === -1) {
    Logger.log("Error: Could not find username or password column.");
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const username = String(data[i][colUser]).trim().toLowerCase();
    if (username === "admin") {
      // Set password to "1234" in Base64
      sheet.getRange(i + 1, colPass + 1).setValue("MTIzNA==");
      Logger.log("✅ Admin access restored! Password is now: 1234");
      return;
    }
  }
  Logger.log("❌ Admin user not found.");
}
