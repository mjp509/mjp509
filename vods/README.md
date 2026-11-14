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

## Auto upload to YouTube (optional)
After each stream, **Upload to YouTube** downloads the Twitch VOD and uploads it to your channel as unlisted with the Twitch title,
then the sync publishes it. Use OBS's Twitch VOD Track so the VOD has no music.
1. Google Cloud → OAuth consent screen → **Publish app** (in testing, sign-ins expire after 7 days).
2. Sign in again with scopes `youtube.upload youtube.readonly` and replace the `YT_REFRESH_TOKEN` secret.
3. **Settings → Secrets and variables → Actions → Variables**: add `AUTO_UPLOAD` = `true`.
4. Until Google audits the project (YouTube API Services audit form), uploads are locked to private:
   set each one to Unlisted in YouTube Studio and the next sync publishes it.

## Manual
- **Actions → Sync VODs → Run workflow**: sync now.
- **Actions → Add VOD**: paste the YouTube link (unlisted is fine). Leave the Twitch link blank to attach it to your newest saved stream, or paste one to pick a specific VOD.

## Live monitor
**Live monitor** runs every 10 minutes. While you're live it records viewers, your rank among live channels in your category
and similar-size channels; while offline it samples your usual categories hourly (best time to stream).
Data is kept in the Actions cache and folded into `vods/insights/` by each sync. Twitch has no viewer history,
so these stats start from the first stream after it's turned on.

Follower + sub tracking (optional): secret `TWITCH_USER_REFRESH_TOKEN`, a Twitch refresh token for the channel owner with scopes `moderator:read:followers channel:read:subscriptions`.

**Actions → Add past stream stats**: type in avg viewers, peak viewers and followers gained from Twitch's
Stream Summary for streams the live monitor didn't record (blank stream = most recent). Live-monitor data takes priority.

## Stats
Leaderboard counts at most 1 message per 10s per chatter.

Open `/stats.html` on your site (not linked anywhere, not indexed by search engines). Updates after every sync:
clip finder, chat activity by game / hour / day / start time, new vs returning chatters, top chatters,
regulars who stopped coming, emote usage, unused 7TV emotes.
