// ======================================================
//  app-init.js
//  Backup/restore, app boot sequence, and the splash/welcome screen. Loaded LAST since boot() kicks off the whole app and touches every module above.
// ======================================================

// ======================================================
//  BACKUP
// ======================================================
function openBackup() {
    renderBackupScreen();
    showScreen('screen-backup');
}

function renderBackupScreen() {
    const last = localStorage.getItem('lastBackupDate');
    const schedule = localStorage.getItem('backupSchedule') || 'sunday';
    let bannerBg, bannerIcon, bannerTitle, bannerSub;
    if (!last) {
        bannerBg = 'background:var(--red-lt);border:1px solid var(--red)';
        bannerIcon = '❌';
        bannerTitle = 'No backup yet!';
        bannerSub = 'Your data is only on this device. Send a backup to WhatsApp now.';
    } else {
        const days = Math.floor((Date.now() - new Date(last)) / 86400000);
        if (days === 0) {
            bannerBg = 'background:var(--green-lt);border:1px solid var(--green)';
            bannerIcon = '✅';
            bannerTitle = 'Backed up today';
            bannerSub = "You're up to date.";
        } else if (days <= 7) {
            bannerBg = 'background:var(--green-lt);border:1px solid var(--green)';
            bannerIcon = '✅';
            bannerTitle = days + 'd since last backup';
            bannerSub = "You're up to date. Keep it up!";
        } else {
            bannerBg = 'background:var(--amber-lt);border:1px solid var(--amber)';
            bannerIcon = '⚠️';
            bannerTitle = days + ' days since backup!';
            bannerSub = 'Tap Send to WhatsApp to protect your data now.';
        }
    }
    const banner = document.getElementById('backup-hero-banner');
    banner.style.cssText = bannerBg + ';border-radius:12px;padding:16px;margin-bottom:12px;text-align:center';
    banner.innerHTML =
        '<div style="font-size:36px;margin-bottom:6px">' +
        bannerIcon +
        '</div><div style="font-weight:800;font-size:16px;color:var(--ink);margin-bottom:4px">' +
        bannerTitle +
        '</div><div style="font-size:12px;color:var(--muted);line-height:1.5">' +
        bannerSub +
        '</div>';
    const el = document.getElementById('last-backup-date');
    const icon = document.getElementById('backup-status-icon');
    if (last) {
        const days = Math.floor((Date.now() - new Date(last)) / 86400000);
        el.textContent = new Date(last).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        icon.textContent = days <= 7 ? '✅' : '⚠️';
    } else {
        el.textContent = 'Never';
        icon.textContent = '❌';
    }
    document.getElementById('backup-schedule-select').value = schedule;
    document.getElementById('backup-schedule-sub').textContent = 'Currently: ' + scheduleLabel(schedule);
    renderStorageHealth();
}

function scheduleLabel(s) {
    return s === 'daily' ? 'Every Day' : s === 'sunday' ? 'Every Sunday' : 'Manual Only';
}

function saveBackupSchedule(val) {
    localStorage.setItem('backupSchedule', val);
    document.getElementById('backup-schedule-sub').textContent = 'Currently: ' + scheduleLabel(val);
    toast('✅ Schedule saved: ' + scheduleLabel(val));
}

function renderStorageHealth() {
    const el = document.getElementById('storage-health-rows');
    if (!el) return;
    const counts = [
        { label: 'Animals', icon: '🐃', count: animals.length },
        { label: 'Customers', icon: '👤', count: customers.length },
        { label: 'Supply Records', icon: '🥛', count: shedProduction.length },
        { label: 'Customer Payments', icon: '💰', count: customerPayments.length },
        { label: 'Goods Purchases', icon: '📦', count: goodsPurchases.length },
        { label: 'Feed Entries', icon: '🌾', count: feedConsumption.length },
        { label: 'Workers', icon: '👷', count: workers.length },
        { label: 'Medicine Bills', icon: '💊', count: medBills.length }
    ];
    const total = counts.reduce((s, c) => s + c.count, 0);
    const estKB = Math.round((total * 200) / 1024);
    el.innerHTML =
        counts
            .map(
                c =>
                    '<div class="pl-row"><div><div class="pl-label">' +
                    c.icon +
                    ' ' +
                    c.label +
                    '</div></div><div style="font-weight:700;color:var(--ink);font-size:13px">' +
                    c.count +
                    ' records</div></div>'
            )
            .join('') +
        '<div class="pl-row" style="background:var(--bg)"><div><div class="pl-label" style="color:var(--blue)">📊 Total Records</div><div class="pl-sub">Est. file size: ~' +
        estKB +
        'KB (limit ~50,000KB)</div></div><div style="font-weight:800;color:var(--blue);font-size:14px">' +
        total +
        '</div></div>';
}

async function backupToWhatsApp() {
    const data = {
        exportedAt: new Date().toISOString(),
        settings,
        animals,
        koriEntries,
        tajiEntries,
        vendorPayments,
        medBills,
        lightBills,
        milkPurchases,
        customers,
        shedProduction,
        customerPayments,
        goodsPurchases,
        godownStock,
        feedConsumption,
        workers,
        labourPayments,
        attendance,
        palakPayments,
        feedNutrition,
        balanceMilkLog,
        bills,
        medPayments,
        rentPayments,
        miscExpenses
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dairy-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    localStorage.setItem('lastBackupDate', new Date().toISOString());
    const S = computeStats();
    const total = animals.length + customers.length + shedProduction.length + customerPayments.length;
    const msg =
        '💾 *DAIRY MANAGER BACKUP*\n📅 ' +
        new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
        '\n🐃 Animals: ' +
        S.totalActive +
        ' active\n👤 Customers: ' +
        customers.length +
        '\n📊 Total Records: ' +
        total +
        '\n\n⚠️ File: dairy-backup-' +
        todayStr() +
        '.json\n\nTo restore: Dairy Manager -> Accounts -> 💾 Backup -> ^️ Import -> select file.\n\n_Keep in Saved Messages_ 📌';
    waShare(msg);
    toast('✅ File downloaded + WhatsApp opened!', 3000);
    renderBackupScreen();
    checkBackupReminder();
    renderFeedLowAlert();
    renderKasaiAlert();
}

function exportData() {
    const data = {
        exportedAt: new Date().toISOString(),
        settings,
        animals,
        koriEntries,
        tajiEntries,
        vendorPayments,
        medBills,
        lightBills,
        milkPurchases,
        customers,
        shedProduction,
        customerPayments,
        goodsPurchases,
        godownStock,
        feedConsumption,
        workers,
        labourPayments,
        attendance,
        palakPayments,
        feedNutrition,
        balanceMilkLog,
        bills,
        medPayments,
        rentPayments,
        miscExpenses
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dairy-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    localStorage.setItem('lastBackupDate', new Date().toISOString());
    toast('✅ Backup downloaded');
    if (activeScreenId === 'screen-backup') renderBackupScreen();
    checkBackupReminder();
    renderFeedLowAlert();
    renderKasaiAlert();
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reportLines = [];
    try {
        const text = await file.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            toast('⚠️ Invalid file - not valid JSON');
            event.target.value = '';
            return;
        }
        if (!data || typeof data !== 'object') {
            toast('⚠️ Invalid backup format');
            event.target.value = '';
            return;
        }
        const exportedAt = data.exportedAt
            ? new Date(data.exportedAt).toLocaleDateString('en-IN')
            : 'Unknown';
        reportLines.push('📦 Backup from: ' + exportedAt);

        async function mergeStore(storeName, incoming) {
            if (!Array.isArray(incoming) || !incoming.length) {
                reportLines.push('  ' + storeName + ': 0 records');
                return;
            }
            let added = 0,
                skipped = 0,
                invalid = 0;
            for (const item of incoming) {
                if (!item || typeof item !== 'object') {
                    invalid++;
                    continue;
                }
                if (!item.id) {
                    item.id = uid();
                }
                const existing = await new Promise(res => {
                    try {
                        const tx = DB.transaction(storeName, 'readonly');
                        const req = tx.objectStore(storeName).get(item.id);
                        req.onsuccess = () => res(req.result);
                        req.onerror = () => res(null);
                    } catch (e) {
                        res(null);
                    }
                });
                if (existing) {
                    skipped++;
                    continue;
                }
                await dbPut(storeName, item);
                added++;
            }
            reportLines.push(
                '  ✅ ' +
                    storeName +
                    ': +' +
                    added +
                    ' added, ' +
                    skipped +
                    ' skipped (duplicates), ' +
                    invalid +
                    ' invalid'
            );
        }

        if (data.settings && typeof data.settings === 'object') {
            const merged = { ...settings, ...data.settings };
            await dbPut('settings', merged);
            reportLines.push('  ✅ settings: merged');
        }

        await mergeStore('animals', data.animals);
        await mergeStore('koriEntries', data.koriEntries);
        await mergeStore('tajiEntries', data.tajiEntries);
        await mergeStore('vendorPayments', data.vendorPayments);
        await mergeStore('medBills', data.medBills);
        await mergeStore('lightBills', data.lightBills);
        await mergeStore('milkPurchases', data.milkPurchases);
        await mergeStore('customers', data.customers);
        await mergeStore('shedProduction', data.shedProduction);
        await mergeStore('customerPayments', data.customerPayments);
        await mergeStore('goodsPurchases', data.goodsPurchases);
        await mergeStore('godownStock', data.godownStock);
        await mergeStore('feedConsumption', data.feedConsumption);
        await mergeStore('workers', data.workers);
        await mergeStore('labourPayments', data.labourPayments);
        await mergeStore('attendance', data.attendance);
        await mergeStore('palakPayments', data.palakPayments);
        await mergeStore('feedNutrition', data.feedNutrition);
        await mergeStore('balanceMilkLog', data.balanceMilkLog);
        await mergeStore('bills', data.bills);
        await mergeStore('medPayments', data.medPayments);
        await mergeStore('rentPayments', data.rentPayments);
        await mergeStore('miscExpenses', data.miscExpenses);

        const report = reportLines.join('\n');
        const confirmed = confirm(
            '✅ Import Complete!\n\n' + report + '\n\nTap OK to reload and apply changes.'
        );
        if (confirmed) location.reload();
    } catch (err) {
        console.error('importData failed', err);
        toast('⚠️ Import failed: ' + err.message);
    }
    event.target.value = '';
}

function confirmClearAll() {
    if (
        confirm(
            '⚠️ CLEAR ALL DATA?\n\nThis CANNOT be undone.\nSend a WhatsApp backup first!\n\nTap OK to permanently delete everything.'
        )
    ) {
        clearDBAndReload();
    }
}

async function clearDBAndReload() {
    try {
        try {
            if (typeof DB !== 'undefined' && DB) {
                DB.close();
            }
        } catch (ex) {}
        await new Promise(res => {
            const r = indexedDB.deleteDatabase('DairyDB');
            r.onsuccess = () => res();
            r.onerror = () => res();
            r.onblocked = () => {
                setTimeout(res, 800);
            };
        });
    } catch (e) {
        console.error('delete DB error', e);
    }
    location.reload();
}

function checkBackupReminder() {
    const el = document.getElementById('backup-reminder');
    if (!el) return;
    const last = localStorage.getItem('lastBackupDate');
    const schedule = localStorage.getItem('backupSchedule') || 'sunday';
    if (schedule === 'manual') {
        el.style.display = 'none';
        return;
    }
    if (!last) {
        if (animals.length || customers.length) el.style.display = 'flex';
        return;
    }
    const days = Math.floor((Date.now() - new Date(last)) / 86400000);
    el.style.display = days >= (schedule === 'daily' ? 1 : 7) ? 'flex' : 'none';
}

function checkBackupSchedule() {
    const schedule = localStorage.getItem('backupSchedule') || 'sunday';
    if (schedule === 'manual') return;
    const last = localStorage.getItem('lastBackupDate');
    if (last && Math.floor((Date.now() - new Date(last)) / 86400000) < 1) return;
    if (!(animals.length || customers.length)) return;
    const today = new Date();
    if (schedule === 'sunday' && today.getDay() !== 0) return;
    setTimeout(() => {
        if (
            confirm(
                '💾 Backup Reminder!\n\nLast backup: ' +
                    (last ? Math.floor((Date.now() - new Date(last)) / 86400000) + 'd ago' : 'Never') +
                    '\n\nSend backup to WhatsApp Saved Messages now?'
            )
        ) {
            backupToWhatsApp();
        }
    }, 2500);
}

// ======================================================
//  BOOT
// ======================================================
function showBootError(err) {
    const msg = err ? err.message || String(err) : 'Unknown error';
    const errDiv = document.createElement('div');
    errDiv.style.cssText =
        'padding:32px 20px;text-align:center;font-family:-apple-system,sans-serif;background:#F2F4F7;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box';
    errDiv.innerHTML =
        '<div style="font-size:48px;margin-bottom:14px">⚠️</div>' +
        '<div style="font-size:19px;font-weight:800;color:#C81E1E;margin-bottom:8px">App Failed to Load</div>' +
        '<div style="font-size:13px;color:#374151;margin-bottom:6px;max-width:320px;line-height:1.5">Database could not be opened. Try the steps below:</div>' +
        '<div style="background:#fff;border-radius:12px;padding:16px;margin:12px 0;width:100%;max-width:340px;text-align:left;border:1px solid #E3E8EF">' +
        '<div style="font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Fix Steps</div>' +
        '<div style="font-size:13px;color:#111827;line-height:1.9">1️⃣ Close all other tabs of this app<br>2️⃣ Tap <b>Reload App</b> below<br>3️⃣ If still failing, tap <b>Clear DB &amp; Reload</b><br>4️⃣ After clearing, re-import your backup JSON</div>' +
        '</div>' +
        '<div style="font-size:11px;color:#9CA3AF;margin-bottom:18px;max-width:300px">Error: ' +
        msg +
        '</div>' +
        '<button onclick="location.reload()" style="background:#1B4FD8;color:#fff;border:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;width:100%;max-width:280px;margin-bottom:10px;cursor:pointer">🔄 Reload App</button>' +
        '<button onclick="clearDBAndReload()" style="background:#C81E1E;color:#fff;border:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;width:100%;max-width:280px;margin-bottom:10px;cursor:pointer">🗑️ Clear DB &amp; Reload</button>' +
        '<div style="font-size:11px;color:#9CA3AF;max-width:280px">⚠️ Clear DB only if Reload fails - export your data first if possible</div>';
    document.body.innerHTML = '';
    document.body.appendChild(errDiv);
}

async function loadAllData() {
    const s = await dbGetAll('settings');
    if (s.length > 0) settings = { ...settings, ...s[0] };
    else await dbPut('settings', settings, true);
    // Every entry in DB_STORES (minus settings, which loads separately above)
    // gets fetched here, in the same order as the destructuring assignment
    // below. This used to be a second hand-typed list of dbGetAll('name')
    // calls - a store name typo there would silently return [] instead of
    // failing loudly, since it wouldn't match the store this array actually
    // means to load. Deriving the fetch list from DB_STORES removes that
    // whole class of mistake.
    const LOAD_STORES = DB_STORES.filter(s => s !== 'settings');
    [
        animals,
        koriEntries,
        tajiEntries,
        vendorPayments,
        medBills,
        lightBills,
        milkPurchases,
        customers,
        shedProduction,
        customerPayments,
        goodsPurchases,
        godownStock,
        feedConsumption,
        workers,
        labourPayments,
        attendance,
        palakPayments,
        animalMilkLogs,
        feedNutrition,
        balanceMilkLog,
        bills,
        medPayments,
        rentPayments,
        miscExpenses,
        bulls,
        bullPayments,
        milkPurchaseBills
    ] = await Promise.all(LOAD_STORES.map(store => dbGetAll(store)));
    // Soft-deleted records stay in IndexedDB for recovery, but must never
    // appear in the in-memory arrays the rest of the app reads from -
    // this is the ONLY place that needs to know about the deleted flag.
    animals = animals.filter(x => !x.deleted);
    customers = customers.filter(x => !x.deleted);
    workers = workers.filter(x => !x.deleted);
    customerPayments = customerPayments.filter(x => !x.deleted);
    godownStock = godownStock.filter(x => !x.deleted);
    goodsPurchases = goodsPurchases.filter(x => !x.deleted);
    feedConsumption = feedConsumption.filter(x => !x.deleted);
    purgeExpiredSoftDeletes().catch(e => console.warn('purgeExpiredSoftDeletes failed', e));
    // These three are background self-healing/migration steps, not user-initiated
    // saves - a hiccup here (e.g. a transient IndexedDB reconnect on iOS Safari right
    // after the big parallel read above) shouldn't alarm the user with a "reload the
    // app" toast on every ordinary launch. They're idempotent, so a skipped run just
    // retries cleanly next time the app opens.
    try {
        await ensureFeedNutritionDefaults();
    } catch (e) {
        console.warn('ensureFeedNutritionDefaults failed - will retry next launch', e);
    }
    try {
        await dedupeAttendance();
    } catch (e) {
        console.warn('dedupeAttendance failed - will retry next launch', e);
    }
    try {
        await migrateBalanceMilkFromLocalStorage();
    } catch (e) {
        console.warn('migrateBalanceMilkFromLocalStorage failed - will retry next launch', e);
    }
    try {
        await fixDrCheckDatesToTwoMonths();
    } catch (e) {
        console.warn('fixDrCheckDatesToTwoMonths failed - will retry next launch', e);
    }
}

// One-time-per-record correction: drCheckDate is calculated and stored at the
// moment a breeding/service entry is saved, not recalculated live - so animals
// whose entry was saved before the Dr Check rule changed to "2 calendar months"
// are still carrying whatever date the old formula produced. This brings every
// still-pending record in line with the current rule. Safe to run every launch:
// it's a no-op once a record's date already matches.
async function fixDrCheckDatesToTwoMonths() {
    let changed = false;
    for (const a of animals) {
        if (!a.faliDate || !a.drCheckDate) continue;
        const correct = addMonths(a.faliDate, 2);
        if (a.drCheckDate !== correct) {
            a.drCheckDate = correct;
            await dbPut('animals', a, true);
            changed = true;
        }
    }
    if (changed && typeof renderDrCard === 'function' && document.getElementById('drcard-body')) {
        renderDrCard();
    }
}

// One-time migration: Balance Milk used to be stored in localStorage, which
// is tied to the page's exact origin/URL and can fail to survive when the
// app file is reopened or replaced (unlike IndexedDB, which is what every
// other part of this app uses and reliably persists). This pulls in any
// old localStorage entries still present on this device and moves them into
// the same IndexedDB store everything else uses, then stops touching
// localStorage for this going forward.
async function migrateBalanceMilkFromLocalStorage() {
    try {
        const seenDates = new Set(balanceMilkLog.map(r => r.date));
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf('balanceMilk_') === 0) keys.push(k);
        }
        for (const k of keys) {
            const dateStr = k.slice('balanceMilk_'.length);
            if (seenDates.has(dateStr)) continue;
            try {
                const v = JSON.parse(localStorage.getItem(k) || 'null');
                if (v) {
                    const rec = { id: uid(), date: dateStr, morning: N(v.morning), evening: N(v.evening) };
                    await dbPut('balanceMilkLog', rec, true);
                    balanceMilkLog.push(rec);
                    seenDates.add(dateStr);
                }
            } catch (e) {}
        }
    } catch (e) {
        console.warn('Balance milk migration skipped', e);
    }
}

// Self-heal: earlier app versions could create a duplicate attendance
// record for the same worker+month on every save instead of updating the
// existing one (that bug is fixed now) - this cleans up any leftover
// duplicates from before the fix, keeping only the most recent per month.
async function dedupeAttendance() {
    const seen = new Map();
    const toDelete = [];
    for (const a of attendance) {
        const key = a.workerId + '|' + a.month;
        if (seen.has(key)) {
            const kept = seen.get(key);
            if (a.id > kept.id) {
                toDelete.push(kept.id);
                seen.set(key, a);
            } else {
                toDelete.push(a.id);
            }
        } else {
            seen.set(key, a);
        }
    }
    if (toDelete.length) {
        for (const id of toDelete) {
            await dbDelete('attendance', id, true);
        }
        attendance = attendance.filter(a => !toDelete.includes(a.id));
    }
}

async function boot() {
    try {
        await openDB();
        await loadAllData();
        matrixDirty = true;
        renderDashboard();
        renderHerd();
        checkSundayBillReminder();
        checkBackupSchedule();
    } catch (err) {
        console.error('Boot attempt 1 failed:', err);
        try {
            try {
                if (DB) {
                    DB.close();
                    dbClosed = true;
                }
            } catch (ex) {}
            await new Promise(r => setTimeout(r, 600));
            DB = null;
            dbClosed = false;
            await openDB();
            await loadAllData();
            matrixDirty = true;
            renderDashboard();
            renderHerd();
        } catch (err2) {
            console.error('Boot attempt 2 failed:', err2);
            showBootError(err2);
        }
    }
}

function checkSundayBillReminder() {
    const today = new Date();
    if (today.getDay() !== 0) return;
    const dateKey = todayStr();
    const alreadyDone = localStorage.getItem('sundayBillDone_' + dateKey);
    if (alreadyDone) return;
    if (!customers.length) return;
    setTimeout(() => {
        if (
            confirm(
                "📅 It's Sunday!\n\nTime to generate weekly WhatsApp bills for all customers?\n\nTap OK to open billing."
            )
        ) {
            openWhatsAppBillModal();
            localStorage.setItem('sundayBillDone_' + dateKey, '1');
        }
    }, 1200);
}

// ======================================================
//  SPLASH / WELCOME SCREEN (shows on every open)
// ======================================================
function dismissSplash() {
    const el = document.getElementById('splash-screen');
    if (el) {
        el.classList.add('dismissed');
        setTimeout(function () {
            el.remove();
        }, 450);
    }
}

// Keep whatever the person is typing into visible above the on-screen
// keyboard. Modals are bottom sheets, so once the keyboard opens it can
// cover the very field being edited (and the Save button below it) unless
// we explicitly scroll that field into view.
(function () {
    function scrollFocusedIntoView() {
        const el = document.activeElement;
        if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    document.addEventListener('focusin', function (e) {
        if (!(
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA' ||
            e.target.tagName === 'SELECT'
        ))
            return;
        setTimeout(scrollFocusedIntoView, 300);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () {
            setTimeout(scrollFocusedIntoView, 100);
        });
    }
})();

boot();

// Offline app-shell caching. sw.js has to be a real file served next to
// this HTML file (browsers won't run a service worker embedded inline) -
// if it isn't there yet (e.g. not uploaded to the server, or opened via
// file://), this just fails quietly and the app keeps working exactly as
// before, since all real data already lives safely in IndexedDB.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
            console.warn(
                'Offline caching unavailable (sw.js not found next to index.html) - app still works normally',
                err
            );
        });
    });
}