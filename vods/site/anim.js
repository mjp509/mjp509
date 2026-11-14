// Fade/slide things in as they scroll into view, count up highscores. Skipped for reduced motion.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const SEL = ".card:not(.skeleton), .rcard, .gtile, .clip-card, .hs-list li, .panel-box, .hs, .panel, .details";

  const countUp = el => {
    const m = el.textContent.match(/^([\d,]+)(.*)$/); if (!m) return;
    const end = +m[1].replace(/,/g, ""), rest = m[2], t0 = performance.now(), dur = 700;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - k, 3)));
      el.textContent = v.toLocaleString() + rest;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      el.classList.add("in");
      const done = ev => { if (ev.target === el && ev.propertyName === "transform") { el.classList.remove("reveal", "in"); el.removeEventListener("transitionend", done); } };
      el.addEventListener("transitionend", done);
      const cnt = el.matches(".hs-list li") && el.querySelector(".cnt");
      if (cnt) countUp(cnt);
    }
  }, { rootMargin: "0px 0px -6% 0px" });

  const scan = root => {
    if (!root.querySelectorAll) return;
    const els = [...(root.matches?.(SEL) ? [root] : []), ...root.querySelectorAll(SEL)];
    for (const el of els) {
      if (el.dataset.anim) continue;
      el.dataset.anim = "1";
      const i = [...el.parentNode.children].indexOf(el);
      el.style.setProperty("--d", `${Math.min(Math.max(i, 0), 8) * 45}ms`);
      el.classList.add("reveal");
      io.observe(el);
    }
  };

  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
})();
