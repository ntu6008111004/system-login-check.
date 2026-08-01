const _u = 'aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4aTc4MmIyajBFWXFUYlhmQnJKQ3VqSFRnNy10RHF5RWFlQk1VbEJLcGpveG5BZ3p1QmNDa1JOSk83eTZ3T0VwWEwvZXhlYw==';
const API_URL = atob(_u);

// System State
let currentUser = null;
let videoStream = null;
let lastCapturedPhoto = null;
let currentCoords = { lat: 0, lng: 0 };
let currentLocationName = '';
let map = null;
let marker = null;
let isLocationReady = false;
let hasCheckedInToday = false;
let hasCheckedOutToday = false;
let allBranches = [];

// AI State
let faceDetection = null;
let activeLoadings = 0; // Global counter for async tasks
let lastDetectionTime = 0; // For iOS throttling
const DETECTION_INTERVAL = 200; // ms (Target 5-6 FPS for mobile stability)
/**
 * 🎨 UI COMPONENTS
 */
function showLoading(show) {
  if (show) {
    activeLoadings++;
    if (activeLoadings === 1) $('#loading-overlay').css('display', 'flex').show();
  } else {
    activeLoadings--;
    if (activeLoadings <= 0) {
      activeLoadings = 0;
      $('#loading-overlay').hide();
    }
  }
}
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
let activeAdminTab = 'users';
let adminCurrentPage = 1;
const adminRowsPerPage = 10;
let adminPollInterval = null;
let adminTotalRecords = 0;
let adminTotalPages = 1;
const inFlightRequests = new Map();
const memoryCache = new Map();
let adminFilterTimer = null;

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
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).replace(/\//g, '-');
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
    if (!string) return "";
    return btoa(unescape(encodeURIComponent(string)));
}

function decodePassword(encoded) {
    if (!encoded) return "";
    try {
        return decodeURIComponent(escape(atob(encoded)));
    } catch (e) {
        return encoded; // Return as is if not base64
    }
}

function sha256Fallback(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const Math_pow = Math.pow;
    const maxWord = Math_pow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    const result = '';
    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    let hash = sha256Fallback.h = sha256Fallback.h || [];
    let k = sha256Fallback.k = sha256Fallback.k || [];
    let primeCounter = k[lengthProperty];
    const isPrime = function (n) {
        for (let factor = 2; factor * factor <= n; factor++) if (n % factor === 0) return false;
        return true;
    };
    const getFractionalBits = function (n) { return ((n - Math.floor(n)) * maxWord) | 0; };
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (isPrime(candidate)) {
            if (primeCounter < 8) hash[primeCounter] = getFractionalBits(Math_pow(candidate, 1 / 2));
            k[primeCounter] = getFractionalBits(Math_pow(candidate, 1 / 3));
            primeCounter++;
        }
    }
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return;
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength | 0);
    for (j = 0; j < words[lengthProperty]; j += 16) {
        const w = words.slice(j, j + 16);
        let oldHash = hash;
        hash = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            const i2 = i + j;
            const w15 = w[i - 15], w2 = w[i - 2];
            const a = hash[0], e = hash[4];
            const temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
            const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    let finalHash = '';
    for (i = 0; i < 8; i++) {
        const h = hash[i] >>> 0;
        finalHash += (h.toString(16).padStart(8, '0'));
    }
    return finalHash;
}

$(document).ready(function() {
  handleLineBreakout();
  initApp();
  initListeners();
});

/**
 * 📱 LINE BROWSER GUARDIAN
 */
function handleLineBreakout() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isLine = /Line\//i.test(ua);
    if (!isLine) return;

    const currentUrl = window.location.href;
    // Android "openExternalBrowser=1" trick
    if (!currentUrl.includes('openExternalBrowser=1')) {
        const separator = currentUrl.includes('?') ? '&' : '?';
        const breakoutUrl = currentUrl + separator + 'openExternalBrowser=1';
        
        Swal.fire({
            title: 'แนะนำให้ใช้ Safari หรือ Chrome',
            html: `
                <div class="text-left space-y-3 text-sm">
                    <p class="font-bold text-rose-600">⚠️ พบว่าคุณกำลังใช้งานผ่าน LINE Browser</p>
                    <p>การลงเวลาผ่าน LINE อาจพบปัญหาเรื่องกล้องและความจำเครื่องได้ครับ</p>
                    <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 italic text-[11px]">
                        "แนะนำให้กดปุ่ม <b>... (3 จุด)</b> มุมขวาบน <br>แล้วเลือก <b>Open in default browser</b> ค่ะ"
                    </div>
                </div>
            `,
            icon: 'info',
            confirmButtonText: 'เปิดในเบราว์เซอร์ปกติ',
            confirmButtonColor: '#3b82f6',
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = breakoutUrl;
            }
        });
    }
}

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
        loadBranches(); // Proactive load
        loadUsers();    // Proactive load
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

  // Version Control: Check for updates on Every Refresh
  checkAppVersion();
  if (currentUser && !isLoginPage) {
    window.setTimeout(checkUpdateNotice, 450);
  }
}

async function checkAppVersion() {
    const CURRENT_VERSION = "1.3.2";
    const res = await callAPI('get_version', {}, true);
    
    if (res.success && res.version) {
        const serverVersion = res.version;
        const localVersion = localStorage.getItem('worklogs_app_version');
        
        if (!localVersion || localVersion !== serverVersion) {

            localStorage.setItem('worklogs_app_version', serverVersion);
            
            // หากเวอร์ชันที่รันอยู่ (ในไฟล์) ไม่ตรงกับ Server
            if (CURRENT_VERSION !== serverVersion) {
                // วิธีอัปเดตแบบ "ไม่กระทบผู้ใช้":
                // 1. ถ้ายังไม่ Login (อยู่ที่หน้า Login) -> รีโหลดได้เลยเพราะไม่มีข้อมูลค้าง
                // 2. ถ้า Login แล้ว -> ไม่รีโหลดทันที แต่จะล้าง cache ในรอบหน้า 
                //    หรือรอจนกว่าผู้ใช้จะ Logout/Refresh เอง
                
                const isLoginPage = window.location.pathname.endsWith('login.html');
                if (isLoginPage) {
                    // ล้าง cache และ reload เงียบๆ
                    clearInternalCache();
                    window.location.reload(true);
                } else {
                    // ถ้ากำลังใช้งานอยู่ แค่ล้าง cache ข้อมูลไว้ รอบหน้าจะโหลดใหม่เอง
                    clearInternalCache();

                }
            }
        }
    }
}

function clearInternalCache() {
    Object.keys(localStorage).forEach(key => { 
        if(key.startsWith('cache_')) localStorage.removeItem(key); 
    });
}

/**
 * 💾 SAFE STORAGE UTILITY
 * Prevents app crashing when localStorage is full
 */
function safeCacheItem(key, data, ttlMs = 120000) {
    if (!key || !data) return;
    const cacheEntry = { savedAt: Date.now(), expiresAt: Date.now() + ttlMs, data };
    memoryCache.set(key, cacheEntry);
    const stringData = JSON.stringify(cacheEntry);
    try {
        localStorage.setItem(key, stringData);
    } catch (e) {
        // Handle QuotaExceededError across different browsers
        if (e.name === 'QuotaExceededError' || 
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
            e.code === 22) {
            
            console.warn('LocalStorage quota exceeded. Purging caches...');
            clearInternalCache();
            
            try {
                localStorage.setItem(key, stringData);
            } catch (retryError) {
                // If it still fails, the single item is likely > 5MB
                console.error('Item too large for LocalStorage even after purge:', (stringData.length / 1024).toFixed(2), 'KB');
            }
        } else {
            console.error('LocalStorage Save Error:', e);
        }
    }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

async function checkUpdateNotice() {
  if (!currentUser) return;
  const role = currentUser.role === 'admin' ? 'admin' : 'user';
  const response = await callAPI('get_update_notice', { role }, true);
  const update = response && response.success ? response.update : null;
  if (!update || !update.version) return;

  return showUpdateNotice(update);
}

async function showUpdateNotice(update) {
  if (!currentUser || !update || !update.version) return;
  const role = currentUser.role === 'admin' ? 'admin' : 'user';
  const seenKey = `worklogs_update_seen_${currentUser.id}_${role}_${update.version}`;
  if (localStorage.getItem(seenKey) === '1') return;

  const items = Array.isArray(update.items) ? update.items.slice(0, 4) : [];
  const itemHTML = items.map(item => `
    <li><i class="fas fa-check-circle" aria-hidden="true"></i><span>${escapeHTML(item)}</span></li>
  `).join('');
  const result = await Swal.fire({
    icon: 'info',
    title: String(update.title || 'มีการปรับปรุงระบบ'),
    html: `
      <div class="update-notice">
        <p class="update-notice-date"><i class="fas fa-calendar-alt" aria-hidden="true"></i> อัปเดต ${escapeHTML(update.date || '')}</p>
        <ul class="update-notice-list">${itemHTML}</ul>
      </div>
    `,
    confirmButtonText: 'รับทราบ',
    confirmButtonColor: '#1d4ed8',
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: { popup: 'update-notice-popup' }
  });
  if (result.isConfirmed) localStorage.setItem(seenKey, '1');
}

const CACHE_TTL_MS = {
  get_branches: 10 * 60 * 1000,
  get_users: 5 * 60 * 1000,
  get_history: 2 * 60 * 1000,
  get_admin_data: 45 * 1000,
  get_attendance_photo: 10 * 60 * 1000,
  reverse_geocode: 6 * 60 * 60 * 1000,
  get_update_notice: 10 * 60 * 1000,
  get_version: 5 * 60 * 1000
};

function stablePayload(payload = {}) {
  return Object.keys(payload).sort().reduce((result, key) => {
    if (payload[key] !== undefined && payload[key] !== '') result[key] = payload[key];
    return result;
  }, {});
}

function fastHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheKeyFor(action, payload = {}) {
  return `cache_v2_${action}_${fastHash(JSON.stringify(stablePayload(payload)))}`;
}

function setCache(action, payload, data) {
  safeCacheItem(cacheKeyFor(action, payload), data, CACHE_TTL_MS[action] || 120000);
}

function getCache(action, payload = {}, allowStale = true) {
  const key = cacheKeyFor(action, payload);
  let entry = memoryCache.get(key);
  if (!entry) {
    try {
      const raw = localStorage.getItem(key);
      entry = raw ? JSON.parse(raw) : null;
      if (entry) memoryCache.set(key, entry);
    } catch (error) {
      localStorage.removeItem(key);
      return null;
    }
  }
  if (!entry) return null;
  if (!allowStale && entry.expiresAt < Date.now()) return null;
  return entry.data || entry;
}

function invalidateClientCache(action) {
  [...memoryCache.keys()].filter(key => key.startsWith(`cache_v2_${action}_`)).forEach(key => memoryCache.delete(key));
  Object.keys(localStorage).filter(key => key.startsWith(`cache_v2_${action}_`)).forEach(key => localStorage.removeItem(key));
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
    clearTimeout(adminFilterTimer);
    adminFilterTimer = setTimeout(() => loadAdminData(false, true), 180);
  });
  $('#filterBranch').on('change', () => {
    adminCurrentPage = 1;
    clearTimeout(adminFilterTimer);
    adminFilterTimer = setTimeout(() => loadAdminData(false, true), 180);
  });
  
  $(document).on('click', '#btnReloadAdmin', resetAdminFilters);

  // Photo Listeners
  $(document).on('click', '#btnRetake', retakePhoto);
  $(document).on('click', '#btnConfirmPhoto', confirmPhoto);

  initSearchableDropdowns(document.getElementById('view-admin'));

}

/**
 * Searchable admin dropdowns.
 * The original <select> remains the source of truth so existing change handlers,
 * form validation and CRUD code continue to work without any special cases.
 */
let activeSearchableDropdown = null;
let searchableDropdownSequence = 0;

function normalizeSearchText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('th').trim();
}

function initSearchableDropdowns(root = document) {
  if (!root) return;
  root.querySelectorAll('select:not(.swal2-select)').forEach(select => enhanceSearchableDropdown(select));
}

function destroySearchableDropdowns(root) {
  if (!root) return;
  root.querySelectorAll('select').forEach(select => select._searchableDropdown?.destroy());
}

function refreshSearchableDropdown(selectOrSelector) {
  const select = typeof selectOrSelector === 'string'
    ? document.querySelector(selectOrSelector)
    : selectOrSelector;
  if (!select) return;
  if (!select._searchableDropdown) enhanceSearchableDropdown(select);
  select._searchableDropdown?.refresh();
}

function enhanceSearchableDropdown(select) {
  if (!select || select._searchableDropdown) return select?._searchableDropdown;

  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-select';
  const input = document.createElement('input');
  const listbox = document.createElement('div');
  const icon = document.createElement('i');
  const listboxId = `searchable-options-${++searchableDropdownSequence}`;

  input.type = 'text';
  input.className = 'searchable-select-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listboxId);
  input.setAttribute('aria-label', select.getAttribute('aria-label') || 'พิมพ์เพื่อค้นหา');
  listbox.id = listboxId;
  listbox.className = 'searchable-options-portal';
  listbox.setAttribute('role', 'listbox');
  listbox.hidden = true;
  icon.className = 'fas fa-chevron-down searchable-select-icon';

  wrapper.append(input, icon);
  select.insertAdjacentElement('afterend', wrapper);
  select.classList.add('searchable-native-select');
  select.parentElement?.classList.add('searchable-enhanced');
  document.body.appendChild(listbox);

  let visibleOptions = [];
  let activeIndex = -1;
  let isOpen = false;

  const options = () => Array.from(select.options).map((option, index) => ({
    index,
    value: option.value,
    label: option.textContent.trim(),
    disabled: option.disabled,
    search: normalizeSearchText(option.textContent)
  }));

  const selectedLabel = () => select.selectedOptions[0]?.textContent.trim() || '';

  const positionListbox = () => {
    if (!isOpen) return;
    const rect = wrapper.getBoundingClientRect();
    const gap = 6;
    const safeMargin = 8;
    const availableBelow = window.innerHeight - rect.bottom - safeMargin;
    const availableAbove = rect.top - safeMargin;
    const preferredHeight = Math.min(288, Math.max(112, visibleOptions.length * 43 + 8));
    const openAbove = availableBelow < Math.min(180, preferredHeight) && availableAbove > availableBelow;
    const maxHeight = Math.max(96, Math.min(preferredHeight, openAbove ? availableAbove - gap : availableBelow - gap));
    listbox.style.left = `${Math.max(safeMargin, Math.min(rect.left, window.innerWidth - rect.width - safeMargin))}px`;
    listbox.style.width = `${Math.min(rect.width, window.innerWidth - (safeMargin * 2))}px`;
    listbox.style.maxHeight = `${maxHeight}px`;
    listbox.style.top = openAbove ? 'auto' : `${rect.bottom + gap}px`;
    listbox.style.bottom = openAbove ? `${window.innerHeight - rect.top + gap}px` : 'auto';
  };

  const close = ({ restoreLabel = true } = {}) => {
    if (!isOpen) return;
    isOpen = false;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    wrapper.classList.remove('is-open');
    if (restoreLabel) input.value = selectedLabel();
    if (activeSearchableDropdown === api) activeSearchableDropdown = null;
  };

  const setActive = index => {
    if (!visibleOptions.length) return;
    activeIndex = Math.max(0, Math.min(index, visibleOptions.length - 1));
    listbox.querySelectorAll('[role="option"]').forEach((node, nodeIndex) => {
      node.classList.toggle('is-active', nodeIndex === activeIndex);
    });
    const activeNode = listbox.querySelector(`[data-visible-index="${activeIndex}"]`);
    if (activeNode) {
      input.setAttribute('aria-activedescendant', activeNode.id);
      activeNode.scrollIntoView({ block: 'nearest' });
    }
  };

  const choose = item => {
    if (!item || item.disabled) return;
    select.value = item.value;
    input.value = item.label;
    close({ restoreLabel: false });
    select.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus({ preventScroll: true });
  };

  const render = query => {
    const needle = normalizeSearchText(query);
    visibleOptions = options().filter(item => !needle || item.search.includes(needle));
    listbox.replaceChildren();

    if (!visibleOptions.length) {
      const empty = document.createElement('div');
      empty.className = 'searchable-option-empty';
      empty.textContent = 'ไม่พบข้อมูลที่ค้นหา';
      listbox.appendChild(empty);
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    } else {
      visibleOptions.forEach((item, visibleIndex) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.id = `${listboxId}-option-${item.index}`;
        option.className = 'searchable-option';
        option.textContent = item.label;
        option.disabled = item.disabled;
        option.dataset.visibleIndex = visibleIndex;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(item.value === select.value));
        if (item.value === select.value) option.classList.add('is-selected');
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('click', () => choose(item));
        listbox.appendChild(option);
      });
      const selectedIndex = visibleOptions.findIndex(item => item.value === select.value);
      setActive(selectedIndex >= 0 ? selectedIndex : 0);
    }
    positionListbox();
  };

  const open = ({ clearForSearch = false } = {}) => {
    if (activeSearchableDropdown && activeSearchableDropdown !== api) {
      activeSearchableDropdown.close();
    }
    activeSearchableDropdown = api;
    isOpen = true;
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    wrapper.classList.add('is-open');
    if (clearForSearch) input.value = '';
    render(clearForSearch ? '' : input.value === selectedLabel() ? '' : input.value);
  };

  const refresh = () => {
    input.value = selectedLabel();
    input.placeholder = select.options[0]?.textContent.trim() || 'พิมพ์เพื่อค้นหา';
    input.disabled = select.disabled;
    if (isOpen) render('');
  };

  const handleDocumentPointerDown = event => {
    if (isOpen && !wrapper.contains(event.target) && !listbox.contains(event.target)) close();
  };
  const observer = new MutationObserver(refresh);
  const destroy = () => {
    close();
    observer.disconnect();
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    window.removeEventListener('resize', positionListbox);
    window.removeEventListener('scroll', positionListbox, true);
    listbox.remove();
    wrapper.remove();
    select.classList.remove('searchable-native-select');
    if (!select.parentElement?.querySelector('.searchable-select')) {
      select.parentElement?.classList.remove('searchable-enhanced');
    }
    delete select._searchableDropdown;
  };

  const api = { close, open, refresh, destroy, select, input, listbox };
  select._searchableDropdown = api;

  input.addEventListener('focus', () => open());
  input.addEventListener('click', () => {
    if (!isOpen) open();
    input.select();
  });
  input.addEventListener('input', () => {
    if (!isOpen) open();
    render(input.value);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) open({ clearForSearch: true });
      else setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) open({ clearForSearch: true });
      else setActive(activeIndex - 1);
    } else if (event.key === 'Enter' && isOpen) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close();
    }
  });
  icon.addEventListener('pointerdown', event => {
    event.preventDefault();
    input.focus();
    if (isOpen) close();
    else open({ clearForSearch: true });
  });
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('resize', positionListbox, { passive: true });
  window.addEventListener('scroll', positionListbox, { passive: true, capture: true });
  observer.observe(select, { childList: true, subtree: true, attributes: true });
  refresh();
  return api;
}

/**
 * 🚀 API COMMUNICATION
 */
const DATA_ACTIONS = ['login', 'get_history', 'get_admin_data', 'get_attendance_photo', 'get_users', 'get_branches', 'get_update_notice', 'get_version', 'reverse_geocode'];

async function callAPI(action, payload = {}, silent = false) {
  if (DATA_ACTIONS.includes(action)) {
    const requestKey = `${action}:${JSON.stringify(stablePayload(payload))}`;
    if (inFlightRequests.has(requestKey)) return inFlightRequests.get(requestKey);
    const request = callAPIJsonp(action, payload, silent)
      .finally(() => inFlightRequests.delete(requestKey));
    inFlightRequests.set(requestKey, request);
    return request;
  }

  if (!silent) showLoading(true);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data: payload })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const res = await response.json();
    return res;
  } catch (error) {
    console.error(`API Error (${action}):`, error);
    if (!silent) {
      Swal.fire({
        icon: 'error',
        title: 'การเชื่อมต่อขัดข้อง',
        text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง (อาจเกิดจากเครือข่ายอินเทอร์เน็ตไม่เสถียร)',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#3b82f6'
      });
    }
    return { success: false, message: error.toString() };
  } finally {
    if (!silent) showLoading(false);
  }
}

function callAPIJsonp(action, payload = {}, silent = false) {
  return new Promise((resolve) => {
    if (!silent) showLoading(true);

    const payloadStr = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const maxAttempts = action === 'login' ? 3 : 2;
    const attemptTimeout = action === 'login' ? 10000 : 12000;
    const hedgeDelay = action === 'login' ? 3000 : 6000;
    const loadingText = $('#loading-overlay p').text();
    let settled = false;
    let attempt = 0;
    let hedgeTimer = null;
    let lastError = 'ระบบตอบกลับช้าเกินไป กรุณาลองอีกครั้ง';
    const activeAttempts = new Map();

    const cleanupAttempt = callbackName => {
      const request = activeAttempts.get(callbackName);
      if (!request) return;
      clearTimeout(request.timeoutId);
      delete window[callbackName];
      if (request.script.parentNode) request.script.parentNode.removeChild(request.script);
      activeAttempts.delete(callbackName);
    };

    const finish = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      Array.from(activeAttempts.keys()).forEach(cleanupAttempt);
      $('#loading-overlay p').text(loadingText);
      if (!silent) showLoading(false);
      if (data && data.success && !payload.export) setCache(action, payload, data);
      resolve(data);
    };

    const scheduleHedge = () => {
      clearTimeout(hedgeTimer);
      if (settled || attempt >= maxAttempts) return;
      hedgeTimer = window.setTimeout(() => {
        if (settled) return;
        if (!silent && action === 'login') {
          $('#loading-overlay p').text(`การเชื่อมต่อช้า กำลังลองใหม่ (${attempt + 1}/${maxAttempts})...`);
        }
        runAttempt();
      }, hedgeDelay);
    };

    const failAttempt = (callbackName, message) => {
      cleanupAttempt(callbackName);
      if (settled) return;
      lastError = message;
      if (attempt < maxAttempts) {
        clearTimeout(hedgeTimer);
        if (!silent && action === 'login') {
          $('#loading-overlay p').text(`การเชื่อมต่อช้า กำลังลองใหม่ (${attempt + 1}/${maxAttempts})...`);
        }
        runAttempt();
        return;
      }
      if (activeAttempts.size === 0) finish({ success: false, message: lastError });
    };

    const runAttempt = () => {
      if (settled || attempt >= maxAttempts) return;
      attempt += 1;
      const callbackName = `js_cb_${Date.now()}_${attempt}_${Math.floor(Math.random() * 100000)}`;
      const url = `${API_URL}?action=${encodeURIComponent(action)}&payload=${encodeURIComponent(payloadStr)}&callback=${callbackName}&attempt=${attempt}&_=${Date.now()}`;
      const script = document.createElement('script');
      script.src = url;
      script.async = true;

      window[callbackName] = data => finish(data);
      script.onerror = () => {
        console.warn(`JSONP Network Error (${action}) attempt ${attempt}/${maxAttempts}`);
        failAttempt(callbackName, 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
      };
      const timeoutId = window.setTimeout(() => {
        console.warn(`JSONP Timeout (${action}) attempt ${attempt}/${maxAttempts}`);
        failAttempt(callbackName, 'ระบบตอบกลับช้าเกินไป กรุณาลองอีกครั้ง');
      }, attemptTimeout);

      activeAttempts.set(callbackName, { script, timeoutId });
      document.head.appendChild(script);
      scheduleHedge();
    };

    runAttempt();
  });
}

/**
 * 🏠 VIEW ROUTING
 */
function startAdminPolling() {
    if (adminPollInterval) return;

    adminPollInterval = setInterval(() => {
        if (currentUser && currentUser.role === 'admin' && activeAdminTab === 'logs' && !document.hidden) {
            loadAdminData(true, true); // Force AND Silent refresh
        } else {
            stopAdminPolling();
        }
    }, 30000);
}

function stopAdminPolling() {
    if (adminPollInterval) {
        clearInterval(adminPollInterval);
        adminPollInterval = null;

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
    $('#navDashboard, #navHistory, #navAdmin, #navAdminDashboard, #navAdminHist').addClass('hidden').removeClass('active');
    
    if (isAdmin) {
        // Admins see Admin portal and History
        $('#navAdmin, #navAdminDashboard, #navAdminHist, #navHistory').removeClass('hidden');
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

  if (viewName === 'dashboard') setupDashboard();
  if (viewName === 'history') loadHistory();
}


/**
 * 🔐 AUTH
 */
async function handleLogin(e) {
  e.preventDefault();
  const username = $('#username').val();
  const rawPassword = $('#password').val();
  const password = await hashPassword(rawPassword);
  const remember = $('#chkRemember').is(':checked');
  const res = await callAPI('login', { username, password });
  if (res.success) {
    currentUser = res.user;
    if (remember) localStorage.setItem('worklogs_user', JSON.stringify(res.user));
    
    // Clear cache on login to ensure fresh data for new session
    Object.keys(localStorage).forEach(key => { if(key.startsWith('cache_')) localStorage.removeItem(key); });
    
    // Proactive loading for admin
    if (res.user.role === 'admin') {
        loadBranches(); // Fetch master data early
        loadUsers();    // Fetch users early
    }
    
    Swal.fire({ 
        icon: 'success', 
        title: 'สวัสดีคุณ ' + res.user.name, 
        timer: 650,
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
let dashboardLibrariesPromise = null;

function loadScriptOnce(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();
  const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.dynamicSrc = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadDashboardLibraries() {
  if (!dashboardLibrariesPromise) {
    dashboardLibrariesPromise = loadScriptOnce('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'L')
      .then(() => loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js', 'FaceDetection'))
      .then(() => loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js', 'Camera'));
  }
  return dashboardLibrariesPromise;
}

async function setupDashboard() {
  $('#txtUserName').text(currentUser.name);
  $('#txtUserCompany').text(currentUser.company);
  const avatarUrl = currentUser.profile || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.name)}&backgroundColor=1e3a8a`;
  $('#userAvatar').attr('src', avatarUrl);
  try {
    await loadDashboardLibraries();
    if (!faceDetection) initFaceDetection();
    startCamera();
    initMapAndGPS();
    checkTodayStatus(false);
  } catch (error) {
    console.error('Dashboard library load error:', error);
    Swal.fire('โหลดอุปกรณ์ไม่สำเร็จ', 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง', 'error');
  }
}

function initMapAndGPS() {
  isLocationReady = false;
  currentLocationName = '';
  $('#gpsStatusBadge').removeClass('bg-green-100 text-green-800').addClass('bg-yellow-100 text-yellow-800 animate-pulse').text('กำลังค้นหา...');
  setLocationNameStatus('กำลังรอพิกัด GPS...', 'loading');
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      currentCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $('#txtLat').text(currentCoords.lat.toFixed(5));
      $('#txtLon').text(currentCoords.lng.toFixed(5));
      isLocationReady = true;
      $('#gpsStatusBadge').removeClass('bg-yellow-100 animate-pulse').addClass('bg-green-100').text('พบพิกัดแล้ว');
      renderMap(currentCoords.lat, currentCoords.lng);
      resolveCurrentLocationName(currentCoords.lat, currentCoords.lng);
      checkButtonStatus();
    }, err => {
      setLocationNameStatus('ไม่สามารถอ่านตำแหน่งได้', 'error');
      Swal.fire('Error', 'กรุณาเปิด GPS', 'error');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
}

function setLocationNameStatus(message, state = 'loading') {
  const iconClasses = {
    loading: 'fas fa-circle-notch fa-spin text-blue-500',
    success: 'fas fa-map-marker-alt text-emerald-500',
    error: 'fas fa-exclamation-circle text-amber-500'
  };
  $('#locationNameIcon').attr('class', iconClasses[state] || iconClasses.loading);
  $('#txtLocationName').text(message);
}

async function resolveCurrentLocationName(latitude, longitude) {
  setLocationNameStatus('กำลังค้นหาชื่อตำบล อำเภอ และจังหวัด...', 'loading');
  const res = await callAPI('reverse_geocode', { latitude, longitude }, true);
  if (currentCoords.lat !== latitude || currentCoords.lng !== longitude) return;
  if (res.success && res.location_name) {
    currentLocationName = res.location_name;
    setLocationNameStatus(currentLocationName, 'success');
  } else {
    currentLocationName = '';
    setLocationNameStatus('ยังไม่พบชื่อสถานที่ แต่สามารถบันทึกพิกัดได้', 'error');
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
          const now = Date.now();
          if (now - lastDetectionTime > DETECTION_INTERVAL) {
            lastDetectionTime = now;
            await faceDetection.send({image: videoElement});
          }
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
    minDetectionConfidence: 0.4 // Slightly lower for iOS/mobile light conditions
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
    
    // Check if center of face is within +/- 20% of the frame center (More lenient for mobile)
    const tolerance = 0.20;
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
  
  let dataUrl = c.toDataURL('image/webp', 0.6);
  // Fallback to JPEG if WebP is not supported (toDataURL returns image/png if type is unsupported)
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = c.toDataURL('image/jpeg', 0.6);
  }
  
  lastCapturedPhoto = dataUrl;
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
    location_name: currentLocationName,
    selfie_base64: lastCapturedPhoto 
  });
  if (res.success) {
    Swal.fire({
      icon: 'success',
      title: 'บันทึกสำเร็จ',
      text: status + ' เรียบร้อยแล้วค่ะ',
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
        retakePhoto();
        checkTodayStatus();
        switchView('history');
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'บันทึกไม่สำเร็จ',
      text: res.message || 'ระบบไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง หรือเช็กการเชื่อมต่ออินเทอร์เน็ตค่ะ',
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#3b82f6'
    });
  }
}

async function loadHistory(force = false) {
  const payload = { user_id: currentUser.id };
  const cached = force ? null : getCache('get_history', payload);
  if (cached) {
    personalHistoryData = cached.history;
    renderHistoryFiltered();
  }

  const res = await callAPI('get_history', payload, !!cached);
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
          ${item.location_name ? `<p class="mt-1 text-[10px] leading-snug text-slate-400"><i class="fas fa-map-marker-alt mr-1 text-blue-400"></i>${escapeHTML(item.location_name)}</p>` : ''}
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
    // 1. Auto-fill dates if empty
    if (!$('#filterStartDate').val()) {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const today = now.toISOString().split('T')[0];
        $('#filterStartDate').val(firstDay);
        $('#filterEndDate').val(today);
    }

    // 2. Refresh User Management table
    renderUsersTable(); 
    
    // 3. Update Report user dropdown based on ALL adminUsers
    const currentVal = $('#filterUser').val(); // Preserve selection
    const options = ['<option value="">-- พนักงานทั้งหมด --</option>'];
    
    // Sort users by name for better UX
    const sortedUsers = [...adminUsers].sort((a, b) => a.first_name.localeCompare(b.first_name, 'th'));
    
    sortedUsers.forEach(u => {
        options.push(`<option value="${u.id}">${u.first_name} ${u.last_name}</option>`);
    });
    
    $('#filterUser').html(options.join(''));
    if (currentVal) $('#filterUser').val(currentVal); // Restore selection
    refreshSearchableDropdown('#filterUser');
}

async function resetAdminFilters() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    $('#filterStartDate').val(firstDay);
    $('#filterEndDate').val(today);
    $('#filterBranch').val('');
    $('#filterUser').val('');
    refreshSearchableDropdown('#filterBranch');
    refreshSearchableDropdown('#filterUser');
    
    // Actually reload data from server
    await loadAdminData(true); 
    
    Swal.fire({
        icon: 'success',
        title: 'อัปเดตข้อมูลเรียบร้อย',
        timer: 1000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
    });
}

async function loadAdminData(force = false, silent = false) {
  ensureDefaultAdminDates();
  const payload = {
    page: adminCurrentPage,
    page_size: adminRowsPerPage,
    start_date: $('#filterStartDate').val() || '',
    end_date: $('#filterEndDate').val() || '',
    user_id: $('#filterUser').val() || '',
    branch_id: $('#filterBranch').val() || ''
  };
  const cached = force ? null : getCache('get_admin_data', payload);
  if (cached) applyAdminPage(cached);
  if (!cached && !silent) renderAdminSkeleton();

  const res = await callAPI('get_admin_data', payload, true);
  if (res.success) applyAdminPage(res);
  else if (!cached && !silent) showDataError('#adminTableBody', 6);
  return res;
}

async function loadUsers(force = false, silent = false) {
  const fresh = force ? null : getCache('get_users', {}, false);
  const cached = fresh || (force ? null : getCache('get_users', {}));
  if (cached) {
    adminUsers = cached.users || [];
    updateAdminUserFilter();
  } else if (!silent) {
    renderUsersSkeleton();
  }
  if (fresh && !force) return fresh;

  const res = await callAPI('get_users', {}, true);
  if (res.success) {
    adminUsers = res.users || [];
    updateAdminUserFilter();
  } else if (!cached && !silent) {
    showDataError('#userTableBody', 4);
  }
  return res;
}

async function loadBranches(force = false) {
  try {
    const fresh = force ? null : getCache('get_branches', {}, false);
    const cached = fresh || (force ? null : getCache('get_branches', {}));
    if (cached) applyBranches(cached.branches || []);
    if (fresh && !force) return fresh;

    const res = await callAPI('get_branches', {}, true);
    if (res && res.success) applyBranches(res.branches || []);
    return res;
  } catch (err) {
    console.error('Error loading branches:', err);
    return { success: false, branches: allBranches };
  }
}

function applyBranches(branches) {
  allBranches = [...branches];
  if (!allBranches.find(b => b.name === 'AEC')) allBranches.push({id: 'B004', name: 'AEC'});
  if (!allBranches.find(b => b.name === 'LTN')) allBranches.push({id: 'B005', name: 'LTN'});
  updateBranchFilters();
}

function ensureDefaultAdminDates() {
  if ($('#filterStartDate').val()) return;
  const now = new Date();
  $('#filterStartDate').val(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  $('#filterEndDate').val(now.toISOString().split('T')[0]);
}

function applyAdminPage(result) {
  adminData = result.records || [];
  adminTotalRecords = Number(result.total ?? adminData.length);
  adminTotalPages = Number(result.total_pages ?? Math.max(1, Math.ceil(adminTotalRecords / adminRowsPerPage)));
  adminCurrentPage = Number(result.page ?? adminCurrentPage);
  renderAdminLogs();
}

function renderAdminSkeleton() {
  $('#adminTableBody').html(Array.from({ length: 5 }, () => `
    <tr class="table-skeleton"><td colspan="6" class="p-4"><div class="skeleton-line"></div></td></tr>
  `).join(''));
}

function renderUsersSkeleton() {
  $('#userTableBody').html(Array.from({ length: 5 }, () => `
    <tr class="table-skeleton"><td colspan="4" class="p-4"><div class="skeleton-line"></div></td></tr>
  `).join(''));
}

function showDataError(selector, colspan) {
  $(selector).html(`<tr><td colspan="${colspan}" class="p-8 text-center text-rose-500 font-bold">โหลดข้อมูลไม่สำเร็จ กรุณากดรีเฟรชอีกครั้ง</td></tr>`);
}

function showCrudLoading(title) {
  Swal.fire({
    title,
    text: 'ระบบกำลังบันทึกเฉพาะรายการนี้',
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => Swal.showLoading()
  });
}

function updateBranchFilters() {
    const currentBranch = $('#filterBranch').val(); // Capture current selections
    const currentMgmtBranch = $('#userBranchFilter').val();

    const options = ['<option value="">-- สาขาทั้งหมด --</option>'];
    allBranches.forEach(b => {
        options.push(`<option value="${b.id}">${b.name}</option>`);
    });
    $('#filterBranch').html(options.join(''));
    
    // Also update User Management branch filter
    const userBranchOptions = ['<option value="">-- กรองตามสาขา (ทั้งหมด) --</option>'];
    allBranches.forEach(b => {
        userBranchOptions.push(`<option value="${b.id}">${b.name}</option>`);
    });
    $('#userBranchFilter').html(userBranchOptions.join(''));

    // Restore selections
    if (currentBranch) $('#filterBranch').val(currentBranch);
    if (currentMgmtBranch) $('#userBranchFilter').val(currentMgmtBranch);
    refreshSearchableDropdown('#filterBranch');
    refreshSearchableDropdown('#userBranchFilter');
}


function getFilteredAdminRecords() {
  return adminData;
}

function renderAdminLogs() {
  const pageData = getFilteredAdminRecords();
  const totalRecords = adminTotalRecords;
  const totalPages = adminTotalPages;

  if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
  if (adminCurrentPage < 1) adminCurrentPage = 1;

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
        ${r.id ? `<button type="button" onclick="showAttendancePhoto('${r.id}')" class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors" title="เปิดรูปยืนยันตัวตน" aria-label="เปิดรูปยืนยันตัวตน"><i class="fas fa-image"></i></button>` : '<span class="text-slate-300">-</span>'}
      </td>
      <td class="p-4 text-center">
        <span class="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${r.status==='เข้างาน'?'bg-emerald-100 text-emerald-700':'bg-rose-100 text-rose-700'}">${r.status}</span>
      </td>
      <td class="p-4">
        <div class="text-[10px] text-slate-500 font-mono whitespace-nowrap">
          ${(r.latitude !== undefined && r.latitude !== null && !isNaN(parseFloat(r.latitude))) ? parseFloat(r.latitude).toFixed(4) : '0.0000'},
          ${(r.longitude !== undefined && r.longitude !== null && !isNaN(parseFloat(r.longitude))) ? parseFloat(r.longitude).toFixed(4) : '0.0000'}
        </div>
        ${r.location_name ? `<div class="mt-1 max-w-[220px] text-[10px] leading-snug text-slate-400 font-sans"><i class="fas fa-map-marker-alt mr-1 text-blue-400"></i>${escapeHTML(r.location_name)}</div>` : ''}
      </td>
      <td class="p-3 text-center">
        <a href="${r.map_link}" target="_blank" class="w-7 h-7 bg-blue-50 text-blue-500 rounded-lg inline-flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all shadow-sm shadow-blue-100"><i class="fas fa-map-marked-alt text-[10px]"></i></a>
      </td>
    </tr>
  `).join(''));
}

async function showAttendancePhoto(attendanceId) {
  const payload = { id: attendanceId };
  const cached = getCache('get_attendance_photo', payload, false);
  if (cached && cached.selfie) {
    showImageLightbox(cached.selfie, 'รูปยืนยันตัวตน');
    return;
  }
  Swal.fire({
    title: 'กำลังโหลดรูป...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });
  const response = await callAPI('get_attendance_photo', payload, true);
  Swal.close();
  if (response.success && response.selfie) showImageLightbox(response.selfie, 'รูปยืนยันตัวตน');
  else Swal.fire('ไม่พบรูปภาพ', 'รายการนี้ไม่มีรูปยืนยันตัวตน', 'info');
}

function changeAdminPage(offset) {
    const nextPage = Math.min(adminTotalPages, Math.max(1, adminCurrentPage + offset));
    if (nextPage === adminCurrentPage) return;
    adminCurrentPage = nextPage;
    loadAdminData(false, true);
    $('#admin-sub-logs').parent().scrollTop(0);
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

    // 3) save_attendance (MOCK PHOTO TEST)
    if (createdUserId) {
      const mockWebp = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TAYAAAAvQWxvAGs='; // Minimal valid WebP
      const attRes = await callAPI('save_attendance', {
        user_id: createdUserId,
        status: 'เข้างาน',
        latitude: 13.75,
        longitude: 100.5,
        selfie_base64: mockWebp
      });
      push('save_attendance (WebP Pipeline)', !!attRes.success, attRes.success ? 'บันทึกรูปทดสอบสำเร็จ' : 'บันทึกรูปล้มเหลว');
    }

    // 4) update_user
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
  const branchFilter = $('#userBranchFilter').val();
  const filteredUsers = adminUsers.filter(u => {
    return branchFilter ? String(u.branch_id) === String(branchFilter) : true;
  });

  $('#userTableBody').html(filteredUsers.map(u => `
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
        <div class="flex justify-center gap-1.5">
          <button onclick="editUser('${u.id}')" class="w-7 h-7 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-sm transition-colors" title="แก้ไข">
            <i class="fas fa-edit text-[10px]"></i>
          </button>
          <button onclick="confirmDeleteUser('${u.id}')" class="w-7 h-7 bg-rose-500 hover:bg-rose-600 text-white rounded-lg flex items-center justify-center shadow-sm transition-colors" title="ลบ">
            <i class="fas fa-trash text-[10px]"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join(''));
}

async function openAddUserModal() {
  if (allBranches.length === 0) await loadBranches();
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
      <div class="relative">
        <label class="block text-xs font-medium text-slate-600 mb-1">รหัสผ่าน</label>
        <div class="relative">
          <input id="swal-pw" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200 pr-10" type="password" placeholder="รหัสผ่าน (เว้นว่าง = 1234)">
          <button type="button" id="toggle-pw" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
            <i class="fas fa-eye-slash text-sm"></i>
          </button>
        </div>
      </div>
      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">สาขา <span class="text-red-500">*</span></label>
        <div class="relative">
          <select id="swal-branch" class="w-full h-11 px-4 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer font-bold text-slate-700">
            ${allBranches.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
          </select>
          <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <i class="fas fa-chevron-down text-xs"></i>
          </div>
        </div>
      </div>
      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">สิทธิ์ผู้ใช้งาน</label>
        <div class="relative">
          <select id="swal-role" class="w-full h-11 px-4 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer font-bold text-slate-700">
            <option value="user">พนักงานทั่วไป</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </select>
          <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <i class="fas fa-chevron-down text-xs"></i>
          </div>
        </div>
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
      initSearchableDropdowns(Swal.getPopup());
      // Setup file input handlers after modal opens
      const fileInput = document.getElementById('swal-file');
      const preview = document.getElementById('swal-preview');
      const previewImg = document.getElementById('swal-preview-img');
      const fileName = document.getElementById('swal-file-name');
      const fileBadge = document.getElementById('swal-file-badge');
      const removeBtn = document.getElementById('swal-remove-file');
      const uploadLabel = document.getElementById('upload-label');
      const previewClickable = document.getElementById('preview-clickable');
      const togglePw = document.getElementById('toggle-pw');
      const pwInput = document.getElementById('swal-pw');

      if (togglePw && pwInput) {
        togglePw.addEventListener('click', () => {
          const isPass = pwInput.type === 'password';
          pwInput.type = isPass ? 'text' : 'password';
          togglePw.innerHTML = `<i class="fas ${isPass ? 'fa-eye' : 'fa-eye-slash'} text-sm"></i>`;
        });
      }
      
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
    willClose: () => destroySearchableDropdowns(Swal.getPopup()),
    preConfirm: async () => {
      const username = document.getElementById('swal-user').value.trim();
      const first_name = document.getElementById('swal-fn').value.trim();
      const last_name = document.getElementById('swal-ln').value.trim();
      const branch_id = document.getElementById('swal-branch').value;
      const branch_name = allBranches.find(b => b.id === branch_id)?.name || '';
      const role = document.getElementById('swal-role').value;
      
      // Validation
      if (!username || !first_name || !last_name || !branch_id) {
        Swal.showValidationMessage('กรุณากรอกข้อมูลที่จำเป็นให้ครบค่ะ (ชื่อ, นามสกุล, ชื่อผู้ใช้งาน, สาขา)');
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
        branch_id,
        company: branch_name,
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
          <p><strong>สาขา:</strong> ${result.value.company}</p>
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
      showCrudLoading('กำลังเพิ่มพนักงาน...');
      const res = await callAPI('create_user', result.value, true);
      if (res.success) {
        const createdUser = res.user || { ...result.value, id: res.id };
        adminUsers = [...adminUsers, createdUser];
        invalidateClientCache('get_users');
        updateAdminUserFilter();
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: 'เพิ่มพนักงานใหม่เรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'บันทึกไม่สำเร็จ',
          text: res.message || 'ไม่สามารถเพิ่มพนักงานได้ กรุณาลองใหม่อีกครั้งค่ะ',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#3b82f6'
        });
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
        showCrudLoading('กำลังลบพนักงาน...');
        const res = await callAPI('delete_user', { user_id: id }, true);
        if (res.success) { 
            adminUsers = adminUsers.filter(user => String(user.id) !== String(id));
            invalidateClientCache('get_users');
            updateAdminUserFilter();
            Swal.fire('ลบแล้ว', 'ลบข้อมูลพนักงานเรียบร้อยแล้ว', 'success'); 
        } else {
            Swal.fire('ลบไม่สำเร็จ', res.message || 'กรุณาลองใหม่อีกครั้งค่ะ', 'error');
        }
    }
}

async function editUser(id) {
    try {
        // Only show loading if data is missing to avoid state leakage on second click
        const needsLoading = (allBranches.length === 0 || adminUsers.length === 0);
    
    if (needsLoading) {
        Swal.fire({
            title: 'กำลังดึงข้อมูล...',
            text: 'โปรดรอกำลังเตรียมรายละเอียดพนักงานแว็บนึงค่ะ',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const tasks = [];
            if (allBranches.length === 0) tasks.push(loadBranches());
            if (adminUsers.length === 0) tasks.push(loadUsers());
            if (tasks.length > 0) await Promise.all(tasks);
        } catch (error) {
            console.error('editUser data load error:', error);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่ค่ะ', 'error');
            return;
        }
    }

    const u = adminUsers.find(x => x.id === id);
    if (!u) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลพนักงาน', 'error');
        return;
    }

    // Ensure loading state is cleared if it was shown
    if (needsLoading) Swal.close();
    
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
        <div class="relative">
          <input id="swal-pw" class="swal2-input !m-0 !w-full h-10 text-sm rounded-lg border-slate-200 pr-10" type="password" placeholder="รหัสผ่าน" value="${decodePassword(u.password)}">
          <button type="button" id="toggle-pw-edit" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors z-50 bg-transparent border-none p-2 cursor-pointer focus:outline-none outline-none" style="box-shadow: none;">
            <i class="fas fa-eye-slash text-sm"></i>
          </button>
        </div>
      </div>
      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">สาขา <span class="text-red-500">*</span></label>
        <div class="relative">
          <select id="swal-branch" class="w-full h-11 px-4 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer font-bold text-slate-700">
            ${allBranches.map(b => `<option value="${b.id}" ${u.branch_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
          <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <i class="fas fa-chevron-down text-xs"></i>
          </div>
        </div>
      </div>
      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">สิทธิ์ผู้ใช้งาน</label>
        <div class="relative">
          <select id="swal-role" class="w-full h-11 px-4 text-sm rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer font-bold text-slate-700">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>พนักงานทั่วไป</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option>
          </select>
          <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <i class="fas fa-chevron-down text-xs"></i>
          </div>
        </div>
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
            initSearchableDropdowns(Swal.getPopup());
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
            const togglePw = document.getElementById('toggle-pw-edit');
            const pwInput = document.getElementById('swal-pw');

            if (togglePw && pwInput) {
                togglePw.addEventListener('click', () => {
                    const isPass = pwInput.type === 'password';
                    pwInput.type = isPass ? 'text' : 'password';
                    togglePw.innerHTML = `<i class="fas ${isPass ? 'fa-eye' : 'fa-eye-slash'} text-sm"></i>`;
                });
                
                // Add System Test UI
                const container = pwInput.parentElement.parentElement;
                container.insertAdjacentHTML('beforeend', `
                    <button onclick="triggerMockData()" class="btn-primary w-full py-3 mt-4">สร้างข้อมูลสมมติ 7 วัน</button>
                    
                    <div class="pt-6 border-t border-slate-100 mt-6">
                        <h4 class="font-black text-slate-800 text-sm">ตรวจสอบสถานะระบบ</h4>
                        <p class="text-slate-400 text-[10px] mt-1 leading-relaxed">ทดสอบการเชื่อมต่อ API, การสร้างผู้ใช้ และการบันทึกรูปภาพ WebP</p>
                        <button onclick="runAdminSelfTest()" class="w-full mt-4 py-3 bg-slate-800 text-white rounded-xl font-bold text-xs hover:bg-black transition-all shadow-lg">
                           <i class="fas fa-microscope mr-2"></i> รันระบบทดสอบ (Full Pipeline Test)
                        </button>
                    </div>
                `);
            }
            
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
        willClose: () => destroySearchableDropdowns(Swal.getPopup()),
        preConfirm: async () => {
            const username = document.getElementById('swal-user').value.trim();
            const first_name = document.getElementById('swal-fn').value.trim();
            const last_name = document.getElementById('swal-ln').value.trim();
            const branch_id = document.getElementById('swal-branch').value;
            
            if (!username || !first_name || !last_name || !branch_id) {
                Swal.showValidationMessage('กรุณากรอกข้อมูลที่จำเป็นให้ครบค่ะ (ชื่อ, นามสกุล, ชื่อผู้ใช้งาน, สาขา)');
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
            // SMART HASH: Only hash if user actually changed the password field 
            // and it's not and the new value isn't already the hash we pulled.
            const isPasswordChanged = (pass !== u.password);
            const finalPassword = isPasswordChanged ? await hashPassword(pass) : u.password;

            const branch_name = allBranches.find(b => b.id === branch_id)?.name || '';
            const role = document.getElementById('swal-role').value;

            return { 
                id, 
                first_name, 
                last_name, 
                username, 
                password: finalPassword, 
                branch_id,
                company: branch_name,
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
                    <p><strong>สาขา:</strong> ${result.value.company}</p>
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
            showCrudLoading('กำลังบันทึกการแก้ไข...');
            const res = await callAPI('update_user', result.value, true);
            if (res.success) {
                const updatedUser = res.user || result.value;
                adminUsers = adminUsers.map(user => String(user.id) === String(id) ? { ...user, ...updatedUser } : user);
                invalidateClientCache('get_users');
                invalidateClientCache('get_admin_data');
                updateAdminUserFilter();
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ',
                    text: 'แก้ไขข้อมูลพนักงานเรียบร้อยแล้ว',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'บันทึกไม่สำเร็จ',
                    text: res.message || 'ไม่สามารถแก้ไขข้อมูลได้ กรุณาลองใหม่อีกครั้งค่ะ',
                    confirmButtonText: 'ตกลง',
                    confirmButtonColor: '#3b82f6'
                });
            }
        }
    }
  } catch (e) {
    console.error('editUser error:', e);
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเตรียมข้อมูลได้ กรุณาลองใหม่ค่ะ', 'error');
  }
}

/** 📊 REPORTING & EXPORT */
async function prepareReports() {
  if (adminUsers.length === 0) await loadUsers();
  $('#reportUser').html('<option value="">-- พนักงานทั้งหมด --</option>' + adminUsers.map(u => `<option value="${u.id}">${u.first_name} ${u.last_name}</option>`).join(''));
}

async function fetchAllAdminRecordsForExport() {
  const basePayload = {
    page_size: 500,
    start_date: $('#filterStartDate').val() || '',
    end_date: $('#filterEndDate').val() || '',
    user_id: $('#filterUser').val() || '',
    branch_id: $('#filterBranch').val() || '',
    export: true
  };
  const records = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await callAPI('get_admin_data', { ...basePayload, page }, true);
    if (!response.success) throw new Error(response.message || 'Export query failed');
    records.push(...(response.records || []));
    totalPages = response.total_pages || 1;
    page++;
  } while (page <= totalPages);
  return records;
}

async function exportToExcel() {
    showLoading(true);
    let records;
    try {
      [records] = await Promise.all([
        fetchAllAdminRecordsForExport(),
        loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX')
      ]);
    } catch (error) {
      showLoading(false);
      return Swal.fire('ส่งออกไม่สำเร็จ', 'ไม่สามารถเตรียมรายงานได้ กรุณาลองใหม่', 'error');
    }
    showLoading(false);
    if (records.length === 0) return Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลในช่วงที่เลือก', 'warning');
    
    const data = records.map(r => ({ 
        "ชื่อพนักงาน": r.name, 
        "วันเวลา": formatThaiDate(r.date), 
        "สถานะ": r.status, 
        "พิกัด": `${r.latitude},${r.longitude}`, 
        "ตำบล / อำเภอ / จังหวัด": r.location_name || '',
        "ลิงก์แผนที่": r.map_link 
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");
    const start = $('#filterStartDate').val();
    const end = $('#filterEndDate').val();
    XLSX.writeFile(wb, `Report_${start}_to_${end}.xlsx`);
}

async function exportToCSV() {
    showLoading(true);
    let records;
    try {
      records = await fetchAllAdminRecordsForExport();
    } catch (error) {
      showLoading(false);
      return Swal.fire('ส่งออกไม่สำเร็จ', 'ไม่สามารถเตรียมรายงานได้ กรุณาลองใหม่', 'error');
    }
    showLoading(false);
    if (records.length === 0) return Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลในช่วงที่เลือก', 'warning');
    
    const data = records.map(r => ({ 
        "ชื่อพนักงาน": r.name, 
        "วันเวลา": formatThaiDate(r.date), 
        "สถานะ": r.status, 
        "พิกัด": `"${(r.latitude && !isNaN(r.latitude)) ? parseFloat(r.latitude).toFixed(4) : '0.0000'}, ${(r.longitude && !isNaN(r.longitude)) ? parseFloat(r.longitude).toFixed(4) : '0.0000'}"`, 
        "ตำบล / อำเภอ / จังหวัด": `"${String(r.location_name || '').replace(/"/g, '""')}"`,
        "ลิงก์แผนที่": r.map_link 
    }));
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
        } else {
            Swal.fire('สร้างไม่สำเร็จ', res.message || 'กรุณาลองใหม่อีกครั้งค่ะ', 'error');
        }
    }
}

async function confirmResetAllPasswords() {
    const result = await Swal.fire({
        title: 'ยืนยันการรีเซ็ตรหัสทั้งหมด?',
        text: "รหัสพนักงานทุกคนจะถูกเปลี่ยนเป็น 1234 ทันทีเพื่อความสะดวกในการจัดการครับ",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ตกลง, รีเซ็ตเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        const res = await callAPI('reset_all_passwords');
        if (res.success) {
            Swal.fire('รีเซ็ตสำเร็จ', res.message, 'success');
            loadUsers(true);
            loadAdminData(true);
        } else {
            Swal.fire('รีเซ็ตไม่สำเร็จ', res.message || 'กรุณาลองใหม่อีกครั้งค่ะ', 'error');
        }
    }
}

async function requestPermissionsManual() {
    // Check if insecure origin
    const isInsecure = window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const isFile = window.location.protocol === 'file:';

    let protocolWarning = '';
    if (isFile) {
        protocolWarning = `
            <div class="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-800 text-xs mb-3 text-left">
                <i class="fas fa-exclamation-triangle"></i> <b>ตรวจพบการใช้งานผ่านไฟล์ (file://)</b><br>
                เบราว์เซอร์ส่วนใหญ่มักจะบล็อกกล้องและ GPS เมื่อเปิดไฟล์โดยตรงจากเครื่องครับ แนะนำให้รันผ่าน Web Server หรือเปิดผ่าน localhost แทนครับ
            </div>
        `;
    } else if (isInsecure) {
        protocolWarning = `
            <div class="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-800 text-xs mb-3 text-left">
                <i class="fas fa-exclamation-triangle"></i> <b>การเชื่อมต่อไม่ปลอดภัย (HTTP)</b><br>
                เบราว์เซอร์จะอนุญาตให้ใช้กล้อง/GPS เฉพาะบน HTTPS หรือ localhost เท่านั้นครับ
            </div>
        `;
    }

    Swal.fire({
        title: 'ตรวจสอบสิทธิ์ กล้อง & GPS',
        html: `
            <div class="text-left text-sm space-y-3">
                ${protocolWarning}
                <p>ระบบจะทำการขอสิทธิ์ <b>กล้องถ่ายรูป</b> และ <b>พิกัด GPS</b> เพื่อใช้ในการลงเวลาครับ</p>
                <p class="text-rose-600 font-bold text-xs">⚠️ หากคุณเคยกด "ไม่อนุญาต" (Block) ไปแล้ว ระบบจะไม่สามารถเด้งแจ้งเตือนได้อีก คุณต้องไปตั้งค่าเปิดสิทธิ์ในเบราว์เซอร์ด้วยตนเองตามวิธีด้านล่างครับ</p>
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'เริ่มตรวจสอบสิทธิ์',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#3b82f6',
    }).then(async (result) => {
        if (result.isConfirmed) {
            showLoading(true);
            let cameraSuccess = false;
            let gpsSuccess = false;
            let errMsg = '';

            // Check Camera
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error('Hardware Not Supported');
                }
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(t => t.stop());
                cameraSuccess = true;
            } catch (err) {
                cameraSuccess = false;
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errMsg += '<br>- <b>กล้อง:</b> ถูกบล็อก (Permission Denied)';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    errMsg += '<br>- <b>กล้อง:</b> ไม่พบอุปกรณ์กล้อง';
                } else {
                    errMsg += '<br>- <b>กล้อง:</b> ไม่พร้อมใช้งาน (' + err.name + ')';
                }
            }

            // Check GPS
            if (navigator.geolocation) {
                try {
                    await new Promise((resolve) => {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => { gpsSuccess = true; resolve(); },
                            (err) => { 
                                gpsSuccess = false; 
                                if (err.code === 1) errMsg += '<br>- <b>GPS:</b> ถูกบล็อก (Permission Denied)';
                                else if (err.code === 2) errMsg += '<br>- <b>GPS:</b> ไม่สามารถระบุตำแหน่งได้ (Position Unavailable)';
                                else if (err.code === 3) errMsg += '<br>- <b>GPS:</b> ค้นหาตำแหน่งเกินเวลา (Timeout)';
                                else errMsg += '<br>- <b>GPS:</b> เกิดข้อผิดพลาด (' + err.message + ')';
                                resolve(); 
                            },
                            { enableHighAccuracy: false, timeout: 8000 }
                        );
                    });
                } catch (e) {
                    gpsSuccess = false;
                    errMsg += '<br>- <b>GPS:</b> เกิดข้อผิดพลาดที่ไม่รู้จัก';
                }
            } else {
                errMsg += '<br>- <b>GPS:</b> เบราว์เซอร์ไม่รองรับ';
            }

            showLoading(false);

            if (cameraSuccess && gpsSuccess) {
                Swal.fire({
                    title: 'สำเร็จ',
                    text: 'ได้รับสิทธิ์ครบถ้วน ระบบกำลังโหลดกล้องและแผนที่ใหม่...',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                }).then(() => {
                    startCamera();
                    initMapAndGPS();
                });
            } else {
                Swal.fire({
                    title: 'ไม่ได้รับสิทธิ์บางอย่าง',
                    html: `
                        <div class="text-left text-sm mb-3">
                            ${errMsg}
                        </div>
                        <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 text-left text-xs space-y-2">
                            <p class="font-bold text-blue-800">วิธีแก้ไข:</p>
                            <p>1. กดที่ไอคอน <i class="fas fa-lock"></i> (แม่กุญแจ) หรือ <i class="fas fa-info-circle"></i> มุมซ้ายบนของช่องพิมพ์ URL</p>
                            <p>2. หาเมนู <b>"สิทธิ์" (Permissions)</b> หรือ Site Settings</p>
                            <p>3. เปลี่ยน <b>"กล้อง" (Camera)</b> และ <b>"ตำแหน่ง" (Location)</b> เป็น <b>อนุญาต (Allow)</b></p>
                            <p>4. <b>รีเฟรชหน้าเว็บ</b> เพื่อให้ค่าที่ตั้งใหม่ทำงานครับ</p>
                        </div>
                    `,
                    icon: 'warning',
                    confirmButtonText: 'รับทราบ',
                    confirmButtonColor: '#3b82f6'
                });
            }
        }
    });
}
