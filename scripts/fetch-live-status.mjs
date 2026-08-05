import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, '_config.yml');
const outputSetting = process.env.LIVE_STATUS_OUTPUT || 'assets/data/live-status.json';
const OUTPUT_PATH = path.isAbsolute(outputSetting) ? outputSetting : path.join(ROOT, outputSetting);
const REQUEST_TIMEOUT_MS = 10_000;

function readYamlScalar(source, key, fallback = '') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^${escaped}:\\s*(?:"([^"]*)"|'([^']*)'|([^#\\r\\n]*))`, 'm'));
  if (!match) return fallback;
  return String(match[1] ?? match[2] ?? match[3] ?? fallback).trim();
}

function safeText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function safeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function shortError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return message.replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MTLCityRP-GitHub-Pages-Status/1.0'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('Response was not a JSON object.');
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function readLocalSnapshot() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function readPublishedSnapshot(siteUrl, baseUrl) {
  if (!siteUrl) return null;
  const normalizedBase = baseUrl ? `/${baseUrl.replace(/^\/+|\/+$/g, '')}` : '';
  const url = `${siteUrl.replace(/\/+$/, '')}${normalizedBase}/assets/data/live-status.json`;
  try {
    const snapshot = await fetchJson(url, 5_000);
    return snapshot && snapshot.version === 1 ? snapshot : null;
  } catch (error) {
    console.warn(`Previous published snapshot unavailable: ${shortError(error)}`);
    return null;
  }
}

function preserveOrFail(previous, attemptedAt, error, fallback = {}) {
  if (previous && previous.available === true) {
    return {
      ...previous,
      live: false,
      last_attempt_at: attemptedAt,
      error: shortError(error)
    };
  }
  return {
    ...fallback,
    available: false,
    live: false,
    fetched_at: null,
    last_attempt_at: attemptedAt,
    error: shortError(error)
  };
}

async function fetchDiscord(guildId, previous) {
  const attemptedAt = new Date().toISOString();
  if (!guildId) return preserveOrFail(previous, attemptedAt, 'discord_server_id is missing.');

  const url = process.env.DISCORD_WIDGET_URL || `https://discord.com/api/guilds/${encodeURIComponent(guildId)}/widget.json`;
  try {
    const payload = await fetchJson(url);
    const presenceCount = safeNumber(payload.presence_count, { min: 0, max: 10_000_000 });
    if (presenceCount === null) throw new Error('Discord widget response did not include a valid presence_count.');
    return {
      available: true,
      live: true,
      name: safeText(payload.name, 120),
      presence_count: presenceCount,
      fetched_at: attemptedAt,
      last_attempt_at: attemptedAt,
      error: null
    };
  } catch (error) {
    console.warn(`Discord status refresh failed: ${shortError(error)}`);
    return preserveOrFail(previous, attemptedAt, error, {
      name: '',
      presence_count: null
    });
  }
}

async function fetchFivem(joinCode, previous) {
  const attemptedAt = new Date().toISOString();
  if (!joinCode) return preserveOrFail(previous, attemptedAt, 'fivem_join_code is missing.');

  const url = process.env.FIVEM_STATUS_URL || `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(joinCode)}`;
  try {
    const payload = await fetchJson(url);
    const data = payload && payload.Data && typeof payload.Data === 'object' ? payload.Data : payload;
    const clients = safeNumber(data.clients, { min: 0, max: 100_000 });
    if (clients === null) throw new Error('FiveM response did not include a valid player count.');

    const vars = data.vars && typeof data.vars === 'object' ? data.vars : {};
    const tags = typeof vars.tags === 'string'
      ? vars.tags.split(',').map((tag) => safeText(tag, 40)).filter(Boolean).slice(0, 12)
      : [];

    return {
      available: true,
      live: true,
      join_code: joinCode,
      clients,
      max_clients: safeNumber(data.sv_maxclients, { min: 1, max: 100_000 }),
      hostname: safeText(data.hostname, 180),
      project_name: safeText(vars.sv_projectName, 180),
      project_description: safeText(vars.sv_projectDesc, 600),
      tags,
      banner_url: safeUrl(vars.banner_detail || vars.banner_connecting),
      fetched_at: attemptedAt,
      last_attempt_at: attemptedAt,
      error: null
    };
  } catch (error) {
    console.warn(`FiveM status refresh failed: ${shortError(error)}`);
    return preserveOrFail(previous, attemptedAt, error, {
      join_code: joinCode,
      clients: null,
      max_clients: null,
      hostname: '',
      project_name: '',
      project_description: '',
      tags: [],
      banner_url: ''
    });
  }
}

const configSource = await readFile(CONFIG_PATH, 'utf8');
const guildId = readYamlScalar(configSource, 'discord_server_id');
const joinCode = readYamlScalar(configSource, 'fivem_join_code', 'xeodpe').toLowerCase();
const siteUrl = readYamlScalar(configSource, 'url');
const baseUrl = readYamlScalar(configSource, 'baseurl');

const localSnapshot = await readLocalSnapshot();
const publishedSnapshot = process.env.SKIP_PUBLISHED_SNAPSHOT === '1' ? null : await readPublishedSnapshot(siteUrl, baseUrl);
const previous = publishedSnapshot || localSnapshot || {};

const [discord, fivem] = await Promise.all([
  fetchDiscord(guildId, previous.discord),
  fetchFivem(joinCode, previous.fivem)
]);

const snapshot = {
  version: 1,
  generated_at: new Date().toISOString(),
  discord,
  fivem
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Wrote API snapshot to ${path.relative(ROOT, OUTPUT_PATH)}.`);
