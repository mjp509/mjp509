"""Actionable insights: patterns across streams that Twitch's Stream Summary doesn't show.

Each insight: {tag, title, detail, tip, weight, basis}. Times are written as [[hour:H]] (UTC hour) or
[[slot:N]] (UTC week slot, Monday 00:00 = 0) and converted to the viewer's local time by the page.
Every rule has a minimum-data guard so nothing is claimed from one lucky stream.
"""
import statistics
from collections import defaultdict
from datetime import datetime, timezone

FMT = "%Y-%m-%dT%H:%M:%SZ"


def ts(s):
    return datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def pct(a, b):
    return 100 * (a - b) / b if b else 0


def hm(minutes):
    h, m = divmod(int(round(minutes / 15) * 15), 60)
    return f"{h}h{m:02d}" if h else f"{m} min"


def names(xs, n=3):
    xs = list(xs)[:n]
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


def growth(rows):
    v = [r for r in rows if r.get("avg_viewers") is not None]
    if len(v) >= 6:
        recent, before = [r["avg_viewers"] for r in v[-3:]], [r["avg_viewers"] for r in v[-6:-3]]
        a, b, basis = statistics.mean(recent), statistics.mean(before), "your last 3 streams vs the 3 before"
    elif len(v) >= 3:
        a, b, basis = v[-1]["avg_viewers"], statistics.mean(r["avg_viewers"] for r in v[:-1]), "your last stream vs your earlier average"
    else:
        return None
    d = pct(a, b)
    if abs(d) < 10:
        return {"tag": "Growth", "weight": 40, "basis": basis,
                "title": f"Average viewers are steady at about {a:.1f}",
                "detail": f"{a:.1f} recently vs {b:.1f} before ({d:+.0f}%).",
                "tip": "Steady is a good base. Change one thing at a time (game, start time or length) and watch this number to see what moves it."}
    up = d > 0
    return {"tag": "Growth", "weight": 90 if up else 95, "basis": basis,
            "title": f"Average viewers are {'up' if up else 'down'} {abs(d):.0f}%",
            "detail": f"{a:.1f} recently vs {b:.1f} before.",
            "tip": "Whatever changed recently is working: keep the same games, times and length while it lasts." if up
            else "Compare your recent streams in the Streams tab: game, start time and length are the usual suspects."}


def best_game(live):
    by = defaultdict(lambda: {"v": [], "streams": set()})
    for start, st in live.get("streams", {}).items():
        for t, v, g in st["samples"]:
            by[g]["v"].append(v)
            by[g]["streams"].add(start)
    games = [(g, statistics.mean(x["v"]), len(x["streams"])) for g, x in by.items() if len(x["streams"]) >= 2 and len(x["v"]) >= 6]
    if len(games) < 2:
        return None
    games.sort(key=lambda x: -x[1])
    top, rest = games[0], games[1:]
    other = statistics.mean(g[1] for g in rest)
    d = pct(top[1], other)
    if d < 15:
        return None
    return {"tag": "Games", "weight": 85, "basis": f"{sum(g[2] for g in games)} game sessions across streams",
            "title": f"{top[0]} draws your biggest audience",
            "detail": f"{top[1]:.1f} avg viewers in {top[0]} vs {other:.1f} in {names(g[0] for g in rest)} ({d:+.0f}%).",
            "tip": f"Lead with {top[0]}, or open your stream with it before switching, so the bigger audience is there early."}


def discoverability(category):
    c = [g for g in category if g.get("top_pct") is not None and g["samples"] >= 6]
    if len(c) < 2:
        return None
    c.sort(key=lambda g: g["top_pct"])
    best, worst = c[0], c[-1]
    if worst["top_pct"] - best["top_pct"] < 15:
        return None
    return {"tag": "Category", "weight": 70, "basis": "your rank among all live channels while you streamed",
            "title": f"You're easier to find in {best['game']}",
            "detail": f"You rank in the top {best['top_pct']:.0f}% of live {best['game']} channels, but only the top {worst['top_pct']:.0f}% in {worst['game']} "
                      f"({best['channels']:.0f} vs {worst['channels']:.0f} channels live).",
            "tip": "Browsers scroll from the top of a category. Categories where you land near the top get you seen by more new people."}


def viewer_shape(curves, rows):
    by_id = {r["id"]: r for r in rows}
    buckets = defaultdict(list)
    used = 0
    for vid, c in curves.items():
        pts = c.get("viewers", [])
        r = by_id.get(vid)
        if len(pts) < 6 or not r or not r.get("avg_viewers"):
            continue
        used += 1
        for m, v in pts:
            buckets[int(m // 30)].append(v / r["avg_viewers"])
    rel = {b: statistics.mean(v) for b, v in buckets.items() if len(v) >= max(2, used // 2)}
    if used < 3 or len(rel) < 4:
        return []
    out = []
    peak_b = max(rel, key=rel.get)
    peak_t = peak_b * 30 + 15
    later = [b for b in sorted(rel) if b > peak_b and rel[b] <= rel[peak_b] * 0.75]
    lengths = [r["duration"] / 60 for r in rows if r.get("avg_viewers")]
    if later:
        drop_t = later[0] * 30 + 15
        longer = sum(1 for L in lengths if L > drop_t + 30)
        out.append({"tag": "Length", "weight": 75, "basis": f"viewer curves from {used} streams",
                    "title": f"Your audience peaks about {hm(peak_t)} in",
                    "detail": f"Viewers are highest around {hm(peak_t)} and down {100 - 100 * rel[later[0]] / rel[peak_b]:.0f}% from that peak by {hm(drop_t)}. "
                              f"{longer} of {len(lengths)} streams ran well past that.",
                    "tip": f"Put your best segment around {hm(peak_t)}. Past {hm(drop_t)}, either wrap up or switch it up to re-hook people."})
    else:
        out.append({"tag": "Length", "weight": 55, "basis": f"viewer curves from {used} streams",
                    "title": "Your viewers stick around for the whole stream",
                    "detail": f"No big drop-off: viewers are still near their peak late in your streams (peak around {hm(peak_t)}).",
                    "tip": "You have room to stream longer. More hours live means more chances to be found in the directory."})
    if 0 in rel and rel[0] < 0.7 * rel[peak_b]:
        out.append({"tag": "Timing", "weight": 60, "basis": f"viewer curves from {used} streams",
                    "title": "Viewers take a while to show up",
                    "detail": f"Your first 30 minutes average {100 - 100 * rel[0] / rel[peak_b]:.0f}% fewer viewers than your peak.",
                    "tip": "Post a go-live message (Discord, socials) 10–15 minutes before, and save the main content for after the warm-up."})
    return out


def game_switches(live):
    changes = defaultdict(list)
    for st in live.get("streams", {}).values():
        pts = sorted((ts(t), v, g) for t, v, g in st["samples"])
        for i in range(1, len(pts)):
            if pts[i][2] == pts[i - 1][2]:
                continue
            t_sw = pts[i][0]
            before = [v for t, v, g in pts[:i] if (t_sw - t).total_seconds() <= 1800]
            after = [v for t, v, g in pts[i:] if 600 <= (t - t_sw).total_seconds() <= 2700 and g == pts[i][2]]
            if before and after and statistics.mean(before) > 0:
                changes[(pts[i - 1][2], pts[i][2])].append(pct(statistics.mean(after), statistics.mean(before)))
    best = [(k, statistics.mean(v), len(v)) for k, v in changes.items() if len(v) >= 2]
    if not best:
        return None
    (a, b), d, n = max(best, key=lambda x: abs(x[1]))
    if abs(d) < 15:
        return None
    if d < 0:
        return {"tag": "Games", "weight": 72, "basis": f"{n} switches from {a} to {b}",
                "title": f"Switching from {a} to {b} costs viewers",
                "detail": f"On average you lose {abs(d):.0f}% of viewers in the 45 minutes after switching from {a} to {b}.",
                "tip": f"Do the switch later in the stream, or give chat a heads-up and a reason to stay before you change to {b}."}
    return {"tag": "Games", "weight": 65, "basis": f"{n} switches from {a} to {b}",
            "title": f"Switching from {a} to {b} brings viewers in",
            "detail": f"Viewers go up about {d:.0f}% in the 45 minutes after you switch from {a} to {b}.",
            "tip": f"Use the switch to {b} as a planned mid-stream boost, and announce it in your title."}


def start_times(rows):
    v = [r for r in rows if r.get("avg_viewers") is not None]
    if len(v) < 4:
        return None
    buckets = defaultdict(list)
    for r in v:
        buckets[ts(r["date"]).hour // 3].append(r["avg_viewers"])
    ok = {b: x for b, x in buckets.items() if len(x) >= 2}
    if len(ok) < 2:
        return None
    best = max(ok, key=lambda b: statistics.mean(ok[b]))
    others = [x for b, xs in buckets.items() if b != best for x in xs]
    a, o = statistics.mean(ok[best]), statistics.mean(others)
    d = pct(a, o)
    if d < 15:
        return None
    return {"tag": "Timing", "weight": 80, "basis": f"{len(v)} streams with viewer data",
            "title": f"Your best start time is [[hour:{best * 3}]]–[[hour:{best * 3 + 3}]]",
            "detail": f"Streams starting then average {a:.1f} viewers vs {o:.1f} at other times ({d:+.0f}%).",
            "tip": "Shift more of your streams into that window, and keep it consistent so regulars know when to show up."}


def best_slots(landscape):
    if not landscape:
        return None
    g = landscape[0]
    if g["slots_sampled"] < 40:
        return None
    cells = [(c[3], i, c[0]) for i, c in enumerate(g["cells"]) if c[0] >= 2]
    if len(cells) < 20:
        return None
    cells.sort(reverse=True)
    med = statistics.median(c[0] for c in cells)
    top = cells[:3]
    return {"tag": "Timing", "weight": 68, "basis": f"{g['samples']} hourly samples of {g['game']}",
            "title": f"Least crowded {g['game']} hours: " + ", ".join(f"[[slot:{i}]]" for _, i, _ in top),
            "detail": f"Those hours average {statistics.mean(c[0] for c in top):.1f} viewers per live channel vs {med:.1f} typically.",
            "tip": "More viewers per channel means less competition for attention. Try a stream in one of those windows."}


def peers(top_peers, category):
    p = [x for x in top_peers if x["streams"] >= 2][:3]
    if not p:
        return None
    game = category[0]["game"] if category else "your category"
    return {"tag": "Network", "weight": 58, "basis": "channels near your viewer count while you were live",
            "title": f"Channels your size you keep running into: {names(x['login'] for x in p)}",
            "detail": f"They're often live in {game} at the same time as you, with a similar audience (~"
                      f"{statistics.mean(x['avg_viewers'] for x in p):.0f} viewers).",
            "tip": "Natural raid and collab partners: similar size, same audience, same hours. Raid one at the end of your next stream."}


def returning(retention):
    r = [x for x in retention if x["new"] >= 3]
    if len(r) < 3:
        return None
    rate = statistics.mean(x["rate"] for x in r)
    if rate < 25:
        return {"tag": "Community", "weight": 78, "basis": f"new chatters from {len(r)} streams",
                "title": f"Only {rate:.0f}% of first-time chatters come back",
                "detail": f"Of the people who chatted for the first time, about {rate:.0f}% chatted again within 30 days.",
                "tip": "Greet first-time chatters by name and ask them something back. Turning one-timers into regulars is the cheapest growth there is."}
    if rate >= 40:
        return {"tag": "Community", "weight": 45, "basis": f"new chatters from {len(r)} streams",
                "title": f"{rate:.0f}% of first-time chatters come back",
                "detail": "That's a strong return rate: new people who talk in your chat tend to stick around.",
                "tip": "Your bottleneck is reach, not retention. Focus on getting found (categories, times, clips)."}
    return None


def lapsed(lapsed_list):
    if not lapsed_list:
        return None
    n = len(lapsed_list)
    return {"tag": "Community", "weight": 62, "basis": "chatters with 3+ streams who missed your last 3",
            "title": f"{n} regular{'s' if n != 1 else ''} stopped showing up",
            "detail": f"{names([x['name'] for x in lapsed_list])} chatted in several streams but none of your last 3.",
            "tip": "A quick shoutout or message can bring regulars back. They're also worth asking what changed."}


def clip_moments(rows, moments):
    if not rows:
        return None
    last = rows[-1]
    big = sorted((m for m in moments.get(last["id"], []) if m["x"] >= 5), key=lambda m: -m["x"])
    if not big:
        return None
    t = big[0]["t"]
    h, rem = divmod(int(t), 3600)
    stamp = f"{h}:{rem // 60:02d}:{rem % 60:02d}" if h else f"{rem // 60}:{rem % 60:02d}"
    return {"tag": "Clips", "weight": 66, "basis": "chat spikes in your last stream",
            "title": f"Your last stream has {len(big)} clip-worthy moment{'s' if len(big) != 1 else ''}",
            "detail": f"Biggest one at {stamp}: chat hit {big[0]['x']}× its normal pace.",
            "tip": "Cut these into Shorts/TikToks. Clips are how most small streamers get discovered. All of them are in the Clips tab."}


def follow_conversion(rows):
    v = [r for r in rows if r.get("follow_rate") is not None and r.get("viewer_hours", 0) >= 5]
    if len(v) < 3:
        return None
    best = max(v, key=lambda r: r["follow_rate"])
    avg = statistics.mean(r["follow_rate"] for r in v)
    if best["follow_rate"] < avg * 1.4 or best["follow_rate"] == 0:
        return None
    return {"tag": "Growth", "weight": 64, "basis": f"{len(v)} streams with follower data",
            "title": f"“{best['title'][:60]}” turned viewers into followers best",
            "detail": f"{best['follow_rate']:.1f} followers per 10 hours watched, vs your average of {avg:.1f}.",
            "tip": "Look at what was different about that stream (game, title, time, energy) and do more of it."}


def engagement(rows):
    v = [r for r in rows if r.get("engagement") is not None]
    if len(v) < 4:
        return None
    last, avg = v[-1]["engagement"], statistics.mean(r["engagement"] for r in v[:-1])
    d = pct(last, avg)
    when = "your last stream" if v[-1] is rows[-1] else f"\u201c{v[-1]['title'][:50]}\u201d"
    if d <= -25:
        return {"tag": "Engagement", "weight": 57, "basis": f"{len(v)} streams",
                "title": f"Chat was quieter than usual on {when}",
                "detail": f"{last:.1f} different chatters per average viewer, vs {avg:.1f} normally ({d:+.0f}%). More people watched without talking.",
                "tip": "Pull lurkers in with polls, predictions and direct questions to chat."}
    if d >= 25:
        return {"tag": "Engagement", "weight": 50, "basis": f"{len(v)} streams",
                "title": f"Chat was unusually active on {when}",
                "detail": f"{last:.1f} different chatters per average viewer, vs {avg:.1f} normally ({d:+.0f}%).",
                "tip": "Note what got people talking and bring it back."}
    return None


TABS = {"Growth": "trends", "Games": "category", "Category": "category", "Length": "streams", "Timing": "category",
        "Network": "category", "Community": "community", "Clips": "clips", "Engagement": "trends"}


def locked(rows, curves, live, landscape, retention, have_tags):
    """What still needs more data, with progress, so the page can say what's coming."""
    viewer = sum(1 for r in rows if r.get("avg_viewers") is not None)
    tracked = sum(1 for c in curves.values() if len(c.get("viewers", [])) >= 6)
    per_game = defaultdict(set)
    for start, st in live.get("streams", {}).items():
        for _, _, g in st["samples"]:
            per_game[g].add(start)
    games_ready = sorted((len(v) for v in per_game.values()), reverse=True)
    land = landscape[0]["slots_sampled"] if landscape else 0
    follow = sum(1 for r in rows if r.get("follow_rate") is not None)
    items = [
        ("Growth", "Is your audience growing?", viewer, 3, "streams with viewer data"),
        ("Length", "When viewers arrive and leave", tracked, 3, "streams recorded live"),
        ("Timing", "Your best start time", viewer, 4, "streams with viewer data"),
        ("Games", "Which game draws the biggest audience", min(games_ready[1] if len(games_ready) > 1 else 0, 2), 2, "streams in a 2nd game"),
        ("Timing", "Least crowded hours in your category", land, 40, "hours of category samples"),
        ("Community", "Do first-time chatters come back?", len(retention), 3, "streams"),
        ("Growth", "Which stream converted viewers to followers best", follow, 3, "streams with follower data"),
    ]
    return [{"tag": t, "title": title, "have": min(h, need), "need": need, "unit": unit}
            for t, title, h, need, unit in items if h < need and title not in have_tags]


def build(rows, curves, live, category, top_peers, landscape, retention, lapsed_list, moments):
    out = [growth(rows), best_game(live), discoverability(category), *viewer_shape(curves, rows), game_switches(live),
           start_times(rows), best_slots(landscape), peers(top_peers, category), returning(retention), lapsed(lapsed_list),
           clip_moments(rows, moments), follow_conversion(rows), engagement(rows)]
    tips = sorted((i for i in out if i), key=lambda i: -i["weight"])
    for t in tips:
        t["tab"] = TABS.get(t["tag"], "overview")
    return {"tips": tips, "locked": locked(rows, curves, live, landscape, retention, set())}
