// Shared OSRS helpers (also used by the homepage summary) + full overview page when #osrs-page exists.
const WIKI_IMG = f => `https://oldschool.runescape.wiki/images/${encodeURIComponent(f.replace(/ /g, "_"))}`;
const ITEM_IMG = id => `https://static.runelite.net/cache/item/icon/${encodeURIComponent(id)}.png`;
const ITEM_WIKI = (id, name) => `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${encodeURIComponent(id)}&name=${encodeURIComponent(name || "")}`;
const compact = n => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const num = n => (n || 0).toLocaleString();
const XP_AT = (() => { const t = [0, 0]; let p = 0; for (let l = 1; l < 127; l++) { p += Math.floor(l + 300 * 2 ** (l / 7)); t.push(Math.floor(p / 4)); } return t; })();
const ago = u => { if (!u) return ""; const d = (Date.now() / 1000 - u) / 86400; return d < 1 / 24 ? "just now" : d < 1 ? `${Math.floor(d * 24)}h ago` : d < 2 ? "yesterday" : d < 30 ? `${Math.floor(d)}d ago` : new Date(u * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };

async function loadOsrs() {
  try { const r = await fetch("data/osrs.json", { cache: "no-cache" }); if (r.ok) return await r.json(); } catch {}
  return null;
}

function itemImg(id, name, cls = "") {
  return `<img class="${cls}" loading="lazy" src="${ITEM_IMG(id)}" alt="${esc(name || "")}" data-wiki="${WIKI_IMG((name || "") + ".png")}" onerror="if(this.dataset.wiki){this.src=this.dataset.wiki;this.dataset.wiki=''}else{this.style.visibility='hidden'}">`;
}

function clogItems(items) {
  return items.map(i => `
    <a class="clog${i.notable ? " notable" : ""}" href="${ITEM_WIKI(i.id, i.name)}" target="_blank" rel="noopener" title="${esc(i.name)}${i.notable ? " · notable" : ""} · OSRS Wiki">
      <span class="clog-icon">${itemImg(i.id, i.name)}</span><b>${esc(i.name)}</b><small>${ago(i.unix)}</small>
    </a>`).join("");
}

(async () => {
  const root = document.getElementById("osrs-page");
  if (!root) return;
  const o = await loadOsrs();
  if (!o || !o.skills) { root.innerHTML = `<div class="empty-state"><div class="empty-icon">⚔️</div><h1>OSRS stats are on the way</h1><p>They show up after the next sync.</p></div>`; return; }
  const L = o.links, stat = s => L.stat + encodeURIComponent(s);
  const ext = `target="_blank" rel="noopener"`;
  const head = (title, href, label = "TempleOSRS ↗") => `<div class="box-head"><h2>${title}</h2><a class="see-all" href="${href}" ${ext}>${label}</a></div>`;
  const tile = (icon, v, l, href) => `<a class="o-tile" href="${href}" ${ext}>${icon ? `<img src="${WIKI_IMG(icon)}" alt="">` : ""}<b>${v}</b><span>${l}</span></a>`;

  const skills = o.skills.map(s => {
    const lv = s.level || 1, max = lv >= 99;
    const pct = max ? 100 : Math.max(0, Math.min(100, (s.xp - XP_AT[lv]) / (XP_AT[lv + 1] - XP_AT[lv]) * 100));
    const toNext = max ? "" : ` · ${num(XP_AT[lv + 1] - s.xp)} XP to ${lv + 1}`;
    return `<a class="o-skill${max ? " max" : ""}" href="${stat(s.name)}" ${ext} title="${s.name} · ${num(s.xp)} XP${s.rank ? ` · rank #${num(s.rank)}` : ""}${toNext}">
      <img src="${WIKI_IMG(s.name + "_icon.png")}" alt=""><span class="lv">${lv}</span><span class="lv-of">/99</span>
      <i class="o-bar"><i style="width:${pct.toFixed(1)}%"></i></i></a>`;
  }).join("");
  const n99 = o.skills.filter(s => s.level >= 99).length;

  const bossCard = (b, i) => `<a class="o-boss${i === 0 ? " top" : ""}" href="${stat(b.name)}" ${ext} title="${esc(b.name)} · ${num(b.kc)} kills${b.rank ? ` · rank #${num(b.rank)}` : ""}${b.ehb ? ` · ${b.ehb} EHB` : ""}">
      <span class="o-bicon">${b.icon ? itemImg(b.icon, b.name) : ""}</span>
      <span class="o-bname">${esc(b.name.replace(/^The /, ""))}</span><b>${num(b.kc)}</b><small>${b.rank ? `#${num(b.rank)}` : b.ehb ? `${b.ehb} EHB` : "kills"}</small></a>`;
  const smallList = rows => rows.map(r => `<a class="o-row" href="${r.href}" ${ext}>${r.icon || ""}<span>${esc(r.name)}</span><b>${r.value}</b></a>`).join("");

  const TAB = { bosses: "Bosses", raids: "Raids", clues: "Clues", minigames: "Minigames", other: "Other" };
  const tabs = Object.entries(o.tabs || {}).map(([k, [h, t]]) => `<a class="o-tab" href="${L.log}" ${ext}><span>${TAB[k] || k}</span><b>${h}<small>/${t}</small></b><i class="o-bar"><i style="width:${t ? (100 * h / t).toFixed(1) : 0}%"></i></i></a>`).join("");
  const logPct = o.total ? 100 * o.done / o.total : 0;
  const pets = o.pets ? `<div class="o-sub">Pets <span>${o.pets.have.length} / ${o.pets.total}</span></div>
      <div class="o-pets">${o.pets.have.map(id => `<a href="${ITEM_WIKI(id, "")}" ${ext} title="OSRS Wiki">${itemImg(id, "pet")}</a>`).join("") || `<span class="hint-sm">No pets yet… the grind continues.</span>`}</div>` : "";

  const g = o.gains, hasGains = g && (g.xp || (g.bosses || []).length);
  const gains = hasGains ? `<section class="panel-box">${head("This month", L.overview)}
      <div class="o-gain-tiles"><div class="o-gt"><b>+${compact(g.xp)}</b><span>XP</span></div><div class="o-gt"><b>+${g.ehp}</b><span>EHP</span></div><div class="o-gt"><b>+${g.ehb}</b><span>EHB</span></div></div>
      <div class="cols2">
        <div>${(g.skills || []).map(([s, x]) => `<a class="o-row" href="${stat(s)}" ${ext}><img src="${WIKI_IMG(s + "_icon.png")}" alt=""><span>${s}</span><b>+${compact(x)}</b></a>`).join("") || `<p class="hint-sm">No XP gained yet this month.</p>`}</div>
        <div>${(g.bosses || []).map(([b, k]) => `<a class="o-row" href="${stat(b)}" ${ext}><span>${esc(b)}</span><b>+${num(k)}</b></a>`).join("") || `<p class="hint-sm">No boss kills yet this month.</p>`}</div>
      </div></section>` : "";

  document.title = `OSRS stats · ${o.rsn} · itsmotch`;
  root.innerHTML = `
    <section class="o-hero">
      <div class="o-hero-top">
        <div><div class="o-kicker">Old School RuneScape</div><h1 class="o-name"><a href="${L.overview}" ${ext}>${esc(o.rsn)}</a></h1>
          <div class="o-meta"><span class="o-badge">${esc(o.mode)}</span>${n99 ? `<span class="o-badge gold">${n99}× 99</span>` : ""}${o.updated ? `<span>Updated ${ago(o.updated)}</span>` : ""}</div></div>
        <a class="btn" href="${L.overview}" ${ext}>View on TempleOSRS ↗</a>
      </div>
      <div class="o-tiles">
        ${tile("Combat_icon.png", o.combat.toFixed(2), "Combat level", L.overview)}
        ${tile("Stats_icon.png", num(o.total_level), "Total level", stat("Overall"))}
        ${tile("", compact(o.total_xp), "Total XP", stat("Overall"))}
        ${tile("", o.rank ? "#" + num(o.rank) : "—", "Overall rank", stat("Overall"))}
        ${tile("", o.ehp, "EHP", stat("Ehp"))}
        ${tile("", o.ehb, "EHB", stat("Ehb"))}
      </div>
    </section>
    <div class="o-grid">
      <section class="panel-box">${head("Skills", stat("Overall"))}
        <div class="o-skills">${skills}</div>
        <a class="o-total" href="${stat("Overall")}" ${ext}><span>Total level <b>${num(o.total_level)}</b></span><span>${num(o.total_xp)} XP</span></a>
      </section>
      <section class="panel-box">${head("Collection log", L.log)}
        <a class="o-log" href="${L.log}" ${ext}><div class="o-log-num"><b>${num(o.done)}</b> / ${num(o.total)} <span>${logPct.toFixed(1)}%</span></div>
          <i class="o-bar big"><i style="width:${logPct.toFixed(1)}%"></i></i></a>
        <div class="o-tabs">${tabs}</div>
        <div class="o-log-facts"><span><b>${o.cats_done || 0}</b>/${o.cats_total || 0} logs complete</span><span><b>${o.ehc}</b> EHC</span></div>
        ${pets}
        <div class="o-sub">Recent drops <span>${(o.items || []).length}</span></div>
        <div class="clog-row o-recent">${(o.items || []).length ? clogItems(o.items) : `<p class="clog-empty">New drops show up here as ${esc(o.rsn)} gets them.</p>`}</div>
      </section>
    </div>
    ${gains}
    <section class="panel-box">${head(`Bosses <small class="o-count">${o.bosses.length} killed · ${num(o.bosses.reduce((a, b) => a + b.kc, 0))} kills</small>`, stat("Ehb"))}
      <div class="o-bosses">${o.bosses.map(bossCard).join("")}</div>
    </section>
    <div class="o-grid four">
      <section class="panel-box">${head("Raids", L.overview)}${smallList(o.raids.map(r => ({ name: r.name, value: num(r.kc), href: stat(r.name), icon: r.icon ? itemImg(r.icon, r.name, "o-ri") : "" }))) || `<p class="hint-sm">No raids yet.</p>`}</section>
      <section class="panel-box">${head("Skilling bosses", L.overview)}${smallList(o.skilling_bosses.map(r => ({ name: r.name === "Rift" ? "Guardians of the Rift" : r.name, value: num(r.kc), href: stat(r.name), icon: r.icon ? itemImg(r.icon, r.name, "o-ri") : "" }))) || `<p class="hint-sm">None yet.</p>`}</section>
      <section class="panel-box">${head(`Clues <small class="o-count">${num(o.clues.all)}</small>`, stat("Clue_all"))}${smallList(o.clues.tiers.map(c => ({ name: c.name, value: num(c.count), href: stat("Clue_" + c.name.toLowerCase()), icon: itemImg(c.icon, `Clue scroll (${c.name.toLowerCase()})`, "o-ri") })))}</section>
      <section class="panel-box">${head("Minigames", L.overview)}${smallList(o.minigames.map(m => ({ name: m.name === "LMS" ? "Last Man Standing" : m.name, value: num(m.score), href: stat(m.name) }))) || `<p class="hint-sm">None tracked.</p>`}</section>
    </div>`;
})();
