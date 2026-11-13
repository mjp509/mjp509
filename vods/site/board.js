(async () => {
  let months = [];
  try { const r = await fetch("data/leaderboard.json", { cache: "no-cache" }); if (r.ok) months = await r.json(); } catch {}
  if (!months.length) return;
  const board = document.getElementById("board"), podium = document.getElementById("podium");
  const label = document.getElementById("board-month"), prev = document.getElementById("board-prev"), next = document.getElementById("board-next");
  const RANK = ["1st", "2nd", "3rd"];
  const EMOTE = { t: id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`, "7": id => `https://cdn.7tv.app/emote/${id}/4x.webp` };
  let i = 0;

  function show() {
    const m = months[i], [y, mo] = m.month.split("-").map(Number);
    label.textContent = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    podium.innerHTML = m.top.length ? m.top.map((c, k) => `
      <div class="place p${k + 1}">
        <div class="rank">${RANK[k]}</div>
        ${c.emote ? `<img class="fav" src="${(EMOTE[c.emote.src] || EMOTE.t)(encodeURIComponent(c.emote.id))}" alt="${esc(c.emote.name)}" title="Favorite emote: ${esc(c.emote.name)}">` : ""}
        <div class="who" style="color:${esc(c.color ? readable(c.color) : "var(--text)")}">${esc(c.name)}</div>
        <div class="cnt">${c.messages.toLocaleString()} messages</div>
      </div>`).join("") : `<p class="none">No chat yet this month.</p>`;
    const e = m.emote, wrap = document.getElementById("eotm-wrap");
    wrap.hidden = !e;
    if (e) document.getElementById("eotm").innerHTML = `
      <img src="https://cdn.7tv.app/emote/${encodeURIComponent(e.id)}/4x.webp" alt="${esc(e.name)}">
      <div class="who">${esc(e.name)}</div>
      <div class="cnt">${e.uses.toLocaleString()} uses</div>`;
    prev.disabled = i >= months.length - 1;
    next.disabled = i === 0;
  }
  prev.onclick = () => { if (i < months.length - 1) { i++; show(); } };
  next.onclick = () => { if (i > 0) { i--; show(); } };
  board.hidden = false;
  show();
})();
