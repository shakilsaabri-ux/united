// ======================================================
//  stock.js
//  Stock tab: godown inventory, feed/TMR calculator, goods purchases, bill photo capture.
// ======================================================

// ======================================================
//  STOCK BOOK HELPERS
// ======================================================
function godownGoodsNames() {
    const names = new Set();
    godownStock.forEach(g => names.add(g.name));
    goodsPurchases.forEach(g => names.add(g.name));
    return [...names];
}

function goodsOpeningBags(name) {
    // FIX: there should only be ONE opening-stock record per goods name (see saveGodownInit).
    // Sum was wrong if old duplicate records existed - use the latest single record instead.
    const entries = godownStock.filter(g => g.name === name);
    if (!entries.length) return 0;
    const latest = entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))[
        entries.length - 1
    ];
    return N(latest.bags);
}

function goodsOpeningDate(name) {
    const entries = godownStock.filter(g => g.name === name);
    if (!entries.length) return null;
    const latest = entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))[
        entries.length - 1
    ];
    return latest.date || null;
}

function goodsPurchasedBags(name) {
    return goodsPurchases.filter(g => g.name === name).reduce((s, g) => s + N(g.bags), 0);
}

function goodsConsumedBags(name) {
    return feedConsumption.filter(f => f.goods === name).reduce((s, f) => s + N(f.bags), 0);
}

function goodsBagSize(name) {
    const p = goodsPurchases.filter(g => g.name === name).slice(-1)[0];
    if (p) return N(p.bagSize);
    const g = godownStock.filter(g => g.name === name).slice(-1)[0];
    return g ? N(g.bagSize) : 0;
}

// Running closing balance as of dateStr, walked day by day from the opening
// stock / earliest purchase through dateStr, applying that day's purchases
// then that day's standing consumption rate.
// Stock can NEVER show as negative: if a day's standing rate is more than
// what's actually on hand, only the available quantity is treated as
// consumed that day (a real shortage) and the balance floors at 0 instead
// of carrying a negative number into the next day.
function closingStockAsOf(name, dateStr) {
    const openDate = goodsOpeningDate(name);
    const events = []; // additions to stock: opening record + purchases
    if (openDate && openDate <= dateStr) events.push({ date: openDate, bags: goodsOpeningBags(name) });
    goodsPurchases
        .filter(g => g.name === name && g.date <= dateStr)
        .forEach(g => events.push({ date: g.date, bags: N(g.bags) }));
    if (!events.length) return 0;
    events.sort((a, b) => a.date.localeCompare(b.date));

    const rates = feedConsumption
        .filter(f => f.goods === name)
        .map(f => ({ date: f.date, bags: N(f.bags) }))
        .sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0;
    let currentRate = 0;
    let rateIdx = 0;
    let evIdx = 0;
    const startDateStr = events[0].date;
    // Catch the rate pointer up to whatever was already in effect as of the
    // walk's start date - otherwise a consumption rate logged BEFORE the
    // opening stock was recorded is never matched (the walk only starts at
    // the opening date, and rateIdx only advances on an exact date match),
    // so currentRate stays stuck at 0 forever and stock never drains.
    while (rateIdx < rates.length && rates[rateIdx].date < startDateStr) {
        currentRate = rates[rateIdx].bags;
        rateIdx++;
    }
    const d = new Date(startDateStr + 'T00:00:00');
    const end = new Date(dateStr + 'T00:00:00');
    while (d <= end) {
        const ds = dateToStr(d);
        while (evIdx < events.length && events[evIdx].date === ds) {
            balance += events[evIdx].bags;
            evIdx++;
        }
        while (rateIdx < rates.length && rates[rateIdx].date === ds) {
            currentRate = rates[rateIdx].bags;
            rateIdx++;
        }
        balance = Math.max(0, balance - currentRate);
        d.setDate(d.getDate() + 1);
    }
    return balance;
}

function goodsRate(name) {
    const p = goodsPurchases.filter(g => g.name === name).slice(-1)[0];
    return p ? N(p.rate) : 0;
}

function goodsClosingBags(name) {
    return closingStockAsOf(name, todayStr());
}

// Feed consumption is a standing daily rate: once set for a goods item, it
// applies automatically every day going forward until a newer entry for the
// same goods changes it - so the user only logs a new entry when the actual
// daily amount changes, not every single day.
function consumedBagsOnDate(name, dateStr) {
    const past = feedConsumption.filter(f => f.goods === name && f.date <= dateStr);
    if (!past.length) return 0;
    past.sort((a, b) => a.date.localeCompare(b.date));
    return N(past[past.length - 1].bags);
}

// Single source of truth for "days of feed left" - floors BEFORE the
// low-stock threshold check everywhere it's used. Previously the Stock
// Book alert bar compared the raw (unfloored) value against <=7 while the
// WhatsApp share, the godown table, and the save-toast all floored first -
// so a value like 7.9 days would silently pass as fine in one place and
// show "⚠️ LOW STOCK" in the other three, for the exact same goods on the
// exact same day.
function stockDaysLeft(closingBags, dailyRate) {
    return dailyRate > 0 ? Math.floor(closingBags / dailyRate) : null;
}

// Same exact logic as closingStockAsOf, but returns a day-by-day trace
// instead of just the final number - for the Stock Ledger Debug view.
function closingStockTrace(name, dateStr) {
    const openDate = goodsOpeningDate(name);
    const events = [];
    if (openDate && openDate <= dateStr) events.push({ date: openDate, bags: goodsOpeningBags(name) });
    goodsPurchases
        .filter(g => g.name === name && g.date <= dateStr)
        .forEach(g => events.push({ date: g.date, bags: N(g.bags) }));
    if (!events.length) return { balance: 0, trace: [], startDateStr: null };
    events.sort((a, b) => a.date.localeCompare(b.date));

    const rates = feedConsumption
        .filter(f => f.goods === name)
        .map(f => ({ date: f.date, bags: N(f.bags) }))
        .sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0;
    let currentRate = 0;
    let rateIdx = 0;
    let evIdx = 0;
    const startDateStr = events[0].date;
    const skippedRates = [];
    while (rateIdx < rates.length && rates[rateIdx].date < startDateStr) {
        skippedRates.push(rates[rateIdx]);
        currentRate = rates[rateIdx].bags;
        rateIdx++;
    }
    const trace = [];
    const d = new Date(startDateStr + 'T00:00:00');
    const end = new Date(dateStr + 'T00:00:00');
    while (d <= end) {
        const ds = dateToStr(d);
        let added = 0,
            rateChanged = false;
        while (evIdx < events.length && events[evIdx].date === ds) {
            balance += events[evIdx].bags;
            added += events[evIdx].bags;
            evIdx++;
        }
        while (rateIdx < rates.length && rates[rateIdx].date === ds) {
            currentRate = rates[rateIdx].bags;
            rateIdx++;
            rateChanged = true;
        }
        balance = Math.max(0, balance - currentRate);
        trace.push({ date: ds, added, rateChanged, currentRate, balance });
        d.setDate(d.getDate() + 1);
    }
    return { balance, trace, startDateStr, skippedRates };
}

function openStockDebug(name) {
    if (!name) {
        toast('⚠️ No item selected');
        return;
    }
    const today = todayStr();
    const stockRecs = godownStock
        .filter(g => g.name === name)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const purchaseRecs = goodsPurchases
        .filter(g => g.name === name)
        .sort((a, b) => a.date.localeCompare(b.date));
    const consumeRecs = feedConsumption
        .filter(f => f.goods === name)
        .sort((a, b) => a.date.localeCompare(b.date));
    const result = closingStockTrace(name, today);

    let html = '<div style="padding:4px 2px 16px">';
    html +=
        '<div class="sec-title">Summary</div><div class="info-table">' +
        ratesRow(
            'Opening record (single, latest)',
            goodsOpeningDate(name) ? fmtDate(goodsOpeningDate(name)) : 'none',
            goodsOpeningBags(name) + ' bags'
        ) +
        ratesRow("Today's rate (consumedBagsOnDate)", '', consumedBagsOnDate(name, today) + '/day') +
        ratesRow('Final closing (today)', '', result.balance + ' bags') +
        '</div>';

    if (result.skippedRates && result.skippedRates.length) {
        html +=
            '<div class="sec-title" style="color:var(--red)">⚠️ Rates dated before opening record</div>' +
            '<div style="font-size:11px;color:var(--red);padding:0 2px 8px">' +
            result.skippedRates.length +
            ' rate entrie(s) were logged before the opening-stock date and are being caught up automatically: ' +
            result.skippedRates.map(r => fmtDate(r.date) + ' → ' + r.bags + '/day').join(', ') +
            '</div>';
    }

    html +=
        '<div class="sec-title">Raw: Opening Stock Records (' +
        stockRecs.length +
        ')</div>' +
        (stockRecs.length
            ? stockRecs
                  .map(
                      g =>
                          '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                          fmtDate(g.date || '') +
                          '</div><div class="lc-sub">id: ' +
                          (g.id || '-') +
                          '</div></div><div style="font-weight:800">' +
                          N(g.bags) +
                          ' bags @ ' +
                          N(g.bagSize) +
                          'kg</div></div></div>'
                  )
                  .join('')
            : '<div class="empty">No opening-stock record</div>');

    html +=
        '<div class="sec-title">Raw: Purchases (' +
        purchaseRecs.length +
        ')</div>' +
        (purchaseRecs.length
            ? purchaseRecs
                  .map(
                      g =>
                          '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                          fmtDate(g.date) +
                          '</div></div><div style="font-weight:800">+' +
                          N(g.bags) +
                          ' bags</div></div></div>'
                  )
                  .join('')
            : '<div class="empty">No purchases</div>');

    html +=
        '<div class="sec-title">Raw: Consumption Rate Log (' +
        consumeRecs.length +
        ')</div>' +
        (consumeRecs.length
            ? consumeRecs
                  .map(
                      f =>
                          '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                          fmtDate(f.date) +
                          '</div></div><div style="font-weight:800">' +
                          N(f.bags) +
                          '/day</div></div></div>'
                  )
                  .join('')
            : '<div class="empty">No consumption logged</div>');

    html +=
        '<div class="sec-title">Day-by-Day Walk (' +
        result.trace.length +
        ' days, from ' +
        (result.startDateStr ? fmtDate(result.startDateStr) : '-') +
        ')</div>' +
        '<div style="font-size:10px;color:var(--muted);padding:0 2px 6px">Shows every day only the first/last 10 plus any day the rate changed or stock ran short - full detail, not just a summary.</div>';
    const importantDays = result.trace.filter(
        (t, i) => i < 10 || i >= result.trace.length - 10 || t.rateChanged || t.added > 0
    );
    html +=
        importantDays
            .map(
                t =>
                    '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                    fmtDate(t.date) +
                    (t.added > 0 ? ' <span style="color:var(--green)">+' + t.added + '</span>' : '') +
                    (t.rateChanged
                        ? ' <span style="color:var(--blue)">rate→' + t.currentRate + '/day</span>'
                        : '') +
                    '</div></div><div style="font-weight:800">' +
                    t.balance +
                    '</div></div></div>'
            )
            .join('') || '<div class="empty">No days walked</div>';

    html += '</div>';
    $('stock-debug-body').innerHTML = html;
    openModal('modal-stock-debug');
}
// entries are a standing daily RATE (not a one-time amount - see comment
// above), this walks each rate segment and multiplies rate x bagSize x the
// number of days that rate was actually in effect, up through today.
function totalKgConsumedAllTime(name) {
    const bagSize = goodsBagSize(name);
    const recs = feedConsumption
        .filter(f => f.goods === name)
        .map(f => ({ date: f.date, bags: N(f.bags) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    if (!recs.length) return 0;
    const today = todayStr();
    let totalKg = 0;
    for (let i = 0; i < recs.length; i++) {
        const segStart = recs[i].date;
        const segEnd = i + 1 < recs.length ? addDays(recs[i + 1].date, -1) : today;
        if (segEnd < segStart) continue;
        const days = daysBetween(segStart, segEnd) + 1;
        totalKg += recs[i].bags * bagSize * days;
    }
    return totalKg;
}

// ======================================================
//  FEED NUTRITION LIBRARY + AUTOMATIC TMR CALCULATOR
//  Values below are typical/approximate (as-fed basis) for common
//  Indian dairy feed ingredients - edit per your supplier/lab report
//  for exact accuracy, since actual values vary by batch & processing.
// ======================================================
const FEED_NUTRITION_REFERENCE = {
    'KAPAS KHALI': { protein: 20, energy: 1.9, fat: 5, ee: 5, tdn: 55, fibre: 25, silica: 1.5 },
    'COTTON DOC': { protein: 28, energy: 2.0, fat: 1.5, ee: 1.5, tdn: 60, fibre: 14, silica: 1 },
    DDGS: { protein: 28, energy: 2.6, fat: 9, ee: 9, tdn: 78, fibre: 5, silica: 0.5 },
    'TUWAR CHUNI': { protein: 13, energy: 1.9, fat: 2, ee: 2, tdn: 62, fibre: 7, silica: 0.5 },
    'CHANA CHUNI': { protein: 16, energy: 2.0, fat: 2, ee: 2, tdn: 65, fibre: 8, silica: 0.5 },
    'MAKAI CHUNI': { protein: 10, energy: 2.2, fat: 4, ee: 4, tdn: 70, fibre: 6, silica: 0.5 },
    'SARSO DOC': { protein: 36, energy: 1.9, fat: 1.5, ee: 1.5, tdn: 65, fibre: 6, silica: 2 },
    'MAKAI CHALA': { protein: 4.5, energy: 1.4, fat: 1, ee: 1, tdn: 50, fibre: 5, silica: 0.4 },
    'SOYA HULLS': { protein: 12, energy: 2.1, fat: 2, ee: 2, tdn: 68, fibre: 35, silica: 1 },
    'KADBA KUTTI': { protein: 4, energy: 1.5, fat: 1, ee: 1, tdn: 50, fibre: 40, silica: 2 },
    'GANNA KUTTI': { protein: 3, energy: 1.7, fat: 1, ee: 1, tdn: 58, fibre: 30, silica: 1 },
    SAILAGE: { protein: 8, energy: 1.9, fat: 3, ee: 3, tdn: 62, fibre: 25, silica: 1 },
    'WHEAT STRAW': { protein: 3.5, energy: 1.2, fat: 1, ee: 1, tdn: 42, fibre: 38, silica: 2 },
    'POHA KANI': { protein: 7.5, energy: 2.4, fat: 1, ee: 1, tdn: 78, fibre: 3, silica: 0.3 },
    'RICE POLISH': { protein: 12.5, energy: 2.5, fat: 9, ee: 9, tdn: 72, fibre: 8, silica: 1 },
    OIL: { protein: 0, energy: 8.0, fat: 99, ee: 99, tdn: 220, fibre: 0, silica: 0 },
    'JAWARI CHUNI': { protein: 10, energy: 2.0, fat: 3, ee: 3, tdn: 67, fibre: 6, silica: 0.5 },
    'UDAT CHUNI': { protein: 15, energy: 1.9, fat: 2, ee: 2, tdn: 65, fibre: 7, silica: 0.5 },
    'RICE STRAW': { protein: 3, energy: 1.1, fat: 1, ee: 1, tdn: 40, fibre: 38, silica: 2 },
    BISCUIT: { protein: 8.5, energy: 3.6, fat: 13, ee: 13, tdn: 88, fibre: 5, silica: 0.3 },
    // Additional raw materials matching common T.M.R. formulation sheets
    'COTTON SEED CAKE': { protein: 20, energy: 3.6, fat: 7, ee: 7, tdn: 70, fibre: 26, silica: 1 },
    'WHEAT BRAN': { protein: 13.5, energy: 2.8, fat: 3.5, ee: 3.5, tdn: 72, fibre: 12, silica: 1 },
    'MAIZE DDGS': { protein: 28, energy: 3.4, fat: 8, ee: 8, tdn: 80, fibre: 5, silica: 0.5 },
    'MAIZE CHUNI': { protein: 8.5, energy: 3.3, fat: 3.5, ee: 3.5, tdn: 84, fibre: 6, silica: 0.5 },
    'TUAR CHUNI': { protein: 18, energy: 3.1, fat: 3.5, ee: 3.5, tdn: 80, fibre: 7, silica: 0.5 },
    'TOPIOKA BHUSI': { protein: 11, energy: 2.8, fat: 3, ee: 3, tdn: 74, fibre: 7, silica: 0.5 },
    'MAIZE MALAI': { protein: 10, energy: 3.4, fat: 8, ee: 8, tdn: 80, fibre: 5, silica: 0.4 },
    'PADDY STRAW': { protein: 4.4, energy: 1.4, fat: 0.5, ee: 0.5, tdn: 48, fibre: 38, silica: 2 },
    'KAPAS OLD': { protein: 20, energy: 3.4, fat: 6, ee: 6, tdn: 75, fibre: 25, silica: 1.5 },
    'PALM KHALI': { protein: 14, energy: 2.85, fat: 8, ee: 8, tdn: 76, fibre: 8, silica: 0.5 },
    BISCUITS: { protein: 7, energy: 4.0, fat: 8, ee: 8, tdn: 84, fibre: 5, silica: 0.3 },
    BEER: { protein: 8, energy: 3.3, fat: 5, ee: 5, tdn: 80, fibre: 4, silica: 0.5 },
    'NOBLE PREMIX': { protein: 0, energy: 0.9, fat: 0, ee: 0, tdn: 90, fibre: 0, silica: 0 },
    'MUSTARD OIL': { protein: 0, energy: 9.0, fat: 99, ee: 99, tdn: 160, fibre: 0, silica: 0 },
    JAGGERY: { protein: 4, energy: 4.0, fat: 0, ee: 0, tdn: 80, fibre: 0, silica: 0 },
    'RICE DDGS': { protein: 45, energy: 3.2, fat: 1, ee: 1, tdn: 80, fibre: 8, silica: 1 }
};
// Default feed names shown even before any purchase/consumption entry exists.
const DEFAULT_FEED_NAMES = Object.keys(FEED_NUTRITION_REFERENCE);

// Auto-create a feedNutrition library row (using reference defaults where the
// name matches) for every feed name that appears anywhere in the app, so the
// table is always populated automatically - no manual "add feed" step needed.
async function ensureFeedNutritionDefaults() {
    // Self-heal: remove any duplicate rows that share the same feed name
    // (case/whitespace-insensitive) - keeps whichever copy has the most
    // filled-in values, deletes the rest from storage.
    {
        const seen = new Map();
        const toDelete = [];
        for (const f of feedNutrition) {
            const key = (f.name || '').trim().toUpperCase();
            if (!key) continue;
            if (seen.has(key)) {
                const kept = seen.get(key);
                const score = x =>
                    ['protein', 'energy', 'fat', 'fibre', 'silica', 'ee', 'tdn'].filter(k => N(x[k]) > 0)
                        .length;
                if (score(f) > score(kept)) {
                    toDelete.push(kept.id);
                    seen.set(key, f);
                } else {
                    toDelete.push(f.id);
                }
            } else {
                seen.set(key, f);
            }
        }
        if (toDelete.length) {
            for (const id of toDelete) {
                await dbDelete('feedNutrition', id, true);
            }
            feedNutrition = feedNutrition.filter(f => !toDelete.includes(f.id));
        }
    }
    // One-time fix: earlier version mistakenly saved this feed as "Malai Chala" -
    // rename any existing record in place instead of leaving stale/duplicate data.
    const staleIdx = feedNutrition.findIndex(f => (f.name || '').toUpperCase() === 'MALAI CHALA');
    if (staleIdx >= 0) {
        const fixed = { ...feedNutrition[staleIdx], name: 'Makai Chala' };
        feedNutrition[staleIdx] = fixed;
        await dbPut('feedNutrition', fixed, true);
    }
    const removedNames = new Set((settings.removedFeedNutritionNames || []).map(n => n.toUpperCase()));
    const names = new Set([
        ...DEFAULT_FEED_NAMES,
        ...godownGoodsNames(),
        ...feedConsumption.map(f => f.goods)
    ]);
    let changed = false;
    for (const rawName of names) {
        const name = (rawName || '').trim();
        if (!name) continue;
        if (removedNames.has(name.toUpperCase())) continue;
        const exists = feedNutrition.find(f => (f.name || '').toUpperCase() === name.toUpperCase());
        if (exists) continue;
        const ref = FEED_NUTRITION_REFERENCE[name.toUpperCase()] || {
            protein: 0,
            energy: 0,
            fat: 0,
            ee: 0,
            tdn: 0,
            fibre: 0,
            silica: 0
        };
        const entry = {
            id: uid(),
            name,
            protein: ref.protein,
            energy: ref.energy,
            fat: ref.fat,
            ee: ref.ee,
            tdn: ref.tdn,
            fibre: ref.fibre || 0,
            silica: ref.silica || 0
        };
        feedNutrition.push(entry);
        await dbPut('feedNutrition', entry, true);
        changed = true;
    }
    // Migration: older saved rows were created before Fibre/Silica existed -
    // backfill them from the reference table (or 0) so every row/column is complete.
    for (let i = 0; i < feedNutrition.length; i++) {
        const f = feedNutrition[i];
        if (f.fibre !== undefined && f.silica !== undefined) continue;
        const ref = FEED_NUTRITION_REFERENCE[(f.name || '').toUpperCase()] || {};
        const fixed = { ...f, fibre: f.fibre ?? (ref.fibre || 0), silica: f.silica ?? (ref.silica || 0) };
        feedNutrition[i] = fixed;
        await dbPut('feedNutrition', fixed, true);
        changed = true;
    }
    if (changed) feedNutrition.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// Called when the user edits a nutrition value inline in the library table.
async function updateFeedNutritionValue(id, field, value) {
    const idx = feedNutrition.findIndex(f => f.id === id);
    if (idx < 0) return;
    const entry = { ...feedNutrition[idx], [field]: N(value) };
    feedNutrition[idx] = entry;
    await dbPut('feedNutrition', entry);
    renderTMRSummary();
}

function toggleAddFeedRow() {
    const row = document.getElementById('add-feed-row');
    if (!row) return;
    const showing = row.style.display === 'flex';
    row.style.display = showing ? 'none' : 'flex';
    if (!showing) {
        const inp = document.getElementById('new-feed-name');
        if (inp) {
            inp.value = '';
            inp.focus();
        }
    }
}

// Manually add a custom feed name to the nutrition library (e.g. a feed that
// hasn't been purchased/consumed yet, so it can be prepped ahead of time).
async function addFeedNutritionRow() {
    const inp = document.getElementById('new-feed-name');
    const name = (inp?.value || '').trim();
    if (!name) {
        toast('⚠️ Enter a feed name');
        return;
    }
    const exists = feedNutrition.find(f => (f.name || '').toUpperCase() === name.toUpperCase());
    if (exists) {
        toast('⚠️ "' + name + '" already exists in the table');
        return;
    }
    const ref = FEED_NUTRITION_REFERENCE[name.toUpperCase()] || {
        protein: 0,
        energy: 0,
        fat: 0,
        ee: 0,
        tdn: 0,
        fibre: 0,
        silica: 0
    };
    const entry = {
        id: uid(),
        name,
        protein: ref.protein,
        energy: ref.energy,
        fat: ref.fat,
        ee: ref.ee,
        tdn: ref.tdn,
        fibre: ref.fibre || 0,
        silica: ref.silica || 0
    };
    feedNutrition.push(entry);
    await dbPut('feedNutrition', entry);
    if ((settings.removedFeedNutritionNames || []).some(n => n.toUpperCase() === name.toUpperCase())) {
        settings = {
            ...settings,
            removedFeedNutritionNames: settings.removedFeedNutritionNames.filter(
                n => n.toUpperCase() !== name.toUpperCase()
            )
        };
        await dbPut('settings', settings);
    }
    toggleAddFeedRow();
    renderFeedNutritionTable();
    renderTMRSummary();
    toast('✅ "' + name + '" added - tap its cells to fill in Protein/Fat/Fibre/etc.', 3000);
}

// Remove a feed name from the nutrition library. Note: if this feed still has
// Godown Stock or Feed Consumed entries, ensureFeedNutritionDefaults() will
// automatically re-add it (with default 0 values) the next time the app loads,
// since the table always reflects what's actually in stock/being fed.
async function removeFeedNutritionRow(id) {
    const idx = feedNutrition.findIndex(f => f.id === id);
    if (idx < 0) return;
    const name = feedNutrition[idx].name;
    openGenericConfirm('Remove Feed?', 'Remove "' + name + '" from the Feed Nutrition table?', async () => {
        const i2 = feedNutrition.findIndex(f => f.id === id);
        if (i2 < 0) return;
        feedNutrition.splice(i2, 1);
        await dbDelete('feedNutrition', id);
        const removed = new Set(settings.removedFeedNutritionNames || []);
        removed.add(name.toUpperCase());
        settings = { ...settings, removedFeedNutritionNames: [...removed] };
        await dbPut('settings', settings);
        renderFeedNutritionTable();
        renderTMRSummary();
        toast('🗑 "' + name + '" removed');
    });
}

function renderFeedNutritionTable() {
    const el = document.getElementById('feed-nutrition-table');
    if (!el) return;
    if (!feedNutrition.length) {
        el.innerHTML = '<div class="empty" style="padding:16px">No feed nutrition data yet</div>';
        return;
    }
    const sorted = [...feedNutrition].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const cell = (f, field, unit) =>
        '<td style="padding:4px 5px;text-align:center">' +
        '<input type="number" inputmode="decimal" value="' +
        (f[field] ?? 0) +
        '" style="width:52px;border:1.5px solid var(--border);border-radius:6px;padding:4px;font-size:11px;text-align:center;color:var(--ink);background:var(--card)" ' +
        'onchange="updateFeedNutritionValue(\'' +
        f.id +
        "','" +
        field +
        '\',this.value)"></td>';
    let html =
        '<table style="border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden;font-size:11px;box-shadow:var(--shadow);min-width:100%">' +
        '<thead><tr>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 8px;text-align:left;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Feed Name</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Protein<br>%</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Energy<br>Mcal/kg</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Fat<br>%</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Fibre<br>%</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Silica<br>%</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Ether<br>Extract %</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">TDN<br>%</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">Rate<br>₹/Kg</th>' +
        '<th style="background:var(--teal);color:#fff;padding:6px 5px;text-align:center;font-size:10px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)"></th>' +
        '</tr></thead><tbody>';
    for (const f of sorted) {
        const rate = goodsRate(f.name);
        html +=
            '<tr>' +
            '<td style="padding:6px 8px;font-weight:700;color:var(--ink);font-size:10px">' +
            f.name +
            '</td>' +
            cell(f, 'protein') +
            cell(f, 'energy') +
            cell(f, 'fat') +
            cell(f, 'fibre') +
            cell(f, 'silica') +
            cell(f, 'ee') +
            cell(f, 'tdn') +
            '<td style="padding:6px 5px;text-align:center;font-weight:700;color:var(--amber)">' +
            (rate ? rate.toFixed(1) : '-') +
            '</td>' +
            '<td style="padding:6px 5px;text-align:center"><button onclick="removeFeedNutritionRow(\'' +
            f.id +
            '\')" style="background:none;border:none;color:var(--red);font-size:14px;cursor:pointer;padding:2px 4px" title="Remove ' +
            f.name +
            '">🗑</button></td>' +
            '</tr>';
    }
    html +=
        '</tbody></table>' +
        '<div style="font-size:9px;color:var(--light);font-style:italic;margin-top:5px;padding:0 2px">Values are typical estimates - edit any cell to match your supplier/lab report.</div>';
    el.innerHTML = html;
}

function setTMRToday() {
    const today = todayStr();
    const fromEl = document.getElementById('tmr-from');
    const toEl = document.getElementById('tmr-to');
    if (fromEl) fromEl.value = today;
    if (toEl) toEl.value = today;
    renderTMRSummary();
}

// Persist an edit made to a TMR standard/target cell or the buffalo daily
// requirement, then re-render so cost/animal and comparisons stay in sync.
async function updateTMRSetting(field, value) {
    settings = { ...settings, [field]: N(value) };
    await dbPut('settings', settings);
    renderTMRSummary();
}

// Add a raw material to the T.M.R. chart that isn't (yet) in today's actual
// Feed Consumed log - e.g. to plan a formulation ahead of time. Its Usage Kg
// is manually editable since there's no real consumption entry backing it.
async function addTMRManualFeed() {
    const nameInp = $('tmr-add-name'),
        kgInp = $('tmr-add-kg');
    const name = (nameInp?.value || '').trim();
    const kg = N(kgInp?.value);
    if (!name) {
        toast('⚠️ Enter a feed name');
        return;
    }
    let nutEntry = feedNutrition.find(f => (f.name || '').toUpperCase() === name.toUpperCase());
    if (!nutEntry) {
        const ref = FEED_NUTRITION_REFERENCE[name.toUpperCase()] || {
            protein: 0,
            energy: 0,
            fat: 0,
            ee: 0,
            tdn: 0,
            fibre: 0,
            silica: 0
        };
        nutEntry = {
            id: uid(),
            name,
            protein: ref.protein,
            energy: ref.energy,
            fat: ref.fat,
            ee: ref.ee,
            tdn: ref.tdn,
            fibre: ref.fibre || 0,
            silica: ref.silica || 0
        };
        feedNutrition.push(nutEntry);
        await dbPut('feedNutrition', nutEntry);
    }
    let excluded = settings.tmrExcludedFeeds || [];
    if (excluded.some(n => n.toUpperCase() === name.toUpperCase())) {
        excluded = excluded.filter(n => n.toUpperCase() !== name.toUpperCase());
    }
    const manual = [...(settings.tmrManualFeeds || [])];
    const mIdx = manual.findIndex(m => m.name.toUpperCase() === name.toUpperCase());
    if (mIdx >= 0) manual[mIdx] = { name, kg };
    else manual.push({ name, kg });
    settings = { ...settings, tmrManualFeeds: manual, tmrExcludedFeeds: excluded };
    await dbPut('settings', settings);
    if (nameInp) nameInp.value = '';
    if (kgInp) kgInp.value = '';
    renderTMRSummary();
    toast('✅ "' + name + '" added to T.M.R. table');
}

// Update the manually-entered Usage Kg for a planning-only (non-consumption)
// raw material row.
async function updateTMRManualKg(name, value) {
    const manual = [...(settings.tmrManualFeeds || [])];
    const idx = manual.findIndex(m => m.name.toUpperCase() === name.toUpperCase());
    if (idx < 0) return;
    manual[idx] = { ...manual[idx], kg: N(value) };
    settings = { ...settings, tmrManualFeeds: manual };
    await dbPut('settings', settings);
    renderTMRSummary();
}

// Remove a raw material from the T.M.R. chart. For a manually-added row this
// deletes the planning entry outright. For a row that's driven by an actual
// Feed Consumed log, this only hides it from the chart (the real consumption
// data is untouched) - use "Restore hidden feeds" to bring it back.
async function removeTMRRow(name, isAuto) {
    if (isAuto) {
        const excluded = new Set(settings.tmrExcludedFeeds || []);
        excluded.add(name);
        settings = { ...settings, tmrExcludedFeeds: [...excluded] };
    } else {
        settings = {
            ...settings,
            tmrManualFeeds: (settings.tmrManualFeeds || []).filter(
                m => m.name.toUpperCase() !== name.toUpperCase()
            )
        };
    }
    await dbPut('settings', settings);
    renderTMRSummary();
    toast('🗑 "' + name + '" removed' + (isAuto ? ' from this chart (feed log kept)' : ''));
}

async function restoreTMRExcluded() {
    settings = { ...settings, tmrExcludedFeeds: [] };
    await dbPut('settings', settings);
    renderTMRSummary();
    toast('✅ Hidden feeds restored to the chart');
}

// Builds the T.M.R. Feed Formulation chart styled after the reference sheet:
// raw-material breakdown (Protein/Oil/Fibre/Silica/Energy/T.D.N./Rate/Usage
// Kg/%) plus a Nutrients/Standards/Unit summary panel. Raw materials are
// listed automatically from actual Feed Consumed entries in the selected date
// range (no manual entry needed) - "+ Add Feed" below the table lets you plan
// in an extra raw material ahead of time, and 🗑 on any row removes it from
// the chart (a manually-added row is deleted outright; a real consumption row
// is just hidden from this chart, never from the underlying feed log).
function renderTMRSummary() {
    const el = document.getElementById('tmr-summary-table');
    if (!el) return;
    const fromEl = document.getElementById('tmr-from');
    const toEl = document.getElementById('tmr-to');
    if (fromEl && !fromEl.value) fromEl.value = todayStr();
    if (toEl && !toEl.value) toEl.value = todayStr();
    const from = fromEl ? fromEl.value : todayStr();
    const to = toEl ? toEl.value : todayStr();

    const excluded = new Set((settings.tmrExcludedFeeds || []).map(n => n.toUpperCase()));
    const kgByGoods = {};
    const allGoodsNames = [...new Set([...godownGoodsNames(), ...feedConsumption.map(f => f.goods)])];
    let d = from,
        guard = 0;
    while (d <= to && guard < 1000) {
        for (const name of allGoodsNames) {
            if (excluded.has((name || '').toUpperCase())) continue;
            const bags = consumedBagsOnDate(name, d);
            if (bags > 0) kgByGoods[name] = (kgByGoods[name] || 0) + bags * goodsBagSize(name);
        }
        d = addDays(d, 1);
        guard++;
    }
    const autoNames = new Set(Object.keys(kgByGoods).map(n => n.toUpperCase()));

    const rows = Object.keys(kgByGoods).map(name => {
        const kg = kgByGoods[name];
        const nut = feedNutrition.find(n => (n.name || '').toUpperCase() === name.toUpperCase()) || {
            protein: 0,
            energy: 0,
            fat: 0,
            ee: 0,
            tdn: 0,
            fibre: 0,
            silica: 0
        };
        const rate = goodsRate(name);
        return { name, kg, nut, rate, cost: kg * rate, isAuto: true };
    });
    for (const m of settings.tmrManualFeeds || []) {
        if (autoNames.has(m.name.toUpperCase())) continue;
        if (excluded.has(m.name.toUpperCase())) continue;
        const nut = feedNutrition.find(n => (n.name || '').toUpperCase() === m.name.toUpperCase()) || {
            protein: 0,
            energy: 0,
            fat: 0,
            ee: 0,
            tdn: 0,
            fibre: 0,
            silica: 0
        };
        const rate = goodsRate(m.name);
        rows.push({ name: m.name, kg: N(m.kg), nut, rate, cost: N(m.kg) * rate, isAuto: false });
    }
    rows.sort((a, b) => b.kg - a.kg);

    const hiddenCount = (settings.tmrExcludedFeeds || []).length;
    const addRowHtml =
        '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap">' +
        '<input list="tmr-feed-options" id="tmr-add-name" placeholder="Feed name (e.g. Wheat Bran)" style="flex:1;min-width:130px;border:1.5px solid var(--border);border-radius:6px;padding:7px 9px;font-size:11px;background:var(--card);color:var(--ink)">' +
        '<datalist id="tmr-feed-options">' +
        feedNutrition.map(f => '<option value="' + f.name + '">').join('') +
        '</datalist>' +
        '<input type="number" inputmode="decimal" id="tmr-add-kg" placeholder="Usage Kg" style="width:82px;border:1.5px solid var(--border);border-radius:6px;padding:7px 9px;font-size:11px;background:var(--card);color:var(--ink)">' +
        '<button onclick="addTMRManualFeed()" style="background:var(--blue);color:#fff;border:none;border-radius:6px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">+ Add Feed</button>' +
        (hiddenCount
            ? '<button onclick="restoreTMRExcluded()" style="background:var(--bg);color:var(--muted);border:1.5px solid var(--border);border-radius:6px;padding:7px 10px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">↺ Restore ' +
              hiddenCount +
              ' hidden</button>'
            : '') +
        '</div>';

    if (!rows.length) {
        el.innerHTML =
            '<div class="empty" style="padding:16px">No feeds in this date range</div>' + addRowHtml;
        return;
    }

    const totalKg = rows.reduce((s, r) => s + r.kg, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const wAvg = field => (totalKg > 0 ? rows.reduce((s, r) => s + r.kg * N(r.nut[field]), 0) / totalKg : 0);
    const avgProtein = wAvg('protein'),
        avgEnergy = wAvg('energy'),
        avgFat = wAvg('fat'),
        avgFibre = wAvg('fibre'),
        avgSilica = wAvg('silica'),
        avgTDN = wAvg('tdn');
    const costPerKg = totalKg > 0 ? totalCost / totalKg : 0;
    const buffaloReq = N(settings.tmrBuffaloReqKg);
    const costPerAnimal = costPerKg * buffaloReq;
    const totalProteinKg = (totalKg * avgProtein) / 100;
    const totalOilKg = (totalKg * avgFat) / 100;

    const th = (label, bg) =>
        '<th style="background:' +
        (bg || 'var(--amber)') +
        ';color:#fff;padding:6px 5px;text-align:center;font-size:9px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">' +
        label +
        '</th>';
    const td = (v, color, bold) =>
        '<td style="padding:6px 5px;text-align:center;' +
        (bold ? 'font-weight:800;' : '') +
        'color:' +
        (color || 'var(--muted)') +
        ';font-size:10px">' +
        v +
        '</td>';
    const stripes = ['var(--blue-lt)', 'var(--red-lt)', 'var(--border)', 'var(--green-lt)'];

    // ── Raw-material breakdown table (mirrors the T.M.R. Feed Formulation sheet) ──
    let html =
        '<div style="font-size:10px;font-weight:800;color:var(--ink);margin-bottom:5px">🥣 T.M.R. FEED FORMULATION ' +
        '<span style="font-weight:400;color:var(--light)">(' +
        fmtDate(from) +
        ' - ' +
        fmtDate(to) +
        ')</span></div>' +
        '<div style="overflow-x:auto"><table style="border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden;font-size:11px;box-shadow:var(--shadow);min-width:100%">' +
        '<thead><tr>' +
        '<th style="background:var(--amber);color:#fff;padding:6px 8px;text-align:left;font-size:9px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">RAW MATERIAL</th>' +
        th('Protein<br>%') +
        th('Oil<br>%') +
        th('Fibre<br>%') +
        th('Silica<br>%') +
        th('Energy<br>Mcal') +
        th('T.D.N.<br>%') +
        th('Rate<br>₹/Kg') +
        th('Usage<br>KG') +
        th('%') +
        th('') +
        '</tr></thead><tbody>';
    rows.forEach((r, i) => {
        const pct = totalKg > 0 ? (r.kg / totalKg) * 100 : 0;
        const usageCell = r.isAuto
            ? td(r.kg.toFixed(1), 'var(--blue)', true)
            : '<td style="padding:4px 5px;text-align:center"><input type="number" inputmode="decimal" value="' +
              r.kg +
              '" style="width:56px;border:1.5px solid var(--blue);border-radius:6px;padding:3px;font-size:10px;text-align:center;color:var(--blue);font-weight:700;background:var(--card)" ' +
              'onchange="updateTMRManualKg(\'' +
              r.name.replace(/'/g, "\\'") +
              '\',this.value)"></td>';
        html +=
            '<tr style="background:' +
            stripes[i % stripes.length] +
            '">' +
            '<td style="padding:6px 8px;font-weight:700;color:var(--ink);font-size:10px;white-space:nowrap">' +
            r.name +
            (r.isAuto
                ? ''
                : ' <span style="font-weight:400;color:var(--light);font-size:9px">(planned)</span>') +
            '</td>' +
            td(N(r.nut.protein).toFixed(1)) +
            td(N(r.nut.fat).toFixed(1)) +
            td(N(r.nut.fibre).toFixed(1)) +
            td(N(r.nut.silica).toFixed(2)) +
            td(N(r.nut.energy).toFixed(1)) +
            td(N(r.nut.tdn).toFixed(1)) +
            td(r.rate ? r.rate.toFixed(1) : '-', 'var(--amber)') +
            usageCell +
            td(pct.toFixed(2) + '%', 'var(--green)') +
            '<td style="padding:4px 5px;text-align:center"><button onclick="removeTMRRow(\'' +
            r.name.replace(/'/g, "\\'") +
            "'," +
            r.isAuto +
            ')" style="background:none;border:none;color:var(--red);font-size:13px;cursor:pointer;padding:2px 4px" title="Remove ' +
            r.name +
            '">🗑</button></td>' +
            '</tr>';
    });
    html +=
        '<tr style="background:#F87171">' +
        '<td style="padding:6px 8px;font-weight:800;color:#fff;font-size:10px" colspan="6">TOTAL</td>' +
        '<td style="padding:6px 5px;text-align:center;font-weight:800;color:#fff">-</td>' +
        '<td style="padding:6px 5px;text-align:center;font-weight:800;color:#fff">-</td>' +
        '<td style="padding:6px 5px;text-align:center;font-weight:800;color:#fff">' +
        totalKg.toFixed(1) +
        '</td>' +
        '<td style="padding:6px 5px;text-align:center;font-weight:800;color:#fff">100.00%</td>' +
        '<td></td>' +
        '</tr>';
    html += '</tbody></table></div>' + addRowHtml;

    // ── Cost & nutrient summary panel ─────────────────────────────────────
    const stdInput = (field, val, w) =>
        '<input type="number" inputmode="decimal" value="' +
        val +
        '" style="width:' +
        (w || 40) +
        'px;border:1.5px solid var(--border);border-radius:6px;padding:3px;font-size:10px;text-align:center;color:var(--ink);background:var(--card)" ' +
        'onchange="updateTMRSetting(\'' +
        field +
        '\',this.value)">';

    html +=
        '<div style="margin-top:10px;overflow-x:auto">' +
        '<table style="border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden;font-size:10px;box-shadow:var(--shadow);min-width:100%">' +
        '<thead><tr>' +
        '<th style="background:var(--green);color:#fff;padding:6px 8px;text-align:left;font-size:9px;white-space:nowrap;border:1px solid rgba(255,255,255,.2)">PARAMETER</th>' +
        th('Protein<br>%', 'var(--green)') +
        th('Oil/Fat<br>%', 'var(--green)') +
        th('Fibre<br>%', 'var(--green)') +
        th('Silica<br>%', 'var(--green)') +
        th('TDN<br>%', 'var(--green)') +
        th('Energy<br>Mcal', 'var(--green)') +
        '</tr></thead><tbody>' +
        '<tr style="background:var(--green-lt)">' +
        '<td style="padding:6px 8px;font-weight:800;color:var(--green)">Nutrients</td>' +
        td(avgProtein.toFixed(2), 'var(--green)') +
        td(avgFat.toFixed(2), 'var(--green)') +
        td(avgFibre.toFixed(2), 'var(--green)') +
        td(avgSilica.toFixed(2), 'var(--green)') +
        td(avgTDN.toFixed(2), 'var(--green)') +
        td(N(avgEnergy).toFixed(2), 'var(--green)') +
        '</tr>' +
        '<tr>' +
        '<td style="padding:6px 8px;font-weight:700;color:var(--ink)">Standards</td>' +
        '<td style="padding:4px 5px;text-align:center">' +
        stdInput('tmrStdProtein', settings.tmrStdProtein) +
        '</td>' +
        '<td style="padding:4px 5px;text-align:center">' +
        stdInput('tmrStdFat', settings.tmrStdFat) +
        '</td>' +
        '<td style="padding:4px 5px;text-align:center">' +
        stdInput('tmrStdFibre', settings.tmrStdFibre) +
        '</td>' +
        '<td style="padding:4px 5px;text-align:center">' +
        stdInput('tmrStdSilica', settings.tmrStdSilica) +
        '</td>' +
        '<td style="padding:4px 5px;text-align:center">' +
        stdInput('tmrStdTDN', settings.tmrStdTDN) +
        '</td>' +
        '<td style="padding:4px 5px;text-align:center">' +
        stdInput('tmrStdEnergy', settings.tmrStdEnergy) +
        '</td>' +
        '</tr>' +
        '<tr style="background:var(--bg)">' +
        '<td style="padding:5px 8px;font-weight:700;color:var(--light);font-size:9px">Unit</td>' +
        td('%') +
        td('%') +
        td('%') +
        td('%') +
        td('%') +
        td('Mcal/kg') +
        '</tr>' +
        '</tbody></table></div>';

    html +=
        '<div class="g2" style="margin-top:8px">' +
        '<div class="avg-card" style="border-left-color:var(--amber)"><span class="ac-icon">💰</span>' +
        '<div class="ac-body"><div class="ac-label">Cost / Kg</div><div style="font-size:15px;font-weight:800;color:var(--amber)">₹' +
        costPerKg.toFixed(2) +
        '</div></div></div>' +
        '<div class="avg-card" style="border-left-color:var(--blue)"><span class="ac-icon">⚖️</span>' +
        '<div class="ac-body"><div class="ac-label">Total Kg Fed</div><div style="font-size:15px;font-weight:800;color:var(--blue)">' +
        totalKg.toFixed(1) +
        ' kg</div></div></div>' +
        '<div class="avg-card" style="border-left-color:var(--teal)"><span class="ac-icon">🐃</span>' +
        '<div class="ac-body"><div class="ac-label">Buffalo Req/Day</div>' +
        stdInput('tmrBuffaloReqKg', buffaloReq, 50) +
        ' kg</div></div>' +
        '<div class="avg-card" style="border-left-color:var(--purple)"><span class="ac-icon">🧾</span>' +
        '<div class="ac-body"><div class="ac-label">Cost / Animal / Day</div><div style="font-size:15px;font-weight:800;color:var(--purple)">₹' +
        costPerAnimal.toFixed(2) +
        '</div></div></div>' +
        '<div class="avg-card" style="border-left-color:var(--green)"><span class="ac-icon">🥩</span>' +
        '<div class="ac-body"><div class="ac-label">Total Protein Supplied</div><div style="font-size:15px;font-weight:800;color:var(--green)">' +
        totalProteinKg.toFixed(1) +
        ' kg</div></div></div>' +
        '<div class="avg-card" style="border-left-color:var(--red)"><span class="ac-icon">🫙</span>' +
        '<div class="ac-body"><div class="ac-label">Total Oil Supplied</div><div style="font-size:15px;font-weight:800;color:var(--red)">' +
        totalOilKg.toFixed(1) +
        ' kg</div></div></div>' +
        '</div>';

    el.innerHTML = html;
}

function renderFeedNutritionSection() {
    renderFeedNutritionTable();
    renderTMRSummary();
}

// ======================================================
//  STOCK BOOK - RENDER
// ======================================================
function renderStock() {
    const dl = document.getElementById('godown-goods-list');
    if (dl)
        dl.innerHTML = godownGoodsNames()
            .map(n => '<option value="' + n + '">')
            .join('');
    renderFeedLowAlert();
    const names = godownGoodsNames();
    let godownValue = 0,
        totalFeedKgToday = 0,
        totalCostAllTime = 0,
        totalKgAllTime = 0;
    const today = todayStr();
    const lowStockAlerts = [];

    for (const name of names) {
        const closing = goodsClosingBags(name);
        const bagSize = goodsBagSize(name);
        const rate = goodsRate(name);
        godownValue += closing * bagSize * rate;
        const todayBags = consumedBagsOnDate(name, today);
        if (todayBags > 0) {
            const daysLeft = stockDaysLeft(closing, todayBags);
            if (daysLeft !== null && daysLeft <= 7) lowStockAlerts.push({ name, daysLeft, closing });
            totalFeedKgToday += todayBags * bagSize;
        }
    }
    for (const p of goodsPurchases) {
        totalCostAllTime += N(p.bill);
        totalKgAllTime += N(p.weight);
    }
    const avgFeedCostPerKg = totalKgAllTime > 0 ? totalCostAllTime / totalKgAllTime : 0;

    let shedAnimalCount = 0;
    for (const a of animals) {
        if (['Slaughtered', 'Dead'].includes(a.status)) continue;
        if (['Shed A', 'Shed B', 'Yard A', 'Yard B'].includes(a.location)) shedAnimalCount++;
    }
    const avgFeedPerBuffalo = shedAnimalCount > 0 ? totalFeedKgToday / shedAnimalCount : 0;

    // One entry per consumption rate SEGMENT (not per raw log record) -
    // each segment's kg is the daily rate integrated over how many days
    // that rate actually applied, through today. See totalKgConsumedAllTime
    // for the same logic applied per-goods.
    const newFeedLogs = [];
    godownGoodsNames().forEach(function (name) {
        const bagSize = goodsBagSize(name);
        const rate = goodsRate(name);
        const recs = feedConsumption
            .filter(function (f) {
                return f.goods === name;
            })
            .map(function (f) {
                return { date: f.date, bags: N(f.bags) };
            })
            .sort(function (a, b) {
                return a.date.localeCompare(b.date);
            });
        for (let ri = 0; ri < recs.length; ri++) {
            const segStart = recs[ri].date;
            const segEnd = ri + 1 < recs.length ? addDays(recs[ri + 1].date, -1) : today;
            if (segEnd < segStart) continue;
            const segDays = daysBetween(segStart, segEnd) + 1;
            const kg = recs[ri].bags * bagSize * segDays;
            newFeedLogs.push({ date: segStart, totalKg: kg, totalCost: kg * rate });
        }
    });
    const feedExpenseChanged = settings.totalFeedExpense !== totalCostAllTime;
    const feedLogsChanged = JSON.stringify(newFeedLogs) !== JSON.stringify(settings.feedLogs || []);
    if (feedExpenseChanged || feedLogsChanged) {
        settings.totalFeedExpense = totalCostAllTime;
        settings.feedLogs = newFeedLogs;
        dbPut('settings', settings).catch(() => {});
    }

    const ST = [
        { icon: '🏭', name: 'Godown Assets', val: cur(Math.round(godownValue)), color: '#0A7C52' },
        {
            icon: '🍽️',
            name: 'Daily Feed Consumed',
            val: totalFeedKgToday.toFixed(1) + ' kg',
            color: '#1B4FD8'
        },
        {
            icon: '💰',
            name: 'Avg Feed Cost/kg',
            sub: 'Total cost / kg purchased',
            val: avgFeedCostPerKg > 0 ? cur(avgFeedCostPerKg.toFixed(2)) : '-',
            color: '#B45309'
        },
        {
            icon: '🐃',
            name: 'Avg Feed/Buffalo',
            sub: 'Shed A+B+Yards',
            val: avgFeedPerBuffalo > 0 ? avgFeedPerBuffalo.toFixed(2) + ' kg' : '-',
            color: '#6C2BD9'
        }
    ];
    $('stock-stat-grid').innerHTML = statBillGrid(ST);

    renderGodownStock();
    renderFeedNutritionSection();
}

// ======================================================
//  GODOWN STOCK WITH DATE SELECTOR (FIXED: cumulative consumption)
// ======================================================
function shareGodownWhatsApp() {
    const dt = document.getElementById('godown-view-date');
    const viewDate = (dt && dt.value) || todayStr();
    const prevDay = addDays(viewDate, -1);
    const names = godownGoodsNames();
    if (!names.length) {
        toast('✅ No goods to share yet');
        return;
    }
    let msg = '📦 *GODOWN DETAILS - ' + fmtDate(viewDate) + '*\n\n';
    names.forEach(function (name) {
        const bagSize = goodsBagSize(name);
        const openDate = goodsOpeningDate(name);
        const opening =
            openDate && viewDate <= openDate ? goodsOpeningBags(name) : closingStockAsOf(name, prevDay);
        const purchased = goodsPurchases
            .filter(g => g.name === name && g.date === viewDate)
            .reduce((s, g) => s + N(g.bags), 0);
        const rawConsumed = consumedBagsOnDate(name, viewDate);
        const consumed = Math.min(rawConsumed, opening + purchased);
        const short = rawConsumed > opening + purchased;
        const closing = closingStockAsOf(name, viewDate);
        const avgDaily = consumedBagsOnDate(name, viewDate);
        const daysLeft = stockDaysLeft(closing, avgDaily);
        msg +=
            '🌾 *' +
            name +
            '*: ' +
            (closing * bagSize).toFixed(0) +
            ' kg' +
            (daysLeft !== null ? ' (' + daysLeft + 'd left)' : '') +
            (short ? ' ⚠️ short' : '') +
            '\n';
    });
    msg += '\n_Halima Dairy Farm_';
    waShare(msg);
}

function renderGodownStock() {
    const el = document.getElementById('godown-list');
    if (!el) return;
    const dt = document.getElementById('godown-view-date');
    if (!dt.value) dt.value = todayStr();
    const viewDate = dt.value;

    const names = godownGoodsNames();
    const q = ($('stock-search')?.value || '').trim().toLowerCase();
    const filteredNames = q ? names.filter(n => n.toLowerCase().includes(q)) : names;

    if (!filteredNames.length) {
        el.innerHTML =
            '<div class="empty">' +
            (q ? 'No matching goods' : 'No goods yet - add Godown Stock or Goods Purchase') +
            '</div>';
        return;
    }

    // FIX: "Stock Book" rewritten as a proper day-by-day rolling ledger:
    //   Opening (today) = Closing (yesterday)
    //   Closing (today) = Opening (today) - Consumed (today) + Purchased (today)
    // Previously "Purchased"/"Consumed" were ALL-TIME cumulative totals added on top of an
    // already-cumulative "opening", which double counted every past purchase/consumption and
    // made stock drain far faster than actual bags used. Now each day only nets its own
    // day's purchases/consumption against the running balance, exactly like a bank passbook.

    function prevDay(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        return dateToStr(d);
    }

    function purchasedBagsOnDate(name, dateStr) {
        return goodsPurchases
            .filter(g => g.name === name && g.date === dateStr)
            .reduce((s, g) => s + N(g.bags), 0);
    }

    // Running closing balance as of dateStr - see global closingStockAsOf() above.

    function openingBagsForDate(name, dateStr) {
        const openDate = goodsOpeningDate(name);
        // If viewing on (or before) the day opening stock was set, today's opening IS that stock.
        if (openDate && dateStr <= openDate) return goodsOpeningBags(name);
        return closingStockAsOf(name, prevDay(dateStr));
    }

    let tableH =
        '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:8px">' +
        '<table class="stock-date-table"><thead><tr>' +
        '<th style="min-width:90px">Goods</th>' +
        '<th>Opening</th>' +
        '<th>Purchased</th>' +
        '<th>Consumed</th>' +
        '<th style="min-width:50px">Closing</th>' +
        '<th>Days Left</th>' +
        '<th>Action</th>' +
        '</tr></thead><tbody>';

    for (const name of filteredNames) {
        const opening = openingBagsForDate(name, viewDate);
        const purchased = purchasedBagsOnDate(name, viewDate);
        const rawConsumed = consumedBagsOnDate(name, viewDate);
        // Stock is never allowed to show as negative: cap how much can be
        // shown as "consumed" today at what was actually on hand, and let
        // Closing use the real non-negative running ledger (which also
        // clamps at 0 for every earlier day, so shortages don't carry
        // forward as a debt).
        const available = opening + purchased;
        const consumed = Math.min(rawConsumed, available);
        const short = rawConsumed > available;
        const closing = closingStockAsOf(name, viewDate);
        const avgDaily = consumedBagsOnDate(name, viewDate);
        const daysLeft = stockDaysLeft(closing, avgDaily);
        const low = daysLeft !== null && daysLeft <= 7;
        const closingColor = low ? '#C81E1E' : closing > 0 ? '#0A7C52' : '#9CA3AF';
        const daysColor =
            daysLeft !== null && daysLeft <= 7
                ? '#C81E1E'
                : daysLeft !== null && daysLeft <= 14
                  ? '#B45309'
                  : '#0A7C52';

        tableH +=
            '<tr style="cursor:pointer" onclick="openGoodsDetail(\'' +
            name.replace(/'/g, "\\'") +
            '\')">' +
            '<td class="sdt-name">' +
            esc(name) +
            (short ? ' 🔴' : low ? ' ⚠️' : '') +
            '</td>' +
            '<td class="sdt-opening">' +
            opening +
            '</td>' +
            '<td class="sdt-purchased">' +
            purchased +
            '</td>' +
            '<td class="sdt-consumed">' +
            consumed +
            (short
                ? ' <span title="Short by ' +
                  (rawConsumed - available) +
                  ' - not enough stock, consider topping up or substituting another goods" style="color:var(--red);font-weight:800">⚠️</span>'
                : '') +
            '</td>' +
            '<td class="sdt-closing" style="color:' +
            closingColor +
            '">' +
            closing +
            '</td>' +
            '<td style="color:' +
            daysColor +
            ';font-weight:700">' +
            (daysLeft !== null ? daysLeft + 'd' : '-') +
            '</td>' +
            '<td style="padding:3px 2px"><div style="display:flex;gap:3px;justify-content:center">' +
            '<button onclick="event.stopPropagation();openStockDebug(\'' +
            name.replace(/'/g, "\\'") +
            '\')" style="background:var(--muted);color:#fff;border:none;border-radius:5px;padding:4px 7px;font-size:10px;font-weight:700;cursor:pointer">🐛</button>' +
            '<button onclick="event.stopPropagation();openEditGodown(\'' +
            name.replace(/'/g, "\\'") +
            '\')" style="background:var(--blue);color:#fff;border:none;border-radius:5px;padding:4px 7px;font-size:10px;font-weight:700;cursor:pointer">✏️</button>' +
            '<button onclick="event.stopPropagation();confirmDeleteGodown(\'' +
            name.replace(/'/g, "\\'") +
            '\')" style="background:var(--red);color:#fff;border:none;border-radius:5px;padding:4px 7px;font-size:10px;font-weight:700;cursor:pointer">🗑️</button>' +
            '</div></td></tr>';
    }
    tableH += '</tbody></table></div>';

    tableH +=
        '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:9px;color:var(--muted);padding:4px 0 8px">' +
        '<span><span style="background:var(--blue);color:#fff;padding:1px 4px;border-radius:3px">Opening</span> = Previous day\'s closing</span>' +
        '<span><span style="background:var(--purple);color:#fff;padding:1px 4px;border-radius:3px">Purchased</span> = Goods bought on this date</span>' +
        '<span><span style="background:var(--amber);color:#fff;padding:1px 4px;border-radius:3px">Consumed</span> = Feed used on this date</span>' +
        '<span><span style="background:var(--green);color:#fff;padding:1px 4px;border-radius:3px">Closing</span> = Opening - Consumed + Purchased (auto-carries to next day, never goes below 0)</span>' +
        '<span>🔴 = feed short that day - consumed was capped to what was in stock</span>' +
        '</div>';

    el.innerHTML = tableH;
}

// ======================================================
//  GOODS DETAIL
// ======================================================
function openGoodsDetail(name) {
    $('goods-title').textContent = name;
    const opening = goodsOpeningBags(name);
    const purchased = goodsPurchasedBags(name);
    const consumed = goodsConsumedBags(name);
    const closing = goodsClosingBags(name);
    const bagSize = goodsBagSize(name);
    const rate = goodsRate(name);
    const value = closing * bagSize * rate;
    const purchaseHist = goodsPurchases
        .filter(g => g.name === name)
        .sort((a, b) => b.date.localeCompare(a.date));
    const consHist = feedConsumption
        .filter(f => f.goods === name)
        .sort((a, b) => b.date.localeCompare(a.date));
    var purchH = '';
    purchaseHist.forEach(function (p) {
        purchH +=
            '<div class="it-row"><span class="it-label">' +
            fmtDate(p.date) +
            ' . ' +
            p.broker +
            '</span><span class="it-val">' +
            p.bags +
            ' bags . ' +
            cur(p.bill) +
            '</span></div>';
    });
    var consH = '';
    consHist.slice(0, 15).forEach(function (cc) {
        consH +=
            '<div class="it-row"><span class="it-label">' +
            fmtDate(cc.date) +
            '</span><span class="it-val">' +
            cc.bags +
            ' bags</span></div>';
    });
    $('goods-body').innerHTML =
        '<div style="padding:12px 13px 24px">' +
        '<div class="info-table">' +
        '<div class="it-row"><span class="it-label">Opening Stock</span><span class="it-val">' +
        opening +
        ' bags</span></div>' +
        '<div class="it-row"><span class="it-label">Purchased</span><span class="it-val">' +
        purchased +
        ' bags</span></div>' +
        '<div class="it-row"><span class="it-label">Consumed</span><span class="it-val">' +
        consumed +
        ' bags</span></div>' +
        '<div class="it-row"><span class="it-label" style="font-weight:700">Closing Stock</span><span class="it-val" style="color:#0A7C52">' +
        closing +
        ' bags</span></div>' +
        '<div class="it-row"><span class="it-label">Bag Size</span><span class="it-val">' +
        bagSize +
        ' kg</span></div>' +
        '<div class="it-row"><span class="it-label">Current Rate</span><span class="it-val">' +
        cur(rate) +
        '/kg</span></div>' +
        '<div class="it-row"><span class="it-label">Stock Value</span><span class="it-val" style="color:#0A7C52">' +
        cur(Math.round(value)) +
        '</span></div></div>' +
        '<div class="sec-title">Purchase History</div>' +
        '<div class="info-table">' +
        (purchH || '<div class="empty">No purchases yet</div>') +
        '</div>' +
        '<div class="sec-title">Consumption History (last 15)</div>' +
        '<div class="info-table">' +
        (consH || '<div class="empty">No consumption logged</div>') +
        '</div></div>';
    showScreen('screen-goods');
}

// ======================================================
//  GOODS PURCHASE
// ======================================================
function calcGoodsPurchase() {
    const weight = N($('gp-weight').value);
    const bags = N($('gp-bags').value);
    const rate = N($('gp-rate').value);
    const freight = N($('gp-freight').value);
    const rateType = $('gp-ratetype').value;
    const bagSize = bags > 0 ? weight / bags : 0;
    const freightPerKg = weight > 0 && freight > 0 ? freight / weight : 0;
    const danaBill = weight * rate;
    const totalOutflow = danaBill + freight;
    const lbl = $('gp-rate-label');
    if (lbl)
        lbl.textContent =
            rateType === 'X-Factory'
                ? '(Ex-Factory price)'
                : rateType === 'Delivery'
                  ? '(Delivery inclusive)'
                  : '';
    const fw = $('gp-freight-wrap');
    if (fw) fw.style.display = rateType === 'Delivery' ? 'none' : 'block';
    $('gp-bagsize').textContent = bagSize > 0 ? bagSize.toFixed(1) + ' kg' : '-';
    $('gp-freightperkg').textContent = freightPerKg > 0 ? cur(freightPerKg.toFixed(2)) + '/kg' : '-';
    $('gp-bill').textContent = danaBill > 0 ? cur(Math.round(danaBill)) : '-';
    $('gp-freight-show').textContent = freight > 0 ? cur(Math.round(freight)) : '-';
    $('gp-total-show').textContent = totalOutflow > 0 ? cur(Math.round(totalOutflow)) : '-';
}

// ======================================================
//  BILL PHOTO CAPTURE (attach / view / replace / remove)
// ======================================================
let pendingBillPhoto = null;
let currentBillPhotoId = null;

function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function () {
            resolve(reader.result);
        };
        reader.readAsDataURL(file);
    });
}

function compressImageToDataURL(file, maxDim, quality) {
    maxDim = maxDim || 1100;
    quality = quality || 0.7;
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function () {
            const img = new Image();
            img.onerror = reject;
            img.onload = function () {
                let w = img.width,
                    h = img.height;
                if (w > maxDim || h > maxDim) {
                    const scale = maxDim / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

// Handles either an image (gets compressed to keep storage small) or a PDF
// (stored as-is, since it can't be resized) - covers bills received as
// photos or as PDFs forwarded/saved from WhatsApp.
function readBillFile(file) {
    if (file.type === 'application/pdf') return readFileAsDataURL(file);
    return compressImageToDataURL(file);
}

function isPdfDataUrl(dataUrl) {
    return !!dataUrl && dataUrl.indexOf('data:application/pdf') === 0;
}

async function handleBillPhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        pendingBillPhoto = await readBillFile(file);
        if (isPdfDataUrl(pendingBillPhoto)) {
            $('gp-photo-preview').style.display = 'none';
            $('gp-photo-pdf-label').style.display = 'block';
        } else {
            $('gp-photo-preview').src = pendingBillPhoto;
            $('gp-photo-preview').style.display = 'block';
            $('gp-photo-pdf-label').style.display = 'none';
        }
        $('gp-photo-preview-wrap').style.display = 'block';
        $('gp-photo-btn').textContent = '📎 Attached - Tap to Change';
    } catch (err) {
        console.error('Bill file read failed', err);
        toast('⚠️ Could not read file - try again');
    }
    event.target.value = '';
}

function removeBillPhoto() {
    pendingBillPhoto = null;
    $('gp-photo-preview-wrap').style.display = 'none';
    $('gp-photo-btn').textContent = '📷 Attach Bill Photo / PDF';
}

function viewBillPhoto(id) {
    const b = goodsPurchases.find(g => g.id === id);
    if (!b || !b.billPhoto) return;
    currentBillPhotoId = id;
    if (isPdfDataUrl(b.billPhoto)) {
        $('vbp-img').style.display = 'none';
        $('vbp-pdf-link').style.display = 'block';
        $('vbp-pdf-link').href = b.billPhoto;
    } else {
        $('vbp-img').src = b.billPhoto;
        $('vbp-img').style.display = 'block';
        $('vbp-pdf-link').style.display = 'none';
    }
    openModal('modal-view-bill-photo');
}

async function handleReplaceBillPhoto(event) {
    const file = event.target.files[0];
    if (!file || !currentBillPhotoId) return;
    try {
        const dataUrl = await readBillFile(file);
        const idx = goodsPurchases.findIndex(g => g.id === currentBillPhotoId);
        if (idx < 0) return;
        goodsPurchases[idx] = { ...goodsPurchases[idx], billPhoto: dataUrl };
        await dbPut('goodsPurchases', goodsPurchases[idx]);
        if (isPdfDataUrl(dataUrl)) {
            $('vbp-img').style.display = 'none';
            $('vbp-pdf-link').style.display = 'block';
            $('vbp-pdf-link').href = dataUrl;
        } else {
            $('vbp-img').src = dataUrl;
            $('vbp-img').style.display = 'block';
            $('vbp-pdf-link').style.display = 'none';
        }
        toast('✅ Bill updated');
        openAccLedger(currentAccLedgerKey);
    } catch (err) {
        console.error('Replace bill file failed', err);
        toast('⚠️ Could not save file - try again');
    }
    event.target.value = '';
}

async function deleteBillPhoto() {
    if (!currentBillPhotoId) return;
    const idx = goodsPurchases.findIndex(g => g.id === currentBillPhotoId);
    if (idx < 0) return;
    goodsPurchases[idx] = { ...goodsPurchases[idx], billPhoto: null };
    await dbPut('goodsPurchases', goodsPurchases[idx]);
    closeModal('modal-view-bill-photo');
    toast('✅ Removed');
    openAccLedger(currentAccLedgerKey);
}

async function saveGoodsPurchase() {
    try {
        const broker = $('gp-broker').value.trim();
        const date = $('gp-date').value || todayStr();
        const goods = $('gp-goods').value.trim();
        const weight = N($('gp-weight').value);
        const bags = N($('gp-bags').value);
        const rate = N($('gp-rate').value);
        const rateType = $('gp-ratetype').value;
        const freight = N($('gp-freight').value);
        if (!broker || !goods || !weight || !bags || !rate || !rateType) {
            toast('⚠️ Fill all required fields');
            return;
        }
        const bagSize = weight / bags;
        const freightPerKg = weight > 0 && freight > 0 ? freight / weight : 0;
        const danaBill = weight * rate;
        const freightActual = rateType === 'Delivery' ? 0 : freight;
        const entry = {
            id: uid(),
            broker,
            date,
            name: goods,
            weight,
            bags,
            rate,
            rateType,
            freight: freightActual,
            bagSize,
            freightPerKg,
            bill: danaBill,
            billPhoto: pendingBillPhoto
        };
        await dbPut('goodsPurchases', entry);
        goodsPurchases.push(entry);
        // Auto-register this goods name in Godown Stock (opening=0) if it's
        // never been tracked there before, so it always has an anchor record
        // for editing/deleting and shows up consistently in Godown Details.
        if (!godownStock.some(g => g.name === goods)) {
            const openingEntry = { id: uid(), name: goods, bags: 0, bagSize, date };
            await dbPut('godownStock', openingEntry);
            godownStock.push(openingEntry);
        }
        const danaBillEntry = { id: uid(), type: 'dana_bill', name: broker, amount: danaBill, date };
        await dbPut('vendorPayments', danaBillEntry);
        vendorPayments.push(danaBillEntry);
        if (freightActual > 0) {
            const freightEntry = {
                id: uid(),
                type: 'freight_expense',
                name: broker,
                amount: freightActual,
                date,
                goods
            };
            await dbPut('vendorPayments', freightEntry);
            vendorPayments.push(freightEntry);
        }
        closeModal('modal-goods-purchase');
        removeBillPhoto();
        var freightNote = freightActual > 0 ? ' + ' + cur(Math.round(freightActual)) + ' freight' : '';
        toast('✅ Saved - Dana bill: ' + cur(Math.round(danaBill)) + freightNote);
        renderStock();
        renderDashboard();
    } catch (err) {
        console.error('saveGoodsPurchase failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

// ======================================================
//  GODOWN INIT STOCK
// ======================================================
async function saveGodownInit() {
    try {
        const name = $('gi-goods').value.trim();
        const bags = N($('gi-bags').value);
        const bagSize = N($('gi-bagsize').value);
        if (!name || !bags) {
            toast('⚠️ Fill goods name & bags');
            return;
        }
        // FIX: only one opening-stock entry per goods name allowed.
        // Re-initializing must UPDATE the existing record, never add a duplicate
        // (duplicates were silently doubling "Opening" bags in the stock book).
        const idx = godownStock.findIndex(g => g.name === name);
        if (idx >= 0) {
            godownStock[idx] = { ...godownStock[idx], bags, bagSize, date: todayStr() };
            await dbPut('godownStock', godownStock[idx]);
        } else {
            const entry = { id: uid(), name, bags, bagSize, date: todayStr() };
            await dbPut('godownStock', entry);
            godownStock.push(entry);
        }
        closeModal('modal-godown-init');
        toast('✅ Opening stock saved - ' + name + ': ' + bags + ' bags');
        renderStock();
    } catch (err) {
        console.error('saveGodownInit failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

// ======================================================
//  FEED CONSUMED
// ======================================================
function calcFeedConsumed() {
    const goods = $('fc-goods').value;
    const bags = N($('fc-bags').value);
    if (!goods) {
        $('fc-totalkg').textContent = '-';
        $('fc-left').textContent = '-';
        return;
    }
    const bagSize = goodsBagSize(goods);
    const totalKg = bags * bagSize;
    const currentClosing = goodsClosingBags(goods);
    const left = currentClosing - bags;
    $('fc-totalkg').textContent = totalKg > 0 ? totalKg.toFixed(1) + ' kg' : '-';
    $('fc-left').textContent = left + ' bags';
}

async function saveFeedConsumed() {
    try {
        const date = $('fc-date').value || todayStr();
        const goods = $('fc-goods').value;
        const bags = N($('fc-bags').value);
        if (!goods || !bags) {
            toast('⚠️ Select goods & enter bags');
            return;
        }
        const idx = feedConsumption.findIndex(f => f.goods === goods && f.date === date);
        const entry = {
            id: idx >= 0 ? feedConsumption[idx].id : uid(),
            date,
            goods,
            bags,
            kg: bags * goodsBagSize(goods)
        };
        await dbPut('feedConsumption', entry);
        if (idx >= 0) feedConsumption[idx] = entry;
        else feedConsumption.push(entry);
        await ensureFeedNutritionDefaults();
        closeModal('modal-feed-consumed');
        const toastMsg = feedConsumedWithStockCheck(goods, bags);
        toast(toastMsg, 3500);
        renderStock();
        renderDashboard();
    } catch (err) {
        console.error('saveFeedConsumed failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

function feedConsumedWithStockCheck(goods, bags) {
    const closing = goodsClosingBags(goods);
    const newClosing = closing - bags;
    const avgDaily = consumedBagsOnDate(goods, todayStr());
    const daysLeft = stockDaysLeft(newClosing, avgDaily);
    let msg = '✅ ' + goods + ': ' + bags + ' bags consumed -> ' + newClosing + ' bags left';
    if (daysLeft !== null) {
        msg += ' (~' + daysLeft + 'd)';
        if (daysLeft <= 7) msg += ' ⚠️ LOW STOCK!';
    }
    return msg;
}

// ======================================================
//  GODOWN STOCK - EDIT & DELETE
// ======================================================
let editGodownName = '';

function openEditGodown(name) {
    editGodownName = name;
    const entry = godownStock.find(g => g.name === name) || { bags: 0, bagSize: 50, date: todayStr() };
    $('eg-name').value = name;
    $('eg-opening').value = entry.bags || '';
    $('eg-bagsize').value = entry.bagSize || '';
    $('eg-date').value = entry.date || todayStr();
    openModal('modal-edit-godown');
}

async function saveEditGodown() {
    const newName = ($('eg-name').value || '').trim();
    const bags = N($('eg-opening').value);
    const bagSize = N($('eg-bagsize').value);
    const date = $('eg-date').value || todayStr();
    if (!editGodownName) {
        toast('⚠️ No item selected');
        return;
    }
    if (!newName) {
        toast('⚠️ Goods name cannot be empty');
        return;
    }

    const renaming = newName !== editGodownName;
    // If the target name already has its own opening-stock record, don't
    // let this rename overwrite it - just drop the old (source) opening
    // record and merge the purchase/consumption history across.
    const targetAlreadyExists = renaming && godownStock.some(g => g.name === newName);

    if (renaming) {
        for (const g of godownStock.filter(g => g.name === editGodownName)) {
            if (targetAlreadyExists) {
                if (g.id) await dbDelete('godownStock', g.id);
                godownStock = godownStock.filter(x => x !== g);
            } else {
                g.name = newName;
                await dbPut('godownStock', g);
            }
        }
        for (const g of goodsPurchases.filter(g => g.name === editGodownName)) {
            g.name = newName;
            await dbPut('goodsPurchases', g);
        }
        for (const f of feedConsumption.filter(f => f.goods === editGodownName)) {
            f.goods = newName;
            await dbPut('feedConsumption', f);
        }
    }

    if (!targetAlreadyExists) {
        const idx = godownStock.findIndex(g => g.name === newName);
        if (idx >= 0) {
            godownStock[idx] = { ...godownStock[idx], bags, bagSize, date };
            await dbPut('godownStock', godownStock[idx]);
        } else {
            const entry = { id: uid(), name: newName, bags, bagSize, date };
            godownStock.push(entry);
            await dbPut('godownStock', entry);
        }
    }
    closeModal('modal-edit-godown');
    toast(
        renaming
            ? '✅ Renamed & merged "' +
                  editGodownName +
                  '" into "' +
                  newName +
                  '"' +
                  (targetAlreadyExists ? ' (kept existing opening record)' : '')
            : '✅ Godown entry updated - ' + newName
    );
    renderStock();
}

async function confirmDeleteGodown(name) {
    openGenericConfirm(
        'Delete "' + name + '"?',
        'This removes ALL records for "' +
            name +
            '" - opening stock, purchases, and feed consumption history. Recoverable for 30 days from Recently Deleted.',
        async () => {
            const stockMatches = godownStock.filter(g => g.name === name);
            const purchaseMatches = goodsPurchases.filter(g => g.name === name);
            const consumeMatches = feedConsumption.filter(f => f.goods === name);
            const total = stockMatches.length + purchaseMatches.length + consumeMatches.length;
            if (total === 0) {
                toast('⚠️ No records found for: ' + name);
                renderStock();
                return;
            }
            for (const e of stockMatches) {
                if (e.id) await softDelete('godownStock', e);
            }
            for (const e of purchaseMatches) {
                if (e.id) await softDelete('goodsPurchases', e);
            }
            for (const e of consumeMatches) {
                if (e.id) await softDelete('feedConsumption', e);
            }
            godownStock = godownStock.filter(g => g.name !== name);
            goodsPurchases = goodsPurchases.filter(g => g.name !== name);
            feedConsumption = feedConsumption.filter(f => f.goods !== name);
            toast('✅ Deleted - ' + name + ' (recoverable for 30 days)');
            renderStock();
        }
    );
}