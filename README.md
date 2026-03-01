# IOWN Terminal

Investment research terminal for Intentional Ownership. SeekingAlpha-level portfolio tracking with instant startup.

## How It Works

A GitHub Action runs every 5 minutes during market hours, fetches live data from Finnhub for all 51 holdings, and saves it to `data/portfolio.json`. When you open the terminal, it loads that one file — **instant data, no waiting**.

## Setup (One-Time)

### 1. Add your Finnhub API key as a GitHub Secret
- Repo → **Settings** → **Secrets and variables** → **Actions**
- Click **"New repository secret"**
- Name: `FINNHUB_KEY`
- Value: your Finnhub API key

### 2. Enable GitHub Pages
- **Settings** → **Pages**
- Source: **"Deploy from a branch"**
- Branch: `main`, folder: `/ (root)`
- Save

### 3. Enable Actions
- Go to **Actions** tab
- Click **"I understand my workflows, go ahead and enable them"**

### 4. First run
- Actions tab → **"Refresh Portfolio Data"** → **"Run workflow"** → Run
- Wait ~3 min for it to complete
- Your terminal now has data!

## Refresh Schedule

| When | Frequency |
|------|-----------|
| Market hours (Mon–Fri 9:25 AM – 4:05 PM ET) | Every 5 minutes |
| Weekday off-hours | Every 30 minutes |
| Weekends | Every hour |

## Repo Structure

```
index.html                            ← The terminal (single-file React app)
data/portfolio.json                   ← Auto-updated by GitHub Action
scripts/fetch-data.js                 ← Finnhub fetcher (runs in Action)
.github/workflows/refresh.yml         ← Cron schedule
manifest.json                         ← PWA manifest (home screen install)
```

## Live URL

```
https://richacarson.github.io/IOWN-App-Terminal/
```
