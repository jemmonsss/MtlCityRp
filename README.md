# MTL City Rp website

Jekyll source for the MTL City Rp GitHub Pages site.

## Local checks

```bash
bundle install
bundle exec jekyll serve --baseurl ""
```

Open `http://127.0.0.1:4000/` and verify the home page, `/rules.html`, `/editor.html`, and `/404.html` at desktop and mobile widths.

## Deploy

Push to `main` or `master`. The workflow in `.github/workflows/deploy-gh-pages.yml` builds the site and deploys the generated `_site` artifact to GitHub Pages. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

## Configuration

Public URLs and integrations are centralized in `_config.yml`:

- `url` and `baseurl`
- Discord server ID and invite URL
- FiveM join code and link
- Tebex store URL

Team profiles are stored in `_data/team.json`. The public `/editor.html` utility formats profile JSON in the browser; it does not authenticate users or save changes to GitHub.
