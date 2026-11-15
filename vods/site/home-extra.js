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
})();
