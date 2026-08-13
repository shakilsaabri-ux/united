// ======================================================
//  dashboard.js
//  Main Dashboard tab: stat cards, period toggle, P&L calculator, cash flow tiles.
// ======================================================

// ======================================================
//  PERIOD TOGGLE
// ======================================================
function setPeriod(p, btn) {
    dashPeriod = p;
    document.querySelectorAll('.pt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDashboard();
}

// ======================================================
//  COMPUTE STATS
// ======================================================
function computeStats() {
    const today = todayStr();
    let shedA = 0,
        shedB = 0,
        noora = 0,
        tosif = 0,
        gujarat = 0,
        taji = 0,
        kori = 0,
        bakdi = 0,
        dead = 0,
        slaughtered = 0,
        pregnant = 0,
        fali = 0,
        khali = 0,
        p7 = 0,
        repeat = 0,
        needSvc = 0,
        drDue = 0;
    let slaughterTotal = 0,
        slaughterCount = 0;
    let earliest = null;
    let uncategorised = 0;
    const active = [];
    for (const a of animals) {
        if (a.status === 'Dead') {
            dead++;
            continue;
        }
        if (a.status === 'Slaughtered') {
            slaughtered++;
            if (a.soldAmount) {
                slaughterTotal += N(a.soldAmount);
                slaughterCount++;
            }
            if (a.outwardType === 'BAKDI') bakdi++;
            continue;
        }
        if (a.outwardType === 'BAKDI') bakdi++;
        const loc = a.location;
        if (loc === 'Shed A' || loc === 'Yard A') shedA++;
        else if (loc === 'Shed B' || loc === 'Yard B') shedB++;
        else if (loc === 'Noora') noora++;
        else if (loc === 'Tosif') tosif++;
        else if (loc === 'Gujarat') gujarat++;
        else uncategorised++;
        if (a.type === 'TAJI') taji++;
        else kori++;
        if (a.status === 'Pregnant') {
            if (['Shed A', 'Yard A', 'Shed B', 'Yard B'].includes(loc)) {
                pregnant++;
                if (a.faliDate && daysBetween(a.faliDate, today) >= 210) p7++;
            }
        } else if (a.status === 'FALI') fali++;
        else if (a.status === 'KHALI') khali++;
        if (N(a.servicedCycle) > 3) repeat++;
        if (!a.faliDate && daysBetween(a.incomingDate, today) > 60) needSvc++;
        else if (a.status === 'KHALI' && a.lastDrKhaliDate && daysBetween(a.lastDrKhaliDate, today) >= 30)
            needSvc++;
        if (a.drCheckDate && a.drCheckDate >= today && a.drCheckDate <= addDays(today, 7)) drDue++;
        if (!earliest || a.incomingDate < earliest) earliest = a.incomingDate;
        active.push(a);
    }
    const totalActive = shedA + shedB + noora + tosif + gujarat + uncategorised;
    const monthsOfData = earliest
        ? Math.max(1, (new Date(today) - new Date(earliest + 'T00:00:00')) / (864e5 * 30))
        : 1;
    // Herd Book needs these too - computed once here so Dashboard and
    // Herd Book can never drift apart on the same figure again.
    const realTajiCount = tajiEntries.length;
    const realKoriCount = koriEntries.reduce((s, k) => s + N(k.count), 0);
    const toSlaughteredCount = animals.filter(a => a.status === 'To Be Slaughtered').length;
    return {
        shedA,
        shedB,
        noora,
        tosif,
        gujarat,
        taji,
        kori,
        bakdi,
        dead,
        slaughtered,
        pregnant,
        fali,
        khali,
        p7,
        repeat,
        needSvc,
        drDue,
        slaughterTotal,
        slaughterCount,
        totalActive,
        monthsOfData,
        today,
        active,
        realTajiCount,
        realKoriCount,
        toSlaughteredCount
    };
}

// ======================================================
//  DASHBOARD RENDER
// ======================================================
function renderDashboard() {
    const S = computeStats();
    const {
        shedA,
        shedB,
        noora,
        tosif,
        gujarat,
        taji,
        kori,
        bakdi,
        dead,
        slaughtered,
        pregnant,
        fali,
        p7,
        repeat,
        needSvc,
        drDue,
        slaughterTotal,
        slaughterCount,
        totalActive,
        monthsOfData,
        today
    } = S;

    $('dh-total').textContent = totalActive + ' Animals';
    $('dh-date').textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    $('dh-shedA').textContent = 'Shed A: ' + shedA;
    $('dh-shedB').textContent = 'Shed B: ' + shedB;
    $('dh-noora').textContent = 'Noora: ' + noora;
    $('dh-tosif').textContent = 'Tosif: ' + tosif;

    const milkLogs = settings.milkLogs || [];
    const feedLogs = settings.feedLogs || [];
    const totalFeedExpense = N(settings.totalFeedExpense);
    const milkSaleRate = N(settings.milkSaleRate);

    let totalMilkL = 0,
        totalFeedKg = 0,
        totalFeedCost = 0;
    for (const l of milkLogs) totalMilkL += N(l.totalLitres);
    for (const l of feedLogs) {
        totalFeedKg += N(l.totalKg);
        totalFeedCost += N(l.totalCost);
    }
    const milkDays = milkLogs.length || 1;

    const medicineTotal = N(settings.medicineTotal);

    const avgHerdProd = milkDays > 0 ? totalMilkL / milkDays : 0;

    renderDash16Cards(S, milkLogs, milkDays, avgHerdProd);
    renderMilkPL();
    renderCashflowTiles();
    checkBackupReminder();
    renderKasaiAlert();

    if (matrixDirty) {
        renderDeliveryMatrix(today);
        matrixDirty = false;
    }
}

// ======================================================
//  ACCOUNTS DASHBOARD - QUICK PAYMENT CARDS (Rent / Purchased Milk / Misc)
// ======================================================
function renderAccQuickPayments() {
    const el = document.getElementById('acc-quick-payments');
    if (!el) return;
    const QP = [
        {
            icon: '🏠',
            name: 'Stable Rent',
            sub:
                cur(N(settings.rentPerKhila, 88)) +
                '/khila x ' +
                N(settings.totalKhilas, 196) +
                ' . Tap to pay',
            val: cur(Math.round(rentOutstanding())),
            color: '#B45309',
            key: 'openRentPaymentModal()'
        },
        {
            icon: '🥛',
            name: 'Purchased Milk Payment',
            sub: 'Weekly bill (Sun-Sat) . Tap to enter',
            val: cur(Math.round(milkPurchaseTotalOutstanding())),
            color: '#1B4FD8',
            key: 'openMilkPurchasePaymentModal()'
        },
        {
            icon: '🧾',
            name: 'Misc Expense',
            sub: 'Water, cooking, diesel, repairs & more . Tap to add',
            val: cur(Math.round(miscExpenseTotal())),
            color: '#9333EA',
            key: 'openMiscExpenseModal()'
        }
    ];
    el.innerHTML = statBillGrid(QP);
}

// Shared by the Home dashboard's average cards and the Accounts screen's
// average cards - both showed the exact same KORI/TAJI/Fresh rates, computed
// separately in two places. One source of truth now.
function freshBuyRates() {
    const koriTotalBill = koriEntries.reduce((s, k) => s + N(k.total), 0);
    const koriCountTotal = koriEntries.reduce((s, k) => s + N(k.count), 0);
    const avgKoriRate = koriCountTotal > 0 ? koriTotalBill / koriCountTotal : 0;
    const tajiPalakBills = tajiEntries.reduce((s, t) => s + N(t.bill), 0);
    const tajiCount = tajiEntries.length || 0;
    const avgTajiRate = tajiCount > 0 ? tajiPalakBills / tajiCount : 0;
    const freshBillTotal = koriTotalBill + tajiPalakBills;
    const freshCountTotal = koriCountTotal + tajiCount;
    const avgFreshRate = freshCountTotal > 0 ? freshBillTotal / freshCountTotal : 0;
    return {
        koriTotalBill,
        koriCountTotal,
        avgKoriRate,
        tajiPalakBills,
        tajiCount,
        avgTajiRate,
        freshBillTotal,
        freshCountTotal,
        avgFreshRate
    };
}

// Weighted-average customer milk selling rate (weighted by each customer's
// daily litres) - was computed identically in three separate places
// (dashboard averages, Accounts, Milk P&L calculator). Falls back to the
// flat settings.milkSaleRate only when there's no customer data at all.
function avgCustomerSellingRate() {
    let wtdNum = 0,
        wtdDen = 0;
    for (const cust of customers) {
        const dL =
            cust.supplyType === 'Fix'
                ? N(cust.morning) + N(cust.evening)
                : (cust.dailyLogs || []).reduce((s, l) => s + N(l.morning) + N(l.evening), 0) /
                  Math.max(1, (cust.dailyLogs || []).length);
        wtdNum += N(cust.rate) * dL;
        wtdDen += dL;
    }
    return wtdDen > 0 ? wtdNum / wtdDen : N(settings.milkSaleRate) || 0;
}

// ======================================================
//  DASHBOARD - 16 AVERAGE CARDS
// ======================================================
function renderDash16Cards(S, milkLogs, milkDays, avgHerdProd) {
    var el = document.getElementById('dash-herd-summary');
    if (!el) return;
    var totalMilkL = 0;
    for (var i = 0; i < milkLogs.length; i++) totalMilkL += N(milkLogs[i].totalLitres);
    var avgHerdProdL = milkDays > 0 ? totalMilkL / milkDays : 0;
    var avgMilkPerAnimal = avgHerdProdL / (N(settings.milkBench) || 192);
    var monthsData = S.monthsOfData || 1;
    var freshTotal =
        koriEntries.reduce(function (s, k) {
            return s + N(k.count);
        }, 0) + tajiEntries.length;
    var avgFreshPerMonth = freshTotal / Math.max(1, monthsData);
    var FR = freshBuyRates();
    var koriTotalBill = FR.koriTotalBill,
        koriCountTotal = FR.koriCountTotal,
        avgKoriRate = FR.avgKoriRate,
        tajiPalakBills = FR.tajiPalakBills,
        tajiCount = FR.tajiCount,
        avgTajiRate = FR.avgTajiRate,
        avgFreshRate = FR.avgFreshRate;
    var feedCostTotal = goodsPurchases.reduce(function (s, p) {
        return s + N(p.bill);
    }, 0);
    var feedKgTotal = 0;
    var feedGoodsNames = godownGoodsNames();
    for (var fgi = 0; fgi < feedGoodsNames.length; fgi++) {
        feedKgTotal += totalKgConsumedAllTime(feedGoodsNames[fgi]);
    }
    var avgFeedCostPerKg = feedKgTotal > 0 ? feedCostTotal / feedKgTotal : 0;
    var avgSellingRate = avgCustomerSellingRate();
    var nooraCharge = N(S.noora) * N(settings.nooraRate);
    var tosifCharge = N(S.tosif) * N(settings.tosifRate);
    var labourMo = totalPagarMonth();
    var medTotal2 = medBills.reduce(function (s, b) {
        return s + N(b.amount);
    }, 0);
    var lightTotal2 = lightBills.reduce(function (s, b) {
        return s + N(b.amount);
    }, 0);
    var feedMo = feedCostTotal / Math.max(1, monthsData);
    var irshadMo = tajiPalakBills / Math.max(1, monthsData);
    var rentMo = stableRentMonthly();
    var miscMo = miscExpenseTotal() / Math.max(1, monthsData);
    var totalOpex =
        nooraCharge +
        tosifCharge +
        labourMo +
        medTotal2 / Math.max(1, monthsData) +
        lightTotal2 / Math.max(1, monthsData) +
        feedMo +
        irshadMo +
        rentMo +
        miscMo;
    var avgMilkCostPerL = totalMilkL > 0 ? totalOpex / totalMilkL : 0;
    var slaughterRev = animals
        .filter(function (a) {
            return a.status === 'Slaughtered';
        })
        .reduce(function (s, a) {
            return s + N(a.soldAmount);
        }, 0);
    var slaughterCnt = animals.filter(function (a) {
        return a.status === 'Slaughtered';
    }).length;
    var avgSlaughterRate = slaughterCnt > 0 ? slaughterRev / slaughterCnt : 0;
    var totalPagar = labourMo;
    var avgMedMonthly = medTotal2 / Math.max(1, monthsData);
    var activeHerdCount = animals.filter(function (a) {
        return !['Slaughtered', 'Dead'].includes(a.status);
    }).length;
    var pregnantHerdCount = animals.filter(function (a) {
        return a.status === 'Pregnant';
    }).length;
    var herdPregPct = activeHerdCount > 0 ? (pregnantHerdCount / activeHerdCount) * 100 : 0;
    var irshadBakdiCount = S.bakdi || 0;
    var irshadTotal = tajiEntries.length * N(settings.tajiRate) + irshadBakdiCount * N(settings.bakdiRate);
    var avgIrshadMonth = irshadTotal / Math.max(1, monthsData);
    var deadCount = animals.filter(function (a) {
        return a.status === 'Dead';
    }).length;
    var avgDeadMonth = deadCount / Math.max(1, monthsData);
    var avgSlaughterMonth = slaughterCnt / Math.max(1, monthsData);
    var avgPagarPerLab = workers.length > 0 ? totalPagar / workers.length : 0;

    // 14-day trend for the Avg Herd Production sparkline - sorted oldest-to-newest
    // so the line reads left-to-right chronologically, same as the milk logs already
    // stored on settings (one entry per day of recorded shed production).
    var sortedMilkLogs = milkLogs.slice().sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    var milkTrend = sortedMilkLogs.slice(-14).map(function (l) {
        return N(l.totalLitres);
    });

    var cards = [
        {
            icon: '🥛',
            name: 'Avg Herd Production',
            sub: 'Cumulative daily avg',
            val: avgHerdProdL > 0 ? avgHerdProdL.toFixed(1) + ' L/day' : '--',
            color: '#0694A2',
            spark: milkTrend.length > 1 ? milkTrend : null
        },
        {
            icon: '🐃',
            name: 'Avg Milk / Buffalo',
            sub: 'vs ' + (N(settings.milkBench) || 192) + 'L/mo benchmark',
            val: avgMilkPerAnimal > 0 ? avgMilkPerAnimal.toFixed(2) + ' L/day' : '--',
            color: '#0A7C52'
        },
        {
            icon: '🚀',
            name: 'Avg Fresh Animals/mo',
            sub: 'KORI + TAJI combined',
            val: avgFreshPerMonth > 0 ? avgFreshPerMonth.toFixed(1) + '/mo' : '--',
            color: '#6C2BD9'
        },
        {
            icon: '🤝',
            name: 'Avg KORI Rate',
            sub: 'Bills / animals bought',
            val: avgKoriRate > 0 ? cur(Math.round(avgKoriRate)) : '--',
            color: '#1B4FD8'
        },
        {
            icon: '🚛',
            name: 'Avg TAJI Rate',
            sub: 'Palak bills / taji count',
            val: avgTajiRate > 0 ? cur(Math.round(avgTajiRate)) : '--',
            color: '#0694A2'
        },
        {
            icon: '🐄',
            name: 'Avg Fresh Buffalo Rate',
            sub: 'KORI+TAJI combined cost',
            val: avgFreshRate > 0 ? cur(Math.round(avgFreshRate)) : '--',
            color: '#6C2BD9'
        },
        {
            icon: '🌾',
            name: 'Avg Feed Cost/kg',
            sub: 'Total cost / kg consumed',
            val: avgFeedCostPerKg > 0 ? cur(avgFeedCostPerKg.toFixed(2)) + '/kg' : '--',
            color: '#B45309'
        },
        {
            icon: '📈',
            name: 'Avg Selling Rate',
            sub: 'Weighted avg customer rate',
            val: avgSellingRate > 0 ? cur(avgSellingRate.toFixed(2)) + '/L' : '--',
            color: '#0A7C52'
        },
        {
            icon: '📉',
            name: 'Avg Milk Cost (Prod)',
            sub: 'Opex / litres produced',
            val: avgMilkCostPerL > 0 ? cur(avgMilkCostPerL.toFixed(2)) + '/L' : '--',
            color: '#C81E1E'
        },
        {
            icon: '🔪',
            name: 'Avg Slaughter Rate',
            sub: 'Revenue / animals sold',
            val: avgSlaughterRate > 0 ? cur(Math.round(avgSlaughterRate)) : '--',
            color: '#C81E1E'
        },
        {
            icon: '🔪',
            name: 'Avg Slaughtered/Month',
            sub: 'Total slaughtered / months data',
            val: avgSlaughterMonth > 0 ? avgSlaughterMonth.toFixed(2) + '/mo' : '--',
            color: '#C81E1E'
        },
        {
            icon: '💊',
            name: 'Avg Medicine/Month',
            sub: 'Total med bills / months',
            val: avgMedMonthly > 0 ? cur(Math.round(avgMedMonthly)) + '/mo' : '--',
            color: '#C81E1E'
        },
        {
            icon: '🤰',
            name: 'Herd Pregnancy %',
            sub: 'Tap for bull-wise breakdown',
            val: herdPregPct > 0 ? herdPregPct.toFixed(1) + '%' : '--',
            color: '#6C2BD9',
            key: 'openHerdPregnancyDetail()'
        },
        {
            icon: '🚚',
            name: 'Avg Irshad/Month',
            sub: 'Freight bills / months',
            val: avgIrshadMonth > 0 ? cur(Math.round(avgIrshadMonth)) + '/mo' : '--',
            color: '#0694A2'
        },
        {
            icon: '💀',
            name: 'Avg Dead/Month',
            sub: 'Total dead / months data',
            val: avgDeadMonth > 0 ? avgDeadMonth.toFixed(2) + '/mo' : '--',
            color: '#374151'
        },
        {
            icon: '💵',
            name: 'Avg Pagar/Labour',
            sub: 'Total pagar / worker count',
            val: avgPagarPerLab > 0 ? cur(Math.round(avgPagarPerLab)) + '/mo' : '--',
            color: '#0A7C52'
        }
    ];
    el.innerHTML = statBillGrid(cards);
}

// ======================================================
//  MILK P&L CALCULATOR
// ======================================================
let plScenarioRate = 0,
    plScenarioQty = 0;

function renderMilkPL() {
    const el = document.getElementById('milk-pl-calculator');
    if (!el) return;
    const milkLogs = settings.milkLogs || [];
    const feedLogs = settings.feedLogs || [];
    let totalMilkL = 0,
        totalFeedCost = 0,
        totalFeedKg = 0;
    for (const l of milkLogs) totalMilkL += N(l.totalLitres);
    for (const l of feedLogs) {
        totalFeedCost += N(l.totalCost);
        totalFeedKg += N(l.totalKg);
    }
    const milkDays = Math.max(1, milkLogs.length);
    const avgDailyMilk = totalMilkL / milkDays;
    const avgMonthlyMilk = avgDailyMilk * 30;
    const saleRate = avgCustomerSellingRate();
    const S = computeStats();
    const nooraCharge = N(S.noora) * N(settings.nooraRate);
    const tosifCharge = N(S.tosif) * N(settings.tosifRate);
    const labourMo = totalPagarMonth();
    const medTotal = medBills.reduce(function (s, b) {
        return s + N(b.amount);
    }, 0);
    const medMonthly = medTotal / Math.max(1, milkDays / 30);
    const lightTotal2 = lightBills.reduce(function (s, b) {
        return s + N(b.amount);
    }, 0);
    const lightMonthly = lightTotal2 / Math.max(1, milkDays / 30);
    const feedMonthly = totalFeedCost / (milkDays / 30);
    const irshadFreightTotal = tajiEntries.length * N(settings.tajiRate) + N(S.bakdi) * N(settings.bakdiRate);
    const irshadMonthly = irshadFreightTotal / Math.max(1, S.monthsOfData);
    const totalMonthlyCost =
        nooraCharge + tosifCharge + labourMo + medMonthly + lightMonthly + feedMonthly + irshadMonthly;
    const costPerLitre = avgMonthlyMilk > 0 ? totalMonthlyCost / avgMonthlyMilk : 0;
    const plPerLitre = saleRate - costPerLitre;
    const monthlyIncome = saleRate * avgMonthlyMilk;
    const monthlyPL = monthlyIncome - totalMonthlyCost;
    const marginPct = saleRate > 0 ? (plPerLitre / saleRate) * 100 : 0;
    const incomeBarPct =
        totalMonthlyCost > 0 ? Math.min(100, Math.round((monthlyIncome / totalMonthlyCost) * 100)) : 0;
    if (!plScenarioRate || plScenarioRate < 10) plScenarioRate = Math.max(10, Math.round(saleRate || 50));
    if (!plScenarioQty || plScenarioQty < 1) plScenarioQty = Math.max(50, Math.round(avgMonthlyMilk || 500));
    const scenarioPL = (plScenarioRate - costPerLitre) * plScenarioQty;
    const scenarioIncome = plScenarioRate * plScenarioQty;
    const scenarioMargin = plScenarioRate > 0 ? ((plScenarioRate - costPerLitre) / plScenarioRate) * 100 : 0;
    const rateMax = Math.max(120, Math.round(saleRate * 2) || 120);
    const qtyMax = Math.max(3000, Math.round(avgMonthlyMilk * 3) || 3000);
    const isProfitAct = plPerLitre > 0;
    const isProfitScen = scenarioPL > 0;
    const actColor = isProfitAct ? '#0A7C52' : '#C81E1E';
    const actBg = isProfitAct ? 'profit' : 'loss';
    const actIcon = isProfitAct ? '📈' : '📉';
    const scenColor = isProfitScen ? '#0A7C52' : '#C81E1E';
    const scenBg = isProfitScen ? 'profit' : 'loss';
    var h = '';
    h += '<div class="pl-card">';
    h += '<div class="pl-header">';
    h += '<div class="pl-header-title">🥛 Milk Rate Profit &amp; Loss</div>';
    h +=
        '<div class="pl-header-sub">' +
        (avgDailyMilk > 0 ? avgDailyMilk.toFixed(1) + ' L/day avg . ' : '') +
        'Cost ₹' +
        costPerLitre.toFixed(2) +
        '/L . Breakeven ₹' +
        costPerLitre.toFixed(2) +
        '/L</div>';
    h += '</div>';
    h += '<div class="pl-body">';
    h += '<div class="pl-section-head">Monthly Cost Breakdown</div>';
    h +=
        '<div class="pl-row"><span class="pl-label">🐃 Palak (Noora+Tosif)</span><span class="pl-val" style="color:#0A7C52">' +
        cur(Math.round(nooraCharge + tosifCharge)) +
        '/mo</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">👷 Labour Pagar</span><span class="pl-val" style="color:#6C2BD9">' +
        cur(Math.round(labourMo)) +
        '/mo</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">🌾 Feed / Goods</span><span class="pl-val" style="color:#B45309">' +
        cur(Math.round(feedMonthly)) +
        '/mo</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">💊 Medicine</span><span class="pl-val" style="color:#C81E1E">' +
        cur(Math.round(medMonthly)) +
        '/mo</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">💡 Electricity</span><span class="pl-val" style="color:#B45309">' +
        cur(Math.round(lightMonthly)) +
        '/mo</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">🚛 Irshad Freight</span><span class="pl-val" style="color:#0694A2">' +
        cur(Math.round(irshadMonthly)) +
        '/mo</span></div>';
    h +=
        '<div class="pl-row" style="background:var(--bg);margin:0 -15px;padding:7px 15px;border-top:2px solid var(--border)">';
    h += '<span class="pl-label" style="font-weight:800;color:var(--ink)">Total Monthly Cost</span>';
    h +=
        '<span class="pl-val" style="font-size:14px;color:#C81E1E">' +
        cur(Math.round(totalMonthlyCost)) +
        '</span>';
    h += '</div>';
    h += '<div class="pl-section-head" style="margin-top:10px">Current Rate Analysis</div>';
    h +=
        '<div class="pl-row"><span class="pl-label">🥛 Avg Monthly Milk</span><span class="pl-val">' +
        (avgMonthlyMilk > 0 ? avgMonthlyMilk.toFixed(0) + ' L' : '- L') +
        '</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">💰 Sale Rate</span><span class="pl-val">' +
        (saleRate > 0 ? '₹' + saleRate.toFixed(2) + '/L' : 'Not set') +
        '</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">📉 Cost Per Litre</span><span class="pl-val" style="color:#C81E1E">' +
        (costPerLitre > 0 ? '₹' + costPerLitre.toFixed(2) + '/L' : '-') +
        '</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">=️ Breakeven Rate</span><span class="pl-val" style="color:#B45309">' +
        (costPerLitre > 0 ? '₹' + costPerLitre.toFixed(2) + '/L' : '-') +
        '</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">📊 Margin</span><span class="pl-val" style="color:' +
        actColor +
        '">' +
        (saleRate > 0 ? marginPct.toFixed(1) + '%' : '-') +
        '</span></div>';
    h +=
        '<div class="pl-row"><span class="pl-label">💵 Monthly Revenue</span><span class="pl-val" style="color:#1B4FD8">' +
        (monthlyIncome > 0 ? cur(Math.round(monthlyIncome)) : '-') +
        '</span></div>';
    if (totalMonthlyCost > 0 && monthlyIncome > 0) {
        h += '<div style="margin:8px 0 2px">';
        h +=
            '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:3px"><span>Revenue vs Cost</span><span>' +
            incomeBarPct +
            '%</span></div>';
        h +=
            '<div class="pl-bar-wrap"><div class="pl-bar-fill" style="width:' +
            incomeBarPct +
            '%;background:' +
            actColor +
            '"></div></div>';
        h += '</div>';
    }
    h += '<div class="pl-result-band ' + actBg + '">';
    h += '<span class="pl-result-icon">' + actIcon + '</span>';
    h += '<div class="pl-result-body">';
    h +=
        '<div class="pl-result-title" style="color:' +
        actColor +
        '">' +
        (isProfitAct ? 'PROFIT' : 'LOSS') +
        ' ₹' +
        Math.abs(plPerLitre).toFixed(2) +
        '/L</div>';
    h +=
        '<div class="pl-result-sub" style="color:' +
        actColor +
        '">Monthly ' +
        (isProfitAct ? 'Profit' : 'Loss') +
        ': ' +
        cur(Math.round(Math.abs(monthlyPL))) +
        (isProfitAct ? '' : ' . Raise rate by ₹' + Math.abs(plPerLitre).toFixed(2) + '/L to break even') +
        '</div>';
    h += '</div></div>';
    h += '<div class="pl-scenario">';
    h += '<div class="pl-scenario-title">🎯 What-If Scenario Calculator</div>';
    h += '<div class="pl-slider-row">';
    h += '<span class="pl-slider-label">Sale Rate ₹/L</span>';
    h +=
        '<input type="range" class="pl-slider" id="pl-rate-slider" min="10" max="' +
        rateMax +
        '" step="1" value="' +
        plScenarioRate +
        "\" oninput=\"plScenarioRate=+this.value;document.getElementById('pl-rate-val').textContent='₹'+this.value;updatePlScenario()\">";
    h += '<span class="pl-slider-val" id="pl-rate-val">₹' + plScenarioRate + '</span>';
    h += '</div>';
    h += '<div class="pl-slider-row">';
    h += '<span class="pl-slider-label">Monthly Milk L</span>';
    h +=
        '<input type="range" class="pl-slider" id="pl-qty-slider" min="50" max="' +
        qtyMax +
        '" step="10" value="' +
        plScenarioQty +
        "\" oninput=\"plScenarioQty=+this.value;document.getElementById('pl-qty-val').textContent=this.value+'L';updatePlScenario()\">";
    h += '<span class="pl-slider-val" id="pl-qty-val">' + plScenarioQty + 'L</span>';
    h += '</div>';
    h += '<div id="pl-scenario-result">';
    h += '<div class="pl-result-band ' + scenBg + '" style="margin-bottom:0">';
    h += '<span class="pl-result-icon">' + (isProfitScen ? '💰' : '⚠️') + '</span>';
    h += '<div class="pl-result-body">';
    h +=
        '<div class="pl-result-title" style="color:' +
        scenColor +
        '">' +
        (isProfitScen ? 'Profit' : 'Loss') +
        ' ' +
        cur(Math.round(Math.abs(scenarioPL))) +
        '/mo</div>';
    h +=
        '<div class="pl-result-sub" style="color:' +
        scenColor +
        '">₹' +
        plScenarioRate +
        '/L x ' +
        plScenarioQty +
        'L . Margin ' +
        scenarioMargin.toFixed(1) +
        '% . Revenue ' +
        cur(Math.round(scenarioIncome)) +
        '</div>';
    h += '</div></div></div>';
    h += '</div></div></div>';
    el.innerHTML = h;
}

function updatePlScenario() {
    const costPerLitre = calcCostPerLitre();
    const pl = (plScenarioRate - costPerLitre) * plScenarioQty;
    const income = plScenarioRate * plScenarioQty;
    const margin = plScenarioRate > 0 ? ((plScenarioRate - costPerLitre) / plScenarioRate) * 100 : 0;
    const isP = pl > 0;
    const col = isP ? '#0A7C52' : '#C81E1E';
    const bg = isP ? 'profit' : 'loss';
    const icon = isP ? '💰' : '⚠️';
    const el = document.getElementById('pl-scenario-result');
    if (el)
        el.innerHTML =
            '<div class="pl-result-band ' +
            bg +
            '" style="margin-bottom:0">' +
            '<span class="pl-result-icon">' +
            icon +
            '</span>' +
            '<div class="pl-result-body">' +
            '<div class="pl-result-title" style="color:' +
            col +
            '">' +
            (isP ? 'Profit' : 'Loss') +
            ' ' +
            cur(Math.round(Math.abs(pl))) +
            '/mo</div>' +
            '<div class="pl-result-sub" style="color:' +
            col +
            '">₹' +
            plScenarioRate +
            '/L x ' +
            plScenarioQty +
            'L . Margin ' +
            margin.toFixed(1) +
            '% . Revenue ' +
            cur(Math.round(income)) +
            '</div>' +
            '</div></div>';
}

function calcCostPerLitre() {
    const milkLogs = settings.milkLogs || [];
    const feedLogs = settings.feedLogs || [];
    let totalMilkL = 0,
        totalFeedCost = 0;
    for (const l of milkLogs) totalMilkL += N(l.totalLitres);
    for (const l of feedLogs) totalFeedCost += N(l.totalCost);
    const milkDays = Math.max(1, milkLogs.length);
    const avgMonthlyMilk = (totalMilkL / milkDays) * 30;
    const S = computeStats();
    const nooraCharge = N(S.noora) * N(settings.nooraRate);
    const tosifCharge = N(S.tosif) * N(settings.tosifRate);
    const labourMo = totalPagarMonth();
    const medTotal = medBills.reduce((s, b) => s + N(b.amount), 0);
    const medMonthly = medTotal / Math.max(1, milkDays / 30);
    const lightTotal = lightBills.reduce((s, b) => s + N(b.amount), 0);
    const lightMonthly = lightTotal / Math.max(1, milkDays / 30);
    const feedMonthly = totalFeedCost / (milkDays / 30);
    const irshadFreightTotal = tajiEntries.length * N(settings.tajiRate) + N(S.bakdi) * N(settings.bakdiRate);
    const irshadMonthly = irshadFreightTotal / Math.max(1, S.monthsOfData);
    const rentMonthly = stableRentMonthly();
    const miscMonthly = miscExpenseTotal() / Math.max(1, milkDays / 30);
    const totalMonthlyCost =
        nooraCharge +
        tosifCharge +
        labourMo +
        medMonthly +
        lightMonthly +
        feedMonthly +
        irshadMonthly +
        rentMonthly +
        miscMonthly;
    return avgMonthlyMilk > 0 ? totalMonthlyCost / avgMonthlyMilk : 0;
}

// ======================================================
//  SHED VIEW TOGGLE
// ======================================================
let shedViewMode = 'table';
let herdGridTab = 'Shed A';

function toggleShedView() {
    shedViewMode = shedViewMode === 'table' ? 'seating' : 'table';
    const btn = document.getElementById('shed-view-btn');
    if (btn) btn.textContent = shedViewMode === 'table' ? '🗂 Seating' : '📋 Table';
    renderShedGrid();
}

function renderSeatGrid(shedLabel, shedAnimals) {
    const nums = shedAnimals.map(a => parseInt(a.khilaNo) || 0).filter(n => n > 0);
    const maxKhila = nums.length ? Math.max(...nums, 20) : 20;
    const map = {};
    for (const a of shedAnimals) {
        const k = parseInt(a.khilaNo) || 0;
        if (k > 0) map[k] = a;
    }
    let html =
        '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px">' +
        shedLabel +
        ' - Khila Seating</div><div class="seat-grid">';
    for (let k = 1; k <= maxKhila; k++) {
        const a = map[k];
        if (a) {
            const cls =
                a.status === 'Pregnant'
                    ? 'pregnant'
                    : a.status === 'FALI'
                      ? 'fali'
                      : a.status === 'TAJI'
                        ? 'taji'
                        : a.status === 'To Be Slaughtered'
                          ? 'toslaughter'
                          : 'occupied';
            const icon =
                a.status === 'Pregnant'
                    ? '🤰'
                    : a.status === 'FALI'
                      ? '🔁'
                      : a.status === 'TAJI'
                        ? '🚛'
                        : a.status === 'To Be Slaughtered'
                          ? '🔪'
                          : '🐃';
            const shortTag = a.tagNo.replace(/[^0-9]/g, '').slice(-3) || a.tagNo.slice(-3);
            html +=
                '<div class="seat-cell ' +
                cls +
                '" onclick="openDetail(' +
                a.id +
                ')" title="' +
                a.tagNo +
                ' . ' +
                a.status +
                '">' +
                '<span>' +
                icon +
                '</span>' +
                '<span>' +
                shortTag +
                '</span>' +
                '<span class="sc-khila">#' +
                k +
                '</span>' +
                '</div>';
        } else {
            html +=
                '<div class="seat-cell empty"><span style="font-size:14px;opacity:.3">o</span><span class="sc-khila">#' +
                k +
                '</span></div>';
        }
    }
    html += '</div>';
    html +=
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;font-size:9px"><span style="background:var(--blue-lt);color:var(--blue);padding:2px 6px;border-radius:4px">🐃 Active</span><span style="background:var(--purple-lt);color:var(--purple);padding:2px 6px;border-radius:4px">🤰 Pregnant</span><span style="background:var(--amber-lt);color:var(--amber);padding:2px 6px;border-radius:4px">🔁 FALI</span><span style="background:var(--teal-lt);color:var(--teal);padding:2px 6px;border-radius:4px">🚛 TAJI</span><span style="background:var(--red-lt);color:var(--red);padding:2px 6px;border-radius:4px">🔪 To Be Slaughtered</span><span style="background:var(--bg);color:var(--light);padding:2px 6px;border-radius:4px">o Empty</span></div>';
    return html;
}

// ======================================================
//  CASH FLOW TILES
// ======================================================
function renderKasaiAlert() {
    const el = document.getElementById('kasai-out-alert');
    if (!el) return;
    const owed = animals.filter(a => a.status === 'Slaughtered' && (a.kasaiOutstanding || 0) > 0);
    if (!owed.length) {
        el.style.display = 'none';
        return;
    }
    const totalOwed = owed.reduce((s, a) => s + N(a.kasaiOutstanding), 0);
    el.style.display = 'block';
    el.innerHTML =
        '<div style="background:var(--amber-lt);border:1px solid var(--amber);border-radius:10px;padding:10px 12px">' +
        '<div style="font-size:11px;font-weight:800;color:#B45309;margin-bottom:5px">🔪 Kasai Balance Due - ' +
        cur(Math.round(totalOwed)) +
        '</div>' +
        owed
            .map(function (a) {
                return (
                    '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)"><span style="color:var(--ink);font-weight:600">' +
                    a.tagNo +
                    (a.kasaiName ? ' . ' + a.kasaiName : '') +
                    '</span><span style="color:var(--red);font-weight:800">' +
                    cur(a.kasaiOutstanding) +
                    '</span></div>'
                );
            })
            .join('') +
        '<div style="font-size:10px;color:var(--light);margin-top:5px;font-style:italic">Outstanding slaughter payments - follow up with Kasai</div>' +
        '</div>';
}

function renderFeedLowAlert() {
    const el = document.getElementById('feed-low-alert');
    if (!el) return;
    // "Feed Baseline" on the Rates screen is meant to drive this threshold -
    // was a hardcoded 200 that ignored the setting entirely.
    const LOW_THRESHOLD_KG = N(settings.feedBaseline) || 200;
    const today = todayStr();
    const lowItems = [];
    const allNames = godownGoodsNames();
    for (const name of allNames) {
        const bagSize = goodsBagSize(name);
        const closingBags = closingStockAsOf(name, today);
        const balanceKg = closingBags * bagSize;
        if (balanceKg < LOW_THRESHOLD_KG) lowItems.push({ name, balance: balanceKg });
    }
    if (!lowItems.length) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';
    el.innerHTML =
        '<div style="background:var(--red-lt);border:1px solid var(--red);border-radius:10px;padding:10px 12px">' +
        '<div style="font-size:11px;font-weight:800;color:var(--red);margin-bottom:6px">⚠️ Feed Stock Low (' +
        lowItems.length +
        ' items)</div>' +
        lowItems
            .map(function (i) {
                return (
                    '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)"><span style="color:var(--ink);font-weight:600">🌾 ' +
                    i.name +
                    '</span><span style="color:var(--red);font-weight:800">' +
                    i.balance.toFixed(0) +
                    ' kg left</span></div>'
                );
            })
            .join('') +
        '<div style="font-size:10px;color:var(--light);margin-top:5px;font-style:italic">Below ' +
        LOW_THRESHOLD_KG +
        'kg threshold - consider reordering</div>' +
        '</div>';
}

function renderCashflowTiles() {
    const el = document.getElementById('dash-cashflow-tiles');
    if (!el) return;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const monthPfx = yyyy + '-' + mm;
    const received = customerPayments
        .filter(p => p.date && p.date.startsWith(monthPfx))
        .reduce((s, p) => s + N(p.amount), 0);
    const outstanding = customers.reduce((s, c) => s + Math.max(0, customerOutstanding(c)), 0);
    const paidOut =
        palakPayments
            .filter(p => p.date && p.date.startsWith(monthPfx))
            .reduce((s, p) => s + N(p.amount), 0) +
        vendorPayments
            .filter(p => p.date && p.date.startsWith(monthPfx))
            .reduce((s, p) => s + N(p.amount), 0);
    const kasaiOut = animals
        .filter(a => a.status === 'Slaughtered' && (a.kasaiOutstanding || 0) > 0)
        .reduce((s, a) => s + N(a.kasaiOutstanding), 0);
    el.innerHTML = [
        {
            icon: '💰',
            name: 'Received',
            val: cur(Math.round(received)),
            color: '#0A7C52',
            sub: 'Customer payments'
        },
        {
            icon: '📋',
            name: 'Outstanding',
            val: cur(Math.round(outstanding)),
            color: '#C81E1E',
            sub: 'All pending dues'
        },
        {
            icon: '📤',
            name: 'Paid Out',
            val: cur(Math.round(paidOut)),
            color: '#B45309',
            sub: 'Vendors + Palak'
        },
        {
            icon: '🔪',
            name: 'Kasai Due',
            val: kasaiOut > 0 ? cur(Math.round(kasaiOut)) : 'Nil',
            color: kasaiOut > 0 ? '#C81E1E' : '#0A7C52',
            sub: 'Slaughter balance due'
        }
    ]
        .map(
            t =>
                '<div class="avg-card" style="border-left-color:' +
                t.color +
                '">' +
                '<span class="ac-icon">' +
                t.icon +
                '</span>' +
                '<div class="ac-body"><div class="ac-label">' +
                t.name +
                '</div><div class="ac-bench">' +
                t.sub +
                '</div></div>' +
                '<span class="ac-val" style="color:' +
                t.color +
                '">' +
                t.val +
                '</span>' +
                '</div>'
        )
        .join('');
}