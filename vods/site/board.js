(async () => {
  let months = [];
  try { const r = await fetch("data/leaderboard.json", { cache: "no-cache" }); if (r.ok) months = await r.json(); } catch {}
  if (!months.length) return;
  const board = document.getElementById("board"), podium = document.getElementById("podium");
  const label = document.getElementById("board-month"), prev = document.getElementById("board-prev"), next = document.getElementById("board-next");
  const medals = ["🥇", "🥈", "🥉"];
  let i = 0;

  function show() {
    const m = months[i], [y, mo] = m.month.split("-").map(Number);
    label.textContent = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    podium.innerHTML = m.top.length ? m.top.map((c, k) => `
      <div class="place p${k + 1}">
        <div class="medal">${medals[k]}</div>
        <div class="who" style="color:${esc(c.color || "var(--text)")}">${esc(c.name)}</div>
        <div class="cnt">${c.messages.toLocaleString()} messages</div>
      </div>`).join("") : `<p class="none">No chat yet this month.</p>`;
    prev.disabled = i >= months.length - 1;
    next.disabled = i === 0;
  }
  prev.onclick = () => { if (i < months.length - 1) { i++; show(); } };
  next.onclick = () => { if (i > 0) { i--; show(); } };
  board.hidden = false;
  show();
})();
