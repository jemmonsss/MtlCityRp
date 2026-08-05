# Optional live API proxy

The site works without this proxy by trying the public APIs directly and then using the GitHub Actions-generated `assets/data/live-status.json` snapshot.

For more consistent live reads when a browser or upstream service blocks cross-origin requests:

1. Create a Cloudflare Worker.
2. Paste `cloudflare-worker.js` into the Worker editor.
3. Add these optional Worker variables in **Settings → Variables**:
   - `ALLOWED_ORIGINS`: comma-separated origins, for example `https://jemmonsss.github.io,https://example.com`
   - `DISCORD_GUILD_ID`: defaults to `1461098178169540763`
   - `FIVEM_JOIN_CODE`: defaults to `xeodpe`
4. Deploy the Worker.
5. Set `api_proxy_url` in `_config.yml` to the Worker URL.

`ALLOWED_ORIGINS` contains origins only, not paths. For the current GitHub Pages project URL, use `https://jemmonsss.github.io`.

The Worker is intentionally allow-listed and only proxies the configured public Discord widget and FiveM server endpoints. Do not turn it into an unrestricted URL proxy. It does not need or expose a Discord bot token, a FiveM license key, or a Tebex private key.
