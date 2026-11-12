# itsmotch VODs

Static VOD site: YouTube player + synced Twitch chat replay.

## Setup (once)
1. Merge this branch into `main`.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Custom domain: **Settings → Pages → Custom domain**, then add the DNS records GitHub shows at your registrar.

## Add a VOD
1. Twitch dashboard → Content → Video Producer → VOD → **Export** to YouTube (set to Unlisted).
2. GitHub → **Actions → Add VOD → Run workflow**. Paste the Twitch VOD link and YouTube link.
3. The site updates itself in about a minute.

Do this before Twitch deletes the VOD, or the chat is lost.

If chat is out of sync (e.g. the YouTube video was trimmed), rerun with an offset in seconds.
