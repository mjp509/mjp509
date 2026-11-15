"""Chatter profiles with streaks and achievements, plus the last-stream recap (data/chatters.json, data/recap.json)."""
from collections import Counter

import vodlib

# id, emoji, name, how to earn it
BADGES = [
    ("og", "🌱", "Day one", "Chatted in the very first saved stream"),
    ("regular", "🍔", "Regular", "Chatted in 3 streams"),
    ("loyal", "⭐", "Loyal", "Chatted in 10 streams"),
    ("rideordie", "👑", "Ride or die", "Chatted in 25 streams"),
    ("streak3", "🔥", "On a roll", "Chatted in 3 streams in a row"),
    ("streak5", "☄️", "Unstoppable", "Chatted in 5 streams in a row"),
    ("chatterbox", "🗣️", "Chatterbox", "Sent 100 messages"),
    ("novelist", "📜", "Novelist", "Sent 1,000 messages"),
    ("emotes", "😂", "Emote enjoyer", "Used 50 emotes"),
    ("podium", "🏆", "Podium", "Finished top 3 in a monthly highscore"),
    ("bluemoon", "🌙", "Blue moon", "Caught an off-schedule stream"),
    ("nightowl", "🦉", "Night owl", "Chatted past midnight"),
]


def streaks(idxs, total):
    best = cur = run = 0
    prev = None
    for i in idxs:
        run = run + 1 if prev is not None and i == prev + 1 else 1
        best, prev = max(best, run), i
    cur = run if idxs and idxs[-1] == total - 1 else 0
    return cur, best


def build(prof, present, display, colors, msg_count, monthly, per_stream, all_moments, streams):
    total = len(present)
    podium = {n for m in monthly.values() for n, _ in m.most_common(3)}
    users = {}
    for n, p in prof.items():
        idxs = [i for i, _, _ in p["streams"]]
        cur, best = streaks(idxs, total)
        emotes = sum(p["emotes"].values())
        fav = p["emotes"].most_common(1)
        earned = {
            "og": 0 in idxs, "regular": len(idxs) >= 3, "loyal": len(idxs) >= 10, "rideordie": len(idxs) >= 25,
            "streak3": best >= 3, "streak5": best >= 5, "chatterbox": msg_count[n] >= 100, "novelist": msg_count[n] >= 1000,
            "emotes": emotes >= 50, "podium": n in podium, "bluemoon": p["bluemoon"], "nightowl": p["night"],
        }
        users[n] = {
            "n": display.get(n, n), "c": colors.get(n, ""), "m": msg_count[n], "s": len(idxs),
            "streak": cur, "best": best, "e": emotes,
            "fav": {"src": fav[0][0][0], "id": fav[0][0][1], "name": fav[0][0][2]} if fav else None,
            "first": p["first"], "last": p["streams"][-1][1] if p["streams"] else None,
            "recent": [[vid, cnt] for _, vid, cnt in p["streams"][-8:]][::-1],
            "b": [b[0] for b in BADGES if earned[b[0]]],
        }
    share = Counter(b for u in users.values() for b in u["b"])
    vodlib.save(vodlib.DATA / "chatters.json", {
        "streams": total,
        "badges": [{"id": i, "emoji": e, "name": nm, "how": how, "pct": round(100 * share[i] / max(1, len(users)))}
                   for i, e, nm, how in BADGES],
        "users": users})

    if per_stream:
        last, v = per_stream[-1], streams[-1]
        top = Counter({n: cnt for n, p in prof.items() for i, _, cnt in p["streams"] if i == total - 1})
        best = [{"t": m["t"], "words": m.get("words", []), "tag": m.get("tag", "spike")}
                for m in sorted(all_moments.get(last["id"], []), key=lambda m: -m.get("x", 0))[:3]]
        t_name = top.most_common(1)
        vodlib.save(vodlib.DATA / "recap.json", {
            "id": last["id"], "title": last["title"], "date": last["date"], "game": v.get("game", ""),
            "duration": last["duration"], "messages": last["messages"], "chatters": last["chatters"], "new": last["new"],
            "offset": v.get("offset", 0), "published": any(x.get("id") == last["id"] for x in vodlib.load(vodlib.VODS, [])),
            "top": {"name": display.get(t_name[0][0], t_name[0][0]), "color": colors.get(t_name[0][0], ""), "messages": t_name[0][1]} if t_name and t_name[0][1] else None,
            "moments": sorted(best, key=lambda m: m["t"])})
