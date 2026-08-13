// ======================================================
//  labour.js
//  Labour tab: worker records, pagar (wages), attendance, worker payments.
// ======================================================

// ======================================================
//  LABOUR BOOK HELPERS
// ======================================================
function workerPaidTotal(workerId) {
    return labourPayments.filter(p => p.workerId === workerId).reduce((s, p) => s + N(p.amount), 0);
}

// Pagar accrues automatically day-by-day from joining date onward (like a running
// clock) - no need to log attendance for a worker who simply worked every day.
// A manual attendance entry for a given month OVERRIDES that month's automatic
// days with the days actually present (e.g. to account for absences).
function workerEarnedTotal(w, asOfDate) {
    asOfDate = asOfDate || todayStr();
    const endDate = w.leaving && w.leaving < asOfDate ? w.leaving : asOfDate;
    if (!w.joining || endDate < w.joining) return 0;
    const attLogs = attendance.filter(a => a.workerId === w.id);
    let total = 0,
        cursor = w.joining,
        guard = 0;
    while (cursor <= endDate && guard < 600) {
        const mEnd = monthEndDate(cursor);
        const rangeEnd = mEnd < endDate ? mEnd : endDate;
        const monthKey = cursor.slice(0, 7);
        const log = attLogs.find(a => a.month === monthKey);
        const days = log ? N(log.days) : daysBetween(cursor, rangeEnd) + 1;
        const dailyRate = pagarRateOnDate(w, cursor) / daysInMonthOf(monthKey);
        total += dailyRate * days;
        cursor = addDays(rangeEnd, 1);
        guard++;
    }
    return total;
}

function workerMonthlyBreakdown(w, asOfDate) {
    asOfDate = asOfDate || todayStr();
    const endDate = w.leaving && w.leaving < asOfDate ? w.leaving : asOfDate;
    if (!w.joining || endDate < w.joining) return [];
    const attLogs = attendance.filter(a => a.workerId === w.id);
    const roleChangeDates = [...new Set((w.roleHistory || []).map(h => h.date))].sort();
    const rows = [];
    let cursor = w.joining,
        guard = 0;
    while (cursor <= endDate && guard < 600) {
        const mEnd = monthEndDate(cursor);
        const rangeEnd = mEnd < endDate ? mEnd : endDate;
        const monthKey = cursor.slice(0, 7);
        const log = attLogs.find(a => a.month === monthKey);
        const totalCalDays = daysBetween(cursor, rangeEnd) + 1;
        const totalDays = log ? N(log.days) : totalCalDays;

        // Split this month segment further wherever a role change falls
        // inside it, so a mid-month promotion shows as separate rows.
        const breakpoints = roleChangeDates.filter(d => d > cursor && d <= rangeEnd);
        let subStart = cursor;
        const subBounds = breakpoints.concat([addDays(rangeEnd, 1)]);
        subBounds.forEach(function (nextBoundary) {
            const subEnd = addDays(nextBoundary, -1);
            const calDays = daysBetween(subStart, subEnd) + 1;
            const role = roleOnDate(w, subStart);
            const dailyRate = pagarRateOnDate(w, subStart) / daysInMonthOf(monthKey);
            const proratedDays = totalCalDays > 0 ? totalDays * (calDays / totalCalDays) : 0;
            rows.push({
                month: monthKey,
                role,
                days: proratedDays,
                amount: dailyRate * proratedDays,
                manual: !!log
            });
            subStart = nextBoundary;
        });
        cursor = addDays(rangeEnd, 1);
        guard++;
    }
    return rows.reverse();
}

function workerBalance(w) {
    const earned = workerEarnedTotal(w);
    const paid = workerPaidTotal(w.id);
    const advance = N(w.advance);
    const oldBalance = N(w.oldBalance);
    return earned + oldBalance - paid - advance;
}

function isWorkerActive(w) {
    if (!w.leaving) return true;
    return w.leaving >= todayStr();
}

// Single source of truth for "total monthly pagar across all workers" -
// computed live from `workers` every time instead of being cached into
// settings.labourMonthly and refreshed only when the Labour Book screen
// happened to render. That cache went stale whenever a worker's pagar
// changed but Labour Book wasn't revisited, so the Dashboard P&L, the
// Accounts quick-payment card, and the Labour Book's own total could all
// show different numbers for the same figure at the same moment.
function totalPagarMonth() {
    return workers.reduce((s, w) => s + N(w.pagar), 0);
}

// ======================================================
//  MARK WORKER LEAVING
// ======================================================
function openLeavingModal() {
    const sel = $('lv-worker');
    const activeWorkers = workers.filter(isWorkerActive);
    sel.innerHTML =
        '<option value="">- Select -</option>' +
        activeWorkers
            .map(w => '<option value="' + w.id + '">' + w.name + ' (' + (w.role || 'Labour') + ')</option>')
            .join('');
    $('lv-joining').value = '';
    $('lv-leaving').value = todayStr();
    ['lv-days', 'lv-earned', 'lv-paid', 'lv-oldbal', 'lv-balance', 'lv-advance'].forEach(
        x => ($(x).textContent = '-')
    );
    openModal('modal-leaving');
}

function renderLeavingAuto() {
    const w = workers.find(x => String(x.id) === $('lv-worker').value);
    if (!w) {
        $('lv-joining').value = '';
        return;
    }
    $('lv-joining').value = fmtDate(w.joining);
    const leavingDate = $('lv-leaving').value || todayStr();
    const days = daysBetween(w.joining, leavingDate) + 1;
    const earned = workerEarnedTotal(w, leavingDate);
    const paid = workerPaidTotal(w.id);
    const advance = N(w.advance);
    const oldBalance = N(w.oldBalance);
    const balance = earned + oldBalance - paid - advance;
    $('lv-days').textContent = days + ' days';
    $('lv-earned').textContent = cur(Math.round(earned));
    $('lv-paid').textContent = cur(Math.round(paid));
    $('lv-oldbal').textContent = cur(Math.round(oldBalance));
    $('lv-advance').textContent = cur(Math.round(advance));
    $('lv-balance').textContent =
        balance >= 0
            ? cur(Math.round(balance)) + ' due to worker'
            : cur(Math.round(-balance)) + ' owed by worker';
    $('lv-balance').style.color = balance >= 0 ? 'var(--green)' : 'var(--red)';
}

async function saveWorkerLeaving() {
    try {
        const id = $('lv-worker').value;
        const leavingDate = $('lv-leaving').value;
        if (!id) {
            toast('⚠️ Select a worker');
            return;
        }
        if (!leavingDate) {
            toast('⚠️ Select a leaving date');
            return;
        }
        const idx = workers.findIndex(x => String(x.id) === id);
        if (idx < 0) return;
        const w = { ...workers[idx] };
        if (leavingDate < w.joining) {
            toast('⚠️ Leaving date cannot be before joining date');
            return;
        }
        w.leaving = leavingDate;
        workers[idx] = w;
        await dbPut('workers', w);
        closeModal('modal-leaving');
        toast('✅ ' + w.name + ' marked as left on ' + fmtDate(leavingDate));
        renderLabour();
        renderDashboard();
    } catch (err) {
        console.error('saveWorkerLeaving failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

function shiftMonthStr(monthStr, delta) {
    const parts = monthStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function openDoublingDetail(monthStr) {
    monthStr = monthStr || todayStr().slice(0, 7);
    accLedgerReturnTab = 4;
    currentAccLedgerKey = '';
    const shareBtn0 = $('acc-ledger-share-btn');
    if (shareBtn0) shareBtn0.style.display = 'none';
    const d = monthlyDoubling(monthStr);
    const monthLabel = new Date(d.monthStr + '-01').toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric'
    });
    document.getElementById('acc-ledger-title').textContent = '➗ Doubling - ' + monthLabel;
    const isCurrentOrFuture = monthStr >= todayStr().slice(0, 7);
    let html =
        '<div style="padding:12px 13px 24px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:8px 10px;margin-bottom:12px">' +
        '<button onclick="openDoublingDetail(\'' +
        shiftMonthStr(monthStr, -1) +
        '\')" style="background:var(--blue-lt);color:var(--blue);border:none;border-radius:7px;padding:7px 12px;font-size:13px;font-weight:800;cursor:pointer">‹ Prev</button>' +
        '<span style="font-size:13px;font-weight:800;color:var(--ink)">' +
        monthLabel +
        '</span>' +
        '<button ' +
        (isCurrentOrFuture
            ? 'disabled style="background:var(--bg);color:var(--light);border:none;border-radius:7px;padding:7px 12px;font-size:13px;font-weight:800"'
            : 'onclick="openDoublingDetail(\'' +
              shiftMonthStr(monthStr, 1) +
              '\')" style="background:var(--blue-lt);color:var(--blue);border:none;border-radius:7px;padding:7px 12px;font-size:13px;font-weight:800;cursor:pointer"') +
        '>Next ›</button>' +
        '</div>' +
        '<div class="slim-card" style="border-left-color:#B45309"><div class="slim-left"><div class="sl-label">Doubling Pool This Month</div><div class="sl-sub">' +
        d.absentDays.toFixed(1) +
        ' absent days &times; ' +
        cur(Math.round(N(settings.doublingRate) / d.dim)) +
        '/day</div></div><div class="slim-val" style="color:#B45309">' +
        cur(Math.round(d.doublingAmount)) +
        '</div></div>' +
        '<div class="info-table" style="margin-top:10px">' +
        '<div class="it-row"><span class="it-label">Active Labour</span><span class="it-val">' +
        d.activeCount +
        '</span></div>' +
        '<div class="it-row"><span class="it-label">Expected Attendance</span><span class="it-val">' +
        d.expectedDays.toFixed(1) +
        ' days</span></div>' +
        '<div class="it-row"><span class="it-label">Present Attendance</span><span class="it-val" style="color:#0A7C52">' +
        d.presentDays.toFixed(1) +
        ' days</span></div>' +
        '<div class="it-row"><span class="it-label" style="font-weight:700">Absent (Doubling) Days</span><span class="it-val" style="color:#C81E1E;font-weight:700">' +
        d.absentDays.toFixed(1) +
        ' days</span></div>' +
        '<div class="it-row"><span class="it-label">Doubling Rate</span><span class="it-val">' +
        cur(N(settings.doublingRate)) +
        '/labour/mo</span></div>' +
        '<div class="it-row"><span class="it-label">Per-Labour Share (if split evenly)</span><span class="it-val" style="color:#0694A2">' +
        cur(Math.round(d.perLabourShare)) +
        '</span></div></div>' +
        '<div class="sec-title">Labour Attendance This Month</div>' +
        (d.perWorker.length
            ? d.perWorker
                  .map(function (w) {
                      return (
                          '<div class="list-card" style="cursor:default"><div class="lc-row"><div><div class="lc-title">' +
                          w.name +
                          '</div><div class="lc-sub">Present: ' +
                          w.days.toFixed(1) +
                          'd</div></div>' +
                          '<div style="font-weight:800;color:' +
                          (w.absent > 0 ? '#C81E1E' : '#0A7C52') +
                          '">' +
                          w.absent.toFixed(1) +
                          'd absent</div></div></div>'
                      );
                  })
                  .join('')
            : '<div class="empty">No Labour-role workers found. Set worker roles in Labour → Add Worker.</div>') +
        '<div style="font-size:10px;color:var(--light);padding:10px 2px 0;line-height:1.5">Doubling is the pagar pool from absent Labour workers\' unworked days, redistributed among present Labour only (Managers & Cooks are excluded). A worker promoted out of Labour partway through a month is excluded from that whole month\'s share. Rate is editable in ⚙️ Rates.</div>' +
        '</div>';
    document.getElementById('acc-ledger-body').innerHTML = html;
    showScreen('screen-acc-ledger');
}

// ======================================================
//  DOUBLING (absent-labour pagar redistribution)
// ======================================================
function daysInMonthOf(monthStr) {
    const parts = monthStr.split('-').map(Number);
    return new Date(parts[0], parts[1], 0).getDate();
}

// Looks up whichever pagar rate was in effect on a given date, so a raise
// (or cut) only applies going forward - past months keep using whatever
// rate was actually in effect back then, instead of everything retroactively
// recalculating at today's rate.
function pagarRateOnDate(w, dateStr) {
    const hist = (w.pagarHistory || [])
        .filter(h => h.date <= dateStr)
        .sort((a, b) => b.date.localeCompare(a.date));
    if (hist.length) return N(hist[0].pagar);
    return N(w.pagar);
}

// Looks up whichever role was in effect on a given date, so promotions
// (Labour -> Cook/Manager) only apply going forward - past months keep
// showing whatever role was actually held back then.
function roleOnDate(w, dateStr) {
    const hist = (w.roleHistory || [])
        .filter(h => h.date <= dateStr)
        .sort((a, b) => b.date.localeCompare(a.date));
    if (hist.length) return hist[0].role;
    return w.role || 'Labour';
}

// The doubling bonus pool is budgeted against a fixed target of 20 labourers,
// not the actual headcount - if the farm runs with 21 or 22 active labour,
// everyone still gets paid pagar normally, but "expected attendance" for the
// doubling calculation stays pinned to 20 x days-in-month (e.g. 620 for a
// 31-day month, 600 for a 30-day month) rather than scaling up with headcount.
const DOUBLING_BASELINE_LABOUR = 20;

function monthlyDoubling(monthStr) {
    monthStr = monthStr || todayStr().slice(0, 7);
    const dim = daysInMonthOf(monthStr);
    const monthStart = monthStr + '-01';
    const monthEnd = monthStr + '-' + String(dim).padStart(2, '0');
    const activeLabour = workers.filter(function (w) {
        // Must have held the Labour role for the ENTIRE month to count -
        // someone promoted to Cook/Manager partway through is excluded
        // from that whole month's share (their unworked days simply
        // swell the absent pool for whoever is still Labour).
        if (roleOnDate(w, monthStart) !== 'Labour' || roleOnDate(w, monthEnd) !== 'Labour') return false;
        const joined = w.joining || '0000-01-01';
        if (joined > monthEnd) return false;
        if (w.leaving && w.leaving < monthStart) return false;
        return true;
    });
    const expectedDays = DOUBLING_BASELINE_LABOUR * dim;
    let presentDays = 0;
    const perWorker = activeLabour.map(function (w) {
        const rec = attendance.find(function (a) {
            return a.workerId === w.id && a.month === monthStr;
        });
        // No explicit attendance log for this month = assume full attendance
        // (matches the automatic day-by-day pagar accrual used everywhere
        // else) rather than defaulting to 0 present / 100% absent.
        const days = rec ? N(rec.days) : dim;
        presentDays += days;
        return { id: w.id, name: w.name, days, absent: Math.max(0, dim - days) };
    });
    const absentDays = Math.max(0, expectedDays - presentDays);
    const doublingAmount = absentDays * (N(settings.doublingRate) / dim);
    const perLabourShare = activeLabour.length > 0 ? doublingAmount / activeLabour.length : 0;
    return {
        monthStr,
        dim,
        activeCount: activeLabour.length,
        expectedDays,
        presentDays,
        absentDays,
        doublingAmount,
        perLabourShare,
        perWorker
    };
}

// ======================================================
//  LABOUR BOOK - RENDER
// ======================================================
function renderLabour() {
    const S = computeStats();
    const totalActive = S.totalActive || 1;
    const pagarTotal = totalPagarMonth();
    let activeCount = 0;
    for (const w of workers) {
        if (isWorkerActive(w)) activeCount++;
    }
    const totalAdvance = workers.reduce((s, w) => {
        const bal = workerBalance(w);
        return s + (bal < 0 ? Math.abs(bal) : 0);
    }, 0);

    const avgPagarPerAnimal = totalActive > 0 ? pagarTotal / totalActive : 0;
    const avgPagarPerWorker = workers.length > 0 ? pagarTotal / workers.length : 0;

    const ST = [
        { icon: '💵', name: 'Total Pagar/Month', val: cur(Math.round(pagarTotal)), color: '#0A7C52' },
        { icon: '🐃', name: 'Avg Pagar/Animal', val: cur(Math.round(avgPagarPerAnimal)), color: '#1B4FD8' },
        { icon: '👷', name: 'Avg Pagar/Worker', val: cur(Math.round(avgPagarPerWorker)), color: '#6C2BD9' },
        {
            icon: '⚠️',
            name: 'Total Advance (All)',
            sub: 'Active + offline',
            val: cur(Math.round(totalAdvance)),
            color: '#C81E1E'
        }
    ];
    var dbl = monthlyDoubling();
    ST.push({
        icon: '➗',
        name: 'Doubling (This Month)',
        sub: dbl.absentDays.toFixed(1) + ' absent days',
        val: cur(Math.round(dbl.doublingAmount)),
        color: '#B45309',
        key: 'openDoublingDetail()'
    });
    $('labour-stat-grid').innerHTML = statBillGrid(ST);

    const q = ($('labour-search')?.value || '').trim().toLowerCase();
    const allWorkers = q ? workers.filter(w => (w.name || '').toLowerCase().includes(q)) : workers;
    const lEl = $('worker-list');
    if (!allWorkers.length) {
        lEl.innerHTML =
            '<div class="empty">' +
            (q ? 'No matching workers' : 'No workers yet - tap Add Worker') +
            '</div>';
        return;
    }
    const active = allWorkers.filter(isWorkerActive);
    const offline = allWorkers.filter(w => !isWorkerActive(w));
    let listH = '';
    for (const group of [active, offline]) {
        for (const w of group) {
            const bal = workerBalance(w);
            const statusLabel = bal > 0 ? 'Balance Owed' : bal < 0 ? 'Advance' : 'Settled';
            const statusColor2 = bal > 0 ? '#0A7C52' : bal < 0 ? '#C81E1E' : '#6B7280';
            const activeFlag = isWorkerActive(w);
            listH +=
                '<div class="list-card" onclick="openWorkerDetail(' +
                w.id +
                ')"><div class="lc-row"><div style="flex:1;min-width:0"><div class="lc-title">' +
                esc(w.name) +
                (!activeFlag ? ' <span style="font-size:10px;color:var(--light)">(Offline)</span>' : '') +
                '</div><div class="lc-sub">' +
                cur(w.pagar) +
                '/mo . Joined ' +
                fmtDate(w.joining) +
                '</div></div><div style="text-align:right;flex-shrink:0"><div style="font-weight:800;font-size:15px;color:' +
                statusColor2 +
                '">' +
                cur(Math.round(Math.abs(bal))) +
                '</div><div style="font-size:9px;color:var(--light)">' +
                statusLabel +
                '</div></div></div></div>';
        }
    }
    lEl.innerHTML = listH;
}

// ======================================================
//  WORKER DETAIL
// ======================================================
function openWorkerDetail(id) {
    currentWorkerId = id;
    const w = workers.find(x => x.id === id);
    if (!w) return;
    $('worker-title').textContent = w.name;
    const earned = workerEarnedTotal(w);
    const paid = workerPaidTotal(id);
    const bal = workerBalance(w);
    const payHist = labourPayments
        .filter(p => p.workerId === id)
        .sort((a, b) => b.date.localeCompare(a.date));
    const attRowsData = workerMonthlyBreakdown(w);
    const attMonthRoleCounts = {};
    attRowsData.forEach(a => {
        attMonthRoleCounts[a.month] = (attMonthRoleCounts[a.month] || 0) + 1;
    });
    var payRowsArr = [];
    for (var pri = 0; pri < payHist.length; pri++) {
        var pr = payHist[pri];
        payRowsArr.push(
            '<div class="it-row"><span class="it-label">' +
                fmtDate(pr.date) +
                '</span><span class="it-val" style="color:#0A7C52">' +
                cur(pr.amount) +
                '</span></div>'
        );
    }
    var payRows = payRowsArr.join('');
    let attRows = attRowsData
        .map(
            a =>
                '<div class="it-row"><span class="it-label">' +
                monthLabel(a.month) +
                (attMonthRoleCounts[a.month] > 1
                    ? ' <span style="font-size:10px;color:var(--blue);font-weight:700">(' +
                      a.role +
                      ')</span>'
                    : '') +
                (a.manual ? '' : ' <span style="font-size:9px;color:var(--light)">(auto)</span>') +
                '</span><span class="it-val">' +
                a.days.toFixed(a.days % 1 === 0 ? 0 : 1) +
                ' days . ' +
                cur(Math.round(a.amount)) +
                '</span></div>'
        )
        .join('');
    var pagarHistRows = (w.pagarHistory || [])
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
            h =>
                '<div class="it-row"><span class="it-label" style="font-size:11px;color:var(--light)">from ' +
                fmtDate(h.date) +
                '</span><span class="it-val" style="font-size:12px">' +
                cur(h.pagar) +
                '</span></div>'
        )
        .join('');
    $('worker-body').innerHTML =
        '<div style="padding:12px 13px 24px">' +
        '<div class="info-table">' +
        '<div class="it-row" style="cursor:pointer" onclick="openChangeRoleModal(' +
        w.id +
        ')"><span class="it-label">Role</span><span class="it-val">' +
        (w.role || 'Labour') +
        ' &nbsp;✏️</span></div>' +
        '<div class="it-row" style="cursor:pointer" onclick="openChangePagarModal(' +
        w.id +
        ')"><span class="it-label">Pagar/Month</span><span class="it-val">' +
        cur(w.pagar) +
        ' &nbsp;✏️</span></div>' +
        '<div class="it-row"><span class="it-label">Joining Date</span><span class="it-val">' +
        fmtDate(w.joining) +
        '</span></div>' +
        '<div class="it-row"><span class="it-label">Leaving Date</span><span class="it-val">' +
        (w.leaving ? fmtDate(w.leaving) : 'Active') +
        '</span></div>' +
        '<div class="it-row"><span class="it-label">Starting Advance</span><span class="it-val">' +
        cur(w.advance) +
        '</span></div>' +
        '<div class="it-row"><span class="it-label">Old Balance</span><span class="it-val">' +
        cur(N(w.oldBalance)) +
        '</span></div>' +
        '<div class="it-row"><span class="it-label">Total Earned</span><span class="it-val">' +
        cur(Math.round(earned)) +
        '</span></div>' +
        '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
        cur(Math.round(paid)) +
        '</span></div>' +
        '<div class="it-row"><span class="it-label" style="font-weight:700">' +
        (bal > 0 ? 'Balance Owed' : bal < 0 ? 'Advance Pending' : 'Settled') +
        '</span><span class="it-val" style="color:' +
        (bal > 0 ? '#0A7C52' : bal < 0 ? '#C81E1E' : '#6B7280') +
        '">' +
        cur(Math.round(Math.abs(bal))) +
        '</span></div></div>' +
        ((w.pagarHistory || []).length > 1
            ? '<div class="sec-title">Pagar History</div><div class="info-table">' + pagarHistRows + '</div>'
            : '') +
        '<div class="sec-title">Attendance History</div>' +
        '<div class="info-table">' +
        (attRows || '<div class="empty">No attendance logged</div>') +
        '</div>' +
        '<div class="sec-title">Payment History</div>' +
        '<div class="info-table">' +
        (payRows || '<div class="empty">No payments yet</div>') +
        '</div></div>';
    showScreen('screen-worker');
}

// ======================================================
//  CHANGE PAGAR (effective-dated, keeps history)
// ======================================================
let currentChangePagarWorkerId = null;

function openChangePagarModal(workerId) {
    const w = workers.find(x => x.id === workerId);
    if (!w) return;
    currentChangePagarWorkerId = workerId;
    $('cp-name').value = w.name;
    $('cp-current').value = cur(w.pagar);
    $('cp-new').value = '';
    $('cp-effective').value = todayStr();
    openModal('modal-change-pagar');
}

async function saveChangePagar() {
    try {
        const idx = workers.findIndex(x => x.id === currentChangePagarWorkerId);
        if (idx < 0) {
            toast('⚠️ Worker not found');
            return;
        }
        const newPagar = N($('cp-new').value);
        const effDate = $('cp-effective').value;
        if (!newPagar || !effDate) {
            toast('⚠️ Enter new pagar & effective date');
            return;
        }
        const w = { ...workers[idx] };
        const hist = (w.pagarHistory || []).slice();
        const existingIdx = hist.findIndex(h => h.date === effDate);
        if (existingIdx >= 0) hist[existingIdx] = { date: effDate, pagar: newPagar };
        else hist.push({ date: effDate, pagar: newPagar });
        w.pagarHistory = hist;
        // Keep w.pagar as the CURRENT/latest rate for quick reference
        // wherever the app shows a simple current snapshot.
        const latest = hist.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
        w.pagar = latest.pagar;
        workers[idx] = w;
        await dbPut('workers', w);
        closeModal('modal-change-pagar');
        toast('✅ New pagar ' + cur(newPagar) + ' effective ' + fmtDate(effDate));
        openWorkerDetail(currentChangePagarWorkerId);
        renderLabour();
        renderDashboard();
    } catch (err) {
        console.error('saveChangePagar failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

// ======================================================
//  CHANGE WORKER ROLE
// ======================================================
let currentChangeRoleWorkerId = null;

function openChangeRoleModal(workerId) {
    const w = workers.find(x => x.id === workerId);
    if (!w) return;
    currentChangeRoleWorkerId = workerId;
    $('cr-name').value = w.name;
    $('cr-current').value = w.role || 'Labour';
    $('cr-role').value = w.role || 'Labour';
    $('cr-effective').value = todayStr();
    openModal('modal-change-role');
}

async function saveChangeRole() {
    try {
        const idx = workers.findIndex(x => x.id === currentChangeRoleWorkerId);
        if (idx < 0) {
            toast('⚠️ Worker not found');
            return;
        }
        const newRole = $('cr-role').value || 'Labour';
        const effDate = $('cr-effective').value;
        if (!effDate) {
            toast('⚠️ Select an effective date');
            return;
        }
        const w = { ...workers[idx] };
        const hist = (w.roleHistory || []).slice();
        const existingIdx = hist.findIndex(h => h.date === effDate);
        if (existingIdx >= 0) hist[existingIdx] = { date: effDate, role: newRole };
        else hist.push({ date: effDate, role: newRole });
        w.roleHistory = hist;
        // Keep w.role as the CURRENT/latest role for quick reference
        // wherever the app shows a simple current snapshot.
        const latest = hist.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
        w.role = latest.role;
        workers[idx] = w;
        await dbPut('workers', w);
        closeModal('modal-change-role');
        toast('✅ Role changed to ' + newRole + ' effective ' + fmtDate(effDate));
        openWorkerDetail(currentChangeRoleWorkerId);
        renderLabour();
        renderDashboard();
    } catch (err) {
        console.error('saveChangeRole failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

function shareWorkerWhatsApp() {
    const w = workers.find(x => x.id === currentWorkerId);
    if (!w) return;
    const earned = workerEarnedTotal(w);
    const paid = workerPaidTotal(w.id);
    const bal = workerBalance(w);
    const payHist = labourPayments
        .filter(p => p.workerId === w.id)
        .sort((a, b) => b.date.localeCompare(a.date));
    const attRowsData = workerMonthlyBreakdown(w);
    let msg =
        '👷 *WORKER DETAILS - ' + w.name.toUpperCase() + '*\n' + (w.role ? '(' + w.role + ')\n' : '') + '\n';
    msg += '💵 Pagar/Month: ' + cur(w.pagar) + '\n';
    msg += '📅 Joining: ' + fmtDate(w.joining) + '\n';
    msg += '🚪 Leaving: ' + (w.leaving ? fmtDate(w.leaving) : 'Active') + '\n';
    if (N(w.advance) > 0) msg += '💰 Starting Advance: ' + cur(w.advance) + '\n';
    if (N(w.oldBalance) > 0) msg += '📌 Old Balance: ' + cur(w.oldBalance) + '\n';
    msg += '\n*Total Earned: ' + cur(Math.round(earned)) + '*\n';
    msg += '*Total Paid: ' + cur(Math.round(paid)) + '*\n';
    msg +=
        '*' +
        (bal > 0 ? 'Balance Owed to Worker' : bal < 0 ? 'Advance Pending from Worker' : 'Settled') +
        ': ' +
        cur(Math.round(Math.abs(bal))) +
        '*\n';
    if (attRowsData.length) {
        msg += '\n📅 *Attendance:*\n';
        const shareMonthRoleCounts = {};
        attRowsData.forEach(a => {
            shareMonthRoleCounts[a.month] = (shareMonthRoleCounts[a.month] || 0) + 1;
        });
        attRowsData.forEach(a => {
            msg +=
                '- ' +
                monthLabel(a.month) +
                (shareMonthRoleCounts[a.month] > 1 ? ' (' + a.role + ')' : '') +
                ': ' +
                a.days.toFixed(a.days % 1 === 0 ? 0 : 1) +
                ' days' +
                (a.manual ? '' : ' (auto)') +
                ' . ' +
                cur(Math.round(a.amount)) +
                '\n';
        });
    }
    if (payHist.length) {
        msg += '\n💰 *Payment History:*\n';
        payHist.forEach(p => {
            msg += '- ' + fmtDate(p.date) + ': ' + cur(p.amount) + '\n';
        });
    }
    msg += '\n_Halima Dairy Farm_';
    waShare(msg);
}

// ======================================================
//  ADD WORKER
// ======================================================
async function saveWorker() {
    try {
        const name = $('wk-name').value.trim();
        const role = $('wk-role').value || 'Labour';
        const pagar = N($('wk-pagar').value);
        const joining = $('wk-joining').value || todayStr();
        const advance = N($('wk-advance').value);
        const oldBalance = N($('wk-oldbalance').value);
        if (!name || !pagar) {
            toast('⚠️ Fill name & pagar');
            return;
        }
        const obj = {
            id: uid(),
            name,
            role,
            pagar,
            joining,
            leaving: '',
            attendance: 0,
            advance,
            oldBalance,
            pagarHistory: [{ date: joining, pagar }],
            roleHistory: [{ date: joining, role }]
        };
        await dbPut('workers', obj);
        workers.push(obj);
        closeModal('modal-add-worker');
        toast('✅ Worker added - ' + name);
        renderLabour();
        renderDashboard();
    } catch (err) {
        console.error('saveWorker failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

// ======================================================
//  LABOUR PAYMENT
// ======================================================
async function saveLabourPayment() {
    const workerId = N($('lp-worker').value);
    const amount = N($('lp-amount').value);
    const date = $('lp-date').value || todayStr();
    if (!workerId || !amount) {
        toast('⚠️ Select worker & enter amount');
        return;
    }
    const entry = { id: uid(), workerId, amount, date };
    const w = workers.find(x => x.id === workerId);
    await saveEntry({
        store: 'labourPayments',
        arr: labourPayments,
        entry,
        modalId: 'modal-labour-payment',
        successMsg: '✅ Payment saved - ' + cur(amount) + ' to ' + (w ? w.name : 'worker'),
        onDone: () => {
            renderLabour();
            renderDashboard();
        }
    });
}

// ======================================================
//  ATTENDANCE
// ======================================================
function calcAttendancePagar() {
    const workerId = N($('att-worker').value);
    const days = N($('att-days').value);
    const month = $('att-month').value;
    const w = workers.find(x => x.id === workerId);
    if (!w || !days || !month) {
        $('att-pagar').textContent = '-';
        return;
    }
    const dim = daysInMonthOf(month);
    const pagar = (pagarRateOnDate(w, month + '-01') / dim) * days;
    $('att-pagar').textContent = cur(Math.round(pagar));
}

async function saveAttendance() {
    try {
        const workerId = N($('att-worker').value);
        const month = $('att-month').value;
        const days = N($('att-days').value);
        if (!workerId || !month || !days) {
            toast('⚠️ Fill all fields');
            return;
        }
        const idx = attendance.findIndex(a => a.workerId === workerId && a.month === month);
        const entry = { id: idx >= 0 ? attendance[idx].id : uid(), workerId, month, days };
        await dbPut('attendance', entry);
        if (idx >= 0) attendance[idx] = entry;
        else attendance.push(entry);
        closeModal('modal-attendance');
        const w = workers.find(x => x.id === workerId);
        const pagar = (pagarRateOnDate(w, month + '-01') / daysInMonthOf(month)) * days;
        toast('✅ Attendance saved - ' + days + ' days . ' + cur(Math.round(pagar)));
        renderLabour();
        renderDashboard();
    } catch (err) {
        console.error('saveAttendance failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

// ======================================================
//  PALAK / VENDOR PAYMENT
// ======================================================
// Sum of Amount from the Palak Grid's "returned" rows for this palak -
// buffalos still in rearing (out, not yet back) are never included.
function palakCompletedBillTotal(target) {
    return tajiEntries
        .filter(t => t.palak === target && t.inDate)
        .reduce((s, t) => {
            const rearingDays = t.outDate ? Math.max(0, daysBetween(t.outDate, t.inDate)) : N(t.rearingDays);
            const rate = N(t.rate) || (target === 'Noora' ? N(settings.nooraRate) : N(settings.tosifRate));
            return s + (N(t.bill) || Math.round((rate / 30) * rearingDays));
        }, 0);
}

// P&L's Noora/Tosif expense for a date range, accrued from each
// animal's actual rearing days that overlap the period - not a flat
// "today's headcount x rate x days" approximation. An animal that left
// partway through the period, or is still out past the period end,
// only contributes the days it actually overlapped. This is the same
// per-animal Taji ledger the Palak Payment screen already uses for
// "Outstanding" (palakCompletedBillTotal, lifetime), so the P&L expense
// line and what you actually owe Noora/Tosif can't disagree anymore.
// Note: a manual per-entry bill override (t.bill) is honored for the
// lifetime Outstanding figure above but not prorated here for a partial
// period overlap - it still counts at the standard day-rate for P&L.
function palakExpenseInRange(target, from, to) {
    let total = 0;
    for (const t of tajiEntries) {
        if (t.palak !== target || !t.outDate) continue;
        const end = t.inDate || to;
        const overlapStart = t.outDate > from ? t.outDate : from;
        const overlapEnd = end < to ? end : to;
        if (overlapStart > overlapEnd) continue;
        const overlapDays = daysBetween(overlapStart, overlapEnd) + 1;
        const rate = N(t.rate) || (target === 'Noora' ? N(settings.nooraRate) : N(settings.tosifRate));
        total += (rate / 30) * overlapDays;
    }
    return total;
}

function palakMonthlyBill(target) {
    if (target === 'Noora' || target === 'Tosif') return palakCompletedBillTotal(target);
    if (target === 'Irshad') {
        const S = computeStats();
        // Irshad is the transporter, paid a flat per-animal freight fee - NOT
        // the Palak's rearing bill (that's Noora/Tosif's own cost, counted above).
        const tajiFreight = tajiEntries.length * N(settings.tajiRate);
        const bakdiFreight = S.bakdi * N(settings.bakdiRate);
        return tajiFreight + bakdiFreight;
    }
    return 0;
}

// Irshad's freight for the current calendar month only (the lifetime total
// above is used for Outstanding; this is what "Current Bill" should show).
function irshadCurrentMonthBill() {
    const mk = todayStr().slice(0, 7);
    const tCount = tajiEntries.filter(t => t.inDate && t.inDate.startsWith(mk)).length;
    const bCount =
        animals.filter(a => a.outwardType === 'BAKDI' && a.bakdiDate && a.bakdiDate.startsWith(mk)).length +
        tajiEntries.filter(t => t.outDate && t.outDate.startsWith(mk)).length;
    return tCount * N(settings.tajiRate) + bCount * N(settings.bakdiRate);
}

function palakPaidTotal(target) {
    return sumBy(
        palakPayments.filter(p => p.target === target),
        'amount'
    );
}

function calcPalakOutstanding() {
    const target = $('pp-target').value;
    const newAmt = N($('pp-amount').value);
    if (!target) {
        ['pp-bill', 'pp-paidtotal', 'pp-after'].forEach(x => ($(x).textContent = '-'));
        return;
    }
    const bill = palakMonthlyBill(target);
    const paid = palakPaidTotal(target);
    const outstanding = bill - paid;
    $('pp-bill').textContent = cur(Math.round(bill));
    $('pp-paidtotal').textContent = cur(Math.round(paid));
    $('pp-after').textContent = cur(Math.round(outstanding - newAmt));
}

async function savePalakPayment() {
    const target = $('pp-target').value;
    const amount = N($('pp-amount').value);
    const date = $('pp-date').value || todayStr();
    if (!target || !amount) {
        toast('⚠️ Select Palak/Vendor & enter amount');
        return;
    }
    const entry = { id: uid(), target, amount, date };
    await saveEntry({
        store: 'palakPayments',
        arr: palakPayments,
        entry,
        modalId: 'modal-palak-payment',
        successMsg: '✅ Payment saved - ' + cur(amount) + ' to ' + target,
        onDone: () => {
            lastShare.palakPay = { target, amount, date, after: $('pp-after').textContent };
            renderAccounts();
            renderDashboard();
        }
    });
}

function sharePalakPaymentWhatsApp() {
    const p = lastShare.palakPay;
    if (!p) {
        toast('⚠️ Record a Palak payment first');
        return;
    }
    let msg =
        '💰 *PALAK PAYMENT RECEIPT*\n\n' +
        '👤 Paid To: ' +
        p.target +
        '\n' +
        '💵 Amount: ' +
        cur(p.amount) +
        '\n' +
        '📅 Date: ' +
        fmtDate(p.date) +
        '\n' +
        (p.after && p.after !== '-' ? '📊 Outstanding After: ' + p.after + '\n' : '') +
        '\n_Halima Dairy Farm_';
    waShare(msg);
}