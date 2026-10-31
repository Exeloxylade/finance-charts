---
name: finance-charts
description: Animated finance / news charts from REAL data for code-made videos (HyperFrames). Pulls live prices, indices, FX and commodities (Yahoo Finance via yfinance) and macro series (World Bank API), then draws them with D3 as charts that draw on to the voice - multi-line time series with annotations, area, bars (vertical/horizontal, negatives), 100% stacked bar, threshold gauge, donut, counters. Every chart prints its source. Use for stock crashes, currency moves, bank results, GDP, reserves, any "show the numbers" beat.
---

# finance-charts: real data -> animated charts

Pipeline: `get_market_data.py` (real numbers, JSON + JS global) -> `fchart.js` (D3 charts,
pure function of t) -> your HyperFrames `index.html` calls `.draw(t)` from `hf-seek`.
Tested 2026-10-31 in `videos\rm-proof` (Indonesia banks vs index, rupiah, change bars).

## Files
| File | Job |
|---|---|
| `scripts/get_market_data.py` | Real data. `yahoo` = yfinance (stocks, indices, FX, futures). `worldbank` = World Bank API (GDP, reserves, debt, inflation). Writes `<name>.json` + `<name>.js` (`window.__DATA[name]`). Options: `--rebase 100`, `--weekly`. |
| `scripts/fchart.js` | `window.FC`: `line`, `area`, `bars`, `stack`, `gauge`, `donut`, `counter` + `ramp`/`ease`/`pct`/`num`/`money`. Needs D3 v7. |
| `scripts/d3.min.js` | D3 7.9.0, local. Load it from disk - a CDN download can time out the renderer. |

Install once: `python -m pip install -U yfinance` (D3 is already in `scripts/`).

## 1. Get real data
```
cd C:\Users\Ahmad\.kiro\crew\skills\finance-charts\scripts
python get_market_data.py yahoo --tickers "^JKSE,BMRI.JK,BBCA.JK" --labels "Index,Mandiri,BCA" ^
  --start 2024-09-30 --end 2026-10-31 --rebase 100 --weekly --out <proj>\assets --name banks
python get_market_data.py yahoo --tickers "IDR=X" --labels "Rupiah per dollar" --start 2024-01-01 --end 2026-10-31 --weekly --out <proj>\assets --name rupiah
python get_market_data.py worldbank --country IDN --indicator FI.RES.TOTL.CD --start 2010 --end 2025 --out <proj>\assets --name reserves
```
It prints each series: points, first, last, % change. **Use those printed numbers in the
script** so the voice and the chart agree.

Yahoo ticker cheat sheet: index `^JKSE` (Jakarta) `^GSPC` (S&P 500) `^N225` `^HSI` `^KS11` `^TWII`;
stocks add the exchange suffix `.JK` `.T` `.HK` `.KS`; FX `IDR=X` (USD->IDR) `EURUSD=X`;
futures `GC=F` gold `CL=F` oil `NI=F` nickel. Fetch a ticker that comes back empty again on its own.
World Bank codes: `NY.GDP.MKTP.KD.ZG` GDP growth, `FI.RES.TOTL.CD` reserves, `FP.CPI.TOTL.ZG`
inflation, `GC.TAX.TOTL.GD.ZS` tax % GDP, `DT.DOD.DECT.CD` external debt.
Other free sources when needed (write the same JSON shape by hand): FRED (`fred.stlouisfed.org`
CSV download, no key), central-bank / exchange PDFs, company reports - quote the number and
print the source.

## 2. Draw it
```html
<script src="lib/d3.min.js"></script><script src="lib/fchart.js"></script>
<script src="assets/banks.js"></script>
<svg id="charts" class="clip" data-start="0" data-duration="60" viewBox="0 0 1920 1080"></svg>
<script>
const D = window.__DATA, s = (id) => D.banks.series.find(x => x.id === id);
const chart = FC.line({ svg: document.getElementById("charts"), x:150, y:290, w:1380, h:600,
  start: 19.8, end: 27.5, base: 100, yFormat: v => v.toFixed(0),
  series: [{ label:"Index", color:"#8a857b", points: s("^JKSE").points, valueLabel: v => FC.pct(v-100) },
           { label:"Mandiri", color:"#8d1b2d", width:5, points: s("BMRI.JK").points, valueLabel: v => FC.pct(v-100) }],
  annotations: [{ date:"2024-10-21", label:"Prabowo takes office", color:"#8d1b2d", side:"bottom" }] });
window.addEventListener("hf-seek", e => chart.draw(e.detail.time));
</script>
```
`start`/`end` = the voice words where the draw begins and ends (from `words.py`).
Each chart goes in its own `<g>` so you can fade the whole chart in and out between scenes.

| Chart | Use for | Key cfg |
|---|---|---|
| `FC.line` | X vs Y over time, crash vs recovery | `series[]`, `base`, `annotations[]`, `yDomain` |
| `FC.area` | one series with weight (currency, debt) | same as line, first series filled |
| `FC.bars` | compare values, gainers/losers | `items[]`, `horizontal`, `format`, `stagger` |
| `FC.stack` | ownership, splits that make 100% | `segments[{label,value,color}]` |
| `FC.gauge` | actual vs a legal minimum / target | `value`, `max`, `threshold`, `thresholdLabel` |
| `FC.donut` | share of a whole | `segments[]`, `centerLabel` |
| `FC.counter` | a big number counting up | `(el, from, to, start, end, fmt)` |

## Rules
- Real numbers only. The voice says the same number the chart shows. Round once, the same way.
- Every chart prints its source (`data.source`, e.g. "Source: Yahoo Finance") in the corner while it is on screen.
- One red. The series the story is about is red and thickest; the rest are grey/black.
- Charts draw on with the voice, never pop in finished. Keep a line draw 5-8 s; bars 0.4 s apart.
- End labels on a multi-line chart are pushed apart automatically (32 px).
- Rebase to 100 when comparing stocks of different prices; say "rebased to 100" in the kicker.
- The 1 at the end of a long fall is ugly - pick a start date that matches the story ("since Prabowo took office").

## Other tools (when FC is not enough)
- **D3 directly** (already loaded): `d3.geo*` for choropleth maps, `d3.treemap`, `d3.sankey` (add the plugin) for money flows.
- **Vega-Lite** (`vega`, `vega-lite`, `vega-embed` from npm) - JSON chart specs; render to SVG once and animate with CSS `stroke-dashoffset`.
- **Apache ECharts** - big built-in chart set (candlestick, heatmap, gauge); set `animation:false` and drive `setOption` per frame from `hf-seek`.
- **Matplotlib / Plotly** (Python) - export a still PNG/SVG for a quick card; not for draw-on motion.
- **Flourish / Datawrapper** - online, good for one-off maps/tables; export PNG and credit the data source.
Keep the HyperFrames rule for all of them: no timers, every frame a pure function of t, all data in local files.
