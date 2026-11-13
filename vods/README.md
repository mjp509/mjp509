# itsmotch VODs

Static VOD site: YouTube player + synced Twitch chat replay (with Twitch and 7TV emotes).

## Setup (once)
1. Merge this branch into `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`: register an app at dev.twitch.tv/console (redirect URL `http://localhost`, category Website Integration).
   - `YOUTUBE_API_KEY`: console.cloud.google.com → new project → enable "YouTube Data API v3" → Credentials → API key.
   - `YOUTUBE_CHANNEL_ID`: starts with `UC`, shown at youtube.com/account_advanced.
4. Custom domain: **Settings → Pages → Custom domain**, then at your registrar:
   - Subdomain (e.g. `vods.itsmotch.com`): `CNAME vods → mjp509.github.io`
   - Root domain (e.g. `itsmotch.com`): `A` records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` + `CNAME www → mjp509.github.io`
   - On Cloudflare, set these records to **DNS only** (grey cloud).
   - Once the check passes, tick **Enforce HTTPS**.

## After each stream
Upload the VOD to YouTube as **Public** with the **same title** as on Twitch. That's it.

Every 2 hours, **Sync VODs** saves the chat for new Twitch VODs and publishes each one once its YouTube upload appears.

## Unlisted uploads (optional)
Add secrets `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` (Google OAuth, scope `youtube.readonly`, signed in as the channel owner).
The sync then sees unlisted uploads and matches them by title or length, so no Add VOD step is needed.

## Manual
- **Actions → Sync VODs → Run workflow**: sync now.
- **Actions → Add VOD**: paste the YouTube link (unlisted is fine). Leave the Twitch link blank to attach it to your newest saved stream, or paste one to pick a specific VOD.

## Stats
Leaderboard counts at most 1 message per 10s per chatter.

Open `/stats.html` on your site (not linked anywhere, not indexed by search engines). Updates after every sync:
clip finder, chat activity by game / hour / day / start time, new vs returning chatters, top chatters,
regulars who stopped coming, emote usage, unused 7TV emotes.
