const $ = id => document.getElementById(id);
const num = n => new Intl.NumberFormat().format(n);
const TAG_LABEL = { funny: "😂 Funny", hype: "🔥 Hype", shock: "😳 Shock", sad: "😭 Sad", spike: "📈 Spike" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMOTE_URL = { t: id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`, "7": id => `https://cdn.7tv.app/emote/${id}/2x.webp` };
const NS = "http://www.w3.org/2000/svg";
const VIEWER_KEYS = ["avg_viewers", "peak_viewers", "cat_top_pct", "followers_gained"];
const ordinal = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
const hourLabel = h => `${(h % 12) || 12}${h < 12 ? "am" : "pm"}`;
const shortDate = d => new Date(d).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });

function fmtMetric(key, v) {
  if (v === null || v === undefined) return "—";
  if (key === "cat_top_pct") return `Top ${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
  if (key === "return_rate") return `${Math.round(v)}%`;
  if (key === "hours") return `${v.toFixed(1)}h`;
  if (key === "avg_viewers" || key === "mpm") return (+v).toFixed(1);
  if (key === "followers_gained") return (v > 0 ? "+" : "") + num(Math.round(v));
  return num(Math.round(v));
}

// ---------- tooltip ----------
const tip = $("tip");
document.addEventListener("pointermove", e => {
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (!el) return (tip.hidden = true);
  tip.innerHTML = el.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, e.clientX + 12)) + "px";
  tip.style.top = Math.max(8, e.clientY - r.height - 12) + "px";
});

// ---------- tabs ----------
const renderers = {};
let current = "overview";
function showTab(name) {
  if (!document.querySelector(`.tab[data-tab="${name}"]`)) name = "overview";
  current = name;
  document.querySelectorAll(".tab").forEach(t => (t.hidden = t.dataset.tab !== name));
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  (renderers[name] || []).forEach(fn => fn());
}
$("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (location.hash.slice(1) === b.dataset.tab) showTab(b.dataset.tab);
  else location.hash = b.dataset.tab;
});
let rz;
addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => (renderers[current] || []).forEach(fn => fn()), 150); });
const onTab = (name, fn) => (renderers[name] = renderers[name] || []).push(fn);

// ---------- svg helpers ----------
function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}
function niceMax(v) {
  if (v <= 0) return 4;
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(c => m <= c) * p;
  return step * 4;
}
function frame(el, { left = 40, right = 10, top = 10, bottom = 26 } = {}) {
  el.innerHTML = "";
  const W = el.clientWidth || 600, H = el.clientHeight || 200;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, el);
  return { svg, W, H, x0: left, x1: W - right, y0: top, y1: H - bottom };
}
function yAxis(f, max, fmt = v => num(v), invert = false) {
  const g = svgEl("g", { class: "grid" }, f.svg), a = svgEl("g", { class: "axis" }, f.svg);
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, y = invert ? f.y0 + (f.y1 - f.y0) * i / 4 : f.y1 - (f.y1 - f.y0) * i / 4;
    svgEl("line", { x1: f.x0, x2: f.x1, y1: y, y2: y }, g);
    svgEl("text", { x: f.x0 - 6, y: y + 4, "text-anchor": "end" }, a).textContent = fmt(invert ? Math.max(1, Math.round(v)) : v);
  }
}
const empty = (el, msg) => { el.innerHTML = `<div class="chart-empty">${msg}</div>`; };

// trend: one bar per stream + 5-stream rolling average line
function trendChart(el, rows, key, label) {
  const vals = rows.map(r => r[key]);
  if (!vals.some(v => v !== null && v !== undefined)) {
    return empty(el, VIEWER_KEYS.includes(key) ? "No viewer data yet. It's recorded live from your next stream." : "Not enough data yet.");
  }
  const f = frame(el), n = rows.length, max = niceMax(Math.max(...vals.filter(v => v != null)) * 1.05);
  const fmtAxis = key === "cat_top_pct" || key === "return_rate" ? v => Math.round(v) + "%" : v => (v < 10 && v % 1 ? v.toFixed(1) : num(Math.round(v)));
  yAxis(f, max, fmtAxis);
  const bw = (f.x1 - f.x0) / n, y = v => f.y1 - (f.y1 - f.y0) * v / max, ax = svgEl("g", { class: "axis" }, f.svg);
  const every = Math.ceil(n / Math.max(1, Math.floor((f.x1 - f.x0) / 46)));
  const roll = vals.map((_, i) => { const w = vals.slice(Math.max(0, i - 4), i + 1).filter(v => v != null); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; });
  rows.forEach((r, i) => {
    const cx = f.x0 + bw * i, v = vals[i], w = Math.max(2, Math.min(28, bw - 4));
    if (v != null) svgEl("rect", { class: "bar", x: cx + (bw - w) / 2, y: y(v), width: w, height: Math.max(1, f.y1 - y(v)), rx: Math.min(4, w / 2) }, f.svg);
    if (i % every === 0 || i === n - 1) svgEl("text", { x: cx + bw / 2, y: f.y1 + 16, "text-anchor": "middle" }, ax).textContent = shortDate(r.date);
    svgEl("rect", { class: "hit", x: cx, y: f.y0, width: bw, height: f.y1 - f.y0,
      "data-tip": `<b>${esc(r.title)}</b>${new Date(r.date).toLocaleDateString()}<br>${esc(label)}: ${fmtMetric(key, v)}${roll[i] != null ? `<br>5-stream avg: ${fmtMetric(key, roll[i])}` : ""}` }, f.svg);
  });
  const pts = roll.map((v, i) => v == null || vals[i] == null ? null : [f.x0 + bw * (i + .5), y(v)]).filter(Boolean);
  if (pts.length > 1) svgEl("path", { class: "avg", d: "M" + pts.map(p => p.join(",")).join(" L") }, f.svg);
}

// time series within one stream (x = minutes)
function timeChart(el, pts, { xmax, kind = "area", invert = false, markers = [], fmtY = v => num(Math.round(v)), tipFn, ymax }) {
  if (!pts.length) return false;
  const f = frame(el, { left: 40, bottom: 24 });
  const max = ymax || niceMax(Math.max(...pts.map(p => p[1])) * (invert ? 1 : 1.08));
  yAxis(f, max, fmtY, invert);
  const x = m => f.x0 + (f.x1 - f.x0) * Math.min(1, m / xmax);
  const y = v => invert ? f.y0 + (f.y1 - f.y0) * (v - 1) / Math.max(1, max - 1) : f.y1 - (f.y1 - f.y0) * v / max;
  const ax = svgEl("g", { class: "axis" }, f.svg), step = xmax > 300 ? 60 : 30;
  for (let m = 0; m <= xmax; m += step) svgEl("text", { x: x(m), y: f.y1 + 16, "text-anchor": "middle" }, ax).textContent = fmtTime(m * 60).replace(/:00$/, "");
  markers.forEach(([m, label]) => {
    if (m <= 0) return;
    svgEl("line", { class: "mark", x1: x(m), x2: x(m), y1: f.y0, y2: f.y1 }, f.svg);
    svgEl("text", { class: "mark-label", x: x(m) + 4, y: f.y0 + 10 }, f.svg).textContent = label;
  });
  if (kind === "bars") {
    const bw = Math.max(1, (f.x1 - f.x0) / (xmax / (pts[1] ? pts[1][0] - pts[0][0] : 1)) - 1);
    pts.forEach(([m, v]) => svgEl("rect", { class: "bar", x: x(m), y: y(v), width: bw, height: Math.max(0, f.y1 - y(v)) }, f.svg));
  } else {
    const d = pts.map(([m, v]) => `${x(m)},${y(v)}`).join(" L");
    if (kind === "area") svgEl("path", { class: "area", d: `M${x(pts[0][0])},${f.y1} L${d} L${x(pts[pts.length - 1][0])},${f.y1} Z` }, f.svg);
    svgEl("path", { class: "rankline", d: "M" + d }, f.svg);
    pts.forEach(([m, v]) => svgEl("circle", { class: "dot", cx: x(m), cy: y(v), r: pts.length > 40 ? 2 : 3.5 }, f.svg));
  }
  const slices = Math.min(120, Math.max(20, Math.floor((f.x1 - f.x0) / 6)));
  for (let i = 0; i < slices; i++) {
    const m = xmax * (i + .5) / slices;
    const near = pts.reduce((a, p) => Math.abs(p[0] - m) < Math.abs(a[0] - m) ? p : a);
    svgEl("rect", { class: "hit", x: f.x0 + (f.x1 - f.x0) * i / slices, y: f.y0, width: (f.x1 - f.x0) / slices + .5, height: f.y1 - f.y0,
      "data-tip": tipFn(near) }, f.svg);
  }
  return true;
}

// value over calendar days (y axis not forced to zero, so small growth is visible)
function dateLine(el, pts, fmtTip) {
  if (pts.length < 2) return false;
  const f = frame(el, { left: 48, bottom: 24 });
  const t = pts.map(p => new Date(p[0] + "T12:00:00").getTime()), vals = pts.map(p => p[1]);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const step = Math.max(1, niceMax(Math.max(4, (vmax - vmin) * 1.2)) / 4);
  const lo = Math.max(0, Math.floor(vmin / step) * step), hi = lo + step * Math.max(4, Math.ceil((vmax - lo) / step));
  const x = v => f.x0 + (f.x1 - f.x0) * (v - t[0]) / ((t[t.length - 1] - t[0]) || 1), y = v => f.y1 - (f.y1 - f.y0) * (v - lo) / (hi - lo);
  const g = svgEl("g", { class: "grid" }, f.svg), a = svgEl("g", { class: "axis" }, f.svg);
  for (let i = 0; i <= 4; i++) { const v = lo + step * i; svgEl("line", { x1: f.x0, x2: f.x1, y1: y(v), y2: y(v) }, g); svgEl("text", { x: f.x0 - 6, y: y(v) + 4, "text-anchor": "end" }, a).textContent = num(v); }
  const every = Math.ceil(pts.length / Math.max(1, Math.floor((f.x1 - f.x0) / 60)));
  pts.forEach((p, i) => { if (i % every === 0 || i === pts.length - 1) svgEl("text", { x: x(t[i]), y: f.y1 + 16, "text-anchor": "middle" }, a).textContent = shortDate(p[0] + "T12:00:00"); });
  svgEl("path", { class: "area", d: `M${x(t[0])},${f.y1} L${pts.map((p, i) => `${x(t[i])},${y(p[1])}`).join(" L")} L${x(t[t.length - 1])},${f.y1} Z` }, f.svg);
  svgEl("path", { class: "rankline", d: "M" + pts.map((p, i) => `${x(t[i])},${y(p[1])}`).join(" L") }, f.svg);
  pts.forEach((p, i) => {
    svgEl("circle", { class: "dot", cx: x(t[i]), cy: y(p[1]), r: pts.length > 40 ? 2 : 3.5 }, f.svg);
    const w = (f.x1 - f.x0) / pts.length;
    svgEl("rect", { class: "hit", x: x(t[i]) - w / 2, y: f.y0, width: w, height: f.y1 - f.y0, "data-tip": fmtTip(p, pts[i - 1]) }, f.svg);
  });
  return true;
}

function vbars(el, items, { label, segs, tipFor }) {
  const max = Math.max(1e-9, ...items.map(i => segs(i).reduce((a, s) => a + s.v, 0)));
  el.innerHTML = items.map(i => `<div class="vcol" data-tip="${esc(tipFor(i))}">${segs(i).map(s =>
    `<div class="seg ${s.cls || ""}" style="height:${(s.v / max) * 100}%"></div>`).join("")}</div>`).join("");
  if (el.nextElementSibling && el.nextElementSibling.classList.contains("xlabels")) el.nextElementSibling.remove();
  el.insertAdjacentHTML("afterend", `<div class="xlabels">${items.map(i => `<span>${esc(label(i))}</span>`).join("")}</div>`);
}
function emptyBlock(el, msg = "Not enough data yet.") { el.outerHTML = `<p class="empty-note">${msg}</p>`; }

// ---------- main ----------
(async () => {
  const [s, vods] = await Promise.all([fetch("data/stats.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null), loadVods()]);
  $("stats").classList.remove("is-loading");
  if (!s || !s.streams.length) {
    $("stats").innerHTML = `<div class="empty-state"><div class="empty-icon" style="font-size:40px">📊</div><h2>No stats yet</h2><p>Stats appear after your first stream is saved.</p></div>`;
    return;
  }
  const ins = s.insights || {};
  const byId = Object.fromEntries(vods.map(v => [v.id, v]));
  const metrics = ins.metrics || [];

  // monitor notice
  const mon = ins.monitor || {};
  const note = $("monitor-note");
  if (!mon.live_streams) {
    note.innerHTML = "<b>Viewer &amp; category tracking is on.</b> It records while you're live, so viewer counts, category rank and channels your size show up after your next stream. The best-time heatmap fills in over the next couple of weeks.";
    note.hidden = false;
  } else if (mon.linked < s.streams.length) {
    note.innerHTML = `Viewer tracking started ${new Date(mon.since).toLocaleDateString()}. Earlier streams have chat stats only.`;
    note.hidden = false;
  }

  // ===== OVERVIEW =====
  const rep = ins.report;
  if (rep) {
    $("report-title").textContent = `Last stream: ${rep.title}`;
    $("report-date").textContent = fmtDate(rep.date);
    const rows = Object.fromEntries(rep.metrics.map(m => [m.key, m]));
    $("report").innerHTML = metrics.map(({ key, label, higher }) => {
      const m = rows[key];
      if (!m) {
        const why = key === "followers_gained" && !ins.followers ? "Needs the Twitch follower sign-in" : VIEWER_KEYS.includes(key) ? "Recorded from your next stream" : "—";
        return `<div class="rc missing"><span class="k">${esc(label)}</span><span class="v">${why}</span></div>`;
      }
      let delta = "";
      if (m.delta_pct !== null && m.baseline_n) {
        const up = m.delta_pct > 0, flat = Math.abs(m.delta_pct) < 2 || higher === null;
        const good = higher === null ? null : (up === higher);
        delta = `<span class="d ${flat ? "flat" : good ? "good" : "bad"}">${flat ? "≈" : up ? "▲" : "▼"} ${Math.abs(m.delta_pct).toFixed(0)}% vs ${fmtMetric(key, m.baseline)} avg</span>`;
      } else delta = `<span class="d flat">First stream to compare</span>`;
      const place = m.of > 1 ? `<span class="p">${ordinal(m.place)} ${higher === false ? "best" : higher === null ? "longest" : "highest"} of ${m.of}</span>` : "";
      const best = m.best ? `<span class="best">${higher === false ? "Best rank ever" : "Best ever"}</span>` : "";
      return `<div class="rc"><span class="k">${esc(label)}</span><span class="v">${fmtMetric(key, m.value)}</span>${delta}${place}${best}</div>`;
    }).join("");
  }
  const o = s.overview, fol = ins.followers;
  const folTile = fol ? [[num(fol.current), `Followers<br><span class="chg">${fol.d30.gained >= 0 ? "+" : ""}${num(fol.d30.gained)} ${fol.d30.full ? "in 30 days" : "since " + shortDate(fol.d30.since + "T12:00:00")}</span>`]] : [];
  $("tiles").innerHTML = [...folTile, [num(o.streams), "Streams saved"], [num(o.hours), "Hours streamed"], [num(o.messages), "Chat messages"],
    [num(o.chatters), "Unique chatters"], [o.mpm, "Avg messages / min"]]
    .map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");

  // ===== TRENDS =====
  const trends = ins.trends || [];
  let metric = "avg_viewers";
  if (!trends.some(t => t.avg_viewers != null)) metric = "chatters";
  const HINTS = { followers_gained: "Followers gained between the start and end of each stream.", cat_top_pct: "Lower is better: top 5% beats top 40%.", return_rate: "Share of each stream's chatters who had chatted before.", hours: "How long each stream ran." };
  const seg = $("metric-seg");
  seg.innerHTML = metrics.map(m => `<button data-k="${m.key}">${esc(m.label)}</button>`).join("");
  const drawTrend = () => {
    seg.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.k === metric));
    const m = metrics.find(x => x.key === metric) || {};
    $("metric-hint").textContent = HINTS[metric] || (m.higher ? "Higher is better." : "");
    trendChart($("trend-chart"), trends, metric, m.label || metric);
  };
  seg.addEventListener("click", e => { const b = e.target.closest("button"); if (b) { metric = b.dataset.k; drawTrend(); } });
  onTab("trends", drawTrend);
  onTab("trends", () => {
    const el = $("fol-chart");
    if (!fol) { $("fol-sub").textContent = ""; return empty(el, "Needs the Twitch follower sign-in. Once it's set up, your follower count is recorded hourly."); }
    const chg = (c, d) => `${c.gained >= 0 ? "+" : ""}${num(c.gained)} ${c.full ? `in ${d} days` : "since " + shortDate(c.since + "T12:00:00")}`;
    $("fol-sub").textContent = `${num(fol.current)} followers · ${chg(fol.d7, 7)}${fol.d30.full || fol.d7.full ? " · " + chg(fol.d30, 30) : ""}`;
    if (!dateLine(el, fol.history, (p, prev) => `<b>${new Date(p[0] + "T12:00:00").toLocaleDateString()}</b>${num(p[1])} followers${prev ? `<br>${p[1] - prev[1] >= 0 ? "+" : ""}${p[1] - prev[1]} from the day before` : ""}`))
      empty(el, "Collecting. The chart appears after a couple of days of follower readings.");
  });

  let patternsDone = false;
  onTab("trends", () => {
    if (patternsDone) return; patternsDone = true;
    $("games").innerHTML = s.games.length ? (() => {
      const max = Math.max(...s.games.map(g => g.mpm));
      return s.games.map(g => `<div class="hbar" data-tip="${esc(`<b>${esc(g.game)}</b>${g.mpm} msgs/min · ${g.hours}h · ${g.streams} streams`)}">
        <span class="lbl">${esc(g.game)}</span><div class="track"><div class="fill" style="width:${(g.mpm / max) * 100}%"></div></div>
        <span class="val">${g.mpm}/min<small>${g.hours}h</small></span></div>`).join("");
    })() : `<p class="empty-note">Not enough data yet.</p>`;
    if (s.by_hour.length) vbars($("hours"), s.by_hour, { label: h => `${h.hour + 1}h`, segs: h => [{ v: h.mpm }], tipFor: h => `<b>Hour ${h.hour + 1}</b>${h.mpm} msgs/min · ${h.streams} streams` });
    else emptyBlock($("hours"));
    const agg = keyFn => { const m = new Map(); for (const st of s.streams) { const k = keyFn(new Date(st.date)); const a = m.get(k) || { msgs: 0, mins: 0, n: 0 }; a.msgs += st.messages; a.mins += st.duration / 60; a.n++; m.set(k, a); } return m; };
    const days = agg(d => d.getDay());
    vbars($("days"), [1, 2, 3, 4, 5, 6, 0].map(d => ({ d, ...(days.get(d) || { msgs: 0, mins: 1, n: 0 }) })), {
      label: x => DAYS[x.d], segs: x => [{ v: x.msgs / x.mins }],
      tipFor: x => `<b>${DAYS[x.d]}</b>${x.n ? (x.msgs / x.mins).toFixed(1) + " msgs/min · " + x.n + " streams" : "No streams"}` });
    const starts = agg(d => d.getHours()), hrs = [...starts.keys()].sort((a, b) => a - b);
    vbars($("starts"), hrs.map(h => ({ h, ...starts.get(h) })), {
      label: x => hourLabel(x.h), segs: x => [{ v: x.msgs / x.mins }],
      tipFor: x => `<b>${hourLabel(x.h)} starts</b>${(x.msgs / x.mins).toFixed(1)} msgs/min · ${x.n} streams` });
  });

  // ===== STREAMS =====
  const pick = $("stream-pick"), chatCache = {};
  const list = [...s.streams].reverse();
  pick.innerHTML = list.map(st => `<option value="${esc(st.id)}">${esc(fmtDate(st.date))} · ${esc(st.title)}</option>`).join("");
  const drawStream = async () => {
    const id = pick.value, st = s.streams.find(x => x.id === id), curve = (ins.curves || {})[id];
    const xmax = Math.max(1, st.duration / 60);
    $("stream-tiles").innerHTML = [
      [fmtMetric("avg_viewers", st.avg_viewers), "Avg viewers"], [fmtMetric("peak_viewers", st.peak_viewers), "Peak viewers"],
      [st.viewer_hours != null ? num(st.viewer_hours) : "—", "Hours watched"], [fmtMetric("followers_gained", st.followers_gained), "Followers gained"], [fmtMetric("cat_top_pct", st.cat_top_pct), "Category rank"],
      [fmtMetric("mpm", st.mpm), "Msgs / min"], [num(st.chatters), "Chatters"], [num(st.new), "New chatters"], [fmtMetric("hours", st.hours), "Length"],
    ].map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join("");
    $("stream-manual").hidden = !st.manual;
    const v = byId[id], markers = ((v && v.chapters) || []).map(c => [c.t / 60, c.game]);
    if (!curve || !timeChart($("curve-viewers"), curve.viewers, { xmax, markers,
      tipFn: p => `<b>${fmtTime(p[0] * 60)}</b>${p[1]} viewers` })) empty($("curve-viewers"), st.manual ? "No viewer curve: this stream's numbers were entered by hand." : "No viewer data for this stream. Tracking records streams from now on. For older streams, use Actions → Add past stream stats.");
    const ranks = curve ? curve.rank.filter(r => r[1]) : [];
    $("rank-wrap").hidden = !ranks.length;
    if (ranks.length) timeChart($("curve-rank"), ranks.map(r => [r[0], r[1], r[2], r[3]]), { xmax, kind: "line", invert: true, markers,
      ymax: niceMax(Math.max(...ranks.map(r => r[1]))), tipFn: p => `<b>${fmtTime(p[0] * 60)}</b>#${p[1]} of ${num(p[2])} live in ${esc(p[3])}` });
    if (!chatCache[id]) chatCache[id] = await fetch(`data/chat/${encodeURIComponent(id)}.json`).then(r => r.ok ? r.json() : []).catch(() => []);
    if (pick.value !== id) return;
    const chat = chatCache[id], bin = xmax > 240 ? 5 : xmax > 90 ? 2 : 1, bins = new Array(Math.ceil(xmax / bin)).fill(0);
    chat.forEach(c => { const i = Math.floor(c[0] / 60 / bin); if (i < bins.length) bins[i]++; });
    if (!timeChart($("curve-chat"), bins.map((n, i) => [i * bin, n / bin]), { xmax, kind: "bars", markers,
      fmtY: v => (v < 10 && v % 1 ? v.toFixed(1) : num(Math.round(v))),
      tipFn: p => `<b>${fmtTime(p[0] * 60)}–${fmtTime((p[0] + bin) * 60)}</b>${p[1].toFixed(1)} msgs/min` })) empty($("curve-chat"), "No chat saved for this stream.");
  };
  pick.addEventListener("change", drawStream);
  onTab("streams", drawStream);

  // ===== CATEGORY =====
  let catDone = false;
  onTab("category", () => {
    const cat = ins.category || [];
    if (!catDone) {
      catDone = true;
      $("cat-table").innerHTML = cat.length ? `<div class="table-scroll"><table class="ctbl"><tr><th>Game</th><th>Your avg viewers</th><th>Typical rank</th><th>Top %</th><th>Live channels</th><th>Typical channel</th><th>Viewers / channel</th></tr>${
        cat.map(c => `<tr><td>${esc(c.game)}</td><td>${fmtMetric("avg_viewers", c.avg_viewers)}</td><td>${c.rank ? "#" + num(Math.round(c.rank)) : "—"}</td>
          <td>${c.top_pct != null ? `<span class="pct-bar"><i style="width:${Math.max(3, 100 - c.top_pct)}%"></i></span>Top ${Math.round(c.top_pct)}%` : "—"}</td>
          <td>${c.channels ? num(Math.round(c.channels)) : "—"}</td><td>${c.typical_channel != null ? (n => `${num(n)} viewer${n === 1 ? "" : "s"}`)(Math.round(c.typical_channel)) : "—"}</td>
          <td>${c.viewers_per_channel ?? "—"}</td></tr>`).join("")}</table></div>
          <p class="hint" style="margin-top:10px">Typical channel = the median live channel's viewers. If you beat it, you're above the middle of the pack.</p>`
        : `<p class="empty-note">Shows up after your next stream.</p>`;
      const peers = ins.peers || [];
      $("peers").innerHTML = peers.length ? `<div class="peer-list">${peers.map(p => `<div class="peer">
          <a href="https://twitch.tv/${encodeURIComponent(p.login)}" target="_blank" rel="noopener" title="${esc(p.login)}">${esc(p.login)}</a>
          <span>~${fmtMetric("avg_viewers", p.avg_viewers)} viewers · live with you in ${p.streams} stream${p.streams === 1 ? "" : "s"}</span></div>`).join("")}</div>`
        : `<p class="empty-note">Shows up after your next stream.</p>`;
      const land = ins.landscape || [];
      const lp = $("land-pick");
      lp.innerHTML = land.map((g, i) => `<option value="${i}">${esc(g.game)}</option>`).join("");
      lp.hidden = !land.length;
      lp.onchange = drawHeat;
    }
    drawHeat();
  });
  let heatMetric = 3;
  function drawHeat() {
    const land = ins.landscape || [], g = land[+$("land-pick").value || 0];
    const heat = $("heat"), legend = $("heat-legend"), best = $("land-best");
    if (!g || !g.samples) { heat.innerHTML = ""; legend.innerHTML = ""; best.innerHTML = `<p class="empty-note">Collecting. Sampled hourly while you're offline; useful after a week or two.</p>`; return; }
    const off = Math.round(-new Date().getTimezoneOffset() / 60), cells = new Array(168);
    g.cells.forEach((c, utc) => { cells[((utc + off) % 168 + 168) % 168] = c; });
    const vals = cells.filter(c => c[0]).map(c => c[heatMetric]), max = Math.max(...vals, 1e-9), min = Math.min(...vals, 0);
    const mix = t => { const a = [38, 38, 47], b = [169, 112, 255]; return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",")})`; };
    let html = `<div></div>` + Array.from({ length: 24 }, (_, h) => `<div class="hl">${h % 3 === 0 ? hourLabel(h).replace(/(am|pm)/, m => m[0]) : ""}</div>`).join("");
    WEEK.forEach((d, di) => {
      html += `<div class="rl">${d}</div>`;
      for (let h = 0; h < 24; h++) {
        const c = cells[di * 24 + h];
        if (!c || !c[0]) { html += `<div class="c none" data-tip="<b>${d} ${hourLabel(h)}</b>Not sampled yet"></div>`; continue; }
        const t = (c[heatMetric] - min) / ((max - min) || 1);
        html += `<div class="c" style="background:${mix(t)}" data-tip="<b>${d} ${hourLabel(h)}</b>${num(c[1])} live channels · ${num(c[2])} viewers<br>${c[3]} viewers per channel · typical channel ${c[4]}<br><span style='color:var(--muted)'>${c[0]} sample${c[0] === 1 ? "" : "s"}</span>"></div>`;
      }
    });
    heat.innerHTML = html;
    legend.innerHTML = `<span>fewer</span><span class="ramp"></span><span>more viewers per channel</span><span style="margin-left:auto">${g.slots_sampled}/168 hours sampled</span>`;
    const sampled = cells.map((c, i) => ({ c, i })).filter(x => x.c && x.c[0]);
    const solid = sampled.filter(x => x.c[0] >= 2);
    const ranked = (solid.length >= 4 ? solid : sampled).sort((a, b) => b.c[3] - a.c[3]).slice(0, 4);
    best.innerHTML = ranked.length ? `<div class="best-slots">${ranked.map(x => `<span><b>${WEEK[Math.floor(x.i / 24)]} ${hourLabel(x.i % 24)}</b> · ${(+x.c[3]).toFixed(1)} viewers per channel</span>`).join("")}</div>` : "";
  }

  // ===== COMMUNITY =====
  let commDone = false;
  onTab("community", () => {
    const ret = ins.retention || [];
    const avgRet = ret.length ? ret.reduce((a, r) => a + r.rate, 0) / ret.length : null;
    $("community-tiles").innerHTML = [[num(o.chatters), "Unique chatters ever"], [num(ins.regulars_30d || 0), "Regulars (3+ streams in 30 days)"],
      [avgRet != null ? Math.round(avgRet) + "%" : "—", "New chatters who come back"],
      [s.streams.length ? (s.streams.reduce((a, x) => a + x.new, 0) / s.streams.length).toFixed(1) : "—", "New chatters per stream"]]
      .map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");
    if (commDone) return; commDone = true;
    vbars($("community"), s.streams.slice(-20), { label: st => shortDate(st.date), segs: st => [{ v: st.new, cls: "new" }, { v: st.returning }],
      tipFor: st => `<b>${esc(st.title)}</b>${fmtDate(st.date)}<br>${st.returning} returning · ${st.new} new` });
    if (ret.length) vbars($("retention"), ret.slice(-20), { label: r => shortDate(r.date), segs: r => [{ v: r.rate }],
      tipFor: r => `<b>${fmtDate(r.date)}</b>${r.came_back} of ${r.new} new chatters came back (${r.rate}%)` });
    else emptyBlock($("retention"), "Needs at least two streams.");
    $("top").innerHTML = `<tr><th>Chatter</th><th class="n">Messages</th><th class="n">Streams</th></tr>` +
      s.top_chatters.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${num(c.messages)}</td><td class="n">${c.streams}</td></tr>`).join("");
    $("lapsed").innerHTML = s.lapsed.length
      ? `<tr><th>Chatter</th><th class="n">Streams</th><th class="n">Last seen</th></tr>` + s.lapsed.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${c.streams}</td><td class="n">${fmtDate(c.last)}</td></tr>`).join("")
      : `<tr><td class="empty-note">${s.streams.length < 6 ? "Needs 6+ saved streams." : "Nobody — your regulars are sticking around."}</td></tr>`;
    $("emotes").innerHTML = s.emotes.length ? s.emotes.map(e => `<div class="emote">
        ${emoteLink(e.src, e.id, `<img src="${(EMOTE_URL[e.src] || EMOTE_URL.t)(encodeURIComponent(e.id))}" alt="" loading="lazy">`)}
        <b>${esc(e.name)}</b><span>${num(e.count)}</span></div>`).join("") : `<p class="empty-note">No emotes yet.</p>`;
    $("unused").innerHTML = s.unused_7tv.length ? s.unused_7tv.map(n => typeof n === "string" ? `<span>${esc(n)}</span>` : emoteLink("7", n.id, `<span>${esc(n.name)}</span>`)).join("") : `<p class="empty-note">None found.</p>`;
  });

  // ===== CLIPS =====
  const withClips = [...s.streams].reverse().filter(st => (s.moments[st.id] || []).length);
  const sel = $("clip-stream");
  if (!withClips.length) emptyBlock($("clips"), "No chat spikes found yet.");
  else {
    sel.innerHTML = withClips.map(st => `<option value="${esc(st.id)}">${esc(fmtDate(st.date))} · ${esc(st.title)}</option>`).join("");
    const showClips = () => {
      const id = sel.value, v = byId[id];
      $("clips").innerHTML = s.moments[id].slice().sort((a, b) => b.x - a.x).map(m => {
        const t = Math.max(0, Math.floor(m.t - ((v && v.offset) || 0)));
        const time = v ? `<a class="time" href="v/${encodeURIComponent(id)}/?t=${t}">${fmtTime(m.t)}</a>` : `<span class="time">${fmtTime(m.t)}</span>`;
        return `<div class="clip">${time}<div class="words"><span class="tag">${TAG_LABEL[m.tag] || m.tag}</span>${esc(m.words.join(" · "))}</div><span class="x">${m.x}× normal</span></div>`;
      }).join("") + (v ? "" : `<p class="hint">Links work once this stream's YouTube upload is matched.</p>`);
    };
    sel.addEventListener("change", showClips);
    showClips();
  }

  showTab(location.hash.slice(1) || "overview");
  addEventListener("hashchange", () => showTab(location.hash.slice(1) || "overview"));
})();
