// ======================================================
//  accounts.js
//  Accounts tab: ledgers, WhatsApp account summaries, delivery matrix, and Reports.
// ======================================================

// ======================================================
//  ACCOUNTS PAGE - P&L + CASH FLOW + LEDGERS
// ======================================================
function setAccPeriod(p, btn) {
    accPeriod = p;
    document.querySelectorAll('#screen-5 .pt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAccounts();
}

function periodRange(period, base) {
    base = base || todayStr();
    const d = new Date(base + 'T00:00:00');
    if (period === 'weekly') {
        const start = new Date(d);
        start.setDate(d.getDate() - 6);
        return { from: fmtLocalDate(start), to: base };
    }
    if (period === 'monthly') {
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        return { from: fmtLocalDate(start), to: base };
    }
    if (period === 'yearly') {
        const start = new Date(d.getFullYear(), 0, 1);
        return { from: fmtLocalDate(start), to: base };
    }
    return { from: '2000-01-01', to: base };
}

function inRange(date, from, to) {
    return date >= from && date <= to;
}

// Single source of truth for every P&L expense category. Adding, renaming,
// or re-coloring a cost line here automatically updates it everywhere it's
// shown: the Accounts P&L card, the Reports screen breakdown, and the
// WhatsApp P&L share text. Previously each of those three was hand-written
// separately and could drift out of sync - e.g. Irshad Transport and
// Medicine were missing from the Accounts card, and Purchased Milk was
// missing from the Reports screen, until this refactor caught it.
const PL_EXPENSE_LINES = [
    { key: 'feedExpense', icon: '🌾', label: 'Feed & Goods', color: '#B45309' },
    {
        key: 'koriExpense',
        icon: '🤝',
        label: 'KORI Purchase',
        color: '#0694A2',
        sub: () =>
            'Bill ' +
            cur(Math.round(koriTotalBilled())) +
            ' . Paid ' +
            cur(Math.round(koriTotalPaid())) +
            ' . Outstanding ' +
            cur(Math.round(koriTotalOutstanding()))
    },
    {
        key: 'irshadExpense',
        icon: '🚚',
        label: 'Irshad Transport',
        color: '#0891b2',
        sub: () =>
            'All-time bill ' +
            cur(Math.round(palakMonthlyBill('Irshad'))) +
            ' . Paid ' +
            cur(Math.round(palakPaidTotal('Irshad')))
    },
    { key: 'palakExpense', icon: '👤', label: 'Palak (Noora+Tosif)', color: '#0A7C52' },
    { key: 'labourExpense', icon: '👷', label: 'Labour', color: '#6C2BD9' },
    { key: 'medExpense', icon: '💊', label: 'Medicine', color: '#C81E1E' },
    { key: 'freightExpense', icon: '🚛', label: 'Truck Freight', color: '#B45309' },
    { key: 'lightExpense', icon: '💡', label: 'Light Bills', color: '#B45309' },
    {
        key: 'rentExpense',
        icon: '🏠',
        label: 'Stable Rent',
        color: '#B45309',
        sub: () => cur(N(settings.rentPerKhila, 88)) + '/khila x ' + N(settings.totalKhilas, 196)
    },
    { key: 'miscExpense', icon: '🧾', label: 'Misc Expenses', color: '#9333EA' },
    { key: 'milkPurchaseExpense', icon: '🥛', label: 'Purchased Milk', color: '#1B4FD8' }
];

function plExpenseLinesHTML(pl) {
    return PL_EXPENSE_LINES.map(
        l =>
            '<div class="slim-card" style="border-left-color:' +
            l.color +
            '"><div class="slim-left"><div class="sl-label">' +
            l.icon +
            ' ' +
            l.label +
            '</div>' +
            (l.sub ? '<div class="sl-sub">' + l.sub() + '</div>' : '') +
            '</div><div class="slim-val" style="color:' +
            l.color +
            '">' +
            cur(Math.round(pl[l.key] || 0)) +
            '</div></div>'
    ).join('');
}

function plExpenseLinesText(pl) {
    return PL_EXPENSE_LINES.map(
        l => '\n' + l.icon + ' ' + l.label + ': ' + cur(Math.round(pl[l.key] || 0))
    ).join('');
}

function plData(period) {
    const { from, to } = periodRange(period);
    let milkRevenue = 0;
    for (const c of customers) {
        const { amount } = customerTotalBilled(c, to);
        const beforeFrom = customerTotalBilled(c, addDays(from, -1)).amount;
        milkRevenue += Math.max(0, amount - beforeFrom);
    }
    let slaughterRevenue = 0;
    for (const a of animals) {
        if (a.status === 'Slaughtered' && a.outDate && inRange(a.outDate, from, to))
            slaughterRevenue += N(a.soldAmount);
    }
    const totalRevenue = milkRevenue + slaughterRevenue;
    let feedExpense = 0;
    for (const p of goodsPurchases) {
        if (inRange(p.date, from, to)) feedExpense += N(p.bill);
    }
    let koriExpense = 0;
    for (const k of koriEntries) {
        if (inRange(k.date, from, to)) koriExpense += N(k.total);
    }
    const days = Math.max(1, daysBetween(from, to) + 1);
    // Accrued from each animal's actual rearing-days overlap with this
    // period (see palakExpenseInRange) - not today's headcount x days.
    const nooraExpense = palakExpenseInRange('Noora', from, to);
    const tosifExpense = palakExpenseInRange('Tosif', from, to);
    const palakExpense = nooraExpense + tosifExpense;
    let irshadExpense = 0;
    // Irshad's flat per-animal freight fee for each completed taji round
    // trip - was previously summing t.bill (the Noora/Tosif REARING bill,
    // already counted above in nooraExpense/tosifExpense), which both
    // double-counted the rearing cost under Irshad's line and meant
    // Irshad's actual transport fee was never charged in P&L at all.
    // Now matches the same settings.tajiRate formula irshadCurrentMonthBill()
    // and palakMonthlyBill('Irshad') already use.
    for (const t of tajiEntries) {
        if (t.inDate && inRange(t.inDate, from, to)) irshadExpense += N(settings.tajiRate);
    }
    for (const a of animals) {
        if (a.outwardType === 'BAKDI' && a.bakdiDate && inRange(a.bakdiDate, from, to))
            irshadExpense += settings.bakdiRate;
    }
    let labourExpense = 0;
    for (const w of workers) {
        const attLogs = attendance.filter(a => a.workerId === w.id);
        for (const al of attLogs) {
            const monthStart = al.month + '-01';
            if (inRange(monthStart, from.slice(0, 7) + '-01', to))
                labourExpense += (pagarRateOnDate(w, monthStart) / daysInMonthOf(al.month)) * N(al.days);
        }
    }
    if (labourExpense === 0) {
        labourExpense = (workers.reduce((s, w) => s + pagarRateOnDate(w, to), 0) / 30) * days;
    }
    let medExpense = 0;
    for (const m of medBills) {
        if (inRange(m.date, from, to)) medExpense += N(m.amount);
    }
    let freightExpense = 0;
    for (const p of vendorPayments) {
        if (p.type === 'freight_expense' && inRange(p.date, from, to)) freightExpense += N(p.amount);
    }
    let lightExpense = 0;
    for (const b of lightBills) {
        if (inRange(b.date || b.month + '-01', from, to)) lightExpense += N(b.amount);
    }
    let rentExpense = 0;
    {
        const monthlyRent = stableRentMonthly();
        const rentStart = settings.rentStartDate || from;
        const rangeStart = rentStart > from ? rentStart : from;
        rentExpense = accrueMonthlyRate(rangeStart, to, () => monthlyRent);
    }
    let miscExpense = 0;
    for (const m of miscExpenses) {
        if (inRange(m.date, from, to)) miscExpense += N(m.amount);
    }
    let milkPurchaseExpense = 0;
    for (const b of milkPurchaseBills) {
        if (inRange(b.weekEnd || b.date, from, to)) milkPurchaseExpense += N(b.billAmount);
    }
    const totalExpense =
        feedExpense +
        koriExpense +
        palakExpense +
        irshadExpense +
        labourExpense +
        medExpense +
        freightExpense +
        lightExpense +
        rentExpense +
        miscExpense +
        milkPurchaseExpense;
    const netPL = totalRevenue - totalExpense;
    return {
        from,
        to,
        milkRevenue,
        slaughterRevenue,
        totalRevenue,
        feedExpense,
        koriExpense,
        palakExpense,
        nooraExpense,
        tosifExpense,
        irshadExpense,
        labourExpense,
        medExpense,
        freightExpense,
        lightExpense,
        rentExpense,
        miscExpense,
        milkPurchaseExpense,
        totalExpense,
        netPL
    };
}

function cashFlowData(period) {
    const { from, to } = periodRange(period);
    let cashIn = 0;
    for (const p of customerPayments) {
        if (inRange(p.date, from, to)) cashIn += N(p.amount);
    }
    for (const a of animals) {
        if (a.status === 'Slaughtered' && a.outDate && inRange(a.outDate, from, to))
            cashIn += N(a.soldAmount);
    }
    let cashOut = 0;
    for (const p of palakPayments) {
        if (inRange(p.date, from, to)) cashOut += N(p.amount);
    }
    for (const p of labourPayments) {
        if (inRange(p.date, from, to)) cashOut += N(p.amount);
    }
    for (const p of vendorPayments) {
        if (p.type !== 'dana_bill' && inRange(p.date, from, to)) cashOut += N(p.amount);
    }
    for (const m of medBills) {
        if (inRange(m.date, from, to)) cashOut += N(m.paid);
    }
    for (const p of medPayments) {
        if (inRange(p.date, from, to)) cashOut += N(p.amount);
    }
    for (const p of rentPayments) {
        if (inRange(p.date, from, to)) cashOut += N(p.amount);
    }
    for (const m of miscExpenses) {
        if (inRange(m.date, from, to)) cashOut += N(m.amount);
    }
    const net = cashIn - cashOut;
    return { from, to, cashIn, cashOut, net };
}

function cashFlowDetailList(period, direction) {
    const { from, to } = periodRange(period);
    const rows = [];
    if (direction === 'in') {
        for (const p of customerPayments) {
            if (!inRange(p.date, from, to)) continue;
            const c = customers.find(x => x.id === p.customerId);
            rows.push({
                date: p.date,
                label: 'Customer Payment - ' + (c ? c.name : 'Unknown'),
                amt: N(p.amount)
            });
        }
        for (const a of animals) {
            if (a.status === 'Slaughtered' && a.outDate && inRange(a.outDate, from, to)) {
                rows.push({
                    date: a.outDate,
                    label: 'Slaughter Sale - ' + a.tagNo + ' (' + (a.kasaiName || '-') + ')',
                    amt: N(a.soldAmount)
                });
            }
        }
    } else {
        for (const p of palakPayments) {
            if (!inRange(p.date, from, to)) continue;
            rows.push({ date: p.date, label: 'Palak Payment - ' + p.target, amt: N(p.amount) });
        }
        for (const p of labourPayments) {
            if (!inRange(p.date, from, to)) continue;
            const w = workers.find(x => x.id === p.workerId);
            rows.push({
                date: p.date,
                label: 'Labour Payment - ' + (w ? w.name : 'Unknown'),
                amt: N(p.amount)
            });
        }
        for (const p of vendorPayments) {
            if (p.type === 'dana_bill' || !inRange(p.date, from, to)) continue;
            const tag = p.type === 'dana' ? 'Danawala' : p.type === 'bhaiswal' ? 'Bhaiswal (KORI)' : p.type;
            rows.push({ date: p.date, label: tag + ' Payment - ' + p.name, amt: N(p.amount) });
        }
        for (const m of medBills) {
            if (!inRange(m.date, from, to) || N(m.paid) <= 0) continue;
            rows.push({ date: m.date, label: 'Medicine Paid - ' + m.name, amt: N(m.paid) });
        }
        for (const p of medPayments) {
            if (!inRange(p.date, from, to)) continue;
            rows.push({ date: p.date, label: 'Medicine Paid - ' + p.name, amt: N(p.amount) });
        }
        for (const p of vendorPayments) {
            if (p.type === 'freight_expense' && inRange(p.date, from, to) && N(p.amount) > 0) {
                rows.push({
                    date: p.date,
                    label: 'Freight Payment - ' + p.name + ' (' + (p.goods || '') + ')',
                    amt: N(p.amount)
                });
            }
        }
        for (const p of rentPayments) {
            if (!inRange(p.date, from, to)) continue;
            rows.push({ date: p.date, label: 'Stable Rent Payment', amt: N(p.amount) });
        }
        for (const m of miscExpenses) {
            if (!inRange(m.date, from, to)) continue;
            rows.push({
                date: m.date,
                label: 'Misc Expense - ' + m.category + (m.note ? ' (' + m.note + ')' : ''),
                amt: N(m.amount)
            });
        }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function openCashFlowDetail(direction) {
    accLedgerReturnTab = 5;
    currentAccLedgerKey = '';
    const shareBtn0 = $('acc-ledger-share-btn');
    if (shareBtn0) shareBtn0.style.display = 'none';
    const rows = cashFlowDetailList(accPeriod, direction);
    const total = rows.reduce((s, r) => s + r.amt, 0);
    const color = direction === 'in' ? '#0A7C52' : '#C81E1E';
    document.getElementById('acc-ledger-title').textContent =
        direction === 'in' ? '💰 Cash In Detail' : '💸 Cash Out Detail';
    document.getElementById('acc-ledger-body').innerHTML =
        '<div style="padding:12px 13px 24px">' +
        '<div class="slim-card" style="border-left-color:' +
        color +
        '"><div class="slim-left"><div class="sl-label">Total</div></div><div class="slim-val" style="color:' +
        color +
        '">' +
        cur(Math.round(total)) +
        '</div></div>' +
        (rows.length
            ? rows
                  .map(function (r) {
                      return (
                          '<div class="list-card"><div class="lc-row"><div><div class="lc-title" style="font-size:13px">' +
                          esc(r.label) +
                          '</div><div class="lc-sub">' +
                          fmtDate(r.date) +
                          '</div></div><div style="font-weight:800;color:' +
                          color +
                          '">' +
                          cur(Math.round(r.amt)) +
                          '</div></div></div>'
                      );
                  })
                  .join('')
            : '<div class="empty">No transactions in this period</div>') +
        '</div>';
    showScreen('screen-acc-ledger');
}

function renderAccounts() {
    const pl = plData(accPeriod);
    const cf = cashFlowData(accPeriod);
    renderAccQuickPayments();
    $('pl-summary').innerHTML =
        '<div style="background:' +
        (pl.netPL >= 0 ? 'var(--green-lt)' : 'var(--red-lt)') +
        ';border:1px solid ' +
        (pl.netPL >= 0 ? 'var(--green)' : 'var(--red)') +
        ';border-radius:10px;padding:12px 14px;margin-bottom:8px">' +
        '<div style="font-size:11px;font-weight:700;color:' +
        (pl.netPL >= 0 ? 'var(--green)' : 'var(--red)') +
        ';text-transform:uppercase">Net Profit / Loss</div>' +
        '<div style="font-size:26px;font-weight:800;color:' +
        (pl.netPL >= 0 ? 'var(--green)' : 'var(--red)') +
        '">' +
        cur(Math.round(Math.abs(pl.netPL))) +
        ' ' +
        (pl.netPL >= 0 ? 'PROFIT' : 'LOSS') +
        '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:2px">' +
        fmtDate(pl.from) +
        ' - ' +
        fmtDate(pl.to) +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#0A7C52"><div class="slim-left"><div class="sl-label">Total Revenue</div><div class="sl-sub">Milk + Slaughter</div></div><div class="slim-val" style="color:#0A7C52">' +
        cur(Math.round(pl.totalRevenue)) +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#1B4FD8"><div class="slim-left"><div class="sl-label">Milk Revenue</div></div><div class="slim-val" style="color:#1B4FD8">' +
        cur(Math.round(pl.milkRevenue)) +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#374151"><div class="slim-left"><div class="sl-label">Slaughter Revenue</div></div><div class="slim-val" style="color:#374151">' +
        cur(Math.round(pl.slaughterRevenue)) +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#C81E1E"><div class="slim-left"><div class="sl-label">Total Expenses</div></div><div class="slim-val" style="color:#C81E1E">' +
        cur(Math.round(pl.totalExpense)) +
        '</div></div>' +
        plExpenseLinesHTML(pl);
    $('cashflow-summary').innerHTML =
        statBillGrid([
            {
                icon: '💰',
                name: 'Cash In',
                sub: 'Tap for details',
                val: cur(Math.round(cf.cashIn)),
                color: '#0A7C52',
                key: "openCashFlowDetail('in')"
            },
            {
                icon: '💸',
                name: 'Cash Out',
                sub: 'Tap for details',
                val: cur(Math.round(cf.cashOut)),
                color: '#C81E1E',
                key: "openCashFlowDetail('out')"
            }
        ]) +
        '<div class="slim-card" style="border-left-color:' +
        (cf.net >= 0 ? '#0A7C52' : '#C81E1E') +
        '"><div class="slim-left"><div class="sl-label">Net Cash Flow</div><div class="sl-sub">' +
        fmtDate(cf.from) +
        ' - ' +
        fmtDate(cf.to) +
        '</div></div><div class="slim-val" style="color:' +
        (cf.net >= 0 ? '#0A7C52' : '#C81E1E') +
        '">' +
        cur(Math.round(Math.abs(cf.net))) +
        '</div></div>';
    // NOTE: freight_expense entries are logged as a single fully-paid
    // amount (no separate "bill" step), so there's no real outstanding
    // balance to track here - just the running total.
    const freightTotal = sumBy(
        vendorPayments.filter(p => p.type === 'freight_expense'),
        'amount'
    );

    const LC = [
        {
            key: 'customers',
            icon: '🥛',
            name: 'Milk Customers',
            sub: 'Customer billing outstanding',
            amt: customers.reduce(function (s, c) {
                return s + Math.max(0, customerOutstanding(c));
            }, 0),
            color: '#0694A2'
        },
        {
            key: 'noora',
            icon: '👤',
            name: 'Noora Palak Bill',
            sub: 'Rearing bill outstanding',
            amt: Math.max(0, palakMonthlyBill('Noora') - palakPaidTotal('Noora')),
            color: '#0A7C52'
        },
        {
            key: 'tosif',
            icon: '👤',
            name: 'Tosif Palak Bill',
            sub: 'Rearing bill outstanding',
            amt: Math.max(0, palakMonthlyBill('Tosif') - palakPaidTotal('Tosif')),
            color: '#0A7C52'
        },
        {
            key: 'irshad',
            icon: '🚛',
            name: 'Irshad Freight',
            sub: 'TAJI + BAKDI transport',
            amt: Math.max(0, palakMonthlyBill('Irshad') - palakPaidTotal('Irshad')),
            color: '#0694A2'
        },
        {
            key: 'danawala',
            icon: '🌾',
            name: 'Danawala (Feed Broker)',
            sub: 'Feed purchase outstanding',
            amt: ledgerBalance(
                sumBy(
                    vendorPayments.filter(function (v) {
                        return v.type === 'dana_bill';
                    }),
                    'amount'
                ),
                sumBy(
                    vendorPayments.filter(function (v) {
                        return v.type === 'dana';
                    }),
                    'amount'
                )
            ),
            color: '#B45309'
        },
        {
            key: 'freight',
            icon: '🚛',
            name: 'Danawala Freight (Truck)',
            sub: 'Total freight expense',
            amt: freightTotal,
            color: '#B45309'
        },
        {
            key: 'bhaiswal',
            icon: '🐄',
            name: 'Bhaiswal (Animal Broker)',
            sub: 'KORI purchase outstanding',
            amt: koriTotalOutstanding(),
            color: '#6C2BD9'
        },
        {
            key: 'medicine',
            icon: '💊',
            name: 'Medicine Bills',
            sub: 'Vet & medicine outstanding',
            amt: medTotalOutstanding(),
            color: '#C81E1E'
        },
        {
            key: 'light',
            icon: '💡',
            name: 'Electricity Bills',
            sub: 'Light bill outstanding',
            amt: ledgerBalance(sumBy(lightBills, 'amount'), sumBy(lightBills, 'paid')),
            color: '#B45309'
        },
        {
            key: 'labour',
            icon: '👷',
            name: 'Labour Pagar',
            sub: 'Monthly salary total',
            amt: totalPagarMonth(),
            color: '#374151'
        },
        {
            key: 'slaughter2',
            icon: '🔪',
            name: 'Slaughter Revenue',
            sub: 'Total kasai proceeds',
            amt: animals
                .filter(function (a) {
                    return a.status === 'Slaughtered';
                })
                .reduce(function (s, a) {
                    return s + N(a.soldAmount);
                }, 0),
            color: '#C81E1E'
        },
        {
            key: 'rent',
            icon: '🏠',
            name: 'Stable Rent',
            sub: 'Rent outstanding & history',
            amt: rentOutstanding(),
            color: '#B45309'
        },
        {
            key: 'misc',
            icon: '🧾',
            name: 'Misc Expenses',
            sub: 'Water, cooking, diesel, repairs & more',
            amt: miscExpenseTotal(),
            color: '#9333EA'
        },
        {
            key: 'milkpurchase',
            icon: '🥛',
            name: 'Purchased Milk',
            sub: 'Weekly bills & payment history',
            amt: milkPurchaseTotalOutstanding(),
            color: '#1B4FD8'
        }
    ];
    $('acc-ledger-cards').innerHTML = statBillGrid(
        LC.map(function (c) {
            return {
                icon: c.icon,
                name: c.name,
                sub: c.sub,
                val: cur(Math.round(c.amt)),
                color: c.color,
                key: c.action || "openAccLedger('" + c.key + "')"
            };
        })
    );
}

let currentAccLedgerKey = '';

function openAccLedger(key) {
    accLedgerReturnTab = 5;
    currentAccLedgerKey = key;
    const titles = {
        feed: 'Feed (Dana) Ledger',
        kori: 'KORI Purchase Ledger',
        noora: 'Noora Palak Ledger',
        tosif: 'Tosif Palak Ledger',
        irshad: 'Irshad Transport Ledger',
        labour: 'Labour Ledger',
        customers: 'Customer Ledger',
        slaughter2: 'Slaughter Revenue Ledger',
        freight: 'Truck Freight Ledger',
        danawala: 'Danawala (Feed Broker) Ledger',
        bhaiswal: 'Bhaiswal (Animal Broker) Ledger',
        medicine: 'Medicine Bills Ledger',
        light: 'Electricity Bills Ledger',
        misc: 'Miscellaneous Expenses Ledger',
        milkpurchase: 'Purchased Milk Ledger',
        rent: 'Stable Rent Ledger'
    };
    $('acc-ledger-title').textContent = titles[key] || 'Ledger';
    const shareBtn = $('acc-ledger-share-btn');
    if (shareBtn)
        shareBtn.style.display = ['noora', 'tosif', 'irshad', 'danawala', 'bhaiswal', 'customers'].includes(
            key
        )
            ? 'inline-block'
            : 'none';
    let rows = '';
    if (key === 'feed') {
        rows =
            [...goodsPurchases]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(
                    p =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        p.name +
                        '</div><div class="lc-sub">' +
                        p.broker +
                        ' . ' +
                        fmtDate(p.date) +
                        ' . ' +
                        p.bags +
                        ' bags</div></div><div style="font-weight:800;color:#B45309">' +
                        cur(p.bill) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No feed purchases</div>';
    } else if (key === 'freight') {
        const freightItems = vendorPayments
            .filter(p => p.type === 'freight_expense')
            .sort((a, b) => b.date.localeCompare(a.date));
        const total = freightItems.reduce((s, p) => s + N(p.amount), 0);
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Total Freight Paid</span><span class="it-val" style="color:#B45309">' +
            cur(Math.round(total)) +
            '</span></div></div>' +
            '<div class="sec-title">Freight Payments</div>' +
            (freightItems.length
                ? freightItems
                      .map(
                          p =>
                              '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                              p.name +
                              (p.goods ? ' - ' + p.goods : '') +
                              '</div><div class="lc-sub">' +
                              fmtDate(p.date) +
                              '</div></div><div style="font-weight:800;color:#B45309">' +
                              cur(p.amount) +
                              '</div></div></div>'
                      )
                      .join('')
                : '<div class="empty">No freight payments recorded</div>');
    } else if (key === 'danawala') {
        const bills = vendorPayments
            .filter(p => p.type === 'dana_bill')
            .sort((a, b) => b.date.localeCompare(a.date));
        const pays = vendorPayments
            .filter(p => p.type === 'dana')
            .sort((a, b) => b.date.localeCompare(a.date));
        const totalBill = bills.reduce((s, p) => s + N(p.amount), 0);
        const totalPaid = pays.reduce((s, p) => s + N(p.amount), 0);
        const brokers = allDanaBrokers();
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Total Billed</span><span class="it-val">' +
            cur(Math.round(totalBill)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(totalPaid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:#C81E1E">' +
            cur(Math.round(Math.max(0, totalBill - totalPaid))) +
            '</span></div></div>' +
            '<div class="sec-title">Bills by Broker (FIFO Payment Matching)</div>' +
            (brokers.length
                ? brokers
                      .map(function (broker) {
                          const fifo = danaFIFOStatus(broker);
                          const unpaidCount = fifo.filter(b => b.status !== 'Paid').length;
                          return (
                              '<div style="margin-bottom:10px">' +
                              '<div style="font-size:12px;font-weight:800;color:var(--ink);padding:4px 2px">' +
                              broker +
                              (unpaidCount
                                  ? ' <span style="font-size:10px;color:var(--red);font-weight:700">(' +
                                    unpaidCount +
                                    ' unpaid)</span>'
                                  : ' <span style="font-size:10px;color:var(--green);font-weight:700">(all paid)</span>') +
                              '</div>' +
                              fifo
                                  .map(function (b) {
                                      var badgeColor =
                                          b.status === 'Paid'
                                              ? 'var(--green)'
                                              : b.daysSince >= 30
                                                ? 'var(--red)'
                                                : b.daysSince >= 15
                                                  ? 'var(--amber)'
                                                  : 'var(--light)';
                                      var badgeBg =
                                          b.status === 'Paid'
                                              ? 'var(--green-lt)'
                                              : b.daysSince >= 30
                                                ? 'var(--red-lt)'
                                                : b.daysSince >= 15
                                                  ? 'var(--amber-lt)'
                                                  : 'var(--border)';
                                      var badgeText =
                                          b.status === 'Paid'
                                              ? '✅ Paid'
                                              : b.status === 'Partial'
                                                ? b.daysSince >= 30
                                                    ? '⚠️ OVERDUE ' + b.daysSince + 'd (partial)'
                                                    : b.daysSince + 'd (partial)'
                                                : b.daysSince >= 30
                                                  ? '⚠️ OVERDUE ' + b.daysSince + 'd'
                                                  : b.daysSince + 'd since unload';
                                      var photoBtn = b.billPhoto
                                          ? '<span onclick="event.stopPropagation();viewBillPhoto(' +
                                            b.id +
                                            ')" style="margin-left:6px;cursor:pointer">📷</span>'
                                          : '';
                                      return (
                                          '<div class="list-card" style="cursor:default;margin-bottom:5px"><div class="lc-row"><div style="flex:1;min-width:0"><div class="lc-title">' +
                                          b.name +
                                          ' - ' +
                                          b.weight +
                                          'kg' +
                                          photoBtn +
                                          '</div><div class="lc-sub">' +
                                          fmtDate(b.date) +
                                          '</div></div><div style="text-align:right;flex-shrink:0"><div style="font-weight:800;color:var(--ink)">' +
                                          cur(Math.round(b.bill)) +
                                          '</div><div style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;margin-top:2px;color:' +
                                          badgeColor +
                                          ';background:' +
                                          badgeBg +
                                          '">' +
                                          badgeText +
                                          '</div></div></div></div>'
                                      );
                                  })
                                  .join('') +
                              '</div>'
                          );
                      })
                      .join('')
                : '<div class="empty">No bills</div>') +
            '<div class="sec-title">Payments</div>' +
            (pays.length
                ? pays
                      .map(
                          p =>
                              '<div class="list-card"><div class="lc-row"><div class="lc-sub">' +
                              fmtDate(p.date) +
                              ' . ' +
                              p.name +
                              '</div><div style="font-weight:800;color:#0A7C52">' +
                              cur(p.amount) +
                              '</div></div></div>'
                      )
                      .join('')
                : '<div class="empty">No payments</div>');
    } else if (key === 'bhaiswal') {
        const brokers = allKoriBrokers();
        const payList = vendorPayments
            .filter(p => p.type === 'bhaiswal')
            .sort((a, b) => b.date.localeCompare(a.date));
        const totalBill = koriTotalBilled(),
            totalPaid = koriTotalPaid(),
            totalOut = koriTotalOutstanding();
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Total Billed</span><span class="it-val">' +
            cur(Math.round(totalBill)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(totalPaid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:#C81E1E">' +
            cur(Math.round(totalOut)) +
            '</span></div></div>' +
            '<div class="sec-title">By Broker</div>' +
            (brokers
                .map(function (b) {
                    var bill = koriBrokerBillTotal(b),
                        paid = koriBrokerPaidTotal(b),
                        out = koriBrokerOutstanding(b);
                    var oc = out > 0 ? '#C81E1E' : '#0A7C52';
                    return (
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        b +
                        '</div><div class="lc-sub">Bill ' +
                        cur(Math.round(bill)) +
                        ' . Paid ' +
                        cur(Math.round(paid)) +
                        '</div></div><div style="text-align:right;font-weight:800;color:' +
                        oc +
                        '">' +
                        cur(Math.round(out)) +
                        '</div></div></div>'
                    );
                })
                .join('') || '<div class="empty">No KORI brokers</div>') +
            '<div class="sec-title">Payment History</div>' +
            (payList.length
                ? payList
                      .map(
                          p =>
                              '<div class="list-card"><div class="lc-row"><div class="lc-title">' +
                              p.name +
                              '</div><div style="font-weight:800;color:#0A7C52">' +
                              cur(p.amount) +
                              '</div></div><div class="lc-sub">' +
                              fmtDate(p.date) +
                              '</div></div>'
                      )
                      .join('')
                : '<div class="empty">No payments</div>');
    } else if (key === 'noora' || key === 'tosif') {
        const target = key === 'noora' ? 'Noora' : 'Tosif';
        const bill = palakMonthlyBill(target),
            paid = palakPaidTotal(target);
        const payList = palakPayments
            .filter(p => p.target === target)
            .sort((a, b) => b.date.localeCompare(a.date));
        const tripRows = getPalakGridRows('', '', '', '', '').filter(r => r.palak === target);
        const returnedTrips = tripRows.filter(r => r.paid);
        const ongoingTrips = tripRows.filter(r => !r.paid);
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Rearing Bill (returned animals)</span><span class="it-val">' +
            cur(Math.round(bill)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(paid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:#C81E1E">' +
            cur(Math.round(bill - paid)) +
            '</span></div></div>' +
            (ongoingTrips.length
                ? '<div style="font-size:10px;color:var(--light);padding:4px 2px;font-style:italic">🟠 ' +
                  ongoingTrips.length +
                  ' animal(s) still in rearing - not yet billed</div>'
                : '') +
            '<div class="sec-title">Rearing Trips (' +
            returnedTrips.length +
            ' returned)</div>' +
            (returnedTrips.length
                ? returnedTrips
                      .map(
                          t =>
                              '<div class="list-card"><div class="lc-row"><div><div class="lc-title">#' +
                              t.tagNo +
                              '</div><div class="lc-sub">' +
                              fmtDate(t.outDate) +
                              ' → ' +
                              fmtDate(t.inDate) +
                              ' . ' +
                              t.rearingDays +
                              'd</div></div><div style="font-weight:800;color:#0A7C52">' +
                              cur(t.amount) +
                              '</div></div></div>'
                      )
                      .join('')
                : '<div class="empty">No completed rearing trips yet</div>') +
            '<div class="sec-title">Payment History</div>' +
            (payList
                .map(
                    p =>
                        '<div class="list-card"><div class="lc-row"><span class="lc-sub">' +
                        fmtDate(p.date) +
                        '</span><div style="font-weight:800;color:#0A7C52">' +
                        cur(p.amount) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No payments</div>');
    } else if (key === 'irshad') {
        const bill = palakMonthlyBill('Irshad'),
            paid = palakPaidTotal('Irshad'),
            currentMonthBill = irshadCurrentMonthBill();
        const payList = palakPayments
            .filter(p => p.target === 'Irshad')
            .sort((a, b) => b.date.localeCompare(a.date));

        // Monthly TAJI Inward + BAKDI Out breakdown
        const tajiByMonth = groupByMonth(tajiEntries, 'inDate');
        const bakdiEvents = [
            ...animals
                .filter(a => a.outwardType === 'BAKDI' && a.bakdiDate)
                .map(a => ({ date: a.bakdiDate })),
            ...tajiEntries.filter(t => t.outDate).map(t => ({ date: t.outDate }))
        ];
        const bakdiByMonth = groupByMonth(bakdiEvents, 'date');
        const allMonths = [...new Set([...Object.keys(tajiByMonth), ...Object.keys(bakdiByMonth)])]
            .sort()
            .reverse();

        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Current Bill</span><span class="it-val">' +
            cur(Math.round(currentMonthBill)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(paid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:#C81E1E">' +
            cur(Math.round(bill - paid)) +
            '</span></div></div>' +
            '<div class="sec-title">Monthly Breakdown</div>' +
            (allMonths.length
                ? allMonths
                      .map(function (mk) {
                          const tCount = (tajiByMonth[mk] || []).length;
                          const bCount = (bakdiByMonth[mk] || []).length;
                          const tAmt = tCount * N(settings.tajiRate);
                          const bAmt = bCount * N(settings.bakdiRate);
                          return (
                              '<div class="list-card" style="cursor:default"><div class="lc-title" style="margin-bottom:6px">' +
                              monthLabel(mk) +
                              '</div>' +
                              '<div class="lc-row" style="padding:2px 0"><span class="lc-sub">🚛 TAJI Inward: ' +
                              tCount +
                              '</span><span style="font-weight:800;color:#0694A2">' +
                              cur(tAmt) +
                              '</span></div>' +
                              '<div class="lc-row" style="padding:2px 0"><span class="lc-sub">📤 BAKDI Out: ' +
                              bCount +
                              '</span><span style="font-weight:800;color:#B45309">' +
                              cur(bAmt) +
                              '</span></div>' +
                              '<div class="lc-row" style="padding:4px 0 0;border-top:1px solid var(--border);margin-top:4px"><span class="lc-sub" style="font-weight:700">Month Total</span><span style="font-weight:800;color:var(--ink)">' +
                              cur(tAmt + bAmt) +
                              '</span></div></div>'
                          );
                      })
                      .join('')
                : '<div class="empty">No TAJI/BAKDI movement recorded yet</div>') +
            '<div class="sec-title">Payment History</div>' +
            (payList
                .map(
                    p =>
                        '<div class="list-card"><div class="lc-row"><span class="lc-sub">' +
                        fmtDate(p.date) +
                        '</span><div style="font-weight:800;color:#0A7C52">' +
                        cur(p.amount) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No payments</div>');
    } else if (key === 'labour') {
        rows =
            workers
                .map(w => {
                    const bal = workerBalance(w);
                    return (
                        '<div class="list-card" onclick="openWorkerDetail(' +
                        w.id +
                        ')"><div class="lc-row"><div><div class="lc-title">' +
                        w.name +
                        '</div><div class="lc-sub">' +
                        cur(w.pagar) +
                        '/mo</div></div><div style="font-weight:800;color:' +
                        (bal > 0 ? '#0A7C52' : '#C81E1E') +
                        '">' +
                        cur(Math.round(Math.abs(bal))) +
                        '</div></div></div>'
                    );
                })
                .join('') || '<div class="empty">No workers</div>';
    } else if (key === 'customers') {
        rows =
            customers
                .map(c => {
                    const out = customerOutstanding(c);
                    return (
                        '<div class="list-card" onclick="openCustomerDetail(' +
                        c.id +
                        ')"><div class="lc-row"><div><div class="lc-title">' +
                        esc(c.name) +
                        '</div><div class="lc-sub">₹' +
                        c.rate +
                        '/L</div></div><div style="font-weight:800;color:' +
                        (out > 0 ? '#C81E1E' : '#0A7C52') +
                        '">' +
                        cur(Math.round(out)) +
                        '</div></div></div>'
                    );
                })
                .join('') || '<div class="empty">No customers</div>';
    } else if (key === 'slaughter2') {
        rows =
            animals
                .filter(a => a.status === 'Slaughtered')
                .sort((a, b) => (b.outDate || '').localeCompare(a.outDate || ''))
                .map(
                    a =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        a.tagNo +
                        '</div><div class="lc-sub">' +
                        (a.kasaiName || '-') +
                        ' . ' +
                        fmtDate(a.outDate) +
                        '</div></div><div style="display:flex;align-items:center;gap:8px"><div style="font-weight:800;color:#374151">' +
                        cur(a.soldAmount) +
                        '</div><span onclick="event.stopPropagation();openEditSlaughterModal(' +
                        a.id +
                        ')" style="cursor:pointer;font-size:15px">✏️</span></div></div></div>'
                )
                .join('') || '<div class="empty">No slaughter records</div>';
    } else if (key === 'medicine') {
        const list = [...medBills].sort((a, b) => b.date.localeCompare(a.date));
        const total = list.reduce((s, b) => s + N(b.amount), 0);
        const paidOnBill = list.reduce((s, b) => s + N(b.paid), 0);
        const paySort = [...medPayments].sort((a, b) => b.date.localeCompare(a.date));
        const paidSeparate = paySort.reduce((s, p) => s + N(p.amount), 0);
        const paid = paidOnBill + paidSeparate;
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Total Billed</span><span class="it-val">' +
            cur(Math.round(total)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(paid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:#C81E1E">' +
            cur(Math.round(Math.max(0, total - paid))) +
            '</span></div></div>' +
            '<div class="sec-title">Medicine Bills</div>' +
            (list
                .map(
                    b =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        b.name +
                        '</div><div class="lc-sub">' +
                        fmtDate(b.date) +
                        ' . Outstanding: ' +
                        cur(Math.round(medOutstandingForName(b.name))) +
                        '</div></div><div style="font-weight:800;color:' +
                        (medOutstandingForName(b.name) > 0 ? '#C81E1E' : '#0A7C52') +
                        '">' +
                        cur(b.amount) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No medicine bills</div>') +
            '<div class="sec-title">Payment History</div>' +
            (paySort
                .map(
                    p =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        p.name +
                        '</div><div class="lc-sub">' +
                        fmtDate(p.date) +
                        '</div></div><div style="font-weight:800;color:#0A7C52">' +
                        cur(p.amount) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No separate medicine payments recorded</div>');
    } else if (key === 'rent') {
        const list = [...rentPayments].sort((a, b) => b.date.localeCompare(a.date));
        const accrued = stableRentAccrued();
        const paid = rentPaidTotal();
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Rate</span><span class="it-val">' +
            cur(N(settings.rentPerKhila, 88)) +
            '/khila x ' +
            N(settings.totalKhilas, 196) +
            ' = ' +
            cur(stableRentMonthly()) +
            '/month</span></div>' +
            '<div class="it-row"><span class="it-label">Total Accrued</span><span class="it-val">' +
            cur(Math.round(accrued)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(paid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:' +
            (accrued - paid > 0 ? '#C81E1E' : '#0A7C52') +
            '">' +
            cur(Math.round(Math.max(0, accrued - paid))) +
            '</span></div></div>' +
            '<div class="sec-title">Payment History</div>' +
            (list
                .map(
                    p =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        fmtDate(p.date) +
                        '</div></div><div style="font-weight:800;color:#0A7C52">' +
                        cur(p.amount) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No rent payments recorded yet</div>');
    } else if (key === 'misc') {
        const list = [...miscExpenses].sort((a, b) => b.date.localeCompare(a.date));
        const total = list.reduce((s, m) => s + N(m.amount), 0);
        const byCategory = {};
        list.forEach(m => {
            byCategory[m.category] = (byCategory[m.category] || 0) + N(m.amount);
        });
        const catIcons = {
            Water: '💧',
            Cooking: '🍳',
            'Milk Transportation': '🚚',
            Diesel: '⛽',
            Repairs: '🔧',
            Others: '📦'
        };
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Total Misc Expenses</span><span class="it-val" style="color:#9333EA">' +
            cur(Math.round(total)) +
            '</span></div></div>' +
            '<div class="sec-title">By Category</div>' +
            (Object.keys(byCategory).length
                ? Object.keys(byCategory)
                      .sort((a, b) => byCategory[b] - byCategory[a])
                      .map(
                          catName =>
                              '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                              (catIcons[catName] || '📦') +
                              ' ' +
                              catName +
                              '</div></div><div style="font-weight:800;color:#9333EA">' +
                              cur(Math.round(byCategory[catName])) +
                              '</div></div></div>'
                      )
                      .join('')
                : '<div class="empty">No misc expenses recorded</div>') +
            '<div class="sec-title">All Entries</div>' +
            (list
                .map(
                    m =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        (catIcons[m.category] || '📦') +
                        ' ' +
                        m.category +
                        '</div><div class="lc-sub">' +
                        fmtDate(m.date) +
                        (m.note ? ' . ' + m.note : '') +
                        '</div></div><div style="font-weight:800;color:#9333EA">' +
                        cur(m.amount) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No misc expenses recorded</div>');
    } else if (key === 'light') {
        const list = [...lightBills].sort((a, b) => b.month.localeCompare(a.month));
        const total = list.reduce((s, b) => s + N(b.amount), 0);
        const paid = list.reduce((s, b) => s + N(b.paid), 0);
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Total Billed</span><span class="it-val">' +
            cur(Math.round(total)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(paid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:' +
            (total - paid > 0 ? '#C81E1E' : '#0A7C52') +
            '">' +
            cur(Math.round(Math.max(0, total - paid))) +
            '</span></div></div>' +
            '<div class="sec-title">Light Bills</div>' +
            (list
                .map(
                    b =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        b.month +
                        '</div><div class="lc-sub">' +
                        (b.notes || 'MSEB') +
                        (b.duedate ? ' Due:' + fmtDate(b.duedate) : '') +
                        '</div></div><div style="font-weight:800;color:' +
                        (N(b.amount) - N(b.paid) > 0 ? '#B45309' : '#0A7C52') +
                        '">' +
                        cur(b.amount) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No light bills</div>');
    } else if (key === 'milkpurchase') {
        const list = [...milkPurchaseBills].sort((a, b) =>
            (b.weekStart || '').localeCompare(a.weekStart || '')
        );
        const total = list.reduce((s, b) => s + N(b.billAmount), 0);
        const paid = list.reduce((s, b) => s + N(b.paid), 0);
        rows =
            '<div class="info-table">' +
            '<div class="it-row"><span class="it-label">Total Billed</span><span class="it-val">' +
            cur(Math.round(total)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label">Total Paid</span><span class="it-val" style="color:#0A7C52">' +
            cur(Math.round(paid)) +
            '</span></div>' +
            '<div class="it-row"><span class="it-label" style="font-weight:700">Outstanding</span><span class="it-val" style="color:#C81E1E">' +
            cur(Math.round(Math.max(0, total - paid))) +
            '</span></div></div>' +
            '<div class="sec-title">Weekly Bills</div>' +
            (list
                .map(
                    b =>
                        '<div class="list-card"><div class="lc-row"><div><div class="lc-title">' +
                        b.vendor +
                        '</div><div class="lc-sub">' +
                        fmtDate(b.weekStart) +
                        ' - ' +
                        fmtDate(b.weekEnd) +
                        ' . ' +
                        N(b.litres).toFixed(1) +
                        ' L @ ' +
                        cur(b.rate) +
                        '/L</div></div><div style="font-weight:800;color:' +
                        (N(b.billAmount) - N(b.paid) > 0.01 ? '#C81E1E' : '#0A7C52') +
                        '">' +
                        cur(Math.round(b.billAmount)) +
                        '</div></div></div>'
                )
                .join('') || '<div class="empty">No purchased milk bills yet</div>');
    } else {
        rows = '<div class="empty">Ledger for ' + key + '</div>';
    }
    $('acc-ledger-body').innerHTML = '<div style="padding:12px 13px 24px">' + rows + '</div>';
    showScreen('screen-acc-ledger');
}

// ======================================================
//  ACCOUNTS - WHATSAPP SHARE (Palak / Danawala / Bhaiswala / Customers)
// ======================================================
function shareAccLedgerWhatsApp() {
    const key = currentAccLedgerKey;
    let msg = '';

    if (key === 'noora' || key === 'tosif') {
        const target = key === 'noora' ? 'Noora' : 'Tosif';
        const bill = palakMonthlyBill(target),
            paid = palakPaidTotal(target),
            out = bill - paid;
        msg =
            '👤 *' +
            target +
            ' - PALAK BILL*\n=================\n' +
            '📅 ' +
            fmtDate(todayStr()) +
            '\n=================\n' +
            '💰 Rearing Bill: ' +
            cur(Math.round(bill)) +
            '\n' +
            '✅ Paid: ' +
            cur(Math.round(paid)) +
            '\n' +
            '⚠️ *Outstanding: ' +
            cur(Math.round(out)) +
            '*\n=================\n' +
            '🐃 Dairy Manager';
    } else if (key === 'irshad') {
        const bill = palakMonthlyBill('Irshad'),
            paid = palakPaidTotal('Irshad'),
            out = bill - paid,
            currentMonthBill = irshadCurrentMonthBill();
        msg =
            '🚛 *IRSHAD - TRANSPORT BILL*\n=================\n' +
            '📅 ' +
            fmtDate(todayStr()) +
            '\n=================\n' +
            '💰 Current Bill: ' +
            cur(Math.round(currentMonthBill)) +
            '\n' +
            '✅ Paid: ' +
            cur(Math.round(paid)) +
            '\n' +
            '⚠️ *Outstanding: ' +
            cur(Math.round(out)) +
            '*\n=================\n' +
            '🐃 Dairy Manager';
    } else if (key === 'danawala') {
        const bills = vendorPayments.filter(p => p.type === 'dana_bill');
        const pays = vendorPayments.filter(p => p.type === 'dana');
        const totalBill = bills.reduce((s, p) => s + N(p.amount), 0);
        const totalPaid = pays.reduce((s, p) => s + N(p.amount), 0);
        const out = Math.max(0, totalBill - totalPaid);
        msg =
            '🌾 *DANAWALA - FEED BILL*\n=================\n' +
            '📅 ' +
            fmtDate(todayStr()) +
            '\n=================\n' +
            '💰 Total Billed: ' +
            cur(Math.round(totalBill)) +
            '\n' +
            '✅ Total Paid: ' +
            cur(Math.round(totalPaid)) +
            '\n' +
            '⚠️ *Outstanding: ' +
            cur(Math.round(out)) +
            '*\n=================\n' +
            '🐃 Dairy Manager';
    } else if (key === 'bhaiswal') {
        const totalBill = koriTotalBilled(),
            totalPaid = koriTotalPaid(),
            totalOut = koriTotalOutstanding();
        let brokerLines = allKoriBrokers()
            .map(function (b) {
                return '  • ' + b + ': ' + cur(Math.round(koriBrokerOutstanding(b))) + ' due';
            })
            .join('\n');
        msg =
            '🐄 *BHAISWAL - ANIMAL BROKER BILL*\n=================\n' +
            '📅 ' +
            fmtDate(todayStr()) +
            '\n=================\n' +
            '💰 Total Billed: ' +
            cur(Math.round(totalBill)) +
            '\n' +
            '✅ Total Paid: ' +
            cur(Math.round(totalPaid)) +
            '\n' +
            '⚠️ *Outstanding: ' +
            cur(Math.round(totalOut)) +
            '*\n' +
            (brokerLines ? '\nBy Broker:\n' + brokerLines + '\n' : '') +
            '=================\n🐃 Dairy Manager';
    } else if (key === 'customers') {
        const totalOut = customers.reduce((s, c) => s + Math.max(0, customerOutstanding(c)), 0);
        let custLines = customers
            .map(function (c) {
                const out = customerOutstanding(c);
                return '  • ' + c.name + ': ' + cur(Math.round(out)) + (out > 0 ? ' due' : ' clear');
            })
            .join('\n');
        msg =
            '🥛 *CUSTOMER OUTSTANDING REPORT*\n=================\n' +
            '📅 ' +
            fmtDate(todayStr()) +
            '\n=================\n' +
            '👥 Total Customers: ' +
            customers.length +
            '\n' +
            '⚠️ *Total Outstanding: ' +
            cur(Math.round(totalOut)) +
            '*\n' +
            (custLines ? '\n' + custLines + '\n' : '') +
            '=================\n🐃 Dairy Manager';
    } else {
        toast('⚠️ WhatsApp share not available for this ledger');
        return;
    }

    waShare(msg);
}

// ======================================================
//  DELIVERY MATRIX
// ======================================================
function renderDeliveryMatrix(today) {
    const now = new Date(today + 'T00:00:00');
    const map = {};
    for (const a of animals) {
        if (a.status !== 'Pregnant') continue;
        const dd = a.expectedDelivery || (a.faliDate ? addDays(a.faliDate, 305) : null);
        if (!dd) continue;
        const d = new Date(dd + 'T00:00:00');
        const k = d.getFullYear() + '-' + d.getMonth();
        if (!map[k]) map[k] = [];
        map[k].push({ tagNo: a.tagNo, khilaNo: a.khilaNo, location: a.location, deliveryDate: dd, id: a.id });
    }
    window.__deliveryMap = map;
    let html = '<div class="matrix-grid4">';
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const yr = d.getFullYear(),
            mo = d.getMonth();
        const k = yr + '-' + mo;
        const list = map[k] || [];
        const isNow = yr === now.getFullYear() && mo === now.getMonth();
        const countColor = list.length > 0 ? '#0A7C52' : '#9CA3AF';
        const monthLabel = MONTH_NAMES[mo] + " '" + String(yr).slice(2);
        html +=
            '<div class="month-tile ' +
            (isNow ? 'now' : '') +
            '" style="border-top-color:' +
            countColor +
            '" onclick="openMonthDetail(' +
            yr +
            ',' +
            mo +
            ')">' +
            '<div class="mt-count" style="color:' +
            countColor +
            '">' +
            list.length +
            '</div>' +
            '<div class="mt-label">' +
            monthLabel +
            '</div>' +
            (isNow ? '<div class="mt-now-badge">Now</div>' : '') +
            '</div>';
    }
    html += '</div>';
    $('delivery-matrix').innerHTML = html;
}

function openMonthDetail(yr, mo) {
    accLedgerReturnTab = 0;
    const k = yr + '-' + mo;
    const list = (window.__deliveryMap && window.__deliveryMap[k]) || [];
    const today = todayStr();
    const now = new Date(today + 'T00:00:00');
    const isPast = yr < now.getFullYear() || (yr === now.getFullYear() && mo < now.getMonth());
    const monthLabel = MONTH_NAMES[mo] + ' ' + yr;
    $('acc-ledger-title').textContent = '🗓️ ' + monthLabel + ' Deliveries';
    let rows = '';
    if (!list.length) {
        rows = '<div class="empty">No deliveries expected this month</div>';
    } else {
        for (const a of list) {
            const dtd = daysBetween(today, a.deliveryDate);
            const color = isPast ? '#9CA3AF' : dtd <= 14 ? '#B45309' : '#1B4FD8';
            rows +=
                '<div class="list-card" onclick="closeAccLedger();setTimeout(()=>openDetail(' +
                a.id +
                '),50)"><div class="lc-row"><div><div class="lc-title">' +
                a.tagNo +
                ' . ' +
                (a.khilaNo || '-') +
                '</div><div class="lc-sub">' +
                a.location +
                ' . Expected: ' +
                fmtDate(a.deliveryDate) +
                '</div></div><div style="font-weight:800;color:' +
                color +
                '">' +
                (dtd > 0 ? dtd + 'd' : isPast ? 'Past' : 'Today') +
                '</div></div></div>';
        }
    }
    $('acc-ledger-body').innerHTML = '<div style="padding:12px 13px 24px">' + rows + '</div>';
    currentAccLedgerKey = '';
    if ($('acc-ledger-share-btn')) $('acc-ledger-share-btn').style.display = 'none';
    showScreen('screen-acc-ledger');
}

// ======================================================
//  REPORTS
// ======================================================
function setRepPeriod(p, btn) {
    repPeriod = p;
    document.querySelectorAll('#screen-6 .pt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderReports();
}

function renderReports() {
    const pl = plData(repPeriod);
    const S = computeStats();
    const totalActive = S.totalActive || 1;

    $('rep-revenue').innerHTML =
        '<div class="slim-card" style="border-left-color:#0A7C52"><div class="slim-left"><div class="sl-label">Total Revenue</div><div class="sl-sub">' +
        fmtDate(pl.from) +
        ' - ' +
        fmtDate(pl.to) +
        '</div></div><div class="slim-val" style="color:#0A7C52">' +
        cur(Math.round(pl.totalRevenue)) +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#1B4FD8"><div class="slim-left"><div class="sl-label">Milk Revenue</div></div><div class="slim-val" style="color:#1B4FD8">' +
        cur(Math.round(pl.milkRevenue)) +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#374151"><div class="slim-left"><div class="sl-label">Slaughter Revenue</div></div><div class="slim-val" style="color:#374151">' +
        cur(Math.round(pl.slaughterRevenue)) +
        '</div></div>';

    $('rep-expense').innerHTML =
        '<div class="slim-card" style="border-left-color:#C81E1E"><div class="slim-left"><div class="sl-label">Total Expense</div><div class="sl-sub">' +
        fmtDate(pl.from) +
        ' - ' +
        fmtDate(pl.to) +
        '</div></div><div class="slim-val" style="color:#C81E1E">' +
        cur(Math.round(pl.totalExpense)) +
        '</div></div>' +
        plExpenseLinesHTML(pl);

    const avgMilkPerBuf =
        totalActive > 0
            ? (settings.milkLogs || []).reduce((s, l) => s + N(l.totalLitres), 0) /
              Math.max(1, (settings.milkLogs || []).length) /
              totalActive
            : 0;
    $('rep-ops').innerHTML =
        '<div class="slim-card" style="border-left-color:#0694A2"><div class="slim-left"><div class="sl-label">Active Animals</div></div><div class="slim-val" style="color:#0694A2">' +
        totalActive +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#0A7C52"><div class="slim-left"><div class="sl-label">Avg Milk / Buffalo</div><div class="sl-sub">Benchmark: ' +
        settings.milkBench +
        'L</div></div><div class="slim-val" style="color:#0A7C52">' +
        (avgMilkPerBuf > 0 ? avgMilkPerBuf.toFixed(1) + ' L' : '-') +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#C81E1E"><div class="slim-left"><div class="sl-label">Dead</div></div><div class="slim-val" style="color:#C81E1E">' +
        S.dead +
        '</div></div>' +
        '<div class="slim-card" style="border-left-color:#374151"><div class="slim-left"><div class="sl-label">Slaughtered</div></div><div class="slim-val" style="color:#374151">' +
        S.slaughtered +
        '</div></div>';

    renderCustomerReport(repPeriod);
}

// ======================================================
//  CUSTOMER-WISE REPORT
// ======================================================
function customerBilledInPeriod(c, from, to) {
    const uptoTo = customerTotalBilled(c, to).amount;
    const beforeFrom = customerTotalBilled(c, addDays(from, -1)).amount;
    return Math.max(0, uptoTo - beforeFrom);
}

function customerPaidInPeriod(custId, from, to) {
    return customerPayments
        .filter(p => p.customerId === custId && inRange(p.date, from, to))
        .reduce((s, p) => s + N(p.amount), 0);
}

function renderCustomerReport(period) {
    const el = $('rep-customers');
    if (!el) return;
    if (!customers.length) {
        el.innerHTML = '<div class="empty">No customers yet</div>';
        return;
    }
    const { from, to } = periodRange(period);
    const rowsData = customers.map(c => ({
        c,
        billed: customerBilledInPeriod(c, from, to),
        paid: customerPaidInPeriod(c.id, from, to),
        outstanding: customerOutstanding(c)
    }));
    const totalBilled = rowsData.reduce((s, r) => s + r.billed, 0);
    const totalPaid = rowsData.reduce((s, r) => s + r.paid, 0);
    const totalOut = rowsData.reduce((s, r) => s + Math.max(0, r.outstanding), 0);
    let h = statBillGrid([
        { icon: '🧾', name: 'Billed (period)', val: cur(Math.round(totalBilled)), color: '#1B4FD8' },
        { icon: '💰', name: 'Received (period)', val: cur(Math.round(totalPaid)), color: '#0A7C52' },
        { icon: '⚠️', name: 'Total Outstanding', val: cur(Math.round(totalOut)), color: '#C81E1E' }
    ]);
    h += rowsData
        .sort((a, b) => b.outstanding - a.outstanding)
        .map(
            r =>
                '<div class="list-card" onclick="openCustomerDetail(' +
                r.c.id +
                ')"><div class="lc-row"><div><div class="lc-title">' +
                esc(r.c.name) +
                '</div><div class="lc-sub">Billed ' +
                cur(Math.round(r.billed)) +
                ' . Paid ' +
                cur(Math.round(r.paid)) +
                '</div></div><div style="font-weight:800;color:' +
                (r.outstanding > 0 ? '#C81E1E' : '#0A7C52') +
                '">' +
                cur(Math.round(Math.abs(r.outstanding))) +
                (r.outstanding > 0 ? ' due' : ' clear') +
                '</div></div></div>'
        )
        .join('');
    el.innerHTML = h;
}

function shareCustomerReportWhatsApp() {
    if (!customers.length) {
        toast('⚠️ No customers yet');
        return;
    }
    const { from, to } = periodRange(repPeriod);
    const rowsData = customers
        .map(c => ({
            c,
            billed: customerBilledInPeriod(c, from, to),
            paid: customerPaidInPeriod(c.id, from, to),
            outstanding: customerOutstanding(c)
        }))
        .sort((a, b) => b.outstanding - a.outstanding);
    const totalBilled = rowsData.reduce((s, r) => s + r.billed, 0);
    const totalPaid = rowsData.reduce((s, r) => s + r.paid, 0);
    const totalOut = rowsData.reduce((s, r) => s + Math.max(0, r.outstanding), 0);
    let lines = rowsData
        .map(
            r =>
                '  • ' +
                r.c.name +
                ': ' +
                cur(Math.round(r.billed)) +
                ' billed, ' +
                cur(Math.round(r.paid)) +
                ' paid, *' +
                cur(Math.round(Math.abs(r.outstanding))) +
                (r.outstanding > 0 ? ' due*' : ' clear*')
        )
        .join('\n');
    const msg =
        '🥛 *CUSTOMER-WISE REPORT*\n=================\n' +
        '📅 ' +
        fmtDate(from) +
        ' - ' +
        fmtDate(to) +
        '\n=================\n' +
        '🧾 Total Billed: ' +
        cur(Math.round(totalBilled)) +
        '\n' +
        '💰 Total Received: ' +
        cur(Math.round(totalPaid)) +
        '\n' +
        '⚠️ *Total Outstanding: ' +
        cur(Math.round(totalOut)) +
        '*\n\n' +
        lines +
        '\n=================\n🐃 Dairy Manager';
    waShare(msg);
}

// ======================================================
//  PL SCREEN (dedicated P&L)
// ======================================================
function sharePLWhatsApp() {
    const pl = plData(repPeriod);
    const S = computeStats();
    const msg =
        '📊 *DAIRY P&L REPORT*\n=================\n📅 ' +
        fmtDate(pl.from) +
        ' - ' +
        fmtDate(pl.to) +
        '\n=================\n📥 *REVENUE*\n🥛 Milk Sales: ' +
        cur(Math.round(pl.milkRevenue)) +
        '\n🔪 Slaughter: ' +
        cur(Math.round(pl.slaughterRevenue)) +
        '\n*Total Revenue: ' +
        cur(Math.round(pl.totalRevenue)) +
        '*\n\n📤 *EXPENSES*' +
        plExpenseLinesText(pl) +
        '\n*Total Expense: ' +
        cur(Math.round(pl.totalExpense)) +
        '*\n\n=================\n*Net ' +
        (pl.netPL >= 0 ? 'Profit' : 'Loss') +
        ': ' +
        cur(Math.round(Math.abs(pl.netPL))) +
        '*\nActive Animals: ' +
        S.totalActive;
    waShare(msg);
}