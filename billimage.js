// ======================================================
//  bill-image.js
//  Canvas drawing helpers for the shareable bill image (both the "Simple" and "Branded" invoice styles).
// ======================================================

// ======================================================
//  BILL IMAGE - shared drawing helpers
// ======================================================
function billHline(ctx, yy, x0, x1, color, w) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w || 1;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy);
    ctx.stroke();
}

function billVline(ctx, xx, y0, y1, color, w) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w || 1;
    ctx.beginPath();
    ctx.moveTo(xx, y0);
    ctx.lineTo(xx, y1);
    ctx.stroke();
}

function billRoundRect(ctx, x, y, w, h, r) {
    if (!r) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function billShortDate(ds) {
    const d = new Date(ds + 'T00:00:00');
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(-2);
}

// Amount in words (Indian numbering: crore / lakh / thousand)
function numToWordsIndian(num) {
    num = Math.round(num);
    if (!num) return 'Zero Only';
    const ones = [
        '',
        'One',
        'Two',
        'Three',
        'Four',
        'Five',
        'Six',
        'Seven',
        'Eight',
        'Nine',
        'Ten',
        'Eleven',
        'Twelve',
        'Thirteen',
        'Fourteen',
        'Fifteen',
        'Sixteen',
        'Seventeen',
        'Eighteen',
        'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function twoDigits(n) {
        if (n < 20) return ones[n];
        return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    }
    function threeDigits(n) {
        let s = '';
        if (n >= 100) {
            s += ones[Math.floor(n / 100)] + ' Hundred';
            n = n % 100;
            if (n) s += ' ';
        }
        s += twoDigits(n);
        return s;
    }
    let n = num;
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const rest = n;
    const parts = [];
    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
    if (rest) parts.push(threeDigits(rest));
    return parts.join(' ') + ' Only';
}

// ======================================================
//  BILL IMAGE STYLE DISPATCHER
// ======================================================
function buildBillImageCanvas(data) {
    const style = settings.billStyle || 'branded';
    if (style === 'simple') return buildBillSimple(data);
    return buildBillBranded(data);
}

// ======================================================
//  STANDARD - "Milk Invoice" green table style
// ======================================================
function buildBillSimple(data) {
    const scale = 2;
    const W = 700;
    const M = 30;
    const rowH = 42;
    const tableHeadH = 40;
    const CREAM = '#FBF8F1',
        ROW_ALT = '#EFE7D3',
        INK = '#181818',
        BORDER = '#C9C2AE',
        GREEN_DK = '#1F5C3F',
        GREEN_MD = '#2E7D51',
        GREEN_LT = '#E5F0E8';
    const bizName = (settings.businessName && settings.businessName.trim()) || 'Dairy Farm';
    const hasExtra = data.prevBalance !== 0 || data.paidInRange > 0;
    // Previous balance netted against any payment received during this
    // billing period, so a fully-settled old balance shows as ₹0 instead of
    // still displaying the stale (already-paid) figure.
    const netPrevBalance =
        typeof data.netPrevBalance === 'number'
            ? data.netPrevBalance
            : data.prevBalance - (data.paidInRange || 0);

    let H = 118; // header block + rule
    H += 42; // customer name (big, centered)
    H += 46; // "DAILY MILK SUPPLY" title bar
    H += tableHeadH;
    H += data.rows.length * rowH;
    H += 40; // total quantity row
    H += 58; // total amount row (big, filled banner)
    if (hasExtra) H += 34 + 40;
    H += 44; // amount in words
    H += 20;

    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);

    // Logo badge - buffalo in a green ring
    ctx.strokeStyle = GREEN_DK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(58, 56, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '34px -apple-system, Helvetica, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u{1F403}', 58, 58);
    ctx.textBaseline = 'alphabetic';

    // Title block
    ctx.textAlign = 'left';
    ctx.fillStyle = GREEN_DK;
    ctx.font = '900 28px -apple-system, Helvetica, Arial';
    ctx.fillText('MILK INVOICE', 112, 46);
    ctx.fillStyle = INK;
    ctx.font = '800 17px -apple-system, Helvetica, Arial';
    ctx.fillText(bizName.toUpperCase(), 112, 68);

    // Meta block (right)
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = '800 12px -apple-system, Helvetica, Arial';
    ctx.fillText('BILLING PERIOD:', W - M, 34);
    ctx.font = '700 13px -apple-system, Helvetica, Arial';
    ctx.fillText(billShortDate(data.fromDate) + ' - ' + billShortDate(data.toDate), W - M, 50);
    ctx.font = '800 12px -apple-system, Helvetica, Arial';
    ctx.fillText('INVOICE DATE: ' + billShortDate(data.invoiceDate || todayStr()), W - M, 68);
    ctx.fillText('INVOICE #: ' + (data.invoiceNo || '-'), W - M, 84);

    let y = 108;
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = '900 32px -apple-system, Helvetica, Arial';
    ctx.fillText(data.custName, W / 2, y);
    y += 26;
    billHline(ctx, y, M, W - M, GREEN_MD, 2);
    y += 10;

    // Outer table frame
    const tableTop = y;
    const x0 = M,
        x1 = 130,
        x2 = 300,
        x3 = 430,
        x4 = 555,
        x5 = W - M;

    ctx.fillStyle = GREEN_DK;
    ctx.fillRect(x0, y, x5 - x0, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '900 17px -apple-system, Helvetica, Arial';
    ctx.fillText('DAILY MILK SUPPLY', W / 2, y + 26);
    y += 40;

    ctx.fillStyle = INK;
    ctx.font = '800 11.5px -apple-system, Helvetica, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('DATE', x0 + 8, y + 26);
    ctx.textAlign = 'center';
    ctx.fillText('MOR. (L)', (x1 + x2) / 2, y + 26);
    ctx.fillText('EVE.', (x2 + x3) / 2, y + 20);
    ctx.fillText('(Liters)', (x2 + x3) / 2, y + 34);
    ctx.fillText('RATE', (x3 + x4) / 2, y + 20);
    ctx.fillText('(per Liter)', (x3 + x4) / 2, y + 34);
    ctx.textAlign = 'right';
    ctx.fillText('DAILY TOTAL', x5 - 8, y + 26);
    y += tableHeadH;

    data.rows.forEach(function (r, i) {
        if (i % 2 === 1) {
            ctx.fillStyle = ROW_ALT;
            ctx.fillRect(x0, y, x5 - x0, rowH);
        }
        ctx.fillStyle = INK;
        ctx.font = '700 14px -apple-system, Helvetica, Arial';
        ctx.textAlign = 'left';
        ctx.fillText(billShortDate(r.date), x0 + 8, y + 27);
        ctx.textAlign = 'center';
        ctx.font = '800 16px -apple-system, Helvetica, Arial';
        ctx.fillText((r.morning || 0) > 0 ? r.morning.toFixed(1) : '-', (x1 + x2) / 2, y + 27);
        ctx.fillText((r.evening || 0) > 0 ? r.evening.toFixed(1) : '-', (x2 + x3) / 2, y + 27);
        ctx.font = '700 14px -apple-system, Helvetica, Arial';
        ctx.fillText(r.rate.toFixed(2), (x3 + x4) / 2, y + 27);
        ctx.textAlign = 'right';
        ctx.font = '800 16px -apple-system, Helvetica, Arial';
        ctx.fillStyle = GREEN_DK;
        ctx.fillText(cur(Math.round(r.amount)).replace('\u20B9', ''), x5 - 8, y + 27);
        y += rowH;
    });
    const tableBottom = y;

    // Grid lines (subtle, no heavy black frame)
    [x0, x1, x2, x3, x4, x5].forEach(function (cx) {
        billVline(ctx, cx, tableTop, tableBottom, BORDER, 1);
    });
    billHline(ctx, tableTop + 40, x0, x5, BORDER, 1);
    let gy = tableTop + 40 + tableHeadH;
    for (let i = 0; i < data.rows.length; i++) {
        billHline(ctx, gy, x0, x5, BORDER, 1);
        gy += rowH;
    }

    // Total Quantity row
    ctx.fillStyle = INK;
    ctx.font = '800 15px -apple-system, Helvetica, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL QUANTITY:', x0 + 8, y + 26);
    ctx.textAlign = 'right';
    ctx.font = '900 18px -apple-system, Helvetica, Arial';
    ctx.fillText(data.totalLitres.toFixed(0) + ' Liters', x5 - 8, y + 26);
    y += 40;
    billHline(ctx, y, x0, x5, BORDER, 1);

    // Total Amount row - filled light-green banner
    ctx.fillStyle = GREEN_LT;
    ctx.fillRect(x0, y, x5 - x0, 58);
    ctx.fillStyle = INK;
    ctx.font = '900 22px -apple-system, Helvetica, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL AMOUNT:', x0 + 8, y + 36);
    ctx.textAlign = 'right';
    ctx.fillStyle = GREEN_DK;
    ctx.font = '900 30px -apple-system, Helvetica, Arial';
    ctx.fillText(cur(Math.round(data.totalAmount)), x5 - 8, y + 36);
    y += 58;
    billHline(ctx, y, x0, x5, BORDER, 1);

    if (hasExtra) {
        const isAdvance = netPrevBalance < 0;
        ctx.fillStyle = INK;
        ctx.font = '700 14px -apple-system, Helvetica, Arial';
        ctx.textAlign = 'left';
        ctx.fillText(isAdvance ? 'ADVANCE / CREDIT:' : 'PREVIOUS BALANCE:', x0 + 8, y + 22);
        ctx.textAlign = 'right';
        ctx.font = '800 16px -apple-system, Helvetica, Arial';
        ctx.fillStyle = isAdvance ? GREEN_DK : INK;
        ctx.fillText((isAdvance ? '- ' : '') + cur(Math.round(Math.abs(netPrevBalance))), x5 - 8, y + 22);
        ctx.fillStyle = INK;
        y += 34;
        billHline(ctx, y, x0, x5, BORDER, 1);
        // Net Amount Due - filled dark-green banner
        ctx.fillStyle = GREEN_DK;
        ctx.fillRect(x0, y, x5 - x0, 40);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 18px -apple-system, Helvetica, Arial';
        ctx.textAlign = 'left';
        ctx.fillText('NET AMOUNT DUE:', x0 + 8, y + 27);
        ctx.textAlign = 'right';
        ctx.font = '900 26px -apple-system, Helvetica, Arial';
        ctx.fillText(cur(Math.round(data.netAmount)), x5 - 8, y + 27);
        y += 40;
    }

    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x0, tableTop, x5 - x0, y - tableTop);

    // Amount in words
    y += 30;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = '800 13px -apple-system, Helvetica, Arial';
    ctx.fillText('AMOUNT IN WORDS: ' + numToWordsIndian(data.netAmount || data.totalAmount), x0, y);

    return canvas;
}

// ======================================================
//  BRANDED - "Dairy Farm" green rounded-card style
// ======================================================
function buildBillBranded(data) {
    const scale = 2;
    const W = 700;
    const M = 34;
    const rowH = 48;
    const tableHeadH = 40;
    const CREAM = '#F8F3E6',
        INK = '#2B2B26',
        BORDER = '#E3DCC5',
        HEAD_BG = '#E1F0E7',
        GREEN_DK = '#1F5C3F',
        GREEN_MD = '#2E7D51',
        GREEN_LT = '#4CA372';
    const bizName = (settings.businessName && settings.businessName.trim()) || 'Dairy Farm';
    const trackedCaps = s => s.toUpperCase().split('').join(' ');
    const hasExtra = data.prevBalance !== 0 || data.paidInRange > 0;
    // Previous balance netted against any payment received during this
    // billing period, so a fully-settled old balance shows as ₹0 instead of
    // still displaying the stale (already-paid) figure.
    const netPrevBalance =
        typeof data.netPrevBalance === 'number'
            ? data.netPrevBalance
            : data.prevBalance - (data.paidInRange || 0);

    const BANNER_H = 196;
    let H = BANNER_H;
    H += 36; // gap -> invoice no
    H += 22; // invoice no line
    H += 18; // gap -> table
    H += tableHeadH;
    H += data.rows.length * rowH;
    H += 20; // gap
    H += 32; // total litres row
    H += 20; // gap
    H += 58; // total amount pill
    H += 20; // gap
    if (hasExtra) H += 32;
    H += 12;
    H += 44; // grand total due
    H += 28;

    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // Whole-card cream background, rounded
    billRoundRect(ctx, 0, 0, W, H, 22);
    ctx.fillStyle = CREAM;
    ctx.fill();

    // Green gradient header banner, rounded top corners only
    ctx.save();
    billRoundRect(ctx, 0, 0, W, BANNER_H + 22, 22);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, 0, W, BANNER_H);
    grad.addColorStop(0, GREEN_LT);
    grad.addColorStop(0.55, GREEN_MD);
    grad.addColorStop(1, GREEN_DK);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, BANNER_H);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 21px Georgia, "Times New Roman", serif';
    ctx.fillText(trackedCaps('Dairy Farm'), W / 2, 54);

    ctx.font = '900 38px -apple-system, Helvetica, Arial';
    ctx.fillText(data.custName, W / 2, 108);

    ctx.font = '700 15px -apple-system, Helvetica, Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(billShortDate(data.fromDate) + ' to ' + billShortDate(data.toDate), W / 2, 138);

    // Outer card border
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1.3;
    billRoundRect(ctx, 1, 1, W - 2, H - 2, 21);
    ctx.stroke();

    let y = BANNER_H + 36;
    ctx.textAlign = 'center';
    ctx.fillStyle = GREEN_DK;
    ctx.font = '800 15px -apple-system, Helvetica, Arial';
    ctx.fillText('Invoice No: ' + (data.invoiceNo || '-'), W / 2, y);
    y += 40;

    const x0 = M,
        x1 = 150,
        x2 = 320,
        x3 = 440,
        x4 = W - M;
    const tableTop = y;
    ctx.fillStyle = HEAD_BG;
    ctx.fillRect(x0, y, x4 - x0, tableHeadH);
    ctx.fillStyle = GREEN_DK;
    ctx.font = '800 12px -apple-system, Helvetica, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Date', x0 + 10, y + 25);
    ctx.textAlign = 'center';
    ctx.fillText('Mor. (L)', (x1 + x2) / 2, y + 25);
    ctx.fillText('Eve. (L)', (x2 + x3) / 2, y + 25);
    ctx.textAlign = 'right';
    ctx.fillText('Rate (\u20B9)', x3 - 4, y + 25);
    ctx.fillText('Amount (\u20B9)', x4 - 10, y + 25);
    y += tableHeadH;

    data.rows.forEach(function (r) {
        ctx.fillStyle = INK;
        ctx.font = '600 15px -apple-system, Helvetica, Arial';
        ctx.textAlign = 'left';
        ctx.fillText(billShortDate(r.date), x0 + 10, y + 30);
        ctx.textAlign = 'center';
        ctx.font = '700 16px -apple-system, Helvetica, Arial';
        ctx.fillText((r.morning || 0) > 0 ? r.morning.toFixed(1) : '-', (x1 + x2) / 2, y + 30);
        ctx.fillText((r.evening || 0) > 0 ? r.evening.toFixed(1) : '-', (x2 + x3) / 2, y + 30);
        ctx.font = '600 15px -apple-system, Helvetica, Arial';
        ctx.textAlign = 'right';
        ctx.fillText(r.rate.toFixed(0), x3 - 4, y + 30);
        ctx.font = '800 18px -apple-system, Helvetica, Arial';
        ctx.fillText(cur(Math.round(r.amount)).replace('\u20B9', ''), x4 - 10, y + 30);
        y += rowH;
        billHline(ctx, y, x0, x4, BORDER, 1);
    });
    y += 20;

    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = '600 14px -apple-system, Helvetica, Arial';
    ctx.fillText('Total Litres Supplied:', x0, y + 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = GREEN_DK;
    ctx.font = '800 17px -apple-system, Helvetica, Arial';
    ctx.fillText(data.totalLitres.toFixed(0) + ' L', x4, y + 20);
    y += 32 + 20;

    // Total Amount - filled green pill
    billRoundRect(ctx, x0, y, x4 - x0, 58, 12);
    ctx.fillStyle = GREEN_DK;
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 17px -apple-system, Helvetica, Arial';
    ctx.fillText('Current Bill:', x0 + 16, y + 35);
    ctx.textAlign = 'right';
    ctx.font = '900 24px -apple-system, Helvetica, Arial';
    ctx.fillText(cur(Math.round(data.totalAmount)), x4 - 16, y + 35);
    y += 58 + 20;

    if (hasExtra) {
        const isAdvance = netPrevBalance < 0;
        ctx.textAlign = 'left';
        ctx.fillStyle = INK;
        ctx.font = '600 14px -apple-system, Helvetica, Arial';
        ctx.fillText(isAdvance ? 'Advance:' : 'Previous Balance:', x0, y + 18);
        ctx.textAlign = 'right';
        ctx.fillStyle = isAdvance ? GREEN_DK : INK;
        ctx.font = '800 16px -apple-system, Helvetica, Arial';
        ctx.fillText((isAdvance ? '- ' : '') + cur(Math.round(Math.abs(netPrevBalance))), x4, y + 18);
        y += 32;
    }
    y += 12;
    billHline(ctx, y, x0, x4, BORDER, 1.3);
    y += 32;

    ctx.textAlign = 'left';
    ctx.fillStyle = GREEN_DK;
    ctx.font = '800 18px -apple-system, Helvetica, Arial';
    ctx.fillText('Net Bill:', x0, y);
    ctx.textAlign = 'right';
    ctx.font = '900 28px -apple-system, Helvetica, Arial';
    ctx.fillText(cur(Math.round(data.netAmount)), x4, y);

    return canvas;
}