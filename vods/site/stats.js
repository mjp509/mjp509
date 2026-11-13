const $ = id => document.getElementById(id);
const num = n => new Intl.NumberFormat().format(n);
const TAG_LABEL = { funny: "😂 Funny", hype: "🔥 Hype", shock: "😳 Shock", sad: "😭 Sad", spike: "📈 Spike" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMOTE_URL = { t: id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`, "7": id => `https://cdn.7tv.app/emote/${id}/2x.webp` };

const tip = $("tip");
document.addEventListener("pointermove", e => {
  const el = e.target.closest("[data-tip]");
  if (!el) return (tip.hidden = true);
  tip.innerHTML = el.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - r.width - 8, e.clientX + 12) + "px";
  tip.style.top = Math.max(8, e.clientY - r.height - 12) + "px";
});

function vbars(el, items, { label, segs, tipFor }) {
  const max = Math.max(1e-9, ...items.map(i => segs(i).reduce((a, s) => a + s.v, 0)));
  el.innerHTML = items.map(i => `<div class="vcol" data-tip="${esc(tipFor(i))}">${segs(i).map(s =>
    `<div class="seg ${s.cls || ""}" style="height:${(s.v / max) * 100}%"></div>`).join("")}</div>`).join("");
  el.insertAdjacentHTML("afterend", `<div class="xlabels">${items.map(i => `<span>${esc(label(i))}</span>`).join("")}</div>`);
}

function empty(el, msg = "Not enough data yet.") { el.outerHTML = `<p class="empty-note">${msg}</p>`; }

(async () => {
  const [s, vods] = await Promise.all([fetch("data/stats.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null), loadVods()]);
  $("stats").classList.remove("is-loading");
  if (!s || !s.streams.length) {
    $("stats").innerHTML = `<div class="empty-state"><div class="empty-icon" style="font-size:40px">📊</div><h2>No stats yet</h2><p>Stats appear after your first stream is saved.</p></div>`;
    return;
  }
  const o = s.overview;
  $("tiles").innerHTML = [[num(o.streams), "Streams saved"], [num(o.hours), "Hours streamed"], [num(o.messages), "Chat messages"],
    [num(o.chatters), "Unique chatters"], [o.mpm, "Avg messages / min"]]
    .map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");

  // Clip finder
  const byId = Object.fromEntries(vods.map(v => [v.id, v]));
  const withClips = [...s.streams].reverse().filter(st => (s.moments[st.id] || []).length);
  const sel = $("clip-stream");
  if (!withClips.length) empty($("clips"), "No chat spikes found yet.");
  else {
    sel.innerHTML = withClips.map(st => `<option value="${esc(st.id)}">${esc(fmtDate(st.date))} · ${esc(st.title)}</option>`).join("");
    const showClips = () => {
      const id = sel.value, v = byId[id];
      $("clips").innerHTML = s.moments[id].slice().sort((a, b) => b.x - a.x).map(m => {
        const t = Math.max(0, Math.floor(m.t - ((v && v.offset) || 0)));
        const time = v ? `<a class="time" href="vod.html?id=${encodeURIComponent(id)}&t=${t}">${fmtTime(m.t)}</a>` : `<span class="time">${fmtTime(m.t)}</span>`;
        return `<div class="clip">${time}
          <div class="words"><span class="tag">${TAG_LABEL[m.tag] || m.tag}</span>${esc(m.words.join(" · "))}</div>
          <span class="x">${m.x}× normal</span></div>`;
      }).join("") + (v ? "" : `<p class="hint">Links work once this stream's YouTube upload is matched.</p>`);
    };
    sel.addEventListener("change", showClips);
    showClips();
  }

  // Games
  $("games").innerHTML = s.games.length ? (() => {
    const max = Math.max(...s.games.map(g => g.mpm));
    return s.games.map(g => `<div class="hbar" data-tip="${esc(`<b>${esc(g.game)}</b>${g.mpm} msgs/min · ${g.hours}h · ${g.streams} streams`)}">
      <span class="lbl">${esc(g.game)}</span>
      <div class="track"><div class="fill" style="width:${(g.mpm / max) * 100}%"></div></div>
      <span class="val">${g.mpm}/min<small>${g.hours}h</small></span></div>`).join("");
  })() : `<p class="empty-note">Not enough data yet.</p>`;

  // Hours into stream
  if (s.by_hour.length) vbars($("hours"), s.by_hour, {
    label: h => `${h.hour + 1}h`, segs: h => [{ v: h.mpm }],
    tipFor: h => `<b>Hour ${h.hour + 1}</b>${h.mpm} msgs/min · ${h.streams} streams`,
  }); else empty($("hours"));

  // Days + start times (local)
  const agg = keyFn => {
    const m = new Map();
    for (const st of s.streams) { const k = keyFn(new Date(st.date)); const a = m.get(k) || { msgs: 0, mins: 0, n: 0 };
      a.msgs += st.messages; a.mins += st.duration / 60; a.n++; m.set(k, a); }
    return m;
  };
  const days = agg(d => d.getDay());
  vbars($("days"), [1, 2, 3, 4, 5, 6, 0].map(d => ({ d, ...(days.get(d) || { msgs: 0, mins: 1, n: 0 }) })), {
    label: x => DAYS[x.d], segs: x => [{ v: x.msgs / x.mins }],
    tipFor: x => `<b>${DAYS[x.d]}</b>${x.n ? (x.msgs / x.mins).toFixed(1) + " msgs/min · " + x.n + " streams" : "No streams"}`,
  });
  const starts = agg(d => d.getHours());
  const hrs = [...starts.keys()].sort((a, b) => a - b);
  const hlabel = h => `${(h % 12) || 12}${h < 12 ? "am" : "pm"}`;
  vbars($("starts"), hrs.map(h => ({ h, ...starts.get(h) })), {
    label: x => hlabel(x.h), segs: x => [{ v: x.msgs / x.mins }],
    tipFor: x => `<b>${hlabel(x.h)} starts</b>${(x.msgs / x.mins).toFixed(1)} msgs/min · ${x.n} streams`,
  });

  // Community
  const last = s.streams.slice(-20);
  vbars($("community"), last, {
    label: st => new Date(st.date).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
    segs: st => [{ v: st.new, cls: "new" }, { v: st.returning }],
    tipFor: st => `<b>${esc(st.title)}</b>${fmtDate(st.date)}<br>${st.returning} returning · ${st.new} new`,
  });

  $("top").innerHTML = `<tr><th>Chatter</th><th class="n">Messages</th><th class="n">Streams</th></tr>` +
    s.top_chatters.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${num(c.messages)}</td><td class="n">${c.streams}</td></tr>`).join("");
  $("lapsed").innerHTML = s.lapsed.length
    ? `<tr><th>Chatter</th><th class="n">Streams</th><th class="n">Last seen</th></tr>` +
      s.lapsed.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${c.streams}</td><td class="n">${fmtDate(c.last)}</td></tr>`).join("")
    : `<tr><td class="empty-note">${s.streams.length < 6 ? "Needs 6+ saved streams." : "Nobody — your regulars are sticking around."}</td></tr>`;

  $("emotes").innerHTML = s.emotes.length ? s.emotes.map(e => `<div class="emote">
      ${emoteLink(e.src, e.id, `<img src="${(EMOTE_URL[e.src] || EMOTE_URL.t)(encodeURIComponent(e.id))}" alt="" loading="lazy">`)}
      <b>${esc(e.name)}</b><span>${num(e.count)}</span></div>`).join("") : `<p class="empty-note">No emotes yet.</p>`;
  $("unused").innerHTML = s.unused_7tv.length ? s.unused_7tv.map(n => typeof n === "string" ? `<span>${esc(n)}</span>` : emoteLink("7", n.id, `<span>${esc(n.name)}</span>`)).join("") : `<p class="empty-note">None found.</p>`;
})();
