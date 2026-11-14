#!/usr/bin/env python3
"""Generate site/v/<id>/index.html (watch page with link-preview tags) for each VOD. Run at deploy."""
import html
import json
import os

import vodlib

SITE = vodlib.ROOT / "site"


def fmt_dur(s):
    h, m = divmod(int(s) // 60, 60)
    return f"{h}h {m}m" if h else f"{m}m"


def fmt_time(s):
    h, rem = divmod(int(s), 3600)
    return f"{h}:{rem // 60:02d}:{rem % 60:02d}" if h else f"{rem // 60}:{rem % 60:02d}"


def fmt_date(iso):
    from datetime import datetime
    try:
        from zoneinfo import ZoneInfo  # streamer's local day, matching what viewers in Saskatoon see
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ZoneInfo("America/Regina")).strftime("%b %-d, %Y")
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
    if site.startswith("http://"):  # Pages reports http even with Enforce HTTPS on
        site = "https://" + site[len("http://"):]
    template = (SITE / "vod.html").read_text(encoding="utf-8")
    vods = vodlib.load(vodlib.VODS, [])
    moments = vodlib.load(vodlib.DATA / "stats.json", {}).get("moments", {})
    e = lambda t: html.escape(str(t), quote=True)
    person = {"@type": "Person", "name": "itsmotch", "url": "https://www.twitch.tv/itsmotch"}
    for v in vods:
        game, date, dur = v.get("game", ""), fmt_date(v.get("date", "")), fmt_dur(v.get("duration", 0))
        off = v.get("offset", 0) or 0
        msgs = v.get("messages", 0)
        desc = (f"itsmotch {game + ' ' if game else ''}stream{' from ' + date if date else ''} ({dur}). "
                f"Watch the full Twitch VOD with chat replay" + (f" and all {msgs:,} chat messages." if msgs else "."))
        summary = (f"itsmotch streamed {game or 'live'} for {dur}{' on ' + date if date else ''}"
                   + (f", with {msgs:,} chat messages" if msgs else "") + ". Chat replays in sync with the video.")
        thumb = f"https://i.ytimg.com/vi/{v['youtube']}/hqdefault.jpg"
        url = f"{site}/v/{v['id']}/" if site else ""
        views = (v.get("yt_views") or 0) + (v.get("twitch_views") or 0)
        ld = {"@context": "https://schema.org", "@type": "VideoObject", "name": v["title"], "description": desc,
              "thumbnailUrl": [thumb, f"https://i.ytimg.com/vi/{v['youtube']}/mqdefault.jpg"],
              "uploadDate": v.get("date", ""), "duration": iso_duration(v.get("duration", 0)),
              "embedUrl": f"https://www.youtube.com/embed/{v['youtube']}", "inLanguage": "en",
              "author": person, "creator": person, "genre": game or None,
              "interactionStatistic": {"@type": "InteractionCounter", "interactionType": {"@type": "WatchAction"}, "userInteractionCount": views}}
        if url:
            ld["url"] = url
            clips = [(c["t"], c["game"]) for c in v.get("chapters", []) if len(v.get("chapters", [])) > 1]
            clips += [(m["t"], "Chat moment" + (f": {', '.join(m['words'][:3])}" if m.get("words") else ""))
                      for m in sorted(moments.get(v["id"], []), key=lambda m: -m.get("x", 0))[:6]]
            parts = []
            for t, name in sorted(clips):
                start = max(0, int(t - off))
                parts.append({"@type": "Clip", "name": name, "startOffset": start, "url": f"{url}?t={start}"})
            for i, c in enumerate(parts):
                c["endOffset"] = parts[i + 1]["startOffset"] if i + 1 < len(parts) else int(v.get("duration", 0) - off)
            parts = [c for c in parts if c["endOffset"] > c["startOffset"]]
            if parts:
                ld["hasPart"] = parts
        ld = {k: x for k, x in ld.items() if x is not None}
        crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "itsmotch VODs", "item": f"{site}/"},
            {"@type": "ListItem", "position": 2, "name": v["title"], "item": url}]} if url else None
        jsonld = lambda o: f'\n  <script type="application/ld+json">{json.dumps(o, ensure_ascii=False).replace("</", "<\\/")}</script>'
        extra = ((f'\n  <link rel="canonical" href="{e(url)}">\n  <meta property="og:url" content="{e(url)}">' if url else "")
                 + f'\n  <meta property="og:image:width" content="480">\n  <meta property="og:image:height" content="360">'
                 + (f'\n  <meta property="video:duration" content="{int(v.get("duration", 0))}">'
                    f'\n  <meta property="video:release_date" content="{e(v.get("date", ""))}">')
                 + jsonld(ld) + (jsonld(crumbs) if crumbs else ""))
        page_title = " · ".join(x for x in [v["title"], f"{game} VOD" if game else "VOD", "itsmotch"] if x)
        meta_line = " · ".join(x for x in [date, game, fmt_time(v.get("duration", 0))] if x)
        page = (template
                .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <base href="../../">', 1)
                .replace("<title>itsmotch VODs</title>", meta(v["title"], desc, thumb, page_title) + extra, 1)
                .replace('<meta name="robots" content="noindex">', "", 1)
                .replace('<h1 id="title"></h1>', f'<h1 id="title">{e(v["title"])}</h1>', 1)
                .replace('<div class="meta" id="meta"></div>', f'<div class="meta" id="meta">{e(meta_line)}</div>', 1)
                .replace('<p class="summary" id="summary"></p>', f'<p class="summary" id="summary">{e(summary)}</p>', 1)
                .replace("<body>", f'<body data-vod="{e(v["id"])}">', 1))
        page = page.replace('<meta name="description" content="Every itsmotch stream, with chat replay.">', "", 1)
        out = SITE / "v" / v["id"]
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(page, encoding="utf-8")

    if site:
        def entry(v):
            x = html.escape
            dur, day, date = int(v.get("duration", 0)), v.get("date", "")[:10], v.get("date", "")
            about = " ".join(w for w in ["itsmotch", v.get("game", ""), "stream with Twitch chat replay"] if w)
            video = (f"<video:thumbnail_loc>https://i.ytimg.com/vi/{v['youtube']}/hqdefault.jpg</video:thumbnail_loc>"
                     f"<video:title>{x(v['title'])}</video:title><video:description>{x(about)}</video:description>"
                     f"<video:player_loc>https://www.youtube.com/embed/{v['youtube']}</video:player_loc>"
                     + (f"<video:duration>{min(dur, 28800)}</video:duration>" if dur else "")
                     + (f"<video:publication_date>{date}</video:publication_date>" if date else ""))
            lastmod = f"<lastmod>{day}</lastmod>" if day else ""
            return f"  <url><loc>{x(site + '/v/' + v['id'] + '/')}</loc>{lastmod}\n    <video:video>{video}</video:video></url>\n"
        home_mod = f"<lastmod>{vods[0].get('date', '')[:10]}</lastmod>" if vods and vods[0].get("date") else ""
        (SITE / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n'
            f"  <url><loc>{site}/</loc>{home_mod}</url>\n" + "".join(entry(v) for v in vods) + "</urlset>\n", encoding="utf-8")
        (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /stats.html\n\nSitemap: {site}/sitemap.xml\n", encoding="utf-8")

    if channel.get("avatar"):
        idx = SITE / "index.html"
        s = idx.read_text(encoding="utf-8")
        e = lambda t: html.escape(t, quote=True)
        desc = "watch all of itsmotchs vods with chat replay"
        s = s.replace('<meta name="description" content="Every itsmotch stream, with chat replay.">',
                      f'<meta name="description" content="{e(desc)}">\n'
                      f'  <meta property="og:type" content="website">\n'
                      f'  <meta property="og:title" content="itsmotch">\n'
                      f'  <meta property="og:description" content="{e(desc)}">\n'
                      f'  <meta property="og:image" content="{e(channel["avatar"])}">\n'
                      f'  <meta name="twitter:card" content="summary_large_image">', 1)
        if site:
            ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": "itsmotch VODs", "url": f"{site}/",
                   "about": {"@type": "Person", "name": "itsmotch", "url": "https://www.twitch.tv/itsmotch", "image": channel["avatar"]}},
                  {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
                      {"@type": "ListItem", "position": i + 1, "url": f"{site}/v/{v['id']}/", "name": v["title"]}
                      for i, v in enumerate(vods[:30])]}]
            s = s.replace("  <link rel=\"stylesheet\" href=\"style.css\">",
                          f'  <link rel="canonical" href="{site}/">\n'
                          f'  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>\n'
                          '  <link rel="stylesheet" href="style.css">', 1)
        idx.write_text(s, encoding="utf-8")
    print(f"pages: {len(vods)} VOD pages")


if __name__ == "__main__":
    main()
