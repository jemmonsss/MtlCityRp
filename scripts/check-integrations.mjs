import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CONFIG_PATH = path.join(process.cwd(), '_config.yml');
const TIMEOUT_MS = 10_000;

function readYamlScalar(source, key, fallback = '') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^${escaped}:\\s*(?:"([^"]*)"|'([^']*)'|([^#\\r\\n]*))`, 'm'));
  if (!match) return fallback;
  return String(match[1] ?? match[2] ?? match[3] ?? fallback).trim();
}

async function request(url, accept) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        Accept: accept,
        'User-Agent': 'MTLCityRP-Integration-Check/1.0'
      },
      redirect: 'follow',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function shortError(error) {
  return (error instanceof Error ? error.message : String(error || 'Unknown error'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

async function checkDiscord(url) {
  const response = await request(url, 'application/json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const count = Number(payload && payload.presence_count);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error('Widget response has no valid presence_count. Enable the Discord Server Widget.');
  }
  return `${payload.name || 'Discord server'} — ${count} online`;
}

async function checkFivem(url) {
  const response = await request(url, 'application/json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const server = payload && payload.Data && typeof payload.Data === 'object' ? payload.Data : payload;
  const count = Number(server && server.clients);
  if (!Number.isFinite(count) || count < 0) throw new Error('Server response has no valid player count.');
  const max = Number(server.sv_maxclients);
  return `${server.hostname || 'FiveM server'} — ${count}${Number.isFinite(max) && max > 0 ? `/${max}` : ''} players`;
}

async function checkTebex(url) {
  const response = await request(url, 'text/html,application/xhtml+xml');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) throw new Error(`Unexpected content type: ${type || 'unknown'}`);
  return `Store reachable at ${response.url}`;
}

const config = await readFile(CONFIG_PATH, 'utf8');
const discordId = readYamlScalar(config, 'discord_server_id');
const joinCode = readYamlScalar(config, 'fivem_join_code', 'xeodpe').toLowerCase();
const tebexUrl = readYamlScalar(config, 'tebex_store_url');

const checks = [
  {
    name: 'Discord widget',
    run: () => checkDiscord(process.env.DISCORD_WIDGET_URL || `https://discord.com/api/guilds/${encodeURIComponent(discordId)}/widget.json`)
  },
  {
    name: 'FiveM server',
    run: () => checkFivem(process.env.FIVEM_STATUS_URL || `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(joinCode)}`)
  },
  {
    name: 'Tebex store',
    run: () => checkTebex(process.env.TEBEX_STORE_URL || tebexUrl)
  }
];

let failures = 0;
for (const check of checks) {
  try {
    const detail = await check.run();
    console.log(`PASS  ${check.name}: ${detail}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${check.name}: ${shortError(error)}`);
  }
}

if (failures) {
  console.error(`\n${failures} integration check${failures === 1 ? '' : 's'} failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll configured public integrations passed.');
}
