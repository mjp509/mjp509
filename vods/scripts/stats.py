#!/usr/bin/env python3
"""Build site/data/stats.json from saved chat."""
import json
import re
from collections import Counter, defaultdict

import vodlib

SPAM_GAP = 10
BOTS = {"nightbot", "streamelements", "streamlabs", "moobot", "fossabot", "sery_bot", "wizebot",
        "botrixoficial", "soundalerts", "kofistreambot", "commanderroot", "streamstickers"}
TAGS = {
    "funny": {"lul", "lulw", "kekw", "omegalul", "lmao", "lmfao", "lol", "icant", "haha", "hahaha", "😂", "💀", "pepelaugh", "kekl"},
    "hype": {"w", "pog", "pogchamp", "poggers", "pogu", "clap", "ez", "gg", "letsgo", "lets", "goated", "🔥", "hypers"},
    "shock": {"huh", "what", "wtf", "monkas", "d:", "nooo", "noway", "wait", "omg", "😳"},
    "sad": {"sadge", "f", "rip", "pepehands", "nooo", "😭"},
}


STOP = {"is", "the", "this", "chat", "bro", "a", "i", "to", "it", "and", "you", "that", "of", "in", "so", "my", "me", "he", "lol"}


def text_of(body):
    parts = [body] if isinstance(body, str) else body
    toks = []
    for p in parts:
        toks += [p[2]] if isinstance(p, list) else p.split()
    return toks


def moments(chat, duration, skip_names=(), n=10):
    chat = [c for c in chat if c[1].lower() not in BOTS and c[1].lower() not in skip_names]
    if len(chat) < 50:
        return []
    win, step, lead, gap, skip, local = 30, 10, 20, 120, 180, 60
    end = max(duration, int(chat[-1][0]) + 1)
    times = [c[0] for c in chat]
    windows, j, k = [], 0, 0
    for s in range(0, end, step):
        while j < len(times) and times[j] < s:
            j += 1
        while k < len(times) and times[k] < s + win:
            k += 1
        windows.append((k - j, s, j, k))
    counts = [w[0] for w in windows]
    overall = max(1, sorted(counts)[len(counts) // 2])
    scored = []
    for i, (cnt, s, j, k) in enumerate(windows):
        if s < skip:
            continue
        near = sorted(counts[max(0, i - local):i + local + 1])
        base = max(1, near[len(near) // 2], overall * 0.5)
        if cnt >= base * 3 and cnt >= 8:
            scored.append((cnt / base, cnt, s, j, k))
    picked = []
    for ratio, cnt, s, j, k in sorted(scored, reverse=True):
        if len(picked) >= n:
            break
        if any(abs(s - p["t"] - lead) < gap for p in picked):
            continue
        toks = Counter()
        for c in chat[j:k]:
            toks.update(set(t.lower() for t in text_of(c[3])))
        scores = {tag: sum(toks[w] for w in words) for tag, words in TAGS.items()}
        tag = max(scores, key=scores.get)
        top = [t for t, _ in toks.most_common(15) if len(t) > 1 and t not in STOP][:3]
        picked.append({"t": max(0, s - lead), "x": round(ratio, 1), "count": cnt,
                       "tag": tag if scores[tag] >= cnt * 0.15 else "spike", "words": top})
    return sorted(picked, key=lambda p: p["t"])


def main():
    channel = vodlib.load(vodlib.DATA / "channel.json", {})
    me = (channel.get("name") or "itsmotch").lower()
    streams = sorted(vodlib.load(vodlib.VODS, []) + vodlib.load(vodlib.PENDING, []), key=lambda v: v["date"])

    seen, attendance, msg_count, last_seen = set(), Counter(), Counter(), {}
    per_stream, by_game, hour_tot, hour_n, emotes = [], defaultdict(lambda: [0.0, 0, set()]), Counter(), Counter(), Counter()
    present, all_moments = [], {}
    monthly, display, colors = defaultdict(Counter), {}, {}

    for v in streams:
        path = vodlib.DATA / "chat" / f"{v['id']}.json"
        if not path.exists():
            continue
        chat = json.loads(path.read_text(encoding="utf-8"))
        dur = max(v.get("duration") or 0, int(chat[-1][0]) + 1 if chat else 0, 60)

        chatters = set()
        month = v["date"][:7]
        last_counted = {}
        for t, name, color, body in chat:
            lname = name.lower()
            if lname in BOTS or lname == me:
                continue
            chatters.add(lname)
            msg_count[lname] += 1
            if t - last_counted.get(lname, -SPAM_GAP) >= SPAM_GAP:
                monthly[month][lname] += 1
                last_counted[lname] = t
            display[lname] = name
            if color:
                colors[lname] = color
            if not isinstance(body, str):
                for p in body:
                    if isinstance(p, list):
                        emotes[(p[0], p[1], p[2])] += 1
        new = chatters - seen
        seen |= chatters
        for c in chatters:
            attendance[c] += 1
            last_seen[c] = v["date"]
        present.append(chatters)

        per_stream.append({"id": v["id"], "title": v["title"], "date": v["date"], "duration": dur,
                           "messages": len(chat), "mpm": round(len(chat) / (dur / 60), 2),
                           "chatters": len(chatters), "new": len(new), "returning": len(chatters) - len(new)})

        chapters = v.get("chapters") or [{"t": 0, "game": v.get("game") or "Unknown"}]
        for i, ch in enumerate(chapters):
            a, b = ch["t"], chapters[i + 1]["t"] if i + 1 < len(chapters) else dur
            if b <= a:
                continue
            g = by_game[ch["game"] or "Unknown"]
            g[0] += (b - a) / 60
            g[1] += sum(1 for c in chat if a <= c[0] < b)
            g[2].add(v["id"])

        for h in range(int(dur // 3600) + 1):
            mins = min(60, (dur - h * 3600) / 60)
            if mins >= 20:
                hour_tot[h] += sum(1 for c in chat if h * 3600 <= c[0] < (h + 1) * 3600) / mins
                hour_n[h] += 1

        all_moments[v["id"]] = moments(chat, dur, {me})

    lapsed = []
    if len(present) >= 6:
        recent = set().union(*present[-3:])
        lapsed = [{"name": n, "streams": attendance[n], "last": last_seen[n]}
                  for n in attendance if attendance[n] >= 3 and n not in recent]
        lapsed.sort(key=lambda x: -x["streams"])

    stv_used = {k[2] for k in emotes if k[0] == "7"}
    stv_set = vodlib.seventv_emotes(channel.get("id"), include_global=False) if channel.get("id") else {}

    stats = {
        "overview": {
            "streams": len(per_stream),
            "hours": round(sum(s["duration"] for s in per_stream) / 3600, 1),
            "messages": sum(s["messages"] for s in per_stream),
            "chatters": len(seen),
            "mpm": round(sum(s["messages"] for s in per_stream) / max(1, sum(s["duration"] for s in per_stream) / 60), 2),
        },
        "streams": per_stream,
        "games": sorted(({"game": g, "hours": round(m / 60, 1), "messages": n, "streams": len(ids),
                          "mpm": round(n / m, 2)} for g, (m, n, ids) in by_game.items() if m >= 10),
                        key=lambda x: -x["mpm"]),
        "by_hour": [{"hour": h, "mpm": round(hour_tot[h] / hour_n[h], 2), "streams": hour_n[h]} for h in sorted(hour_n)],
        "top_chatters": [{"name": n, "messages": c, "streams": attendance[n]} for n, c in msg_count.most_common(20)],
        "lapsed": lapsed[:15],
        "emotes": [{"src": k[0], "id": k[1], "name": k[2], "count": c} for k, c in emotes.most_common(24)],
        "unused_7tv": sorted(n for n in stv_set if n not in stv_used)[:60],
        "moments": all_moments,
    }
    vodlib.save(vodlib.DATA / "stats.json", stats)
    vodlib.save(vodlib.DATA / "leaderboard.json", [
        {"month": m, "top": [{"name": display[n], "color": colors.get(n, ""), "messages": c}
                             for n, c in monthly[m].most_common(3)]}
        for m in sorted(monthly, reverse=True)[:12]])
    print(f"stats: {len(per_stream)} streams, {len(seen)} chatters")


if __name__ == "__main__":
    main()
