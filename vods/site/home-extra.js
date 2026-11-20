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

  const o = typeof loadOsrs === "function" ? await loadOsrs() : null;
  if (o && (o.skills || o.total)) {
    const L = o.links || { overview: o.url, log: o.url };
    document.getElementById("osrs-title").textContent = `OSRS · ${o.rsn}`;
    const t = (icon, v, l, href) => `<a class="o-tile" href="${href}" target="_blank" rel="noopener">${icon ? `<img src="${WIKI_IMG(icon)}" alt="">` : ""}<b>${v}</b><span>${l}</span></a>`;
    if (o.skills) document.getElementById("osrs-tiles").innerHTML =
      t("Combat_icon.png", o.combat.toFixed(2), "Combat", L.overview) + t("Stats_icon.png", num(o.total_level), "Total level", L.overview) +
      t("", compact(o.total_xp), "Total XP", L.overview) + t("", o.ehb, "EHB", L.overview);
    if (o.total) {
      const pct = 100 * o.done / o.total;
      document.getElementById("osrs-progress").innerHTML = `<a href="${L.log}" target="_blank" rel="noopener" class="clog-prog-link"><div class="clog-prog-text"><b>${num(o.done)}</b> / ${num(o.total)} collection log <span>${pct.toFixed(1)}%</span></div>
        <div class="clog-bar"><i style="width:${Math.min(100, pct)}%"></i></div></a>`;
    }
    const row = document.getElementById("osrs-row");
    if ((o.items || []).length) row.innerHTML = clogItems(o.items.slice(0, 12));
    else if ((o.bosses || []).length) {
      document.getElementById("osrs-sub").textContent = "Top bosses";
      row.className = "home-bosses";
      row.innerHTML = o.bosses.slice(0, 8).map(b => `<a class="o-boss" href="${L.stat + encodeURIComponent(b.name)}" target="_blank" rel="noopener" title="${esc(b.name)} · ${num(b.kc)} kills">
        <span class="o-bicon">${b.icon ? itemImg(b.icon, b.name) : ""}</span><span class="o-bname">${esc(b.name.replace(/^The /, ""))}</span><b>${num(b.kc)}</b></a>`).join("");
    } else document.getElementById("osrs-sub").hidden = true;
    document.getElementById("osrs").hidden = false;
  }
})();
