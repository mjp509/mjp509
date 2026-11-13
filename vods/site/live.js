(() => {
  const section = document.getElementById("live");
  if (!window.Twitch) return section.remove();

  // Collapsed until Twitch says the channel is live, so the VODs come first
  const embed = new Twitch.Embed("twitch-embed", {
    channel: "itsmotch",
    parent: [location.hostname],
    layout: "video",
    width: "100%",
    height: "100%",
    autoplay: true,
    muted: true,
  });

  embed.addEventListener(Twitch.Embed.VIDEO_READY, () => {
    const p = embed.getPlayer();
    p.addEventListener(Twitch.Player.ONLINE, () => section.classList.add("online"));
    p.addEventListener(Twitch.Player.OFFLINE, () => section.classList.remove("online"));
  });
})();
