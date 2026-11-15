(async () => {
  const EMOTE = { t: id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`, "7": id => `https://cdn.7tv.app/emote/${id}/4x.webp` };
  const box = document.getElementById("profile");
  let data, vods = [];
  try {
    const [c, v] = await Promise.all([fetch("data/chatters.json", { cache: "no-cache" }), loadVods()]);
    data = c.ok ? await c.json() : null; vods = v;
  } catch {}
  if (!data) { box.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><h2>Couldn't load profiles</h2><a class="btn" href="profile.html">Try again</a></div>`; return; }

  const users = data.users, keys = Object.keys(users).sort((a, b) => users[b].m - users[a].m);
  document.getElementById("find-list").innerHTML = keys.map(k => `<option value="${esc(users[k].n)}">`).join("");
  document.getElementById("find").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("find-q").value.trim().toLowerCase();
    const hit = users[q] ? q : keys.find(k => k.includes(q));
    if (hit) location.search = "?u=" + encodeURIComponent(hit);
  });

  const key = (new URLSearchParams(location.search).get("u") || "").toLowerCase();
  const u = users[key];
  const byId = Object.fromEntries(vods.map(v => [v.id, v]));
  const nameStyle = c => `color:${esc(c ? readable(c) : "var(--text)")}`;

  if (!u) {
    box.innerHTML = `<h1 class="prof-title">Chatters</h1><p class="hint">${keys.length} people have chatted across ${data.streams} saved stream${data.streams === 1 ? "" : "s"}. Pick someone:</p>
      <div class="who-grid">${keys.slice(0, 60).map(k => `<a class="who-chip" href="profile.html?u=${encodeURIComponent(k)}"><b style="${nameStyle(users[k].c)}">${esc(users[k].n)}</b><small>${users[k].m.toLocaleString()} msgs · ${users[k].b.length} badges</small></a>`).join("")}</div>`;
    return;
  }

  document.title = `${u.n} · itsmotch chatters`;
  const vodLink = (id, t) => byId[id] ? `v/${encodeURIComponent(id)}/${t != null ? `?t=${Math.max(0, Math.floor(t - (byId[id].offset || 0)))}` : ""}` : null;
  const fav = u.fav ? emoteLink(u.fav.src, u.fav.id, `<img src="${(EMOTE[u.fav.src] || EMOTE.t)(encodeURIComponent(u.fav.id))}" alt="${esc(u.fav.name)}" title="${esc(u.fav.name)}">`) : "—";
  const first = u.first, fl = first && vodLink(first.vod, first.t);
  const tile = (v, l, extra = "") => `<div class="ptile${extra}"><b>${v}</b><span>${l}</span></div>`;
  const earned = new Set(u.b);

  box.innerHTML = `
    <section class="prof-card">
      <div class="prof-head">
        <div class="prof-dot" style="background:${esc(u.c ? readable(u.c) : "var(--accent)")}">${esc(u.n[0] || "?").toUpperCase()}</div>
        <div><h1 class="prof-name" style="${nameStyle(u.c)}">${esc(u.n)}</h1>
          <div class="hint">${u.b.length} of ${data.badges.length} badges${u.streak >= 2 ? ` · 🔥 ${u.streak}-stream streak` : ""}</div></div>
      </div>
      <div class="ptiles">
        ${tile(u.m.toLocaleString(), "messages")}
        ${tile(u.s, `stream${u.s === 1 ? "" : "s"}`)}
        ${tile(u.streak ? "🔥 " + u.streak : "0", "current streak", u.streak >= 2 ? " hot" : "")}
        ${tile(u.best, "best streak")}
        ${tile(u.e.toLocaleString(), "emotes used")}
        <div class="ptile fav">${fav}<span>favorite emote</span></div>
      </div>
      ${first ? `<p class="first">First message: <q>${esc(first.text) || "(emote)"}</q> <span class="hint">· ${fmtDate(first.date)}${fl ? ` · <a href="${fl}">watch it</a>` : ""}</span></p>` : ""}
    </section>
    <section class="panel-box">
      <div class="box-head"><h2>Badges</h2></div>
      <div class="badges">${data.badges.map(b => `<div class="badge-card${earned.has(b.id) ? " got" : ""}" title="${esc(b.how)}">
        <span class="be">${b.emoji}</span><b>${esc(b.name)}</b><small>${esc(b.how)}</small><small class="pct">${b.pct}% of chatters</small></div>`).join("")}</div>
    </section>
    <section class="panel-box">
      <div class="box-head"><h2>Recent streams</h2></div>
      <div class="recent-list">${u.recent.map(([id, n]) => { const v = byId[id]; return v
        ? `<a class="rl" href="${vodLink(id)}"><span>${esc(v.title)}</span><small>${fmtDate(v.date)} · ${n} msg${n === 1 ? "" : "s"}</small></a>`
        : `<div class="rl"><span>Stream not on the site yet</span><small>${n} msg${n === 1 ? "" : "s"}</small></div>`; }).join("")}</div>
    </section>`;

})();
