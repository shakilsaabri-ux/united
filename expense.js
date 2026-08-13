// ======================================================
//  expenses.js
//  Salvage/expense payments: Danawala, medicine, bulls, purchased milk, stable rent, misc expenses, light bill.
// ======================================================

// ======================================================
//  DANAWALA PAYMENT
// ======================================================
function calcDanaBalance() {
    const broker = document.getElementById('dana-broker').value.trim();
    const newAmt = N(document.getElementById('dana-amount').value);
    const paidSoFar = vendorPayments
        .filter(p => p.type === 'dana' && p.name === broker)
        .reduce((s, p) => s + N(p.amount), 0);
    const billedSoFar = vendorPayments
        .filter(p => p.type === 'dana_bill' && p.name === broker)
        .reduce((s, p) => s + N(p.amount), 0);
    document.getElementById('dana-totalpaid').textContent = cur(paidSoFar + newAmt);
    const outstanding = billedSoFar - (paidSoFar + newAmt);
    document.getElementById('dana-outstanding').textContent = cur(Math.max(0, Math.round(outstanding)));
}

async function saveVendorPayment(type) {
    try {
        let name, amount, date;
        if (type === 'dana') {
            name = document.getElementById('dana-broker').value.trim();
            amount = N(document.getElementById('dana-amount').value);
            date = document.getElementById('dana-date').value;
            if (!name || !amount || !date) {
                toast('⚠️ Fill all fields');
                return;
            }
            const entry = { id: uid(), type: 'dana', name, amount, date };
            await dbPut('vendorPayments', entry);
            vendorPayments.push(entry);
            closeModal('modal-dana');
            ['dana-broker', 'dana-amount', 'dana-date'].forEach(x => (document.getElementById(x).value = ''));
            ['dana-totalpaid', 'dana-outstanding'].forEach(
                x => (document.getElementById(x).textContent = '-')
            );
        } else if (type === 'bh') {
            name = document.getElementById('bh-name').value;
            amount = N(document.getElementById('bh-amount').value);
            date = document.getElementById('bh-date').value;
            if (!name || !amount || !date) {
                toast('⚠️ Fill all fields');
                return;
            }
            const entry = { id: uid(), type: 'bhaiswal', name, amount, date };
            await dbPut('vendorPayments', entry);
            vendorPayments.push(entry);
            lastShare.bhaiswalPay = {
                name,
                amount,
                date,
                outstanding: document.getElementById('bh-outstanding').textContent
            };
            closeModal('modal-bhaiswal');
            document.getElementById('bh-amount').value = '';
            ['bh-bill', 'bh-totalpaid', 'bh-outstanding'].forEach(
                x => (document.getElementById(x).textContent = '-')
            );
        }
        toast('✅ Payment saved - ' + cur(amount));
        renderDashboard();
        if (
            typeof renderAccounts === 'function' &&
            document.getElementById('screen-5').classList.contains('active')
        )
            renderAccounts();
    } catch (err) {
        console.error('saveVendorPayment failed', err);
        toast('⚠️ Save failed - please try again');
    }
}

function shareBhaiswalPaymentWhatsApp() {
    const p = lastShare.bhaiswalPay;
    if (!p) {
        toast('⚠️ Record a Bhaiswal payment first');
        return;
    }
    let msg =
        '💰 *BHAISWAL PAYMENT RECEIPT*\n\n' +
        '👤 Broker: ' +
        p.name +
        '\n' +
        '💵 Amount: ' +
        cur(p.amount) +
        '\n' +
        '📅 Date: ' +
        fmtDate(p.date) +
        '\n' +
        (p.outstanding && p.outstanding !== '-' ? '📊 Outstanding After: ' + p.outstanding + '\n' : '') +
        '\n_Halima Dairy Farm_';
    waShare(msg);
}

// ======================================================
//  BHAISWAL LIVE CALC
// ======================================================
function calcBhaiswalBalance() {
    const name = document.getElementById('bh-name').value;
    const newAmt = N(document.getElementById('bh-amount').value);
    if (!name) {
        ['bh-bill', 'bh-totalpaid', 'bh-outstanding'].forEach(
            x => (document.getElementById(x).textContent = '-')
        );
        return;
    }
    const bill = koriBrokerBillTotal(name);
    const paidSoFar = koriBrokerPaidTotal(name);
    document.getElementById('bh-bill').textContent = cur(Math.round(bill));
    document.getElementById('bh-totalpaid').textContent = cur(Math.round(paidSoFar));
    document.getElementById('bh-outstanding').textContent = cur(
        Math.round(Math.max(0, bill - paidSoFar - newAmt))
    );
}

// ======================================================
//  MEDICINE BILL
// ======================================================
function calcMedBalance() {
    const amount = N(document.getElementById('med-amount').value);
    const allMedOut = medTotalOutstanding() + amount;
    document.getElementById('med-total-out').textContent = cur(allMedOut);
}

async function saveMedicineBill() {
    const name = document.getElementById('med-name').value.trim();
    const date = document.getElementById('med-date').value;
    const amount = N(document.getElementById('med-amount').value);
    if (!name || !date || !amount) {
        toast('⚠️ Fill name, date & amount');
        return;
    }
    const entry = { id: uid(), name, date, amount, paid: 0, outstanding: amount };
    await saveEntry({
        store: 'medBills',
        arr: medBills,
        entry,
        modalId: 'modal-medicine',
        successMsg: '✅ Med bill saved - ' + cur(amount),
        onDone: async () => {
            settings.medicineTotal = sumBy(medBills, 'amount');
            await dbPut('settings', settings);
            lastShare.medBill = entry;
            ['med-name', 'med-date', 'med-amount'].forEach(x => (document.getElementById(x).value = ''));
            document.getElementById('med-total-out').textContent = '-';
            renderDashboard();
        }
    });
}

function shareMedBillWhatsApp() {
    const m = lastShare.medBill;
    if (!m) {
        toast('⚠️ Record a medicine bill first');
        return;
    }
    let msg =
        '💊 *MEDICINE BILL*\n\n' +
        '📝 Name: ' +
        m.name +
        '\n' +
        '📅 Date: ' +
        fmtDate(m.date) +
        '\n' +
        '💵 Bill Amount: ' +
        cur(m.amount) +
        '\n' +
        '⚠️ Outstanding (' +
        m.name +
        '): ' +
        cur(Math.round(medOutstandingForName(m.name))) +
        '\n' +
        '\n_Halima Dairy Farm_';
    waShare(msg);
}

// ======================================================
//  MEDICINE - OUTSTANDING HELPERS
// ======================================================
// Distinct medical names already used in bills, most-recently-billed first,
// so the Medicine Payment dropdown doesn't require retyping a name.
function medicineNamesList() {
    const seen = new Map();
    [...medBills]
        .sort((a, b) => b.date.localeCompare(a.date))
        .forEach(b => {
            if (b.name && !seen.has(b.name)) seen.set(b.name, true);
        });
    return [...seen.keys()];
}

function medOutstandingForName(name) {
    const bills = medBills.filter(b => b.name === name);
    const paid = medPayments.filter(p => p.name === name);
    return Math.max(0, ledgerBalance(sumBy(bills, 'amount'), sumBy(bills, 'paid'), sumBy(paid, 'amount')));
}

function medTotalOutstanding() {
    return Math.max(
        0,
        ledgerBalance(sumBy(medBills, 'amount'), sumBy(medBills, 'paid'), sumBy(medPayments, 'amount'))
    );
}

// ======================================================
//  MEDICINE PAYMENT
// ======================================================
function openMedicinePaymentModal() {
    const names = medicineNamesList();
    const sel = document.getElementById('medp-name');
    sel.innerHTML = names.length
        ? names.map(n => '<option value="' + n + '">' + n + '</option>').join('')
        : '<option value="">-- No medicine bills yet --</option>';
    document.getElementById('medp-date').value = todayStr();
    document.getElementById('medp-amount').value = '';
    document.getElementById('medp-current-out').textContent = '-';
    document.getElementById('medp-after-out').textContent = '-';
    openModal('modal-medicine-payment');
    calcMedPaymentBalance();
}

function calcMedPaymentBalance() {
    const name = document.getElementById('medp-name').value;
    const newAmt = N(document.getElementById('medp-amount').value);
    if (!name) {
        document.getElementById('medp-current-out').textContent = '-';
        document.getElementById('medp-after-out').textContent = '-';
        return;
    }
    const out = medOutstandingForName(name);
    document.getElementById('medp-current-out').textContent = cur(Math.round(out));
    document.getElementById('medp-after-out').textContent = cur(Math.round(Math.max(0, out - newAmt)));
}

async function saveMedicinePayment() {
    const name = document.getElementById('medp-name').value;
    const date = document.getElementById('medp-date').value;
    const amount = N(document.getElementById('medp-amount').value);
    if (!name || !date || !amount) {
        toast('⚠️ Select name, date & amount');
        return;
    }
    const entry = { id: uid(), name, date, amount };
    await saveEntry({
        store: 'medPayments',
        arr: medPayments,
        entry,
        modalId: 'modal-medicine-payment',
        successMsg: '✅ Payment of ' + cur(amount) + ' recorded for ' + name,
        onDone: renderDashboard
    });
}

// ======================================================
//  BULLS - ADD BULL
// ======================================================
function bullVendorNames() {
    const seen = new Map();
    [...bulls]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach(b => {
            if (b.vendor && !seen.has(b.vendor)) seen.set(b.vendor, true);
        });
    return [...seen.keys()];
}

// Names entered in "Add Bull" so the FALI Log's Bull dropdown can offer them.
function bullNamesList() {
    const seen = new Map();
    [...bulls]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach(b => {
            if (b.name && !seen.has(b.name)) seen.set(b.name, true);
        });
    return [...seen.keys()];
}

function openAddBullModal() {
    ['bull-name', 'bull-amount', 'bull-vendor'].forEach(x => ($(x).value = ''));
    $('bull-date').value = todayStr();
    const dl = $('bull-vendor-list');
    if (dl)
        dl.innerHTML = bullVendorNames()
            .map(v => '<option value="' + v + '">')
            .join('');
    openModal('modal-add-bull');
}

async function saveBull() {
    const name = document.getElementById('bull-name').value.trim();
    const amount = N(document.getElementById('bull-amount').value);
    const vendor = document.getElementById('bull-vendor').value.trim();
    const date = document.getElementById('bull-date').value;
    if (!name || !amount || !vendor || !date) {
        toast('⚠️ Fill bull name, amount, vendor & date');
        return;
    }
    const entry = { id: uid(), name, amount, vendor, date };
    await saveEntry({
        store: 'bulls',
        arr: bulls,
        entry,
        modalId: 'modal-add-bull',
        successMsg: '✅ Bull added - ' + name,
        onDone: renderHerd
    });
}

// ======================================================
//  BULLS - VENDOR PAYMENT (Balance / Advance auto)
// ======================================================
function bullOutstandingForVendor(vendor) {
    const b = bulls.filter(x => x.vendor === vendor);
    const p = bullPayments.filter(x => x.vendor === vendor);
    return ledgerBalance(sumBy(b, 'amount'), sumBy(p, 'amount')); // positive = balance owed, negative = advance paid
}

function bullTotalOutstanding() {
    return bullVendorNames().reduce((s, v) => s + Math.max(0, bullOutstandingForVendor(v)), 0);
}

function openBullPaymentModal() {
    const vendors = bullVendorNames();
    const sel = document.getElementById('bullp-vendor');
    sel.innerHTML = vendors.length
        ? vendors.map(v => '<option value="' + v + '">' + v + '</option>').join('')
        : '<option value="">-- No bulls purchased yet --</option>';
    document.getElementById('bullp-date').value = todayStr();
    document.getElementById('bullp-amount').value = '';
    openModal('modal-bull-payment');
    calcBullPaymentBalance();
}

function calcBullPaymentBalance() {
    const vendor = document.getElementById('bullp-vendor').value;
    const newAmt = N(document.getElementById('bullp-amount').value);
    const label = document.getElementById('bullp-status-label');
    if (!vendor) {
        document.getElementById('bullp-current-out').textContent = '-';
        document.getElementById('bullp-after-out').textContent = '-';
        label.textContent = 'Balance / Advance (Auto)';
        return;
    }
    const out = bullOutstandingForVendor(vendor);
    const after = out - newAmt;
    document.getElementById('bullp-current-out').textContent =
        out >= 0 ? cur(Math.round(out)) + ' balance due' : cur(Math.round(-out)) + ' advance held';
    document.getElementById('bullp-after-out').textContent =
        after >= 0 ? cur(Math.round(after)) + ' balance due' : cur(Math.round(-after)) + ' advance held';
    label.textContent = after >= 0 ? 'Balance Due (Auto)' : 'Advance Paid (Auto)';
}

async function saveBullPayment() {
    const vendor = document.getElementById('bullp-vendor').value;
    const date = document.getElementById('bullp-date').value;
    const amount = N(document.getElementById('bullp-amount').value);
    if (!vendor || !date || !amount) {
        toast('⚠️ Select vendor, date & amount');
        return;
    }
    const after = bullOutstandingForVendor(vendor) - amount;
    const entry = { id: uid(), vendor, date, amount, resultType: after >= 0 ? 'Balance' : 'Advance' };
    await saveEntry({
        store: 'bullPayments',
        arr: bullPayments,
        entry,
        modalId: 'modal-bull-payment',
        successMsg: '✅ Payment of ' + cur(amount) + ' recorded for ' + vendor,
        onDone: renderHerd
    });
}

// ======================================================
//  PURCHASED MILK PAYMENT (weekly bill: litres x rate, Sun-Sat)
// ======================================================
// Current Sunday-to-Saturday week containing today, matching the Supply
// Book's weekly summary so "Liters Purchased" lines up with what was
// logged there.
function currentMilkPurchaseWeek() {
    const d = new Date(todayStr() + 'T00:00:00');
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(start.getDate() - dow);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: dateToStr(start), end: dateToStr(end) };
}

function milkPurchaseLitresForVendorWeek(vendor, weekStart, weekEnd) {
    return milkPurchases
        .filter(mp => mp.source === vendor && mp.date >= weekStart && mp.date <= weekEnd)
        .reduce((s, mp) => s + N(mp.qty), 0);
}

function milkPurchaseVendorOutstanding(vendor) {
    const b = milkPurchaseBills.filter(x => x.vendor === vendor);
    return ledgerBalance(sumBy(b, 'billAmount'), sumBy(b, 'paid'));
}

function milkPurchaseTotalOutstanding() {
    return getMilkPurchaseSources().reduce((s, v) => s + Math.max(0, milkPurchaseVendorOutstanding(v)), 0);
}

function openMilkPurchasePaymentModal() {
    const sources = getMilkPurchaseSources();
    const sel = document.getElementById('mpp-vendor');
    sel.innerHTML = sources.map(v => '<option value="' + v + '">' + v + '</option>').join('');
    document.getElementById('mpp-rate').value = '';
    document.getElementById('mpp-paid').value = '';
    openModal('modal-milk-purchase-payment');
    calcMilkPurchaseBill();
}

function calcMilkPurchaseBill() {
    const vendor = document.getElementById('mpp-vendor').value;
    const rate = N(document.getElementById('mpp-rate').value);
    const paid = N(document.getElementById('mpp-paid').value);
    const label = document.getElementById('mpp-status-label');
    if (!vendor) {
        document.getElementById('mpp-litres').textContent = '-';
        document.getElementById('mpp-billamt').textContent = '-';
        document.getElementById('mpp-current-out').textContent = '-';
        document.getElementById('mpp-after-out').textContent = '-';
        label.textContent = 'Balance / Advance (Auto)';
        return;
    }
    const { start, end } = currentMilkPurchaseWeek();
    const litres = milkPurchaseLitresForVendorWeek(vendor, start, end);
    const billAmount = litres * rate;
    document.getElementById('mpp-litres').textContent = litres.toFixed(1) + ' L';
    document.getElementById('mpp-billamt').textContent = cur(Math.round(billAmount));
    const existingBill = milkPurchaseBills.find(b => b.vendor === vendor && b.weekStart === start);
    const otherWeeksOutstanding =
        milkPurchaseVendorOutstanding(vendor) -
        (existingBill ? N(existingBill.billAmount) - N(existingBill.paid) : 0);
    const priorPaidThisWeek = existingBill ? N(existingBill.paid) : 0;
    const currentOutstanding = otherWeeksOutstanding + (billAmount - priorPaidThisWeek);
    const afterOutstanding = currentOutstanding - paid;
    document.getElementById('mpp-current-out').textContent =
        currentOutstanding >= 0
            ? cur(Math.round(currentOutstanding)) + ' balance due'
            : cur(Math.round(-currentOutstanding)) + ' advance held';
    document.getElementById('mpp-after-out').textContent =
        afterOutstanding >= 0
            ? cur(Math.round(afterOutstanding)) + ' balance due'
            : cur(Math.round(-afterOutstanding)) + ' advance held';
    label.textContent = afterOutstanding >= 0 ? 'Balance Due (Auto)' : 'Advance Paid (Auto)';
}

async function saveMilkPurchasePayment() {
    const vendor = document.getElementById('mpp-vendor').value;
    const rate = N(document.getElementById('mpp-rate').value);
    const paid = N(document.getElementById('mpp-paid').value);
    if (!vendor || !rate) {
        toast('⚠️ Select vendor & enter purchased rate');
        return;
    }
    const { start, end } = currentMilkPurchaseWeek();
    const litres = milkPurchaseLitresForVendorWeek(vendor, start, end);
    const billAmount = litres * rate;
    const idx = milkPurchaseBills.findIndex(b => b.vendor === vendor && b.weekStart === start);
    const entry =
        idx >= 0
            ? {
                  ...milkPurchaseBills[idx],
                  rate,
                  litres,
                  billAmount,
                  weekEnd: end,
                  paid: N(milkPurchaseBills[idx].paid) + paid,
                  date: todayStr()
              }
            : {
                  id: uid(),
                  vendor,
                  weekStart: start,
                  weekEnd: end,
                  rate,
                  litres,
                  billAmount,
                  paid,
                  date: todayStr()
              };
    await saveEntry({
        store: 'milkPurchaseBills',
        arr: milkPurchaseBills,
        entry,
        idx,
        modalId: 'modal-milk-purchase-payment',
        successMsg: '✅ Purchased milk bill saved for ' + vendor,
        onDone: renderAccounts
    });
}

// ======================================================
//  STABLE RENT
// ======================================================
function stableRentMonthly() {
    return N(settings.rentPerKhila, 88) * N(settings.totalKhilas, 196);
}

// Shared accrual walker: applies a monthly rate day-by-day between two dates
// (inclusive), prorating partial months by that month's actual day count.
// rateFn(monthKey, segmentStartDate) returns the monthly rate to use for
// that segment - pass a function of the date if the rate can vary over time,
// or a constant-returning function if it can't (see stableRentAccrued below).
// This is the one place this walk is implemented; plData's rent accrual and
// stableRentAccrued both call this instead of re-implementing the loop.
function accrueMonthlyRate(startDate, endDate, rateFn) {
    if (!startDate || !endDate || endDate < startDate) return 0;
    let total = 0,
        cursor = startDate,
        guard = 0;
    while (cursor <= endDate && guard < 600) {
        const mEnd = monthEndDate(cursor);
        const rangeEnd = mEnd < endDate ? mEnd : endDate;
        const monthKey = cursor.slice(0, 7);
        const daysInSeg = daysBetween(cursor, rangeEnd) + 1;
        const monthlyRate = rateFn(monthKey, cursor);
        total += (monthlyRate / daysInMonthOf(monthKey)) * daysInSeg;
        cursor = addDays(rangeEnd, 1);
        guard++;
    }
    return total;
}

// Rent accrues day-by-day from rentStartDate through asOfDate, at the
// CURRENT rate x khila count (a rate change applies to the whole running
// total going forward, same as the doubling/labour rates elsewhere).
function stableRentAccrued(asOfDate) {
    asOfDate = asOfDate || todayStr();
    const start = settings.rentStartDate || asOfDate;
    return accrueMonthlyRate(start, asOfDate, () => stableRentMonthly());
}

function rentPaidTotal() {
    return sumBy(rentPayments, 'amount');
}

function rentOutstanding() {
    return Math.max(0, ledgerBalance(stableRentAccrued(), rentPaidTotal()));
}

function openRentPaymentModal() {
    document.getElementById('rentp-rate-info').textContent =
        cur(N(settings.rentPerKhila, 88)) +
        '/khila x ' +
        N(settings.totalKhilas, 196) +
        ' khilas = ' +
        cur(stableRentMonthly()) +
        '/month';
    document.getElementById('rentp-date').value = todayStr();
    document.getElementById('rentp-amount').value = '';
    document.getElementById('rentp-current-out').textContent = '-';
    document.getElementById('rentp-after-out').textContent = '-';
    openModal('modal-rent-payment');
    calcRentPaymentBalance();
}

function calcRentPaymentBalance() {
    const newAmt = N(document.getElementById('rentp-amount').value);
    const out = rentOutstanding();
    document.getElementById('rentp-current-out').textContent = cur(Math.round(out));
    document.getElementById('rentp-after-out').textContent = cur(Math.round(Math.max(0, out - newAmt)));
}

async function saveRentPayment() {
    const date = document.getElementById('rentp-date').value;
    const amount = N(document.getElementById('rentp-amount').value);
    if (!date || !amount) {
        toast('⚠️ Fill date & amount');
        return;
    }
    const entry = { id: uid(), date, amount };
    await saveEntry({
        store: 'rentPayments',
        arr: rentPayments,
        entry,
        modalId: 'modal-rent-payment',
        successMsg: '✅ Rent payment of ' + cur(amount) + ' recorded',
        onDone: () => {
            renderDashboard();
            renderAccounts();
        }
    });
}

// ======================================================
//  MISCELLANEOUS EXPENSES
// ======================================================
function openMiscExpenseModal() {
    document.getElementById('misc-category').value = 'Water';
    document.getElementById('misc-date').value = todayStr();
    document.getElementById('misc-amount').value = '';
    document.getElementById('misc-note').value = '';
    openModal('modal-misc-expense');
}

async function saveMiscExpense() {
    const category = document.getElementById('misc-category').value;
    const date = document.getElementById('misc-date').value;
    const amount = N(document.getElementById('misc-amount').value);
    const note = (document.getElementById('misc-note').value || '').trim();
    if (!category || !date || !amount) {
        toast('⚠️ Fill category, date & amount');
        return;
    }
    const entry = { id: uid(), category, date, amount, note };
    await saveEntry({
        store: 'miscExpenses',
        arr: miscExpenses,
        entry,
        modalId: 'modal-misc-expense',
        successMsg: '✅ ' + category + ' expense saved - ' + cur(amount),
        onDone: () => {
            renderDashboard();
            renderAccounts();
        }
    });
}

function miscExpenseTotal() {
    return sumBy(miscExpenses, 'amount');
}

// ======================================================
//  LIGHT BILL
// ======================================================
function openLightBillModal() {
    const today = new Date();
    $('lb-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    $('lb-amount').value = '';
    $('lb-paid').value = '';
    $('lb-duedate').value = '';
    $('lb-notes').value = '';
    $('lb-outstanding').textContent = '-';
    $('lb-total-out').textContent = '-';
    openModal('modal-light-bill');
}

function calcLightBalance() {
    const amount = N($('lb-amount').value);
    const paid = N($('lb-paid').value);
    const outstanding = Math.max(0, amount - paid);
    $('lb-outstanding').textContent = outstanding > 0 ? cur(outstanding) : '✅ Fully Paid';
    const allOut = lightBills.reduce((s, b) => s + Math.max(0, N(b.amount) - N(b.paid)), 0) + outstanding;
    $('lb-total-out').textContent = cur(allOut);
}

async function saveLightBill() {
    const month = $('lb-month').value;
    const amount = N($('lb-amount').value);
    const paid = N($('lb-paid').value);
    const duedate = $('lb-duedate').value;
    const notes = $('lb-notes').value.trim();
    if (!month || !amount) {
        toast('⚠️ Select month & enter bill amount');
        return;
    }
    const entry = {
        id: uid(),
        month,
        amount,
        paid,
        outstanding: Math.max(0, amount - paid),
        duedate,
        notes,
        date: todayStr()
    };
    const out = Math.max(0, amount - paid);
    await saveEntry({
        store: 'lightBills',
        arr: lightBills,
        entry,
        modalId: 'modal-light-bill',
        successMsg:
            '✅ Light bill saved - ' +
            month +
            ' . ' +
            cur(amount) +
            (out > 0 ? ' . Out: ' + cur(out) : ' . Fully paid'),
        onDone: renderDashboard
    });
}