// --- CONFIG ---
let APP_CONFIG = {};
let SUPABASE_URL = "";
let SUPABASE_KEY = "";
let BOT_USERNAME = "";
let APP_DEBUG = true;
let APP_TIMEOUT_MS = 12000;
let APP_INIT_TIMEOUT_MS = 15000;

const tg = window.Telegram?.WebApp || null;
if (tg?.expand) tg.expand();
const debugUserId = Number(new URLSearchParams(window.location.search).get('debugUser')) || null;

function refreshRuntimeConfig() {
    APP_CONFIG = window.APP_CONFIG || {};
    SUPABASE_URL = APP_CONFIG.SUPABASE_URL || "";
    SUPABASE_KEY = APP_CONFIG.SUPABASE_ANON_KEY || "";
    BOT_USERNAME = APP_CONFIG.BOT_USERNAME || "";
    APP_DEBUG = APP_CONFIG.DEBUG !== false;
    APP_TIMEOUT_MS = Number(APP_CONFIG.TIMEOUT_MS || 12000);
    APP_INIT_TIMEOUT_MS = Number(APP_CONFIG.INIT_TIMEOUT_MS || 15000);

    return {
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        botUsername: BOT_USERNAME,
        debug: APP_DEBUG,
        timeoutMs: APP_TIMEOUT_MS,
        initTimeoutMs: APP_INIT_TIMEOUT_MS
    };
}
refreshRuntimeConfig();

function getTelegramUserId() {
    const raw = tg?.initDataUnsafe?.user?.id;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
}

async function resolveCurrentUserIdWithRetry(maxWaitMs = 1200) {
    const started = Date.now();
    let telegramId = getTelegramUserId();

    while (!telegramId && tg && Date.now() - started < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        telegramId = getTelegramUserId();
    }

    return telegramId || debugUserId || null;
}

let currentUserId = getTelegramUserId() || debugUserId || null;
let currentUserMode = currentUserId ? (getTelegramUserId() ? 'telegram' : 'debug') : 'pending';
const icons = ['shopping-cart', 'zap', 'wifi', 'smartphone', 'car', 'home', 'gift', 'coffee', 'music', 'book', 'heart', 'smile', 'star', 'briefcase', 'credit-card', 'monitor', 'tool', 'truck', 'shopping-bag', 'banknote', 'pill', 'shirt'];

function normalizeError(error) {
    if (!error) return { message: "Noma'lum xatolik", stack: "" };
    if (typeof error === 'string') return { message: error, stack: "" };
    return {
        message: error.message || JSON.stringify(error),
        stack: error.stack || "",
        code: error.code,
        details: error.details,
        hint: error.hint,
        status: error.status
    };
}

function ensureDebugPanel() {
    if (!APP_DEBUG || typeof document === 'undefined' || !document.body) return null;
    let panel = document.getElementById('app-debug-panel');
    if (panel) return panel;
    panel = document.createElement('details');
    panel.id = 'app-debug-panel';
    panel.style.cssText = [
        'position:fixed',
        'left:12px',
        'right:12px',
        'bottom:90px',
        'z-index:99998',
        'max-height:38vh',
        'overflow:auto',
        'background:rgba(2,6,23,.94)',
        'border:1px solid rgba(51,65,85,.9)',
        'border-radius:14px',
        'color:#cbd5e1',
        'font-size:11px',
        'box-shadow:0 10px 35px rgba(0,0,0,.35)',
        'padding:0'
    ].join(';');
    panel.innerHTML = `<summary style="cursor:pointer;padding:10px 12px;font-weight:700;color:#f8fafc;">Debug log</summary><div id="app-debug-log" style="padding:0 12px 12px;white-space:pre-wrap;"></div>`;
    document.body.appendChild(panel);
    return panel;
}

function appendDebugLog(entry) {
    if (!APP_DEBUG || typeof document === 'undefined' || !document.body) return;
    const panel = ensureDebugPanel();
    const logBox = panel?.querySelector('#app-debug-log');
    if (!logBox) return;
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 0;border-top:1px solid rgba(51,65,85,.45);';
    row.textContent = JSON.stringify(entry, null, 2);
    logBox.prepend(row);
}

function withTimeout(promise, scope = 'operation', timeoutMs = APP_TIMEOUT_MS) {
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${scope} timeout (${timeoutMs}ms)`)), timeoutMs))
    ]);
}

function logApp(level = 'info', scope = 'APP', error = null, extra = null) {
    const payload = {
        time: new Date().toISOString(),
        level: String(level).toUpperCase(),
        scope,
        userId: typeof currentUserId !== 'undefined' ? currentUserId : null,
        ...(error ? { error: normalizeError(error) } : {}),
        ...(extra ? { extra } : {})
    };

    const method =
        level === 'error' ? 'error' :
        level === 'warn' ? 'warn' :
        level === 'debug' ? 'debug' : 'log';

    console[method](`[${payload.level}] ${scope}`, payload);
    appendDebugLog(payload);
    return payload;
}

function showInfoBanner(message, tone = 'info') {
    const bannerId = 'global-app-info-banner';
    let banner = document.getElementById(bannerId);
    const bg = tone === 'warn' ? 'rgba(120,53,15,0.96)' : 'rgba(30,41,59,0.96)';
    const border = tone === 'warn' ? 'rgba(251,191,36,.35)' : 'rgba(96,165,250,.25)';

    if (!banner) {
        banner = document.createElement('div');
        banner.id = bannerId;
        banner.style.cssText = [
            'position:fixed',
            'left:12px',
            'right:12px',
            'top:12px',
            'z-index:99997',
            `background:${bg}`,
            'color:#fff',
            `border:1px solid ${border}`,
            'border-radius:16px',
            'padding:12px 14px',
            'box-shadow:0 12px 40px rgba(0,0,0,.35)',
            'font-size:12px',
            'line-height:1.45',
            'backdrop-filter:blur(8px)'
        ].join(';');
        document.body.appendChild(banner);
    }

    banner.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div>${message}</div>
            <button onclick="this.parentElement.parentElement.remove()" style="background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;">×</button>
        </div>
    `;
}

function showErrorBanner(title, error = null) {
    const info = normalizeError(error);
    const bannerId = 'global-app-error-banner';
    let banner = document.getElementById(bannerId);

    if (!banner) {
        banner = document.createElement('div');
        banner.id = bannerId;
        banner.style.cssText = [
            'position:fixed',
            'left:12px',
            'right:12px',
            'top:12px',
            'z-index:99999',
            'background:rgba(127,29,29,0.96)',
            'color:#fff',
            'border:1px solid rgba(248,113,113,.45)',
            'border-radius:16px',
            'padding:12px 14px',
            'box-shadow:0 12px 40px rgba(0,0,0,.35)',
            'font-size:12px',
            'line-height:1.45',
            'backdrop-filter:blur(8px)'
        ].join(';');
        document.body.appendChild(banner);
    }

    banner.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div>
                <div style="font-weight:700;margin-bottom:4px;">${title}</div>
                <div style="opacity:.95;">${info.message || "Noma'lum xatolik"}</div>
                ${APP_DEBUG && info.code ? `<div style="opacity:.8;margin-top:4px;">Code: ${info.code}</div>` : ''}
                ${APP_DEBUG && info.details ? `<div style="opacity:.8;margin-top:4px;">Details: ${info.details}</div>` : ''}
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;">×</button>
        </div>
    `;
}

window.addEventListener('error', (event) => {
    logApp('error', 'window.onerror', event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
    showErrorBanner('Frontend xatoligi yuz berdi', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    logApp('error', 'unhandledrejection', event.reason);
    showErrorBanner('Promise xatoligi yuz berdi', event.reason);
});

function mustGetEl(id, { silent = false } = {}) {
    const el = document.getElementById(id);
    if (!el && !silent) logApp('warn', 'DOM', new Error(`#${id} elementi topilmadi`));
    return el;
}

function setTextSafe(id, value) {
    const el = mustGetEl(id, { silent: true });
    if (el) el.innerText = value;
}

function setClassSafe(id, value) {
    const el = mustGetEl(id, { silent: true });
    if (el) el.className = value;
}

let supabase = null;

async function waitForRuntimeDeps(timeoutMs = 8000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        const cfg = refreshRuntimeConfig();
        const hasSupabaseLib = !!window.supabase?.createClient;
        const hasConfig = !!cfg.supabaseUrl && !!cfg.supabaseKey;

        if (hasSupabaseLib && hasConfig) return cfg;
        await new Promise((resolve) => setTimeout(resolve, 120));
    }

    throw new Error('APP_CONFIG yoki Supabase script vaqtida yuklanmadi');
}

function initSupabaseClient() {
    const cfg = refreshRuntimeConfig();

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase client script yuklanmagan yoki window.supabase.createClient topilmadi');
    }
    if (!cfg.supabaseUrl) throw new Error("SUPABASE_URL bo'sh");
    if (!cfg.supabaseKey) throw new Error("SUPABASE_ANON_KEY bo'sh");

    return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: false }
    });
}

function getSupabase() {
    if (!supabase) throw new Error('Supabase client hali ishga tushmagan');
    return supabase;
}


// --- STATE ---
let transactions = [];
let allCats = { income: [], expense: [] };
let currentUserProfile = null;
let pin = localStorage.getItem('pin');
let bioEnabled = localStorage.getItem('bio') === 'true';
// O'ZGARISH: exchangeRate shu yerda e'lon qilindi
let exchangeRate = localStorage.getItem('exchangeRate') || 12850; 
let activeType = 'all', activeDate = 'all', botState = 'idle', draft = { receipt: null, rawFile: null }, selId = null, selIcon = 'circle';
let pinInput = "", pinStep = 'unlock', tempPin = "";
let selCatIndex = null, selCatType = null;
let isBiometricAvailable = false;
let dashboardCurrency = 'UZS';
let inputCurrency = 'UZS'; // Bot uchun

// --- INIT ---
async function checkBiometricAvailability() {
    try {
        if (!window.PublicKeyCredential) return false;
        if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (err) {
        logApp('warn', 'Biometric availability', err);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const skeleton = mustGetEl('dashboard-skeleton', { silent: true });
    const dashboard = mustGetEl('view-dashboard', { silent: true });
    const initWatchdog = setTimeout(() => {
        if (skeleton && !skeleton.classList.contains('hidden')) {
            logApp('error', 'INIT_WATCHDOG', new Error('Initial load juda uzoq davom etdi'));
            showErrorBanner("Mini app yuklanishi cho'zilib ketdi", new Error('Initial load timeout'));
            skeleton.classList.add('hidden');
            if (dashboard) dashboard.classList.remove('hidden');
        }
    }, APP_INIT_TIMEOUT_MS + 1000);

    try {
        refreshRuntimeConfig();

        if (tg?.ready) {
            try { tg.ready(); } catch (readyErr) { logApp('warn', 'Telegram.ready', readyErr); }
        }

        await waitForRuntimeDeps(APP_INIT_TIMEOUT_MS);
        supabase = initSupabaseClient();
        logApp('debug', 'Supabase init', null, { hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_KEY });

        currentUserId = await resolveCurrentUserIdWithRetry(APP_TIMEOUT_MS);
        currentUserMode = getTelegramUserId() ? 'telegram' : (debugUserId ? 'debug' : 'missing');

        logApp('info', 'UserContext', null, {
            mode: currentUserMode,
            currentUserId,
            hasTelegramUser: !!getTelegramUserId(),
            hasDebugUser: !!debugUserId
        });

        if (!currentUserId) {
            throw new Error("Telegram user aniqlanmadi. Mini appni bot ichidan oching yoki ?debugUser=USER_ID ishlating.");
        }

        if (currentUserMode === 'debug') {
            showInfoBanner(`Debug rejim: user_id = ${currentUserId}`, 'warn');
        }

        if (window.lucide?.createIcons) lucide.createIcons();
        else logApp('warn', 'lucide', new Error('lucide.createIcons topilmadi'));

        updateHeaderProfile();
        isBiometricAvailable = await checkBiometricAvailability();

        if (pin) showPinScreen('unlock');
        if (localStorage.getItem('theme') === 'light') toggleTheme(true);

        logApp('info', 'INIT', null, { message: "Ma'lumotlar yuklanmoqda..." });

        const ic = mustGetEl('icon-selector', { silent: true });
        if (ic) {
            icons.forEach(i => {
                const d = document.createElement('div');
                d.className = "p-2 rounded-lg bg-slate-700 flex items-center justify-center cursor-pointer icon-opt transition-all";
                d.innerHTML = `<i data-lucide="${i}" class="w-5 h-5 text-slate-300 pointer-events-none"></i>`;
                d.onclick = () => {
                    document.querySelectorAll('.icon-opt').forEach(e => e.classList.remove('selected'));
                    d.classList.add('selected');
                    selIcon = i;
                };
                ic.appendChild(d);
            });
        }

        window.addEventListener('click', () => {
            const menu = mustGetEl('cat-context-menu', { silent: true });
            if (menu) menu.classList.add('hidden');
        });

        await withTimeout(fetchInitialData(), 'fetchInitialData', APP_INIT_TIMEOUT_MS);
        updateUI();
        updateSettingsUI();

        const navDash = mustGetEl('nav-dashboard', { silent: true });
        if (navDash) navDash.classList.add('active');
    } catch (err) {
        logApp('error', 'DOMContentLoaded init', err);
        showErrorBanner("Mini app yuklanishda xatolik bo'ldi", err);
    } finally {
        clearTimeout(initWatchdog);
        setTimeout(() => {
            if (skeleton) skeleton.classList.add('hidden');
            if (dashboard) dashboard.classList.remove('hidden');
        }, 250);
    }

    // --- SWIPE LOGIC (O'ZGARTIRILDI: MOUSE EVENTS QO'SHILDI) ---
    const card = mustGetEl('balance-card', { silent: true });
    if (card) {
        let startX = 0;
        let endX = 0;

        // Touch events (Telefonlar uchun)
        card.addEventListener('touchstart', (e) => {
            startX = e.changedTouches[0].screenX;
        }, { passive: true });

        card.addEventListener('touchend', (e) => {
            endX = e.changedTouches[0].screenX;
            handleDashboardSwipe(startX, endX);
        }, { passive: true });

        // Mouse events (Kompyuter/Laptop uchun)
        card.addEventListener('mousedown', (e) => {
            startX = e.clientX;
        });

        card.addEventListener('mouseup', (e) => {
            endX = e.clientX;
            handleDashboardSwipe(startX, endX);
        });

        // Swipe handler function
        function handleDashboardSwipe(s, e) {
            const threshold = 50;

            if (s - e > threshold && dashboardCurrency === 'UZS') {
                setDashboardCurrency('USD');
            }

            if (e - s > threshold && dashboardCurrency === 'USD') {
                setDashboardCurrency('UZS');
            }
        }
    }
});

function setDashboardCurrency(curr) {
    if (curr === dashboardCurrency) return;

    dashboardCurrency = curr;
    vibrate('medium');

    const swiper = mustGetEl('balance-swiper', { silent: true });
    const dotUzs = mustGetEl('dot-uzs', { silent: true });
    const dotUsd = mustGetEl('dot-usd', { silent: true });

    if (curr === 'USD') {
        if (swiper) {
            swiper.style.transform = 'translateX(-10px)';
            setTimeout(() => swiper.style.transform = 'translateX(0)', 150);
        }
        if (dotUzs) dotUzs.classList.remove('active');
        if (dotUsd) dotUsd.classList.add('active');
    } else {
        if (swiper) {
            swiper.style.transform = 'translateX(10px)';
            setTimeout(() => swiper.style.transform = 'translateX(0)', 150);
        }
        if (dotUsd) dotUsd.classList.remove('active');
        if (dotUzs) dotUzs.classList.add('active');
    }

    updateUI();
}

// --- BACKEND ---
async function fetchInitialData() {
    const client = getSupabase();

    if (!currentUserId) {
        currentUserId = await resolveCurrentUserIdWithRetry(APP_TIMEOUT_MS);
        currentUserMode = getTelegramUserId() ? 'telegram' : (debugUserId ? 'debug' : 'missing');
    }

    logApp('info', 'fetchInitialData.start', null, {
        currentUserId,
        currentUserMode,
        telegramUserId: getTelegramUserId(),
        debugUserId
    });

    let userData = null;
    const userRes = await withTimeout(client
        .from('users')
        .select('user_id, full_name, exchange_rate, premium_status, premium_until')
        .eq('user_id', currentUserId)
        .single(), 'users.select');

    if (userRes.error && userRes.error.code !== 'PGRST116') {
        logApp('error', 'users.select', userRes.error, { currentUserId });
        throw new Error(`Foydalanuvchini olishda xatolik: ${userRes.error.message}`);
    }

    userData = userRes.data;

    if (!userData && tg?.initDataUnsafe?.user) {
        const tgUser = tg.initDataUnsafe.user;
        const payload = {
            user_id: currentUserId,
            full_name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() || tgUser.username || `User ${currentUserId}`,
            exchange_rate: Number(localStorage.getItem('exchangeRate')) || 12850
        };

        const upsertRes = await withTimeout(client.from('users').upsert(payload, { onConflict: 'user_id' }), 'users.upsert');
        if (upsertRes.error) {
            logApp('error', 'users.upsert', upsertRes.error, { payload });
            throw new Error(`Foydalanuvchini yaratishda xatolik: ${upsertRes.error.message}`);
        }

        const result = await withTimeout(client
            .from('users')
            .select('user_id, full_name, exchange_rate, premium_status, premium_until')
            .eq('user_id', currentUserId)
            .single(), 'users.reselect');

        if (result.error && result.error.code !== 'PGRST116') {
            logApp('error', 'users.reselect', result.error, { currentUserId });
            throw new Error(`Foydalanuvchini qayta olishda xatolik: ${result.error.message}`);
        }

        userData = result.data;
    }

    currentUserProfile = userData || {
        user_id: currentUserId,
        full_name: tg?.initDataUnsafe?.user
            ? [tg.initDataUnsafe.user.first_name, tg.initDataUnsafe.user.last_name].filter(Boolean).join(' ').trim()
            : `Demo ${currentUserId}`,
        exchange_rate: Number(localStorage.getItem('exchangeRate')) || 12850,
        premium_status: 'free',
        premium_until: null
    };

    if (currentUserProfile.exchange_rate) {
        exchangeRate = Number(currentUserProfile.exchange_rate);
        localStorage.setItem('exchangeRate', exchangeRate);
    }

    const tRes = await withTimeout(client
        .from('transactions')
        .select('*')
        .eq('user_id', currentUserId)
        .order('date', { ascending: false }), 'transactions.select');

    if (tRes.error) {
        logApp('error', 'transactions.select', tRes.error, { currentUserId });
        throw new Error(`Tranzaksiyalarni olishda xatolik: ${tRes.error.message}`);
    }

    if (tRes.data) transactions = tRes.data;

    const cRes = await withTimeout(client
        .from('categories')
        .select('*')
        .eq('user_id', currentUserId)
        .order('name', { ascending: true }), 'categories.select');

    if (cRes.error) {
        logApp('error', 'categories.select', cRes.error, { currentUserId });
        throw new Error(`Kategoriyalarni olishda xatolik: ${cRes.error.message}`);
    }

    if (!cRes.data || cRes.data.length === 0) await initDefaultCategories();
    else {
        allCats.income = cRes.data.filter(c => c.type === 'income');
        allCats.expense = cRes.data.filter(c => c.type === 'expense');
    }

    updateHeaderProfile();
    updatePremiumUI();

    if (currentUserMode !== 'telegram') {
        logApp('warn', 'UserContext', new Error('App Telegram foydalanuvchisi bilan ochilmagan'), {
            currentUserMode,
            currentUserId,
            hint: 'Telegram ichidan oching yoki ?debugUser=USER_ID ishlating'
        });
    }
}

async function initDefaultCategories() {
    const client = getSupabase();
    const default_income = [
        { name: "Oylik", icon: "banknote", type: "income" },
        { name: "Bonus", icon: "gift", type: "income" },
        { name: "Sotuv", icon: "shopping-bag", type: "income" }
    ];
    const default_expense = [
        { name: "Oziq-ovqat", icon: "shopping-cart", type: "expense" },
        { name: "Transport", icon: "bus", type: "expense" },
        { name: "Kafe", icon: "coffee", type: "expense" }
    ];
    const all = [...default_income, ...default_expense].map(c => ({ ...c, user_id: currentUserId }));
    const { error } = await withTimeout(client.from('categories').insert(all), 'categories.insert_defaults');
    if (error) {
        logApp('error', 'categories.initDefault', error, { currentUserId });
        throw new Error(`Standart kategoriyalarni yaratishda xatolik: ${error.message}`);
    }
    allCats.income = default_income;
    allCats.expense = default_expense;
}

// --- NAVIGATION ---
function switchTab(t) {
    vibrate('light');
    ['dashboard', 'bot', 'history'].forEach(v => { const el = document.getElementById(`view-${v}`); if (el) el.classList.add('hidden'); });
    const target = document.getElementById(`view-${t}`);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const botBtn = document.getElementById('nav-bot');
    if (botBtn) { botBtn.classList.remove('active'); botBtn.querySelector('i').classList.remove('text-blue-500'); botBtn.querySelector('i').classList.add('text-white'); }
    if (t === 'bot') { if (botBtn) { botBtn.classList.add('active'); botBtn.querySelector('i').classList.remove('text-white'); botBtn.querySelector('i').classList.add('text-blue-500'); } }
    else { const activeBtn = document.getElementById(`nav-${t}`); if (activeBtn) activeBtn.classList.add('active'); }
    if (t === 'dashboard') updateUI();
    lucide.createIcons();
}

// --- CATEGORY ACTIONS (EDIT/DELETE) ---
let longPressTimer;
function handleCatPressStart(e, idx, type) { longPressTimer = setTimeout(() => showCatOptions(e, idx, type), 500); }
function handleCatPressEnd() { clearTimeout(longPressTimer); }
function showCatOptions(e, idx, type) {
    e.preventDefault(); selCatIndex = idx; selCatType = type;
    const menu = document.getElementById('cat-context-menu');
    const clickX = e.clientX || e.touches[0].clientX; const clickY = e.clientY || e.touches[0].clientY;
    menu.style.left = `${Math.min(clickX, window.innerWidth - 170)}px`; menu.style.top = `${Math.min(clickY, window.innerHeight - 100)}px`;
    menu.classList.remove('hidden');
}
function editCatFromMenu() {
    const cat = allCats[selCatType][selCatIndex];
    document.getElementById('edit-cat-name-input').value = cat.name;
    document.getElementById('edit-cat-modal').classList.remove('hidden'); document.getElementById('cat-context-menu').classList.add('hidden');
}
async function confirmEditCat() {
    const newName = document.getElementById('edit-cat-name-input').value;
    if (newName) {
        const cat = allCats[selCatType][selCatIndex]; const oldName = cat.name;
        allCats[selCatType][selCatIndex].name = newName; renderBotCats(selCatType); closeModal('edit-cat-modal');
        const { error } = await withTimeout(getSupabase().from('categories').update({ name: newName }).eq('user_id', currentUserId).eq('name', oldName).eq('type', selCatType), 'categories.update');
        if (error) throw error;
    }
}
async function deleteCatFromMenu() {
    if (confirm("Bu kategoriyani o'chirasizmi?")) {
        const catToDelete = allCats[selCatType][selCatIndex];
        allCats[selCatType].splice(selCatIndex, 1); renderBotCats(selCatType); document.getElementById('cat-context-menu').classList.add('hidden');
        const { error } = await withTimeout(getSupabase().from('categories').delete().eq('user_id', currentUserId).eq('name', catToDelete.name).eq('type', selCatType), 'categories.delete');
        if (error) throw error;
    }
}

// --- PIN SYSTEM ---
function showPinScreen(step) {
    pinStep = step; pinInput = ""; updatePinDots();
    document.getElementById('pin-screen').classList.remove('hidden');
    const t = document.getElementById('pin-title'), s = document.getElementById('pin-subtitle'), c = document.getElementById('cancel-pin-setup'), bioBtn = document.getElementById('bio-btn'), bioPlace = document.getElementById('bio-placeholder');
    if (step === 'unlock') {
        t.innerText = "PIN Kod"; s.innerText = "Kirish uchun"; c.classList.add('hidden');
        if (bioEnabled && isBiometricAvailable) { bioBtn.classList.remove('hidden'); bioPlace.classList.add('hidden'); setTimeout(triggerBiometric, 300); } else { bioBtn.classList.add('hidden'); bioPlace.classList.remove('hidden'); }
    } else if (step === 'setup_old') { t.innerText = "Eski PIN"; s.innerText = "Tasdiqlash uchun"; c.classList.remove('hidden'); bioBtn.classList.add('hidden'); bioPlace.classList.remove('hidden'); } else if (step === 'setup_new') { t.innerText = "Yangi PIN"; s.innerText = "4 xonali kod o'rnating"; c.classList.remove('hidden'); bioBtn.classList.add('hidden'); bioPlace.classList.remove('hidden'); } else if (step === 'setup_confirm') { t.innerText = "Qayta kiritish"; s.innerText = "Yangi PINni tasdiqlang"; }
}
function handlePinInput(n) { vibrate('medium'); if (pinInput.length < 4) { pinInput += n; updatePinDots(); if (pinInput.length === 4) setTimeout(checkPin, 200); } }
function handlePinDelete() { pinInput = pinInput.slice(0, -1); updatePinDots(); }
function updatePinDots() { document.querySelectorAll('.pin-dot').forEach((d, i) => i < pinInput.length ? d.classList.add('bg-blue-500', 'active', 'scale-110') : d.classList.remove('bg-blue-500', 'active', 'scale-110')); }
function checkPin() {
    const d = document.getElementById('pin-dots'); const err = () => { d.classList.add('shake'); setTimeout(() => { d.classList.remove('shake'); pinInput = ""; updatePinDots(); }, 400); };
    if (pinStep === 'unlock') { if (pinInput === pin) { document.getElementById('pin-screen').classList.add('hidden'); } else err(); } else if (pinStep === 'setup_old') { if (pinInput === pin) { showPinScreen('setup_new'); } else err(); } else if (pinStep === 'setup_new') { tempPin = pinInput; showPinScreen('setup_confirm'); } else if (pinStep === 'setup_confirm') { if (pinInput === tempPin) { pin = tempPin; localStorage.setItem('pin', pin); document.getElementById('pin-screen').classList.add('hidden'); updateSettingsUI(); alert("PIN o'zgartirildi! ✅"); closeModal('settings-modal'); } else { alert("Mos kelmadi!"); showPinScreen('setup_new'); } }
}
async function triggerBiometric() { if (!isBiometricAvailable) return; try { const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge); await navigator.credentials.get({ publicKey: { challenge: challenge, timeout: 60000, userVerification: "required", } }); document.getElementById('pin-screen').classList.add('hidden'); } catch (e) { console.log("Biometric error", e); } }
function startPinSetup() { if (pin) showPinScreen('setup_old'); else showPinScreen('setup_new'); }
function cancelPinSetup() { document.getElementById('pin-screen').classList.add('hidden'); }
function toggleBiometric(el) { bioEnabled = el.checked; localStorage.setItem('bio', bioEnabled); }
function removePin() { if (confirm("PIN kodni olib tashlaysizmi?")) { localStorage.removeItem('pin'); pin = null; updateSettingsUI(); alert("PIN kod olib tashlandi."); closeModal('settings-modal'); } }

// --- UPLOAD & RECEIPT ---
function handleReceiptUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    draft.rawFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image(); img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const maxW = 800; const scale = maxW / img.width;
            canvas.width = scale < 1 ? maxW : img.width; canvas.height = scale < 1 ? img.height * scale : img.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            draft.receipt = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('receipt-img-preview').src = draft.receipt;
            document.getElementById('receipt-preview-area').classList.remove('hidden');
        }
    }; reader.readAsDataURL(file);
}
async function uploadReceipt(file) {
    const client = getSupabase();
    const fileName = `${currentUserId}/${Date.now()}.jpg`;
    const { error } = await withTimeout(client.storage.from('receipts').upload(fileName, file), 'storage.uploadReceipt');
    if (error) {
        logApp('error', 'storage.uploadReceipt', error, { fileName, fileType: file?.type, fileSize: file?.size });
        throw error;
    }
    const { data: { publicUrl } } = client.storage.from('receipts').getPublicUrl(fileName);
    return publicUrl;
}
function clearReceipt() { draft.receipt = null; draft.rawFile = null; document.getElementById('file-upload').value = ''; document.getElementById('receipt-preview-area').classList.add('hidden'); }
function viewReceipt(src) { document.getElementById('full-receipt-image').src = src; document.getElementById('receipt-modal').classList.remove('hidden'); }
function closeReceiptModal() { document.getElementById('receipt-modal').classList.add('hidden'); }

// --- CORE UI ---
function updateUI() {
    const { s, e } = getDateRange();
    transactions.sort((a, b) => b.date - a.date);
    const f = transactions.filter(t => t.date >= s && t.date <= e);

    const incBase = f.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const expBase = f.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const balBase = incBase - expBase;

    if (dashboardCurrency === 'USD' && exchangeRate > 0) {
        setTextSafe('total-balance', `$ ${formatNumber((balBase / exchangeRate).toFixed(2))}`);
        setTextSafe('total-income', `+$ ${formatNumber((incBase / exchangeRate).toFixed(2))}`);
        setTextSafe('total-expense', `-$ ${formatNumber((expBase / exchangeRate).toFixed(2))}`);
        setTextSafe('currency-badge', "USD");
        setClassSafe('currency-badge', "text-[10px] bg-blue-500 px-1.5 py-0.5 rounded text-white font-mono");
    } else {
        setTextSafe('total-balance', `${formatNumber(balBase)} so'm`);
        setTextSafe('total-income', `+${formatNumber(incBase)}`);
        setTextSafe('total-expense', `-${formatNumber(expBase)}`);
        setTextSafe('currency-badge', "UZS");
        setClassSafe('currency-badge', "text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white font-mono");
    }

    updateTrendWidgets();

    const ci = mustGetEl('card-income', { silent: true });
    const ce = mustGetEl('card-expense', { silent: true });

    if (ci) {
        ci.className = `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'income' ? 'bg-emerald-500/20 border-emerald-500' : 'hover:bg-emerald-500/10'}`;
    }

    if (ce) {
        ce.className = `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'expense' ? 'bg-rose-500/20 border-rose-500' : 'hover:bg-rose-500/10'}`;
    }

    renderCharts(f);
    renderHistory();
}

function updateTrendWidgets() {
    const trendContainer = mustGetEl('trend-container', { silent: true });
    const trendList = mustGetEl('trend-list', { silent: true });
    if (!trendList) return;

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const lastMonthEnd = thisMonthStart - 1;

    const thisMonthTrans = transactions.filter(t => t.date >= thisMonthStart && t.type === 'expense');
    const lastMonthTrans = transactions.filter(t => t.date >= lastMonthStart && t.date <= lastMonthEnd && t.type === 'expense');

    const group = (arr) => arr.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + (Number(t.amount) || 0);
        return acc;
    }, {});

    const curr = group(thisMonthTrans);
    const prev = group(lastMonthTrans);
    const cats = [...new Set([...Object.keys(curr), ...Object.keys(prev)])];

    let html = '';

    if (cats.length > 0 && trendContainer) {
        trendContainer.classList.remove('hidden');
    }

    cats.forEach(c => {
        const cVal = curr[c] || 0;
        const pVal = prev[c] || 0;

        if (pVal > 0 && cVal > 0) {
            const pct = ((cVal - pVal) / pVal) * 100;

            if (Math.abs(pct) > 5) {
                const isBad = pct > 0;
                const color = isBad ? 'text-rose-400' : 'text-emerald-400';
                const icon = isBad ? 'trending-up' : 'trending-down';

                html += `<div class="glass-panel p-3 rounded-xl flex justify-between items-center"><div><div class="text-xs text-slate-400">${c}</div><div class="font-bold text-sm text-white">${formatNumber(cVal)}</div></div><div class="text-right"><div class="${color} font-bold text-xs flex items-center gap-1 justify-end"><i data-lucide="${icon}" class="w-3 h-3"></i> ${Math.round(Math.abs(pct))}%</div><div class="text-xs text-slate-500">o'tgan oy</div></div></div>`;
            }
        }
    });

    trendList.innerHTML = html || '<div class="col-span-2 text-center text-xs text-slate-500 py-2">Trendlar uchun ma\'lumot yetarli emas</div>';
}
function renderCharts(data) {
    const canvas = mustGetEl('categoryChart', { silent: true });
    if (!canvas) {
        logApp('warn', 'renderCharts', new Error('#categoryChart topilmadi'));
        return;
    }
    if (typeof Chart === 'undefined') {
        logApp('error', 'renderCharts', new Error('Chart kutubxonasi yuklanmagan'));
        showErrorBanner('Diagramma kutubxonasi yuklanmagan', new Error('Chart is undefined'));
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        logApp('error', 'renderCharts', new Error('Canvas context olinmadi'));
        return;
    }

    let t = activeType === 'income' ? data.filter(x => x.type === 'income') : data.filter(x => x.type === 'expense');
    if (activeType === 'all') t = data.filter(x => x.type === 'expense');

    const noData = mustGetEl('no-data-msg', { silent: true });
    if (noData) noData.classList.toggle('hidden', t.length > 0);

    const cats = {};
    t.forEach(x => cats[x.category] = (cats[x.category] || 0) + (Number(x.amount) || 0));

    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats),
            datasets: [{
                data: Object.values(cats),
                backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { display: false } }
        }
    });

    const list = mustGetEl('top-transaction-list', { silent: true });
    if (!list) return;
    list.innerHTML = '';

    Object.entries(cats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([c, a]) => {
            list.innerHTML += `<tr><td class="py-2.5 text-slate-300 capitalize pl-2">${c}</td><td class="text-right font-bold pr-2 ${activeType === 'income' ? 'text-emerald-400' : 'text-rose-400'}">${formatNumber(a)}</td></tr>`;
        });
}
function renderHistory() {
    const list = mustGetEl('history-list', { silent: true });
    const empty = mustGetEl('empty-history', { silent: true });
    if (!list) return;

    list.innerHTML = '';
    if (empty) empty.classList.toggle('hidden', transactions.length > 0);

    transactions.forEach(t => {
        const isInc = t.type === 'income';
        const hasReceipt = t.receipt || t.receipt_url;
        const receiptBadge = hasReceipt ? `<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-0.5"><i data-lucide="paperclip" class="w-2 h-2"></i> Chek</span>` : '';
        list.innerHTML += `<div onclick="openActionSheet(event, ${t.id})" class="glass-panel p-4 rounded-2xl flex justify-between items-center cursor-pointer active:scale-95 transition-transform hover:bg-slate-800/50"><div class="flex items-center gap-4"><div class="p-3 rounded-full ${isInc ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}"><i data-lucide="${isInc ? 'arrow-down-left' : 'arrow-up-right'}" class="w-5 h-5"></i></div><div><div class="font-bold text-sm text-white capitalize flex items-center">${t.category} ${receiptBadge}</div><div class="text-xs text-slate-400 mt-0.5">${new Date(t.date).toLocaleDateString()} • ${new Date(t.date).toLocaleTimeString().slice(0, 5)}</div></div></div><div class="font-bold ${isInc ? 'text-emerald-400' : 'text-rose-400'} text-base">${isInc ? '+' : '-'}${formatNumber(t.amount)}</div></div>`;
    });

    if (window.lucide?.createIcons) lucide.createIcons();
}
// --- BOT ---
function startBotFlow(type) { draft = { type, category: '', amount: 0, receipt: null, rawFile: null }; clearReceipt(); document.getElementById('bot-start-actions').classList.add('hidden'); document.getElementById('category-selector').classList.remove('hidden'); renderBotCats(type); }
function renderBotCats(type) {
    const grid = document.getElementById('category-grid'); grid.innerHTML = '';
    allCats[type].forEach((c, idx) => {
        const btn = document.createElement('button');
        btn.className = "cat-btn flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-blue-500 transition-all active:scale-95 select-none";
        btn.innerHTML = `<i data-lucide="${c.icon}" class="w-6 h-6 mb-1 ${type === 'income' ? 'text-emerald-400' : 'text-rose-400'} pointer-events-none"></i><span class="text-[10px] text-slate-300 truncate w-full text-center pointer-events-none">${c.name}</span>`;
        btn.onclick = () => { vibrate('light'); draft.category = c.name; document.getElementById('category-selector').classList.add('hidden'); document.getElementById('bot-input-container').classList.remove('hidden'); document.getElementById('bot-input').focus(); };
        btn.oncontextmenu = (e) => showCatOptions(e, idx, type);
        btn.ontouchstart = (e) => handleCatPressStart(e, idx, type);
        btn.ontouchend = handleCatPressEnd;
        grid.appendChild(btn);
    });
    lucide.createIcons();
}

// --- CURRENCY LOGIC ---
function toggleInputCurrency() {
    vibrate('light');
    const btn = document.getElementById('currency-toggle');
    if (inputCurrency === 'UZS') {
        inputCurrency = 'USD';
        btn.innerText = 'USD';
        btn.classList.remove('text-emerald-400', 'border-emerald-500/30');
        btn.classList.add('text-blue-400', 'border-blue-500/30'); // Dollar rangi
        document.getElementById('bot-input').placeholder = "Necha dollar?";
    } else {
        inputCurrency = 'UZS';
        btn.innerText = 'UZS';
        btn.classList.remove('text-blue-400', 'border-blue-500/30');
        btn.classList.add('text-emerald-400', 'border-emerald-500/30');
        document.getElementById('bot-input').placeholder = "Summani kiriting...";
    }
}

async function submitBotInput() {
    vibrate('heavy');
    let rawVal = document.getElementById('bot-input').value;
    // Faqat raqamlarni ajratib olish
    let val = parseFloat(rawVal.replace(/[^0-9.]/g, ''));
    
    if (!val) return;

    // AGAR VALYUTA USD BO'LSA:
    let finalAmount = val;
    let note = "";
    
    if (inputCurrency === 'USD') {
        finalAmount = Math.round(val * exchangeRate);
        note = ` ($${val})`; // Izohga dollar qiymatini qo'shib qo'yamiz
    }

    let finalReceiptUrl = null;
    if (draft.rawFile) { try { finalReceiptUrl = await uploadReceipt(draft.rawFile); } catch (e) { alert("Rasm yuklanmadi, lekin tranzaksiya saqlanadi."); } }
    
    const newTrans = { 
        user_id: currentUserId, 
        amount: finalAmount, 
        category: draft.category + note, 
        type: draft.type, 
        date: Date.now(), 
        receipt_url: finalReceiptUrl 
    };
    
    const tempId = Date.now();
    transactions.unshift({ ...newTrans, id: tempId, receipt: draft.receipt });
    updateUI();
    document.getElementById('bot-input').value = ''; 
    
    // Reset Currency to UZS after submit
    if(inputCurrency === 'USD') toggleInputCurrency();
    
    cancelBotFlow();
    
    const icon = draft.receipt ? '📎' : '';
    const chat = document.getElementById('chat-messages');
    chat.innerHTML += `<div class="msg-wrapper ai fade-in"><div class="msg-bubble ai border-l-4 ${draft.type === 'income' ? 'border-l-emerald-500' : 'border-l-rose-500'}">Saqlandi: <b>${formatNumber(finalAmount)} so'm</b> ${icon} <br><span class="text-xs opacity-70">${draft.category}${note}</span></div></div>`;
    setTimeout(() => chat.scrollTop = chat.scrollHeight, 100);
    
    draft = { receipt: null, rawFile: null };
    const client = getSupabase();
    const { data, error } = await withTimeout(client.from('transactions').insert([newTrans]).select(), 'transactions.insert');
    if (error) {
        logApp('error', 'transactions.insert', error, { newTrans });
        transactions = transactions.filter(t => t.id !== tempId);
        updateUI();
        showErrorBanner("Tranzaksiyani saqlashda xatolik bo'ldi", error);
        alert("Saqlashda xatolik bo'ldi. Internet yoki baza ulanishini tekshiring.");
    } else {
        const idx = transactions.findIndex(t => t.id === tempId);
        if (idx !== -1) transactions[idx] = { ...transactions[idx], ...data[0] };
    }
}

function cancelBotFlow() { document.getElementById('bot-input-container').classList.add('hidden'); document.getElementById('category-selector').classList.add('hidden'); document.getElementById('bot-start-actions').classList.remove('hidden'); clearReceipt(); }
// --- HELPER FUNCTIONS ---
function toggleTheme(f) { const l = f || document.body.classList.toggle('light-mode'); localStorage.setItem('theme', l ? 'light' : 'dark'); lucide.createIcons(); }
function openAddCategoryModal() { document.getElementById('add-cat-modal').classList.remove('hidden'); }
async function saveNewCategory() {
    const n = (document.getElementById('new-cat-name').value || '').trim();
    if (!n || !draft.type) return;
    const exists = allCats[draft.type].some(cat => cat.name.toLowerCase() === n.toLowerCase());
    if (exists) {
        alert("Bu kategoriya allaqachon mavjud.");
        return;
    }
    const newCat = { user_id: currentUserId, name: n, icon: selIcon, type: draft.type };
    allCats[draft.type].push(newCat);
    renderBotCats(draft.type);
    closeModal('add-cat-modal');
    document.getElementById('new-cat-name').value = '';
    const { error } = await withTimeout(getSupabase().from('categories').insert([newCat]), 'categories.insert');
    if (error) {
        console.error("Kategoriya saqlash xatoligi:", error);
        allCats[draft.type] = allCats[draft.type].filter(cat => cat !== newCat);
        renderBotCats(draft.type);
        alert("Kategoriya saqlanmadi.");
    }
}
function openSettings() { updateSettingsUI(); document.getElementById('settings-modal').classList.remove('hidden'); }

function updateHeaderProfile() {
    const nameEl = document.getElementById('header-user-name');
    const subEl = document.getElementById('header-user-subtitle');
    const badgeEl = document.getElementById('header-premium-badge');
    const avatarEl = document.getElementById('header-avatar');

    const tgUser = tg?.initDataUnsafe?.user;
    const displayName = currentUserProfile?.full_name || [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ').trim() || tgUser?.username || `User ${currentUserId}`;
    const initials = encodeURIComponent(displayName || 'User');
    if (nameEl) nameEl.innerText = displayName;
    if (subEl) {
        if (tgUser?.username) subEl.innerText = `@${tgUser.username}`;
        else if (currentUserMode === 'debug') subEl.innerText = `Debug user: ${currentUserId}`;
        else if (currentUserMode === 'missing') subEl.innerText = "Telegram user topilmadi";
        else subEl.innerText = tg ? "Telegram foydalanuvchisi" : "Web rejim";
    }
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${initials}&background=3b82f6&color=fff`;
    if (badgeEl) {
        const premiumActive = isPremiumActive();
        badgeEl.classList.toggle('hidden', !premiumActive);
        if (premiumActive && currentUserProfile?.premium_until) {
            badgeEl.innerText = `Premium · ${new Date(currentUserProfile.premium_until).toLocaleDateString('uz-UZ')}`;
        }
    }
}

function isPremiumActive() {
    if (!currentUserProfile) return false;
    if (currentUserProfile.premium_status !== 'premium') return false;
    if (!currentUserProfile.premium_until) return true;
    return new Date(currentUserProfile.premium_until).getTime() > Date.now();
}

function updatePremiumUI() {
    const statusBadge = document.getElementById('premium-status-badge');
    const textEl = document.getElementById('premium-status-text');
    const untilEl = document.getElementById('premium-until-text');
    const ctaEl = document.getElementById('premium-cta-text');
    const premiumActive = isPremiumActive();

    if (statusBadge) {
        statusBadge.innerText = premiumActive ? 'Premium' : 'Free';
        statusBadge.className = premiumActive
            ? 'px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/20'
            : 'px-2 py-1 rounded-full text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-600';
    }
    if (textEl) textEl.innerText = premiumActive ? "Premium funksiyalar yoqilgan" : "Premium hali yoqilmagan";
    if (untilEl) {
        untilEl.innerText = premiumActive && currentUserProfile?.premium_until
            ? `Amal qilish muddati: ${new Date(currentUserProfile.premium_until).toLocaleDateString('uz-UZ')}`
            : "Chek yuborib, bot ichidan premiumni yoqishingiz mumkin";
    }
    if (ctaEl) ctaEl.innerText = premiumActive ? "Statusni ko'rish" : "Botda premium olish";
    updateHeaderProfile();
}

function openPremiumInBot() {
    const deepLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=premium` : null;
    if (tg?.openTelegramLink && deepLink) {
        tg.openTelegramLink(deepLink);
        return;
    }
    if (deepLink) {
        window.open(deepLink, '_blank');
        return;
    }
    alert("BOT_USERNAME hali config qilinmagan.");
}

// O'ZGARTIRILDI: Kurs inputini yangilash qo'shildi
function updateSettingsUI() {
    setTextSafe('pin-status-text', pin ? "Faol" : "O'rnatilmagan");
    const bioToggle = mustGetEl('bio-toggle', { silent: true });
    if (bioToggle) bioToggle.checked = bioEnabled;
    const removeBtn = mustGetEl('btn-remove-pin', { silent: true });
    if (removeBtn) {
        if (pin) removeBtn.classList.remove('hidden');
        else removeBtn.classList.add('hidden');
    }
    const bioRow = mustGetEl('bio-row', { silent: true });
    if (bioRow) {
        if (isBiometricAvailable) bioRow.classList.remove('hidden');
        else bioRow.classList.add('hidden');
    }

    const rateInput = mustGetEl('exchange-rate-input', { silent: true });
    if(rateInput) rateInput.value = exchangeRate;

    updatePremiumUI();
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function formatNumber(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
function toggleTypeFilter(t) { vibrate('soft'); activeType = activeType === t ? 'all' : t; updateUI(); }
function setDateFilter(f) {
    vibrate('soft');
    activeDate = f;
    document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('filter-active'));
    const activeBtn = document.querySelector(`[data-filter="${f}"]`);
    if (activeBtn) activeBtn.classList.add('filter-active');
    else logApp('warn', 'setDateFilter', new Error(`data-filter="${f}" tugmasi topilmadi`));
    updateUI();
}
function getDateRange() {
    const now = new Date();
    let s = 0; let e = new Date().setHours(23, 59, 59, 999);
    if (activeDate === 'week') s = now.getTime() - 7 * 86400000;
    else if (activeDate === 'month') s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    else if (activeDate === 'custom') {
        s = new Date(document.getElementById('start-date').value).getTime();
        e = new Date(document.getElementById('end-date').value).getTime() + 86400000;
    }
    return { s, e };
}
// --- HAPTIC FEEDBACK ---
function vibrate(style = 'light') {
    // style: 'light', 'medium', 'heavy', 'rigid', 'soft'
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    }
}
function openDateRangeModal() { activeDate = 'custom'; document.getElementById('date-range-modal').classList.remove('hidden'); }
function applyDateRange() { updateUI(); closeModal('date-range-modal'); }
// --- IMPORT / EXPORT (Tuzatilgan) ---
function exportData() {
    const data = {
        transactions,
        allCats,
        pin,
        bio: bioEnabled,
        exchangeRate,
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_kassa_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
async function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const backup = JSON.parse(event.target.result);
            if (backup.pin) localStorage.setItem('pin', backup.pin);
            if (backup.bio !== undefined) localStorage.setItem('bio', backup.bio);
            if (backup.exchangeRate) {
                exchangeRate = Number(backup.exchangeRate);
                localStorage.setItem('exchangeRate', exchangeRate);
                await withTimeout(getSupabase().from('users').update({ exchange_rate: exchangeRate }).eq('user_id', currentUserId), 'users.exchange_rate.import');
            }
            if (backup.transactions && Array.isArray(backup.transactions) && backup.transactions.length > 0) {
                const newTrans = backup.transactions.map(t => { const { id, ...rest } = t; return { ...rest, user_id: currentUserId }; });
                const { error } = await withTimeout(getSupabase().from('transactions').insert(newTrans), 'transactions.import');
                if (error) throw error;
            }
            if (backup.allCats) {
                const mergedCats = [...(backup.allCats.income || []), ...(backup.allCats.expense || [])].map(({ id, ...rest }) => ({ ...rest, user_id: currentUserId }));
                if (mergedCats.length) await withTimeout(getSupabase().from('categories').insert(mergedCats), 'categories.import');
            }
            alert("Muvaffaqiyatli! Dastur qayta yuklanmoqda..."); location.reload();
        } catch (err) {
            logApp('error', 'importData', err);
            showErrorBanner("Import paytida xatolik yuz berdi", err);
            alert("Import paytida xatolik yuz berdi!");
        }
    }; reader.readAsText(file); e.target.value = '';
}
function confirmResetData() {
    if (confirm("DIQQAT! Barcha ma'lumotlar BAZADAN o'chib ketadi. Davom etasizmi?")) {
        transactions = [];
        updateUI();
        closeModal('settings-modal');
        getSupabase()
            .from('transactions')
            .delete()
            .eq('user_id', currentUserId)
            .then(({ error }) => {
                if (error) {
                    logApp('error', 'transactions.reset', error, { currentUserId });
                    showErrorBanner("Ma'lumotlarni tozalashda xatolik", error);
                    return;
                }
                alert("Tozalandi!");
            });
    }
}
// --- MODALS ACTIONS (Tahrirlash va O'chirish qaytarildi) ---
function openActionSheet(e, id) {
    if (e) e.stopPropagation(); selId = id; const t = transactions.find(x => x.id === id);
    const c = document.getElementById('action-sheet-content'); c.innerHTML = '';
    const hasReceipt = t.receipt_url || t.receipt;
    if (hasReceipt) { c.innerHTML += `<button onclick="viewCurrentReceipt()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-emerald-400 font-medium"><i data-lucide="file-text" class="w-5 h-5"></i> Chekni ko'rish</button>`; }
    c.innerHTML += `<button onclick="handleEdit()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-blue-400 font-medium"><i data-lucide="edit-3" class="w-5 h-5"></i> Tahrirlash</button><button onclick="handleDeleteConfirm()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-rose-400 font-medium"><i data-lucide="trash-2" class="w-5 h-5"></i> O'chirish</button>`;
    document.getElementById('action-sheet').classList.remove('hidden'); lucide.createIcons();
}
function viewCurrentReceipt() { const t = transactions.find(x => x.id === selId); if (t) { const src = t.receipt_url || t.receipt; viewReceipt(src); } closeActionSheet(null); }
function closeActionSheet(e) { if (e && !e.target.closest('.bg-slate-800') && e.target.id !== 'action-sheet') return; document.getElementById('action-sheet').classList.add('hidden'); }
function handleDeleteConfirm() { closeActionSheet(null); document.getElementById('delete-modal').classList.remove('hidden'); }
async function confirmDelete() { const idToDelete = selId; transactions = transactions.filter(t => t.id !== idToDelete); updateUI(); closeModal('delete-modal'); const { error } = await withTimeout(getSupabase().from('transactions').delete().eq('id', idToDelete).eq('user_id', currentUserId), 'transactions.delete'); if (error) { logApp('error', 'transactions.delete', error, { idToDelete }); showErrorBanner("Operatsiyani o'chirishda xatolik", error); } }
function handleEdit() { closeActionSheet(null); const t = transactions.find(x => x.id === selId); if (!t) return; document.getElementById('edit-category').value = t.category; document.getElementById('edit-amount').value = t.amount; document.getElementById('edit-type').value = t.type; document.getElementById('edit-modal').classList.remove('hidden'); }
async function saveEdit() {
    const c = document.getElementById('edit-category').value, a = parseInt(document.getElementById('edit-amount').value), tp = document.getElementById('edit-type').value;
    if (c && a) {
        const i = transactions.findIndex(x => x.id === selId);
        if (i !== -1) { transactions[i].category = c; transactions[i].amount = a; transactions[i].type = tp; updateUI(); const { error } = await withTimeout(getSupabase().from('transactions').update({ category: c, amount: a, type: tp }).eq('id', selId).eq('user_id', currentUserId), 'transactions.update'); if (error) { logApp('error', 'transactions.update', error, { selId, c, a, tp }); showErrorBanner("Operatsiyani tahrirlashda xatolik", error); } }
    } closeModal('edit-modal');
}
// --- PDF ---
function openExportModal() {
    const now = new Date(); const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('export-start-date').valueAsDate = firstDay; document.getElementById('export-end-date').valueAsDate = now;
    updateExportPreview(); document.getElementById('export-modal').classList.remove('hidden');
    document.getElementById('export-start-date').onchange = updateExportPreview; document.getElementById('export-end-date').onchange = updateExportPreview;
}
function updateExportPreview() {
    const s = new Date(document.getElementById('export-start-date').value).getTime(); const e = new Date(document.getElementById('export-end-date').value).getTime() + 86400000;
    const data = transactions.filter(t => t.date >= s && t.date < e); const receipts = data.filter(t => t.receipt || t.receipt_url).length;
    document.getElementById('export-count').innerText = data.length + " ta operatsiya"; document.getElementById('export-receipts').innerText = receipts + " ta rasm";
}
async function generatePDF() {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        logApp('error', 'generatePDF', new Error('window.jspdf yoki jsPDF topilmadi'));
        alert("PDF kutubxonalari yuklanmagan!");
        return;
    }
    const sStr = document.getElementById('export-start-date').value; const eStr = document.getElementById('export-end-date').value;
    const s = new Date(sStr).getTime(); const e = new Date(eStr).getTime() + 86400000;
    const data = transactions.filter(t => t.date >= s && t.date < e).sort((a, b) => a.date - b.date);
    if (data.length === 0) { alert("Tanlangan davrda ma'lumot yo'q."); return; }
    const doc = new jsPDF(); const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pageWidth, 40, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text("Mening Kassam", 14, 18); doc.setFontSize(10); doc.setTextColor(200, 200, 200); doc.text("Moliyaviy hisobot", 14, 26); doc.text(`${sStr} dan ${eStr} gacha`, pageWidth - 14, 26, { align: 'right' });
    const inc = data.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0); const exp = data.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0); const bal = inc - exp;
    let yPos = 50; doc.setTextColor(0); doc.setFontSize(10); doc.text("Jami Kirim:", 14, yPos); doc.setTextColor(16, 185, 129); doc.setFont("helvetica", "bold"); doc.text(`+${formatNumber(inc)} so'm`, 40, yPos); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Jami Chiqim:", 80, yPos); doc.setTextColor(239, 68, 68); doc.setFont("helvetica", "bold"); doc.text(`-${formatNumber(exp)} so'm`, 110, yPos); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Sof Qoldiq:", 150, yPos); doc.setTextColor(59, 130, 246); doc.setFont("helvetica", "bold"); doc.text(`${formatNumber(bal)} so'm`, 175, yPos);
    const tableData = data.map(t => [new Date(t.date).toLocaleDateString(), t.category, t.type === 'income' ? 'Kirim' : 'Chiqim', (t.type === 'income' ? '+' : '-') + formatNumber(t.amount),]);
    doc.autoTable({ startY: yPos + 10, head: [['Sana', 'Kategoriya', 'Tur', 'Summa']], body: tableData, theme: 'striped', headStyles: { fillColor: [30, 41, 59] }, styles: { fontSize: 9 }, columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }, didParseCell: function (data) { if (data.section === 'body' && data.column.index === 3) { const raw = tableData[data.row.index][3]; data.cell.styles.textColor = raw.startsWith('+') ? [16, 185, 129] : [239, 68, 68]; } } });
    const receipts = data.filter(t => t.receipt || t.receipt_url);
    if (receipts.length > 0) {
        doc.addPage(); let rY = 20; doc.setFontSize(16); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text("Biriktirilgan Cheklar", 14, rY); rY += 15; doc.setDrawColor(200); doc.line(14, rY - 5, pageWidth - 14, rY - 5);
        receipts.forEach(t => {
            if (rY > 250) { doc.addPage(); rY = 20; }
            doc.setFontSize(10); doc.setTextColor(50); doc.text(`${new Date(t.date).toLocaleDateString()} - ${t.category}: ${formatNumber(t.amount)}`, 14, rY);
            if (t.receipt) { try { doc.addImage(t.receipt, 'JPEG', 14, rY + 5, 40, 50, undefined, 'FAST'); rY += 60; } catch (e) { } } else if (t.receipt_url) { doc.setTextColor(59, 130, 246); doc.textWithLink("Chekni ko'rish (Browser)", 14, rY + 10, { url: t.receipt_url }); rY += 20; }
        });
    }
    doc.save(`Hisobot_${sStr}_${eStr}.pdf`); closeModal('export-modal');
}

async function saveExchangeRate(val) {
    if(val && val > 0) {
        exchangeRate = val;
        // 1. Lokal saqlash (tezkor ishlash uchun)
        localStorage.setItem('exchangeRate', val);
        vibrate('light');

        // 2. Backendga (Supabase) saqlash
        const { error } = await withTimeout(getSupabase()
            .from('users')
            .update({ exchange_rate: val })
            .eq('user_id', currentUserId), 'users.exchange_rate.update');

        if (!error && currentUserProfile) currentUserProfile.exchange_rate = Number(val);
        if (error) {
            logApp('error', 'users.exchange_rate.update', error, { val, currentUserId });
            showErrorBanner("Kursni saqlashda xatolik", error);
        }
    }
}