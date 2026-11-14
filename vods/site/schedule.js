(async () => {
  let data;
  try { const r = await fetch("data/schedule.json", { cache: "no-cache" }); if (r.ok) data = await r.json(); } catch {}
  const now = Date.now();
  let segs = ((data && data.segments) || []).filter(s => Date.parse(s.end || s.start) + (s.end ? 0 : 4 * 36e5) > now).slice(0, 7);
  let weekly = null;
  if (!segs.length) {  // no Twitch schedule: fall back to the usual weekly days in data/weekly.json
    try { const r = await fetch("data/weekly.json", { cache: "no-cache" }); if (r.ok) weekly = await r.json(); } catch {}
    if (weekly && weekly.days) {
      const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], [hh, mm] = weekly.time.split(":").map(Number);
      const off = (weekly.utc_offset || 0) * 36e5;
      for (let i = 0; i < 8 && segs.length < 7; i++) {
        const local = new Date(now + off + i * 864e5);  // the streamer's calendar day
        if (!weekly.days.includes(DOW[local.getUTCDay()])) continue;
        const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm) - off;
        if (start + 4 * 36e5 > now) segs.push({ start: new Date(start).toISOString(), end: null, title: "", game: "", approx: weekly.approx });
      }
    }
  }
  data = data || {};
  const vac = data.vacation && Date.parse(data.vacation.end) > now ? data.vacation : null;
  if (!segs.length && !vac) return;

  const day = d => d.toLocaleDateString(undefined, { weekday: "short" });
  const date = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date().toDateString(), tomorrow = new Date(now + 864e5).toDateString();
  const label = d => d.toDateString() === today ? "Today" : d.toDateString() === tomorrow ? "Tomorrow" : day(d);
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value || "";

  document.getElementById("sched-row").innerHTML = segs.map(s => {
    const a = new Date(s.start), b = s.end ? new Date(s.end) : null, live = a <= now && (!b || b > now);
    return `<div class="sched${s.canceled ? " off" : ""}${live ? " on" : ""}">
      <div class="sd">${label(a)}</div><div class="sdate">${date(a)}</div>
      <div class="st">${s.approx ? "~" : ""}${time(a)}${b ? `–${time(b)}` : ""}</div>
      ${s.approx ? "" : `<div class="sg" title="${esc(s.title)}">${s.canceled ? "Cancelled" : esc(s.game || s.title || "Stream")}</div>`}
    </div>`;
  }).join("");

  const next = segs.find(s => !s.canceled && Date.parse(s.start) > now);
  const nextEl = document.getElementById("sched-next");
  const onNow = segs.find(s => !s.canceled && Date.parse(s.start) <= now && (!s.end || Date.parse(s.end) > now));
  const tick = () => {
    if (onNow && (!onNow.end || Date.parse(onNow.end) > Date.now())) { nextEl.textContent = "Scheduled now"; return; }
    if (!next) return;
    const ms = Date.parse(next.start) - Date.now();
    if (ms <= 0) { nextEl.textContent = "Starting now"; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    nextEl.textContent = `Next stream in ${next.approx ? "~" : ""}${d ? d + "d " : ""}${d || h ? h + "h " : ""}${m}m`;
  };
  tick(); setInterval(tick, 30000);

  const note = document.getElementById("sched-note");
  const bits = [];
  if (vac) bits.push(`On a break until ${date(new Date(vac.end))}.`);
  if (weekly && weekly.note && segs.some(x => x.approx)) bits.push(weekly.note);
  if (zone) bits.push(`Times shown in your time zone (${zone}).`);
  note.textContent = bits.join(" · "); note.hidden = !bits.length;
  document.getElementById("schedule").hidden = false;
})();
