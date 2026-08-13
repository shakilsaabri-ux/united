// ======================================================
//  db-core.js
//  Core data layer: IndexedDB access, recently-deleted recovery, global app state arrays, and shared utility functions (cur, fmtDate, N, esc, uid, etc). Loaded first - everything else depends on this.
// ======================================================

// ======================================================
//  INDEXEDDB
// ======================================================
let DB;
let dbClosed = false;
const DB_NAME = 'DairyDB',
    DB_VER = 19;
const DB_STORES = [
    'animals',
    'settings',
    'koriEntries',
    'tajiEntries',
    'vendorPayments',
    'medBills',
    'lightBills',
    'milkPurchases',
    'customers',
    'shedProduction',
    'customerPayments',
    'goodsPurchases',
    'godownStock',
    'feedConsumption',
    'workers',
    'labourPayments',
    'attendance',
    'palakPayments',
    'animalMilkLogs',
    'feedNutrition',
    'balanceMilkLog',
    'bills',
    'medPayments',
    'rentPayments',
    'miscExpenses',
    'bulls',
    'bullPayments',
    'milkPurchaseBills'
];

// Record types where an accidental delete is costly enough to warrant a
// recovery window instead of erasing immediately - animals, people, and
// anything money-related (payments, purchases, feed consumption history).
const SOFT_DELETE_STORES = [
    'animals',
    'customers',
    'workers',
    'customerPayments',
    'godownStock',
    'goodsPurchases',
    'feedConsumption'
];

function createStores(db) {
    DB_STORES.forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    });
}

function openDB() {
    return new Promise((res, rej) => {
        let req;
        try {
            req = indexedDB.open(DB_NAME, DB_VER);
        } catch (e) {
            rej(e);
            return;
        }
        req.onupgradeneeded = e => {
            try {
                createStores(e.target.result);
            } catch (err) {
                console.warn('upgrade err', err);
            }
        };
        req.onsuccess = e => {
            DB = e.target.result;
            dbClosed = false;
            DB.onversionchange = () => {
                dbClosed = true;
                try {
                    DB.close();
                } catch (ex) {}
            };
            res();
        };
        req.onerror = e => {
            console.error('DB open error', e.target.error);
            rej(e.target.error || new Error('DB open failed'));
        };
        req.onblocked = () => {
            console.warn('DB blocked - retrying after 500ms');
            try {
                if (DB) DB.close();
            } catch (ex) {}
            setTimeout(() => {
                const r2 = indexedDB.open(DB_NAME, DB_VER);
                r2.onupgradeneeded = e => {
                    try {
                        createStores(e.target.result);
                    } catch (ex) {}
                };
                r2.onsuccess = e => {
                    DB = e.target.result;
                    dbClosed = false;
                    DB.onversionchange = () => {
                        dbClosed = true;
                        try {
                            DB.close();
                        } catch (ex) {}
                    };
                    res();
                };
                r2.onerror = e => {
                    rej(e.target.error || new Error('DB blocked and retry failed'));
                };
            }, 500);
        };
    });
}
let dbOpenPromise = null;

async function ensureDB() {
    if (DB && !dbClosed) return DB;
    if (!dbOpenPromise) {
        dbOpenPromise = openDB().finally(() => {
            dbOpenPromise = null;
        });
    }
    await dbOpenPromise;
    return DB;
}

function isClosedDBError(err) {
    if (!err) return false;
    const name = err.name || (err.target && err.target.error && err.target.error.name) || '';
    const msg = err.message || (err.target && err.target.error && err.target.error.message) || '';
    return name === 'InvalidStateError' || /closing|closed connection/i.test(msg);
}

async function withDB(fn) {
    try {
        await ensureDB();
        return await fn();
    } catch (err) {
        if (isClosedDBError(err)) {
            console.warn('DB connection was stale - reopening and retrying', err);
            DB = null;
            dbClosed = true;
            await ensureDB();
            try {
                return await fn();
            } catch (err2) {
                if (isClosedDBError(err2)) {
                    console.warn('DB connection stale again - one more reopen+retry', err2);
                    await new Promise(r => setTimeout(r, 250));
                    DB = null;
                    dbClosed = true;
                    await ensureDB();
                    return await fn();
                }
                throw err2;
            }
        }
        throw err;
    }
}

async function dbGetAll(s) {
    try {
        return await withDB(
            () =>
                new Promise((res, rej) => {
                    try {
                        const t = DB.transaction(s, 'readonly');
                        const r = t.objectStore(s).getAll();
                        r.onsuccess = () => res(r.result);
                        r.onerror = e => {
                            console.error('dbGetAll error', s, e);
                            rej(e);
                        };
                    } catch (e) {
                        rej(e);
                    }
                })
        );
    } catch (err) {
        console.error('dbGetAll failed', s, err);
        return [];
    }
}

async function dbPut(s, o, silent) {
    try {
        return await withDB(
            () =>
                new Promise((res, rej) => {
                    try {
                        const t = DB.transaction(s, 'readwrite');
                        const r = t.objectStore(s).put(o);
                        r.onsuccess = () => res();
                        r.onerror = e => {
                            console.error('dbPut error', s, e);
                            rej(e);
                        };
                        t.onerror = e => {
                            console.error('dbPut tx error', s, e);
                            rej(e);
                        };
                    } catch (e) {
                        rej(e);
                    }
                })
        );
    } catch (err) {
        console.error('dbPut failed', s, err);
        if (!silent) toast('⚠️ Save failed - please reload the app');
    }
}

async function dbDelete(s, id, silent) {
    try {
        return await withDB(
            () =>
                new Promise((res, rej) => {
                    try {
                        const t = DB.transaction(s, 'readwrite');
                        const r = t.objectStore(s).delete(id);
                        r.onsuccess = () => res();
                        r.onerror = e => {
                            console.error('dbDelete error', s, e);
                            rej(e);
                        };
                    } catch (e) {
                        rej(e);
                    }
                })
        );
    } catch (err) {
        console.error('dbDelete failed', s, err);
        if (!silent) toast('⚠️ Delete failed - please reload the app');
    }
}

// Soft delete: for record types where an accidental delete would be
// costly (money, animals, people), don't actually erase the record -
// flag it and keep it in IndexedDB. Filtered out of every in-memory
// array at load time (see loadAllData) so it behaves exactly like a
// real delete everywhere in the app, but stays recoverable from the
// Recently Deleted screen for RECENTLY_DELETED_RETENTION_DAYS.
const RECENTLY_DELETED_RETENTION_DAYS = 30;
async function softDelete(store, record) {
    record.deleted = true;
    record.deletedAt = new Date().toISOString();
    await dbPut(store, record, true);
}

// Permanently purges anything soft-deleted beyond the retention window.
// Runs once at boot - keeps IndexedDB from growing forever while still
// giving a real recovery window for accidental deletes.
async function purgeExpiredSoftDeletes() {
    const cutoff = Date.now() - RECENTLY_DELETED_RETENTION_DAYS * 86400000;
    for (const store of SOFT_DELETE_STORES) {
        try {
            const all = await dbGetAll(store);
            for (const rec of all) {
                if (rec.deleted && rec.deletedAt && new Date(rec.deletedAt).getTime() < cutoff) {
                    await dbDelete(store, rec.id, true);
                }
            }
        } catch (e) {
            console.error('purgeExpiredSoftDeletes failed for', store, e);
        }
    }
}

// ======================================================
//  RECENTLY DELETED (recovery)
// ======================================================
function deletedRecordLabel(store, rec) {
    switch (store) {
        case 'animals':
            return {
                title: (rec.tagNo || 'Animal') + ' . ' + (rec.khilaNo || '-'),
                sub: rec.location || rec.status || ''
            };
        case 'customers':
            return { title: rec.name || 'Customer', sub: cur(N(rec.rate)) + '/L' };
        case 'workers':
            return {
                title: rec.name || 'Worker',
                sub: (rec.role || 'Labour') + ' . ' + cur(N(rec.pagar)) + '/mo'
            };
        case 'customerPayments': {
            const c = customers.find(x => x.id === rec.customerId);
            return {
                title: cur(rec.amount) + ' payment',
                sub: (c ? c.name : 'Unknown customer') + ' . ' + fmtDate(rec.date)
            };
        }
        case 'godownStock':
            return { title: rec.name || 'Goods', sub: 'Opening record: ' + N(rec.bags) + ' bags' };
        case 'goodsPurchases':
            return {
                title: rec.name || 'Goods',
                sub: 'Purchase: ' + N(rec.bags) + ' bags on ' + fmtDate(rec.date)
            };
        case 'feedConsumption':
            return {
                title: rec.goods || 'Goods',
                sub: 'Rate: ' + N(rec.bags) + '/day from ' + fmtDate(rec.date)
            };
        default:
            return { title: store, sub: '' };
    }
}

async function openRecentlyDeletedModal() {
    let html = '';
    let totalCount = 0;
    for (const store of SOFT_DELETE_STORES) {
        const all = await dbGetAll(store);
        const deleted = (all || [])
            .filter(r => r.deleted)
            .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
        if (!deleted.length) continue;
        totalCount += deleted.length;
        html += '<div class="sec-title">' + store + ' (' + deleted.length + ')</div>';
        deleted.forEach(rec => {
            const info = deletedRecordLabel(store, rec);
            const daysAgo = rec.deletedAt
                ? Math.floor((Date.now() - new Date(rec.deletedAt).getTime()) / 86400000)
                : 0;
            html +=
                '<div class="list-card"><div class="lc-row"><div style="flex:1;min-width:0"><div class="lc-title">' +
                info.title +
                '</div><div class="lc-sub">' +
                info.sub +
                ' . Deleted ' +
                daysAgo +
                'd ago</div></div><button onclick="restoreDeletedRecord(\'' +
                store +
                "','" +
                rec.id +
                '\')" style="background:var(--green);color:#fff;border:none;border-radius:7px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">↩️ Restore</button></div></div>';
        });
    }
    $('recently-deleted-body').innerHTML = totalCount
        ? html
        : '<div class="empty">Nothing in the last 30 days</div>';
    openModal('modal-recently-deleted');
}

async function restoreDeletedRecord(store, id) {
    try {
        const all = await dbGetAll(store);
        const rec = (all || []).find(r => r.id === id);
        if (!rec) {
            toast('⚠️ Record not found');
            return;
        }
        delete rec.deleted;
        delete rec.deletedAt;
        await dbPut(store, rec);
        if (store === 'animals') animals.push(rec);
        else if (store === 'customers') customers.push(rec);
        else if (store === 'workers') workers.push(rec);
        else if (store === 'customerPayments') customerPayments.push(rec);
        else if (store === 'godownStock') godownStock.push(rec);
        else if (store === 'goodsPurchases') goodsPurchases.push(rec);
        else if (store === 'feedConsumption') feedConsumption.push(rec);
        toast('✅ Restored');
        openRecentlyDeletedModal();
        renderDashboard();
        if (store === 'customers' || store === 'customerPayments') renderSupply();
        if (store === 'workers') renderLabour();
        if (store === 'godownStock' || store === 'goodsPurchases' || store === 'feedConsumption')
            renderStock();
    } catch (err) {
        console.error('restoreDeletedRecord failed', err);
        toast('⚠️ Restore failed - please try again');
    }
}

// ======================================================
//  STATE
// ======================================================
let animals = [],
    koriEntries = [],
    tajiEntries = [],
    vendorPayments = [],
    medBills = [],
    lightBills = [],
    milkPurchases = [];
let customers = [],
    shedProduction = [],
    customerPayments = [];
let goodsPurchases = [],
    godownStock = [],
    feedConsumption = [];
let workers = [],
    labourPayments = [],
    attendance = [],
    palakPayments = [];
let animalMilkLogs = [];
let feedNutrition = [];
let balanceMilkLog = [];
let bills = [];
let medPayments = [];
let rentPayments = [];
let miscExpenses = [];
let bulls = [];
let bullPayments = [];
let milkPurchaseBills = [];
let currentCustomerId = null,
    currentWorkerId = null;
let accPeriod = 'monthly',
    repPeriod = 'weekly';
let settings = {
    id: 'settings',
    nooraRate: 3300,
    tosifRate: 3100,
    tajiRate: 3400,
    bakdiRate: 1800,
    doublingRate: 15000,
    milkBench: 192,
    feedBaseline: 200,
    milkLogs: [],
    feedLogs: [],
    milkPurchaseSources: ['Makka Dairy', 'United Dairy', '2 No', '5 No'],
    labourMonthly: 0,
    milkSaleRate: 0,
    medicineTotal: 0,
    totalFeedExpense: 0,
    tmrStdProtein: 20,
    tmrStdFat: 5,
    tmrStdFibre: 10,
    tmrStdSilica: 1,
    tmrStdTDN: 75,
    tmrStdEnergy: 3.0,
    tmrBuffaloReqKg: 10,
    tmrManualFeeds: [],
    tmrExcludedFeeds: [],
    removedFeedNutritionNames: []
};
let currentAnimalId = null,
    currentTab = 0,
    dashPeriod = 'daily';

// ======================================================
//  UTILS
// ======================================================
// Local-date formatter (Y-M-D from the browser's own timezone) - never use
// .toISOString() for calendar dates: it converts to UTC first, which silently
// shifts the date back by one day for any timezone ahead of UTC (e.g. India,
// UTC+5:30) since local midnight becomes the previous day in UTC.
function fmtLocalDate(d) {
    return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
    );
}
const todayStr = () => fmtLocalDate(new Date());
const fmtDate = d =>
    d
        ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: '2-digit'
          })
        : '-';
const cur = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const N = (v, d = 0) => Number(v || d);
// Shared ledger helpers: every vendor/name balance in the app (Medicine,
// Bulls, Purchased Milk, Rent, KORI, Light Bills, ...) boils down to
// "sum a field across a filtered array" and "billed minus paid(s)". These
// two tiny helpers replace what used to be a near-identical reduce()
// rewritten in every one of those outstanding-balance functions - fixing
// a bug in the math (e.g. a rounding rule) now only needs fixing once.
const sumBy = (arr, field) => (arr || []).reduce((s, r) => s + N(r[field]), 0);
const ledgerBalance = (billedTotal, ...paidTotals) => billedTotal - paidTotals.reduce((s, x) => s + x, 0);
// Generic "save a form entry" flow shared by every Add/Payment modal in the
// app: persist to IndexedDB, push into the matching in-memory array, close
// the modal, toast a confirmation, then re-render. Centralizing this means
// every save follows the exact same steps, and a step can't be forgotten
// (e.g. pushing to the array but skipping the DB write, or vice versa).
// Field-specific validation still happens in each caller before this runs.
async function saveEntry({ store, arr, entry, idx, modalId, successMsg, onDone }) {
    try {
        await dbPut(store, entry);
        if (idx != null && idx >= 0) arr[idx] = entry;
        else arr.push(entry);
        if (modalId) closeModal(modalId);
        if (successMsg) toast(successMsg);
        if (onDone) onDone();
    } catch (err) {
        console.error('saveEntry(' + store + ') failed', err);
        toast('⚠️ Save failed - please try again');
    }
}
// Shared comparator: always sorts animals by Khila No in strict ascending
// numeric order (handles "12", "K-12", blanks, etc.), so every Shed A/B list
// or grid - table view, seating view, Kata, detail popups - stays in the same
// order and re-sorts automatically whenever a filter/search is applied.
function khilaCompare(a, b) {
    const ka = parseInt(String(a.khilaNo || '').replace(/[^0-9]/g, ''), 10);
    const kb = parseInt(String(b.khilaNo || '').replace(/[^0-9]/g, ''), 10);
    const va = isNaN(ka) ? Infinity : ka;
    const vb = isNaN(kb) ? Infinity : kb;
    if (va !== vb) return va - vb;
    return String(a.khilaNo || '').localeCompare(String(b.khilaNo || ''), undefined, { numeric: true });
}
const sortByKhila = arr => arr.slice().sort(khilaCompare);
const uid = () => Date.now() + Math.floor(Math.random() * 9999);
const daysBetween = (a, b) => {
    if (!a || !b) return 0;
    return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 86400000));
};
const addDays = (d, days) => {
    const x = new Date(d + 'T00:00:00');
    x.setDate(x.getDate() + days);
    return fmtLocalDate(x);
};
const addMonths = (d, months) => {
    const x = new Date(d + 'T00:00:00');
    const day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + months);
    const lastDayOfTargetMonth = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, lastDayOfTargetMonth));
    return fmtLocalDate(x);
};
const monthEndDate = dateStr => {
    const x = new Date(dateStr + 'T00:00:00');
    const end = new Date(x.getFullYear(), x.getMonth() + 1, 0);
    return fmtLocalDate(end);
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let toastTimer = null;
function toast(msg, dur = 2300) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// App-wide double-tap guard for Save/action buttons. A second tap while
// an async save is still in flight (or before a modal closes and
// removes the button) is silently swallowed instead of re-running the
// save - so a duplicate payment, duplicate Taji entry, etc. can't slip
// through from someone tapping twice. Runs in the capture phase, ahead
// of the button's own inline onclick, and needs zero changes to any of
// the individual save*() functions themselves. The cooldown is a fixed
// short window rather than tied to when the save actually finishes, so
// a button never gets stuck disabled if something throws - worst case
// it's just briefly dimmed even after a fast save.
document.addEventListener(
    'click',
    function (e) {
        const btn = e.target.closest('.btn-main, .btn-sm, .btn-danger');
        if (!btn || !btn.onclick) return;
        if (btn.dataset.busy === '1') {
            e.stopImmediatePropagation();
            e.preventDefault();
            return;
        }
        btn.dataset.busy = '1';
        const prevOpacity = btn.style.opacity;
        btn.style.opacity = '0.6';
        setTimeout(() => {
            btn.dataset.busy = '';
            btn.style.opacity = prevOpacity;
        }, 1200);
    },
    true
);
const SC = {
    Pregnant: '#6C2BD9',
    KHALI: '#6B7280',
    FALI: '#0A7C52',
    Slaughtered: '#C81E1E',
    Dead: '#111827',
    'To Be Slaughtered': '#B91C1C'
};
const statusColor = s => SC[s] || '#6B7280';
const STATUS_META = {
    Pregnant: { icon: '🤰', bg: 'var(--purple-lt)', fg: 'var(--purple)' },
    FALI: {
        icon: '🔁',
        bg: 'var(--green-lt)',
        fg: 'var(--green)'
    },
    KHALI: { icon: '🐃', bg: 'var(--amber-lt)', fg: 'var(--amber)' },
    TAJI: { icon: '🚛', bg: 'var(--teal-lt)', fg: 'var(--teal)' },
    KORI: {
        icon: '🤝',
        bg: 'var(--blue-lt)',
        fg: 'var(--blue)'
    },
    'To Be Slaughtered': { icon: '🔪', bg: 'var(--red-lt)', fg: 'var(--red)' }
};
const badgeHtml = (l, c) =>
    `<span class="badge" style="background:${c}22;color:${c};border:1px solid ${c}44">${l}</span>`;

function sparklineSVG(values, color) {
    if (!values || values.length < 2) return '';
    var w = 90,
        h = 26,
        pad = 2;
    var min = Math.min.apply(null, values),
        max = Math.max.apply(null, values);
    var range = max - min || 1;
    var step = (w - pad * 2) / (values.length - 1);
    var pts = values
        .map(function (v, i) {
            var x = pad + i * step;
            var y = h - pad - ((v - min) / range) * (h - pad * 2);
            return x.toFixed(1) + ',' + y.toFixed(1);
        })
        .join(' ');
    var lastX = (pad + (values.length - 1) * step).toFixed(1);
    var lastY = (h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2)).toFixed(1);
    return (
        '<svg viewBox="0 0 ' +
        w +
        ' ' +
        h +
        '" width="' +
        w +
        '" height="' +
        h +
        '" style="display:block;overflow:visible">' +
        '<polyline points="' +
        pts +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>' +
        '<circle cx="' +
        lastX +
        '" cy="' +
        lastY +
        '" r="2" fill="' +
        color +
        '"/>' +
        '</svg>'
    );
}
function statBillGrid(items) {
    var h = '';
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var onclick = it.key ? ' onclick="' + it.key + '"' : '';
        var cursor = it.key ? 'cursor:pointer;' : 'cursor:default;';
        if (i % 2 === 0) h += '<div class="bill-grid">';
        var icon2 = it.icon || '';
        var subHtml = it.sub ? '<div class="bc-sub">' + it.sub + '</div>' : '';
        var sparkHtml =
            it.spark && it.spark.length > 1
                ? '<div class="bc-spark">' + sparklineSVG(it.spark, it.color) + '</div>'
                : '';
        h +=
            '<div class="bill-card" style="border-left-color:' +
            it.color +
            ';' +
            cursor +
            '"' +
            onclick +
            '>';
        h += '<div class="bc-icon">' + icon2 + '</div>';
        h += '<div class="bc-body"><div class="bc-name">' + it.name + '</div>' + subHtml + '</div>';
        h +=
            '<div class="bc-right"><div class="bc-amt" style="color:' +
            it.color +
            '">' +
            it.val +
            '</div>' +
            sparkHtml +
            '</div>';
        h += '</div>';
        if (i % 2 === 1 || i === items.length - 1) h += '</div>';
    }
    return h;
}
const $ = id => document.getElementById(id);
// Escapes free-text fields (names, notes, remarks) before they're
// concatenated into innerHTML, so a stray < or & in typed text can't
// break the surrounding markup or swallow the rest of a card.
const esc = v =>
    String(v ?? '').replace(
        /[&<>"']/g,
        ch =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[ch]
    );
let matrixDirty = true;
let activeScreenId = 'screen-0';
let shedProdDate = null;
let supplyCurrentDate = null;
let supplyWeekDate = null;
let kataShedTab = 'A';
let kataDate = null;