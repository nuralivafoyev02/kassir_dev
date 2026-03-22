
'use strict';

(() => {
  let debtList = [];
  let planList = [];
  let debtTableAvailable = null;
  let planTableAvailable = null;
  let categoryKeywordsSupported = null;
  let featureBooted = false;
  let debtRealtimeBound = false;
  let planRealtimeBound = false;

  const debtStoreKey = () => `kassa_debts_${UID}`;
  const planStoreKey = () => `kassa_plans_${UID}`;

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };

  const fmtMoney = (amount) => `${fmt(amount)} ${tt('suffix_uzs', "so'm")}`;
  const fmtDateTimeShort = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString(localeTag(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(value);
    }
  };
  const fmtForInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = v => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const monthKey = (value = Date.now()) => {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const normalizeWords = (value) => {
    if (Array.isArray(value)) {
      return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
    }
    return [...new Set(String(value || '')
      .split(/[\n,;]+/g)
      .map(v => v.trim())
      .filter(Boolean))];
  };
  const getKeywordsText = (cat) => normalizeWords(cat?.keywords).join(', ');
  const getUsageCount = (name) => txList.filter(tx => baseCategoryName(tx.category) === name).length;
  const baseCategoryName = (name) => String(name || '').replace(/\s*\(\$.*\)\s*$/u, '').trim();
  const relationMissing = (error, table) => {
    const msg = String(error?.message || error?.details || '').toLowerCase();
    return msg.includes(`table '${table}'`) || msg.includes(`relation "public.${table}"`) || (msg.includes(table.toLowerCase()) && msg.includes('schema cache')) || msg.includes('does not exist');
  };

  function syncSettingsCategoryEntry() {
    document.querySelectorAll('.stg-item').forEach((el) => {
      if (String(el.getAttribute('onclick') || '').includes("stg-sub-cats")) {
        el.classList.remove('stg-disabled');
        el.classList.add('settings-feature-live');
      }
    });
  }

  function ensureEditIconGrid(selected = 'star') {
    const grid = $('edit-icon-grid');
    if (!grid) return;
    grid.innerHTML = '';
    ICON_NAMES.forEach(name => {
      const d = document.createElement('div');
      d.className = 'io';
      d.dataset.icon = name;
      d.innerHTML = svgIcon(name);
      if (name === selected) d.classList.add('on');
      d.onclick = () => {
        grid.querySelectorAll('.io').forEach(x => x.classList.remove('on'));
        d.classList.add('on');
        window.__EDIT_CAT_ICON__ = name;
      };
      grid.appendChild(d);
    });
    window.__EDIT_CAT_ICON__ = selected || 'star';
  }

  async function insertCategoryEnhanced(payload) {
    if (!db) return { data: [{ ...payload, id: Date.now() }], error: null };
    const enriched = { ...payload, keywords: normalizeWords(payload.keywords) };
    if (categoryKeywordsSupported !== false) {
      const res = await db.from('categories').insert([enriched]).select();
      if (!res.error) {
        categoryKeywordsSupported = true;
        return res;
      }
      if (!isMissingColumnError(res.error, 'keywords')) return res;
      categoryKeywordsSupported = false;
    }
    const fallback = { ...payload };
    delete fallback.keywords;
    return db.from('categories').insert([fallback]).select();
  }

  async function updateCategoryEnhanced(cat, payload) {
    if (!db || !cat?.id) return { error: null };
    const enriched = { ...payload, keywords: normalizeWords(payload.keywords) };
    if (categoryKeywordsSupported !== false) {
      const res = await db.from('categories').update(enriched).eq('id', cat.id).eq('user_id', UID);
      if (!res.error) {
        categoryKeywordsSupported = true;
        return res;
      }
      if (!isMissingColumnError(res.error, 'keywords')) return res;
      categoryKeywordsSupported = false;
    }
    const fallback = { ...payload };
    delete fallback.keywords;
    return db.from('categories').update(fallback).eq('id', cat.id).eq('user_id', UID);
  }

  function renderStgCatsEnhanced() {
    const list = $('stg-cat-list');
    if (!list) return;
    const items = (cats[stgCatType] || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (!items.length) {
      list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">${tt('no_data', "Ma'lumot yo'q")}</div>`;
      return;
    }
    list.innerHTML = items.map((cat, idx) => `
      <div class="stg-cat-card">
        <div class="stg-cat-row">
          <div class="stg-cat-main">
            <div class="stg-cat-icon">${svgIcon(cat.icon || 'star')}</div>
            <div class="stg-cat-meta">
              <div class="stg-cat-name">${escapeHtml(cat.name)}</div>
              <div class="stg-cat-keywords">${escapeHtml(getKeywordsText(cat) || (currentLang === 'ru' ? 'Ключевые слова не заданы' : currentLang === 'en' ? 'No keywords yet' : "Kalit so'zlar kiritilmagan"))}</div>
              <div class="stg-cat-usage">${getUsageCount(cat.name)} ta tranzaksiya</div>
            </div>
          </div>
          <div class="stg-cat-actions">
            <button class="stg-icon-btn" onclick="editStgCat(${idx})">✏️</button>
            <button class="stg-icon-btn danger" onclick="delStgCat(${idx})">🗑</button>
          </div>
        </div>
      </div>`).join('');
  }

  window.editStgCat = function editStgCat(idx) {
    selCatType = stgCatType;
    selCatIdx = idx;
    const cat = cats[selCatType]?.[selCatIdx];
    if (!cat) return;
    $('ec-name').value = cat.name || '';
    if ($('ec-keywords')) $('ec-keywords').value = getKeywordsText(cat);
    ensureEditIconGrid(cat.icon || 'star');
    showOv('ov-editcat');
  };

  window.renderStgCats = renderStgCatsEnhanced;

  window.saveNewCat = async function saveNewCatEnhanced() {
    const name = $('nc-name')?.value.trim();
    const keywords = normalizeWords($('nc-keywords')?.value || '');
    if (!name) return showErr(tt('err_cat_name_required', 'Kategoriya nomini kiriting'));
    if (!draft.type) return showErr(tt('err_cat_type_missing', 'Tur tanlanmagan'));

    const payload = { user_id: UID, name, icon: selIcon, type: draft.type, keywords };
    const existing = (cats[draft.type] || []).find(c => String(c.name || '').toLowerCase() === name.toLowerCase());
    if (existing) return showErr(currentLang === 'ru' ? "Bu nomdagi kategoriya bor" : currentLang === 'en' ? 'Category already exists' : "Bu nomdagi kategoriya mavjud");

    const { data, error } = await insertCategoryEnhanced(payload);
    if (error) return showErr(tt('err_cat_save', "Saqlab bo'lmadi") + (error.message ? `: ${error.message}` : ''));

    const row = Array.isArray(data) ? data[0] : data;
    cats[draft.type].push(row || { ...payload, id: Date.now() });
    cats[draft.type].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    buildCatGrid(draft.type);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    closeOv('ov-addcat');
    vib('light');
    showErr(currentLang === 'ru' ? 'Категория сохранена ✅' : currentLang === 'en' ? 'Category saved ✅' : 'Kategoriya saqlandi ✅', 2200);
  };

  window.ctxEdit = function ctxEditEnhanced() {
    const cat = cats[selCatType]?.[selCatIdx];
    if (!cat) return;
    $('ec-name').value = cat.name || '';
    if ($('ec-keywords')) $('ec-keywords').value = getKeywordsText(cat);
    ensureEditIconGrid(cat.icon || 'star');
    showOv('ov-editcat');
  };

  window.saveEditCat = async function saveEditCatEnhanced() {
    const n = $('ec-name')?.value.trim();
    const cat = cats[selCatType]?.[selCatIdx];
    if (!n || !cat) return;
    const keywords = normalizeWords($('ec-keywords')?.value || '');
    const icon = window.__EDIT_CAT_ICON__ || cat.icon || 'star';
    const next = { ...cat, name: n, keywords, icon };
    cats[selCatType][selCatIdx] = next;
    buildCatGrid(selCatType);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    closeOv('ov-editcat');
    if (db && cat.id) {
      const { error } = await updateCategoryEnhanced(cat, { name: n, keywords, icon });
      if (error) showErr(tt('err_update_failed', 'Yangilashda xatolik'));
    }
  };

  window.delStgCat = async function delStgCatEnhanced(idx) {
    const cat = cats[stgCatType]?.[idx];
    if (!cat) return;
    if (!confirm(currentLang === 'ru' ? `Удалить категорию "${cat.name}"?` : currentLang === 'en' ? `Delete category "${cat.name}"?` : `"${cat.name}" kategoriyasini o'chirasizmi?`)) return;
    cats[stgCatType].splice(idx, 1);
    buildCatGrid(stgCatType);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
  };

  window.ctxDel = async function ctxDelEnhanced() {
    const cat = cats[selCatType]?.[selCatIdx];
    if (!cat) return;
    if (!confirm(tt('confirm_delete_category', "Bu kategoriyani o'chirasizmi?"))) return;
    cats[selCatType].splice(selCatIdx, 1);
    buildCatGrid(selCatType);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
  };

  function normalizeDebt(row) {
    return {
      id: row.id || Date.now(),
      user_id: row.user_id || UID,
      person_name: String(row.person_name || '').trim(),
      amount: Number(row.amount) || 0,
      direction: row.direction === 'payable' ? 'payable' : 'receivable',
      due_at: row.due_at || null,
      remind_at: row.remind_at || row.due_at || null,
      note: String(row.note || '').trim(),
      status: row.status === 'paid' ? 'paid' : 'open',
      paid_at: row.paid_at || null,
      created_at: row.created_at || isoNow(),
      updated_at: row.updated_at || isoNow(),
    };
  }

  function normalizePlan(row) {
    return {
      id: row.id || Date.now(),
      user_id: row.user_id || UID,
      category_id: row.category_id || null,
      category_name: String(row.category_name || '').trim(),
      amount: Number(row.amount) || 0,
      alert_before: Number(row.alert_before) || 0,
      notify_bot: row.notify_bot !== false,
      notify_app: row.notify_app !== false,
      is_active: row.is_active !== false,
      month_key: row.month_key || monthKey(),
      created_at: row.created_at || isoNow(),
      updated_at: row.updated_at || isoNow(),
    };
  }

  async function loadDebtsData() {
    if (!db || !UID) {
      debtList = (readJson(debtStoreKey(), []) || []).map(normalizeDebt);
      return;
    }
    const { data, error } = await db.from('debts').select('*').eq('user_id', UID).order('due_at', { ascending: true });
    if (error) {
      if (relationMissing(error, 'debts')) {
        debtTableAvailable = false;
        debtList = (readJson(debtStoreKey(), []) || []).map(normalizeDebt);
        return;
      }
      throw error;
    }
    debtTableAvailable = true;
    debtList = (data || []).map(normalizeDebt);
  }

  async function loadPlanData() {
    if (!db || !UID) {
      planList = (readJson(planStoreKey(), []) || []).map(normalizePlan);
      return;
    }
    const { data, error } = await db.from('category_limits').select('*').eq('user_id', UID).order('created_at', { ascending: false });
    if (error) {
      if (relationMissing(error, 'category_limits')) {
        planTableAvailable = false;
        planList = (readJson(planStoreKey(), []) || []).map(normalizePlan);
        return;
      }
      throw error;
    }
    planTableAvailable = true;
    planList = (data || []).map(normalizePlan);
  }

  function persistLocalDebts() { writeJson(debtStoreKey(), debtList); }
  function persistLocalPlans() { writeJson(planStoreKey(), planList); }

  function debtDirectionLabel(direction) {
    return direction === 'payable'
      ? (currentLang === 'ru' ? 'Вы должны' : currentLang === 'en' ? 'You owe' : 'Siz berasiz')
      : (currentLang === 'ru' ? 'Должны вам' : currentLang === 'en' ? 'They owe you' : 'Sizga berishadi');
  }

  function debtStatusLabel(status) {
    return status === 'paid'
      ? (currentLang === 'ru' ? 'Yopilgan' : currentLang === 'en' ? 'Closed' : 'Yopilgan')
      : (currentLang === 'ru' ? 'Kutilmoqda' : currentLang === 'en' ? 'Open' : 'Kutilmoqda');
  }

  function renderDebts() {
    const listEl = $('debt-list');
    const emptyEl = $('debt-empty');
    const recEl = $('debt-receivable-total');
    const payEl = $('debt-payable-total');
    if (!listEl || !recEl || !payEl) return;

    const open = debtList.filter(item => item.status === 'open');
    const receivable = open.filter(item => item.direction === 'receivable').reduce((sum, item) => sum + item.amount, 0);
    const payable = open.filter(item => item.direction === 'payable').reduce((sum, item) => sum + item.amount, 0);
    recEl.textContent = fmtMoney(receivable);
    payEl.textContent = fmtMoney(payable);

    const items = debtList.slice().sort((a, b) => new Date(a.due_at || a.created_at) - new Date(b.due_at || b.created_at));
    emptyEl.style.display = items.length ? 'none' : 'grid';
    listEl.innerHTML = items.map(item => {
      const overdue = item.status === 'open' && item.due_at && new Date(item.due_at).getTime() < Date.now();
      return `
        <div class="route-item">
          <div class="route-item-top">
            <div>
              <div class="route-item-title">${escapeHtml(item.person_name || '—')}</div>
              <div class="route-item-sub">${escapeHtml(item.note || debtDirectionLabel(item.direction))}</div>
            </div>
            <div class="route-item-amount">${fmtMoney(item.amount)}</div>
          </div>
          <div class="route-badges">
            <span class="route-badge ${item.direction === 'receivable' ? 'good' : 'warn'}">${debtDirectionLabel(item.direction)}</span>
            <span class="route-badge ${overdue ? 'danger' : (item.status === 'paid' ? 'good' : 'warn')}">${escapeHtml(debtStatusLabel(item.status))}</span>
            <span class="route-badge">${escapeHtml(fmtDateTimeShort(item.due_at || item.created_at))}</span>
          </div>
          <div class="route-actions">
            ${item.status === 'open' ? `<button class="route-action primary" onclick="markDebtPaid(${item.id})">✅ ${currentLang === 'ru' ? 'Qaytdi' : currentLang === 'en' ? 'Paid back' : 'Qaytdi'}</button>` : ''}
            <button class="route-action" onclick="openDebtForm(${item.id})">✏️ ${currentLang === 'ru' ? 'Изменить' : currentLang === 'en' ? 'Edit' : 'Tahrirlash'}</button>
            <button class="route-action danger" onclick="deleteDebt(${item.id})">🗑 ${currentLang === 'ru' ? 'Удалить' : currentLang === 'en' ? 'Delete' : "O'chirish"}</button>
          </div>
        </div>`;
    }).join('');
  }

  window.openDebtForm = function openDebtForm(id = null) {
    const debt = debtList.find(item => Number(item.id) === Number(id));
    $('debt-id').value = debt?.id || '';
    $('debt-direction').value = debt?.direction || 'receivable';
    $('debt-person').value = debt?.person_name || '';
    $('debt-amount').value = debt?.amount ? fmt(debt.amount) : '';
    $('debt-due-at').value = fmtForInput(debt?.due_at || '');
    $('debt-note').value = debt?.note || '';
    showOv('ov-debt-form');
    setTimeout(() => $('debt-person')?.focus(), 40);
  };

  window.saveDebtForm = async function saveDebtForm() {
    const id = $('debt-id').value ? Number($('debt-id').value) : null;
    const person_name = String($('debt-person').value || '').trim();
    const amount = Math.round(getCleanAmount($('debt-amount').value || ''));
    const direction = $('debt-direction').value === 'payable' ? 'payable' : 'receivable';
    const due_at = $('debt-due-at').value ? new Date($('debt-due-at').value).toISOString() : null;
    const note = String($('debt-note').value || '').trim();
    if (!person_name) return showErr(currentLang === 'ru' ? 'Kim bilan ekanini kiriting' : currentLang === 'en' ? 'Enter the person name' : 'Kim bilan ekanini kiriting');
    if (!amount) return showErr(tt('err_amount_required', 'Summani kiriting'));

    const payload = normalizeDebt({ id: id || Date.now(), user_id: UID, person_name, amount, direction, due_at, remind_at: due_at, note, status: 'open' });
    if (!db || debtTableAvailable === false) {
      const idx = debtList.findIndex(item => Number(item.id) === Number(payload.id));
      if (idx >= 0) debtList[idx] = payload; else debtList.unshift(payload);
      persistLocalDebts();
      closeOv('ov-debt-form');
      renderDebts();
      return;
    }

    if (id) {
      const { data, error } = await db.from('debts').update({ person_name, amount, direction, due_at, remind_at: due_at, note }).eq('id', id).eq('user_id', UID).select().maybeSingle();
      if (error) {
        if (relationMissing(error, 'debts')) { debtTableAvailable = false; return window.saveDebtForm(); }
        return showErr(error.message || 'Debt update failed');
      }
      const row = normalizeDebt(data || payload);
      const idx = debtList.findIndex(item => Number(item.id) === Number(id));
      if (idx >= 0) debtList[idx] = row;
    } else {
      const { data, error } = await db.from('debts').insert([{ user_id: UID, person_name, amount, direction, due_at, remind_at: due_at, note }]).select().maybeSingle();
      if (error) {
        if (relationMissing(error, 'debts')) { debtTableAvailable = false; return window.saveDebtForm(); }
        return showErr(error.message || 'Debt save failed');
      }
      debtList.unshift(normalizeDebt(data || payload));
    }
    closeOv('ov-debt-form');
    renderDebts();
    vib('light');
  };

  window.markDebtPaid = async function markDebtPaid(id) {
    const debt = debtList.find(item => Number(item.id) === Number(id));
    if (!debt) return;
    debt.status = 'paid';
    debt.paid_at = isoNow();
    if (!db || debtTableAvailable === false) { persistLocalDebts(); renderDebts(); return; }
    const { error } = await db.from('debts').update({ status: 'paid', paid_at: isoNow() }).eq('id', id).eq('user_id', UID);
    if (error) return showErr(error.message || 'Debt close failed');
    renderDebts();
  };

  window.deleteDebt = async function deleteDebt(id) {
    const debt = debtList.find(item => Number(item.id) === Number(id));
    if (!debt) return;
    if (!confirm(currentLang === 'ru' ? 'Удалить этот долг?' : currentLang === 'en' ? 'Delete this debt?' : "Bu qarzni o'chirasizmi?")) return;
    debtList = debtList.filter(item => Number(item.id) !== Number(id));
    if (!db || debtTableAvailable === false) { persistLocalDebts(); renderDebts(); return; }
    const { error } = await db.from('debts').delete().eq('id', id).eq('user_id', UID);
    if (error) return showErr(error.message || 'Debt delete failed');
    renderDebts();
  };

  function populatePlanCategoryOptions() {
    const sel = $('plan-category');
    if (!sel) return;
    const current = sel.value;
    const items = (cats.expense || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    sel.innerHTML = items.length
      ? items.map(cat => `<option value="${cat.id || ''}" data-name="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('')
      : `<option value="">${currentLang === 'ru' ? 'Категории пока нет' : currentLang === 'en' ? 'No expense categories yet' : 'Chiqim kategoriyasi topilmadi'}</option>`;
    if (items.some(cat => String(cat.id || '') === String(current))) sel.value = current;
  }

  function getPlanStats(plan) {
    const targetMonth = plan.month_key || monthKey();
    const spent = txList
      .filter(tx => tx.type === 'expense')
      .filter(tx => monthKey(tx.ms) === targetMonth)
      .filter(tx => baseCategoryName(tx.category) === plan.category_name)
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const remaining = Math.max(0, Number(plan.amount || 0) - spent);
    const percent = plan.amount > 0 ? Math.min(100, Math.round((spent / plan.amount) * 100)) : 0;
    return { spent, remaining, percent, exceeded: spent > plan.amount, near: !spent ? false : remaining <= Number(plan.alert_before || 0) };
  }

  function renderPlans() {
    const listEl = $('plan-list');
    const emptyEl = $('plan-empty');
    if (!listEl) return;
    const items = planList.filter(item => item.is_active !== false).slice().sort((a, b) => String(a.category_name || '').localeCompare(String(b.category_name || '')));
    emptyEl.style.display = items.length ? 'none' : 'grid';
    listEl.innerHTML = items.map(plan => {
      const stats = getPlanStats(plan);
      const statusText = stats.exceeded
        ? (currentLang === 'ru' ? 'Limitdan oshgan' : currentLang === 'en' ? 'Limit exceeded' : 'Limitdan oshgan')
        : stats.near
          ? (currentLang === 'ru' ? 'Ogohlantirish chegarasi' : currentLang === 'en' ? 'Alert threshold' : 'Ogohlantirish chegarasi')
          : (currentLang === 'ru' ? 'Nazorat ostida' : currentLang === 'en' ? 'On track' : 'Nazorat ostida');
      return `
        <div class="route-item">
          <div class="route-item-top">
            <div>
              <div class="route-item-title">${escapeHtml(plan.category_name || '—')}</div>
              <div class="route-item-sub">${escapeHtml(plan.month_key || monthKey())}</div>
            </div>
            <div class="route-item-amount">${fmtMoney(plan.amount)}</div>
          </div>
          <div class="plan-progress"><span style="width:${Math.min(100, getPlanStats(plan).percent)}%"></span></div>
          <div class="plan-stats">
            <div class="plan-stat"><span class="plan-stat-label">Sarflandi</span><span class="plan-stat-value">${fmtMoney(stats.spent)}</span></div>
            <div class="plan-stat"><span class="plan-stat-label">Qoldi</span><span class="plan-stat-value">${fmtMoney(stats.remaining)}</span></div>
            <div class="plan-stat"><span class="plan-stat-label">Holat</span><span class="plan-stat-value">${escapeHtml(statusText)}</span></div>
          </div>
          <div class="route-badges">
            <span class="route-badge ${stats.exceeded ? 'danger' : (stats.near ? 'warn' : 'good')}">${escapeHtml(statusText)}</span>
            <span class="route-badge">Alert: ${fmtMoney(plan.alert_before)}</span>
            ${plan.notify_bot ? `<span class="route-badge">Bot</span>` : ''}
          </div>
          <div class="route-actions">
            <button class="route-action" onclick="openPlanForm(${plan.id})">✏️ ${currentLang === 'ru' ? 'Изменить' : currentLang === 'en' ? 'Edit' : 'Tahrirlash'}</button>
            <button class="route-action danger" onclick="deletePlan(${plan.id})">🗑 ${currentLang === 'ru' ? 'Удалить' : currentLang === 'en' ? 'Delete' : "O'chirish"}</button>
          </div>
        </div>`;
    }).join('');
  }

  window.openPlanForm = function openPlanForm(id = null) {
    populatePlanCategoryOptions();
    const plan = planList.find(item => Number(item.id) === Number(id));
    $('plan-id').value = plan?.id || '';
    const sel = $('plan-category');
    if (sel) {
      const match = (cats.expense || []).find(cat => (plan && (String(cat.id || '') === String(plan.category_id || '') || cat.name === plan.category_name)));
      sel.value = match ? String(match.id || '') : (sel.options[0]?.value || '');
    }
    $('plan-amount').value = plan?.amount ? fmt(plan.amount) : '';
    $('plan-alert-before').value = plan?.alert_before ? fmt(plan.alert_before) : '';
    $('plan-notify-bot').checked = plan?.notify_bot !== false;
    $('plan-notify-app').checked = plan?.notify_app !== false;
    showOv('ov-plan-form');
  };

  window.savePlanForm = async function savePlanForm() {
    const id = $('plan-id').value ? Number($('plan-id').value) : null;
    const categoryId = $('plan-category').value || null;
    const cat = (cats.expense || []).find(item => String(item.id || '') === String(categoryId));
    const category_name = cat?.name || '';
    const amount = Math.round(getCleanAmount($('plan-amount').value || ''));
    const alert_before = Math.round(getCleanAmount($('plan-alert-before').value || ''));
    const notify_bot = !!$('plan-notify-bot').checked;
    const notify_app = !!$('plan-notify-app').checked;
    const mk = monthKey();
    if (!category_name) return showErr(currentLang === 'ru' ? 'Kategoriyani tanlang' : currentLang === 'en' ? 'Choose a category' : 'Kategoriyani tanlang');
    if (!amount) return showErr(tt('err_amount_required', 'Summani kiriting'));

    const payload = normalizePlan({ id: id || Date.now(), user_id: UID, category_id: categoryId, category_name, amount, alert_before, notify_bot, notify_app, month_key: mk, is_active: true });
    if (!db || planTableAvailable === false) {
      const idx = planList.findIndex(item => Number(item.id) === Number(payload.id));
      if (idx >= 0) planList[idx] = payload; else planList.unshift(payload);
      persistLocalPlans();
      renderPlans();
      closeOv('ov-plan-form');
      return;
    }

    if (id) {
      const { data, error } = await db.from('category_limits').update({ category_id: categoryId, category_name, amount, alert_before, notify_bot, notify_app, month_key: mk, is_active: true }).eq('id', id).eq('user_id', UID).select().maybeSingle();
      if (error) {
        if (relationMissing(error, 'category_limits')) { planTableAvailable = false; return window.savePlanForm(); }
        return showErr(error.message || 'Plan update failed');
      }
      const idx = planList.findIndex(item => Number(item.id) === Number(id));
      if (idx >= 0) planList[idx] = normalizePlan(data || payload);
    } else {
      const { data, error } = await db.from('category_limits').insert([{ user_id: UID, category_id: categoryId, category_name, amount, alert_before, notify_bot, notify_app, month_key: mk, is_active: true }]).select().maybeSingle();
      if (error) {
        if (relationMissing(error, 'category_limits')) { planTableAvailable = false; return window.savePlanForm(); }
        return showErr(error.message || 'Plan save failed');
      }
      planList.unshift(normalizePlan(data || payload));
    }
    renderPlans();
    closeOv('ov-plan-form');
    vib('light');
  };

  window.deletePlan = async function deletePlan(id) {
    if (!confirm(currentLang === 'ru' ? 'Удалить эту цель?' : currentLang === 'en' ? 'Delete this plan?' : "Bu rejani o'chirasizmi?")) return;
    planList = planList.filter(item => Number(item.id) !== Number(id));
    if (!db || planTableAvailable === false) { persistLocalPlans(); renderPlans(); return; }
    const { error } = await db.from('category_limits').delete().eq('id', id).eq('user_id', UID);
    if (error) return showErr(error.message || 'Plan delete failed');
    renderPlans();
  };

  function snapshotPlanSpend() {
    return Object.fromEntries(planList.map(plan => [plan.id, getPlanStats(plan)]));
  }

  function notifyPlanThresholdCrossing(before) {
    planList.forEach(plan => {
      if (!plan.notify_app) return;
      const prev = before?.[plan.id];
      const next = getPlanStats(plan);
      if (!prev) return;
      const crossedAlert = prev.remaining > Number(plan.alert_before || 0) && next.remaining <= Number(plan.alert_before || 0);
      const crossedLimit = !prev.exceeded && next.exceeded;
      if (crossedLimit) {
        showErr(`${plan.category_name}: limit tugadi ⚠️`, 3200);
      } else if (crossedAlert && Number(plan.alert_before || 0) > 0) {
        showErr(`${plan.category_name}: ${fmtMoney(next.remaining)} qoldi`, 3200);
      }
    });
  }

  function bindFeatureRealtime() {
    if (!db || !UID) return;
    if (!debtRealtimeBound && debtTableAvailable !== false) {
      debtRealtimeBound = true;
      db.channel('debt-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `user_id=eq.${UID}` }, payload => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === 'INSERT') debtList.unshift(normalizeDebt(newRow));
          if (eventType === 'UPDATE') {
            const idx = debtList.findIndex(item => Number(item.id) === Number(newRow.id));
            if (idx >= 0) debtList[idx] = normalizeDebt(newRow);
          }
          if (eventType === 'DELETE') debtList = debtList.filter(item => Number(item.id) !== Number(oldRow.id));
          renderDebts();
        }).subscribe();
    }
    if (!planRealtimeBound && planTableAvailable !== false) {
      planRealtimeBound = true;
      db.channel('plan-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'category_limits', filter: `user_id=eq.${UID}` }, payload => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === 'INSERT') planList.unshift(normalizePlan(newRow));
          if (eventType === 'UPDATE') {
            const idx = planList.findIndex(item => Number(item.id) === Number(newRow.id));
            if (idx >= 0) planList[idx] = normalizePlan(newRow);
          }
          if (eventType === 'DELETE') planList = planList.filter(item => Number(item.id) !== Number(oldRow.id));
          renderPlans();
        }).subscribe();
    }
  }

  async function bootstrapFeatures() {
    if (featureBooted) return;
    featureBooted = true;

    syncSettingsCategoryEntry();

    const originalRenderAll = renderAll;
    renderAll = function renderAllEnhanced(...args) {
      const out = originalRenderAll.apply(this, args);
      renderPlans();
      renderStgCatsEnhanced();
      return out;
    };

    const originalGoTab = goTab;
    goTab = function goTabEnhanced(tab, opts = {}) {
      const out = originalGoTab.call(this, tab, opts);
      if (tab === 'debt') renderDebts();
      if (tab === 'plan') renderPlans();
      return out;
    };

    const originalOpenStgSub = openStgSub;
    openStgSub = function openStgSubEnhanced(id) {
      originalOpenStgSub(id);
      if (id === 'stg-sub-cats') renderStgCatsEnhanced();
    };

    const originalApplyLang = applyLang;
    applyLang = function applyLangEnhanced() {
      originalApplyLang();
      syncSettingsCategoryEntry();
      renderDebts();
      renderPlans();
      renderStgCatsEnhanced();
      populatePlanCategoryOptions();
    };

    const originalSubmitFlow = submitFlow;
    submitFlow = async function submitFlowEnhanced(...args) {
      const before = snapshotPlanSpend();
      const result = await originalSubmitFlow.apply(this, args);
      renderPlans();
      notifyPlanThresholdCrossing(before);
      return result;
    };

    try {
      await loadDebtsData();
      await loadPlanData();
    } catch (error) {
      console.warn('[features] data bootstrap failed', error);
    }
    populatePlanCategoryOptions();
    renderDebts();
    renderPlans();
    renderStgCatsEnhanced();
    bindFeatureRealtime();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(bootstrapFeatures, 0), { once: true });
  } else {
    setTimeout(bootstrapFeatures, 0);
  }
})();
