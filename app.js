const _u = 'aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J6a285U3F2NW9XOFEtbDFzM1l4dUtINlJVSVdMbkwwQk5KZjZCZnZCd1hOdWNVLTc1V204eVVWX1NIclgwcnB1c3IvZXhlYw==';
const API_URL = atob(_u);

// System State
let currentUser = null;
let videoStream = null;
let lastCapturedPhoto = null;
let currentCoords = { lat: 0, lng: 0 };
let map = null;
let marker = null;
let isLocationReady = false;
let hasCheckedInToday = false;
let hasCheckedOutToday = false;

// AI State
let faceDetection = null;
let isFaceInFrame = false;
let camera = null;
let isPhotoConfirmed = false;

// Personal History State
let personalHistoryData = [];
let historyCurrentPage = 1;
const historyItemsPerPage = 10;

// Admin State
let adminData = [];
let adminUsers = [];
let activeAdminTab = 'logs';
let adminCurrentPage = 1;
const adminRowsPerPage = 10;
let adminPollInterval = null;

// Utility
const formatThaiDate = (dateStr) => {
    if (!dateStr) return '---';
    try {
        let date;
        if (typeof dateStr === 'string' && dateStr.includes('/')) {
            const parts = dateStr.split(' ');
            const dParts = parts[0].split('/');
            const tPart = parts[1] || '00:00:00';
            date = new Date(`${dParts[2]}-${dParts[1]}-${dParts[0]}T${tPart}`);
        } else {
            date = new Date(dateStr);
        }
        
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('th-TH', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).replace(',', '');
    } catch (e) { return dateStr; }
};

function showImageLightbox(imageUrl, title = '') {
  if (!imageUrl) return;
  const existing = document.getElementById('worklogs-image-lightbox');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'worklogs-image-lightbox';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(15, 23, 42, 0.75)';
  overlay.style.backdropFilter = 'blur(6px)';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '24px';

  const card = document.createElement('div');
  card.style.width = 'min(92vw, 520px)';
  card.style.maxHeight = '92vh';
  card.style.background = '#ffffff';
  card.style.borderRadius = '16px';
  card.style.overflow = 'hidden';
  card.style.boxShadow = '0 20px 45px rgba(0,0,0,0.25)';
  card.style.position = 'relative';

  const header = document.createElement('div');
  header.style.display = title ? 'flex' : 'none';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '12px 14px';
  header.style.borderBottom = '1px solid #e2e8f0';

  const titleEl = document.createElement('div');
  titleEl.textContent = title;
  titleEl.style.fontWeight = '800';
  titleEl.style.fontSize = '13px';
  titleEl.style.color = '#0f172a';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'ปิด';
  closeBtn.style.fontWeight = '800';
  closeBtn.style.fontSize = '12px';
  closeBtn.style.padding = '8px 10px';
  closeBtn.style.borderRadius = '10px';
  closeBtn.style.border = '1px solid #e2e8f0';
  closeBtn.style.background = '#f8fafc';
  closeBtn.style.cursor = 'pointer';

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.style.padding = '14px';
  body.style.display = 'flex';
  body.style.justifyContent = 'center';
  body.style.alignItems = 'center';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = title || 'image';
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.maxHeight = '76vh';
  img.style.objectFit = 'contain';
  img.style.borderRadius = '12px';

  body.appendChild(img);
  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);

  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    close();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
}

/**
 * 🖼️ IMAGE COMPRESSION UTILITY (Keep under 47KB)
 */
async function compressImage(base64, maxDim = 320, quality = 0.7) {
  if (!base64 || !base64.startsWith('data:image')) return base64;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
      else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

/**
 * 🔒 SECURE PASSWORD HASHING (SHA-256)
 */
async function hashPassword(string) {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

$(document).ready(function() {
  initApp();
  initListeners();
});

function initApp() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  const savedUser = localStorage.getItem('worklogs_user');
  
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    if (isLoginPage) {
        window.location.href = 'index.html';
        return;
    }
    $('#chkRemember').prop('checked', true);
    // Admin users go directly to admin view, regular users go to dashboard
    if (currentUser.role === 'admin') {
        switchView('admin');
    } else {
        switchView('dashboard');
    }
  } else {
    if (!isLoginPage) {
        window.location.href = 'login.html';
        return;
    }
    // We are on login.html and no user, stay here.
  }
}

// DELETED callAPIJsonp - Switching to POST-only approach

function initListeners() {
  $(document).on('submit', '#formLogin', handleLogin);
  $(document).on('click', '#btnCapture', capturePhoto);
  $(document).on('click', '#btnIn', () => handleAttendanceClick('เข้างาน'));
  $(document).on('click', '#btnOut', () => handleAttendanceClick('ออกงาน'));
  
  // Admin Filter
  $('#filterStartDate, #filterEndDate, #filterUser').on('change', () => {
    adminCurrentPage = 1;
    renderAdminLogs();
  });

  // Photo Listeners
  $(document).on('click', '#btnRetake', retakePhoto);
  $(document).on('click', '#btnConfirmPhoto', confirmPhoto);

  if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
      initFaceDetection();
  }
}

/**
 * 🚀 API COMMUNICATION
 */
const DATA_ACTIONS = ['login', 'get_history', 'get_admin_data', 'get_users'];

async function callAPI(action, payload = {}, silent = false) {
  // 1. DATA FETCHING (GET/JSONP) - Needed to read results from local file://
  if (DATA_ACTIONS.includes(action)) {
    return callAPIJsonp(action, payload, silent);
  }

  // 2. DATA SUBMISSION (POST) - Needed for large payloads (Images)
  if (!silent) showLoading(true);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors', // Opaque response: browser sends it but can't read the result
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data: payload })
    });
    
    // In no-cors, we assume success if no network error.
    // Trigger internal UI state update/reload silently.
    setTimeout(() => {
        const force = true;
        if (action === 'create_user' || action === 'update_user' || action === 'delete_user') {
            loadUsers(force);
            loadAdminData(force);
        }
        if (action === 'save_attendance') {
            loadHistory(force);
            loadAdminData(force);
        }
    }, 800); // Optimized for better UX (faster than before)

    return { success: true, _opaque: true };
  } catch (error) {
    console.error(`API Error (${action}):`, error);
    if (!silent) Swal.fire('Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    return { success: false, message: error.toString() };
  } finally {
    if (!silent) showLoading(false);
  }
}

function callAPIJsonp(action, payload = {}, silent = false) {
  return new Promise((resolve) => {
    if (!silent) showLoading(true);
    
    // Convert payload to Base64 to handle complex data inside GET params safely
    const payloadStr = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const callbackName = 'js_cb_' + Math.floor(Math.random() * 1000000);
    const url = `${API_URL}?action=${action}&payload=${payloadStr}&callback=${callbackName}`;
    
    const script = document.createElement('script');
    script.src = url;
    
    window[callbackName] = (data) => {
      delete window[callbackName];
      document.head.removeChild(script);
      if (!silent) showLoading(false);
      
      // Smart Unified Caching
      if (data && data.success) {
        const cacheKey = `cache_${action}_${payload.user_id || 'global'}`;
        localStorage.setItem(cacheKey, JSON.stringify(data));
      }
      resolve(data);
    };
    
    script.onerror = () => {
      document.head.removeChild(script);
      if (!silent) showLoading(false);
      console.error(`JSONP Network Error (${action})`);
      resolve({ success: false, message: 'Network Error' });
    };
    
    document.head.appendChild(script);
  });
}

// Removing callAPIJsonp as it's no longer needed with POST text/plain approach

function getCache(action, userId = 'global') {
  const cached = localStorage.getItem(`cache_${action}_${userId}`);
  return cached ? JSON.parse(cached) : null;
}

/**
 * 🏠 VIEW ROUTING
 */
function startAdminPolling() {
    if (adminPollInterval) return;
    console.log('Admin Polling Started (15s)');
    adminPollInterval = setInterval(() => {
        if (currentUser && currentUser.role === 'admin') {
            loadAdminData(true, true); // Force AND Silent refresh
        } else {
            stopAdminPolling();
        }
    }, 15000);
}

function stopAdminPolling() {
    if (adminPollInterval) {
        clearInterval(adminPollInterval);
        adminPollInterval = null;
        console.log('Admin Polling Stopped');
    }
}

function switchView(viewName) {
  // Admin users can only access admin view
  if (currentUser && currentUser.role === 'admin' && viewName !== 'admin') {
      viewName = 'admin';
  }
  
  // If we are on index.html, we don't have view-login anymore
  $('[id^="view-"]').addClass('hidden');
  $('.nav-item').removeClass('active');
  $(`#view-${viewName}`).removeClass('hidden'); 

  // Toggle Fullscreen Mode for Admin
  if (viewName === 'admin') {
      $('#main-content').addClass('fullscreen-mode').removeClass('max-w-md mx-auto');
  } else {
      $('#main-content').removeClass('fullscreen-mode').addClass('max-w-md mx-auto');
  }
  
  if (viewName !== 'login') {
    // Stop camera if leaving dashboard
    if (viewName !== 'dashboard') stopCamera();
    
    // Basic Admin Protection
    if (viewName === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
        return switchView('dashboard');
    }

    // Navigation Logic for Admin vs User
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    // Reset all
    $('#navDashboard, #navHistory, #navAdmin').addClass('hidden').removeClass('active');
    
    if (isAdmin) {
        // Admins see Admin portal and History
        $('#navAdmin, #navHistory').removeClass('hidden');
        if (viewName === 'admin') $('#navAdmin').addClass('active');
        if (viewName === 'history') $('#navHistory').addClass('active');
    } else {
        // Users see Clock-in and History
        $('#navDashboard, #navHistory').removeClass('hidden');
        if (viewName === 'dashboard') $('#navDashboard').addClass('active');
        if (viewName === 'history') $('#navHistory').addClass('active');
    }
  }

  if (viewName === 'admin') {
      startAdminPolling();
      if (!activeAdminTab) setAdminTab('users'); // Default to users if not set
      else setAdminTab(activeAdminTab); // Maintain current tab
  } else {
      stopAdminPolling();
  }

  if (viewName === 'dashboard') {
      if (typeof Camera !== 'undefined') setupDashboard();
      else console.warn('Camera UI requested but libraries not loaded');
  }
  if (viewName === 'history') loadHistory();
  if (viewName === 'admin') {
      loadUsers(); // Load users data when entering admin view
  }
}

function showLoading(show) {
  if (show) $('#loading-overlay').css('display', 'flex').show();
  else $('#loading-overlay').hide();
}

/**
 * 🔐 AUTH
 */
async function handleLogin(e) {
  e.preventDefault();
  const username = $('#username').val();
  const rawPassword = $('#password').val();
  const password = await hashPassword(rawPassword); // Hash with SHA-256
  const remember = $('#chkRemember').is(':checked');
  const res = await callAPI('login', { username, password: password });
  if (res.success) {
    currentUser = res.user;
    if (remember) localStorage.setItem('worklogs_user', JSON.stringify(res.user));
    
    // Clear cache on login to ensure fresh data for new session
    Object.keys(localStorage).forEach(key => { if(key.startsWith('cache_')) localStorage.removeItem(key); });
    
    Swal.fire({ 
        icon: 'success', 
        title: 'สวัสดีคุณ ' + res.user.name, 
        timer: 1500, 
        showConfirmButton: false,
        background: 'rgba(255, 255, 255, 0.95)',
        backdrop: 'rgba(30, 58, 138, 0.2) blur(10px)'
    }).then(() => {
        window.location.href = 'index.html';
    });
  } else {
    Swal.fire('ล้มเหลว', res.message, 'error');
  }
}

function logout() {
    localStorage.removeItem('worklogs_user');
    window.location.href = 'login.html';
}

/**
 * 📍 DASHBOARD LOGIC (Same as before but decoupled)
 */
function setupDashboard() {
  $('#txtUserName').text(currentUser.name);
  $('#txtUserCompany').text(currentUser.company);
  const avatarUrl = currentUser.profile || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.name)}&backgroundColor=1e3a8a`;
  $('#userAvatar').attr('src', avatarUrl);
  startCamera();
  initMapAndGPS();
  checkTodayStatus(false); // First time show loading, then silent
}

function initMapAndGPS() {
  isLocationReady = false;
  $('#gpsStatusBadge').removeClass('bg-green-100 text-green-800').addClass('bg-yellow-100 text-yellow-800 animate-pulse').text('กำลังค้นหา...');
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      currentCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $('#txtLat').text(currentCoords.lat.toFixed(5));
      $('#txtLon').text(currentCoords.lng.toFixed(5));
      isLocationReady = true;
      $('#gpsStatusBadge').removeClass('bg-yellow-100 animate-pulse').addClass('bg-green-100').text('พบพิกัดแล้ว');
      renderMap(currentCoords.lat, currentCoords.lng);
      checkButtonStatus();
    }, err => { Swal.fire('Error', 'กรุณาเปิด GPS', 'error'); }, { enableHighAccuracy: true });
  }
}

function renderMap(lat, lng) {
  if (map) { map.setView([lat, lng], 16); marker.setLatLng([lat, lng]); return; }
  map = L.map('mapPreview', { zoomControl: false }).setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  marker = L.marker([lat, lng]).addTo(map);
}

async function startCamera() {
  stopCamera(); // Ensure clean start
  const videoElement = document.getElementById('videoFeed');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } });
    videoStream = stream;
    videoElement.srcObject = stream;
    
    if (camera) { await camera.stop(); camera = null; }
    
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (faceDetection && !lastCapturedPhoto) {
          await faceDetection.send({image: videoElement});
        }
      },
      width: 480, height: 480
    });
    camera.start();
  } catch (e) { 
    console.error('Camera Error:', e);
    let msg = 'ไม่สามารถเข้าถึงกล้องได้';
    if (e.name === 'NotAllowedError') msg = 'กรุณาอนุญาตการเข้าถึงกล้องเพื่อลงเวลา';
    if (e.name === 'NotReadableError') msg = 'กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปที่ใช้กล้องหรือรีเฟรชเบราว์เซอร์';
    Swal.fire('Camera Error', msg, 'error'); 
  }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (camera) {
        camera.stop();
    }
    const videoElement = document.getElementById('videoFeed');
    if (videoElement) videoElement.srcObject = null;
}

function initFaceDetection() {
  faceDetection = new FaceDetection({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
  });
  
  faceDetection.setOptions({
    model: 'short',
    minDetectionConfidence: 0.5
  });
  
  faceDetection.onResults(onFaceResults);
}

function onFaceResults(results) {
  const badge = $('#faceStatusBadge');
  const indicator = $('#faceIndicator');
  const txt = $('#txtFaceStatus');
  
  let isCentered = false;
  
  if (results.detections.length > 0) {
    const detect = results.detections[0].boundingBox;
    const centerX = detect.xCenter;
    const centerY = detect.yCenter;
    
    // Check if center of face is within +/- 15% of the frame center
    const tolerance = 0.15;
    const dist = Math.sqrt(Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2));
    
    if (dist < tolerance) {
      isCentered = true;
    }
  }

  if (isCentered) {
    isFaceInFrame = true;
    badge.find('span:first').removeClass('bg-rose-500').addClass('bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]');
    txt.text('ใบหน้าตรงตำแหน่ง ✅');
    indicator.removeClass('hidden');
    $('#btnCapture').prop('disabled', false).removeClass('opacity-50');
  } else {
    isFaceInFrame = false;
    badge.find('span:first').removeClass('bg-emerald-500').addClass('bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]');
    txt.text(results.detections.length > 0 ? 'กรุณาจัดใบหน้าให้ตรงกลาง' : 'ไม่พบใบหน้า');
    indicator.addClass('hidden');
    $('#btnCapture').prop('disabled', true).addClass('opacity-50');
  }
}

function capturePhoto() {
  const v = document.getElementById('videoFeed');
  const c = document.getElementById('photoCanvas');
  const ctx = c.getContext('2d');
  
  // Smaller cap size to stay under 47K
  c.width = 400; c.height = 400 * (v.videoHeight / v.videoWidth);
  
  ctx.save();
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(v, 0, 0, c.width, c.height);
  ctx.restore();
  
  lastCapturedPhoto = c.toDataURL('image/webp', 0.6); // Lower quality for stability
  isPhotoConfirmed = false;
  
  // Show Review UI
  $('#photoPreview').attr('src', lastCapturedPhoto).removeClass('hidden');
  $('#videoFeed, #cameraGuide').addClass('hidden');
  $('#photoReviewOverlay').removeClass('hidden');
  $('#btnRetake').removeClass('hidden');
  $('#btnConfirmPhoto').removeClass('hidden');
  $('#btnCapture').addClass('hidden');
}

function confirmPhoto() {
  isPhotoConfirmed = true;
  $('#photoReviewOverlay').fadeOut(300);
  $('#btnConfirmPhoto').addClass('hidden');
  $('#btnRetake').addClass('hidden');
  $('#btnCapture').removeClass('hidden').html('<i class="fas fa-camera"></i> ถ่ายใหม่').prop('disabled', false).removeClass('opacity-50');
  
  // Show/Update Attendance Buttons
  $('#attendanceHint').fadeOut(300);
  checkButtonStatus();
}

function retakePhoto() {
  isPhotoConfirmed = false;
  lastCapturedPhoto = null;
  $('#photoPreview, #photoReviewOverlay').addClass('hidden');
  $('#videoFeed, #cameraGuide').removeClass('hidden');
  $('#btnRetake, #btnConfirmPhoto').addClass('hidden');
  $('#btnCapture').removeClass('hidden').html('<i class="fas fa-camera"></i> ถ่ายรูปเซลฟี่').prop('disabled', true).addClass('opacity-50');
  
  $('#attendanceHint').fadeIn(300);
  checkButtonStatus();
}

function checkButtonStatus() {
  const hasGPS = $('#txtLat').text() !== '...';
  const hint = $('#attendanceHint');
  
  // Logic: 
  // - In: only if not checked in yet
  // - Out: only if checked in AND not checked out yet
  
  $('#btnIn').prop('disabled', hasCheckedInToday);
  $('#btnOut').prop('disabled', !hasCheckedInToday || hasCheckedOutToday);
  
  // Update Remarks (Hints)
  if (!hasCheckedInToday) {
      if (!isPhotoConfirmed) hint.text('💡 กรุณาถ่ายรูปเซลฟี่เพื่อ "เข้างาน"');
      else if (!hasGPS) hint.text('📍 รอพิกัด GPS สักครู่เพื่อเริ่มงาน');
      else hint.text('✅ พร้อมแล้ว! กดปุ่ม "เข้างาน" ได้เลย');
  } else if (!hasCheckedOutToday) {
      if (!isPhotoConfirmed) hint.text('💡 บันทึกเข้างานแล้ว ถ่ายรูปอีกครั้งเพื่อ "ออกงาน"');
      else if (!hasGPS) hint.text('📍 รอพิกัด GPS สักครู่เพื่อออกงาน');
      else hint.text('✅ พร้อมแล้ว! กดปุ่ม "ออกงาน" เพื่อจบวัน');
  } else {
      hint.html('<span class="text-emerald-500">✨ วันนี้คุณลงเวลาครบถ้วนแล้ว ขอบคุณที่ทำงานหนักนะคะ!</span>');
  }

  // Visual feedback
  if (hasCheckedInToday) $('#btnIn').html('<i class="fas fa-check-circle mr-2"></i> เข้าแล้ว').addClass('bg-slate-200 shadow-none');
  else $('#btnIn').html('<i class="fas fa-sign-in-alt mr-2"></i> เข้างาน').removeClass('bg-slate-200 shadow-none');
  
  if (hasCheckedOutToday) $('#btnOut').html('<i class="fas fa-check-circle mr-2"></i> ออกแล้ว').addClass('bg-slate-200 shadow-none');
  else $('#btnOut').html('<i class="fas fa-sign-out-alt mr-2"></i> ออกงาน').removeClass('bg-slate-200 shadow-none');
}

async function handleAttendanceClick(status) {
  const hasGPS = $('#txtLat').text() !== '...';
  
  if (!isPhotoConfirmed) {
      return Swal.fire({
          icon: 'warning',
          title: 'กรุณาถ่ายรูปก่อน',
          text: 'ต้องถ่ายรูปเซลฟี่และกดยืนยันรูปภาพก่อนทำการ' + status,
          confirmButtonText: 'รับทราบ',
          confirmButtonColor: '#3b82f6'
      });
  }
  
  if (!hasGPS) {
      return Swal.fire({
          icon: 'info',
          title: 'กำลังค้นหาตำแหน่ง',
          text: 'กรุณารอสักครู่เพื่อให้ระบบระบุพิกัด GPS ให้เรียบร้อยก่อนครับ',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#1e3a8a'
      });
  }

  submitAttendance(status);
}

async function checkTodayStatus(silent = true) {
  if (!currentUser) return;
  const res = await callAPI('get_history', { user_id: String(currentUser.id) }, silent);
  if (res.success) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Reset flags
    hasCheckedInToday = false;
    hasCheckedOutToday = false;

    res.history.forEach(h => {
       if (!h.date) return;
       const hDate = h.date.includes('T') ? h.date.split('T')[0] : h.date;
       if (hDate.startsWith(todayStr)) {
           if (h.status === 'เข้างาน') hasCheckedInToday = true;
           if (h.status === 'ออกงาน') hasCheckedOutToday = true;
       }
    });
    
    checkButtonStatus();
  }
}

async function submitAttendance(status) {
  const res = await callAPI('save_attendance', { 
    user_id: currentUser.id, 
    status, 
    latitude: currentCoords.lat, 
    longitude: currentCoords.lng, 
    selfie_base64: lastCapturedPhoto 
  });
  if (res.success) {
    Swal.fire('บันทึกสำเร็จ', status + ' เรียบร้อย', 'success').then(() => {
        retakePhoto();
        checkTodayStatus();
        switchView('history');
    });
  }
}

async function loadHistory(force = false) {
  const cached = force ? null : getCache('get_history', currentUser.id);
  if (cached) {
    personalHistoryData = cached.history;
    renderHistoryFiltered();
  }
  
  const res = await callAPI('get_history', { user_id: currentUser.id }, (!!cached && !force));
  if (res.success) {
    personalHistoryData = res.history;
    renderHistoryFiltered();
  }
}

function clearHistFilters() {
    $('#histFilterDate').val('');
    $('#histFilterMonth').val('');
    historyCurrentPage = 1;
    renderHistoryFiltered();
}

function changeHistPage(offset) {
    historyCurrentPage += offset;
    renderHistoryFiltered();
}

function renderHistoryFiltered() {
    const filterDate = $('#histFilterDate').val(); // YYYY-MM-DD
    const filterMonth = $('#histFilterMonth').val(); // YYYY-MM
    
    let filtered = personalHistoryData;
    
    if (filterDate) {
        filtered = filtered.filter(item => {
            // item.date format from backend is "DD/MM/YYYY HH:MM:SS" or Date string
            let dString = item.date;
            if (dString.includes('/')) {
                const parts = dString.split(' ')[0].split('/');
                dString = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            return dString.startsWith(filterDate);
        });
    } else if (filterMonth) {
        filtered = filtered.filter(item => {
            let dString = item.date;
            if (dString.includes('/')) {
                const parts = dString.split(' ')[0].split('/');
                dString = `${parts[2]}-${parts[1]}`;
            }
            return dString.startsWith(filterMonth);
        });
    }
    
    // Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / historyItemsPerPage) || 1;
    
    if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
    if (historyCurrentPage < 1) historyCurrentPage = 1;
    
    const start = (historyCurrentPage - 1) * historyItemsPerPage;
    const paginatedData = filtered.slice(start, start + historyItemsPerPage);
    
    // Update Pagination UI
    if (totalItems > historyItemsPerPage || filterDate || filterMonth) {
        $('#histPagination').removeClass('hidden');
        $('#histCurrentPage').text(historyCurrentPage);
        $('#histTotalPages').text(totalPages);
        $('#btnHistPrev').prop('disabled', historyCurrentPage === 1);
        $('#btnHistNext').prop('disabled', historyCurrentPage === totalPages);
    } else {
        $('#histPagination').addClass('hidden');
    }
    
    renderHistory(paginatedData);
}

function renderHistory(data) {
  if (data.length === 0) {
    $('#historyList').html('<div class="premium-card p-10 text-center"><i class="fas fa-info-circle text-slate-200 text-4xl mb-4"></i><p class="text-slate-400 text-sm font-bold">ยังไม่มีประวัติการลงเวลา</p></div>');
    return;
  }
  let html = data.map(item => `
    <div class="premium-card p-5 flex justify-between items-center group animate-in slide-in-from-right-5 duration-300">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 ${item.status === 'เข้างาน' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'} rounded-2xl flex items-center justify-center text-lg shadow-sm">
            <i class="fas ${item.status === 'เข้างาน' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'}"></i>
        </div>
        <div>
          <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${item.status === 'เข้างาน' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'} mb-1 shadow-md shadow-opacity-20">${item.status}</span>
          <p class="font-black text-slate-700 text-[11px] leading-tight">${formatThaiDate(item.date)}</p>
        </div>
      </div>
      <a href="${item.map_link}" target="_blank" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm"><i class="fas fa-map-marked-alt text-xs"></i></a>
    </div>
  `).join('');
  $('#historyList').html(html);
}

/** 👑 ADMIN PORTAL LOGIC */
function setAdminTab(tab) {
  activeAdminTab = tab;
  $('.admin-tab-btn').removeClass('bg-corporate-900 border-none text-white shadow-xl shadow-blue-900/10').addClass('bg-transparent text-slate-400');
  $(`#tab-${tab}`).addClass('bg-corporate-900 text-white shadow-xl shadow-blue-900/10').removeClass('bg-transparent text-slate-400');
  $('.admin-sub-view').addClass('hidden');
  $(`#admin-sub-${tab}`).removeClass('hidden');
  
  if (tab === 'logs') loadAdminData();
  if (tab === 'users') loadUsers();
  if (tab === 'mock') { /* Just show tab */ }
}

function updateAdminUserFilter() {
  if (!$('#filterStartDate').val()) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];
      $('#filterStartDate').val(firstDay);
      $('#filterEndDate').val(today);
  }
  
  const options = ['<option value="">-- พนักงานทั้งหมด --</option>'];
  const uniqueUsers = [...new Set(adminData.map(r => r.user_id))];
  uniqueUsers.forEach(uid => {
      const rec = adminData.find(r => r.user_id === uid);
      if (rec) options.push(`<option value="${uid}">${rec.name}</option>`);
  });
  $('#filterUser').html(options.join(''));
}

async function loadAdminData(force = false, silent = false) {
  const cached = force ? null : getCache('get_admin_data');
  if (cached) { adminData = cached.records; updateAdminUserFilter(); renderAdminLogs(); }
  
  const isSilent = silent || (!!cached && !force);
  const res = await callAPI('get_admin_data', {}, isSilent);
  if (res.success) {
    adminData = res.records;
    updateAdminUserFilter();
    renderAdminLogs();
  }
}

function getFilteredAdminRecords() {
  const start = $('#filterStartDate').val();
  const end = $('#filterEndDate').val();
  const userId = $('#filterUser').val();
  
  const startTime = start ? new Date(start + 'T00:00:00').getTime() : 0;
  const endTime = end ? new Date(end + 'T23:59:59').getTime() : Infinity;

  return adminData.filter(r => {
    let rDate = null;
    if (r.date && String(r.date).includes('/')) {
        const p = r.date.split(' ')[0].split('/');
        rDate = new Date(`${p[2]}-${p[1]}-${p[0]}T00:00:00`);
    } else if (r.date) {
        rDate = new Date(r.date);
    }
    
    const rTime = rDate ? rDate.getTime() : 0;
    const dateMatch = rTime >= startTime && rTime <= endTime;
    const userMatch = userId ? String(r.user_id) === String(userId) : true;
    return dateMatch && userMatch;
  });
}

function renderAdminLogs() {
  const filtered = getFilteredAdminRecords();
  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / adminRowsPerPage) || 1;
  
  if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
  if (adminCurrentPage < 1) adminCurrentPage = 1;

  const start = (adminCurrentPage - 1) * adminRowsPerPage;
  const pageData = filtered.slice(start, start + adminRowsPerPage);

  // Update UI Stats
  $('#logCount').text(`${totalRecords} รายการ`);
  $('#currentPageNum').text(adminCurrentPage);
  $('#totalPageNum').text(totalPages);
  $('#btnPrevPage').prop('disabled', adminCurrentPage === 1);
  $('#btnNextPage').prop('disabled', adminCurrentPage === totalPages);

  if (pageData.length === 0) {
      $('#adminTableBody').html('<tr><td colspan="6" class="p-10 text-center text-slate-300 font-medium">ไม่พบข้อมูลบันทึกเวลา</td></tr>');
      return;
  }

  $('#adminTableBody').html(pageData.map(r => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-4">
        <div class="flex items-center gap-3">
            <div class="font-bold text-slate-800">${r.name}</div>
        </div>
      </td>
      <td class="p-4">
        <div class="text-slate-500 font-mono">${formatThaiDate(r.date)}</div>
      </td>
      <td class="p-4 text-center">
        ${r.selfie ? `<img src="${r.selfie}" class="w-10 h-10 rounded-lg object-cover mx-auto shadow-sm border border-white cursor-pointer" onclick="showImageLightbox('${r.selfie}','Selfie')">` : '<span class="text-slate-300">-</span>'}
      </td>
      <td class="p-4 text-center">
        <span class="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${r.status==='เข้างาน'?'bg-emerald-100 text-emerald-700':'bg-rose-100 text-rose-700'}">${r.status}</span>
      </td>
      <td class="p-4 text-[10px] text-slate-400 font-mono">
        ${(r.latitude !== undefined && r.latitude !== null && !isNaN(parseFloat(r.latitude))) ? parseFloat(r.latitude).toFixed(4) : '0.0000'}, 
        ${(r.longitude !== undefined && r.longitude !== null && !isNaN(parseFloat(r.longitude))) ? parseFloat(r.longitude).toFixed(4) : '0.0000'}
      </td>
      <td class="p-4 text-center">
        <a href="${r.map_link}" target="_blank" class="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg inline-flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all shadow-sm shadow-blue-100"><i class="fas fa-map-marked-alt text-xs"></i></a>
      </td>
    </tr>
  `).join(''));
}

function changeAdminPage(offset) {
    adminCurrentPage += offset;
    renderAdminLogs();
    $('#admin-sub-logs').parent().scrollTop(0);
}

async function loadUsers(force = false) {
  const cached = force ? null : getCache('get_users');
  if (cached) { adminUsers = cached.users; renderUsersTable(); }
  
  const res = await callAPI('get_users', {}, (!!cached && !force));
  if (res.success) {
    adminUsers = res.users;
    renderUsersTable();
  }
}

async function runAdminSelfTest() {
  if (!currentUser || currentUser.role !== 'admin') {
    Swal.fire('ไม่มีสิทธิ์', 'ฟังก์ชันทดสอบนี้ใช้ได้เฉพาะแอดมิน', 'warning');
    return;
  }

  const testIdTag = String(Date.now()).slice(-6);
  const testUsername = `test_admin_${testIdTag}`;
  const testFirst = 'TEST';
  const testLast = `ADMIN_${testIdTag}`;
  const testCompany = `TEST_CO_${testIdTag}`;
  const testRole = 'user';
  const testProfile = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="20" fill="#3b82f6"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="34" font-family="Arial" fill="#fff">T${testIdTag}</text></svg>`);

  const results = [];
  const push = (name, ok, detail = '') => results.push({ name, ok, detail });
  let createdUserId = '';

  const renderSummary = () => {
    const passCount = results.filter(r => r.ok).length;
    const failCount = results.length - passCount;
    const html = `
      <div class="text-left text-sm">
        <div class="font-black mb-2">ผลทดสอบ: ผ่าน ${passCount}/${results.length} รายการ</div>
        ${results.map(r => `
          <div class="flex items-start gap-2 mb-1">
            <span style="width:18px">${r.ok ? '✅' : '❌'}</span>
            <div>
              <div class="font-bold">${r.name}</div>
              ${r.detail ? `<div class="text-xs text-slate-500">${r.detail}</div>` : ''}
            </div>
          </div>
        `).join('')}
        ${failCount ? '<div class="mt-2 text-xs text-rose-600 font-bold">มีบางรายการล้มเหลว ดู Console เพิ่มเติม</div>' : ''}
      </div>
    `;
    return Swal.fire({
      icon: failCount ? 'error' : 'success',
      title: 'Admin Self-Test',
      html,
      confirmButtonText: 'ปิด'
    });
  };

  try {
    // 1) create_user
    const createRes = await callAPI('create_user', {
      first_name: testFirst,
      last_name: testLast,
      username: testUsername,
      password: await hashPassword('1234'),
      company: testCompany,
      role: testRole,
      profile: testProfile
    });
    push('create_user', !!createRes.success, createRes.success ? 'สร้างผู้ใช้ทดสอบเรียบร้อย' : (createRes.message || 'ไม่ทราบสาเหตุ'));

    // 2) get_users + find created
    const list1 = await callAPI('get_users', {}, true);
    const found1 = list1.success ? (list1.users || []).find(u => u.username === testUsername) : null;
    createdUserId = found1?.id || '';
    push('get_users (after create)', !!found1, found1 ? `พบ user id: ${createdUserId}` : 'ไม่พบผู้ใช้ทดสอบ');
    push('profile saved (after create)', !!(found1 && found1.profile && String(found1.profile).startsWith('data:image/')), found1?.profile ? 'มีค่า profile' : 'profile ว่าง/ไม่มี');

    // 3) update_user
    if (createdUserId) {
      const newCompany = `${testCompany}_UPDATED`;
      const updateRes = await callAPI('update_user', {
        id: createdUserId,
        first_name: testFirst,
        last_name: testLast,
        username: testUsername,
        password: found1.password,
        company: newCompany,
        role: 'admin',
        profile: testProfile
      });
      push('update_user', !!updateRes.success, updateRes.success ? 'อัปเดตข้อมูลเรียบร้อย' : (updateRes.message || 'ไม่ทราบสาเหตุ'));

      const list2 = await callAPI('get_users', {}, true);
      const found2 = list2.success ? (list2.users || []).find(u => u.id === createdUserId) : null;
      push('get_users (after update)', !!found2, found2 ? 'ดึงข้อมูลหลังอัปเดตได้' : 'ไม่พบผู้ใช้ทดสอบหลังอัปเดต');
      push('company updated', !!(found2 && found2.company === newCompany), found2 ? `company: ${found2.company}` : '');
      push('role updated', !!(found2 && found2.role === 'admin'), found2 ? `role: ${found2.role}` : '');
      push('profile still present', !!(found2 && found2.profile && String(found2.profile).startsWith('data:image/')), found2?.profile ? 'มีค่า profile' : 'profile ว่าง/ไม่มี');
    } else {
      push('update_user', false, 'ข้ามเพราะไม่พบ createdUserId');
    }
  } catch (e) {
    console.error('Self-test error', e);
    push('self-test runtime', false, String(e));
  } finally {
    // Cleanup: delete_user
    try {
      if (!createdUserId) {
        // Try find by username again
        const list3 = await callAPI('get_users', {}, true);
        const found3 = list3.success ? (list3.users || []).find(u => u.username === testUsername) : null;
        createdUserId = found3?.id || '';
      }

      if (createdUserId) {
        const delRes = await callAPI('delete_user', { user_id: createdUserId }, true);
        push('delete_user (cleanup)', !!delRes.success, delRes.success ? 'ลบข้อมูลทดสอบแล้ว' : (delRes.message || 'ลบไม่สำเร็จ'));
      } else {
        push('delete_user (cleanup)', false, 'ไม่พบ user id สำหรับลบข้อมูลทดสอบ');
      }
    } catch (e) {
      console.error('Cleanup error', e);
      push('delete_user (cleanup)', false, String(e));
    }

    // Refresh table
    await loadUsers();
    await renderSummary();
  }
}

function renderUsersTable() {
  $('#userTableBody').html(adminUsers.map(u => `
    <tr class="border-b hover:bg-slate-50 transition-colors">
      <td class="p-2">
        <div class="flex items-center gap-3">
          <img src="${u.profile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.first_name}`}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-200 shadow-sm" alt="${u.first_name}">
          <div>
            <div class="font-medium text-slate-800">${u.first_name} ${u.last_name}</div>
            <div class="text-xs text-slate-500">${u.username}</div>
          </div>
        </div>
      </td>
      <td class="p-2">
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
          <i class="fas ${u.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
          ${u.role === 'admin' ? 'แอดมิน' : 'พนักงาน'}
        </span>
      </td>
      <td class="p-2 text-slate-600 text-sm">${u.company || '-'}</td>
      <td class="p-2 text-center">
        <div class="flex justify-center gap-2">
          <button onclick="editUser('${u.id}')" class="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-sm transition-colors" title="แก้ไข">
            <i class="fas fa-edit text-xs"></i>
          </button>
          <button onclick="confirmDeleteUser('${u.id}')" class="w-8 h-8 bg-rose-500 hover:bg-rose-600 text-white rounded-lg flex items-center justify-center shadow-sm transition-colors" title="ลบ">
            <i class="fas fa-trash text-xs"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join(''));
}

async function openAddUserModal() {
  // Create modal HTML
  const modalHtml = `
    <div id="add-user-modal" class="space-y-4 p-2">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">ชื่อ <span class="text-red-500">*</span></label>
          <input id="swal-fn" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="กรอกชื่อจริง">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">นามสกุล <span class="text-red-500">*</span></label>
          <input id="swal-ln" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="กรอกนามสกุล">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">ชื่อผู้ใช้งาน <span class="text-red-500">*</span></label>
        <input id="swal-user" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="ชื่อผู้ใช้สำหรับล็อกอิน">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">รหัสผ่าน</label>
        <input id="swal-pw" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" type="password" placeholder="รหัสผ่าน (เว้นว่าง = 1234)">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">บริษัท <span class="text-red-500">*</span></label>
        <input id="swal-company" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="ชื่อบริษัท">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">สิทธิ์ผู้ใช้งาน</label>
        <select id="swal-role" class="swal2-select !m-0 !w-full h-10 text-sm rounded-lg border-slate-200">
          <option value="user">พนักงานทั่วไป</option>
          <option value="admin">ผู้ดูแลระบบ</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-2">รูปโปรไฟล์ (ไม่บังคับ)</label>
        <div class="relative w-full h-28" id="upload-container">
          <input type="file" id="swal-file" class="hidden" accept="image/*">
          <!-- Upload Button State -->
          <label for="swal-file" id="upload-label" class="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors duration-200">
            <svg class="w-8 h-8 mb-1 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <p class="text-xs text-blue-600 font-medium">คลิกเพื่ออัปโหลดรูป</p>
            <p class="text-xs text-blue-400">PNG, JPG สูงสุด 2MB</p>
          </label>
          <!-- Preview State - Inside the box -->
          <div id="swal-preview" class="hidden absolute inset-0 flex items-center justify-center bg-white rounded-xl border-2 border-green-400">
            <div class="relative group cursor-pointer" id="preview-clickable" title="คลิกเพื่อดูรูปขนาดเต็ม">
              <img id="swal-preview-img" class="h-20 w-20 object-cover rounded-full border-2 border-green-400 shadow-md group-hover:opacity-90 transition-opacity" alt="Preview">
              <!-- Hover overlay -->
              <div class="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              </div>
            </div>
            <!-- Remove button -->
            <button type="button" id="swal-remove-file" class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors w-7 h-7 flex items-center justify-center z-10">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <!-- Status text below box -->
        <div class="mt-2 flex items-center justify-center gap-2">
          <span id="swal-file-name" class="text-xs text-slate-500 truncate max-w-[200px]">ยังไม่ได้เลือกไฟล์</span>
          <span id="swal-file-badge" class="hidden text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ อัปโหลดแล้ว</span>
        </div>
      </div>
    </div>
  `;

  // Show modal with custom buttons
  const result = await Swal.fire({
    title: 'เพิ่มพนักงานใหม่',
    width: 600,
    html: modalHtml,
    showCancelButton: true,
    confirmButtonText: 'บันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#3b82f6',
    cancelButtonColor: '#94a3b8',
    focusConfirm: false,
    allowOutsideClick: false,
    didOpen: () => {
      // Setup file input handlers after modal opens
      const fileInput = document.getElementById('swal-file');
      const preview = document.getElementById('swal-preview');
      const previewImg = document.getElementById('swal-preview-img');
      const fileName = document.getElementById('swal-file-name');
      const fileBadge = document.getElementById('swal-file-badge');
      const removeBtn = document.getElementById('swal-remove-file');
      const uploadLabel = document.getElementById('upload-label');
      const previewClickable = document.getElementById('preview-clickable');
      
      // Click to view full size image
      if (previewClickable) {
        previewClickable.onclick = (e) => {
          e.preventDefault();
          const src = previewImg.src;
          if (src) showImageLightbox(src, 'รูปโปรไฟล์');
        };
      }
      
      fileInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
          // Show preview immediately
          const reader = new FileReader();
          reader.onload = function(e) {
            previewImg.src = e.target.result;
            preview.classList.remove('hidden');
            uploadLabel.classList.add('hidden');
            fileName.textContent = file.name;
            fileName.classList.add('text-green-600');
            fileBadge.classList.remove('hidden');
          };
          reader.readAsDataURL(file);
        }
      });
      
      removeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.value = '';
        preview.classList.add('hidden');
        uploadLabel.classList.remove('hidden');
        fileName.textContent = 'ยังไม่ได้เลือกไฟล์';
        fileName.classList.remove('text-green-600');
        fileBadge.classList.add('hidden');
      });
    },
    preConfirm: async () => {
      const username = document.getElementById('swal-user').value.trim();
      const first_name = document.getElementById('swal-fn').value.trim();
      const last_name = document.getElementById('swal-ln').value.trim();
      const company = document.getElementById('swal-company').value.trim();
      const role = document.getElementById('swal-role').value;
      
      // Validation
      if (!username || !first_name || !last_name || !company) {
        Swal.showValidationMessage('กรุณากรอกข้อมูลที่จำเป็นให้ครบค่ะ (ชื่อ, นามสกุล, ชื่อผู้ใช้งาน, บริษัท)');
        return false;
      }

      // Get file data
      const file = document.getElementById('swal-file').files[0];
      let profileBase64 = '';
      if (file) {
        const rawBase64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        profileBase64 = await compressImage(rawBase64); // Compress here
      }

      return {
        first_name,
        last_name,
        username,
        password: await hashPassword(document.getElementById('swal-pw').value || '1234'),
        company,
        role,
        profile: profileBase64
      };
    }
  });

  // Handle result
  if (result.isConfirmed && result.value) {
    // Show confirmation dialog before saving
    const confirmResult = await Swal.fire({
      title: 'ยืนยันการบันทึก?',
      html: `
        <div class="text-left text-sm">
          <p><strong>ชื่อ:</strong> ${result.value.first_name} ${result.value.last_name}</p>
          <p><strong>ชื่อผู้ใช้:</strong> ${result.value.username}</p>
          <p><strong>บริษัท:</strong> ${result.value.company}</p>
          <p><strong>สิทธิ์:</strong> ${result.value.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานทั่วไป'}</p>
          ${result.value.profile ? '<p class="text-green-600">✓ มีรูปโปรไฟล์</p>' : '<p class="text-slate-400">ไม่มีรูปโปรไฟล์</p>'}
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบันทึก',
      cancelButtonText: 'กลับไปแก้ไข',
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#94a3b8'
    });

    if (confirmResult.isConfirmed) {
      const res = await callAPI('create_user', result.value);
      if (res.success) {
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'เพิ่มพนักงานใหม่เรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        });
        loadUsers();
      }
    }
  }
}

async function confirmDeleteUser(id) {
    const result = await Swal.fire({ 
        title: 'ยืนยันการลบ?', 
        text: "ข้อมูลพนักงานจะหายไปจากระบบ", 
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ลบข้อมูล',
        cancelButtonText: 'ยกเลิก'
    });
    if (result.isConfirmed) {
        const res = await callAPI('delete_user', { user_id: id });
        if (res.success) { Swal.fire('ลบแล้ว', '', 'success'); loadUsers(); }
    }
}

async function editUser(id) {
    const u = adminUsers.find(x => x.id === id);
    if (!u) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลพนักงาน', 'error');
        return;
    }
    
    // Create modal HTML
    const modalHtml = `
    <div id="edit-user-modal" class="space-y-4 p-2">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">ชื่อ <span class="text-red-500">*</span></label>
          <input id="swal-fn" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="กรอกชื่อจริง" value="${u.first_name || ''}">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">นามสกุล <span class="text-red-500">*</span></label>
          <input id="swal-ln" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="กรอกนามสกุล" value="${u.last_name || ''}">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">ชื่อผู้ใช้งาน <span class="text-red-500">*</span></label>
        <input id="swal-user" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="ชื่อผู้ใช้สำหรับล็อกอิน" value="${u.username || ''}">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">รหัสผ่าน</label>
        <input id="swal-pw" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" type="password" placeholder="รหัสผ่าน (เว้นว่าง = ไม่เปลี่ยน)">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">บริษัท <span class="text-red-500">*</span></label>
        <input id="swal-company" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200" placeholder="ชื่อบริษัท" value="${u.company || ''}">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">สิทธิ์ผู้ใช้งาน</label>
        <select id="swal-role" class="swal2-select !m-0 !w-full h-10 text-sm rounded-lg border-slate-200">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>พนักงานทั่วไป</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-2">รูปโปรไฟล์ (ไม่บังคับ)</label>
        <div class="relative w-full h-28" id="upload-container">
          <input type="file" id="swal-file" class="hidden" accept="image/*">
          ${u.profile ? `
          <!-- Has existing profile -->
          <div id="current-profile" class="absolute inset-0 flex items-center justify-center bg-blue-50 rounded-xl border-2 border-blue-300">
            <div class="relative group cursor-pointer" id="current-profile-clickable" title="คลิกเพื่อดูรูปขนาดเต็ม">
              <img id="current-profile-img" src="${u.profile}" class="h-20 w-20 object-cover rounded-full border-2 border-blue-400 shadow-md group-hover:opacity-90 transition-opacity" alt="Current Profile">
              <div class="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              </div>
            </div>
            <button type="button" id="swal-remove-file" class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors w-7 h-7 flex items-center justify-center z-10" title="ลบรูป">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div id="swal-preview" class="hidden absolute inset-0 flex items-center justify-center bg-white rounded-xl border-2 border-green-400">
            <div class="relative group cursor-pointer" id="preview-clickable" title="คลิกเพื่อดูรูปขนาดเต็ม">
              <img id="swal-preview-img" class="h-20 w-20 object-cover rounded-full border-2 border-green-400 shadow-md group-hover:opacity-90 transition-opacity" alt="New Preview">
              <div class="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              </div>
            </div>
            <button type="button" id="cancel-new-file" class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors w-7 h-7 flex items-center justify-center z-10" title="ยกเลิก">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <label for="swal-file" id="change-photo-label" class="hidden absolute bottom-2 left-1/2 -translate-x-1/2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full text-xs cursor-pointer shadow-md transition-colors">
            เปลี่ยนรูป
          </label>
          ` : `
          <!-- No existing profile -->
          <label for="swal-file" id="upload-label" class="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors duration-200">
            <svg class="w-8 h-8 mb-1 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <p class="text-xs text-blue-600 font-medium">คลิกเพื่ออัปโหลดรูป</p>
            <p class="text-xs text-blue-400">PNG, JPG สูงสุด 2MB</p>
          </label>
          <div id="swal-preview" class="hidden absolute inset-0 flex items-center justify-center bg-white rounded-xl border-2 border-green-400">
            <div class="relative group cursor-pointer" id="preview-clickable" title="คลิกเพื่อดูรูปขนาดเต็ม">
              <img id="swal-preview-img" class="h-20 w-20 object-cover rounded-full border-2 border-green-400 shadow-md group-hover:opacity-90 transition-opacity" alt="Preview">
              <div class="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              </div>
            </div>
            <button type="button" id="cancel-new-file" class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-colors w-7 h-7 flex items-center justify-center z-10" title="ยกเลิก">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          `}
        </div>
        <div class="mt-2 flex items-center justify-center gap-2">
          <span id="swal-file-name" class="text-xs text-slate-500 truncate max-w-[200px]">${u.profile ? 'มีรูปโปรไฟล์แล้ว' : 'ยังไม่ได้เลือกไฟล์'}</span>
          <span id="swal-file-badge" class="${u.profile ? '' : 'hidden'} text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">รูปเดิม</span>
          <span id="swal-new-file-badge" class="hidden text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">รูปใหม่</span>
        </div>
      </div>
    </div>
    `;

    const result = await Swal.fire({
        title: 'แก้ไขข้อมูลพนักงาน',
        width: 600,
        html: modalHtml,
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#94a3b8',
        focusConfirm: false,
        allowOutsideClick: false,
        didOpen: () => {
            const fileInput = document.getElementById('swal-file');
            const preview = document.getElementById('swal-preview');
            const previewImg = document.getElementById('swal-preview-img');
            const fileName = document.getElementById('swal-file-name');
            const fileBadge = document.getElementById('swal-file-badge');
            const newFileBadge = document.getElementById('swal-new-file-badge');
            const currentProfile = document.getElementById('current-profile');
            const currentProfileImg = document.getElementById('current-profile-img');
            const currentProfileClickable = document.getElementById('current-profile-clickable');
            const previewClickable = document.getElementById('preview-clickable');
            const cancelNewFile = document.getElementById('cancel-new-file');
            const removeBtn = document.getElementById('swal-remove-file');
            const changePhotoLabel = document.getElementById('change-photo-label');
            
            // Click to view current profile image
            if (currentProfileClickable) {
                currentProfileClickable.onclick = (e) => {
                    e.preventDefault();
                    const src = currentProfileImg?.src;
                    if (src) showImageLightbox(src, 'รูปโปรไฟล์');
                };
            }
            
            // Click to view preview image
            if (previewClickable) {
                previewClickable.onclick = (e) => {
                    e.preventDefault();
                    const src = previewImg?.src;
                    if (src) showImageLightbox(src, 'รูปใหม่');
                };
            }
            
            if (fileInput) {
                fileInput.addEventListener('change', function() {
                    const file = this.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            previewImg.src = e.target.result;
                            preview.classList.remove('hidden');
                            if (currentProfile) currentProfile.classList.add('hidden');
                            if (changePhotoLabel) changePhotoLabel.classList.remove('hidden'); // Show button to change again
                            fileName.textContent = file.name;
                            fileName.classList.remove('text-slate-500');
                            fileName.classList.add('text-green-600');
                            if (fileBadge) fileBadge.classList.add('hidden');
                            if (newFileBadge) newFileBadge.classList.remove('hidden');
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
            
            if (cancelNewFile) {
                cancelNewFile.addEventListener('click', function(e) {
                    e.preventDefault();
                    fileInput.value = '';
                    preview.classList.add('hidden');
                    if (currentProfile) currentProfile.classList.remove('hidden');
                    if (changePhotoLabel) changePhotoLabel.classList.add('hidden'); // Hide if returning to current
                    fileName.textContent = u.profile ? 'มีรูปโปรไฟล์แล้ว' : 'ยังไม่ได้เลือกไฟล์';
                    fileName.classList.remove('text-green-600');
                    fileName.classList.add('text-slate-500');
                    if (fileBadge) fileBadge.classList.remove('hidden');
                    if (newFileBadge) newFileBadge.classList.add('hidden');
                });
            }
            
            if (removeBtn) {
                removeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (currentProfile) currentProfile.classList.add('hidden');
                    if (changePhotoLabel) changePhotoLabel.classList.remove('hidden'); // CRITICAL FIX: Show upload button after removal
                    fileName.textContent = 'ยังไม่ได้เลือกไฟล์ (รูปเดิมจะถูกลบ)';
                    fileName.classList.add('text-red-500');
                    if (fileBadge) fileBadge.classList.add('hidden');
                });
            }
        },
        preConfirm: async () => {
            const username = document.getElementById('swal-user').value.trim();
            const first_name = document.getElementById('swal-fn').value.trim();
            const last_name = document.getElementById('swal-ln').value.trim();
            const company = document.getElementById('swal-company').value.trim();
            const role = document.getElementById('swal-role').value;
            
            if (!username || !first_name || !last_name || !company) {
                Swal.showValidationMessage('กรุณากรอกข้อมูลที่จำเป็นให้ครบค่ะ (ชื่อ, นามสกุล, ชื่อผู้ใช้งาน, บริษัท)');
                return false;
            }

            const file = document.getElementById('swal-file').files[0];
            let profileBase64 = u.profile;
            
            // Check if user removed existing profile
            const currentProfile = document.getElementById('current-profile');
            if (currentProfile && currentProfile.classList.contains('hidden') && !file) {
                profileBase64 = ''; // Remove profile
            }
            
            if (file) {
                const rawBase64 = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });
                profileBase64 = await compressImage(rawBase64); // Compress here
            }
            
            const pass = document.getElementById('swal-pw').value;
            return { 
                id, 
                first_name, 
                last_name, 
                username, 
                password: pass ? await hashPassword(pass) : u.password, 
                company,
                role,
                profile: profileBase64
            };
        }
    });

    if (result.isConfirmed && result.value) {
        const confirmResult = await Swal.fire({
            title: 'ยืนยันการบันทึกการเปลี่ยนแปลง?',
            html: `
                <div class="text-left text-sm">
                    <p><strong>ชื่อ:</strong> ${result.value.first_name} ${result.value.last_name}</p>
                    <p><strong>ชื่อผู้ใช้:</strong> ${result.value.username}</p>
                    <p><strong>บริษัท:</strong> ${result.value.company}</p>
                    <p><strong>สิทธิ์:</strong> ${result.value.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานทั่วไป'}</p>
                    ${result.value.profile ? '<p class="text-green-600">✓ มีรูปโปรไฟล์</p>' : '<p class="text-slate-400">ไม่มีรูปโปรไฟล์</p>'}
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันบันทึก',
            cancelButtonText: 'กลับไปแก้ไข',
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#94a3b8'
        });

        if (confirmResult.isConfirmed) {
            const res = await callAPI('update_user', result.value);
            if (res.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ',
                    text: 'แก้ไขข้อมูลพนักงานเรียบร้อยแล้ว',
                    timer: 1500,
                    showConfirmButton: false
                });
                loadUsers();
            }
        }
    }
}

/** 📊 REPORTING & EXPORT */
async function prepareReports() {
  if (adminUsers.length === 0) await loadUsers();
  $('#reportUser').html('<option value="">-- พนักงานทั้งหมด --</option>' + adminUsers.map(u => `<option value="${u.id}">${u.first_name} ${u.last_name}</option>`).join(''));
}

function exportToExcel() {
    const records = getFilteredAdminRecords();
    if (records.length === 0) return Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลในช่วงที่เลือก', 'warning');
    
    const data = records.map(r => ({ "ชื่อพนักงาน": r.name, "วันเวลา": r.date, "สถานะ": r.status, "พิกัด": `${r.latitude},${r.longitude}`, "ลิงก์แผนที่": r.map_link }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");
    const start = $('#filterStartDate').val();
    const end = $('#filterEndDate').val();
    XLSX.writeFile(wb, `Report_${start}_to_${end}.xlsx`);
}

function exportToCSV() {
    const records = getFilteredAdminRecords();
    if (records.length === 0) return Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลในช่วงที่เลือก', 'warning');
    
    const data = records.map(r => ({ "ชื่อพนักงาน": r.name, "วันเวลา": r.date, "สถานะ": r.status, "พิกัด": `"${(r.latitude && !isNaN(r.latitude)) ? parseFloat(r.latitude).toFixed(4) : '0.0000'}, ${(r.longitude && !isNaN(r.longitude)) ? parseFloat(r.longitude).toFixed(4) : '0.0000'}"`, "ลิงก์แผนที่": r.map_link }));
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + 
        [Object.keys(data[0]).join(","), ...data.map(row => Object.values(row).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const start = $('#filterStartDate').val();
    const end = $('#filterEndDate').val();
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Report_${start}_to_${end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/** 🛠️ MOCK DATA GENERATOR */
async function triggerMockData() {
    const result = await Swal.fire({
        title: 'ยืนยันการสร้างข้อมูลทดสอบ?',
        text: "ระบบจะล้างข้อมูลเดิมในแผ่นงานและสุ่มรายชื่อพร้อมประวัติ 7 วันล่าสุดให้ใหม่ค่ะ",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#1e3a8a',
        confirmButtonText: 'ตกลง, เริ่มเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        const res = await callAPI('generate_mock_data');
        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: 'สร้างข้อมูลเรียบร้อย',
                text: 'กรุณาเข้าสู่ระบบใหม่ด้วยไอดี admin รหัส 1234 ค่ะ',
            }).then(() => {
                logout();
            });
        }
    }
}
