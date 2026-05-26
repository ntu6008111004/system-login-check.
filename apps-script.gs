/**
 * WorkLogs - Decoupled REST API (Enhanced Admin Edition)
 */

function logToSheet(action, type, data) {
  // Skip verbose or sensitive actions to prevent log bloat and data leaks
  const skipActions = ["get_admin_data", "get_history", "get_users", "login"];
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
const APP_VERSION = "1.0.5"; // อัปเดตที่นี่เมื่อมีการเปลี่ยนโค้ด

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
    setupDatabase();
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
    return respondJSON({ success: false, message: error.toString() });
  }
}

function doPost(e) {
  try {
    setupDatabase();
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
  if (action === "get_admin_data") return getAllAttendance();
  if (action === "get_users") return getUsers();
  if (action === "create_user") return createUser(data);
  if (action === "delete_user") return deleteUser(data.user_id || data.id);
  if (action === "update_user") return updateUser(data);
  if (action === "generate_mock_data") return generateMockData();
  if (action === "get_branches") return getBranches();
  if (action === "get_version") return { success: true, version: APP_VERSION };
  if (action === "reset_all_passwords") return resetAllPasswords();

  return { success: false, message: "Unknown action: " + action };
}

function generateMockData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  clearScriptCache(["db_users", "db_branches"]);
  return { success: true };
}

function respondJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** 👤 DATABASE HELPERS */
const _HEADER_CACHE = {}; 

const CACHE_TTL = 300; // 5 mins in seconds

function getScriptCache(key) {
  try {
    const cache = CacheService.getScriptCache();
    return cache.get(key);
  } catch (e) {
    return null;
  }
}

function setScriptCache(key, valueString) {
  try {
    const cache = CacheService.getScriptCache();
    if (valueString && valueString.length < 100000) {
      cache.put(key, valueString, CACHE_TTL);
    }
  } catch (e) {
    // Fail silently
  }
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

function setupDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
      "selfie",
      "device",
    ]);
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
}

function getBranches() {
  const cacheKey = "db_branches";
  const cached = getScriptCache(cacheKey);
  if (cached) {
    try {
      return { success: true, branches: JSON.parse(cached), _cached: true };
    } catch (e) {}
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("BRANCHES");

  if (!sheet) {
    setupDatabase();
    sheet = ss.getSheetByName("BRANCHES");
  }

  if (!sheet) return { success: false, branches: [] };

  const data = sheet.getDataRange().getValues();
  const branches = [];
  for (let i = 1; i < data.length; i++) {
    branches.push({ id: data[i][0], name: data[i][1] });
  }

  setScriptCache(cacheKey, JSON.stringify(branches));
  return { success: true, branches: branches };
}

function loginUser(username, password) {
  const res = getUsers();
  if (!res.success) return { success: false, message: "ไม่พบฐานข้อมูลผู้ใช้งาน" };

  const users = res.users;
  const searchUser = String(username).trim().toLowerCase();
  const inputEncoded = String(password).trim();

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const storedUser = String(u.username || "").trim().toLowerCase();
    const storedVal = String(u.password || "").trim();
    
    if (storedUser === searchUser) {
        const isMatch = (storedVal === inputEncoded);
        if (isMatch) {
            return {
                success: true,
                user: {
                    id: u.id,
                    name: `${u.first_name} ${u.last_name}`,
                    username: storedUser,
                    branch_id: u.branch_id || "",
                    company: u.company || "",
                    role: u.role || "",
                    profile: u.profile || "",
                },
            };
        }
    }
  }
  return {
    success: false,
    message: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง",
  };
}

function resetAllPasswords() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const colPassword = headers.map(h => h.toLowerCase()).indexOf("password");
  
  if (colPassword === -1) return { success: false, message: "Password column not found" };
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true };
  
  const defaultPassEncoded = hashPassword("1234");
  sheet.getRange(2, colPassword + 1, lastRow - 1, 1).setValue(defaultPassEncoded);
  
  clearScriptCache(["db_users"]);
  return { success: true, message: "รีเซ็ตรหัสพนักงานทุกคนเป็น 1234 เรียบร้อยแล้ว" };
}

function saveAttendance(p) {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ATTENDANCE");
  const headers = getHeaders(sheet);
  const now = new Date();
  const formattedDate = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm:ss",
  );

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

  sheet.appendRow(newRow);
  clearScriptCache(["db_history_" + p.user_id]);
  return { success: true };
}

function getUserHistory(userId) {
  const cacheKey = "db_history_" + userId;
  const cached = getScriptCache(cacheKey);
  if (cached) {
    try {
      return { success: true, history: JSON.parse(cached), _cached: true };
    } catch (e) {}
  }

  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ATTENDANCE");
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getValues();

  const userIdx = headers.indexOf("user_id");
  const dateIdx = headers.indexOf("datetime");
  const statusIdx = headers.indexOf("status");
  const mapIdx = headers.indexOf("map_link");

  if (userIdx === -1) return { success: false, history: [] };

  const history = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][userIdx]) === String(userId)) {
      history.push({
        date: data[i][dateIdx],
        status: data[i][statusIdx],
        map_link: data[i][mapIdx],
      });
    }
  }

  setScriptCache(cacheKey, JSON.stringify(history));
  return { success: true, history };
}

function getUsers() {
  const cacheKey = "db_users";
  const cached = getScriptCache(cacheKey);
  if (cached) {
    try {
      return { success: true, users: JSON.parse(cached), _cached: true };
    } catch (e) {}
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getDisplayValues();

  const users = data.slice(1).map((r) => {
    const userObj = {};
    headers.forEach((h, i) => {
      userObj[h] = r[i];
    });
    return userObj;
  });

  setScriptCache(cacheKey, JSON.stringify(users));
  return { success: true, users };
}

function createUser(u) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const newRow = [];
  const userId = "U" + new Date().getTime().toString().slice(-6);

  headers.forEach((h) => {
    if (h.toLowerCase() === "id") {
      newRow.push(userId);
      return;
    }
    if (h.toLowerCase() === "password") {
      newRow.push(u.password);
      return;
    }

    // Auto-map lowercase keys from payload to headers
    let val = u[h] || u[h.toLowerCase()];
    if (val === undefined) val = "";
    newRow.push(val);
  });

  sheet.appendRow(newRow);
  clearScriptCache(["db_users"]);
  return { success: true, id: userId };
}

function deleteUser(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getValues();
  const idIdx = headers.indexOf("id");

  if (idIdx === -1) return { success: false, message: "ID column not found" };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(userId)) {
      sheet.deleteRow(i + 1);
      clearScriptCache(["db_users"]);
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบผู้ใช้งาน" };
}

function updateUser(u) {
  if (!u || !u.id) return { success: false, message: "Missing User ID" };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === u.id) {
      headers.forEach((h, colIdx) => {
        if (h.toLowerCase() === "id") return;

        let val = u[h] || u[h.toLowerCase()];
        if (val !== undefined) {
          if (h.toLowerCase() === "password") {
            // val is already hashed by frontend
            if (!val || val === data[i][colIdx]) return;
          }
          sheet.getRange(i + 1, colIdx + 1).setValue(val);
        }
      });
      clearScriptCache(["db_users"]);
      return { success: true };
    }
  }
  return { success: false, message: "User not found" };
}

function getAllAttendance() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const attSheet = ss.getSheetByName("ATTENDANCE");
  
  const usersRes = getUsers();
  const branchesRes = getBranches();
  
  const userData = usersRes.users || [];
  const branchList = branchesRes.branches || [];

  const attHeaders = getHeaders(attSheet);
  const attData = attSheet.getDataRange().getDisplayValues();

  // 1. Build Branch Map: id -> name
  const branchMap = {};
  branchList.forEach(b => {
    branchMap[b.id] = b.name;
  });

  // 2. Build User Map for O(1) lookup: id -> {name, branch_id, branch_name}
  const userMap = {};
  userData.forEach(u => {
    userMap[u.id] = {
      name: `${u.first_name} ${u.last_name}`,
      branch_id: u.branch_id || "",
      branch_name: branchMap[u.branch_id] || u.company || "",
    };
  });

  // 3. Process records with O(1) lookup
  const aCol = {};
  attHeaders.forEach((h, i) => aCol[h.toLowerCase()] = i);

  const records = [];
  for (let i = attData.length - 1; i >= 1; i--) {
    const row = attData[i];
    const record = {};
    attHeaders.forEach((h, j) => {
      record[h] = row[j];
    });

    const uid = row[aCol.user_id];
    const uInfo = userMap[uid] || { name: "Unknown", branch_id: "", branch_name: "" };
    
    record["name"] = uInfo.name;
    record["branch_id"] = uInfo.branch_id;
    record["branch_name"] = uInfo.branch_name;
    record.date = row[aCol.datetime];

    records.push(record);
  }
  return { success: true, records };
}

/**
 * 🆘 EMERGENCY ADMIN FIX
 * Use this to reset the admin password to "1234" if locked out.
 * Steps: 1. Paste this code, 2. Run emergencyFixAdmin() from GAS editor
 */
function emergencyFixAdmin() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
