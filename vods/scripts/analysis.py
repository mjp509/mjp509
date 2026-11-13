"""Insights built on top of chat stats + live-monitor data: comparisons, trends, curves, category, peers, best times."""
import statistics
from datetime import datetime, timedelta, timezone

import vodlib
from insights import DIR, FOL, LAND, LIVE

FMT = "%Y-%m-%dT%H:%M:%SZ"
# key, label, higher is better
METRICS = [
    ("avg_viewers", "Avg viewers", True),
    ("peak_viewers", "Peak viewers", True),
    ("followers_gained", "Followers gained", True),
    ("subs_change", "Sub change", True),
    ("cat_top_pct", "Category rank (top %)", False),
    ("mpm", "Chat msgs / min", True),
    ("chatters", "Unique chatters", True),
    ("new", "New chatters", True),
    ("return_rate", "Returning chatters %", True),
    ("engagement", "Chatters per viewer", True),
    ("follow_rate", "Followers per 10h watched", True),
    ("hours", "Stream length (h)", None),
]


def ts(s):
    return datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def median(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def time_avg(points):
    """Time-weighted mean of [(datetime, value)] sampled irregularly."""
    if not points:
        return None
    if len(points) == 1:
        return float(points[0][1])
    area = span = 0.0
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        dt = (t1 - t0).total_seconds()
        area += (v0 + v1) / 2 * dt
        span += dt
    return area / span if span else float(points[0][1])


def link_live(per_stream, live):
    """Match monitor streams (keyed by start time) to VOD rows by start time."""
    out = {}
    for start, st in live.get("streams", {}).items():
        t = ts(start)
        best = min(per_stream, key=lambda r: abs((ts(r["date"]) - t).total_seconds()), default=None)
        if best and abs((ts(best["date"]) - t).total_seconds()) <= 1800:
            out[best["id"]] = (t, st)
    return out


def enrich(per_stream, live_by_id):
    curves = {}
    manual = vodlib.load(DIR / "manual.json", {})
    for i, r in enumerate(per_stream):
        r["hours"] = round(r["duration"] / 3600, 2)
        r["return_rate"] = round(100 * r["returning"] / r["chatters"], 1) if r["chatters"] and i > 0 else None
        link = live_by_id.get(r["id"])
        if not link:
            man = manual.get(r["id"])
            if man:
                for k in ("avg_viewers", "peak_viewers", "followers_gained"):
                    if man.get(k) is not None:
                        r[k] = man[k]
                if r.get("avg_viewers") is not None:
                    r["viewer_hours"] = round(r["avg_viewers"] * r["duration"] / 3600, 1)
                r["manual"] = True
            continue
        start, st = link
        pts = sorted((ts(t), v) for t, v, _ in st["samples"])
        r["avg_viewers"] = round(time_avg(pts), 1)
        r["peak_viewers"] = max(v for _, v in pts)
        r["viewer_hours"] = round(r["avg_viewers"] * r["duration"] / 3600, 1)
        pcts = [100 * c[2] / c[3] for c in st["cat"] if c[2] and c[3]]
        r["cat_top_pct"] = round(median(pcts), 1) if pcts else None
        r["cat_rank"] = median([c[2] for c in st["cat"]])
        r["cat_channels"] = median([c[3] for c in st["cat"]])
        fl = sorted(st.get("followers", []))
        if fl:
            r["followers_end"] = fl[-1][1]
            r["followers_gained"] = fl[-1][1] - fl[0][1] if len(fl) > 1 else None
        sb = sorted(st.get("subs", []))
        if len(sb) > 1:
            r["subs_change"] = sb[-1][1] - sb[0][1]
        curves[r["id"]] = {
            "followers": [[round((ts(t) - start).total_seconds() / 60, 1), n] for t, n in fl],
            "viewers": [[round((t - start).total_seconds() / 60, 1), v] for t, v in pts],
            "rank": [[round((ts(c[0]) - start).total_seconds() / 60, 1), c[2], c[3], c[1]] for c in st["cat"]],
        }
    for r in per_stream:  # ratios Twitch's Stream Summary doesn't show
        if r.get("avg_viewers"):
            r["engagement"] = round(r["chatters"] / r["avg_viewers"], 2)
        if r.get("followers_gained") is not None and r.get("viewer_hours"):
            r["follow_rate"] = round(10 * r["followers_gained"] / r["viewer_hours"], 2)
    return curves


def report(per_stream):
    """Last stream vs the 10 before it, plus all-time placement."""
    if not per_stream:
        return None
    last, prev = per_stream[-1], per_stream[:-1]
    rows = []
    for key, label, higher in METRICS:
        val = last.get(key)
        if val is None:
            continue
        hist = [r[key] for r in prev[-10:] if r.get(key) is not None]
        base = statistics.mean(hist) if hist else None
        allv = [r[key] for r in per_stream if r.get(key) is not None]
        order = sorted(allv, reverse=higher is not False)
        rows.append({"key": key, "label": label, "higher": higher, "value": val,
                     "baseline": round(base, 2) if base is not None else None, "baseline_n": len(hist),
                     "delta_pct": round(100 * (val - base) / base, 1) if base else None,
                     "place": order.index(val) + 1, "of": len(allv),
                     "best": higher is not None and len(allv) > 1 and order.index(val) == 0})
    return {"id": last["id"], "title": last["title"], "date": last["date"], "metrics": rows}


def retention(per_stream, present, news):
    out = []
    for i, r in enumerate(per_stream):
        d = ts(r["date"])
        later = [present[j] for j in range(i + 1, len(per_stream)) if ts(per_stream[j]["date"]) - d <= timedelta(days=30)]
        if not later or not news[i]:
            continue
        back = len(news[i] & set().union(*later))
        out.append({"id": r["id"], "date": r["date"], "new": len(news[i]), "came_back": back,
                    "rate": round(100 * back / len(news[i]), 1)})
    return out


def regulars(per_stream, present, days=30):
    if not per_stream:
        return 0
    end = ts(per_stream[-1]["date"])
    seen = {}
    for r, people in zip(per_stream, present):
        if end - ts(r["date"]) <= timedelta(days=days):
            for p in people:
                seen[p] = seen.get(p, 0) + 1
    return sum(1 for n in seen.values() if n >= 3)


def category(live):
    games, peers = {}, {}
    for st in live.get("streams", {}).values():
        for t, v, g in st["samples"]:
            games.setdefault(g, {"v": [], "pct": [], "rank": [], "ch": [], "cv": [], "med": []})["v"].append(v)
        for t, g, rank, ch, cv, trunc, med in st["cat"]:
            x = games.setdefault(g, {"v": [], "pct": [], "rank": [], "ch": [], "cv": [], "med": []})
            if rank and ch:
                x["pct"].append(100 * rank / ch)
                x["rank"].append(rank)
            x["ch"].append(ch)
            x["cv"].append(cv)
            x["med"].append(med)
        for login, (n, total) in st["peers"].items():
            p = peers.setdefault(login, {"streams": 0, "samples": 0, "total": 0})
            p["streams"] += 1
            p["samples"] += n
            p["total"] += total
    by_game = [{"game": g, "samples": len(x["v"]), "avg_viewers": round(statistics.mean(x["v"]), 1),
                "top_pct": round(median(x["pct"]), 1) if x["pct"] else None, "rank": median(x["rank"]),
                "channels": median(x["ch"]), "category_viewers": median(x["cv"]), "typical_channel": median(x["med"]),
                "viewers_per_channel": round(median(x["cv"]) / median(x["ch"]), 1) if x["ch"] and median(x["ch"]) else None}
               for g, x in games.items() if x["v"]]
    by_game.sort(key=lambda x: -x["samples"])
    top_peers = sorted(({"login": l, "streams": p["streams"], "samples": p["samples"],
                         "avg_viewers": round(p["total"] / p["samples"], 1)} for l, p in peers.items()),
                       key=lambda p: (-p["streams"], -p["samples"]))[:15]
    return by_game, top_peers


def landscape(land):
    out = []
    for gid, g in land.get("games", {}).items():
        cells = []
        for n, ch, cv, med in g["b"]:
            cells.append([n, round(ch / n, 1), round(cv / n), round(cv / ch, 2) if ch else 0, round(med / n, 1)]
                         if n else [0, 0, 0, 0, 0])
        filled = sum(1 for c in cells if c[0])
        out.append({"gid": gid, "game": g["name"], "slots_sampled": filled, "samples": sum(c[0] for c in cells), "cells": cells})
    out.sort(key=lambda x: -x["samples"])
    return out


def counts_history(idx):
    """Daily series for followers (idx 1) or subs (idx 2) with 7/30-day change."""
    days = sorted(vodlib.load(FOL, {"days": {}})["days"].items())
    pts = [[d, v[idx]] for d, v in days if len(v) > idx and v[idx] is not None]
    if not pts:
        return None
    now_d, now_n = pts[-1]

    def change(days_back):
        cutoff = (datetime.strptime(now_d, "%Y-%m-%d") - timedelta(days=days_back)).strftime("%Y-%m-%d")
        older = [p for p in pts if p[0] <= cutoff]
        base = older[-1] if older else pts[0]
        return {"gained": now_n - base[1], "since": base[0], "full": bool(older)}
    return {"current": now_n, "as_of": now_d, "history": pts, "d7": change(7), "d30": change(30)}


def build(per_stream, present, news, lapsed=(), moments=None):
    live, land = vodlib.load(LIVE, {"streams": {}}), vodlib.load(LAND, {"games": {}})
    live_by_id = link_live(per_stream, live)
    curves = enrich(per_stream, live_by_id)
    by_game, peers = category(live)
    land_list = landscape(land)
    ret = retention(per_stream, present, news)
    try:
        import advice
        tips = advice.build(per_stream, curves, live, by_game, peers, land_list, ret, list(lapsed), moments or {})
    except Exception as e:
        print(f"::warning::advice skipped: {e}")
        tips = []
    starts = sorted(live.get("streams", {}))
    trend_keys = [k for k, _, _ in METRICS]
    return {
        "monitor": {"live_streams": len(live.get("streams", {})), "linked": len(live_by_id),
                    "since": starts[0] if starts else None, "folded_until": live.get("folded_until") or None},
        "metrics": [{"key": k, "label": l, "higher": h} for k, l, h in METRICS],
        "report": report(per_stream),
        "trends": [{"id": r["id"], "date": r["date"], "title": r["title"], **{k: r.get(k) for k in trend_keys}}
                   for r in per_stream],
        "curves": curves,
        "retention": ret,
        "advice": tips,
        "regulars_30d": regulars(per_stream, present),
        "category": by_game,
        "peers": peers,
        "landscape": land_list,
        "followers": counts_history(1),
        "subs": counts_history(2),
    }
