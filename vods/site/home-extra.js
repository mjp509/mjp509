// "Last time on itsmotch" recap and the shiny log teaser on the homepage.
(async () => {
  const MOMENT = { funny: "😂", hype: "🔥", shock: "😳", sad: "😭", spike: "📈" };
  let r = null;
  try { const res = await fetch("data/recap.json", { cache: "no-cache" }); if (res.ok) r = await res.json(); } catch {}
  if (r && r.id) {
    const link = t => r.published ? `v/${encodeURIComponent(r.id)}/${t != null ? `?t=${Math.max(0, Math.floor(t - (r.offset || 0)))}` : ""}` : null;
    const title = link() ? `<a class="recap-title" href="${link()}">${esc(r.title)}</a>` : `<span class="recap-title">${esc(r.title)}</span>`;
    const facts = [`${r.messages.toLocaleString()} messages`, `${r.chatters} chatters`, r.new ? `${r.new} new` : ""].filter(Boolean)
      .map(f => `<span class="rchip">${f}</span>`).join("");
    const top = r.top ? `<span class="rchip">Top chatter: ${profileLink(r.top.name, `<b style="color:${esc(r.top.color ? readable(r.top.color) : "var(--text)")}">${esc(r.top.name)}</b>`)} · ${r.top.messages}</span>` : "";
    const moments = (r.moments || []).map(m => {
      const label = `${MOMENT[m.tag] || "📈"} ${fmtTime(m.t)}${m.words && m.words.length ? ` · “${esc(m.words.join(" "))}”` : ""}`;
      return link(m.t) ? `<a class="rmoment" href="${link(m.t)}">${label}</a>` : `<span class="rmoment">${label}</span>`;
    }).join("");
    document.getElementById("recap-body").innerHTML = `
      <div class="recap-main">${title}
        <div class="recap-meta">${[fmtDate(r.date), esc(r.game || ""), fmtTime(r.duration)].filter(Boolean).join(" · ")}</div></div>
      <div class="recap-facts">${facts}${top}</div>
      ${moments ? `<div class="recap-moments"><span class="hint-sm">Best moments</span>${moments}</div>` : ""}
      ${!r.published ? `<div class="hint-sm">The VOD goes up once it's on YouTube.</div>` : ""}`;
    document.getElementById("recap").hidden = false;
  }

  if (typeof loadShinies === "function") {
    const data = await loadShinies();
    const s = (data && data.shinies) || [];
    if (s.length) {
      document.getElementById("shiny-row").innerHTML = s.slice(0, 8).map(x => shinyCard(x, null, true)).join("");
      document.getElementById("shiny-all").textContent = `All ${s.length} →`;
      document.getElementById("shinies").hidden = false;
    }
  }

  let o = null;
  try { const res = await fetch("data/osrs.json", { cache: "no-cache" }); if (res.ok) o = await res.json(); } catch {}
  if (o && ((o.items || []).length || o.total)) {
    const ago = u => { const d = (Date.now() / 1000 - u) / 86400; return d < 1 ? "today" : d < 2 ? "yesterday" : d < 30 ? `${Math.floor(d)}d ago` : new Date(u * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
    document.getElementById("osrs-row").innerHTML = o.items.map(i => `
      <a class="clog${i.notable ? " notable" : ""}" href="https://oldschool.runescape.wiki/w/Special:Lookup?type=item&amp;id=${encodeURIComponent(i.id)}&amp;name=${encodeURIComponent(i.name)}" target="_blank" rel="noopener" title="${esc(i.name)}${i.notable ? " · notable" : ""}">
        <span class="clog-icon"><img loading="lazy" src="https://static.runelite.net/cache/item/icon/${encodeURIComponent(i.id)}.png" alt="" data-wiki="https://oldschool.runescape.wiki/images/${encodeURIComponent(String(i.name).replace(/ /g, "_"))}.png" onerror="if(this.dataset.wiki){this.src=this.dataset.wiki;this.dataset.wiki=''}else{this.remove()}"></span>
        <b>${esc(i.name)}</b><small>${ago(i.unix)}</small>
      </a>`).join("");
    if (!o.items.length) document.getElementById("osrs-row").innerHTML = `<p class="clog-empty">New collection log drops show up here as ${esc(o.rsn)} gets them.</p>`;
    if (o.total) {
      const pct = (100 * o.done / o.total);
      document.getElementById("osrs-progress").innerHTML = `<div class="clog-prog-text"><b>${o.done.toLocaleString()}</b> / ${o.total.toLocaleString()} collected <span>${pct.toFixed(1)}%</span></div>
        <div class="clog-bar"><i style="width:${Math.min(100, pct)}%"></i></div>`;
    }
    const all = document.getElementById("osrs-all"); all.href = o.url;
    document.getElementById("osrs").hidden = false;
  }
})();
