#!/usr/bin/env python3
"""Generate site/v/<id>/index.html (watch page with link-preview tags) for each VOD. Run at deploy."""
import html

import vodlib

SITE = vodlib.ROOT / "site"


def fmt_dur(s):
    h, m = divmod(int(s) // 60, 60)
    return f"{h}h {m}m" if h else f"{m}m"


def fmt_date(iso):
    from datetime import datetime
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%b %-d, %Y")
    except ValueError:
        return ""


def meta(title, desc, image):
    e = lambda s: html.escape(s, quote=True)
    return (f'<title>{e(title)}</title>\n'
            f'  <meta name="description" content="{e(desc)}">\n'
            f'  <meta property="og:type" content="video.other">\n'
            f'  <meta property="og:site_name" content="itsmotch VODs">\n'
            f'  <meta property="og:title" content="{e(title)}">\n'
            f'  <meta property="og:description" content="{e(desc)}">\n'
            f'  <meta property="og:image" content="{e(image)}">\n'
            f'  <meta name="twitter:card" content="summary_large_image">\n'
            f'  <meta name="theme-color" content="#a970ff">')


def bake_avatar(avatar):
    for name in ("index.html", "vod.html", "stats.html"):
        f = SITE / name
        f.write_text(f.read_text(encoding="utf-8").replace("https://unavatar.io/twitch/itsmotch", avatar), encoding="utf-8")


def main():
    channel = vodlib.load(vodlib.DATA / "channel.json", {})
    if channel.get("avatar"):
        bake_avatar(channel["avatar"])
    template = (SITE / "vod.html").read_text(encoding="utf-8")
    vods = vodlib.load(vodlib.VODS, [])
    for v in vods:
        desc = " · ".join(x for x in [fmt_date(v.get("date", "")), v.get("game", ""), fmt_dur(v.get("duration", 0)),
                                      "Watch with chat replay"] if x)
        page = (template
                .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <base href="../../">', 1)
                .replace("<title>itsmotch VODs</title>",
                         meta(v["title"], desc, f"https://i.ytimg.com/vi/{v['youtube']}/hqdefault.jpg"), 1)
                .replace("<body>", f'<body data-vod="{html.escape(v["id"], quote=True)}">', 1))
        out = SITE / "v" / v["id"]
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(page, encoding="utf-8")

    if channel.get("avatar"):
        idx = SITE / "index.html"
        s = idx.read_text(encoding="utf-8")
        s = s.replace('<meta name="description" content="Every itsmotch stream, with chat replay.">',
                      meta("itsmotch VODs", "Every itsmotch stream, with chat replay.", channel["avatar"])
                      .replace("<title>itsmotch VODs</title>\n  ", "")
                      .replace('content="video.other"', 'content="website"')
                      .replace('twitter:card" content="summary_large_image', 'twitter:card" content="summary'), 1)
        idx.write_text(s, encoding="utf-8")
    print(f"pages: {len(vods)} VOD pages")


if __name__ == "__main__":
    main()
