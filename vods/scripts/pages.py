#!/usr/bin/env python3
"""Generate site/v/<id>/index.html (watch page with link-preview tags) for each VOD. Run at deploy."""
import html
import json
import os
from collections import Counter

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


def iso_duration(sec):
    h, rem = divmod(int(sec), 3600)
    return f"PT{h}H{rem // 60}M{rem % 60}S"


def meta(title, desc, image, page_title=None):
    e = lambda s: html.escape(s, quote=True)
    return (f'<title>{e(page_title or title)}</title>\n'
            f'  <meta name="description" content="{e(desc)}">\n'
            f'  <meta property="og:type" content="video.other">\n'
            f'  <meta property="og:site_name" content="itsmotch VODs">\n'
            f'  <meta property="og:title" content="{e(title)}">\n'
            f'  <meta property="og:description" content="{e(desc)}">\n'
            f'  <meta property="og:image" content="{e(image)}">\n'
            f'  <meta name="twitter:card" content="summary_large_image">\n'
            f'  <meta name="theme-color" content="#a970ff">')


def round_favicon(url):
    try:
        import io
        import urllib.request
        from PIL import Image, ImageDraw
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "vod-site"}), timeout=30) as r:
            img = Image.open(io.BytesIO(r.read())).convert("RGBA")
        size, big = 128, 512
        img = img.resize((big, big), Image.LANCZOS)
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
        img.putalpha(mask)
        img.resize((size, size), Image.LANCZOS).save(SITE / "favicon.png")
        return "favicon.png"
    except Exception as e:
        print(f"round favicon skipped: {e}")
        return url


def bake_avatar(avatar):
    fav = round_favicon(avatar)
    for name in ("index.html", "vod.html", "stats.html", "privacy.html"):
        f = SITE / name
        s = f.read_text(encoding="utf-8")
        s = s.replace('id="favicon" href="https://unavatar.io/twitch/itsmotch"', f'id="favicon" href="{fav}"')
        f.write_text(s.replace("https://unavatar.io/twitch/itsmotch", avatar), encoding="utf-8")


def main():
    channel = vodlib.load(vodlib.DATA / "channel.json", {})
    if channel.get("avatar"):
        bake_avatar(channel["avatar"])
    site = os.environ.get("SITE_URL", "").rstrip("/")
    template = (SITE / "vod.html").read_text(encoding="utf-8")
    vods = vodlib.load(vodlib.VODS, [])
    for v in vods:
        game, date = v.get("game", ""), fmt_date(v.get("date", ""))
        desc = " · ".join(x for x in [date, game, fmt_dur(v.get("duration", 0)), "Watch with chat replay"] if x)
        long_desc = (f"{game + ' stream' if game else 'Stream'} by itsmotch{' on ' + date if date else ''} "
                     f"({fmt_dur(v.get('duration', 0))}). Watch the full VOD with Twitch chat replay.")
        thumb = f"https://i.ytimg.com/vi/{v['youtube']}/hqdefault.jpg"
        url = f"{site}/v/{v['id']}/" if site else ""
        ld = {"@context": "https://schema.org", "@type": "VideoObject", "name": v["title"], "description": long_desc,
              "thumbnailUrl": [thumb], "uploadDate": v.get("date", ""), "duration": iso_duration(v.get("duration", 0)),
              "embedUrl": f"https://www.youtube.com/embed/{v['youtube']}"}
        if url:
            ld["url"] = url
        extra = (f'\n  <link rel="canonical" href="{html.escape(url, quote=True)}">' if url else "") + \
                f'\n  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>'
        page_title = " · ".join(x for x in [v["title"], f"{game} VOD" if game else "VOD", "itsmotch"] if x)
        page = (template
                .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <base href="../../">', 1)
                .replace("<title>itsmotch VODs</title>", meta(v["title"], desc, thumb, page_title) + extra, 1)
                .replace('<meta name="robots" content="noindex">', "", 1)
                .replace("<body>", f'<body data-vod="{html.escape(v["id"], quote=True)}">', 1))
        page = page.replace('<meta name="description" content="Every itsmotch stream, with chat replay.">', "", 1)
        out = SITE / "v" / v["id"]
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(page, encoding="utf-8")

    games = [g for g, _ in Counter(v.get("game") for v in vods if v.get("game")).most_common(3)]
    home_desc = "Every itsmotch Twitch stream with full chat replay" + (f": {', '.join(games)} and more." if games else ".")
    if site:
        urls = [(f"{site}/", vods[0]["date"][:10] if vods else "")] + [(f"{site}/v/{v['id']}/", v.get("date", "")[:10]) for v in vods]
        (SITE / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "".join(f"  <url><loc>{html.escape(u)}</loc>{f'<lastmod>{d}</lastmod>' if d else ''}</url>\n" for u, d in urls)
            + "</urlset>\n", encoding="utf-8")
        (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /stats.html\n\nSitemap: {site}/sitemap.xml\n", encoding="utf-8")

    if channel.get("avatar"):
        idx = SITE / "index.html"
        s = idx.read_text(encoding="utf-8")
        s = s.replace('<meta name="description" content="Every itsmotch stream, with chat replay.">',
                      meta("itsmotch VODs", home_desc, channel["avatar"])
                      .replace("<title>itsmotch VODs</title>\n  ", "")
                      .replace('content="video.other"', 'content="website"')
                      .replace('twitter:card" content="summary_large_image', 'twitter:card" content="summary'), 1)
        idx.write_text(s, encoding="utf-8")
    print(f"pages: {len(vods)} VOD pages")


if __name__ == "__main__":
    main()
