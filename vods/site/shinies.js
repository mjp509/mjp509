// Shared shiny card + full shiny log page (only runs the page part when #shiny-grid exists).
const IV_LABELS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
const METHOD = { single: "Single", horde: "Horde", fishing: "Fishing", egg: "Egg", safari: "Safari", fossil: "Fossil", gift: "Gift", honey: "Honey", headbutt: "Headbutt", rocksmash: "Rock Smash" };
const methodName = m => METHOD[m] || (m ? m[0].toUpperCase() + m.slice(1) : "Unknown");
const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function shinyCard(s, vodByDay, compact) {
  const v = vodByDay && vodByDay[s.date];
  const ivs = (s.ivs || []).length === 6 ? `<div class="ivs" title="IVs ${s.ivs.join("/")}">${s.ivs.map((n, i) =>
    `<span class="iv${n === 31 ? " max" : ""}" title="${IV_LABELS[i]} ${n}"><i style="--h:${Math.round(n / 31 * 100)}%"></i><b>${IV_LABELS[i]}</b></span>`).join("")}</div>` : "";
  const tags = [s.fav && `<span class="stag fav" title="Favourite">★</span>`, s.alpha && `<span class="stag">Alpha</span>`, s.secret && `<span class="stag">Secret</span>`].filter(Boolean).join("");
  if (compact) return `<a class="shiny mini" href="shinies.html" title="${esc(s.name)}${s.nick ? ` “${esc(s.nick)}”` : ""} · ${s.enc.toLocaleString()} encounters">
    ${s.sprite ? `<img loading="lazy" src="${esc(s.sprite)}" alt="${esc(s.name)}">` : ""}<b>${esc(s.species || s.name)}</b><small>${s.enc.toLocaleString()} enc</small></a>`;
  return `<div class="shiny">
    <div class="sprite">${s.sprite ? `<img loading="lazy" src="${esc(s.sprite)}" alt="Shiny ${esc(s.name)}">` : ""}${tags ? `<div class="stags">${tags}</div>` : ""}</div>
    <div class="sinfo">
      <h3>${esc(s.name)}</h3>${s.nick ? `<div class="nick">“${esc(s.nick)}”</div>` : ""}
      <div class="enc"><b>${s.enc ? s.enc.toLocaleString() : "?"}</b> encounters · ${esc(methodName(s.method))}</div>
      <div class="smeta">${esc(s.loc || "")}${s.nature ? ` · ${esc(s.nature)}` : ""}</div>
      <div class="smeta">${s.date ? fmtDate(s.date + "T12:00:00") : ""}</div>
      ${ivs}
      <div class="slinks">${v ? `<a href="v/${encodeURIComponent(v.id)}/">▷ Watch the stream</a>` : ""}${s.yt ? `<a href="${esc(s.yt)}" target="_blank" rel="noopener">Reaction ↗</a>` : ""}</div>
    </div></div>`;
}

async function loadShinies() {
  try { const r = await fetch("data/shinies.json", { cache: "no-cache" }); if (r.ok) return await r.json(); } catch {}
  return null;
}

(async () => {
  const grid = document.getElementById("shiny-grid");
  if (!grid) return;
  const [data, vods] = await Promise.all([loadShinies(), loadVods().catch(() => [])]);
  const list = (data && data.shinies) || [];
  if (!list.length) { grid.innerHTML = `<div class="empty-state"><div class="empty-icon">✨</div><h2>No shinies yet</h2><p>They'll show up here after the next sync.</p></div>`; return; }
  const vodByDay = {};
  for (const v of vods) if ((v.chapters || []).some(c => c.game === "PokeMMO") || v.game === "PokeMMO") vodByDay[localDay(v.date)] = v;

  const encs = list.map(s => s.enc).filter(Boolean), total = encs.reduce((a, b) => a + b, 0);
  const lucky = list.filter(s => s.enc).reduce((a, b) => (b.enc < a.enc ? b : a), list.find(s => s.enc) || list[0]);
  const longest = list.filter(s => s.enc).reduce((a, b) => (b.enc > a.enc ? b : a), lucky);
  const tile = (v, l) => `<div class="ptile"><b>${v}</b><span>${l}</span></div>`;
  document.getElementById("shiny-tiles").innerHTML =
    tile(list.length, "shinies") + tile(total.toLocaleString(), "total encounters") +
    tile(encs.length ? Math.round(total / encs.length).toLocaleString() : "—", "avg per shiny") +
    tile(list.filter(s => s.alpha).length, "alphas") +
    tile(lucky ? `${esc(lucky.species || lucky.name)}` : "—", `luckiest · ${lucky ? lucky.enc.toLocaleString() : ""} enc`) +
    tile(longest ? `${esc(longest.species || longest.name)}` : "—", `longest hunt · ${longest ? longest.enc.toLocaleString() : ""} enc`);
  document.getElementById("shiny-sub").textContent = `Every shiny caught in PokeMMO. ${list.length} and counting.`;

  const sel = document.getElementById("smethod");
  [...new Set(list.map(s => s.method).filter(Boolean))].sort().forEach(m => sel.add(new Option(methodName(m), m)));
  const q = document.getElementById("sq"), sort = document.getElementById("ssort"), count = document.getElementById("scount");
  const ivSum = s => (s.ivs || []).reduce((a, b) => a + b, 0);
  function render() {
    const term = q.value.trim().toLowerCase();
    let rows = list.filter(s => (!sel.value || s.method === sel.value) &&
      (!term || [s.name, s.nick, s.loc, s.nature].join(" ").toLowerCase().includes(term)));
    const by = { new: (a, b) => b.ts - a.ts, old: (a, b) => a.ts - b.ts, lucky: (a, b) => (a.enc || 1e12) - (b.enc || 1e12), long: (a, b) => b.enc - a.enc, iv: (a, b) => ivSum(b) - ivSum(a) }[sort.value];
    rows = rows.slice().sort(by);
    count.textContent = `${rows.length} shin${rows.length === 1 ? "y" : "ies"}`;
    grid.innerHTML = rows.length ? rows.map(s => shinyCard(s, vodByDay)).join("") : `<p class="empty">No shinies match.</p>`;
  }
  [q, sel, sort].forEach(el => el.addEventListener("input", render));
  render();
  const credit = document.getElementById("credit");
  credit.innerHTML = `Shiny data from <a href="${esc(data.url)}" target="_blank" rel="noopener">shinyboard.net</a>, updated with every sync.`;
  credit.hidden = false;
})();
