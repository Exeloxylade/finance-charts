#!/usr/bin/env python3
"""get_market_data.py - pull REAL market data for charts, write JSON + a JS global.

Sources (all free, no key):
  yahoo      stocks, indices, FX, commodities via yfinance  (e.g. ^JKSE, BMRI.JK, IDR=X, GC=F)
  worldbank  macro series via the World Bank API            (e.g. NY.GDP.MKTP.KD.ZG for GDP growth)

Usage:
  python get_market_data.py yahoo --tickers "^JKSE,BMRI.JK,BBCA.JK" --start 2024-09-30 \
      --end 2026-10-31 --rebase 100 --out <proj>/assets --name banks
  python get_market_data.py worldbank --country IDN --indicator FI.RES.TOTL.CD \
      --start 2015 --end 2025 --out <proj>/assets --name reserves

Output: <name>.json and <name>.js (window.__DATA["<name>"] = {...}) so a HyperFrames page
can load it with <script src="assets/<name>.js"> (no fetch at render time).
Shape:  {"source": "...", "series": [{"id","label","points":[["2024-09-30", 100.0], ...],
         "first","last","change_pct","min","max"}]}
--rebase N : divide each series by its first value and multiply by N (compare shapes).
--weekly   : keep one point per week (smaller, smoother lines for a 30 s shot).
The 'source' string is what you print on screen: e.g. "Source: Yahoo Finance".
"""
import argparse, json, os, sys, time, urllib.request


def write(out, name, data):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f)
    with open(os.path.join(out, name + ".js"), "w", encoding="utf-8") as f:
        f.write("window.__DATA = window.__DATA || {};\nwindow.__DATA[%s] = %s;\n"
                % (json.dumps(name), json.dumps(data)))


def summarise(sid, label, pts):
    vals = [v for _, v in pts]
    first, last = vals[0], vals[-1]
    return {"id": sid, "label": label, "points": pts, "first": round(first, 4),
            "last": round(last, 4), "change_pct": round((last / first - 1) * 100, 2),
            "min": round(min(vals), 4), "max": round(max(vals), 4)}


def yahoo(a):
    import yfinance as yf
    tickers = [t.strip() for t in a.tickers.split(",") if t.strip()]
    labels = [l.strip() for l in a.labels.split(",")] if a.labels else tickers
    df = yf.download(tickers, start=a.start, end=a.end, interval="1wk" if a.weekly else "1d",
                     auto_adjust=True, progress=False, group_by="ticker")
    out = []
    for i, t in enumerate(tickers):
        try:
            col = df[t]["Close"]          # MultiIndex (ticker, field) - yfinance with group_by
        except KeyError:
            col = df["Close"]
        if hasattr(col, "columns"):       # still a frame -> take the first column
            col = col.iloc[:, 0]
        col = col.dropna()
        if col.empty:
            print("  no data for", t, file=sys.stderr); continue
        base = float(col.iloc[0])
        pts = []
        for idx, v in col.items():
            v = float(v)
            if a.rebase:
                v = v / base * a.rebase
            pts.append([idx.strftime("%Y-%m-%d"), round(v, 4)])
        out.append(summarise(t, labels[i] if i < len(labels) else t, pts))
    return {"source": "Source: Yahoo Finance", "kind": "yahoo", "start": a.start,
            "end": a.end, "rebased": a.rebase, "series": out}


def _wb_get(iso, a):
    # One country per request: multi-country and per_page queries often time out / 502.
    url = ("https://api.worldbank.org/v2/country/%s/indicator/%s?format=json&date=%s:%s"
           % (iso, a.indicator, a.start, a.end))
    req = urllib.request.Request(url, headers={"User-Agent": "finance-charts/1.0"})
    for attempt in range(6):
        try:
            j = json.loads(urllib.request.urlopen(req, timeout=30).read())
            return [r for r in ((j[1] if len(j) > 1 else None) or []) if r.get("value") is not None]
        except Exception as e:
            if attempt == 5:
                print("  FAILED", iso, e, file=sys.stderr)
                return []
            print("  retry", iso, attempt + 1, e, file=sys.stderr)
            time.sleep(2 * (attempt + 1))


def worldbank(a):
    rows = []
    for iso in [c.strip() for c in a.country.split(";") if c.strip()]:
        rows += _wb_get(iso, a)
    rows.sort(key=lambda r: r["date"])
    # --country "IDN;MYS;CHN" -> one series per country (id = ISO3), dates as YYYY-01-01
    # so FC.line can parse them.
    by = {}
    for r in rows:
        iso = r.get("countryiso3code") or r["country"]["id"]
        by.setdefault(iso, {"name": r["country"]["value"], "pts": []})["pts"].append(
            [r["date"] + "-01-01", float(r["value"])])
    order = [c.strip().upper() for c in a.country.split(";")]
    series = [summarise(iso, by[iso]["name"], by[iso]["pts"]) for iso in order if iso in by]
    ind = rows[0]["indicator"]["value"] if rows else a.indicator
    return {"source": "Source: World Bank", "kind": "worldbank", "indicator": ind, "series": series}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["yahoo", "worldbank"])
    ap.add_argument("--tickers"); ap.add_argument("--labels")
    ap.add_argument("--country"); ap.add_argument("--indicator")
    ap.add_argument("--start", required=True); ap.add_argument("--end", required=True)
    ap.add_argument("--rebase", type=float, default=None)
    ap.add_argument("--weekly", action="store_true")
    ap.add_argument("--out", required=True); ap.add_argument("--name", required=True)
    a = ap.parse_args()
    data = yahoo(a) if a.kind == "yahoo" else worldbank(a)
    write(a.out, a.name, data)
    for s in data["series"]:
        print("  %-10s %-26s %4d pts  first %-10s last %-10s change %+.1f%%"
              % (s["id"], s["label"][:26], len(s["points"]), s["first"], s["last"], s["change_pct"]))
    print("  wrote", os.path.join(a.out, a.name + ".js"), "|", data["source"])


if __name__ == "__main__":
    main()
