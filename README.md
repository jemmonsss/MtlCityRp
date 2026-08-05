# MTL City Rp website

Jekyll source for the MTL City Rp GitHub Pages site.

## Live integrations

The site uses a layered approach so status cards keep working even when a browser blocks a cross-origin request:

1. An optional allow-listed proxy configured with `api_proxy_url`.
2. Direct public Discord Widget and FiveM server-list requests from the browser.
3. A same-origin `assets/data/live-status.json` snapshot generated during every deployment and every 30 minutes by GitHub Actions. Snapshots older than six hours are rejected so the site never presents very old counts as current.

No Discord bot token, FiveM license key, Tebex private key, or GitHub token is shipped to the browser.

### Discord requirements

In Discord, enable the server widget for the guild configured by `discord_server_id`. The public widget endpoint and iframe will not return live information while the widget is disabled or the server profile is private.

### FiveM requirements

Keep `fivem_join_code` set to the public Cfx.re join code. The deployment script stores only aggregate server data such as player count, max slots, description, tags, and banner URL. It does not publish player names or identifiers.

### Optional live proxy

The site works without another service. For more consistent truly-live reads, deploy the allow-listed Cloudflare Worker in `serverless/cloudflare-worker.js`, then set its URL as `api_proxy_url` in `_config.yml`. See `serverless/README.md`.

### Tebex

The default store URL is `https://mtl-scripts.tebex.io/`. The site currently links to Tebex rather than exposing checkout credentials. A custom product grid can be added later using Tebex Headless API after a public webstore identifier is supplied. Never place a Tebex private key in `_config.yml` or client-side JavaScript.

## Local checks

```bash
node --check assets/js/main.js
node --check scripts/fetch-live-status.mjs
node --check scripts/check-integrations.mjs
node scripts/check-integrations.mjs
node scripts/fetch-live-status.mjs
bundle install
bundle exec jekyll serve --baseurl ""
```

Open `http://127.0.0.1:4000/` and verify the home page, `/rules.html`, `/editor.html`, and `/404.html` at desktop and mobile widths.

The status and integration-check scripts accept optional test overrides:

```bash
DISCORD_WIDGET_URL=http://127.0.0.1:9001/discord \
FIVEM_STATUS_URL=http://127.0.0.1:9001/fivem \
TEBEX_STORE_URL=http://127.0.0.1:9001/tebex \
LIVE_STATUS_OUTPUT=/tmp/live-status.json \
node scripts/fetch-live-status.mjs
```

## Deploy

Push to `main` or `master`. The workflow in `.github/workflows/deploy-gh-pages.yml` refreshes the public status snapshot, builds the site, and deploys the generated `_site` artifact. It also runs every 30 minutes to keep the fallback snapshot current.

In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

## Configuration

Public URLs and integrations are centralized in `_config.yml`:

- `url` and `baseurl`
- `discord_server_id` and `discord_invite_url`
- `fivem_join_code` and `fivem_join_link`
- `tebex_store_url`
- `live_status_snapshot`
- `live_status_refresh_ms`
- `live_status_max_age_ms`
- `api_proxy_url`

Team profiles are stored in `_data/team.json`. The public `/editor.html` utility formats profile JSON in the browser; it does not authenticate users or save changes to GitHub.
