/* fchart.js - animated finance charts for HyperFrames, built on D3 v7.
 * Every chart is a pure function of time t: build once, then call .draw(t) from hf-seek.
 * No d3 transitions, no timers - the draw-on comes from the voice clock.
 *
 *   <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
 *   <script src="lib/fchart.js"></script>
 *   <script src="assets/banks.js"></script>        // window.__DATA.banks from get_market_data.py
 *
 * Charts (all take a target <svg> and a box {x,y,w,h} in px):
 *   FC.line    multi-series time line, draws left->right, end dot + value label, annotations
 *   FC.area    same as line with a filled area under the first series
 *   FC.bars    vertical or horizontal bars that grow, value labels count up
 *   FC.stack   one 100% stacked bar that fills segment by segment (ownership, splits)
 *   FC.gauge   a bar against a threshold marker (capital vs legal minimum, target vs actual)
 *   FC.donut   arcs that sweep in (shares of a whole)
 *   FC.counter a DOM number that counts up
 * Helpers: FC.theme (colours), FC.ease, FC.ramp, FC.pct, FC.money, FC.num
 */
(function () {
  const FC = {};
  FC.theme = { bg: "#f3f1ec", ink: "#141414", sub: "#6b6b6b", grid: "#d9d4ca",
               accent: "#8d1b2d", accentText: "#a8203a", muted: "#9c968b", font: "Inter, Segoe UI, Arial, sans-serif" };
  FC.ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  FC.ramp = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : FC.ease((t - a) / (b - a)));
  FC.pct = (v, d = 1) => (v > 0 ? "+" : "") + v.toFixed(d) + "%";
  FC.num = (v, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  FC.money = (v, unit = "bn", d = 0) => "$" + FC.num(v, d) + unit;
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const txt = (s, attrs, parent) => { const e = mk("text", attrs, parent); e.textContent = s; return e; };
  const parse = d3.timeParse("%Y-%m-%d");

  /* ---------------- line / area ----------------
   cfg: { svg, x,y,w,h, series:[{label, color, width, points:[[date,val],...], valueLabel(v,s)}],
          start, end (draw-on seconds), yDomain?, yTicks=4, yFormat(v), xTicks=4, xFormat,
          base: value drawn as a dashed reference line (e.g. 100 for rebased series),
          annotations: [{date, label, color, side:'top'|'bottom'}], endLabels=true, area=false } */
  FC.line = function (cfg) {
    const T = Object.assign({}, FC.theme, cfg.theme || {});
    const g = mk("g", { "font-family": T.font }, cfg.svg);
    const S = cfg.series.map((s) => ({ ...s, pts: s.points.map(([d, v]) => [parse(d), +v]) }));
    const all = S.flatMap((s) => s.pts);
    const x = d3.scaleTime().domain(d3.extent(all, (p) => p[0])).range([cfg.x, cfg.x + cfg.w]);
    const yd = cfg.yDomain || d3.extent(all, (p) => p[1]);
    const pad = (yd[1] - yd[0]) * (cfg.pad == null ? 0.08 : cfg.pad);
    const y = d3.scaleLinear().domain([yd[0] - pad, yd[1] + pad]); if (cfg.pad !== 0) y.nice(cfg.yTicks || 4); y.range([cfg.y + cfg.h, cfg.y]);
    const yFmt = cfg.yFormat || ((v) => FC.num(v));
    // grid + y labels
    const axis = mk("g", {}, g);
    const AS = cfg.axisSize || 20;
    (cfg.yTickValues || y.ticks(cfg.yTicks || 4)).forEach((v) => {
      mk("line", { x1: cfg.x, x2: cfg.x + cfg.w, y1: y(v), y2: y(v), stroke: T.grid, "stroke-width": 1 }, axis);
      txt(yFmt(v), { x: cfg.x - (cfg.yLabelGap || 14), y: y(v) + AS * 0.35, "text-anchor": "end", fill: T.sub, "font-size": AS }, axis);
    });
    if (cfg.baseline) mk("line", { x1: cfg.x, x2: cfg.x + cfg.w, y1: cfg.y + cfg.h + (cfg.baselineDy || 0), y2: cfg.y + cfg.h + (cfg.baselineDy || 0), stroke: T.sub, "stroke-width": 2 }, axis);
    const xFmt = cfg.xFormat || d3.timeFormat("%b %Y");
    const xTV = cfg.xTickValues ? cfg.xTickValues.map(([d, l]) => [parse(d), l]) : x.ticks(cfg.xTicks || 4).map((d) => [d, xFmt(d)]);
    xTV.forEach(([d, l]) => {
      txt(l, { x: x(d), y: cfg.y + cfg.h + (cfg.xLabelDy || 34), "text-anchor": "middle", fill: T.xInk || T.sub, "font-size": AS }, axis);
    });
    if (cfg.base != null)
      mk("line", { x1: cfg.x, x2: cfg.x + cfg.w, y1: y(cfg.base), y2: y(cfg.base), stroke: T.sub,
                   "stroke-width": 1.5, "stroke-dasharray": "6 6" }, axis);
    // annotations (vertical marker + chip), shown when the draw passes the date
    const ann = (cfg.annotations || []).map((a) => {
      const ax = x(parse(a.date)), ag = mk("g", { opacity: 0 }, g);
      mk("line", { x1: ax, x2: ax, y1: cfg.y, y2: cfg.y + cfg.h, stroke: a.color || T.ink,
                   "stroke-width": 2, "stroke-dasharray": "4 6" }, ag);
      const ty = a.side === "bottom" ? cfg.y + cfg.h - 20 : cfg.y + 10;
      const label = txt(a.label, { x: ax + 12, y: ty + 24, fill: "#fff", "font-size": 20, "font-weight": 800 }, null);
      const bg = mk("rect", { x: ax + 4, y: ty, height: 34, rx: 3, fill: a.color || T.ink }, ag);
      ag.appendChild(label);
      return { a, ag, bg, label, d: parse(a.date) };
    });
    // series
    // cfg.curve: "smooth" (default) | "linear" (raw daily jaggedness, reads as real data)
    const crv = cfg.curve === "linear" ? d3.curveLinear : d3.curveMonotoneX;
    const lineGen = d3.line().x((p) => x(p[0])).y((p) => y(p[1])).curve(crv);
    const areaGen = d3.area().x((p) => x(p[0])).y0(cfg.y + cfg.h).y1((p) => y(p[1])).curve(crv);
    // draw order: series with a later start sit on top only if listed later; put the hero last.
    const drawn = S.map((s, i) => {
      const area = cfg.area && i === 0 ? mk("path", { fill: s.color, opacity: 0.12 }, g) : null;
      const path = mk("path", { fill: "none", stroke: s.color, "stroke-width": s.width || 4,
                                "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
      // cfg.marker: "dot" (default, filled) | "ring" (hollow circle on the paper colour)
      const ring = cfg.marker === "ring";
      const dot = mk("circle", { r: ring ? 9 : 7, fill: ring ? T.bg : s.color, stroke: s.color,
                                 "stroke-width": ring ? 3.5 : 0, opacity: 0 }, g);
      const lab = txt("", { fill: s.color, "font-size": cfg.labelSize || 24, "font-weight": 800, opacity: 0 }, g);
      return { s, area, path, dot, lab };
    });
    const x0 = x.domain()[0].getTime(), x1 = x.domain()[1].getTime();
    return { x, y, draw(t) {
      const p = FC.ramp(t, cfg.start, cfg.end);
      let cut = x0 + (x1 - x0) * p;
      axis.setAttribute("opacity", FC.ramp(t, cfg.start - 0.6, cfg.start).toFixed(3));
      drawn.forEach((D) => {
        // a series may have its own start/end (e.g. the index line arrives later)
        const ps = D.s.start != null ? FC.ramp(t, D.s.start, D.s.end) : p;
        cut = x0 + (x1 - x0) * ps;
        if (ps <= 0) { D.path.setAttribute("d", ""); D.dot.setAttribute("opacity", 0);
          D.lab.setAttribute("opacity", 0); if (D.area) D.area.setAttribute("d", ""); return; }
        const pts = [];
        for (let k = 0; k < D.s.pts.length; k++) {
          const q = D.s.pts[k];
          if (q[0].getTime() <= cut) { pts.push(q); continue; }
          const prev = D.s.pts[k - 1];
          if (prev) { const f = (cut - prev[0].getTime()) / (q[0].getTime() - prev[0].getTime());
            pts.push([new Date(cut), prev[1] + (q[1] - prev[1]) * f]); }
          break;
        }
        if (pts.length < 2) { D.path.setAttribute("d", ""); D.dot.setAttribute("opacity", 0);
          D.lab.setAttribute("opacity", 0); if (D.area) D.area.setAttribute("d", ""); return; }
        D.path.setAttribute("d", lineGen(pts));
        if (D.area) D.area.setAttribute("d", areaGen(pts));
        const h = pts[pts.length - 1], hx = x(h[0]), hy = y(h[1]);
        D.dot.setAttribute("cx", hx); D.dot.setAttribute("cy", hy); D.dot.setAttribute("opacity", 1);
        if (cfg.endLabels !== false) {
          const vl = D.s.valueLabel ? D.s.valueLabel(h[1], D.s) : yFmt(h[1]);
          D.lab.textContent = (D.s.label ? D.s.label + " " : "") + vl;
          D.lab.setAttribute("x", hx + (cfg.labelDx || 14)); D.lab.setAttribute("y", hy + 8 + (D.s.labelDy || 0));
          // cfg.labelAtEnd: show the label only once the line is fully drawn (cleaner, no moving text)
          const s0 = D.s.start != null ? D.s.start : cfg.start, e0 = D.s.end != null ? D.s.end : cfg.end;
          D.lab.setAttribute("opacity", (cfg.labelAtEnd ? FC.ramp(t, e0, e0 + 0.35)
                                                         : FC.ramp(t, s0 + 0.3, s0 + 0.8)).toFixed(3));
        }
      });
      // keep end labels apart: sort by y, push down any label closer than 32px to the one above
      const labs = drawn.filter((D) => D.lab.getAttribute("opacity") !== "0" && D.lab.textContent)
        .map((D) => ({ D, y: +D.lab.getAttribute("y") })).sort((a, b) => a.y - b.y);
      for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < (cfg.labelGap || 32)) labs[k].y = labs[k - 1].y + (cfg.labelGap || 32);
      labs.forEach((L) => L.D.lab.setAttribute("y", L.y.toFixed(1)));
      ann.forEach((A) => {
        const on = cut >= A.d.getTime() ? 1 : 0;
        A.ag.setAttribute("opacity", on);
        if (on) { const bb = A.label.getBBox(); A.bg.setAttribute("width", bb.width + 16); }
      });
    } };
  };
  FC.area = (cfg) => FC.line(Object.assign({}, cfg, { area: true }));

  /* ---------------- bars ----------------
   cfg: { svg, x,y,w,h, items:[{label, value, color}], horizontal=false, start, stagger=0.35,
          span=0.8, format(v), max?, zero line for negatives handled } */
  FC.bars = function (cfg) {
    const T = Object.assign({}, FC.theme, cfg.theme || {});
    const g = mk("g", { "font-family": T.font }, cfg.svg);
    const vals = cfg.items.map((i) => i.value);
    const lo = Math.min(0, d3.min(vals)), hi = Math.max(0, d3.max(vals));
    const fmt = cfg.format || ((v) => FC.num(v, 1));
    const H = !!cfg.horizontal;
    const band = d3.scaleBand().domain(cfg.items.map((_, i) => i)).padding(0.32)
      .range(H ? [cfg.y, cfg.y + cfg.h] : [cfg.x, cfg.x + cfg.w]);
    const v = d3.scaleLinear().domain([lo, hi]).nice()
      .range(H ? [cfg.x + (cfg.labelW || 220), cfg.x + cfg.w - 140] : [cfg.y + cfg.h, cfg.y + 40]);
    const zero = v(0);
    mk("line", H ? { x1: zero, x2: zero, y1: cfg.y, y2: cfg.y + cfg.h, stroke: T.sub, "stroke-width": 2 }
                 : { x1: cfg.x, x2: cfg.x + cfg.w, y1: zero, y2: zero, stroke: T.sub, "stroke-width": 2 }, g);
    const bars = cfg.items.map((it, i) => {
      const r = mk("rect", { fill: it.color || T.accent, rx: 2 }, g);
      const vl = txt("", { fill: T.ink, "font-size": 28, "font-weight": 800 }, g);
      const nl = txt(it.label, H ? { x: cfg.x, y: band(i) + band.bandwidth() / 2 + 9, fill: T.ink, "font-size": 26, "font-weight": 700 }
                                 : { x: band(i) + band.bandwidth() / 2, y: cfg.y + cfg.h + 36, "text-anchor": "middle", fill: T.sub, "font-size": 22 }, g);
      return { it, r, vl, nl };
    });
    return { draw(t) {
      bars.forEach((B, i) => {
        const s0 = cfg.start + i * (cfg.stagger == null ? 0.35 : cfg.stagger);
        const p = FC.ramp(t, s0, s0 + (cfg.span || 0.8));
        const cur = B.it.value * p, end = v(cur);
        B.nl.setAttribute("opacity", FC.ramp(t, s0 - 0.3, s0).toFixed(3));
        if (H) { const a = Math.min(zero, end), w = Math.abs(end - zero);
          B.r.setAttribute("x", a); B.r.setAttribute("width", w);
          B.r.setAttribute("y", band(i)); B.r.setAttribute("height", band.bandwidth());
          B.vl.setAttribute("x", cur < 0 ? a - 12 : a + w + 12); B.vl.setAttribute("text-anchor", cur < 0 ? "end" : "start");
          B.vl.setAttribute("y", band(i) + band.bandwidth() / 2 + 10);
        } else { const a = Math.min(zero, end), hh = Math.abs(end - zero);
          B.r.setAttribute("y", a); B.r.setAttribute("height", hh);
          B.r.setAttribute("x", band(i)); B.r.setAttribute("width", band.bandwidth());
          B.vl.setAttribute("x", band(i) + band.bandwidth() / 2); B.vl.setAttribute("text-anchor", "middle");
          B.vl.setAttribute("y", cur < 0 ? a + hh + 34 : a - 12);
        }
        B.vl.textContent = p > 0.02 ? fmt(cur) : "";
      });
    } };
  };

  /* ---------------- stacked 100% bar ----------------
   cfg: { svg, x,y,w,h, segments:[{label, value, color, note}], start, stagger=0.6 } */
  FC.stack = function (cfg) {
    const T = Object.assign({}, FC.theme, cfg.theme || {});
    const g = mk("g", { "font-family": T.font }, cfg.svg);
    const total = d3.sum(cfg.segments, (s) => s.value);
    let acc = 0;
    const segs = cfg.segments.map((s) => {
      const x0 = cfg.x + (acc / total) * cfg.w; acc += s.value;
      const x1 = cfg.x + (acc / total) * cfg.w;
      const r = mk("rect", { x: x0, y: cfg.y, height: cfg.h, width: 0, fill: s.color || T.muted }, g);
      const l1 = txt(s.value + "%", { x: x0 + 16, y: cfg.y + cfg.h / 2 + 4, fill: "#fff", "font-size": 34, "font-weight": 800, opacity: 0 }, g);
      const l2 = txt(s.label, { x: x0 + 16, y: cfg.y + cfg.h / 2 + 34, fill: "#fff", "font-size": 18, opacity: 0 }, g);
      return { s, x0, x1, r, l1, l2 };
    });
    return { draw(t) {
      segs.forEach((S, i) => {
        const s0 = cfg.start + i * (cfg.stagger || 0.6), p = FC.ramp(t, s0, s0 + 0.6);
        S.r.setAttribute("width", ((S.x1 - S.x0) * p).toFixed(1));
        const o = FC.ramp(t, s0 + 0.4, s0 + 0.8).toFixed(3);
        S.l1.setAttribute("opacity", o); S.l2.setAttribute("opacity", o);
      });
    } };
  };

  /* ---------------- gauge (bar vs threshold) ----------------
   cfg: { svg, x,y,w,h, value, max, threshold, valueLabel, thresholdLabel, start } */
  FC.gauge = function (cfg) {
    const T = Object.assign({}, FC.theme, cfg.theme || {});
    const g = mk("g", { "font-family": T.font }, cfg.svg);
    const sx = d3.scaleLinear().domain([0, cfg.max]).range([cfg.x, cfg.x + cfg.w]);
    mk("rect", { x: cfg.x, y: cfg.y, width: cfg.w, height: cfg.h, fill: T.grid }, g);
    const bar = mk("rect", { x: cfg.x, y: cfg.y, height: cfg.h, width: 0, fill: T.muted }, g);
    const room = mk("rect", { y: cfg.y, height: cfg.h, width: 0, fill: T.accent, opacity: 0.85 }, g);
    const tx = sx(cfg.threshold);
    const mark = mk("line", { x1: tx, x2: tx, y1: cfg.y - 30, y2: cfg.y + cfg.h + 30, stroke: T.accent, "stroke-width": 4, opacity: 0 }, g);
    const ml = txt(cfg.thresholdLabel || "", { x: tx, y: cfg.y - 42, "text-anchor": "middle", fill: T.accentText, "font-size": 24, "font-weight": 800, opacity: 0 }, g);
    const vl = txt("", { y: cfg.y + cfg.h / 2 + 10, fill: T.ink, "font-size": 30, "font-weight": 800 }, g);
    return { draw(t) {
      const p = FC.ramp(t, cfg.start, cfg.start + 1.2), cur = cfg.value * p, cx = sx(cur);
      bar.setAttribute("width", (cx - cfg.x).toFixed(1));
      const mo = FC.ramp(t, cfg.start + 1.0, cfg.start + 1.4);
      mark.setAttribute("opacity", mo); ml.setAttribute("opacity", mo);
      const ro = FC.ramp(t, cfg.start + 1.6, cfg.start + 2.2);
      room.setAttribute("x", tx); room.setAttribute("width", Math.max(0, (cx - tx) * ro).toFixed(1));
      vl.setAttribute("x", cx + 14); vl.textContent = p > 0.02 ? (cfg.valueLabel ? cfg.valueLabel(cur) : FC.num(cur, 2)) : "";
    } };
  };

  /* ---------------- donut ----------------
   cfg: { svg, cx, cy, r, inner, segments:[{label, value, color}], start, span=1.4, centerLabel } */
  FC.donut = function (cfg) {
    const T = Object.assign({}, FC.theme, cfg.theme || {});
    const g = mk("g", { "font-family": T.font, transform: `translate(${cfg.cx},${cfg.cy})` }, cfg.svg);
    const pie = d3.pie().sort(null).value((d) => d.value)(cfg.segments);
    const arc = d3.arc().innerRadius(cfg.inner || cfg.r * 0.62).outerRadius(cfg.r);
    const paths = pie.map((a) => ({ a, p: mk("path", { fill: a.data.color || T.accent }, g) }));
    const c = txt(cfg.centerLabel || "", { "text-anchor": "middle", y: 14, fill: T.ink, "font-size": 44, "font-weight": 800 }, g);
    return { draw(t) {
      const p = FC.ramp(t, cfg.start, cfg.start + (cfg.span || 1.4)), lim = p * Math.PI * 2;
      paths.forEach(({ a, p: el }) => {
        const e = Math.min(a.endAngle, lim);
        el.setAttribute("d", e > a.startAngle ? arc({ ...a, endAngle: e }) : "");
      });
      c.setAttribute("opacity", FC.ramp(t, cfg.start + 0.8, cfg.start + 1.2));
    } };
  };

  /* ---------------- counter ---------------- */
  FC.counter = function (el, from, to, start, end, fmt) {
    return { draw(t) { const p = FC.ramp(t, start, end); el.textContent = (fmt || FC.num)(from + (to - from) * p); } };
  };

  window.FC = FC;
})();
