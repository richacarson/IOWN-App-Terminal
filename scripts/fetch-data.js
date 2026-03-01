#!/usr/bin/env node
// IOWN Terminal — Portfolio Data Fetcher
// Fetches quotes + metrics for all holdings from Finnhub
// Writes to data/portfolio.json for instant terminal startup

const fs = require(‘fs’);
const path = require(‘path’);
const https = require(‘https’);

const API_KEY = process.env.FINNHUB_KEY;
if (!API_KEY) {
console.error(‘Missing FINNHUB_KEY environment variable’);
process.exit(1);
}

const TICKERS = [
// Dividend (25)
‘A’,‘ABT’,‘ADI’,‘ADP’,‘ATO’,‘BKH’,‘CAT’,‘CHD’,‘CL’,‘DGX’,
‘FAST’,‘GD’,‘GPC’,‘LMT’,‘LRCX’,‘MATX’,‘NEE’,‘ORI’,‘PCAR’,‘QCOM’,
‘SSNC’,‘STLD’,‘SYK’,‘TEL’,‘VLO’,
// Growth (24)
‘AEM’,‘AMD’,‘ATAT’,‘CNX’,‘COIN’,‘CVX’,‘CWAN’,‘EIX’,‘FINV’,‘FTNT’,
‘GFI’,‘HOOD’,‘HRMY’,‘HUT’,‘KEYS’,‘MARA’,‘NVDA’,‘NXPI’,‘OKE’,‘PDD’,
‘SUPV’,‘SYF’,‘TOL’,‘TSM’,
// Digital (2)
‘IBIT’,‘ETHA’
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchJSON(urlStr) {
return new Promise((resolve, reject) => {
https.get(urlStr, res => {
if (res.statusCode === 429) return resolve({ _rateLimited: true });
if (res.statusCode !== 200) return resolve(null);
let data = ‘’;
res.on(‘data’, chunk => data += chunk);
res.on(‘end’, () => {
try { resolve(JSON.parse(data)); }
catch { resolve(null); }
});
}).on(‘error’, () => resolve(null));
});
}

async function fetchWithRetry(url, retries = 2) {
for (let i = 0; i <= retries; i++) {
const d = await fetchJSON(url);
if (d && d._rateLimited) {
console.log(’  ⏳ Rate limited, waiting 62s…’);
await sleep(62000);
continue;
}
return d;
}
return null;
}

async function main() {
console.log(`🚀 IOWN Data Refresh — ${new Date().toISOString()}`);
console.log(`📊 Fetching ${TICKERS.length} tickers...\n`);

const quotes = {};
const metrics = {};

// Phase 1: Quotes
console.log(‘── Phase 1: Quotes ──’);
for (let i = 0; i < TICKERS.length; i++) {
const t = TICKERS[i];
const url = `https://finnhub.io/api/v1/quote?symbol=${t}&token=${API_KEY}`;
const d = await fetchWithRetry(url);
if (d && d.c) {
quotes[t] = { c: d.c, d: d.d, dp: d.dp, h: d.h, l: d.l, o: d.o, pc: d.pc, t: d.t };
const arrow = d.dp >= 0 ? ‘↑’ : ‘↓’;
console.log(`  ${t.padEnd(5)} $${d.c.toFixed(2).padStart(8)} ${arrow} ${d.dp >= 0 ? '+' : ''}${d.dp.toFixed(2)}%`);
} else {
console.log(`  ${t.padEnd(5)} — no data`);
}
await sleep(1100);
}

// Phase 2: Metrics
console.log(’\n── Phase 2: Fundamentals ──’);
for (let i = 0; i < TICKERS.length; i++) {
const t = TICKERS[i];
const url = `https://finnhub.io/api/v1/stock/metric?symbol=${t}&metric=all&token=${API_KEY}`;
const d = await fetchWithRetry(url);
if (d && d.metric) {
const m = d.metric;
metrics[t] = {
pe: m.peBasicExclExtraTTM || m.peTTM || null,
divYield: m.dividendYieldIndicatedAnnual || m.currentDividendYieldTTM || null,
marketCap: m.marketCapitalization || null,
fiftyTwoHigh: m[‘52WeekHigh’] || null,
fiftyTwoLow: m[‘52WeekLow’] || null,
sma200: m[‘200DayMovingAverage’] || null,
sma50: m[‘50DayMovingAverage’] || null,
beta: m.beta || null,
epsAnnual: m.epsAnnual || null,
revenuePerShare: m.revenuePerShareAnnual || null,
roe: m.roeTTM || null,
roa: m.roaTTM || null,
debtEquity: m[‘totalDebt/totalEquityQuarterly’] || null,
currentRatio: m.currentRatioQuarterly || null,
grossMargin: m.grossMarginTTM || null,
netMargin: m.netProfitMarginTTM || null,
avgVolume: m[‘10DayAverageTradingVolume’] || null,
// Growth-specific metrics
pegTTM: m.pegRatioTTM || null,
revenueGrowthYoY: m.revenueGrowthTTMYoy || null,
revenueGrowth5Y: m.revenueGrowth5Y || null,
epsGrowthTTM: m.epsGrowthTTMYoy || null,
epsGrowth5Y: m.epsGrowth5Y || null,
fcfPerShare: m.freeCashFlowPerShareTTM || null,
totalDebt: m.totalDebtToTotalCapitalQuarterly || null,
longTermDebt: m.longTermDebt || null,
};
console.log(`  ${t.padEnd(5)} P/E: ${(m.peBasicExclExtraTTM || '—').toString().padStart(6)}  Yield: ${(m.dividendYieldIndicatedAnnual || '—').toString().padStart(5)}%  MCap: ${(m.marketCapitalization || '—')}`);
} else {
console.log(`  ${t.padEnd(5)} — no metrics`);
}
await sleep(1100);
}

// Phase 3: FMP Analyst Estimates (growth tickers only — for P/E FWD & PEG FWD)
const FMP_KEY = process.env.FMP_KEY;
const GROWTH_TICKERS = [
‘AEM’,‘AMD’,‘ATAT’,‘CNX’,‘COIN’,‘CVX’,‘CWAN’,‘EIX’,‘FINV’,‘FTNT’,
‘GFI’,‘HOOD’,‘HRMY’,‘HUT’,‘KEYS’,‘MARA’,‘NVDA’,‘NXPI’,‘OKE’,‘PDD’,
‘SUPV’,‘SYF’,‘TOL’,‘TSM’
];
const estimates = {};

if (FMP_KEY) {
console.log(’\n── Phase 3: FMP Forward Estimates (Growth) ──’);
for (let i = 0; i < GROWTH_TICKERS.length; i++) {
const t = GROWTH_TICKERS[i];
const url = `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${t}&period=annual&limit=2&apikey=${FMP_KEY}`;
const d = await fetchJSON(url);
if (d && Array.isArray(d) && d.length > 0) {
// First entry = next FY estimate, second = current FY
const fwd = d[0];
const fwdEPS = fwd.estimatedEpsAvg || fwd.estimatedEpsHigh || null;
const price = quotes[t] ? quotes[t].c : null;
const peFwd = (price && fwdEPS && fwdEPS > 0) ? +(price / fwdEPS).toFixed(2) : null;
// EPS growth rate for PEG FWD: use Finnhub epsGrowthTTM or calculate from estimates
const epsGrowth = metrics[t] ? metrics[t].epsGrowthTTM : null;
const pegFwd = (peFwd && epsGrowth && epsGrowth > 0) ? +(peFwd / epsGrowth).toFixed(2) : null;
estimates[t] = { fwdEPS, peFwd, pegFwd };
console.log(`  ${t.padEnd(5)} FWD EPS: ${(fwdEPS||'—').toString().padStart(6)}  P/E FWD: ${(peFwd||'—').toString().padStart(6)}  PEG FWD: ${(pegFwd||'—').toString().padStart(6)}`);
} else {
console.log(`  ${t.padEnd(5)} — no estimates`);
}
await sleep(500); // FMP has generous limits
}
} else {
console.log(’\n⚠️  FMP_KEY not set — skipping forward estimates’);
}

// Phase 4: FMP Dividend History + Forward Estimates (dividend tickers)
const DIV_TICKERS = [
‘A’,‘ABT’,‘ADI’,‘ADP’,‘ATO’,‘BKH’,‘CAT’,‘CHD’,‘CL’,‘DGX’,
‘FAST’,‘GD’,‘GPC’,‘LMT’,‘LRCX’,‘MATX’,‘NEE’,‘ORI’,‘PCAR’,‘QCOM’,
‘SSNC’,‘STLD’,‘SYK’,‘TEL’,‘VLO’
];
const dividendData = {};

if (FMP_KEY) {
console.log(’\n── Phase 4: FMP Dividend History + Estimates (Dividend) ──’);
for (let i = 0; i < DIV_TICKERS.length; i++) {
const t = DIV_TICKERS[i];

```
  // 4a: Historical dividends → consecutive years
  const histUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${t}?apikey=${FMP_KEY}`;
  const hd = await fetchJSON(histUrl);
  let consecPayments = 0, consecGrowth = 0, divGrowth5Y = null, payoutRatio = null;

  if (hd && hd.historical && hd.historical.length > 0) {
    // Group dividends by year, sum annual totals
    const byYear = {};
    hd.historical.forEach(d => {
      const yr = parseInt(d.date.substring(0, 4));
      if (!byYear[yr]) byYear[yr] = 0;
      byYear[yr] += d.adjDividend || d.dividend || 0;
    });
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

    // Consecutive years of payments (counting back from most recent full year)
    const currentYear = new Date().getFullYear();
    const startYr = years[0] >= currentYear ? years[1] || years[0] : years[0];
    consecPayments = 0;
    for (let y = startYr; y >= startYr - 100; y--) {
      if (byYear[y] && byYear[y] > 0) consecPayments++;
      else break;
    }

    // Consecutive years of growth (year-over-year increase)
    consecGrowth = 0;
    for (let y = startYr; y > startYr - 100; y--) {
      if (byYear[y] && byYear[y - 1] && byYear[y] > byYear[y - 1]) consecGrowth++;
      else break;
    }

    // 5-year dividend CAGR
    const yr5 = startYr - 5;
    if (byYear[startYr] && byYear[yr5] && byYear[yr5] > 0) {
      divGrowth5Y = +((Math.pow(byYear[startYr] / byYear[yr5], 1/5) - 1) * 100).toFixed(2);
    }
  }

  // 4b: Forward estimates for P/E FWD
  const estUrl = `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${t}&period=annual&limit=2&apikey=${FMP_KEY}`;
  const est = await fetchJSON(estUrl);
  let peFwd = null;
  if (est && Array.isArray(est) && est.length > 0) {
    const fwdEPS = est[0].estimatedEpsAvg || est[0].estimatedEpsHigh || null;
    const price = quotes[t] ? quotes[t].c : null;
    peFwd = (price && fwdEPS && fwdEPS > 0) ? +(price / fwdEPS).toFixed(2) : null;
  }

  // Forward yield from Finnhub metrics
  const yieldFwd = metrics[t] ? metrics[t].divYield : null;

  dividendData[t] = { consecPayments, consecGrowth, divGrowth5Y, peFwd, yieldFwd };
  console.log(`  ${t.padEnd(5)} Consec: ${consecPayments}yr  Growth: ${consecGrowth}yr  DivG5Y: ${divGrowth5Y||'—'}%  P/E FWD: ${peFwd||'—'}`);

  await sleep(500);
}
```

} else {
console.log(’\n⚠️  FMP_KEY not set — skipping dividend history’);
}

// Phase 5: Performance (1W, 1M, 3M, YTD returns from Finnhub candles)
console.log(’\n── Phase 5: Performance Returns ──’);
const performance = {};
const now = Math.floor(Date.now() / 1000);
const DAY = 86400;
const ytdStart = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
// Fetch from Jan 1 to now (covers YTD which is the longest period we need)
// Use daily resolution - one call per ticker
const from3m = now - 100 * DAY; // ~100 days covers 3M with buffer
const fetchFrom = Math.min(ytdStart, from3m) - 5 * DAY; // extra buffer

for (let i = 0; i < TICKERS.length; i++) {
const t = TICKERS[i];
const url = `https://finnhub.io/api/v1/stock/candle?symbol=${t}&resolution=D&from=${fetchFrom}&to=${now}&token=${API_KEY}`;
const d = await fetchWithRetry(url);
if (d && d.s === ‘ok’ && d.c && d.c.length > 0 && d.t && d.t.length > 0) {
const prices = d.c; // closing prices
const times = d.t;  // timestamps
const currentPrice = quotes[t] ? quotes[t].c : prices[prices.length - 1];

```
  // Helper: find closest price to a target timestamp (searching backward)
  function priceAt(targetTs) {
    let best = -1;
    for (let j = times.length - 1; j >= 0; j--) {
      if (times[j] <= targetTs) { best = j; break; }
    }
    if (best === -1) best = 0; // fallback to earliest
    return prices[best];
  }

  const p1w = priceAt(now - 7 * DAY);
  const p1m = priceAt(now - 30 * DAY);
  const p3m = priceAt(now - 91 * DAY);
  const pytd = priceAt(ytdStart);

  performance[t] = {
    w1: p1w ? +((currentPrice - p1w) / p1w * 100).toFixed(2) : null,
    m1: p1m ? +((currentPrice - p1m) / p1m * 100).toFixed(2) : null,
    m3: p3m ? +((currentPrice - p3m) / p3m * 100).toFixed(2) : null,
    ytd: pytd ? +((currentPrice - pytd) / pytd * 100).toFixed(2) : null,
  };
  console.log(`  ${t.padEnd(5)} 1W: ${(performance[t].w1||0)>0?'+':''}${performance[t].w1}%  1M: ${(performance[t].m1||0)>0?'+':''}${performance[t].m1}%  3M: ${(performance[t].m3||0)>0?'+':''}${performance[t].m3}%  YTD: ${(performance[t].ytd||0)>0?'+':''}${performance[t].ytd}%`);
} else {
  console.log(`  ${t.padEnd(5)} — no candle data`);
}
await sleep(1100);
```

}

// Write output
const output = {
updated: new Date().toISOString(),
tickerCount: TICKERS.length,
quoteCount: Object.keys(quotes).length,
metricCount: Object.keys(metrics).length,
estimateCount: Object.keys(estimates).length,
dividendCount: Object.keys(dividendData).length,
performanceCount: Object.keys(performance).length,
quotes,
metrics,
estimates,
dividendData,
performance
};

const outPath = path.join(__dirname, ‘..’, ‘data’, ‘portfolio.json’);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output));

console.log(`\n✅ Done — ${Object.keys(quotes).length} quotes, ${Object.keys(metrics).length} metrics`);
console.log(`📁 Written to ${outPath} (${(JSON.stringify(output).length / 1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });