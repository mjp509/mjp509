// Cloudflare Worker (cron trigger every 10 minutes): starts the "Live monitor" GitHub workflow.
// GitHub's own schedule runs that workflow hours late, so it misses streams; this ping doesn't.
// Needs a Worker secret GITHUB_TOKEN: a fine-grained token for mjp509/mjp509 with "Actions: Read and write".
export default {
  async scheduled(event, env, ctx) {
    const res = await fetch("https://api.github.com/repos/mjp509/mjp509/actions/workflows/monitor.yml/dispatches", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "itsmotch-monitor-ping",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!res.ok) console.log(`Dispatch failed: HTTP ${res.status} ${await res.text()}`);
  },
};
