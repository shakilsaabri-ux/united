// ======================================================
//  ui-shell.js
//  Screen navigation, modal dialogs, confirm dialogs, and the Rates/Settings screens.
// ======================================================

// ======================================================
//  NAVIGATION
// ======================================================
function showScreen(id) {
    const prev = document.getElementById(activeScreenId);
    if (prev) prev.classList.remove('active');
    document.getElementById(id).classList.add('active');
    activeScreenId = id;
}

function switchTab(idx, btn) {
    showScreen('screen-' + idx);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = idx;
    if (idx === 0) renderDashboard();
    if (idx === 1) renderHerd();
    if (idx === 2) renderSupply();
    if (idx === 3) renderStock();
    if (idx === 4) renderLabour();
    if (idx === 5) renderAccounts();
    if (idx === 7) renderSalvage();
}

// Reports now lives behind a touch card on the Accounts screen instead of
// its own bottom-nav icon, so it's opened/closed like a sub-screen.
function openReportsScreen() {
    showScreen('screen-6');
    renderReports();
}

function closeReportsScreen() {
    showScreen('screen-5');
    currentTab = 5;
    renderAccounts();
}

function closeDetail() {
    showScreen('screen-' + currentTab);
    if (currentTab === 1) renderHerd();
}

function closeDrCard() {
    showScreen('screen-1');
    renderHerd();
}

function openTMRSummaryScreen() {
    showScreen('screen-tmr-summary');
    if (!$('tmr-from').value) setTMRToday();
    else renderTMRSummary();
    renderFeedNutritionTable();
}

function closeTMRSummaryScreen() {
    showScreen('screen-3');
    renderStock();
}
let ledgerReturnScreen = 'screen-0';

function closeLedger() {
    showScreen(ledgerReturnScreen);
    if (ledgerReturnScreen === 'screen-0') renderDashboard();
    else if (ledgerReturnScreen === 'screen-2') renderSupply();
    else if (ledgerReturnScreen === 'screen-drcard') renderDrCard();
}

function closeCustomer() {
    showScreen('screen-2');
    renderSupply();
}

function closeWorker() {
    showScreen('screen-4');
    renderLabour();
}

function closeGoods() {
    showScreen('screen-3');
    renderStock();
}
let accLedgerReturnTab = 5;

function closeAccLedger() {
    showScreen('screen-' + accLedgerReturnTab);
    if (accLedgerReturnTab === 5) renderAccounts();
    else if (accLedgerReturnTab === 0) renderDashboard();
    else if (accLedgerReturnTab === 1) renderHerd();
    else if (accLedgerReturnTab === 4) renderLabour();
    else if (accLedgerReturnTab === 7) renderSalvage();
}

function closeBackup() {
    showScreen('screen-5');
    renderAccounts();
}

// ======================================================
//  MODAL
// ======================================================
function openModal(id) {
    document.getElementById(id).classList.add('open');
    const modal = document.getElementById(id);
    if (modal) {
        const today = todayStr();
        modal.querySelectorAll('input[type=date]').forEach(function (inp) {
            if (!inp.value && !inp.readOnly && inp.getAttribute('data-nodate') !== '1') inp.value = today;
        });
    }
    if (id === 'modal-rates') {
        $('rate-bizname').value = settings.businessName || '';
        let curStyle = settings.billStyle || 'branded';
        if (curStyle !== 'simple') curStyle = 'branded';
        document.querySelectorAll('#rate-billstyle-toggle .pt-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-style') === curStyle);
        });
        $('rate-noora').value = settings.nooraRate;
        $('rate-tosif').value = settings.tosifRate;
        $('rate-taji').value = settings.tajiRate;
        $('rate-bakdi').value = settings.bakdiRate;
        $('rate-bench').value = settings.milkBench;
        $('rate-feed').value = settings.feedBaseline;
        $('rate-doubling').value = settings.doublingRate;
        $('rate-rent-perkhila').value = N(settings.rentPerKhila, 88);
        $('rate-total-khilas').value = N(settings.totalKhilas, 196);
        updateRentRatePreview();
    }
    if (id === 'modal-breeding') {
        $('reservice-warn').style.display = 'none';
        ['b-tagNo', 'b-faliDate'].forEach(x => ($(x).value = ''));
        const bullNames = bullNamesList();
        $('b-bull').innerHTML =
            '<option value="">- Select Bull -</option>' +
            bullNames.map(n => '<option value="' + n + '">' + n + '</option>').join('');
        $('b-shed').value = '';
        $('b-khilaNo').value = '';
        $('b-tagNote').textContent = '';
        $('b-serviceNo').textContent = '-';
        $('b-drDate').textContent = '-';
    }
    if (id === 'modal-add-customer') {
        ['cu-name', 'cu-rate', 'cu-oldbalance'].forEach(x => ($(x).value = ''));
        $('cu-cycle').value = '';
        $('cu-supplyType').value = '';
        $('cu-startdate').value = todayStr();
        $('cu-fix-fields').style.display = 'none';
        $('cu-morning').value = '';
        $('cu-evening').value = '';
    }
    if (id === 'modal-customer-payment') {
        const sel = $('cpay-name');
        sel.innerHTML =
            '<option value="">-- Select --</option>' +
            customers
                .map(function (c) {
                    return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
                })
                .join('');
        $('cp-amount').value = '';
        $('cp-date').value = todayStr();
        $('cp-current-out').textContent = '-';
        $('cp-after-out').textContent = '-';
        $('cp-lastbill-info').innerHTML = 'Select a customer to check';
    }
    if (id === 'modal-whatsapp-bill') {
        const sel = $('wb-customer');
        sel.innerHTML =
            '<option value="">-- Select --</option>' +
            customers
                .map(function (c) {
                    return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
                })
                .join('');
        $('wb-preview').style.display = 'none';
        const today = new Date();
        const dow = today.getDay();
        const sun = new Date(today);
        sun.setDate(today.getDate() - dow);
        const sat = new Date(today);
        sat.setDate(today.getDate() + (6 - dow));
        const fmt = d =>
            d.getFullYear() +
            '-' +
            String(d.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(d.getDate()).padStart(2, '0');
        $('wb-fromdate').value = fmt(sun);
        $('wb-todate').value = fmt(sat);
    }
    if (id === 'modal-goods-purchase') {
        ['gp-broker', 'gp-goods', 'gp-weight', 'gp-bags', 'gp-rate', 'gp-freight'].forEach(
            x => ($(x).value = '')
        );
        $('gp-date').value = todayStr();
        $('gp-ratetype').value = '';
        ['gp-bagsize', 'gp-freightperkg', 'gp-bill', 'gp-freight-show', 'gp-total-show'].forEach(
            x => ($(x).textContent = '-')
        );
        removeBillPhoto();
    }
    if (id === 'modal-godown-init') {
        ['gi-goods', 'gi-bags', 'gi-bagsize'].forEach(x => ($(x).value = ''));
    }
    if (id === 'modal-feed-consumed') {
        const sel = $('fc-goods');
        sel.innerHTML =
            '<option value="">-- Select --</option>' +
            godownGoodsNames()
                .map(g => `<option value="${g}">${g}</option>`)
                .join('');
        $('fc-date').value = todayStr();
        $('fc-bags').value = '';
        $('fc-totalkg').textContent = '-';
        $('fc-left').textContent = '-';
    }
    if (id === 'modal-add-worker') {
        ['wk-name', 'wk-pagar', 'wk-advance', 'wk-oldbalance'].forEach(x => ($(x).value = ''));
        $('wk-joining').value = todayStr();
        $('wk-role').value = 'Labour';
    }
    if (id === 'modal-labour-payment') {
        const sel = $('lp-worker');
        sel.innerHTML =
            '<option value="">-- Select --</option>' +
            workers
                .map(function (w) {
                    return '<option value="' + w.id + '">' + w.name + '</option>';
                })
                .join('');
        $('lp-amount').value = '';
        $('lp-date').value = todayStr();
    }
    if (id === 'modal-attendance') {
        const sel = $('att-worker');
        sel.innerHTML =
            '<option value="">-- Select --</option>' +
            workers
                .filter(isWorkerActive)
                .map(function (w) {
                    return '<option value="' + w.id + '">' + w.name + '</option>';
                })
                .join('');
        $('att-month').value = todayStr().slice(0, 7);
        $('att-days').value = '';
        $('att-pagar').textContent = '-';
    }
    if (id === 'modal-palak-payment') {
        $('pp-target').value = '';
        $('pp-amount').value = '';
        $('pp-date').value = todayStr();
        ['pp-bill', 'pp-paidtotal', 'pp-after'].forEach(x => ($(x).textContent = '-'));
    }
    if (id === 'modal-bhaiswal') {
        const brokers = allKoriBrokers();
        const sel = $('bh-name');
        sel.innerHTML =
            '<option value="">-- Select --</option>' +
            brokers
                .map(function (b) {
                    return '<option value="' + b + '">' + b + '</option>';
                })
                .join('');
        $('bh-amount').value = '';
        $('bh-date').value = todayStr();
        ['bh-bill', 'bh-totalpaid', 'bh-outstanding'].forEach(x => ($(x).textContent = '-'));
    }
    if (id === 'modal-dana') {
        const danaBrokers = allDanaBrokers();
        const danaSel = $('dana-broker');
        danaSel.innerHTML =
            '<option value="">- Select -</option>' +
            danaBrokers
                .map(function (b) {
                    return '<option value="' + b + '">' + b + '</option>';
                })
                .join('');
        $('dana-amount').value = '';
        $('dana-date').value = todayStr();
        ['dana-totalpaid', 'dana-outstanding'].forEach(x => ($(x).textContent = '-'));
    }
    if (id === 'modal-receipt') {
        const sel = $('rc-customer');
        sel.innerHTML =
            '<option value="">-- Select --</option>' +
            customers
                .map(function (c) {
                    return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
                })
                .join('');
        $('rc-date').value = todayStr();
        $('rc-amount').value = '';
        $('rc-preview').style.display = 'none';
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}
document.querySelectorAll('.modal-overlay').forEach(el =>
    el.addEventListener('click', e => {
        if (e.target === el) el.classList.remove('open');
    })
);

// ======================================================
//  GENERIC CONFIRM (used instead of window.confirm(), which is
//  silently unreliable in iOS "Add to Home Screen" standalone mode)
// ======================================================
let _pendingConfirmAction = null;

function openGenericConfirm(title, msg, onConfirm) {
    _pendingConfirmAction = onConfirm;
    $('generic-confirm-title').textContent = title;
    $('generic-confirm-msg').textContent = msg;
    $('confirm-generic-overlay').classList.add('open');
}

function closeGenericConfirm() {
    $('confirm-generic-overlay').classList.remove('open');
    _pendingConfirmAction = null;
}

function runGenericConfirm() {
    const fn = _pendingConfirmAction;
    closeGenericConfirm();
    if (fn) fn();
}

// ======================================================
//  CONFIRM DELETE
// ======================================================
function confirmDeleteAnimal() {
    $('confirm-overlay').classList.add('open');
}

function closeConfirm() {
    $('confirm-overlay').classList.remove('open');
}

// Herd Book's "Entry" and "Payment" buttons each open this same picker
// sheet with a different option list, instead of the screen showing all
// 8 entry actions and 2 payment actions as separate buttons at once.
const HERD_ENTRY_ACTIONS = [
    { icon: '➕', label: 'Add Buffalo', color: '#1B4FD8', action: "openModal('modal-add-animal')" },
    { icon: '🔁', label: 'FALI Log', color: '#6C2BD9', action: "openModal('modal-breeding')" },
    { icon: '🤝', label: 'KORI Entry', color: '#0694A2', action: "openModal('modal-kori')" },
    { icon: '🔪', label: 'Slaughter', color: '#C81E1E', action: 'openSlaughterModal()' },
    { icon: '💀', label: 'Dead Record', color: '#111827', action: "openModal('modal-dead')" },
    { icon: '💊', label: 'Medicine', color: '#C81E1E', action: "openModal('modal-medicine')" },
    { icon: '💡', label: 'Light Bill', color: '#B45309', action: 'openLightBillModal()' }
];
const HERD_PAYMENT_ACTIONS = [
    { icon: '💊', label: 'Medicine Payment', color: '#0A7C52', action: 'openMedicinePaymentModal()' },
    { icon: '🔪', label: 'Slaughter Payment', color: '#9A1B1B', action: 'openSlaughterPaymentModal()' },
    { icon: '💵', label: 'Kori Payment', color: '#6C2BD9', action: "openModal('modal-bhaiswal')" }
];
function openHerdActionPicker(kind) {
    const list = kind === 'payment' ? HERD_PAYMENT_ACTIONS : HERD_ENTRY_ACTIONS;
    $('herd-picker-title').textContent = kind === 'payment' ? 'Payment' : 'Entry';
    $('herd-picker-grid').innerHTML = list
        .map(
            a =>
                '<button class="action-btn" style="background:' +
                a.color +
                '" onclick="closeHerdActionPicker();' +
                a.action +
                '"><span class="ab-icon">' +
                a.icon +
                '</span>' +
                esc(a.label) +
                '</button>'
        )
        .join('');
    $('herd-action-picker-overlay').classList.add('open');
}
function closeHerdActionPicker() {
    $('herd-action-picker-overlay').classList.remove('open');
}

async function deleteCurrentAnimal() {
    if (!currentAnimalId) return;
    const a = animals.find(x => x.id === currentAnimalId);
    if (a) await softDelete('animals', a);
    animals = animals.filter(a => a.id !== currentAnimalId);
    closeConfirm();
    closeDetail();
    toast('🗑️ Animal deleted (recoverable for 30 days)');
    matrixDirty = true;
    renderDashboard();
}

function confirmDeleteCustomer() {
    $('confirm-customer-overlay').classList.add('open');
}

function closeConfirmCustomer() {
    $('confirm-customer-overlay').classList.remove('open');
}

async function deleteCurrentCustomer() {
    if (!currentCustomerId) return;
    const c = customers.find(x => x.id === currentCustomerId);
    if (c) await softDelete('customers', c);
    customers = customers.filter(c => c.id !== currentCustomerId);
    closeConfirmCustomer();
    closeCustomer();
    toast('🗑️ Customer deleted (recoverable for 30 days)');
    renderSupply();
}

function confirmDeleteWorker() {
    $('confirm-worker-overlay').classList.add('open');
}

function closeConfirmWorker() {
    $('confirm-worker-overlay').classList.remove('open');
}

async function deleteCurrentWorker() {
    if (!currentWorkerId) return;
    const w = workers.find(x => x.id === currentWorkerId);
    if (w) await softDelete('workers', w);
    workers = workers.filter(w => w.id !== currentWorkerId);
    closeConfirmWorker();
    closeWorker();
    toast('🗑️ Worker deleted (recoverable for 30 days)');
    renderLabour();
}

// ======================================================
//  RATES
// ======================================================
async function saveRates() {
    try {
        settings.businessName = ($('rate-bizname').value || '').trim();
        const activeStyleBtn = document.querySelector('#rate-billstyle-toggle .pt-btn.active');
        settings.billStyle = activeStyleBtn
            ? activeStyleBtn.getAttribute('data-style')
            : settings.billStyle || 'branded';
        settings.nooraRate = N($('rate-noora').value, 3300);
        settings.tosifRate = N($('rate-tosif').value, 3100);
        settings.tajiRate = N($('rate-taji').value, 3400);
        settings.bakdiRate = N($('rate-bakdi').value, 1800);
        settings.milkBench = N($('rate-bench').value, 192);
        settings.feedBaseline = N($('rate-feed').value, 200);
        settings.doublingRate = N($('rate-doubling').value, 15000);
        settings.rentPerKhila = N($('rate-rent-perkhila').value, 88);
        settings.totalKhilas = N($('rate-total-khilas').value, 196);
        if (!settings.rentStartDate) settings.rentStartDate = todayStr().slice(0, 7) + '-01';
        await dbPut('settings', settings);
        closeModal('modal-rates');
        toast('✅ Rates saved');
        renderDashboard();
        renderAccounts();
    } catch (err) {
        console.error('saveRates failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

function updateRentRatePreview() {
    const rate = N($('rate-rent-perkhila').value);
    const khilas = N($('rate-total-khilas').value);
    $('rate-rent-preview').textContent = cur(Math.round(rate * khilas));
}

// ======================================================
//  CURRENT RATES SUMMARY (read-only)
// ======================================================
function ratesRow(label, sub, val, color) {
    return (
        '<div class="it-row"><span class="it-label">' +
        label +
        (sub
            ? '<br><span style="font-size:10px;color:var(--light);font-weight:400">' + sub + '</span>'
            : '') +
        '</span><span class="it-val" style="color:' +
        (color || 'var(--ink)') +
        '">' +
        val +
        '</span></div>'
    );
}

function openCurrentRatesModal() {
    const FR = freshBuyRates();
    const sellRate = avgCustomerSellingRate();
    const feedCostAllPurchased = (function () {
        let cost = 0,
            kg = 0;
        for (const p of goodsPurchases) {
            cost += N(p.bill);
            kg += N(p.weight);
        }
        return kg > 0 ? cost / kg : 0;
    })();

    let html =
        '<div class="sec-title">Fixed Rates (⚙️ Rates)</div><div class="info-table">' +
        ratesRow('Noora', '₹ per animal / month', cur(N(settings.nooraRate))) +
        ratesRow('Tosif', '₹ per animal / month', cur(N(settings.tosifRate))) +
        ratesRow('Irshad - TAJI In', '₹ per animal (inward)', cur(N(settings.tajiRate))) +
        ratesRow('Irshad - BAKDI Out', '₹ per animal (outward)', cur(N(settings.bakdiRate))) +
        ratesRow('Milk Benchmark', 'Litres per buffalo / month', N(settings.milkBench, 192)) +
        ratesRow('Feed Baseline', 'kg daily standard', N(settings.feedBaseline, 200)) +
        ratesRow('Doubling Rate', '₹ per labour / month', cur(N(settings.doublingRate))) +
        ratesRow(
            'Stable Rent',
            cur(N(settings.rentPerKhila, 88)) + '/khila x ' + N(settings.totalKhilas, 196) + ' khilas',
            cur(stableRentMonthly()) + '/mo'
        ) +
        '</div>' +
        '<div class="sec-title">Live Averages (computed from your data)</div><div class="info-table">' +
        ratesRow(
            'Avg Selling Rate',
            'Weighted by customer daily litres',
            cur(sellRate.toFixed(2)) + '/L',
            '#0A7C52'
        ) +
        ratesRow(
            'Avg KORI Rate',
            FR.koriCountTotal + ' animals purchased',
            FR.avgKoriRate > 0 ? cur(Math.round(FR.avgKoriRate)) : '--',
            '#1B4FD8'
        ) +
        ratesRow(
            'Avg TAJI Rate',
            FR.tajiCount + ' TAJI entries',
            FR.avgTajiRate > 0 ? cur(Math.round(FR.avgTajiRate)) : '--',
            '#0694A2'
        ) +
        ratesRow(
            'Avg Fresh Buffalo Rate',
            '(KORI + TAJI) combined',
            FR.avgFreshRate > 0 ? cur(Math.round(FR.avgFreshRate)) : '--',
            '#6C2BD9'
        ) +
        ratesRow(
            'Avg Feed Cost/kg',
            'Total cost / kg purchased',
            feedCostAllPurchased > 0 ? cur(feedCostAllPurchased.toFixed(2)) : '--',
            '#B45309'
        ) +
        '</div>' +
        '<div class="sec-title">Current Feed / Goods Rates</div><div class="info-table">' +
        (godownGoodsNames().length
            ? godownGoodsNames()
                  .map(name => ratesRow(name, goodsBagSize(name) + ' kg/bag', cur(goodsRate(name)) + '/kg'))
                  .join('')
            : '<div class="empty">No goods purchased yet</div>') +
        '</div>';

    $('current-rates-body').innerHTML = html;
    openModal('modal-current-rates');
}

// ======================================================
//  DATA INTEGRITY CHECK (read-only)
// ======================================================
// Each check compares a total the app already reports against an
// independent recomputation of the same quantity from raw records -
// not the same helper function called twice. A mismatch means either
// an orphaned record (references something deleted) or a genuine
// calculation bug worth investigating.
function integrityRow(label, a, b, note, isCurrency) {
    const fmt = v => (isCurrency ? cur(Math.round(v)) : Math.round(v * 100) / 100);
    const match = Math.abs(a - b) < 1;
    return (
        '<div class="list-card"><div class="lc-row"><div style="flex:1"><div class="lc-title">' +
        (match ? '✅ ' : '⚠️ ') +
        label +
        '</div><div class="lc-sub">App total: ' +
        fmt(a) +
        ' &nbsp;·&nbsp; Recomputed: ' +
        fmt(b) +
        (note ? '<br>' + note : '') +
        '</div></div></div></div>'
    );
}

function openDataIntegrityModal() {
    let html = '';

    // 1) Every animal record should land in exactly one recognized
    // location bucket or terminal status - if not, it has a typo'd or
    // blank location and silently vanishes from every dashboard count.
    {
        const shedLocs = ['Shed A', 'Shed B', 'Yard A', 'Yard B', 'Noora', 'Tosif'];
        let bucketed = 0;
        const unrecognized = [];
        animals.forEach(a => {
            if (a.status === 'Slaughtered' || a.status === 'Dead') {
                bucketed++;
                return;
            }
            if (shedLocs.includes(a.location)) {
                bucketed++;
                return;
            }
            unrecognized.push(a.tagNo || a.id);
        });
        html += integrityRow(
            'Animal location coverage',
            animals.length,
            bucketed,
            unrecognized.length
                ? 'Unrecognized location on: ' +
                      unrecognized.slice(0, 5).join(', ') +
                      (unrecognized.length > 5 ? ' +' + (unrecognized.length - 5) + ' more' : '')
                : ''
        );
    }

    // 2) Sum of each customer's outstanding balance should equal the sum
    // of their old balances + total billed, minus ALL customer payments -
    // by simple algebra, since customerOutstanding = oldBalance + billed - paid.
    // A mismatch here means a payment references a customer id that no
    // longer exists (deleted customer with orphaned payment history).
    {
        const sumOutstanding = customers.reduce((s, c) => s + customerOutstanding(c), 0);
        const sumOldBalance = customers.reduce((s, c) => s + N(c.oldBalance), 0);
        const sumBilled = customers.reduce((s, c) => s + customerTotalBilled(c).amount, 0);
        const sumAllPayments = customerPayments.reduce((s, p) => s + N(p.amount), 0);
        const recomputed = sumOldBalance + sumBilled - sumAllPayments;
        const custIds = new Set(customers.map(c => c.id));
        const orphaned = customerPayments.filter(p => !custIds.has(p.customerId));
        html += integrityRow(
            'Customer outstanding total',
            sumOutstanding,
            recomputed,
            orphaned.length
                ? orphaned.length +
                      ' payment(s) reference a deleted customer (₹' +
                      Math.round(orphaned.reduce((s, p) => s + N(p.amount), 0)) +
                      ')'
                : '',
            true
        );
    }

    // 3) Same idea for workers: sum of workerBalance should equal
    // sum(earned) + sum(oldBalance) - sum(paid) - sum(advance).
    {
        const sumBalance = workers.reduce((s, w) => s + workerBalance(w), 0);
        const sumEarned = workers.reduce((s, w) => s + workerEarnedTotal(w), 0);
        const sumOldBalance = workers.reduce((s, w) => s + N(w.oldBalance), 0);
        const sumAdvance = workers.reduce((s, w) => s + N(w.advance), 0);
        const sumAllPaid = labourPayments.reduce((s, p) => s + N(p.amount), 0);
        const recomputed = sumEarned + sumOldBalance - sumAllPaid - sumAdvance;
        const workerIds = new Set(workers.map(w => w.id));
        const orphaned = labourPayments.filter(p => !workerIds.has(p.workerId));
        html += integrityRow(
            'Labour balance total',
            sumBalance,
            recomputed,
            orphaned.length
                ? orphaned.length +
                      ' payment(s) reference a deleted worker (₹' +
                      Math.round(orphaned.reduce((s, p) => s + N(p.amount), 0)) +
                      ')'
                : '',
            true
        );
    }

    // 4) Medicine outstanding: the app's total uses one floor-at-zero for
    // the whole farm, but the per-vendor breakdown floors each vendor
    // separately - these only match when no single vendor is in credit.
    {
        const totalFloored = medTotalOutstanding();
        const names = medicineNamesList();
        const sumPerName = names.reduce((s, n) => s + medOutstandingForName(n), 0);
        html += integrityRow(
            'Medicine outstanding (total vs. sum-of-vendors)',
            totalFloored,
            sumPerName,
            'These can legitimately differ if one vendor is overpaid (in credit) while another is owed - each vendor floors at zero individually.',
            true
        );
    }

    // 5) P&L arithmetic self-check: revenue minus expense must equal the
    // reported net P&L - guards against the return statement drifting
    // from the actual calculation after an edit.
    {
        const pl = plData('yearly');
        const recomputed = pl.totalRevenue - pl.totalExpense;
        html += integrityRow('P&L arithmetic (this year)', pl.netPL, recomputed, '', true);
    }

    // 6) Every persisted bill's stored net amount should equal
    // totalAmount + prevBalance - paidInRange, at the time it was made.
    {
        const badBills = bills.filter(
            b => Math.abs(N(b.totalAmount) + N(b.prevBalance) - N(b.paidInRange) - N(b.netAmount)) >= 1
        );
        html += integrityRow(
            'Saved bill totals (' + bills.length + ' bills)',
            0,
            badBills.length,
            badBills.length
                ? badBills.length +
                      ' bill(s) have an inconsistent stored total: ' +
                      badBills.map(b => b.invoiceNo).join(', ')
                : 'All saved bills are internally consistent.'
        );
    }

    // 7) Stock ledger self-consistency: today's Closing should equal
    // today's Opening - Consumed + Purchased, exactly like the legend on
    // the Stock screen says. If these ever disagree for a goods item, its
    // consumption isn't actually draining the running balance.
    {
        const today = todayStr();
        const prevDayStr = addDays(today, -1);
        const badGoods = [];
        godownGoodsNames().forEach(name => {
            const openDate = goodsOpeningDate(name);
            const opening =
                openDate && today <= openDate ? goodsOpeningBags(name) : closingStockAsOf(name, prevDayStr);
            const purchased = goodsPurchases
                .filter(g => g.name === name && g.date === today)
                .reduce((s, g) => s + N(g.bags), 0);
            const rawConsumed = consumedBagsOnDate(name, today);
            const consumed = Math.min(rawConsumed, opening + purchased);
            const expectedClosing = Math.max(0, opening - consumed + purchased);
            const actualClosing = closingStockAsOf(name, today);
            if (Math.abs(expectedClosing - actualClosing) >= 1) badGoods.push(name);
        });
        html += integrityRow(
            'Stock ledger consistency (' + godownGoodsNames().length + ' goods)',
            0,
            badGoods.length,
            badGoods.length
                ? "Closing doesn't match Opening-Consumed+Purchased for: " + badGoods.join(', ')
                : "Every goods item's running balance checks out."
        );
    }

    $('data-integrity-body').innerHTML = html;
    openModal('modal-data-integrity');
}

function setBillStylePref(style, btn) {
    document.querySelectorAll('#rate-billstyle-toggle .pt-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
}