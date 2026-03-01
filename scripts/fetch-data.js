#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.FINNHUB_KEY;
if (!API_KEY) { console.error('Missing FINNHUB_KEY'); process.exit(1); }

const TICKERS = [
  'A','ABT','ADI','ADP','ATO','BKH','CAT','CHD','CL','DGX',
  'FAST','GD','GPC','LMT','LRCX','MATX','NEE','ORI','PCAR','QCOM',
  'SSNC','STLD','SYK','TEL','VLO',
  'AEM','AMD','ATAT','CNX','COIN','CVX','CWAN','EIX','FINV','FTNT',
  'GFI','HOOD','HRMY','HUT','KEYS','MARA','NVDA','NXPI','OKE','PDD',
  'SUPV','SYF','TOL','TSM',
  'IBIT','ETHA'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchJSON(urlStr) {
  return new Promise((resolve) => {
    https.get(urlStr, res => {
      if (res.statusCode === 429) return resolve({ _rateLimited: true });
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const d = await fetchJSON(url);
    if (d && d._rateLimited) { console.log('  Rate limited, waiting 62s...'); await sleep(62000); continue; }
    return d;
  }
  return null;
}

async function main() {
  console.log('IOWN Data Refresh — ' + new Date().toISOString());
  console.log('Fetching ' + TICKERS.length + ' tickers...\n');
  const quotes = {}, metrics = {};

  console.log('-- Phase 1: Quotes --');
  for (let i = 0; i < TICKERS.length; i++) {
    const t = TICKERS[i];
    const d = await fetchWithRetry('https://finnhub.io/api/v1/quote?symbol=' + t + '&token=' + API_KEY);
    if (d && d.c) { quotes[t] = { c:d.c, d:d.d, dp:d.dp, h:d.h, l:d.l, o:d.o, pc:d.pc, t:d.t }; console.log('  ' + t + ' $' + d.c.toFixed(2)); }
    else console.log('  ' + t + ' — no data');
    await sleep(1100);
  }

  console.log('\n-- Phase 2: Fundamentals --');
  for (let i = 0; i < TICKERS.length; i++) {
    const t = TICKERS[i];
    const d = await fetchWithRetry('https://finnhub.io/api/v1/stock/metric?symbol=' + t + '&metric=all&token=' + API_KEY);
    if (d && d.metric) {
      const m = d.metric;
      metrics[t] = {
        pe: m.peBasicExclExtraTTM || m.peTTM || null,
        divYield: m.dividendYieldIndicatedAnnual || m.currentDividendYieldTTM || null,
        marketCap: m.marketCapitalization || null,
        fiftyTwoHigh: m['52WeekHigh'] || null, fiftyTwoLow: m['52WeekLow'] || null,
        sma200: m['200DayMovingAverage'] || null, sma50: m['50DayMovingAverage'] || null,
        beta: m.beta || null, epsAnnual: m.epsAnnual || null,
        revenuePerShare: m.revenuePerShareAnnual || null,
        roe: m.roeTTM || null, roa: m.roaTTM || null,
        debtEquity: m['totalDebt/totalEquityQuarterly'] || null,
        currentRatio: m.currentRatioQuarterly || null,
        grossMargin: m.grossMarginTTM || null, netMargin: m.netProfitMarginTTM || null,
        avgVolume: m['10DayAverageTradingVolume'] || null,
      };
      console.log('  ' + t + ' P/E:' + (metrics[t].pe || '-'));
    } else console.log('  ' + t + ' — no metrics');
    await sleep(1100);
  }

  const output = { updated: new Date().toISOString(), tickerCount: TICKERS.length, quoteCount: Object.keys(quotes).length, metricCount: Object.keys(metrics).length, quotes, metrics };
  const outPath = path.join(__dirname, '..', 'data', 'portfolio.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log('\nDone — ' + Object.keys(quotes).length + ' quotes, ' + Object.keys(metrics).length + ' metrics');
}

main().catch(e => { console.error(e); process.exit(1); });
