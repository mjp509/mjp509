(async () => {
  const game = document.body.dataset.game || new URLSearchParams(location.search).get("g") || "";
  const grid = document.getElementById("grid");
  let vods = [], art = {};
  try { vods = await loadVods(); } catch {}
  try { const r = await fetch("data/games.json", { cache: "no-cache" }); if (r.ok) art = await r.json(); } catch {}
  const list = vods.filter(v => v.game === game || (v.chapters || []).some(c => c.game === game))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const hours = list.reduce((a, v) => a + (v.duration || 0), 0) / 3600;
  document.getElementById("game-title").textContent = `${game} VODs`;
  document.getElementById("game-sub").textContent = list.length
    ? `${list.length} stream${list.length === 1 ? "" : "s"} · ${hours.toFixed(hours < 10 ? 1 : 0)} hours of ${game} with chat replay`
    : `No ${game} streams saved yet.`;
  const img = document.getElementById("game-art");
  img.src = art[game] || `https://static-cdn.jtvnw.net/ttv-boxart/${encodeURIComponent(game)}-285x380.jpg`;
  img.alt = game;
  img.onerror = () => img.remove();

  grid.innerHTML = list.map(v => `
    <a class="card" href="v/${encodeURIComponent(v.id)}/">
      <div class="thumb shimmer"><img loading="lazy" src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" alt=""
        onload="this.classList.add('loaded');this.parentNode.classList.remove('shimmer')" onerror="this.parentNode.classList.remove('shimmer')">
        <span class="badge">${fmtTime(v.duration)}</span></div>
      <div class="info"><h3>${esc(v.title)}</h3><div class="meta">${fmtDate(v.date)}</div></div>
    </a>`).join("") || `<p class="empty">Nothing here yet.</p>`;

  if (game === "PokeMMO" && typeof loadShinies === "function") {
    const data = await loadShinies();
    const s = (data && data.shinies) || [];
    if (s.length) {
      document.getElementById("game-shiny-row").innerHTML = s.slice(0, 12).map(x => shinyCard(x, null, true)).join("");
      document.getElementById("game-shinies").hidden = false;
    }
  }
})();
