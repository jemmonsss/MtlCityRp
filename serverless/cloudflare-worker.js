/**
 * Optional allow-listed proxy for the MTL City Rp GitHub Pages site.
 * Deploy as a Cloudflare Worker, then set api_proxy_url in _config.yml.
 *
 * Optional Worker variables:
 * - ALLOWED_ORIGINS: comma-separated origins
 * - DISCORD_GUILD_ID
 * - FIVEM_JOIN_CODE
 *
 * No Discord bot token, Tebex private key, or other secret is required.
 */
const DEFAULT_ALLOWED_ORIGINS = 'https://jemmonsss.github.io';
const DEFAULT_DISCORD_GUILD_ID = '1461098178169540763';
const DEFAULT_FIVEM_JOIN_CODE = 'xeodpe';

function parseAllowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(body, status, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin)
  });
}

export default {
  async fetch(request, env) {
    const origin = (request.headers.get('Origin') || '').replace(/\/$/, '');
    const allowedOrigins = parseAllowedOrigins(env);
    const originAllowed = origin && allowedOrigins.has(origin);

    if (request.method === 'OPTIONS') {
      if (!originAllowed) return jsonResponse({ error: 'Origin not allowed.' }, 403);
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed.' }, 405, originAllowed ? origin : '');
    }
    if (!originAllowed) {
      return jsonResponse({ error: 'Origin not allowed.' }, 403);
    }

    const discordGuildId = String(env.DISCORD_GUILD_ID || DEFAULT_DISCORD_GUILD_ID).trim();
    const fivemJoinCode = String(env.FIVEM_JOIN_CODE || DEFAULT_FIVEM_JOIN_CODE).trim().toLowerCase();
    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('target');
    let upstreamUrl = '';

    if (target === 'discord' && requestUrl.searchParams.get('guild_id') === discordGuildId) {
      upstreamUrl = `https://discord.com/api/guilds/${encodeURIComponent(discordGuildId)}/widget.json`;
    } else if (target === 'fivem' && requestUrl.searchParams.get('join_code')?.toLowerCase() === fivemJoinCode) {
      upstreamUrl = `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(fivemJoinCode)}`;
    } else {
      return jsonResponse({ error: 'Unknown or disallowed target.' }, 400, origin);
    }

    try {
      const response = await fetch(upstreamUrl, {
        headers: { Accept: 'application/json' },
        cf: { cacheEverything: true, cacheTtl: 30 }
      });

      if (!response.ok) {
        return jsonResponse({ error: `Upstream returned ${response.status}.` }, response.status, origin);
      }

      const payload = await response.json();
      if (!payload || typeof payload !== 'object') {
        return jsonResponse({ error: 'Upstream returned invalid JSON.' }, 502, origin);
      }

      return jsonResponse(payload, 200, origin);
    } catch (error) {
      return jsonResponse({ error: 'Upstream API unavailable.' }, 502, origin);
    }
  }
};
