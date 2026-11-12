(() => {
  const section = document.getElementById("live");
  const label = document.getElementById("live-label");
  const box = document.getElementById("twitch-embed");
  if (!window.Twitch) return section.remove();

  const wide = matchMedia("(min-width: 900px)").matches;
  if (wide) box.classList.add("chat");
  const embed = new Twitch.Embed("twitch-embed", {
    channel: "itsmotch",
    parent: [location.hostname],
    layout: wide ? "video-with-chat" : "video",
    width: "100%",
    height: "100%",
    autoplay: true,
    muted: true,
  });

  embed.addEventListener(Twitch.Embed.VIDEO_READY, () => {
    const p = embed.getPlayer();
    p.addEventListener(Twitch.Player.ONLINE, () => {
      section.classList.remove("offline"); section.classList.add("online");
      label.textContent = "LIVE NOW";
    });
    p.addEventListener(Twitch.Player.OFFLINE, () => {
      section.classList.remove("online"); section.classList.add("offline");
      label.textContent = document.querySelector("#grid .card:not(.skeleton)") ? "itsmotch is offline · catch the VODs below" : "itsmotch is offline";
    });
  });
})();
