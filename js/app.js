/**
 * PureTech Wallet - Core Application Engine, UI Renderer, Charts & Event Controllers
 */

let appState = getDefaultCleanState();
let wealthChart = null;
let pillarsChart = null;
let trendsChart = null;
let isPrintMode = false;

// حساب سعر جرام الذهب حسب العيار بدقة عالية للعملات ذات القيمة العالية (أقل من 1000) وتقريب صحيح للعملات الأخرى
// ترتيب المعاملات تلقائياً حسب التاريخ من الأحدث للأقدم
function sortByDateDesc(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function getCalculatedGoldRate(karat = "24k") {
  const base24k = Number(appState?.rates?.gold || 0);
  const factor = karat === "21k" ? (21 / 24) : (karat === "18k" ? (18 / 24) : 1);
  const rawPrice = base24k * factor;
  const curr = appState?.settings?.currency || "USD";
  return (curr === "USD" || curr === "EUR" || base24k < 1000)
    ? Number(rawPrice.toFixed(2))
    : Math.round(rawPrice);
}

// Helper for trilingual runtime texts (Arabic, English, Spanish)
function tr(arText, enText, esText) {
  const lang = appState?.settings?.lang || "en";
  if (lang === "ar") return arText;
  if (lang === "es") return esText || enText;
  return enText;
}

// Toast Notification helper
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast-anim pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-bold shadow-2xl transition-all ${
    type === "success" 
      ? "bg-dark-900 border-brand-500/40 text-brand-300" 
      : type === "error" 
      ? "bg-dark-900 border-rose-500/40 text-rose-300" 
      : "bg-dark-900 border-indigo-500/40 text-indigo-300"
  }`;
  const icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-xmark" : "fa-circle-info";
  const iconEl = document.createElement("i");
  iconEl.className = `fa-solid ${icon} text-sm`;
  const spanEl = document.createElement("span");
  spanEl.textContent = String(message ?? "");
  toast.appendChild(iconEl);
  toast.appendChild(spanEl);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Utility: Debounce function for 60fps responsive UI
function debounce(func, wait = 180) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Currency Formatter - Strictly formats all numbers using Western/English numerals (1, 2, 3...)
function formatMoney(amount, forceRaw = false) {
  const curr = appState?.settings?.currency || "EGP";
  if (appState?.settings?.privacyMode && !forceRaw) {
    return `•••••• ${curr}`;
  }
  const num = Number(amount || 0);
  const val = Math.abs(num) < 0.005 ? 0 : num;
  const formatted = val.toLocaleString("en-US", { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
  return `${formatted} ${curr}`;
}

// Custom Confirmation Dialog
let activeConfirmCleanup = null;

function requestConfirmation(title, message) {
  return new Promise((resolve) => {
    if (typeof activeConfirmCleanup === "function") {
      activeConfirmCleanup(false);
    }

    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const btnOk = document.getElementById("btnConfirmOk");
    const btnCancel = document.getElementById("btnConfirmCancel");

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.classList.remove("hidden");

    const cleanup = (confirmed) => {
      activeConfirmCleanup = null;
      modal.classList.add("hidden");
      btnOk.onclick = null;
      btnCancel.onclick = null;
      resolve(confirmed);
    };

    activeConfirmCleanup = cleanup;
    btnOk.onclick = () => cleanup(true);
    btnCancel.onclick = () => cleanup(false);
  });
}

// Pagination & Cashflow Period State
const paginationState = {
  pageSize: 10,
  incomesPage: 1,
  obligationsPage: 1,
  creatorTxPage: 1,
  freelanceTxPage: 1,
  assetsPage: 1,
  selectedPeriod: "all"
};

window.changePaginationPage = function(target, page) {
  if (target === "incomes") paginationState.incomesPage = page;
  else if (target === "obligations") paginationState.obligationsPage = page;
  else if (target === "creatorTx") paginationState.creatorTxPage = page;
  else if (target === "freelanceTx") paginationState.freelanceTxPage = page;
  else if (target === "assets") paginationState.assetsPage = page;
  renderAll();
};

function renderPagination(containerId, target, currentPage, totalItems, pageSize = 10) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) {
    container.innerHTML = totalItems > 0 
      ? `<div class="w-full flex items-center justify-between text-[11px] text-slate-500 font-mono py-1">
           <span>${(i18n[appState.settings.lang] || i18n.en).items_count?.replace("{count}", totalItems) || `(${totalItems} items)`}</span>
         </div>`
      : "";
    return;
  }

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const lang = appState.settings.lang;
  const dict = i18n[lang] || i18n.en;
  const infoText = (dict.page_info || "Page {current} of {total}").replace("{current}", currentPage).replace("{total}", totalPages);
  const countText = (dict.items_count || "({count} items)").replace("{count}", totalItems);

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  let pageButtonsHtml = "";
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7) {
      if (p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
        if (p === 2 || p === totalPages - 1) {
          pageButtonsHtml += `<span class="px-1 text-slate-600 text-xs font-mono">...</span>`;
        }
        continue;
      }
    }
    const isActive = p === currentPage;
    pageButtonsHtml += `
      <button type="button" onclick="changePaginationPage('${target}', ${p})" class="px-2 py-0.5 rounded text-xs font-mono font-bold transition-all ${
        isActive 
          ? 'bg-brand-500 text-white shadow-sm' 
          : 'bg-dark-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
      }">${p}</button>
    `;
  }

  container.innerHTML = `
    <div class="flex items-center gap-2 font-mono text-[11px] text-slate-400">
      <span>${infoText}</span>
      <span class="text-slate-600">${countText}</span>
    </div>
    <div class="flex items-center gap-1">
      <button type="button" ${prevDisabled ? 'disabled' : ''} onclick="changePaginationPage('${target}', ${currentPage - 1})" 
        class="px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
          prevDisabled 
            ? 'bg-dark-950 text-slate-600 border border-slate-800/60 cursor-not-allowed opacity-40' 
            : 'bg-dark-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
        }">${dict.page_prev || 'Previous'}</button>
      
      <div class="flex items-center gap-1">${pageButtonsHtml}</div>

      <button type="button" ${nextDisabled ? 'disabled' : ''} onclick="changePaginationPage('${target}', ${currentPage + 1})" 
        class="px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
          nextDisabled 
            ? 'bg-dark-950 text-slate-600 border border-slate-800/60 cursor-not-allowed opacity-40' 
            : 'bg-dark-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
        }">${dict.page_next || 'Next'}</button>
    </div>
  `;
}

// Calculations & Data Aggregation
function calculateFinancials() {
  // All-time cumulative personal totals (preserves total wallet liquidity and portfolio net worth)
  const allTimePersonalIncome = appState.personalIncomes.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const allTimePersonalObligations = appState.personalObligations.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const allTimePersonalNet = allTimePersonalIncome - allTimePersonalObligations;

  // Selected period totals (for the Live Personal Monthly Cashflow Equation)
  const selectedPeriod = paginationState.selectedPeriod;
  const isPeriodFiltered = selectedPeriod && selectedPeriod !== "all";

  const periodIncomes = sortByDateDesc(isPeriodFiltered
    ? appState.personalIncomes.filter(inc => (inc.date || "").startsWith(selectedPeriod))
    : appState.personalIncomes);
  const periodObligations = sortByDateDesc(isPeriodFiltered
    ? appState.personalObligations.filter(exp => (exp.date || "").startsWith(selectedPeriod))
    : appState.personalObligations);

  const personalIncome = periodIncomes.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const personalObligations = periodObligations.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const personalNet = personalIncome - personalObligations;

  let allTimeCreatorRev = 0;
  let allTimeCreatorExp = 0;
  appState.creatorTransactions.forEach((tx) => {
    if (tx.flow === "revenue") allTimeCreatorRev += Number(tx.amount || 0);
    else allTimeCreatorExp += Number(tx.amount || 0);
  });
  const allTimeCreatorNet = allTimeCreatorRev - allTimeCreatorExp;

  const periodCreatorTx = isPeriodFiltered
    ? appState.creatorTransactions.filter(tx => (tx.date || "").startsWith(selectedPeriod))
    : appState.creatorTransactions;
  let creatorRev = 0;
  let creatorExp = 0;
  periodCreatorTx.forEach((tx) => {
    if (tx.flow === "revenue") creatorRev += Number(tx.amount || 0);
    else creatorExp += Number(tx.amount || 0);
  });
  const creatorNet = creatorRev - creatorExp;

  let allTimeFreelanceRev = 0;
  let allTimeFreelanceExp = 0;
  appState.freelanceTransactions.forEach((tx) => {
    if (tx.flow === "income") allTimeFreelanceRev += Number(tx.amount || 0);
    else allTimeFreelanceExp += Number(tx.amount || 0);
  });
  const allTimeFreelanceNet = allTimeFreelanceRev - allTimeFreelanceExp;

  const periodFreelanceTx = isPeriodFiltered
    ? appState.freelanceTransactions.filter(tx => (tx.date || "").startsWith(selectedPeriod))
    : appState.freelanceTransactions;
  let freelanceRev = 0;
  let freelanceExp = 0;
  periodFreelanceTx.forEach((tx) => {
    if (tx.flow === "income") freelanceRev += Number(tx.amount || 0);
    else freelanceExp += Number(tx.amount || 0);
  });
  const freelanceNet = freelanceRev - freelanceExp;

  const allTimeOnlineNet = allTimeCreatorNet + allTimeFreelanceNet;
  const onlineNet = creatorNet + freelanceNet;

  const liquidCash = appState.settings.includeOnline 
    ? allTimePersonalNet + allTimeOnlineNet 
    : allTimePersonalNet;
  const periodLiquidCash = appState.settings.includeOnline
    ? personalNet + onlineNet
    : personalNet;

  let totalAssetsValue = 0;
  let totalAssetsCost = 0;
  const assetValues = {
    usd: 0,
    eur: 0,
    gold: 0,
    stocks: 0,
    realestate: 0,
    other: 0
  };

  appState.assets.forEach((asset) => {
    let currentUnitPrice = Number(asset.unitPrice || 0);
    if (asset.category === "usd") currentUnitPrice = Number(appState.rates.usd);
    if (asset.category === "eur") currentUnitPrice = Number(appState.rates.eur);
    if (asset.category === "gold") {
      currentUnitPrice = getCalculatedGoldRate(asset.karat || "24k");
    }

    const qty = Number(asset.quantity || 0);
    const val = qty * currentUnitPrice;
    const purchasePrice = (asset.purchasePrice !== undefined && asset.purchasePrice !== null && asset.purchasePrice !== '') ? Number(asset.purchasePrice) : ((asset.unitPrice !== undefined && asset.unitPrice !== null && asset.unitPrice !== '') ? Number(asset.unitPrice) : currentUnitPrice);
    totalAssetsCost += (qty * purchasePrice);

    totalAssetsValue += val;
    if (assetValues[asset.category] !== undefined) {
      assetValues[asset.category] += val;
    } else {
      assetValues.other += val;
    }
  });

  const totalNetWorth = liquidCash + totalAssetsValue;

  // Financial Health Intelligence Indicators
  const savingsRate = personalIncome > 0 ? ((personalNet / personalIncome) * 100) : 0;
  
  // Calculate monthly burn rate for emergency runway (selected month or average monthly obligations)
  const distinctObligationMonths = new Set(
    appState.personalObligations
      .map(o => (o.date || "").slice(0, 7))
      .filter(Boolean)
  ).size;
  const avgMonthlyBurn = distinctObligationMonths > 0 
    ? (allTimePersonalObligations / distinctObligationMonths) 
    : personalObligations;
  const monthlyBurn = personalObligations > 0 ? personalObligations : avgMonthlyBurn;
  const rawRunway = monthlyBurn > 0 ? (liquidCash / monthlyBurn) : (liquidCash >= 0 ? 999 : -1);
  const runwayMonths = rawRunway < 0 ? -1 : rawRunway;

  return {
    personalIncome,
    personalObligations,
    personalNet,
    allTimePersonalIncome,
    allTimePersonalObligations,
    allTimePersonalNet,
    allTimeCreatorRev,
    allTimeCreatorExp,
    allTimeCreatorNet,
    allTimeFreelanceRev,
    allTimeFreelanceExp,
    allTimeFreelanceNet,
    allTimeOnlineNet,
    creatorRev,
    creatorExp,
    creatorNet,
    freelanceRev,
    freelanceExp,
    freelanceNet,
    onlineNet,
    liquidCash,
    periodLiquidCash,
    totalAssetsValue,
    totalAssetsCost,
    assetValues,
    totalNetWorth,
    savingsRate,
    runwayMonths
  };
}

// Online / Offline Network Status Detector
function updateOnlineStatusUI() {
  const dot = document.getElementById("networkStatusDot");
  const text = document.getElementById("networkStatusText");
  const lang = appState?.settings?.lang || "ar";
  const dict = i18n[lang] || i18n.en;

  if (navigator.onLine) {
    if (dot) dot.className = "w-1.5 h-1.5 rounded-full bg-emerald-400 status-pulse me-1.5";
    if (text) text.textContent = dict.status_online || "Online";
  } else {
    if (dot) dot.className = "w-1.5 h-1.5 rounded-full bg-amber-400 me-1.5";
    if (text) text.textContent = dict.status_offline || "100% Offline";
  }
}

// Backup Reminder Counter
let userOperationsCounter = 0;
function trackOperationAndRemind() {
  if (appState && appState.isDemoMode) {
    appState.isDemoMode = false;
  }
  userOperationsCounter++;
  if (userOperationsCounter >= 8) {
    const lang = appState?.settings?.lang || "ar";
    const dict = i18n[lang] || i18n.en;
    showToast(dict.backup_reminder_msg || "Remember to export a backup!", "info");
    userOperationsCounter = 0;
  }
}

function updatePrivacyUI() {
  const isPrivate = Boolean(appState?.settings?.privacyMode);
  const icon = document.getElementById("iconPrivacyToggle");
  const btn = document.getElementById("btnTogglePrivacy");
  const lang = appState?.settings?.lang || "ar";
  const dict = i18n[lang] || i18n.en;

  if (icon) {
    icon.className = isPrivate ? "fa-solid fa-eye-slash text-xs text-amber-400" : "fa-solid fa-eye text-xs text-slate-300";
  }
  if (btn) {
    btn.setAttribute("title", isPrivate ? (dict.btn_privacy_show || "Show balances") : (dict.btn_privacy_hide || "Hide balances"));
  }
}

// UI Rendering Engine
function updateLanguageUI() {
  const lang = appState.settings.lang;
  const dict = i18n[lang] || i18n.en;

  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) {
      el.setAttribute("placeholder", dict[key]);
    }
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    if (btn.getAttribute("data-lang") === lang) {
      btn.className = "lang-btn px-2.5 py-1 text-xs font-bold rounded-md transition-all bg-brand-500 text-white shadow-sm";
    } else {
      btn.className = "lang-btn px-2.5 py-1 text-xs font-bold rounded-md transition-all text-slate-300 hover:text-white";
    }
  });

  document.querySelectorAll(".curr-tag").forEach((el) => {
    el.textContent = appState.settings.currency;
  });
  const baseCurrLabel = document.getElementById("ratesBaseCurrency");
  if (baseCurrLabel) baseCurrLabel.textContent = appState.settings.currency;

  const baseOpt1 = document.getElementById("txCurrencyBaseOpt");
  if (baseOpt1) baseOpt1.textContent = `${appState.settings.currency} (${tr('الأساسية', 'Base', 'Base')})`;
  const baseOpt2 = document.getElementById("flCurrencyBaseOpt");
  if (baseOpt2) baseOpt2.textContent = `${appState.settings.currency} (${tr('الأساسية', 'Base', 'Base')})`;
  const baseOpt3 = document.getElementById("creatorCurrencyBaseOpt");
  if (baseOpt3) baseOpt3.textContent = `${appState.settings.currency} (${tr('الأساسية', 'Base', 'Base')})`;

  const pinInp = document.getElementById("inputSettingsPin");
  if (pinInp) {
    pinInp.placeholder = appState?.settings?.pinEnabled
      ? (dict.pin_protected_placeholder || tr("•••• (محمي)", "•••• (Protected)", "•••• (Protegido)"))
      : "••••";
  }

  updatePrivacyUI();
  updateOnlineStatusUI();
}

function renderAll() {
  const data = calculateFinancials();
  const lang = appState.settings.lang;

  const usdVal = Number(appState.rates.usd || 0);
  const eurVal = Number(appState.rates.eur || 0);
  const goldVal = Number(appState.rates.gold || 0);
  document.getElementById("tickerUsd").textContent = (usdVal > 0 && usdVal < 1) ? usdVal.toFixed(3) : usdVal.toFixed(2);
  document.getElementById("tickerEur").textContent = (eurVal > 0 && eurVal < 1) ? eurVal.toFixed(3) : eurVal.toFixed(2);
  document.getElementById("tickerGold").textContent = goldVal.toLocaleString("en-US", { minimumFractionDigits: (goldVal > 0 && goldVal < 1000) ? 2 : 0, maximumFractionDigits: 2 });
  document.getElementById("currencySelect").value = appState.settings.currency;

  document.getElementById("rateInputUsd").value = appState.rates.usd;
  document.getElementById("rateInputEur").value = appState.rates.eur;
  document.getElementById("rateInputGold").value = appState.rates.gold;

  const autoSyncToggle = document.getElementById("autoSyncRatesToggle");
  if (autoSyncToggle) autoSyncToggle.checked = appState.settings.autoSyncRates !== false;

  const syncStatusEl = document.getElementById("lastSyncStatusText");
  if (syncStatusEl) {
    if (appState.rates.lastSyncTime) {
      syncStatusEl.textContent = appState.rates.lastSyncTime;
    } else {
      syncStatusEl.textContent = (i18n[lang] || i18n.en).sync_status_never;
    }
  }

  document.getElementById("kpiNetWorth").textContent = formatMoney(data.totalNetWorth);
  document.getElementById("kpiLiquidity").textContent = formatMoney(data.liquidCash);
  document.getElementById("kpiAssetsValue").textContent = formatMoney(data.totalAssetsValue);
  document.getElementById("kpiOnlineEarnings").textContent = formatMoney(data.allTimeOnlineNet);

  // Financial Health Intelligence Indicators
  const dict = i18n[lang] || i18n.en;
  const kpiSavingsRateEl = document.getElementById("kpiSavingsRate");
  const savingsBadgeEl = document.getElementById("kpiSavingsBadge");
  if (kpiSavingsRateEl && savingsBadgeEl) {
    kpiSavingsRateEl.textContent = `${data.savingsRate.toFixed(1)}%`;
    if (data.savingsRate >= 20) {
      savingsBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      savingsBadgeEl.textContent = dict.badge_savings_high || "Excellent (>20%)";
    } else if (data.savingsRate >= 10) {
      savingsBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30";
      savingsBadgeEl.textContent = dict.badge_savings_fair || "Moderate (10-20%)";
    } else {
      savingsBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30";
      savingsBadgeEl.textContent = dict.badge_savings_low || "Low (<10%)";
    }
  }

  const runwayEl = document.getElementById("kpiEmergencyRunway");
  const runwayBadgeEl = document.getElementById("kpiRunwayBadge");
  if (runwayEl && runwayBadgeEl) {
    if (data.runwayMonths < 0) {
      runwayEl.textContent = dict.runway_deficit || "0 Months (Deficit)";
      runwayBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30";
      runwayBadgeEl.textContent = dict.badge_runway_low || "Critical (<3 mo)";
    } else if (data.runwayMonths >= 999) {
      runwayEl.textContent = dict.runway_infinite || "Highly Secure";
      runwayBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      runwayBadgeEl.textContent = dict.badge_runway_high || "Safe (>6 mo)";
    } else {
      runwayEl.textContent = `${data.runwayMonths.toFixed(1)} ${dict.runway_months || 'Months'}`;
      if (data.runwayMonths >= 6) {
        runwayBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
        runwayBadgeEl.textContent = dict.badge_runway_high || "Safe (>6 mo)";
      } else if (data.runwayMonths >= 3) {
        runwayBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30";
        runwayBadgeEl.textContent = dict.badge_runway_med || "Adequate (3-6 mo)";
      } else {
        runwayBadgeEl.className = "px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30";
        runwayBadgeEl.textContent = dict.badge_runway_low || "Critical (<3 mo)";
      }
    }
  }

  const toggle = document.getElementById("includeOnlineToggle");
  toggle.checked = appState.settings.includeOnline;

  // Period / Month Selector Dynamic Population
  const periodSelect = document.getElementById("cashflowPeriodSelect");
  if (periodSelect) {
    const rawMonths = new Set();
    appState.personalIncomes.forEach(i => { if (i.date) rawMonths.add(i.date.substring(0, 7)); });
    appState.personalObligations.forEach(o => { if (o.date) rawMonths.add(o.date.substring(0, 7)); });
    appState.creatorTransactions.forEach(t => { if (t.date) rawMonths.add(t.date.substring(0, 7)); });
    appState.freelanceTransactions.forEach(t => { if (t.date) rawMonths.add(t.date.substring(0, 7)); });
    const currentYearMonth = getLocalTodayStr().substring(0, 7);
    rawMonths.add(currentYearMonth);

    const sortedMonths = Array.from(rawMonths).sort().reverse();
    const periodDict = i18n[lang] || i18n.en;
    
    let optionsHtml = `<option value="all">${periodDict.filter_all_time || "All Time (Cumulative)"}</option>`;
    sortedMonths.forEach(m => {
      const isCurrent = m === currentYearMonth ? ` (${lang === 'ar' ? 'الشهر الحالي' : lang === 'es' ? 'Mes actual' : 'Current Month'})` : '';
      optionsHtml += `<option value="${m}">${m}${isCurrent}</option>`;
    });

    periodSelect.innerHTML = optionsHtml;
    periodSelect.value = paginationState.selectedPeriod || "all";
  }

  // Monthly Cashflow Equation Cards
  document.getElementById("eqTotalIncome").textContent = formatMoney(data.personalIncome);
  document.getElementById("eqTotalObligations").textContent = formatMoney(data.personalObligations);
  document.getElementById("eqNetBalance").textContent = formatMoney(data.personalNet);

  const savingsRateEl = document.getElementById("eqSavingsRate");
  if (savingsRateEl) {
    const rate = data.personalIncome > 0 ? Math.max(0, Math.round((data.personalNet / data.personalIncome) * 100)) : 0;
    savingsRateEl.textContent = `${rate}%`;
  }

  // Monthly Spending Budget Cap & Progress Bar
  const budgetStatusText = document.getElementById("budgetStatusText");
  const budgetProgressBar = document.getElementById("budgetProgressBar");
  const budgetAlertBadge = document.getElementById("budgetAlertBadge");

  if (budgetStatusText && budgetProgressBar) {
    const budgetConfig = appState.monthlyBudget || { enabled: false, amount: 0 };
    if (budgetConfig.enabled && budgetConfig.amount > 0) {
      const spent = data.personalObligations;
      const limit = budgetConfig.amount;
      const pct = Math.round((spent / limit) * 100);

      budgetStatusText.textContent = `${formatMoney(spent)} / ${formatMoney(limit)} (${pct}%)`;
      budgetProgressBar.style.width = `${Math.min(100, pct)}%`;

      if (pct > 100) {
        budgetProgressBar.className = "h-full bg-rose-500 transition-all duration-500 rounded-full";
        if (budgetAlertBadge) budgetAlertBadge.classList.remove("hidden");
      } else if (pct >= 80) {
        budgetProgressBar.className = "h-full bg-amber-500 transition-all duration-500 rounded-full";
        if (budgetAlertBadge) budgetAlertBadge.classList.add("hidden");
      } else {
        budgetProgressBar.className = "h-full bg-emerald-500 transition-all duration-500 rounded-full";
        if (budgetAlertBadge) budgetAlertBadge.classList.add("hidden");
      }
    } else {
      budgetStatusText.textContent = `${formatMoney(data.personalObligations)} (${(i18n[lang] || i18n.en).filter_all_time || 'No Limit Set'})`;
      budgetProgressBar.style.width = "0%";
      budgetProgressBar.className = "h-full bg-slate-700 transition-all duration-500 rounded-full";
      if (budgetAlertBadge) budgetAlertBadge.classList.add("hidden");
    }
  }

  // Period-filtered personal lists
  const selectedPeriod = paginationState.selectedPeriod;
  const isPeriodFiltered = selectedPeriod && selectedPeriod !== "all";

  const periodIncomes = sortByDateDesc(isPeriodFiltered
    ? appState.personalIncomes.filter(inc => (inc.date || "").startsWith(selectedPeriod))
    : appState.personalIncomes);

  const incQuery = (document.getElementById("searchIncomesInput")?.value || "").trim().toLowerCase();
  const visibleIncomes = incQuery
    ? periodIncomes.filter(inc => {
        const catLabel = (categoriesMap.personal_income[inc.category]?.[lang] || inc.category).toLowerCase();
        const titleMatch = (inc.title || "").toLowerCase().includes(incQuery);
        const catMatch = catLabel.includes(incQuery);
        const currMatch = (inc.currency || "").toLowerCase().includes(incQuery);
        const amtMatch = String(inc.amount).includes(incQuery) || (inc.foreignAmount && String(inc.foreignAmount).includes(incQuery));
        return titleMatch || catMatch || currMatch || amtMatch;
      })
    : periodIncomes;

  // Pagination for Incomes
  const incPageSize = isPrintMode ? Math.max(1, visibleIncomes.length) : paginationState.pageSize;
  const incTotal = visibleIncomes.length;
  const incTotalPages = Math.max(1, Math.ceil(incTotal / incPageSize));
  if (paginationState.incomesPage > incTotalPages) paginationState.incomesPage = incTotalPages;
  const incStart = (paginationState.incomesPage - 1) * incPageSize;
  const pagedIncomes = visibleIncomes.slice(incStart, incStart + incPageSize);

  const incList = document.getElementById("incomesList");
  if (visibleIncomes.length === 0) {
    incList.innerHTML = `<div class="p-6 text-center text-xs text-slate-500">${
      periodIncomes.length === 0
        ? tr('لا توجد مداخيل مسجلة في هذه الفترة', 'No incomes logged in this period', 'No hay ingresos registrados en este período')
        : tr('لا توجد نتائج مطابقة للبحث', 'No matching results', 'No hay resultados que coincidan')
    }</div>`;
  } else {
    incList.innerHTML = pagedIncomes.map((inc) => {
      const catLabel = categoriesMap.personal_income[inc.category]?.[lang] || inc.category;
      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-dark-900 border border-slate-800 hover:border-emerald-500/30 transition-all">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs">
              <i class="fa-solid fa-arrow-down"></i>
            </div>
            <div>
              <h5 class="text-xs font-bold text-white">${escapeHtml(inc.title)}</h5>
              <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                <span class="bg-dark-950 px-1.5 py-0.5 rounded border border-slate-800">${escapeHtml(catLabel)}</span>
                <span>${inc.date}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-right">
              <span class="text-xs font-mono font-bold text-emerald-400">+${formatMoney(inc.amount)}</span>
              ${(inc.currency && inc.currency !== appState.settings.currency && inc.foreignAmount) ? `<span class="text-[10px] font-mono text-slate-400 block font-normal">(${inc.foreignAmount.toLocaleString('en-US')} ${inc.currency})</span>` : ''}
            </div>
            <button onclick="openEditPersonalTxModal('income', '${inc.id}')" aria-label="${tr('تعديل الدخل', 'Edit income', 'Editar ingreso')}" class="text-slate-500 hover:text-brand-400 transition-colors p-1" title="${tr('تعديل الدخل', 'Edit income', 'Editar ingreso')}">
              <i class="fa-solid fa-pen-to-square text-xs"></i>
            </button>
            <button onclick="deletePersonalIncome('${inc.id}')" aria-label="${tr('حذف الدخل', 'Delete income', 'Eliminar ingreso')}" class="text-slate-500 hover:text-rose-400 transition-colors p-1" title="${tr('حذف الدخل', 'Delete income', 'Eliminar ingreso')}">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }
  renderPagination("incomesPagination", "incomes", paginationState.incomesPage, incTotal, incPageSize);

  const periodObligations = sortByDateDesc(isPeriodFiltered
    ? appState.personalObligations.filter(exp => (exp.date || "").startsWith(selectedPeriod))
    : appState.personalObligations);

  const expQuery = (document.getElementById("searchObligationsInput")?.value || "").trim().toLowerCase();
  const visibleObligations = expQuery
    ? periodObligations.filter(exp => {
        const catLabel = (categoriesMap.personal_expense[exp.category]?.[lang] || exp.category).toLowerCase();
        const titleMatch = (exp.title || "").toLowerCase().includes(expQuery);
        const catMatch = catLabel.includes(expQuery);
        const currMatch = (exp.currency || "").toLowerCase().includes(expQuery);
        const amtMatch = String(exp.amount).includes(expQuery) || (exp.foreignAmount && String(exp.foreignAmount).includes(expQuery));
        return titleMatch || catMatch || currMatch || amtMatch;
      })
    : periodObligations;

  // Pagination for Obligations
  const expPageSize = isPrintMode ? Math.max(1, visibleObligations.length) : paginationState.pageSize;
  const expTotal = visibleObligations.length;
  const expTotalPages = Math.max(1, Math.ceil(expTotal / expPageSize));
  if (paginationState.obligationsPage > expTotalPages) paginationState.obligationsPage = expTotalPages;
  const expStart = (paginationState.obligationsPage - 1) * expPageSize;
  const pagedObligations = visibleObligations.slice(expStart, expStart + expPageSize);

  const expList = document.getElementById("obligationsList");
  if (visibleObligations.length === 0) {
    expList.innerHTML = `<div class="p-6 text-center text-xs text-slate-500">${
      periodObligations.length === 0
        ? tr('لا توجد التزامات مسجلة في هذه الفترة', 'No obligations logged in this period', 'No hay obligaciones registradas en este período')
        : tr('لا توجد نتائج مطابقة للبحث', 'No matching results', 'No hay resultados que coincidan')
    }</div>`;
  } else {
    expList.innerHTML = pagedObligations.map((exp) => {
      const catLabel = categoriesMap.personal_expense[exp.category]?.[lang] || exp.category;
      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-dark-900 border border-slate-800 hover:border-rose-500/30 transition-all">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center text-xs">
              <i class="fa-solid fa-arrow-up"></i>
            </div>
            <div>
              <h5 class="text-xs font-bold text-white">${escapeHtml(exp.title)}</h5>
              <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                <span class="bg-dark-950 px-1.5 py-0.5 rounded border border-slate-800">${escapeHtml(catLabel)}</span>
                <span>${exp.date}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-right">
              <span class="text-xs font-mono font-bold text-rose-400">-${formatMoney(exp.amount)}</span>
              ${(exp.currency && exp.currency !== appState.settings.currency && exp.foreignAmount) ? `<span class="text-[10px] font-mono text-slate-400 block font-normal">(${exp.foreignAmount.toLocaleString('en-US')} ${exp.currency})</span>` : ''}
            </div>
            <button onclick="openEditPersonalTxModal('expense', '${exp.id}')" aria-label="${tr('تعديل الالتزام', 'Edit obligation', 'Editar obligación')}" class="text-slate-500 hover:text-brand-400 transition-colors p-1" title="${tr('تعديل الالتزام', 'Edit obligation', 'Editar obligación')}">
              <i class="fa-solid fa-pen-to-square text-xs"></i>
            </button>
            <button onclick="deletePersonalObligation('${exp.id}')" aria-label="${tr('حذف الالتزام', 'Delete obligation', 'Eliminar obligación')}" class="text-slate-500 hover:text-rose-400 transition-colors p-1" title="${tr('حذف الالتزام', 'Delete obligation', 'Eliminar obligación')}">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }
  renderPagination("obligationsPagination", "obligations", paginationState.obligationsPage, expTotal, expPageSize);

  // Render Custom Personal Categories Badges
  const pIncBadgeContainer = document.getElementById("personalIncomeCatsBadges");
  if (pIncBadgeContainer) {
    const pIncCats = appState.customPersonalCats?.income || [];
    pIncBadgeContainer.innerHTML = pIncCats.map((cat, idx) => `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs">
        <span>${escapeHtml(cat)}</span>
        <button type="button" data-pcat-idx="${idx}" data-pcat-type="income" aria-label="${tr('حذف التصنيف', 'Remove category', 'Eliminar categoría')}" class="btn-remove-personal-cat hover:text-rose-400 text-[10px]">&times;</button>
      </span>
    `).join("");
  }

  const pExpBadgeContainer = document.getElementById("personalExpenseCatsBadges");
  if (pExpBadgeContainer) {
    const pExpCats = appState.customPersonalCats?.expense || [];
    pExpBadgeContainer.innerHTML = pExpCats.map((cat, idx) => `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs">
        <span>${escapeHtml(cat)}</span>
        <button type="button" data-pcat-idx="${idx}" data-pcat-type="expense" aria-label="${tr('حذف التصنيف', 'Remove category', 'Eliminar categoría')}" class="btn-remove-personal-cat hover:text-rose-400 text-[10px]">&times;</button>
      </span>
    `).join("");
  }

  const assetsBody = document.getElementById("assetsTableBody");
  const astQuery = (document.getElementById("searchAssetsInput")?.value || "").trim().toLowerCase();
  const visibleAssets = astQuery
    ? appState.assets.filter(ast => {
        const catMeta = categoriesMap.asset_categories[ast.category] || { ar: "أصل عام", en: "General", es: "General" };
        const catLabel = (catMeta[lang] || catMeta.en || "").toLowerCase();
        return (ast.name || "").toLowerCase().includes(astQuery) ||
               catLabel.includes(astQuery) ||
               (ast.karat || "").toLowerCase().includes(astQuery) ||
               String(ast.quantity).includes(astQuery);
      })
    : appState.assets;

  const astPageSize = isPrintMode ? Math.max(1, visibleAssets.length) : paginationState.pageSize;
  const astTotal = visibleAssets.length;
  const astTotalPages = Math.max(1, Math.ceil(astTotal / astPageSize));
  if (paginationState.assetsPage > astTotalPages) paginationState.assetsPage = astTotalPages;
  const astStart = (paginationState.assetsPage - 1) * astPageSize;
  const pagedAssets = visibleAssets.slice(astStart, astStart + astPageSize);

  if (visibleAssets.length === 0) {
    assetsBody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-500 text-xs">${
      appState.assets.length === 0
        ? tr('لا توجد أصول مسجلة حالياً', 'No assets registered yet', 'No hay activos registrados aún')
        : tr('لا توجد نتائج مطابقة للبحث', 'No matching results', 'No hay resultados que coincidan')
    }</td></tr>`;
  } else {
    const isPrivate = Boolean(appState?.settings?.privacyMode);
    assetsBody.innerHTML = pagedAssets.map((ast) => {
      let unitPrice = Number(ast.unitPrice || 0);
      let isLockedRate = false;
      if (ast.category === "usd") { unitPrice = Number(appState.rates.usd); isLockedRate = true; }
      if (ast.category === "eur") { unitPrice = Number(appState.rates.eur); isLockedRate = true; }
      if (ast.category === "gold") {
        unitPrice = getCalculatedGoldRate(ast.karat || "24k");
        isLockedRate = true;
      }

      const total = Number(ast.quantity || 0) * unitPrice;
      const catMeta = categoriesMap.asset_categories[ast.category] || { ar: "أصل عام", en: "General", es: "General", unit: "Unit" };
      let catLabel = catMeta[lang] || catMeta.en;
      if (ast.category === "gold") {
        catLabel += ` (${ast.karat ? ast.karat.toUpperCase() : '24K'})`;
      }

      const purchasePrice = (ast.purchasePrice !== undefined && ast.purchasePrice !== null && ast.purchasePrice !== '') ? Number(ast.purchasePrice) : ((ast.unitPrice !== undefined && ast.unitPrice !== null && ast.unitPrice !== '') ? Number(ast.unitPrice) : unitPrice);
      const totalCost = Number(ast.quantity || 0) * purchasePrice;
      const gainLoss = total - totalCost;
      const roiPct = totalCost > 0 ? ((gainLoss / totalCost) * 100).toFixed(1) : 0;

      return `
        <tr class="hover:bg-dark-900/50 transition-colors">
          <td class="py-3 px-3 font-bold text-white flex items-center gap-2">
            <i class="fa-solid fa-vault text-brand-400"></i>
            <span>${escapeHtml(ast.name)}</span>
          </td>
          <td class="py-3 px-3">
            <span class="bg-dark-950 text-slate-300 px-2 py-0.5 rounded-full border border-slate-800 text-[11px]">${escapeHtml(catLabel)}</span>
          </td>
          <td class="py-3 px-3">
            <div class="flex items-center gap-1.5">
              ${isPrivate 
                ? `<span class="font-mono text-slate-400 text-xs">••••••</span>`
                : `<input type="number" step="0.01" min="0" value="${ast.quantity}" 
                     onchange="updateAssetQtyInline('${ast.id}', this.value)"
                     aria-label="Asset quantity"
                     class="w-24 bg-dark-950 text-white font-mono px-2 py-1 rounded border border-slate-700 focus:border-brand-500 text-xs focus:outline-none">`
              }
              <span class="text-[10px] text-slate-400 font-mono">${catMeta.unit || ''}</span>
            </div>
          </td>
          <td class="py-3 px-3">
            ${isPrivate
              ? `<span class="font-mono text-slate-400 text-xs">••••••</span>`
              : (isLockedRate 
                  ? `<div class="flex items-center gap-1 text-slate-300 font-mono text-xs"><i class="fa-solid fa-lock text-[10px] text-amber-400" title="Synced with global rate"></i> ${(unitPrice > 0 && unitPrice < 1) ? unitPrice.toFixed(3) : unitPrice.toFixed(2)}</div>` 
                  : `<input type="number" step="0.01" min="0" value="${unitPrice}" 
                      onchange="updateAssetPriceInline('${ast.id}', this.value)"
                      aria-label="Asset unit price"
                      class="w-28 bg-dark-950 text-white font-mono px-2 py-1 rounded border border-slate-700 focus:border-brand-500 text-xs focus:outline-none">`
                )
            }
          </td>
          <td class="py-3 px-3">
            <div class="font-mono font-bold text-amber-300 text-xs">${formatMoney(total)}</div>
            ${totalCost > 0 && Math.abs(gainLoss) > 0.01 ? `
              <div class="text-[10px] font-mono flex items-center gap-1 mt-0.5 ${gainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                <i class="fa-solid ${gainLoss >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} text-[9px]"></i>
                <span>${gainLoss >= 0 ? '+' : ''}${formatMoney(gainLoss)} ${isPrivate ? '' : `(${gainLoss >= 0 ? '+' : ''}${roiPct}%)`}</span>
              </div>
            ` : ''}
          </td>
          <td class="py-3 px-3 text-end">
            <div class="flex items-center justify-end gap-1">
              <button onclick="openEditAssetModal('${ast.id}')" aria-label="${tr('تعديل الأصل', 'Edit asset', 'Editar activo')}" class="text-slate-500 hover:text-brand-400 transition-colors p-1" title="${tr('تعديل الأصل', 'Edit asset', 'Editar activo')}">
                <i class="fa-solid fa-pen-to-square text-xs"></i>
              </button>
              <button onclick="deleteAsset('${ast.id}')" aria-label="${tr('حذف الأصل', 'Delete asset', 'Eliminar activo')}" class="text-slate-500 hover:text-rose-400 transition-colors p-1" title="${tr('حذف الأصل', 'Delete asset', 'Eliminar activo')}">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }
  renderPagination("assetsPagination", "assets", paginationState.assetsPage, astTotal, astPageSize);

  document.getElementById("creatorTotalRev").textContent = formatMoney(data.creatorRev);
  document.getElementById("creatorTotalExp").textContent = formatMoney(data.creatorExp);
  document.getElementById("creatorNetProfit").textContent = formatMoney(data.creatorNet);
  const margin = data.creatorRev > 0 ? ((data.creatorNet / data.creatorRev) * 100).toFixed(1) : 0;
  document.getElementById("creatorProfitMargin").textContent = `${tr('هامش الربح', 'Margin', 'Margen')}: ${margin}%`;

  const chnGrid = document.getElementById("channelsGrid");
  if (appState.channels.length === 0) {
    chnGrid.innerHTML = `<div class="col-span-full p-6 text-center text-xs text-slate-500">${tr('لا توجد قنوات مسجلة حالياً. اضغط قناة جديدة للبدء.', 'No channels added yet. Click New Channel to start.', 'No hay canales registrados aún. Haga clic en Nuevo Canal para comenzar.')}</div>`;
  } else {
    chnGrid.innerHTML = appState.channels.map((chn) => {
      const meta = platformMeta[chn.platform] || { icon: "fa-solid fa-play", color: "text-slate-200", bg: "bg-slate-700/20" };
      
      let cRev = 0;
      let cExp = 0;
      const expCatBreakdown = {};

      const periodChannelTx = isPeriodFiltered
        ? appState.creatorTransactions.filter(t => t.channelId === chn.id && (t.date || "").startsWith(selectedPeriod))
        : appState.creatorTransactions.filter(t => t.channelId === chn.id);

      periodChannelTx.forEach(t => {
        if (t.flow === "revenue") cRev += Number(t.amount || 0);
        else {
          cExp += Number(t.amount || 0);
          expCatBreakdown[t.category] = (expCatBreakdown[t.category] || 0) + Number(t.amount || 0);
        }
      });
      const cNet = cRev - cExp;

      const breakdownHtml = Object.keys(expCatBreakdown).map(catKey => {
        const label = categoriesMap.creator_expense[catKey]?.[lang] || catKey;
        return `<span class="bg-dark-950 px-1.5 py-0.5 rounded text-[10px] text-slate-400 border border-slate-800">${escapeHtml(label)}: ${formatMoney(expCatBreakdown[catKey])}</span>`;
      }).join(" ");

      return `
        <div class="bg-dark-900 border border-slate-800 rounded-xl p-4 space-y-3 relative hover:border-slate-700 transition-all">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center text-base">
                <i class="${meta.icon}"></i>
              </div>
              <div>
                <h5 class="text-xs font-bold text-white">${escapeHtml(chn.name)}</h5>
                <span class="text-[10px] uppercase font-bold text-slate-400">${chn.platform}</span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="openEditChannelModal('${chn.id}')" aria-label="${tr('تعديل بيانات القناة', 'Edit Channel', 'Editar canal')}" class="text-slate-500 hover:text-brand-400 transition-colors p-1" title="${tr('تعديل بيانات القناة', 'Edit Channel', 'Editar canal')}">
                <i class="fa-solid fa-pen-to-square text-xs"></i>
              </button>
              <button onclick="deleteChannel('${chn.id}')" aria-label="${tr('حذف القناة', 'Delete Channel', 'Eliminar canal')}" class="text-slate-600 hover:text-rose-400 transition-colors text-xs p-1" title="${tr('حذف القناة', 'Delete Channel', 'Eliminar canal')}">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center bg-dark-950 p-2 rounded-lg border border-slate-850">
            <div>
              <span class="text-[10px] text-slate-400 block">${tr('الإيرادات', 'Revenue', 'Ingresos')}</span>
              <span class="text-xs font-mono font-bold text-emerald-400">+${formatMoney(cRev)}</span>
            </div>
            <div>
              <span class="text-[10px] text-slate-400 block">${tr('التكاليف', 'Costs', 'Costos')}</span>
              <span class="text-xs font-mono font-bold text-rose-400">-${formatMoney(cExp)}</span>
            </div>
            <div>
              <span class="text-[10px] text-slate-400 block">${tr('الصافي', 'Net', 'Neto')}</span>
              <span class="text-xs font-mono font-bold ${cNet >= 0 ? 'text-brand-300' : 'text-rose-400'}">${formatMoney(cNet)}</span>
            </div>
          </div>

          ${breakdownHtml ? `
            <div class="pt-1">
              <span class="text-[10px] text-slate-500 block mb-1 font-semibold">${tr('تفاصيل الإنتاج:', 'Production breakdown:', 'Desglose de producción:')}</span>
              <div class="flex flex-wrap gap-1">${breakdownHtml}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join("");
  }

  const filterSelect = document.getElementById("channelFilterSelect");
  const modalChanSelect = document.getElementById("creatorTxChannelSelect");
  const currentFilter = filterSelect.value || "all";

  const channelOptionsHtml = appState.channels.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.platform})</option>`).join("");
  modalChanSelect.innerHTML = channelOptionsHtml || `<option value="">No channels available</option>`;

  filterSelect.innerHTML = `<option value="all">${i18n[lang].opt_all_channels}</option>` + channelOptionsHtml;
  filterSelect.value = currentFilter;

  const creatorTxList = document.getElementById("creatorTxList");
  const periodCreatorTxAll = isPeriodFiltered
    ? appState.creatorTransactions.filter(t => (t.date || "").startsWith(selectedPeriod))
    : appState.creatorTransactions;
  const crtQuery = (document.getElementById("searchCreatorTxInput")?.value || "").trim().toLowerCase();
  const baseCreatorTx = currentFilter === "all"
    ? periodCreatorTxAll
    : periodCreatorTxAll.filter(t => t.channelId === currentFilter);
  const filteredCreatorTx = sortByDateDesc(crtQuery
    ? baseCreatorTx.filter(tx => {
        const chn = appState.channels.find(c => c.id === tx.channelId);
        const chnName = (chn ? chn.name : "").toLowerCase();
        const isRev = tx.flow === "revenue";
        const catLabel = (isRev
          ? (categoriesMap.creator_revenue[tx.category]?.[lang] || tx.category)
          : (categoriesMap.creator_expense[tx.category]?.[lang] || tx.category)).toLowerCase();
        return (tx.title || "").toLowerCase().includes(crtQuery) ||
               chnName.includes(crtQuery) ||
               catLabel.includes(crtQuery) ||
               String(tx.amount).includes(crtQuery);
      })
    : baseCreatorTx);

  const crtPageSize = isPrintMode ? Math.max(1, filteredCreatorTx.length) : paginationState.pageSize;
  const crtTotal = filteredCreatorTx.length;
  const crtTotalPages = Math.max(1, Math.ceil(crtTotal / crtPageSize));
  if (paginationState.creatorTxPage > crtTotalPages) paginationState.creatorTxPage = crtTotalPages;
  const crtStart = (paginationState.creatorTxPage - 1) * crtPageSize;
  const pagedCreatorTx = filteredCreatorTx.slice(crtStart, crtStart + crtPageSize);

  if (filteredCreatorTx.length === 0) {
    creatorTxList.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">${
      baseCreatorTx.length === 0
        ? tr('لا توجد معاملات مسجلة', 'No transactions recorded', 'No hay transacciones registradas')
        : tr('لا توجد نتائج مطابقة للبحث', 'No matching results', 'No hay resultados que coincidan')
    }</div>`;
  } else {
    creatorTxList.innerHTML = pagedCreatorTx.map(tx => {
      const chn = appState.channels.find(c => c.id === tx.channelId);
      const chnName = chn ? chn.name : "Channel";
      const isRev = tx.flow === "revenue";
      const catLabel = isRev 
        ? (categoriesMap.creator_revenue[tx.category]?.[lang] || tx.category)
        : (categoriesMap.creator_expense[tx.category]?.[lang] || tx.category);

      return `
        <div class="flex items-center justify-between p-2.5 rounded-lg bg-dark-900 border border-slate-800 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${isRev ? 'bg-emerald-400' : 'bg-rose-400'}"></span>
            <div>
              <span class="font-bold text-white">${escapeHtml(tx.title)}</span>
              <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                <span class="text-brand-300 font-semibold">${escapeHtml(chnName)}</span>
                <span>•</span>
                <span>${escapeHtml(catLabel)}</span>
                <span>•</span>
                <span>${tx.date}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="text-right">
              <span class="font-mono font-bold ${isRev ? 'text-emerald-400' : 'text-rose-400'}">
                ${isRev ? '+' : '-'}${formatMoney(tx.amount)}
              </span>
              ${(tx.currency && tx.currency !== appState.settings.currency && tx.foreignAmount) ? `<span class="text-[10px] font-mono text-slate-400 block font-normal">(${tx.foreignAmount.toLocaleString('en-US')} ${tx.currency})</span>` : ''}
            </div>
            <button onclick="openEditCreatorTxModal('${tx.id}')" aria-label="${tr('تعديل المعاملة', 'Edit transaction', 'Editar transacción')}" class="text-slate-500 hover:text-brand-400 transition-colors p-1" title="${tr('تعديل المعاملة', 'Edit transaction', 'Editar transacción')}">
              <i class="fa-solid fa-pen-to-square text-xs"></i>
            </button>
            <button onclick="deleteCreatorTx('${tx.id}')" aria-label="${tr('حذف المعاملة', 'Delete transaction', 'Eliminar transacción')}" class="text-slate-500 hover:text-rose-400 transition-colors p-1" title="${tr('حذف المعاملة', 'Delete transaction', 'Eliminar transacción')}">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }
  renderPagination("creatorTxPagination", "creatorTx", paginationState.creatorTxPage, crtTotal, crtPageSize);

  document.getElementById("freelanceRoleInput").value = appState.settings.freelanceRole || "";
  document.getElementById("flTotalIncome").textContent = formatMoney(data.freelanceRev);
  document.getElementById("flTotalExpenses").textContent = formatMoney(data.freelanceExp);
  document.getElementById("flNetProfit").textContent = formatMoney(data.freelanceNet);

  const flIncBadgeContainer = document.getElementById("flIncomeCatsBadges");
  flIncBadgeContainer.innerHTML = appState.freelanceCats.income.map((cat, idx) => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs">
      <span>${escapeHtml(cat)}</span>
      <button type="button" data-cat-idx="${idx}" data-cat-type="income" aria-label="${tr('حذف التصنيف', 'Remove category', 'Eliminar categoría')}" class="btn-remove-fl-cat hover:text-rose-400 text-[10px]">&times;</button>
    </span>
  `).join("");

  const flExpBadgeContainer = document.getElementById("flExpenseCatsBadges");
  flExpBadgeContainer.innerHTML = appState.freelanceCats.expense.map((cat, idx) => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs">
      <span>${escapeHtml(cat)}</span>
      <button type="button" data-cat-idx="${idx}" data-cat-type="expense" aria-label="${tr('حذف التصنيف', 'Remove category', 'Eliminar categoría')}" class="btn-remove-fl-cat hover:text-rose-400 text-[10px]">&times;</button>
    </span>
  `).join("");

  const flLedger = document.getElementById("freelanceTxList");
  const flQuery = (document.getElementById("searchFreelanceTxInput")?.value || "").trim().toLowerCase();
  const rawPeriodFreelanceTx = isPeriodFiltered
    ? appState.freelanceTransactions.filter(t => (t.date || "").startsWith(selectedPeriod))
    : appState.freelanceTransactions;
  const periodFreelanceTxList = sortByDateDesc(flQuery
    ? rawPeriodFreelanceTx.filter(tx =>
        (tx.title || "").toLowerCase().includes(flQuery) ||
        (tx.category || "").toLowerCase().includes(flQuery) ||
        String(tx.amount).includes(flQuery)
      )
    : rawPeriodFreelanceTx);
  const flPageSize = isPrintMode ? Math.max(1, periodFreelanceTxList.length) : paginationState.pageSize;
  const flTotal = periodFreelanceTxList.length;
  const flTotalPages = Math.max(1, Math.ceil(flTotal / flPageSize));
  if (paginationState.freelanceTxPage > flTotalPages) paginationState.freelanceTxPage = flTotalPages;
  const flStart = (paginationState.freelanceTxPage - 1) * flPageSize;
  const pagedFreelanceTx = periodFreelanceTxList.slice(flStart, flStart + flPageSize);

  if (periodFreelanceTxList.length === 0) {
    flLedger.innerHTML = `<div class="p-6 text-center text-xs text-slate-500">${
      rawPeriodFreelanceTx.length === 0
        ? tr('لا توجد معاملات مسجلة في مساحة العمل الحر', 'No freelance records logged yet', 'No hay registros de trabajo freelance aún')
        : tr('لا توجد نتائج مطابقة للبحث', 'No matching results', 'No hay resultados que coincidan')
    }</div>`;
  } else {
    flLedger.innerHTML = pagedFreelanceTx.map(tx => {
      const isInc = tx.flow === "income";
      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-dark-900 border border-slate-800 hover:border-indigo-500/30 transition-all text-xs">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg ${isInc ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center">
              <i class="fa-solid ${isInc ? 'fa-arrow-down-left' : 'fa-arrow-up-right'}"></i>
            </div>
            <div>
              <h5 class="font-bold text-white">${escapeHtml(tx.title)}</h5>
              <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                <span class="bg-dark-950 px-1.5 py-0.5 rounded border border-slate-800">${escapeHtml(tx.category)}</span>
                <span>${tx.date}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-right">
              <span class="font-mono font-bold ${isInc ? 'text-emerald-400' : 'text-rose-400'}">
                ${isInc ? '+' : '-'}${formatMoney(tx.amount)}
              </span>
              ${(tx.currency && tx.currency !== appState.settings.currency && tx.foreignAmount) ? `<span class="text-[10px] font-mono text-slate-400 block font-normal">(${tx.foreignAmount.toLocaleString('en-US')} ${tx.currency})</span>` : ''}
            </div>
            <button onclick="openEditFreelanceTxModal('${tx.id}')" aria-label="${tr('تعديل المعاملة', 'Edit transaction', 'Editar transacción')}" class="text-slate-500 hover:text-indigo-400 transition-colors p-1" title="${tr('تعديل المعاملة', 'Edit transaction', 'Editar transacción')}">
              <i class="fa-solid fa-pen-to-square text-xs"></i>
            </button>
            <button onclick="deleteFreelanceTx('${tx.id}')" aria-label="${tr('حذف المعاملة', 'Delete transaction', 'Eliminar transacción')}" class="text-slate-500 hover:text-rose-400 transition-colors p-1" title="${tr('حذف المعاملة', 'Delete transaction', 'Eliminar transacción')}">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }
  renderPagination("freelanceTxPagination", "freelanceTx", paginationState.freelanceTxPage, flTotal, flPageSize);

  renderCharts(data);
}

// Chart.js Visualization Controllers
function renderCharts(data) {
  const lang = appState.settings.lang;

  const doughnutCtx = document.getElementById("wealthDoughnutChart")?.getContext("2d");
  if (doughnutCtx) {
    const labels = [
      tr('السيولة النقدية', 'Liquid Cash', 'Efectivo Líquido'),
      'USD',
      'EUR',
      tr('الذهب والسبائك', 'Gold (24k)', 'Oro y Lingotes'),
      tr('الأسهم والاستثمار', 'Stocks & ETFs', 'Acciones y Fondos'),
      tr('العقارات', 'Real Estate', 'Bienes Raíces'),
      tr('أصول أخرى', 'Other Assets', 'Otros Activos')
    ];
    const values = [
      Math.max(0, data.liquidCash),
      data.assetValues.usd,
      data.assetValues.eur,
      data.assetValues.gold,
      data.assetValues.stocks,
      data.assetValues.realestate,
      data.assetValues.other
    ];
    const colors = [
      '#10b981',
      '#3b82f6',
      '#6366f1',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899',
      '#64748b'
    ];

    if (wealthChart) {
      wealthChart.data.labels = labels;
      wealthChart.data.datasets[0].data = values;
      wealthChart.update();
    } else {
      wealthChart = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: '#0f172a',
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` ${context.label}: ${formatMoney(context.raw)}`;
                }
              }
            }
          }
        }
      });
    }

    const legendContainer = document.getElementById("doughnutLegend");
    if (legendContainer) {
      legendContainer.innerHTML = labels.map((lbl, idx) => {
        if (values[idx] <= 0) return '';
        return `
          <div class="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${colors[idx]}"></span>
            <span class="text-slate-400 truncate">${lbl}:</span>
            <span class="font-mono font-bold text-slate-200">${formatMoney(values[idx])}</span>
          </div>
        `;
      }).join("");
    }
  }

  const barCtx = document.getElementById("pillarsBarChart")?.getContext("2d");
  if (barCtx) {
    const pillarLabels = [
      tr('المصاريف الشخصية', 'Personal', 'Personal'),
      tr('صناع المحتوى', 'Content Creators', 'Creadores'),
      tr('العمل الحر', 'Freelancing', 'Freelance')
    ];
    const inflows = [data.personalIncome, data.creatorRev, data.freelanceRev];
    const outflows = [data.personalObligations, data.creatorExp, data.freelanceExp];

    const totalIn = inflows.reduce((a, b) => a + b, 0);
    const totalOut = outflows.reduce((a, b) => a + b, 0);
    document.getElementById("barInflowTotal").textContent = formatMoney(totalIn);
    document.getElementById("barOutflowTotal").textContent = formatMoney(totalOut);

    if (pillarsChart) {
      pillarsChart.data.labels = pillarLabels;
      pillarsChart.data.datasets[0].label = tr('التدفقات الواردة', 'Inflow', 'Ingresos');
      pillarsChart.data.datasets[0].data = inflows;
      pillarsChart.data.datasets[1].label = tr('الالتزامات والمصاريف', 'Outflow', 'Gastos');
      pillarsChart.data.datasets[1].data = outflows;
      pillarsChart.update();
    } else {
      pillarsChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: pillarLabels,
          datasets: [
            {
              label: tr('التدفقات الواردة', 'Inflow', 'Ingresos'),
              data: inflows,
              backgroundColor: '#10b981',
              borderRadius: 6
            },
            {
              label: tr('الالتزامات والمصاريف', 'Outflow', 'Gastos'),
              data: outflows,
              backgroundColor: '#f43f5e',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#94a3b8', font: { size: 11 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                color: '#94a3b8',
                font: { size: 10, family: 'Inter' },
                callback: function(val) {
                  return appState?.settings?.privacyMode ? '•••' : val.toLocaleString('en-US');
                }
              }
            }
          },
          plugins: {
            legend: {
              labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` ${context.dataset.label}: ${formatMoney(context.raw)}`;
                }
              }
            }
          }
        }
      });
    }
  }

  // 3. Historical Monthly Trends Chart
  const trendsCtx = document.getElementById("historicalTrendsChart")?.getContext("2d");
  if (trendsCtx) {
    const allMonthsSet = new Set();
    appState.personalIncomes.forEach(i => { if (i.date) allMonthsSet.add(i.date.substring(0, 7)); });
    appState.personalObligations.forEach(o => { if (o.date) allMonthsSet.add(o.date.substring(0, 7)); });
    const currentYM = getLocalTodayStr().substring(0, 7);
    allMonthsSet.add(currentYM);

    const sortedAllMonths = Array.from(allMonthsSet).sort();
    const recentMonths = sortedAllMonths.slice(-6);

    const trendLabels = recentMonths;
    const trendIncomes = [];
    const trendObligations = [];
    const trendNet = [];

    recentMonths.forEach(m => {
      const incSum = appState.personalIncomes
        .filter(i => (i.date || "").startsWith(m))
        .reduce((s, i) => s + Number(i.amount || 0), 0);
      const expSum = appState.personalObligations
        .filter(e => (e.date || "").startsWith(m))
        .reduce((s, e) => s + Number(e.amount || 0), 0);

      trendIncomes.push(incSum);
      trendObligations.push(expSum);
      trendNet.push(incSum - expSum);
    });

    if (trendsChart) {
      trendsChart.data.labels = trendLabels;
      trendsChart.data.datasets[0].data = trendIncomes;
      trendsChart.data.datasets[0].label = lang === 'ar' ? 'المداخيل (+)' : lang === 'es' ? 'Ingresos (+)' : 'Incomes (+)';
      trendsChart.data.datasets[1].data = trendObligations;
      trendsChart.data.datasets[1].label = lang === 'ar' ? 'الالتزامات (-)' : lang === 'es' ? 'Obligaciones (-)' : 'Obligations (-)';
      trendsChart.data.datasets[2].data = trendNet;
      trendsChart.data.datasets[2].label = lang === 'ar' ? 'صافي الفائض' : lang === 'es' ? 'Superávit neto' : 'Net Surplus';
      trendsChart.update();
    } else {
      trendsChart = new Chart(trendsCtx, {
        type: 'bar',
        data: {
          labels: trendLabels,
          datasets: [
            {
              label: lang === 'ar' ? 'المداخيل (+)' : lang === 'es' ? 'Ingresos (+)' : 'Incomes (+)',
              data: trendIncomes,
              backgroundColor: '#10b981',
              borderRadius: 6
            },
            {
              label: lang === 'ar' ? 'الالتزامات (-)' : lang === 'es' ? 'Obligaciones (-)' : 'Obligations (-)',
              data: trendObligations,
              backgroundColor: '#f43f5e',
              borderRadius: 6
            },
            {
              type: 'line',
              label: lang === 'ar' ? 'صافي الفائض' : lang === 'es' ? 'Superávit neto' : 'Net Surplus',
              data: trendNet,
              borderColor: '#6366f1',
              backgroundColor: '#6366f1',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#818cf8',
              tension: 0.25
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#94a3b8', font: { size: 11, family: 'Inter' } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                color: '#94a3b8',
                font: { size: 10, family: 'Inter' },
                callback: function(val) {
                  return appState?.settings?.privacyMode ? '•••' : val.toLocaleString('en-US');
                }
              }
            }
          },
          plugins: {
            legend: {
              labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` ${context.dataset.label}: ${formatMoney(context.raw)}`;
                }
              }
            }
          }
        }
      });
    }
  }
}

// Action Handlers & Inline Mutations
function updateAssetQtyInline(assetId, newQty) {
  const asset = appState.assets.find(a => a.id === assetId);
  if (asset) {
    asset.quantity = Math.max(0, parseFloat(newQty) || 0);
    persistState();
    renderAll();
    showToast(tr('تم تحديث كمية الأصل وصافي الثروة', 'Asset quantity & Net Worth updated', 'Cantidad de activo y patrimonio neto actualizados'));
  }
}

function updateAssetPriceInline(assetId, newPrice) {
  const asset = appState.assets.find(a => a.id === assetId);
  if (asset) {
    asset.unitPrice = Math.max(0, parseFloat(newPrice) || 0);
    persistState();
    renderAll();
    showToast(tr('تم تحديث سعر الأصل وصافي الثروة', 'Asset price & Net Worth updated', 'Precio de activo y patrimonio neto actualizados'));
  }
}

async function deletePersonalIncome(id) {
  const ok = await requestConfirmation(
    tr('حذف مصدر الدخل', 'Delete Income', 'Eliminar ingreso'),
    tr('هل أنت متأكد من حذف هذا البند نهائياً؟', 'Are you sure you want to permanently delete this income?', '¿Está seguro de que desea eliminar permanentemente este ingreso?')
  );
  if (ok) {
    appState.personalIncomes = appState.personalIncomes.filter(i => i.id !== id);
    await persistState();
    renderAll();
    showToast(tr('تم الحذف بنجاح', 'Income deleted', 'Ingreso eliminado con éxito'));
  }
}

async function deletePersonalObligation(id) {
  const ok = await requestConfirmation(
    tr('حذف الالتزام المالي', 'Delete Obligation', 'Eliminar compromiso'),
    tr('هل أنت متأكد من حذف هذا الالتزام نهائياً؟', 'Are you sure you want to permanently delete this obligation?', '¿Está seguro de que desea eliminar este compromiso financiero?')
  );
  if (ok) {
    appState.personalObligations = appState.personalObligations.filter(o => o.id !== id);
    await persistState();
    renderAll();
    showToast(tr('تم الحذف بنجاح', 'Obligation deleted', 'Compromiso eliminado con éxito'));
  }
}

async function deleteAsset(id) {
  const ok = await requestConfirmation(
    tr('حذف الأصل', 'Delete Asset', 'Eliminar activo'),
    tr('هل أنت متأكد من حذف هذا الأصل من محفظتك؟', 'Are you sure you want to delete this asset?', '¿Está seguro de que desea eliminar este activo?')
  );
  if (ok) {
    appState.assets = appState.assets.filter(a => a.id !== id);
    await persistState();
    renderAll();
    showToast(tr('تم حذف الأصل وإعادة تقييم الثروة', 'Asset deleted', 'Activo eliminado'));
  }
}

async function deleteChannel(id) {
  const ok = await requestConfirmation(
    tr('حذف القناة', 'Delete Channel', 'Eliminar canal'),
    tr('سيتم حذف القناة وكافة العمليات المرتبطة بها!', 'Deleting this channel will remove all its related transactions!', '¡Al eliminar este canal se eliminarán todas sus transacciones relacionadas!')
  );
  if (ok) {
    appState.channels = appState.channels.filter(c => c.id !== id);
    appState.creatorTransactions = appState.creatorTransactions.filter(t => t.channelId !== id);
    await persistState();
    renderAll();
    showToast(tr('تم حذف القناة وبياناتها', 'Channel & transactions removed', 'Canal y transacciones eliminados'));
  }
}

async function deleteCreatorTx(id) {
  const ok = await requestConfirmation(
    tr('حذف المعاملة', 'Delete Transaction', 'Eliminar transacción'),
    tr('هل أنت متأكد من حذف هذه المعاملة؟', 'Are you sure you want to delete this transaction?', '¿Está seguro de que desea eliminar esta transacción?')
  );
  if (ok) {
    appState.creatorTransactions = appState.creatorTransactions.filter(t => t.id !== id);
    await persistState();
    renderAll();
    showToast(tr('تم الحذف', 'Transaction deleted', 'Transacción eliminada'));
  }
}

async function deleteFreelanceTx(id) {
  const ok = await requestConfirmation(
    tr('حذف عملية العمل الحر', 'Delete Freelance Entry', 'Eliminar entrada de freelance'),
    tr('هل أنت متأكد من حذف هذا السجل؟', 'Are you sure you want to delete this entry?', '¿Está seguro de que desea eliminar esta entrada?')
  );
  if (ok) {
    appState.freelanceTransactions = appState.freelanceTransactions.filter(t => t.id !== id);
    await persistState();
    renderAll();
    showToast(tr('تم الحذف', 'Entry deleted', 'Entrada eliminada'));
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// Live Daily Currency & Gold 24k Auto-Sync Engine (Multi-Source with Offline Fallback)
const TROY_OUNCE_GRAMS = 31.1034768;
let isSyncingRates = false;

async function fetchLiveMarketRates(isManual = false) {
  if (isSyncingRates) return;
  const lang = appState.settings.lang || "ar";
  const dict = i18n[lang] || i18n.en;

  if (!navigator.onLine) {
    if (isManual) showToast(dict.sync_status_offline, "info");
    return;
  }

  isSyncingRates = true;
  const icon1 = document.getElementById("syncRatesIcon");
  const icon2 = document.getElementById("headerSyncIcon");
  const statusEl = document.getElementById("lastSyncStatusText");
  if (icon1) icon1.classList.add("fa-spin");
  if (icon2) icon2.classList.add("fa-spin");
  if (statusEl) statusEl.textContent = dict.sync_status_fetching;

  const baseCurr = (appState.settings.currency || "USD").toUpperCase();
  const baseLower = baseCurr.toLowerCase();

  try {
    let usdInBase = null;
    let eurInBase = null;
    let goldGramInBase = null;

    // 1. Primary Exchange Rate Source: Fawazahmed0 Currency API via jsDelivr CDN (includes fiat + XAU spot)
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${baseLower}.json`);
      if (res.ok) {
        const json = await res.json();
        const ratesObj = json[baseLower];
        if (ratesObj) {
          if (ratesObj.usd && ratesObj.usd > 0) usdInBase = 1 / ratesObj.usd;
          if (ratesObj.eur && ratesObj.eur > 0) eurInBase = 1 / ratesObj.eur;
          if (ratesObj.xau && ratesObj.xau > 0) {
            const xauInBase = 1 / ratesObj.xau;
            goldGramInBase = xauInBase / TROY_OUNCE_GRAMS;
          }
        }
      }
    } catch (e) {
      console.warn("Primary CDN currency API fallback:", e);
    }

    // 2. Fallback Exchange Rate Source: Open ExchangeRate-API
    if (!usdInBase || !eurInBase) {
      try {
        const res2 = await fetch(`https://open.er-api.com/v6/latest/USD`);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2 && data2.rates && data2.rates[baseCurr]) {
            const usdToBase = Number(data2.rates[baseCurr]);
            const usdToEur = Number(data2.rates.EUR || 0.92);
            usdInBase = usdToBase;
            eurInBase = usdToBase / usdToEur;
          }
        }
      } catch (e) {
        console.warn("Secondary ExchangeRate-API fallback:", e);
      }
    }

    // 3. Dedicated Spot Gold Price API (XAU/USD) for accurate live 24k Gold gram pricing
    try {
      const goldRes = await fetch("https://api.gold-api.com/price/XAU");
      if (goldRes.ok) {
        const goldData = await goldRes.json();
        if (goldData && goldData.price && usdInBase) {
          const xauUsd = Number(goldData.price);
          goldGramInBase = (xauUsd * usdInBase) / TROY_OUNCE_GRAMS;
        }
      }
    } catch (e) {
      console.warn("Spot gold API fallback:", e);
    }

    if (usdInBase && usdInBase > 0) appState.rates.usd = usdInBase < 1 ? Number(usdInBase.toFixed(3)) : Number(usdInBase.toFixed(2));
    if (eurInBase && eurInBase > 0) appState.rates.eur = eurInBase < 1 ? Number(eurInBase.toFixed(3)) : Number(eurInBase.toFixed(2));
    if (goldGramInBase && goldGramInBase > 0) {
      appState.rates.gold = (baseCurr === "USD" || baseCurr === "EUR" || goldGramInBase < 1000) ? Number(goldGramInBase.toFixed(2)) : Math.round(goldGramInBase);
    }

    const now = new Date();
    const todayStr = getLocalTodayStr(now);
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    appState.rates.lastSyncDate = todayStr;
    appState.rates.lastSyncTime = `${todayStr} (${timeStr})`;

    await persistState();
    renderAll();
    if (isManual) showToast(dict.sync_status_success, "success");
  } catch (err) {
    console.warn("Live rate sync failed:", err);
    if (isManual) showToast(dict.sync_status_offline, "error");
  } finally {
    isSyncingRates = false;
    if (icon1) icon1.classList.remove("fa-spin");
    if (icon2) icon2.classList.remove("fa-spin");
  }
}

function checkAndRunDailyAutoSync() {
  if (appState.settings.autoSyncRates === false) return;
  const todayStr = getLocalTodayStr();
  if (appState.rates.lastSyncDate !== todayStr) {
    fetchLiveMarketRates(false);
  }
}

// Event Listeners & Modal Controllers
document.addEventListener("DOMContentLoaded", async () => {
  appState = await loadStoredState();

  if (appState.settings.autoSyncRates === undefined) {
    appState.settings.autoSyncRates = true;
  }
  updateLanguageUI();
  renderAll();

  // Privacy Mode Toggle Listener
  document.getElementById("btnTogglePrivacy")?.addEventListener("click", async () => {
    appState.settings.privacyMode = !appState.settings.privacyMode;
    await persistState();
    updatePrivacyUI();
    renderAll();
  });

  // App PIN Lock & Security System
  function checkPinSecurityOnStartup() {
    const isPinActive = Boolean(appState?.settings?.pinEnabled && appState?.settings?.pinCode);
    const quickLockBtn = document.getElementById("btnQuickLock");
    if (quickLockBtn) {
      if (isPinActive) quickLockBtn.classList.remove("hidden");
      else quickLockBtn.classList.add("hidden");
    }

    const pinToggle = document.getElementById("pinLockEnabledToggle");
    const pinBox = document.getElementById("pinSettingsBox");
    const pinInp = document.getElementById("inputSettingsPin");
    if (pinToggle) pinToggle.checked = Boolean(appState?.settings?.pinEnabled);
    if (pinBox) {
      if (appState?.settings?.pinEnabled) pinBox.classList.remove("hidden");
      else pinBox.classList.add("hidden");
    }
    if (pinInp) {
      pinInp.value = "";
      pinInp.placeholder = appState?.settings?.pinEnabled ? ((i18n[appState?.settings?.lang] || i18n.en).pin_protected_placeholder || tr("•••• (محمي)", "•••• (Protected)", "•••• (Protegido)")) : "••••";
    }

    const isUnlocked = sessionStorage.getItem("puretech_unlocked") === "true";
    const lockScreen = document.getElementById("pinLockScreen");
    if (isPinActive && !isUnlocked) {
      if (lockScreen) {
        lockScreen.classList.remove("hidden");
        document.getElementById("pinUnlockInput")?.focus();
      }
    } else {
      if (lockScreen) lockScreen.classList.add("hidden");
    }
  }

  checkPinSecurityOnStartup();

  document.getElementById("pinUnlockForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const entered = (document.getElementById("pinUnlockInput")?.value || "").trim();
    const errorMsg = document.getElementById("pinErrorMsg");
    const enteredHash = typeof hashPinCode === "function" ? await hashPinCode(entered) : entered;
    const storedPin = String(appState?.settings?.pinCode || "");
    if (entered === storedPin || (enteredHash && enteredHash === storedPin)) {
      sessionStorage.setItem("puretech_unlocked", "true");
      document.getElementById("pinLockScreen")?.classList.add("hidden");
      if (errorMsg) errorMsg.classList.add("hidden");
      document.getElementById("pinUnlockInput").value = "";
    } else {
      if (errorMsg) errorMsg.classList.remove("hidden");
      const inp = document.getElementById("pinUnlockInput");
      if (inp) {
        inp.value = "";
        inp.focus();
      }
    }
  });

  document.getElementById("btnForgotPin")?.addEventListener("click", async () => {
    const lang = appState?.settings?.lang || "ar";
    const dict = i18n[lang] || i18n.en;
    const confirmed = await requestConfirmation(
      dict.confirm_reset_pin_title || "Reset Wallet Lock",
      dict.confirm_reset_pin_msg || "Forgot your PIN? This will disable the PIN lock and restore wallet access. Proceed?"
    );
    if (confirmed) {
      const currentLang = appState?.settings?.lang || detectInitialLanguage();
      const currentCurrency = appState?.settings?.currency || "USD";
      appState = getDefaultCleanState();
      appState.settings.lang = currentLang;
      appState.settings.currency = currentCurrency;
      appState.settings.pinEnabled = false;
      appState.settings.pinCode = "";
      sessionStorage.setItem("puretech_unlocked", "true");
      document.getElementById("pinLockScreen")?.classList.add("hidden");
      const pinInp = document.getElementById("pinUnlockInput");
      if (pinInp) pinInp.value = "";
      document.getElementById("pinErrorMsg")?.classList.add("hidden");
      checkPinSecurityOnStartup();
      await persistState();
      updateLanguageUI();
      renderAll();
      showToast(dict.pin_disabled || 'PIN lock disabled');
    }
  });

  function lockWalletNow() {
    sessionStorage.removeItem("puretech_unlocked");
    const lockScreen = document.getElementById("pinLockScreen");
    const errorMsg = document.getElementById("pinErrorMsg");
    const inp = document.getElementById("pinUnlockInput");
    if (errorMsg) errorMsg.classList.add("hidden");
    if (inp) inp.value = "";
    if (lockScreen) lockScreen.classList.remove("hidden");
    if (inp) inp.focus();
    const lang = appState?.settings?.lang || "ar";
    showToast(tr('تم قفل المحفظة', 'Wallet locked', 'Billetera bloqueada'), 'info');
  }

  document.getElementById("btnQuickLock")?.addEventListener("click", lockWalletNow);
  document.getElementById("btnManualLock")?.addEventListener("click", lockWalletNow);

  document.getElementById("pinLockEnabledToggle")?.addEventListener("change", async (e) => {
    const isChecked = e.target.checked;
    const pinBox = document.getElementById("pinSettingsBox");
    const lang = appState?.settings?.lang || "ar";
    const dict = i18n[lang] || i18n.en;

    if (isChecked) {
      if (pinBox) pinBox.classList.remove("hidden");
      document.getElementById("inputSettingsPin")?.focus();
    } else {
      appState.settings.pinEnabled = false;
      appState.settings.pinCode = "";
      if (pinBox) pinBox.classList.add("hidden");
      document.getElementById("btnQuickLock")?.classList.add("hidden");
      document.getElementById("inputSettingsPin").value = "";
      await persistState();
      showToast(dict.pin_disabled || 'PIN lock disabled');
    }
  });

  document.getElementById("btnSavePin")?.addEventListener("click", async () => {
    const pinVal = (document.getElementById("inputSettingsPin")?.value || "").trim();
    const lang = appState?.settings?.lang || "ar";
    const dict = i18n[lang] || i18n.en;

    if (!/^\d{4}$/.test(pinVal)) {
      showToast(tr('يرجى إدخال رمز PIN مكون من 4 أرقام عددية', 'Please enter a 4-digit numeric PIN', 'Ingrese un código PIN de 4 dígitos numéricos'), 'error');
      return;
    }

    appState.settings.pinEnabled = true;
    appState.settings.pinCode = typeof hashPinCode === "function" ? await hashPinCode(pinVal) : pinVal;
    sessionStorage.setItem("puretech_unlocked", "true");
    const pinInp = document.getElementById("inputSettingsPin");
    if (pinInp) {
      pinInp.value = "";
      pinInp.placeholder = dict.pin_protected_placeholder || tr("•••• (محمي)", "•••• (Protected)", "•••• (Protegido)");
    }
    document.getElementById("btnQuickLock")?.classList.remove("hidden");
    await persistState();
    showToast(dict.pin_saved || 'PIN code saved');
  });

  // Trigger automatic daily rate check on launch & every 6 hours
  checkAndRunDailyAutoSync();
  setInterval(checkAndRunDailyAutoSync, 6 * 60 * 60 * 1000);

  const today = getLocalTodayStr();
  document.getElementById("txDateInput").value = today;
  document.getElementById("creatorTxDateInput").value = today;
  document.getElementById("flTxDateInput").value = today;

  document.querySelectorAll(".nav-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const targetTabId = tabBtn.getAttribute("data-tab");
      document.querySelectorAll(".nav-tab").forEach(b => {
        b.classList.remove("active", "bg-brand-500/15", "text-brand-400", "border-brand-500/30");
        b.classList.add("text-slate-400", "border-transparent");
      });
      tabBtn.classList.add("active", "bg-brand-500/15", "text-brand-400", "border-brand-500/30");
      tabBtn.classList.remove("text-slate-400", "border-transparent");

      document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.add("hidden");
      });
      document.getElementById(targetTabId)?.classList.remove("hidden");

      if (targetTabId === "tab-overview") {
        setTimeout(() => {
          wealthChart?.resize();
          pillarsChart?.resize();
          trendsChart?.resize();
        }, 50);
      }
    });
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetLang = btn.getAttribute("data-lang");
      appState.settings.lang = targetLang;
      if (typeof syncDefaultLocalizedStrings === "function") {
        syncDefaultLocalizedStrings(appState, targetLang);
      }
      persistState();
      updateLanguageUI();
      renderAll();
      showToast(targetLang === 'ar' ? 'تم التبديل إلى اللغة العربية' : targetLang === 'es' ? 'Cambiado a Español' : 'Switched to English');
    });
  });

  const FALLBACK_RATES_BY_CURRENCY = {
    USD: { usd: 1.00, eur: 1.08, gold: 85.50 },
    EUR: { usd: 0.92, eur: 1.00, gold: 79.00 },
    EGP: { usd: 48.50, eur: 52.20, gold: 3750 },
    SAR: { usd: 3.75, eur: 4.05, gold: 320.50 },
    AED: { usd: 3.67, eur: 3.97, gold: 314.00 },
    KWD: { usd: 0.307, eur: 0.332, gold: 26.25 },
    QAR: { usd: 3.64, eur: 3.93, gold: 311.50 },
    OMR: { usd: 0.385, eur: 0.416, gold: 32.90 },
    TND: { usd: 3.10, eur: 3.35, gold: 265.00 },
    MAD: { usd: 9.95, eur: 10.75, gold: 850.00 },
    TRY: { usd: 34.20, eur: 36.90, gold: 2925 },
    GEL: { usd: 2.72, eur: 2.94, gold: 232.50 }
  };

  document.getElementById("currencySelect").addEventListener("change", async (e) => {
    const oldCurr = appState.settings.currency || "USD";
    const newCurr = e.target.value;
    if (oldCurr === newCurr) return;

    const oldUsdRate = Number(appState.rates.usd) || (FALLBACK_RATES_BY_CURRENCY[oldCurr]?.usd) || 1;

    const hasExistingRecords = (
      appState.personalIncomes.length > 0 ||
      appState.personalObligations.length > 0 ||
      appState.assets.length > 0 ||
      appState.creatorTransactions.length > 0 ||
      appState.freelanceTransactions.length > 0
    );

    let shouldConvert = false;
    if (hasExistingRecords) {
      const lang = appState.settings.lang || "ar";
      const dict = i18n[lang] || i18n.en;
      const titleMsg = dict.convert_currency_title || "Convert Existing Amounts";
      const bodyMsg = (dict.convert_currency_msg || "Convert all logged transactions and assets from ({old}) to ({new})?")
        .replace("{old}", oldCurr)
        .replace("{new}", newCurr);
      shouldConvert = await requestConfirmation(titleMsg, bodyMsg);
    }

    appState.settings.currency = newCurr;
    if (FALLBACK_RATES_BY_CURRENCY[newCurr]) {
      appState.rates.usd = FALLBACK_RATES_BY_CURRENCY[newCurr].usd;
      appState.rates.eur = FALLBACK_RATES_BY_CURRENCY[newCurr].eur;
      appState.rates.gold = FALLBACK_RATES_BY_CURRENCY[newCurr].gold;
    }

    // Fetch live market rates first (when online) so conversion uses accurate live exchange rates
    if (navigator.onLine && appState.settings.autoSyncRates !== false) {
      await fetchLiveMarketRates(false);
    }

    const newUsdRate = Number(appState.rates.usd) || (FALLBACK_RATES_BY_CURRENCY[newCurr]?.usd) || 1;
    const conversionFactor = newUsdRate / oldUsdRate;

    if (shouldConvert && Math.abs(conversionFactor - 1) > 0.0001) {
      const scaleVal = (v) => Number((Number(v || 0) * conversionFactor).toFixed(2));
      const scaleTxList = (list) => {
        list.forEach(tx => {
          const origCurr = tx.currency || oldCurr;
          const origForeignAmt = tx.foreignAmount ? Number(tx.foreignAmount) : ((origCurr === "USD" || origCurr === "EUR") ? Number(tx.amount) : null);

          if ((origCurr === "USD" || origCurr === "EUR") && origForeignAmt) {
            if (newCurr === origCurr) {
              // Target base currency matches the original foreign currency
              tx.amount = Number(origForeignAmt.toFixed(2));
              tx.currency = newCurr;
              tx.foreignAmount = null;
              tx.exchangeRate = 1;
            } else {
              // Convert from original USD/EUR into the new base currency
              const targetRate = origCurr === "USD" ? (Number(appState.rates.usd) || 1) : (Number(appState.rates.eur) || 1);
              tx.currency = origCurr;
              tx.foreignAmount = origForeignAmt;
              tx.exchangeRate = targetRate;
              tx.amount = Number((origForeignAmt * targetRate).toFixed(2));
            }
          } else {
            tx.amount = scaleVal(tx.amount);
            tx.currency = newCurr;
            tx.foreignAmount = null;
            tx.exchangeRate = 1;
          }
        });
      };
      scaleTxList(appState.personalIncomes);
      scaleTxList(appState.personalObligations);
      scaleTxList(appState.creatorTransactions);
      scaleTxList(appState.freelanceTransactions);

      appState.assets.forEach(ast => {
        if (ast.category === "usd") {
          ast.unitPrice = appState.rates.usd;
        } else if (ast.category === "eur") {
          ast.unitPrice = appState.rates.eur;
        } else if (ast.category === "gold") {
          ast.unitPrice = getCalculatedGoldRate(ast.karat || "24k");
        } else {
          ast.unitPrice = scaleVal(ast.unitPrice);
        }
        if (ast.purchasePrice !== undefined && ast.purchasePrice !== null && ast.purchasePrice !== "") {
          ast.purchasePrice = scaleVal(ast.purchasePrice);
        }
      });

      if (appState.monthlyBudget && appState.monthlyBudget.amount > 0) {
        appState.monthlyBudget.amount = scaleVal(appState.monthlyBudget.amount);
      }
    }

    await persistState();
    updateLanguageUI();
    renderAll();
    showToast(`${appState.settings.currency} ${tr('تم تحديث العملة الأساسية', 'Currency Updated', 'Moneda actualizada')}`);
  });

  document.getElementById("includeOnlineToggle").addEventListener("change", (e) => {
    appState.settings.includeOnline = e.target.checked;
    persistState();
    renderAll();
    showToast(appState.settings.includeOnline 
      ? tr('تم دمج أرباح العمل أونلاين بالسيولة', 'Online earnings merged into liquidity', 'Ganancias online integradas en la liquidez')
      : tr('تم فصل أرباح العمل أونلاين', 'Online earnings decoupled', 'Ganancias online desvinculadas')
    );
  });

  const onRateChange = () => {
    appState.rates.usd = Math.max(0, parseFloat(document.getElementById("rateInputUsd").value) || 0);
    appState.rates.eur = Math.max(0, parseFloat(document.getElementById("rateInputEur").value) || 0);
    appState.rates.gold = Math.max(0, parseFloat(document.getElementById("rateInputGold").value) || 0);
    persistState();
    renderAll();
  };
  document.getElementById("rateInputUsd").addEventListener("input", onRateChange);
  document.getElementById("rateInputEur").addEventListener("input", onRateChange);
  document.getElementById("rateInputGold").addEventListener("input", onRateChange);

  // Live Rate Sync Buttons & Auto-Sync Toggle
  document.getElementById("btnSyncRatesNow")?.addEventListener("click", () => fetchLiveMarketRates(true));
  document.getElementById("btnQuickSyncHeader")?.addEventListener("click", () => fetchLiveMarketRates(true));
  document.getElementById("autoSyncRatesToggle")?.addEventListener("change", (e) => {
    appState.settings.autoSyncRates = e.target.checked;
    persistState();
    if (e.target.checked) fetchLiveMarketRates(true);
  });

  document.getElementById("btnSaveRole").addEventListener("click", () => {
    appState.settings.freelanceRole = document.getElementById("freelanceRoleInput").value.trim();
    persistState();
    showToast(tr('تم حفظ المسمى الوظيفي', 'Role title saved', 'Título profesional guardado'));
  });

  document.getElementById("btnAddIncomeCat").addEventListener("click", () => {
    const inp = document.getElementById("newIncomeCatInput");
    const val = inp.value.trim();
    if (val && !appState.freelanceCats.income.includes(val)) {
      appState.freelanceCats.income.push(val);
      inp.value = "";
      persistState();
      renderAll();
      showToast(tr('تمت إضافة التصنيف', 'Category added', 'Categoría agregada'));
    }
  });
  document.getElementById("btnAddExpenseCat").addEventListener("click", () => {
    const inp = document.getElementById("newExpenseCatInput");
    const val = inp.value.trim();
    if (val && !appState.freelanceCats.expense.includes(val)) {
      appState.freelanceCats.expense.push(val);
      inp.value = "";
      persistState();
      renderAll();
      showToast(tr('تمت إضافة التصنيف', 'Category added', 'Categoría agregada'));
    }
  });

  document.getElementById("channelFilterSelect").addEventListener("change", () => {
    paginationState.creatorTxPage = 1;
    renderAll();
  });

  const onIncomesSearch = debounce(() => {
    paginationState.incomesPage = 1;
    renderAll();
  }, 180);
  document.getElementById("searchIncomesInput")?.addEventListener("input", onIncomesSearch);

  const onObligationsSearch = debounce(() => {
    paginationState.obligationsPage = 1;
    renderAll();
  }, 180);
  document.getElementById("searchObligationsInput")?.addEventListener("input", onObligationsSearch);

  const onAssetsSearch = debounce(() => {
    paginationState.assetsPage = 1;
    renderAll();
  }, 180);
  document.getElementById("searchAssetsInput")?.addEventListener("input", onAssetsSearch);

  const onCreatorTxSearch = debounce(() => {
    paginationState.creatorTxPage = 1;
    renderAll();
  }, 180);
  document.getElementById("searchCreatorTxInput")?.addEventListener("input", onCreatorTxSearch);

  const onFreelanceTxSearch = debounce(() => {
    paginationState.freelanceTxPage = 1;
    renderAll();
  }, 180);
  document.getElementById("searchFreelanceTxInput")?.addEventListener("input", onFreelanceTxSearch);

  document.getElementById("btnAddPersonalIncomeCatDirect")?.addEventListener("click", () => {
    const inp = document.getElementById("newPersonalIncomeCatDirectInput");
    const val = inp?.value.trim();
    if (!appState.customPersonalCats) appState.customPersonalCats = { income: [], expense: [] };
    if (val && !appState.customPersonalCats.income.includes(val)) {
      appState.customPersonalCats.income.push(val);
      inp.value = "";
      persistState();
      renderAll();
      showToast(tr('تمت إضافة التصنيف الشخصي', 'Custom category added', 'Categoría personalizada agregada'));
    }
  });

  document.getElementById("btnAddPersonalExpenseCatDirect")?.addEventListener("click", () => {
    const inp = document.getElementById("newPersonalExpenseCatDirectInput");
    const val = inp?.value.trim();
    if (!appState.customPersonalCats) appState.customPersonalCats = { income: [], expense: [] };
    if (val && !appState.customPersonalCats.expense.includes(val)) {
      appState.customPersonalCats.expense.push(val);
      inp.value = "";
      persistState();
      renderAll();
      showToast(tr('تمت إضافة التصنيف الشخصي', 'Custom category added', 'Categoría personalizada agregada'));
    }
  });

  document.getElementById("cashflowPeriodSelect")?.addEventListener("change", (e) => {
    paginationState.selectedPeriod = e.target.value;
    paginationState.incomesPage = 1;
    paginationState.obligationsPage = 1;
    paginationState.creatorTxPage = 1;
    paginationState.freelanceTxPage = 1;
    renderAll();
  });

  // Modal Backdrop click dismissal
  document.querySelectorAll(".fixed").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (modal.id === "pinLockScreen") return;
      if (e.target === modal) {
        if (modal.id === "confirmModal" && typeof activeConfirmCleanup === "function") {
          activeConfirmCleanup(false);
        } else {
          modal.classList.add("hidden");
        }
      }
    });
  });

  // Global Escape key listener to dismiss open dialogs
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".fixed:not(.hidden)").forEach(modal => {
        if (modal.id === "pinLockScreen") return;
        if (modal.id === "confirmModal" && typeof activeConfirmCleanup === "function") {
          activeConfirmCleanup(false);
        } else {
          modal.classList.add("hidden");
        }
      });
    }
  });

  document.querySelectorAll(".close-modal").forEach(btn => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".fixed");
      if (modal?.id === "confirmModal" && typeof activeConfirmCleanup === "function") {
        activeConfirmCleanup(false);
      } else if (modal) {
        modal.classList.add("hidden");
      }
    });
  });

  // Delegated click handler for safe category removal without inline string escaping issues
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-fl-cat");
    if (!btn) return;
    const type = btn.getAttribute("data-cat-type");
    const idx = parseInt(btn.getAttribute("data-cat-idx"), 10);
    if (type && !isNaN(idx) && appState.freelanceCats[type] && appState.freelanceCats[type][idx]) {
      appState.freelanceCats[type].splice(idx, 1);
      persistState();
      renderAll();
      showToast(tr('تم حذف التصنيف', 'Category removed', 'Categoría eliminada'));
    }
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-personal-cat");
    if (!btn) return;
    const type = btn.getAttribute("data-pcat-type");
    const idx = parseInt(btn.getAttribute("data-pcat-idx"), 10);
    if (type && !isNaN(idx) && appState.customPersonalCats?.[type]?.[idx]) {
      appState.customPersonalCats[type].splice(idx, 1);
      persistState();
      renderAll();
      showToast(tr('تم حذف التصنيف المخصص', 'Custom category removed', 'Categoría personalizada eliminada'));
    }
  });

  const txModal = document.getElementById("txModal");
  const txModalTitle = document.getElementById("txModalTitle");
  const txTypeInput = document.getElementById("txType");
  const txCatSelect = document.getElementById("txCategorySelect");

  function updateTxConversionPreview() {
    const currSelect = document.getElementById("txCurrencySelect");
    const amtInput = document.getElementById("txAmountInput");
    const infoBox = document.getElementById("txConversionInfo");
    const convertedVal = document.getElementById("txConvertedVal");
    if (!currSelect || !amtInput || !infoBox || !convertedVal) return;

    const curr = currSelect.value;
    const amt = parseFloat(amtInput.value);

    if (curr === "BASE" || curr === appState.settings.currency || isNaN(amt) || amt <= 0) {
      infoBox.classList.add("hidden");
      return;
    }

    const rate = curr === "USD" ? (Number(appState.rates.usd) || 1) : (Number(appState.rates.eur) || 1);
    const baseEq = amt * rate;
    convertedVal.textContent = `≈ ${baseEq.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${appState.settings.currency}`;
    infoBox.classList.remove("hidden");
  }

  document.getElementById("txAmountInput")?.addEventListener("input", updateTxConversionPreview);
  document.getElementById("txCurrencySelect")?.addEventListener("change", updateTxConversionPreview);

  function openTxModal(type) {
    txTypeInput.value = type;
    document.getElementById("txEditId").value = "";
    const lang = appState.settings.lang;
    const isIncome = type === "income";

    txModalTitle.textContent = isIncome 
      ? (lang === 'ar' ? 'إضافة مصدر دخل مالي' : lang === 'es' ? 'Agregar Fuente de Ingreso' : 'Add Financial Income')
      : (lang === 'ar' ? 'إضافة التزام مالي شهري' : lang === 'es' ? 'Agregar Obligación Mensual' : 'Add Monthly Obligation');

    populatePersonalCats(type);

    document.getElementById("txTitleInput").value = "";
    document.getElementById("txAmountInput").value = "";
    document.getElementById("txDateInput").value = getLocalTodayStr();
    const currSelect = document.getElementById("txCurrencySelect");
    if (currSelect) currSelect.value = "BASE";
    document.getElementById("txConversionInfo")?.classList.add("hidden");
    document.getElementById("newPersonalCatBox")?.classList.add("hidden");
    txModal.classList.remove("hidden");
  }

  function populatePersonalCats(type, selectedVal = null) {
    const lang = appState.settings.lang;
    const isIncome = type === "income";
    const catSource = isIncome ? categoriesMap.personal_income : categoriesMap.personal_expense;
    const customList = (appState.customPersonalCats && appState.customPersonalCats[type]) || [];

    txCatSelect.innerHTML = "";
    Object.keys(catSource).forEach(k => {
      const opt = new Option(catSource[k][lang] || catSource[k].en, k);
      txCatSelect.add(opt);
    });

    if (customList.length > 0) {
      const group = document.createElement("optgroup");
      group.label = lang === "ar" ? "تصنيفات مخصصة" : lang === "es" ? "Personalizadas" : "Custom Categories";
      customList.forEach(c => {
        const opt = new Option(c, c);
        group.appendChild(opt);
      });
      txCatSelect.appendChild(group);
    }

    if (selectedVal) {
      if (![...txCatSelect.options].some(o => o.value === selectedVal)) {
        txCatSelect.add(new Option(selectedVal, selectedVal));
      }
      txCatSelect.value = selectedVal;
    }
  }

  window.openEditPersonalTxModal = function(type, id) {
    const isIncome = type === "income";
    const list = isIncome ? appState.personalIncomes : appState.personalObligations;
    const item = list.find(i => i.id === id);
    if (!item) return;

    const lang = appState.settings.lang;
    txTypeInput.value = type;
    document.getElementById("txEditId").value = item.id;

    txModalTitle.textContent = isIncome 
      ? (lang === 'ar' ? 'تعديل مصدر الدخل' : lang === 'es' ? 'Editar Ingreso' : 'Edit Income')
      : (lang === 'ar' ? 'تعديل الالتزام المالي' : lang === 'es' ? 'Editar Obligación' : 'Edit Obligation');

    populatePersonalCats(type, item.category);

    document.getElementById("txTitleInput").value = item.title;
    const currSelect = document.getElementById("txCurrencySelect");
    if ((item.currency === "USD" || item.currency === "EUR") && item.currency !== appState.settings.currency && item.foreignAmount) {
      if (currSelect) currSelect.value = item.currency;
      document.getElementById("txAmountInput").value = item.foreignAmount;
    } else {
      if (currSelect) currSelect.value = "BASE";
      document.getElementById("txAmountInput").value = item.amount;
    }
    updateTxConversionPreview();
    document.getElementById("txDateInput").value = item.date;
    document.getElementById("newPersonalCatBox")?.classList.add("hidden");
    txModal.classList.remove("hidden");
  };

  document.getElementById("btnToggleNewPersonalCat")?.addEventListener("click", () => {
    const box = document.getElementById("newPersonalCatBox");
    if (!box) return;
    box.classList.toggle("hidden");
    if (!box.classList.contains("hidden")) {
      document.getElementById("newPersonalCatInput")?.focus();
    }
  });

  document.getElementById("btnSavePersonalCat")?.addEventListener("click", () => {
    const inp = document.getElementById("newPersonalCatInput");
    const val = inp?.value.trim();
    const type = txTypeInput.value || "income";
    if (!appState.customPersonalCats) appState.customPersonalCats = { income: [], expense: [] };
    if (!appState.customPersonalCats[type]) appState.customPersonalCats[type] = [];

    if (val && !appState.customPersonalCats[type].includes(val)) {
      appState.customPersonalCats[type].push(val);
      persistState();
      populatePersonalCats(type, val);
      inp.value = "";
      document.getElementById("newPersonalCatBox")?.classList.add("hidden");
      showToast(tr('تمت إضافة التصنيف المخصص', 'Custom category added', 'Categoría personalizada agregada'));
    }
  });

  document.getElementById("btnOpenAddIncome").addEventListener("click", () => openTxModal("income"));
  document.getElementById("btnOpenAddExpense").addEventListener("click", () => openTxModal("expense"));

  document.getElementById("txForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = txTypeInput.value;
    const editId = document.getElementById("txEditId").value;
    const isIncome = type === "income";
    const title = document.getElementById("txTitleInput").value.trim();
    const rawAmount = parseFloat(document.getElementById("txAmountInput").value);
    const date = document.getElementById("txDateInput").value;
    const category = txCatSelect.value;
    const lang = appState.settings.lang;

    // Defensive input validation
    if (!title || isNaN(rawAmount) || rawAmount <= 0) {
      showToast(tr('يرجى إدخال وصف ومبلغ صحيح أكبر من الصفر', 'Please enter a valid title and amount greater than zero', 'Ingrese una descripción y un monto válidos mayores a cero'), 'error');
      return;
    }

    const currCode = document.getElementById("txCurrencySelect")?.value || "BASE";
    let finalBaseAmount = rawAmount;
    let currency = appState.settings.currency;
    let foreignAmount = null;
    let exchangeRate = 1;

    if (currCode === "USD" && appState.settings.currency !== "USD") {
      currency = "USD";
      exchangeRate = Number(appState.rates.usd) || 1;
      foreignAmount = rawAmount;
      finalBaseAmount = Number((rawAmount * exchangeRate).toFixed(2));
    } else if (currCode === "EUR" && appState.settings.currency !== "EUR") {
      currency = "EUR";
      exchangeRate = Number(appState.rates.eur) || 1;
      foreignAmount = rawAmount;
      finalBaseAmount = Number((rawAmount * exchangeRate).toFixed(2));
    }

    if (editId) {
      const list = isIncome ? appState.personalIncomes : appState.personalObligations;
      const item = list.find(i => i.id === editId);
      if (item) {
        item.title = title;
        item.amount = finalBaseAmount;
        item.date = date;
        item.category = category;
        item.currency = currency;
        item.foreignAmount = foreignAmount;
        item.exchangeRate = exchangeRate;
      }
      showToast(tr('تم تعديل المعاملة بنجاح', 'Transaction updated', 'Transacción actualizada con éxito'));
    } else {
      const item = {
        id: generateUniqueId(isIncome ? 'inc' : 'exp'),
        title,
        amount: finalBaseAmount,
        date,
        category,
        currency,
        foreignAmount,
        exchangeRate
      };
      if (isIncome) {
        appState.personalIncomes.unshift(item);
        paginationState.incomesPage = 1;
      } else {
        appState.personalObligations.unshift(item);
        paginationState.obligationsPage = 1;
      }
      showToast(tr('تم تسجيل المعاملة بنجاح', 'Transaction saved', 'Transacción guardada con éxito'));
    }

    appState.personalIncomes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    appState.personalObligations.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    await persistState();
    trackOperationAndRemind();
    txModal.classList.add("hidden");
    renderAll();
  });

  const assetModal = document.getElementById("assetModal");
  const assetCatSelect = document.getElementById("assetCategorySelect");
  const assetUnitPriceInput = document.getElementById("assetUnitPriceInput");
  const goldKaratBox = document.getElementById("goldKaratBox");
  const assetGoldKaratSelect = document.getElementById("assetGoldKaratSelect");
  const assetPurchasePriceInput = document.getElementById("assetPurchasePriceInput");

  // Uses global getCalculatedGoldRate(karat)

  window.openEditAssetModal = function(id) {
    const ast = appState.assets.find(a => a.id === id);
    if (!ast) return;
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("assetModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_asset_edit || (lang === 'ar' ? 'تعديل الأصل' : 'Edit Asset');

    document.getElementById("assetEditId").value = ast.id;
    document.getElementById("assetNameInput").value = ast.name || "";
    assetCatSelect.value = ast.category || "usd";
    document.getElementById("assetQtyInput").value = ast.quantity;

    if (ast.category === "gold") {
      goldKaratBox?.classList.remove("hidden");
      if (assetGoldKaratSelect) assetGoldKaratSelect.value = ast.karat || "24k";
      assetUnitPriceInput.value = getCalculatedGoldRate(ast.karat || "24k");
    } else if (ast.category === "usd") {
      goldKaratBox?.classList.add("hidden");
      assetUnitPriceInput.value = appState.rates.usd;
    } else if (ast.category === "eur") {
      goldKaratBox?.classList.add("hidden");
      assetUnitPriceInput.value = appState.rates.eur;
    } else {
      goldKaratBox?.classList.add("hidden");
      assetUnitPriceInput.value = ast.unitPrice;
    }

    if (assetPurchasePriceInput) {
      assetPurchasePriceInput.value = (ast.purchasePrice !== undefined && ast.purchasePrice !== null) ? ast.purchasePrice : (ast.unitPrice || "");
    }

    assetModal.classList.remove("hidden");
    document.getElementById("assetNameInput")?.focus();
  };

  document.getElementById("btnOpenAddAsset").addEventListener("click", () => {
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("assetModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_asset_title || (lang === 'ar' ? 'تسجيل أصل استثماري' : 'Register Asset');

    document.getElementById("assetEditId").value = "";
    document.getElementById("assetNameInput").value = "";
    document.getElementById("assetQtyInput").value = "";
    assetCatSelect.value = "usd";
    goldKaratBox?.classList.add("hidden");
    assetUnitPriceInput.value = appState.rates.usd;
    if (assetPurchasePriceInput) assetPurchasePriceInput.value = "";
    assetModal.classList.remove("hidden");
    document.getElementById("assetNameInput")?.focus();
  });

  assetCatSelect.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "usd") {
      goldKaratBox?.classList.add("hidden");
      assetUnitPriceInput.value = appState.rates.usd;
    } else if (val === "eur") {
      goldKaratBox?.classList.add("hidden");
      assetUnitPriceInput.value = appState.rates.eur;
    } else if (val === "gold") {
      goldKaratBox?.classList.remove("hidden");
      const karat = assetGoldKaratSelect?.value || "21k";
      if (assetGoldKaratSelect) assetGoldKaratSelect.value = karat;
      assetUnitPriceInput.value = getCalculatedGoldRate(karat);
    } else {
      goldKaratBox?.classList.add("hidden");
      assetUnitPriceInput.value = "";
    }
  });

  assetGoldKaratSelect?.addEventListener("change", (e) => {
    assetUnitPriceInput.value = getCalculatedGoldRate(e.target.value);
  });

  document.getElementById("assetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("assetEditId").value;
    const name = document.getElementById("assetNameInput").value.trim();
    const category = assetCatSelect.value;
    const quantity = parseFloat(document.getElementById("assetQtyInput").value);
    const unitPrice = parseFloat(assetUnitPriceInput.value);
    const karat = category === "gold" ? (assetGoldKaratSelect?.value || "24k") : undefined;
    const rawPurchasePrice = parseFloat(assetPurchasePriceInput?.value);
    const purchasePrice = (!isNaN(rawPurchasePrice) && rawPurchasePrice >= 0) ? rawPurchasePrice : unitPrice;
    const lang = appState.settings.lang;

    // Defensive validation
    if (!name || isNaN(quantity) || quantity <= 0 || isNaN(unitPrice) || unitPrice < 0) {
      showToast(tr('يرجى إدخال اسم الأصل وكمية وسعر صحيحين (الكمية أكبر من الصفر)', 'Please enter valid asset details (quantity must be > 0)', 'Ingrese detalles válidos del activo (la cantidad debe ser > 0)'), 'error');
      return;
    }

    if (editId) {
      const ast = appState.assets.find(a => a.id === editId);
      if (ast) {
        ast.name = name;
        ast.category = category;
        ast.quantity = quantity;
        ast.unitPrice = unitPrice;
        ast.karat = karat;
        ast.purchasePrice = purchasePrice;
      }
      showToast((i18n[lang] || i18n.en).asset_updated || tr('تم تعديل الأصل بنجاح', 'Asset updated', 'Activo actualizado con éxito'));
    } else {
      const item = {
        id: generateUniqueId('ast'),
        name,
        category,
        quantity,
        unitPrice,
        karat,
        purchasePrice
      };
      appState.assets.push(item);
      paginationState.assetsPage = 1;
      showToast(tr('تم تسجيل الأصل وحساب صافي الثروة والعائد', 'Asset added & Net Worth recalculated', 'Activo registrado y patrimonio recalculado'));
    }

    await persistState();
    trackOperationAndRemind();
    assetModal.classList.add("hidden");
    renderAll();
  });

  const channelModal = document.getElementById("channelModal");
  
  window.openEditChannelModal = function(id) {
    const chn = appState.channels.find(c => c.id === id);
    if (!chn) return;
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("channelModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_channel_edit || (lang === 'ar' ? 'تعديل بيانات القناة' : 'Edit Channel');

    document.getElementById("channelEditId").value = chn.id;
    document.getElementById("channelPlatformSelect").value = chn.platform;
    document.getElementById("channelNameInput").value = chn.name;
    channelModal.classList.remove("hidden");
  };

  document.getElementById("btnOpenAddChannel").addEventListener("click", () => {
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("channelModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_channel_title || 'Add Creator Channel';

    document.getElementById("channelEditId").value = "";
    document.getElementById("channelNameInput").value = "";
    document.getElementById("channelPlatformSelect").value = "youtube";
    channelModal.classList.remove("hidden");
  });

  document.getElementById("channelForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("channelEditId").value;
    const platform = document.getElementById("channelPlatformSelect").value;
    const name = document.getElementById("channelNameInput").value.trim();
    const lang = appState.settings.lang;

    if (editId) {
      const chn = appState.channels.find(c => c.id === editId);
      if (chn) {
        chn.platform = platform;
        chn.name = name;
      }
      showToast((i18n[lang] || i18n.en).channel_updated || tr('تم تعديل بيانات القناة بنجاح', 'Channel updated', 'Canal actualizado con éxito'));
    } else {
      const chn = {
        id: generateUniqueId('chn'),
        platform,
        name
      };
      appState.channels.push(chn);
      showToast(tr('تم إنشاء القناة', 'Channel created', 'Canal creado con éxito'));
    }

    await persistState();
    trackOperationAndRemind();
    channelModal.classList.add("hidden");
    renderAll();
  });

  const creatorTxModal = document.getElementById("creatorTxModal");
  const creatorFlowSelect = document.getElementById("creatorTxFlowSelect");
  const creatorCatSelect = document.getElementById("creatorTxCatSelect");

  function updateCreatorTxConversionPreview() {
    const currSelect = document.getElementById("creatorTxCurrencySelect");
    const amtInput = document.getElementById("creatorTxAmountInput");
    const infoBox = document.getElementById("creatorConversionInfo");
    const convertedVal = document.getElementById("creatorConvertedVal");
    if (!currSelect || !amtInput || !infoBox || !convertedVal) return;

    const curr = currSelect.value;
    const amt = parseFloat(amtInput.value);

    if (curr === "BASE" || curr === appState.settings.currency || isNaN(amt) || amt <= 0) {
      infoBox.classList.add("hidden");
      return;
    }

    const rate = curr === "USD" ? (Number(appState.rates.usd) || 1) : (Number(appState.rates.eur) || 1);
    const baseEq = amt * rate;
    convertedVal.textContent = `≈ ${baseEq.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${appState.settings.currency}`;
    infoBox.classList.remove("hidden");
  }

  document.getElementById("creatorTxAmountInput")?.addEventListener("input", updateCreatorTxConversionPreview);
  document.getElementById("creatorTxCurrencySelect")?.addEventListener("change", updateCreatorTxConversionPreview);

  function populateCreatorCats() {
    const flow = creatorFlowSelect.value;
    const lang = appState.settings.lang;
    const source = flow === "revenue" ? categoriesMap.creator_revenue : categoriesMap.creator_expense;
    creatorCatSelect.innerHTML = Object.keys(source).map(k => `
      <option value="${k}">${source[k][lang] || source[k].en}</option>
    `).join("");
  }

  window.openEditCreatorTxModal = function(id) {
    const tx = appState.creatorTransactions.find(t => t.id === id);
    if (!tx) return;
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("creatorTxModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_creator_tx_edit || tr('تعديل معاملة القناة', 'Edit Channel Transaction', 'Editar Transacción de Canal');

    document.getElementById("creatorTxEditId").value = tx.id;
    document.getElementById("creatorTxChannelSelect").value = tx.channelId;
    creatorFlowSelect.value = tx.flow;
    populateCreatorCats();
    creatorCatSelect.value = tx.category;
    document.getElementById("creatorTxTitleInput").value = tx.title;
    const currSelect = document.getElementById("creatorTxCurrencySelect");
    if ((tx.currency === "USD" || tx.currency === "EUR") && tx.currency !== appState.settings.currency && tx.foreignAmount) {
      if (currSelect) currSelect.value = tx.currency;
      document.getElementById("creatorTxAmountInput").value = tx.foreignAmount;
    } else {
      if (currSelect) currSelect.value = "BASE";
      document.getElementById("creatorTxAmountInput").value = tx.amount;
    }
    updateCreatorTxConversionPreview();
    document.getElementById("creatorTxDateInput").value = tx.date;
    creatorTxModal.classList.remove("hidden");
  };

  document.getElementById("btnOpenAddCreatorTx").addEventListener("click", () => {
    if (appState.channels.length === 0) {
      showToast(tr('يرجى إنشاء قناة أولاً', 'Please add a channel first', 'Agregue un canal primero'), 'error');
      return;
    }
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("creatorTxModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_creator_tx_title || 'Log Channel Transaction';

    document.getElementById("creatorTxEditId").value = "";
    document.getElementById("creatorTxFlowSelect").value = "revenue";
    populateCreatorCats();
    document.getElementById("creatorTxTitleInput").value = "";
    document.getElementById("creatorTxAmountInput").value = "";
    const currSelect = document.getElementById("creatorTxCurrencySelect");
    if (currSelect) currSelect.value = "BASE";
    document.getElementById("creatorConversionInfo")?.classList.add("hidden");
    document.getElementById("creatorTxDateInput").value = getLocalTodayStr();
    creatorTxModal.classList.remove("hidden");
  });

  creatorFlowSelect.addEventListener("change", populateCreatorCats);

  document.getElementById("creatorTxForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("creatorTxEditId").value;
    const channelId = document.getElementById("creatorTxChannelSelect").value;
    const flow = creatorFlowSelect.value;
    const category = creatorCatSelect.value;
    const title = document.getElementById("creatorTxTitleInput").value.trim();
    const rawAmount = parseFloat(document.getElementById("creatorTxAmountInput").value);
    const date = document.getElementById("creatorTxDateInput").value;
    const lang = appState.settings.lang;

    // Defensive input validation
    if (!title || isNaN(rawAmount) || rawAmount <= 0) {
      showToast(tr('يرجى إدخال وصف ومبلغ صحيح أكبر من الصفر', 'Please enter a valid title and amount greater than zero', 'Ingrese una descripción y un monto válidos mayores a cero'), 'error');
      return;
    }

    const currCode = document.getElementById("creatorTxCurrencySelect")?.value || "BASE";
    let finalBaseAmount = rawAmount;
    let currency = appState.settings.currency;
    let foreignAmount = null;
    let exchangeRate = 1;

    if (currCode === "USD" && appState.settings.currency !== "USD") {
      currency = "USD";
      exchangeRate = Number(appState.rates.usd) || 1;
      foreignAmount = rawAmount;
      finalBaseAmount = Number((rawAmount * exchangeRate).toFixed(2));
    } else if (currCode === "EUR" && appState.settings.currency !== "EUR") {
      currency = "EUR";
      exchangeRate = Number(appState.rates.eur) || 1;
      foreignAmount = rawAmount;
      finalBaseAmount = Number((rawAmount * exchangeRate).toFixed(2));
    }

    if (editId) {
      const tx = appState.creatorTransactions.find(t => t.id === editId);
      if (tx) {
        tx.channelId = channelId;
        tx.flow = flow;
        tx.category = category;
        tx.title = title;
        tx.amount = finalBaseAmount;
        tx.date = date;
        tx.currency = currency;
        tx.foreignAmount = foreignAmount;
        tx.exchangeRate = exchangeRate;
      }
      showToast((i18n[lang] || i18n.en).creator_tx_updated || tr('تم تعديل المعاملة بنجاح', 'Transaction updated', 'Transacción actualizada con éxito'));
    } else {
      const tx = {
        id: generateUniqueId('ctx'),
        channelId,
        flow,
        category,
        title,
        amount: finalBaseAmount,
        date,
        currency,
        foreignAmount,
        exchangeRate
      };
      appState.creatorTransactions.unshift(tx);
      paginationState.creatorTxPage = 1;
      showToast(tr('تم تسجيل المعاملة بالقناة', 'Channel entry saved', 'Transacción registrada en el canal'));
    }

    appState.creatorTransactions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    await persistState();
    trackOperationAndRemind();
    creatorTxModal.classList.add("hidden");
    renderAll();
  });

  const flTxModal = document.getElementById("freelanceTxModal");
  const flFlowSelect = document.getElementById("flTxFlowSelect");
  const flCatSelect = document.getElementById("flTxCategorySelect");

  function updateFlTxConversionPreview() {
    const currSelect = document.getElementById("flTxCurrencySelect");
    const amtInput = document.getElementById("flTxAmountInput");
    const infoBox = document.getElementById("flConversionInfo");
    const convertedVal = document.getElementById("flConvertedVal");
    if (!currSelect || !amtInput || !infoBox || !convertedVal) return;

    const curr = currSelect.value;
    const amt = parseFloat(amtInput.value);

    if (curr === "BASE" || curr === appState.settings.currency || isNaN(amt) || amt <= 0) {
      infoBox.classList.add("hidden");
      return;
    }

    const rate = curr === "USD" ? (Number(appState.rates.usd) || 1) : (Number(appState.rates.eur) || 1);
    const baseEq = amt * rate;
    convertedVal.textContent = `≈ ${baseEq.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${appState.settings.currency}`;
    infoBox.classList.remove("hidden");
  }

  document.getElementById("flTxAmountInput")?.addEventListener("input", updateFlTxConversionPreview);
  document.getElementById("flTxCurrencySelect")?.addEventListener("change", updateFlTxConversionPreview);

  function populateFreelanceCats(selectedVal = null) {
    const flow = flFlowSelect.value;
    const list = (flow === "income" ? appState.freelanceCats.income : appState.freelanceCats.expense) || [];
    const fallbackLabel = tr('عام', 'General', 'General');
    const effectiveList = list.length > 0 ? list : [fallbackLabel];
    flCatSelect.innerHTML = "";
    effectiveList.forEach(c => {
      flCatSelect.add(new Option(c, c));
    });
    if (selectedVal) {
      if (![...flCatSelect.options].some(o => o.value === selectedVal)) {
        flCatSelect.add(new Option(selectedVal, selectedVal));
      }
      flCatSelect.value = selectedVal;
    }
  }

  window.openEditFreelanceTxModal = function(id) {
    const tx = appState.freelanceTransactions.find(t => t.id === id);
    if (!tx) return;
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("flTxModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_fl_tx_edit || tr('تعديل معاملة العمل الحر', 'Edit Freelance Transaction', 'Editar entrada de freelance');

    document.getElementById("flTxEditId").value = tx.id;
    flFlowSelect.value = tx.flow || "income";
    populateFreelanceCats(tx.category);
    document.getElementById("flTxTitleInput").value = tx.title || "";
    const currSelect = document.getElementById("flTxCurrencySelect");
    if ((tx.currency === "USD" || tx.currency === "EUR") && tx.currency !== appState.settings.currency && tx.foreignAmount) {
      if (currSelect) currSelect.value = tx.currency;
      document.getElementById("flTxAmountInput").value = tx.foreignAmount;
    } else {
      if (currSelect) currSelect.value = "BASE";
      document.getElementById("flTxAmountInput").value = tx.amount;
    }
    updateFlTxConversionPreview();
    document.getElementById("flTxDateInput").value = tx.date;
    flTxModal.classList.remove("hidden");
  };

  document.getElementById("btnOpenAddFreelanceTx").addEventListener("click", () => {
    const lang = appState.settings.lang;
    const titleEl = document.getElementById("flTxModalTitle");
    if (titleEl) titleEl.textContent = (i18n[lang] || i18n.en).modal_fl_tx_title || (lang === 'ar' ? 'تسجيل معاملة عمل حر' : 'Log Freelance Transaction');

    document.getElementById("flTxEditId").value = "";
    flFlowSelect.value = "income";
    populateFreelanceCats();
    document.getElementById("flTxTitleInput").value = "";
    document.getElementById("flTxAmountInput").value = "";
    const currSelect = document.getElementById("flTxCurrencySelect");
    if (currSelect) currSelect.value = "BASE";
    document.getElementById("flConversionInfo")?.classList.add("hidden");
    document.getElementById("flTxDateInput").value = getLocalTodayStr();
    flTxModal.classList.remove("hidden");
  });

  flFlowSelect.addEventListener("change", () => populateFreelanceCats());

  document.getElementById("freelanceTxForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("flTxEditId").value;
    const flow = flFlowSelect.value;
    const category = flCatSelect.value || tr("عام", "General", "General");
    const title = document.getElementById("flTxTitleInput").value.trim();
    const rawAmount = parseFloat(document.getElementById("flTxAmountInput").value);
    const date = document.getElementById("flTxDateInput").value;
    const lang = appState.settings.lang;

    // Defensive input validation
    if (!title || isNaN(rawAmount) || rawAmount <= 0) {
      showToast(tr('يرجى إدخال وصف ومبلغ صحيح أكبر من الصفر', 'Please enter a valid title and amount greater than zero', 'Ingrese una descripción y un monto válidos mayores a cero'), 'error');
      return;
    }

    const currCode = document.getElementById("flTxCurrencySelect")?.value || "BASE";
    let finalBaseAmount = rawAmount;
    let currency = appState.settings.currency;
    let foreignAmount = null;
    let exchangeRate = 1;

    if (currCode === "USD" && appState.settings.currency !== "USD") {
      currency = "USD";
      exchangeRate = Number(appState.rates.usd) || 1;
      foreignAmount = rawAmount;
      finalBaseAmount = Number((rawAmount * exchangeRate).toFixed(2));
    } else if (currCode === "EUR" && appState.settings.currency !== "EUR") {
      currency = "EUR";
      exchangeRate = Number(appState.rates.eur) || 1;
      foreignAmount = rawAmount;
      finalBaseAmount = Number((rawAmount * exchangeRate).toFixed(2));
    }

    if (editId) {
      const tx = appState.freelanceTransactions.find(t => t.id === editId);
      if (tx) {
        tx.flow = flow;
        tx.category = category;
        tx.title = title;
        tx.amount = finalBaseAmount;
        tx.date = date;
        tx.currency = currency;
        tx.foreignAmount = foreignAmount;
        tx.exchangeRate = exchangeRate;
      }
      showToast((i18n[lang] || i18n.en).fl_tx_updated || tr('تم تعديل معاملة العمل الحر بنجاح', 'Freelance transaction updated', 'Transacción freelance actualizada con éxito'));
    } else {
      const tx = {
        id: generateUniqueId('flx'),
        flow,
        category,
        title,
        amount: finalBaseAmount,
        date,
        currency,
        foreignAmount,
        exchangeRate
      };
      appState.freelanceTransactions.unshift(tx);
      paginationState.freelanceTxPage = 1;
      showToast(tr('تم تسجيل عملية العمل الحر', 'Freelance entry saved', 'Entrada de freelance guardada'));
    }

    appState.freelanceTransactions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    await persistState();
    trackOperationAndRemind();
    flTxModal.classList.add("hidden");
    renderAll();
  });

  // Monthly Budget Cap Handlers
  const budgetModal = document.getElementById("budgetModal");
  document.getElementById("btnSetBudget")?.addEventListener("click", () => {
    const budget = appState.monthlyBudget || { enabled: false, amount: 0 };
    document.getElementById("budgetLimitInput").value = budget.amount > 0 ? budget.amount : "";
    document.getElementById("budgetEnabledToggle").checked = budget.enabled !== false;
    budgetModal.classList.remove("hidden");
  });

  document.getElementById("budgetForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const limit = parseFloat(document.getElementById("budgetLimitInput").value) || 0;
    const enabled = document.getElementById("budgetEnabledToggle").checked;
    appState.monthlyBudget = {
      enabled: enabled && limit > 0,
      amount: limit
    };
    await persistState();
    budgetModal.classList.add("hidden");
    renderAll();
    showToast(tr('تم تحديث سقف الميزانية الشهرية', 'Monthly budget updated', 'Presupuesto mensual actualizado'));
  });

  // Quick Recurring Obligations Clone Handler
  document.getElementById("btnCloneRecurring")?.addEventListener("click", async () => {
    const lang = appState.settings.lang;
    const currentPeriod = paginationState.selectedPeriod === "all"
      ? getLocalTodayStr().slice(0, 7)
      : paginationState.selectedPeriod;

    // Find all distinct months available in personalObligations
    const availableMonths = Array.from(new Set(
      appState.personalObligations
        .map(o => (o.date ? o.date.slice(0, 7) : ""))
        .filter(m => m && m.length === 7)
    )).sort().reverse();

    // Prefer the most recent month strictly before the selected month
    let sourceMonth = availableMonths.find(m => m < currentPeriod);
    if (!sourceMonth && availableMonths.length > 0) {
      sourceMonth = availableMonths.find(m => m !== currentPeriod) || availableMonths[0];
    }

    if (!sourceMonth) {
      showToast(tr('لا توجد التزامات مسجلة في أشهر سابقة لنسخها', 'No previous monthly obligations found to clone', 'No se encontraron obligaciones mensuales previas para clonar'), 'info');
      return;
    }

    const existingInTarget = appState.personalObligations.filter(o => o.date && o.date.startsWith(currentPeriod));
    const prevItems = appState.personalObligations
      .filter(o => o.date && o.date.startsWith(sourceMonth))
      .filter(item => !existingInTarget.some(ex => ex.title === item.title && ex.category === item.category && Number(ex.amount) === Number(item.amount)));

    if (prevItems.length === 0) {
      showToast(tr('كافة التزامات الشهر السابق منسوخة بالفعل في هذا الشهر', 'All recurring obligations are already cloned into this month', 'Todas las obligaciones recurrentes ya están clonadas en este mes'), 'info');
      return;
    }

    const titleMsg = tr('استنساخ الالتزامات الشهرية', 'Clone Monthly Obligations', 'Clonar Obligaciones Mensuales');
    const textMsg = tr(
      `هل تريد استنساخ ${prevItems.length} التزام من شهر (${sourceMonth}) إلى شهر (${currentPeriod})؟`,
      `Clone ${prevItems.length} recurring obligations from (${sourceMonth}) into (${currentPeriod})?`,
      `¿Desea clonar ${prevItems.length} obligaciones recurrentes de (${sourceMonth}) a (${currentPeriod})?`
    );

    const ok = await requestConfirmation(titleMsg, textMsg);
    if (!ok) return;

    const [targetYear, targetMonth] = currentPeriod.split("-").map(Number);
    const maxDayInMonth = new Date(targetYear, targetMonth, 0).getDate();

    let clonedCount = 0;
    prevItems.forEach(item => {
      const rawDay = parseInt(item.date ? item.date.slice(8, 10) : "1", 10) || 1;
      const clampedDay = String(Math.min(Math.max(1, rawDay), maxDayInMonth)).padStart(2, "0");
      const newTx = {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: item.title,
        amount: item.amount,
        category: item.category,
        date: `${currentPeriod}-${clampedDay}`,
        currency: item.currency || appState.settings.currency,
        foreignAmount: item.foreignAmount || null,
        exchangeRate: item.exchangeRate || 1
      };
      appState.personalObligations.unshift(newTx);
      clonedCount++;
    });

    appState.personalObligations.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    paginationState.obligationsPage = 1;
    await persistState();
    trackOperationAndRemind();
    renderAll();
    showToast(tr(`تم استنساخ ${clonedCount} التزام بنجاح إلى شهر ${currentPeriod}`, `Cloned ${clonedCount} obligations to ${currentPeriod}`, `Se clonaron ${clonedCount} compromisos con éxito a ${currentPeriod}`));
  });

  document.getElementById("btnExportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PureTech_Wallet_Backup_${getLocalTodayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(tr('تم تحميل ملف النسخة الاحتياطية بنجاح', 'Backup JSON exported successfully', 'Copia de seguridad JSON descargada con éxito'));
  });

  document.getElementById("importJsonInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed && typeof parsed === "object" && (parsed.settings || parsed.personalIncomes)) {
          appState = typeof mergeWithDefaultState === "function" ? mergeWithDefaultState(parsed) : parsed;
          if (typeof ensureHashedPinState === "function") {
            appState = await ensureHashedPinState(appState);
          }
          await persistState();
          updateLanguageUI();
          renderAll();
          checkPinSecurityOnStartup();
          showToast(tr('تمت استعادة البيانات وتنقيتها بنجاح', 'Database restored and sanitized successfully', 'Base de datos restaurada y saneada con éxito'));
        } else {
          showToast("Invalid PureTech Wallet JSON format", "error");
        }
      } catch (err) {
        showToast("Failed to parse JSON file", "error");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("btnExportCsv").addEventListener("click", () => {
    // تعقيم الحقول لمنع ثغرة حقن صيغ الإكسيل (CSV Formula Injection)
    function sanitizeCsvCell(value) {
      if (value === null || value === undefined) return '""';
      let str = String(value);
      if (/^[=\+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    }

    let csvContent = "\uFEFF";
    csvContent += "Type,Category,Description/Name,BaseAmount,Date/Quantity,BaseCurrency,ForeignAmount,ForeignCurrency\n";

    sortByDateDesc(appState.personalIncomes).forEach(i => {
      const fAmt = (i.currency && i.currency !== appState.settings.currency && i.foreignAmount) ? i.foreignAmount : "";
      const fCurr = (i.currency && i.currency !== appState.settings.currency) ? i.currency : "";
      csvContent += `${sanitizeCsvCell("Personal Income")},${sanitizeCsvCell(i.category)},${sanitizeCsvCell(i.title)},${sanitizeCsvCell(i.amount)},${sanitizeCsvCell(i.date)},${sanitizeCsvCell(appState.settings.currency)},${sanitizeCsvCell(fAmt)},${sanitizeCsvCell(fCurr)}\n`;
    });
    sortByDateDesc(appState.personalObligations).forEach(o => {
      const fAmt = (o.currency && o.currency !== appState.settings.currency && o.foreignAmount) ? -Number(o.foreignAmount) : "";
      const fCurr = (o.currency && o.currency !== appState.settings.currency) ? o.currency : "";
      csvContent += `${sanitizeCsvCell("Personal Obligation")},${sanitizeCsvCell(o.category)},${sanitizeCsvCell(o.title)},${sanitizeCsvCell(-Number(o.amount || 0))},${sanitizeCsvCell(o.date)},${sanitizeCsvCell(appState.settings.currency)},${sanitizeCsvCell(fAmt)},${sanitizeCsvCell(fCurr)}\n`;
    });
    appState.assets.forEach(a => {
      let unitPrice = Number(a.unitPrice || 0);
      if (a.category === "usd") unitPrice = Number(appState.rates.usd || 0);
      if (a.category === "eur") unitPrice = Number(appState.rates.eur || 0);
      if (a.category === "gold") {
        unitPrice = getCalculatedGoldRate(a.karat || "24k");
      }
      const total = Number(a.quantity || 0) * unitPrice;
      const catLabel = a.category === "gold" ? `gold (${(a.karat || "24k").toUpperCase()})` : a.category;
      csvContent += `${sanitizeCsvCell("Asset")},${sanitizeCsvCell(catLabel)},${sanitizeCsvCell(a.name)},${sanitizeCsvCell(total)},${sanitizeCsvCell(`Qty: ${a.quantity}`)},${sanitizeCsvCell(appState.settings.currency)},${sanitizeCsvCell("")},${sanitizeCsvCell("")}\n`;
    });
    sortByDateDesc(appState.creatorTransactions).forEach(t => {
      const isRev = t.flow === "revenue";
      const signedAmt = isRev ? Number(t.amount || 0) : -Number(t.amount || 0);
      const fAmt = (t.currency && t.currency !== appState.settings.currency && t.foreignAmount) ? (isRev ? Number(t.foreignAmount) : -Number(t.foreignAmount)) : "";
      const fCurr = (t.currency && t.currency !== appState.settings.currency) ? t.currency : "";
      csvContent += `${sanitizeCsvCell(`Creator (${t.flow})`)},${sanitizeCsvCell(t.category)},${sanitizeCsvCell(t.title)},${sanitizeCsvCell(signedAmt)},${sanitizeCsvCell(t.date)},${sanitizeCsvCell(appState.settings.currency)},${sanitizeCsvCell(fAmt)},${sanitizeCsvCell(fCurr)}\n`;
    });
    sortByDateDesc(appState.freelanceTransactions).forEach(t => {
      const isInc = t.flow === "income";
      const signedAmt = isInc ? Number(t.amount || 0) : -Number(t.amount || 0);
      const fAmt = (t.currency && t.currency !== appState.settings.currency && t.foreignAmount) ? (isInc ? Number(t.foreignAmount) : -Number(t.foreignAmount)) : "";
      const fCurr = (t.currency && t.currency !== appState.settings.currency) ? t.currency : "";
      csvContent += `${sanitizeCsvCell(`Freelance (${t.flow})`)},${sanitizeCsvCell(t.category)},${sanitizeCsvCell(t.title)},${sanitizeCsvCell(signedAmt)},${sanitizeCsvCell(t.date)},${sanitizeCsvCell(appState.settings.currency)},${sanitizeCsvCell(fAmt)},${sanitizeCsvCell(fCurr)}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PureTech_Wallet_Ledger_${getLocalTodayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(tr('تم تصدير ملف الإكسيل بنجاح', 'Excel CSV exported successfully', 'Archivo Excel CSV exportado con éxito'));
  });

  window.addEventListener("beforeprint", () => {
    if (!isPrintMode) {
      isPrintMode = true;
      renderAll();
    }
  });

  window.addEventListener("afterprint", () => {
    if (isPrintMode) {
      isPrintMode = false;
      renderAll();
    }
  });

  document.getElementById("btnExportPdf")?.addEventListener("click", () => {
    isPrintMode = true;
    renderAll();
    const overviewTab = document.querySelector('[data-tab="tab-overview"]');
    if (overviewTab) overviewTab.click();
    showToast(tr('جاري تجهيز التقرير المالي للطباعة / التصدير كـ PDF...', 'Preparing financial statement for print / PDF...', 'Preparando informe financiero para imprimir / PDF...'), 'info');
    setTimeout(() => {
      window.print();
      // Safety fallback if browser does not fire afterprint
      setTimeout(() => {
        if (isPrintMode) {
          isPrintMode = false;
          renderAll();
        }
      }, 3500);
    }, 450);
  });

  window.addEventListener("online", () => {
    updateOnlineStatusUI();
    showToast(tr('تم الاتصال بالإنترنت - الأسعار جاهزة للتحديث', 'Network restored (Online)', 'Conexión a internet restaurada'), 'info');
    if (appState.settings.autoSyncRates !== false) {
      fetchLiveMarketRates(false);
    }
  });

  window.addEventListener("offline", () => {
    updateOnlineStatusUI();
    showToast(tr('وضع عدم الاتصال: يعمل محلياً 100% بأمان', 'Offline Mode: Running 100% locally', 'Modo sin conexión: Funcionando 100% local'), 'info');
  });

  document.getElementById("btnLoadSampleData").addEventListener("click", async () => {
    const isAr = appState.settings.lang === 'ar';
    const isEs = appState.settings.lang === 'es';
    const ok = await requestConfirmation(
      isAr ? 'شحن البيانات النموذجية' : (isEs ? 'Cargar datos de muestra' : 'Load Sample Data'),
      isAr ? 'سيتم استبدال البيانات الحالية ببيانات تجريبية شاملة وواقعية، هل تود المتابعة؟' : (isEs ? 'Los datos actuales serán reemplazados por registros de prueba completos. ¿Desea continuar?' : 'Current data will be replaced with rich realistic sample records. Proceed?')
    );
    if (ok) {
      appState = getSampleState();
      appState.isDemoMode = true;
      await persistState();
      updateLanguageUI();
      renderAll();
      checkPinSecurityOnStartup();
      showToast(isAr ? 'تم شحن البيانات النموذجية بنجاح' : (isEs ? 'Datos de muestra cargados con éxito' : 'Sample data loaded successfully'));
    }
  });

  document.getElementById("btnOpenClearConfirm").addEventListener("click", async () => {
    const isAr = appState.settings.lang === 'ar';
    const isEs = appState.settings.lang === 'es';
    const ok = await requestConfirmation(
      isAr ? 'تصفير المحفظة والبدء من الصفر' : (isEs ? 'Limpiar base de datos' : 'Wipe Database Clean'),
      isAr ? 'تحذير: هذا الإجراء لا يمكن التراجع عنه وسيحذف كافة المصادر والالتزامات والأصول والقنوات نهائياً!' : (isEs ? 'Advertencia: ¡Esta acción no se puede deshacer y borrará permanentemente todos los registros!' : 'Warning: This action cannot be undone and will permanently wipe all entries!')
    );
    if (ok) {
      const currentLang = appState.settings.lang || detectInitialLanguage();
      const currentCurrency = appState.settings.currency || "USD";
      appState = getDefaultCleanState();
      appState.settings.lang = currentLang;
      appState.settings.currency = currentCurrency;
      await persistState();
      updateLanguageUI();
      renderAll();
      checkPinSecurityOnStartup();
      showToast(isAr ? 'تم تصفير المحفظة بالكامل والبدء من الصفر' : (isEs ? 'Base de datos restablecida con éxito' : 'Database successfully wiped clean'));
    }
  });
});

// Register PWA Service Worker for 100% Offline Resilience
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((reg) => {
        console.log("[PWA] Service Worker registered in scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[PWA] Service Worker registration skipped:", err);
      });
  });
}
