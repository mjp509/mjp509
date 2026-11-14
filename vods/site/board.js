(async () => {
  let months = [];
  try { const r = await fetch("data/leaderboard.json", { cache: "no-cache" }); if (r.ok) months = await r.json(); } catch {}
  if (!months.length) return;
  const board = document.getElementById("board"), list = document.getElementById("podium");
  const label = document.getElementById("board-month"), prev = document.getElementById("board-prev"), next = document.getElementById("board-next");
  const EMOTE = { t: id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`, "7": id => `https://cdn.7tv.app/emote/${id}/4x.webp` };
  fetch("data/channel.json").then(r => r.json()).then(c => { if (c.avatar) document.getElementById("hs-avatar").src = c.avatar; }).catch(() => {});
  let i = 0;

  function show() {
    const m = months[i], [y, mo] = m.month.split("-").map(Number);
    label.textContent = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    list.innerHTML = m.top.length ? m.top.map((c, k) => `
      <li class="r${k + 1}">
        <span class="n">${k + 1}</span>
        <span class="em">${c.emote ? emoteLink(c.emote.src, c.emote.id, `<img src="${(EMOTE[c.emote.src] || EMOTE.t)(encodeURIComponent(c.emote.id))}" alt="${esc(c.emote.name)}" title="Favorite emote: ${esc(c.emote.name)}">`) : ""}</span>
        <span class="who"><b style="color:${esc(c.color ? readable(c.color) : "var(--text)")}">${esc(c.name)}</b>${c.emote ? `<small>Favorite emote: ${esc(c.emote.name)}</small>` : ""}</span>
        <span class="cnt">${c.messages.toLocaleString()} messages</span>
      </li>`).join("") : `<li class="none">No chat yet this month.</li>`;
    const e = m.emote, wrap = document.getElementById("eotm-wrap");
    wrap.hidden = !e;
    if (e) document.getElementById("eotm").innerHTML = `
      ${emoteLink("7", e.id, `<img src="https://cdn.7tv.app/emote/${encodeURIComponent(e.id)}/4x.webp" alt="${esc(e.name)}" title="View on 7TV">`)}
      <div><div class="who">${emoteLink("7", e.id, esc(e.name))}</div><div class="cnt">${e.uses.toLocaleString()} uses</div></div>`;
    prev.disabled = i >= months.length - 1;
    next.disabled = i === 0;
  }
  prev.onclick = () => { if (i < months.length - 1) { i++; show(); } };
  next.onclick = () => { if (i > 0) { i--; show(); } };
  board.hidden = false;
  show();
})();
