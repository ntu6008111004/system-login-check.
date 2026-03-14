/**
 * WorkLogs - Decoupled REST API (Enhanced Admin Edition)
 */

function logToSheet(action, type, data) {
  // Skip verbose read actions to prevent log bloat
  const skipActions = ['get_admin_data', 'get_history', 'get_users'];
  if (skipActions.includes(action)) return;

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let logSheet = ss.getSheetByName('SYS_LOG');
    if (!logSheet) {
      logSheet = ss.insertSheet('SYS_LOG');
      logSheet.appendRow(['Timestamp', 'Action', 'Type', 'Data']);
    }
    logSheet.appendRow([new Date(), action, type, JSON.stringify(data)]);
  } catch (e) {
    console.error('Logging failed', e);
  }
}

const SPREADSHEET_ID = '1B3iZtBSzCAVILYGn1qAIAZdudpour3OPvGXrh2LUQc8';

/**
 * 🔒 SHA-256 Password Hashing
 */
function hashPassword(text) {
  // Ensure text is a string
  if (typeof text !== 'string') {
    text = String(text);
  }
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
  var hashedBytes = [];
  for (var i = 0; i < hash.length; i++) {
    var byte = hash[i];
    if (byte < 0) {
      byte += 256;
    }
    var hexByte = byte.toString(16);
    if (hexByte.length == 1) {
      hexByte = '0' + hexByte;
    }
    hashedBytes.push(hexByte);
  }
  return hashedBytes.join('');
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
    const payloadEncoded = p.payload || '';
    let body = {};
    if (payloadEncoded) {
      try {
        body = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payloadEncoded)).getDataAsString('UTF-8'));
      } catch (err) {
        body = p;
      }
    } else {
      body = p;
    }

    logToSheet(action, 'GET', body);
    let result = handleAction(action, body);

    if (callback) {
      return ContentService
        .createTextOutput(`${callback}(${JSON.stringify(result)});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return respondJSON(result);
  } catch (error) {
    logToSheet('ERROR', 'GET', { error: error.toString() });
    return respondJSON({ success: false, message: error.toString() });
  }
}

function doPost(e) {
  try {
    setupDatabase();
    const contents = e.postData ? e.postData.contents : '';
    if (!contents) throw new Error('No post data content');
    
    const body = JSON.parse(contents);
    const action = body.action;
    const data = body.data || body;
    
    logToSheet(action, 'POST', data);
    const result = handleAction(action, data);
    return respondJSON(result);
      
  } catch (err) {
    logToSheet('ERROR', 'POST', { error: err.toString(), contents: e.postData ? e.postData.contents : 'no contents' });
    return respondJSON({ success: false, message: 'Server Error: ' + err.toString() });
  }
}

function handleAction(action, data) {
  if (action === 'login') return loginUser(data.username, data.password);
  if (action === 'save_attendance') return saveAttendance(data);
  if (action === 'get_history') return getUserHistory(data.user_id);
  if (action === 'get_admin_data') return getAllAttendance();
  if (action === 'get_users') return getUsers();
  if (action === 'create_user') return createUser(data);
  if (action === 'delete_user') return deleteUser(data.user_id || data.id);
  if (action === 'update_user') return updateUser(data);
  if (action === 'generate_mock_data') return generateMockData();
  
  return { success: false, message: 'Unknown action: ' + action };
}

function generateMockData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('USERS');
  const attSheet = ss.getSheetByName('ATTENDANCE');
  
  // Clear existing (except headers)
  if (usersSheet.getLastRow() > 1) usersSheet.deleteRows(2, usersSheet.getLastRow() - 1);
  if (attSheet.getLastRow() > 1) attSheet.deleteRows(2, attSheet.getLastRow() - 1);
  
  // Create Mock Users
  const mockUsers = [
    ['U101', 'กิตติ', 'รักงาน', 'admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'WorkLogs Corp', 'admin'],
    ['U102', 'นารี', 'ขยัน', 'user1', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'WorkLogs Corp', 'user'],
    ['U103', 'สมพร', 'มาสาย', 'user2', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'WorkLogs Corp', 'user'],
    ['U104', 'จันทรา', 'ทำดี', 'user3', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'WorkLogs Corp', 'user']
  ];
  usersSheet.getRange(2, 1, mockUsers.length, mockUsers[0].length).setValues(mockUsers);
  
  // Add profile images to the mock users
  mockUsers.forEach((user, idx) => {
    const profileImg = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user[1]}`;
    usersSheet.getRange(idx + 2, 8).setValue(profileImg);
  });

  // Create Mock Attendance (Last 7 days)
  const statuses = ['เข้างาน', 'ออกงาน'];
  const now = new Date();
  const records = [];
  
  for (let d = 0; d < 7; d++) {
    const date = new Date(now.getTime() - (d * 24 * 60 * 60 * 1000));
    const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
    
    mockUsers.forEach(user => {
      // In
      records.push([
        'A' + Math.random().toString(36).substr(2, 9),
        user[0],
        dateStr + ' 08:' + Math.floor(Math.random()*30+10) + ':00',
        'เข้างาน',
        13.7563, 100.5018, 'https://maps.google.com/?q=13.7563,100.5018', '', 'Web'
      ]);
      // Out
      records.push([
        'A' + Math.random().toString(36).substr(2, 9),
        user[0],
        dateStr + ' 17:' + Math.floor(Math.random()*30+10) + ':00',
        'ออกงาน',
        13.7563, 100.5018, 'https://maps.google.com/?q=13.7563,100.5018', '', 'Web'
      ]);
    });
  }
  
  if (records.length > 0) {
    attSheet.getRange(2, 1, records.length, records[0].length).setValues(records);
  }
  
  return { success: true };
}

function respondJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/** 👤 DATABASE HELPERS */
function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
}

function setupDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID); 
  let usersSheet = ss.getSheetByName('USERS');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('USERS');
    usersSheet.appendRow(['id', 'first_name', 'last_name', 'username', 'password', 'company', 'role', 'profile']);
    usersSheet.appendRow(['U001', 'สมชาย', 'ใจดี', 'admin', '123456', 'บริษัท เดโม่ จำกัด', 'admin', '']);
    usersSheet.appendRow(['U002', 'สุดา', 'ดีงาม', 'user1', '123456', 'บริษัท เดโม่ จำกัด', 'user', '']);
  }
  let attSheet = ss.getSheetByName('ATTENDANCE');
  if (!attSheet) {
    attSheet = ss.insertSheet('ATTENDANCE');
    attSheet.appendRow(['id', 'user_id', 'datetime', 'status', 'latitude', 'longitude', 'map_link', 'selfie', 'device']);
  }
}

function loginUser(username, password) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('USERS');
  if (!sheet) return { success: false, message: 'ไม่พบฐานข้อมูลผู้ใช้งาน' };
  
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getDisplayValues();
  const searchUser = String(username).trim().toLowerCase(); 
  
  // Find indices based on headers
  const userIdx = headers.indexOf('username');
  const passIdx = headers.indexOf('password');
  const idIdx = headers.indexOf('id');
  const firstNameIdx = headers.indexOf('first_name');
  const lastNameIdx = headers.indexOf('last_name');
  const companyIdx = headers.indexOf('company');
  const roleIdx = headers.indexOf('role');
  const profileIdx = headers.indexOf('profile');

  if (userIdx === -1 || passIdx === -1) return { success: false, message: 'Database schema error' };

  for (let i = 1; i < data.length; i++) {
    let storedUser = data[i][userIdx].trim().toLowerCase(); 
    let storedPass = data[i][passIdx].trim();
    
    if (storedUser === searchUser) {
      // Input 'password' from frontend is already SHA-256 hashed
      const inputHash = String(password).trim();
      
      // Match 1: Direct match (Single Hash)
      // Match 2: Stored is plain text (Legacy)
      // Match 3: Stored is DOUBLE HASH (Bug Recovery)
      if (storedPass === inputHash || hashPassword(storedPass) === inputHash || hashPassword(inputHash) === storedPass) {
        // Auto-upgrade to hash if it was plain text or double-hash
        if (storedPass !== inputHash) {
            sheet.getRange(i+1, passIdx+1).setValue(inputHash);
        }
        
        return { 
          success: true, 
          user: { 
            id: data[i][idIdx], 
            name: `${data[i][firstNameIdx]} ${data[i][lastNameIdx]}`, 
            username: storedUser, 
            company: data[i][companyIdx], 
            role: data[i][roleIdx],
            profile: data[i][profileIdx] || '' 
          } 
        };
      }
    }
  }
  return { success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้องค่ะ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง' };
}

function saveAttendance(p) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ATTENDANCE');
  const headers = getHeaders(sheet);
  const now = new Date();
  const formattedDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  
  const newRow = [];
  headers.forEach(h => {
    switch(h.toLowerCase()) {
      case 'id': newRow.push('A'+now.getTime()); break;
      case 'user_id': newRow.push(p.user_id); break;
      case 'datetime': newRow.push(formattedDate); break;
      case 'status': newRow.push(p.status); break;
      case 'latitude': newRow.push(p.latitude); break;
      case 'longitude': newRow.push(p.longitude); break;
      case 'map_link': newRow.push(`https://maps.google.com/?q=${p.latitude},${p.longitude}`); break;
      case 'selfie': newRow.push(p.selfie_base64 || p.selfie || ''); break;
      case 'device': newRow.push('Web'); break;
      default: newRow.push('');
    }
  });
  
  sheet.appendRow(newRow);
  return { success: true };
}

function getUserHistory(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ATTENDANCE');
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getValues();
  
  const userIdx = headers.indexOf('user_id');
  const dateIdx = headers.indexOf('datetime');
  const statusIdx = headers.indexOf('status');
  const mapIdx = headers.indexOf('map_link');

  if (userIdx === -1) return { success: false, history: [] };

  const history = [];
  for (let i = data.length-1; i>=1; i--) {
    if (String(data[i][userIdx]) === String(userId)) {
        history.push({ 
          date: data[i][dateIdx], 
          status: data[i][statusIdx], 
          map_link: data[i][mapIdx] 
        });
    }
  }
  return { success: true, history };
}

function getUsers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getDisplayValues();
  
  const users = data.slice(1).map(r => {
    const userObj = {};
    headers.forEach((h, i) => {
      userObj[h] = r[i];
    });
    return userObj;
  });
  return { success: true, users };
}

function createUser(u) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  const headers = getHeaders(sheet);
  const newRow = [];
  const userId = 'U' + new Date().getTime().toString().slice(-6);
  
  headers.forEach(h => {
    if (h.toLowerCase() === 'id') { newRow.push(userId); return; }
    if (h.toLowerCase() === 'password') { newRow.push(u.password); return; }
    
    // Auto-map lowercase keys from payload to headers
    let val = u[h] || u[h.toLowerCase()];
    if (val === undefined) val = '';
    newRow.push(val);
  });
  
  sheet.appendRow(newRow);
  return { success: true, id: userId };
}

function deleteUser(userId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getValues();
  const idIdx = headers.indexOf('id');
  
  if (idIdx === -1) return { success: false, message: 'ID column not found' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(userId)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: 'ไม่พบผู้ใช้งาน' };
}

function updateUser(u) {
  if (!u || !u.id) return { success: false, message: 'Missing User ID' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  const headers = getHeaders(sheet);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === u.id) {
       headers.forEach((h, colIdx) => {
         if (h.toLowerCase() === 'id') return;
         
         let val = u[h] || u[h.toLowerCase()];
         if (val !== undefined) {
             if (h.toLowerCase() === 'password') {
                 // val is already hashed by frontend
                 if (!val || val === data[i][colIdx]) return; 
             }
             sheet.getRange(i+1, colIdx+1).setValue(val);
         }
       });
       return { success: true };
    }
  }
  return { success: false, message: 'User not found' };
}

function getAllAttendance() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attSheet = ss.getSheetByName('ATTENDANCE');
  const userSheet = ss.getSheetByName('USERS');
  
  const attHeaders = getHeaders(attSheet);
  const userHeaders = getHeaders(userSheet);
  
  const attData = attSheet.getDataRange().getValues();
  const userData = userSheet.getDataRange().getValues();
  
  // Map users: id -> Full Name (first_name + last_name)
  const idIdx = userHeaders.indexOf('id');
  const firstIdx = userHeaders.indexOf('first_name');
  const lastIdx = userHeaders.indexOf('last_name');
  
  const userMap = {};
  for (let i = 1; i < userData.length; i++) {
    userMap[userData[i][idIdx]] = `${userData[i][firstIdx]} ${userData[i][lastIdx]}`;
  }
  
  const records = [];
  for (let i = attData.length - 1; i >= 1; i--) {
    const row = attData[i];
    const record = {};
    attHeaders.forEach((h, j) => { record[h] = row[j]; });
    
    // Inject human-friendly name
    const uid = record['user_id'];
    record['name'] = userMap[uid] || 'Unknown';
    
    // Explicit mappings for frontend legacy compatibility if names differ
    record.date = record.datetime; 
    
    records.push(record);
  }
  return { success: true, records };
}
