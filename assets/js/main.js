/**
 * MTL City Rp - interactive controls and resilient live status integrations.
 */
'use strict';

(() => {
const FALLBACK_AVATAR = document.body.dataset.fallbackAvatar || 'assets/images/default-avatar.svg';
const LIVE_STATE = {
  refreshTimer: null,
  lastRefreshAt: 0,
  activeRefresh: null
};

function safeExternalUrl(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return null;

  try {
    const parsed = new URL(rawValue.trim(), window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch (error) {
    return null;
  }
}

function setImageSource(image, rawValue, fallback = FALLBACK_AVATAR) {
  if (!image) return;

  const safeSource = safeExternalUrl(rawValue) || fallback;
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback;
  };
  image.src = safeSource;
}

async function fetchJson(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
      throw new Error('The response was not a JSON object.');
    }
    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function setRichStatus(element, { icon = '', value = '', label = '' } = {}) {
  if (!element) return;

  const fragment = document.createDocumentFragment();
  if (icon) fragment.append(document.createTextNode(`${icon} `));

  if (value !== '') {
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    fragment.append(strong);
  }

  if (label) fragment.append(document.createTextNode(`${value !== '' ? ' ' : ''}${label}`));
  element.replaceChildren(fragment);
}

function renderBioLinks(container, links) {
  if (!container) return 0;
  container.replaceChildren();

  if (!Array.isArray(links)) return 0;

  let rendered = 0;
  links.forEach((link) => {
    const href = safeExternalUrl(link && link.url);
    if (!href) return;

    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = 'bio-social-link';

    const icon = document.createElement('span');
    icon.className = 'bio-link-icon';
    icon.textContent = String((link && link.icon) || '🔗');

    const text = document.createElement('span');
    text.className = 'bio-link-text';
    text.textContent = String((link && (link.label || link.name)) || 'External Link');

    const arrow = document.createElement('span');
    arrow.className = 'bio-link-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    anchor.append(icon, text, arrow);
    container.appendChild(anchor);
    rendered += 1;
  });

  return rendered;
}

window.safeExternalUrl = safeExternalUrl;
window.renderBioLinks = renderBioLinks;

function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    helper.style.pointerEvents = 'none';
    document.body.appendChild(helper);
    helper.select();

    try {
      const copied = document.execCommand('copy');
      helper.remove();
      copied ? resolve() : reject(new Error('Copy command was rejected.'));
    } catch (error) {
      helper.remove();
      reject(error);
    }
  });
}

window.copyText = copyText;

function showNotification(message) {
  const existing = document.querySelector('.city-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'city-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    max-width: min(420px, calc(100vw - 32px));
    background: rgba(22, 22, 30, 0.95);
    border: 1px solid #ff1a40;
    box-shadow: 0 10px 35px rgba(0,0,0,0.8), 0 0 20px rgba(255, 26, 64, 0.5);
    color: #fff;
    padding: 16px 26px;
    border-radius: 12px;
    font-family: 'Chakra Petch', sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 1px;
    z-index: 99999;
    backdrop-filter: blur(14px);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
    transform: translateY(40px);
    opacity: 0;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  window.setTimeout(() => {
    toast.style.transform = 'translateY(40px)';
    toast.style.opacity = '0';
    window.setTimeout(() => toast.remove(), 400);
  }, 4000);
}

window.showNotification = showNotification;

function getLiveApiConfig() {
  const element = document.getElementById('live-api-config');
  const refreshValue = Number(element && element.dataset.refreshMs);
  const maxSnapshotAgeValue = Number(element && element.dataset.maxSnapshotAgeMs);
  return {
    discordId: String((element && element.dataset.discordId) || '').trim(),
    joinCode: String((element && element.dataset.joinCode) || 'xeodpe').trim().toLowerCase(),
    joinLink: String((element && element.dataset.joinLink) || 'cfx.re/join/xeodpe').trim(),
    snapshotUrl: String((element && element.dataset.snapshotUrl) || 'assets/data/live-status.json').trim(),
    apiProxyUrl: String((element && element.dataset.apiProxyUrl) || '').trim(),
    refreshMs: Number.isFinite(refreshValue) ? Math.min(Math.max(refreshValue, 30000), 900000) : 60000,
    maxSnapshotAgeMs: Number.isFinite(maxSnapshotAgeValue)
      ? Math.min(Math.max(maxSnapshotAgeValue, 300000), 86400000)
      : 21600000
  };
}

function buildProxyUrl(baseUrl, target, values) {
  const safeBase = safeExternalUrl(baseUrl);
  if (!safeBase) return null;

  const url = new URL(safeBase);
  url.searchParams.set('target', target);
  Object.entries(values).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.href;
}

function formatStatusTime(rawValue) {
  if (!rawValue) return '';
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function isSnapshotFresh(rawValue, maxAgeMs) {
  if (!rawValue) return false;
  const timestamp = new Date(rawValue).getTime();
  if (!Number.isFinite(timestamp)) return false;

  const age = Date.now() - timestamp;
  return age >= -300000 && age <= maxAgeMs;
}

function updateSourceLabel(element, source, updatedAt) {
  if (!element) return;
  element.classList.remove('is-live', 'is-cached', 'is-unavailable');

  if (source === 'live') {
    element.classList.add('is-live');
    element.textContent = 'Live API';
    return;
  }

  if (source === 'snapshot') {
    element.classList.add('is-cached');
    const formatted = formatStatusTime(updatedAt);
    element.textContent = formatted ? `Cached ${formatted}` : 'Cached status';
    return;
  }

  element.classList.add('is-unavailable');
  element.textContent = 'Status unavailable';
}

async function loadSnapshot(config) {
  try {
    const snapshot = await fetchJson(config.snapshotUrl, 4500);
    if (snapshot.version !== 1 || typeof snapshot.generated_at !== 'string') {
      throw new Error('The live-status snapshot has an unsupported format.');
    }
    return snapshot;
  } catch (error) {
    console.warn('The same-origin live-status snapshot is unavailable.', error);
    return null;
  }
}

function normalizeDiscordPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const presenceCount = Number(payload.presence_count);
  if (!Number.isFinite(presenceCount) || presenceCount < 0) return null;

  return {
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    presenceCount
  };
}

async function requestDiscordStatus(config, snapshotPromise) {
  if (!config.discordId) return null;

  const directUrl = `https://discord.com/api/guilds/${encodeURIComponent(config.discordId)}/widget.json`;
  const proxyUrl = buildProxyUrl(config.apiProxyUrl, 'discord', { guild_id: config.discordId });
  const requestUrls = [proxyUrl, directUrl].filter(Boolean);

  for (const requestUrl of requestUrls) {
    try {
      const normalized = normalizeDiscordPayload(await fetchJson(requestUrl, 6000));
      if (normalized) return { ...normalized, source: 'live', updatedAt: new Date().toISOString() };
    } catch (error) {
      console.warn('A Discord live-status source was unavailable.', error);
    }
  }

  const snapshot = await snapshotPromise;
  const cached = snapshot && snapshot.discord;
  const updatedAt = cached && (cached.fetched_at || snapshot.generated_at || '');
  if (cached && cached.available === true && Number.isFinite(Number(cached.presence_count)) &&
      isSnapshotFresh(updatedAt, config.maxSnapshotAgeMs)) {
    return {
      name: String(cached.name || ''),
      presenceCount: Number(cached.presence_count),
      source: 'snapshot',
      verified: cached.live === true,
      updatedAt
    };
  }

  return null;
}

async function updateDiscordStatus(config, snapshotPromise) {
  const onlineCount = document.getElementById('discord-online-count');
  const serverTitle = document.getElementById('discord-server-title');
  const sourceLabel = document.getElementById('discord-data-source');
  if (!onlineCount && !serverTitle && !sourceLabel) return;

  const status = await requestDiscordStatus(config, snapshotPromise);
  if (!status) {
    setRichStatus(onlineCount, { icon: '⚠️', value: 'Unavailable', label: 'Enable the Discord Server Widget' });
    updateSourceLabel(sourceLabel, 'unavailable');
    return;
  }

  if (serverTitle && status.name) serverTitle.textContent = status.name;
  const discordLabel = status.source === 'live' ? 'Active Citizens Online in Discord' : 'Citizens in Latest Discord Check';
  animateValue(onlineCount, 0, status.presenceCount, 900, discordLabel, '💬');
  updateSourceLabel(sourceLabel, status.source, status.updatedAt);
}

function normalizeFivemPayload(payload) {
  const server = payload && payload.Data && typeof payload.Data === 'object' ? payload.Data : payload;
  if (!server || typeof server !== 'object') return null;

  const clients = Number(server.clients);
  if (!Number.isFinite(clients) || clients < 0) return null;
  return server;
}

async function requestFivemStatus(config, snapshotPromise) {
  const targetUrl = `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(config.joinCode)}`;
  const proxyUrl = buildProxyUrl(config.apiProxyUrl, 'fivem', { join_code: config.joinCode });
  const requestUrls = [proxyUrl, targetUrl].filter(Boolean);

  for (const requestUrl of requestUrls) {
    try {
      const server = normalizeFivemPayload(await fetchJson(requestUrl, 6000));
      if (server) return { server, source: 'live', updatedAt: new Date().toISOString() };
    } catch (error) {
      console.warn('A FiveM live-status source was unavailable.', error);
    }
  }

  const snapshot = await snapshotPromise;
  const cached = snapshot && snapshot.fivem;
  const updatedAt = cached && (cached.fetched_at || snapshot.generated_at || '');
  if (cached && cached.available === true && Number.isFinite(Number(cached.clients)) &&
      isSnapshotFresh(updatedAt, config.maxSnapshotAgeMs)) {
    return {
      server: {
        clients: Number(cached.clients),
        sv_maxclients: Number(cached.max_clients),
        hostname: cached.hostname || '',
        vars: {
          sv_projectName: cached.project_name || '',
          sv_projectDesc: cached.project_description || '',
          tags: Array.isArray(cached.tags) ? cached.tags.join(',') : '',
          banner_detail: cached.banner_url || ''
        }
      },
      source: 'snapshot',
      verified: cached.live === true,
      updatedAt
    };
  }

  return null;
}

function renderFivemStatus(config, result) {
  const players = document.getElementById('fivem-players-count');
  const banner = document.getElementById('fivem-dynamic-banner');
  const tagsContainer = document.getElementById('fivem-dynamic-tags');
  const statusBadge = document.getElementById('fivem-status-indicator');
  const navCounter = document.getElementById('nav-player-counter');
  const description = document.getElementById('fivem-dynamic-desc');
  const serverName = document.getElementById('fivem-server-name');
  const sourceLabel = document.getElementById('fivem-data-source');
  const statusCard = banner && banner.closest('.server-status-card');

  if (!result) {
    setRichStatus(navCounter, { value: `Join: ${config.joinCode.toUpperCase()}` });
    setRichStatus(players, { icon: '🎮', value: config.joinLink, label: 'Direct connect' });
    updateSourceLabel(sourceLabel, 'unavailable');

    if (statusBadge) {
      statusBadge.classList.remove('status-cached');
      statusBadge.classList.add('status-unknown');
      setRichStatus(statusBadge, { value: 'STATUS UNAVAILABLE', label: `— Join code ${config.joinCode.toUpperCase()}` });
    }
    return;
  }

  const { server, source, updatedAt, verified = true } = result;
  const onlineCount = Number(server.clients);
  const maxCount = Number(server.sv_maxclients);
  const hasMaxCount = Number.isFinite(maxCount) && maxCount > 0;
  const countLabel = hasMaxCount ? `${onlineCount} / ${maxCount}` : String(onlineCount);
  const countDescription = source === 'live' ? 'Citizens Online' : 'Citizens in Latest Check';
  setRichStatus(navCounter, { value: countLabel, label: countDescription });
  setRichStatus(players, { icon: '🎮', value: countLabel, label: countDescription });
  updateSourceLabel(sourceLabel, source, updatedAt);

  if (statusBadge) {
    statusBadge.classList.remove('status-unknown', 'status-cached');
    const pulse = document.createElement('span');
    pulse.className = 'pulse-circle';
    pulse.setAttribute('aria-hidden', 'true');
    const strong = document.createElement('strong');
    strong.textContent = `${onlineCount} ${onlineCount === 1 ? 'Player' : 'Players'}`;

    if (source === 'snapshot') {
      statusBadge.classList.add('status-cached');
      const formatted = formatStatusTime(updatedAt);
      const prefix = document.createTextNode(verified ? ' LAST CHECK — ' : ' LAST KNOWN — ');
      const suffix = document.createTextNode(formatted ? ` at ${formatted}` : ' from the latest snapshot');
      statusBadge.replaceChildren(pulse, prefix, strong, suffix);
    } else {
      const prefix = document.createTextNode(' ONLINE — ');
      const suffix = document.createTextNode(' Active In City');
      statusBadge.replaceChildren(pulse, prefix, strong, suffix);
    }
  }

  const vars = server.vars && typeof server.vars === 'object' ? server.vars : {};
  const displayName = String(vars.sv_projectName || server.hostname || '').trim();
  if (serverName && displayName) serverName.textContent = displayName;

  const bannerUrl = safeExternalUrl(vars.banner_detail || vars.banner_connecting);
  if (banner && bannerUrl) {
    banner.onerror = () => {
      if (statusCard) statusCard.classList.remove('has-dynamic-banner');
    };
    banner.src = bannerUrl;
    if (statusCard) statusCard.classList.add('has-dynamic-banner');
  } else if (statusCard) {
    statusCard.classList.remove('has-dynamic-banner');
  }

  if (tagsContainer && typeof vars.tags === 'string') {
    const tagList = vars.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
    if (tagList.length) {
      const tagNodes = tagList.map((tag) => {
        const badge = document.createElement('span');
        badge.className = 'server-tag-badge';
        badge.textContent = `#${tag}`;
        return badge;
      });
      tagsContainer.replaceChildren(...tagNodes);
    }
  }

  if (description && typeof vars.sv_projectDesc === 'string' && vars.sv_projectDesc.trim()) {
    description.textContent = vars.sv_projectDesc.trim();
  }
}

async function refreshLiveStatus({ announce = false } = {}) {
  if (LIVE_STATE.activeRefresh) return LIVE_STATE.activeRefresh;

  const config = getLiveApiConfig();
  const refreshButton = document.getElementById('refresh-live-status');
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.setAttribute('aria-busy', 'true');
  }

  LIVE_STATE.activeRefresh = (async () => {
    const snapshotPromise = loadSnapshot(config);
    await Promise.all([
      updateDiscordStatus(config, snapshotPromise),
      requestFivemStatus(config, snapshotPromise).then((result) => renderFivemStatus(config, result))
    ]);
    LIVE_STATE.lastRefreshAt = Date.now();
    if (announce) showNotification('Live server information refreshed.');
  })();

  try {
    await LIVE_STATE.activeRefresh;
  } finally {
    LIVE_STATE.activeRefresh = null;
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.removeAttribute('aria-busy');
    }
  }
}

function initLiveStatus() {
  const config = getLiveApiConfig();
  refreshLiveStatus();

  const refreshButton = document.getElementById('refresh-live-status');
  if (refreshButton) refreshButton.addEventListener('click', () => refreshLiveStatus({ announce: true }));

  LIVE_STATE.refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') refreshLiveStatus();
  }, config.refreshMs);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - LIVE_STATE.lastRefreshAt > config.refreshMs) {
      refreshLiveStatus();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLiveStatus();
  initConnectButton();
  initSmoothNavigation();
  initMobileNav();
  initBackToTop();
  initTouchEnhancements();
  initCitizenBioModals();
});

function animateValue(element, start, end, duration, label, icon = '🟢') {
  if (!element) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || duration <= 0) {
    setRichStatus(element, { icon, value: end, label });
    return;
  }

  let startTimestamp = null;
  const step = (timestamp) => {
    if (startTimestamp === null) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const currentValue = Math.floor(progress * (end - start) + start);
    setRichStatus(element, { icon, value: currentValue, label });
    if (progress < 1) window.requestAnimationFrame(step);
  };

  window.requestAnimationFrame(step);
}

function initConnectButton() {
  const buttons = document.querySelectorAll('.js-connect-btn');
  const config = getLiveApiConfig();
  const joinLink = config.joinLink || 'cfx.re/join/xeodpe';

  buttons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      try {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      } catch (error) {
        // Vibration is an optional enhancement.
      }

      if (button.dataset.copyOnly === 'true') {
        event.preventDefault();
        try {
          await copyText(joinLink);
          showNotification(`🎮 Copied connect address: ${joinLink}`);
        } catch (error) {
          showNotification(`🚀 Direct connect: ${joinLink}`);
        }
      } else {
        showNotification('🔥 Opening the MTL City Rp FiveM join page.');
      }
    });
  });
}

function normalizePath(pathname) {
  const decoded = decodeURIComponent(pathname || '/').replace(/\/+/g, '/');
  if (decoded.endsWith('/index.html')) return decoded.slice(0, -10) || '/';
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') : '/';
}

function initSmoothNavigation() {
  const navLinks = [...document.querySelectorAll('.nav-link')];

  const updateActiveLink = () => {
    const canonical = document.querySelector('link[rel="canonical"]');
    const current = new URL(canonical && canonical.href ? canonical.href : window.location.href, window.location.href);
    current.hash = window.location.hash;
    const currentPath = normalizePath(current.pathname);

    navLinks.forEach((link) => {
      let isActive = false;

      try {
        const destination = new URL(link.href, current.href);
        const sameDocumentPath = destination.origin === current.origin && normalizePath(destination.pathname) === currentPath;

        if (sameDocumentPath) {
          isActive = destination.hash ? destination.hash === current.hash : current.hash === '';
        }
      } catch (error) {
        isActive = false;
      }

      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };

  updateActiveLink();
  window.addEventListener('hashchange', updateActiveLink);
}

function initMobileNav() {
  const toggleButton = document.getElementById('mobile-nav-toggle');
  const navMenu = document.getElementById('main-navigation');
  const overlay = document.getElementById('nav-overlay');
  if (!toggleButton || !navMenu || !overlay) return;

  const getFocusable = () => [
    toggleButton,
    ...navMenu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ].filter((item) => item.offsetParent !== null);

  const closeMenu = ({ restoreFocus = false } = {}) => {
    toggleButton.classList.remove('is-active');
    navMenu.classList.remove('is-open');
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nav-open');
    document.body.style.overflow = '';
    toggleButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggleButton.focus();
  };

  const openMenu = () => {
    toggleButton.classList.add('is-active');
    navMenu.classList.add('is-open');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('nav-open');
    document.body.style.overflow = 'hidden';
    toggleButton.setAttribute('aria-expanded', 'true');

    const firstLink = navMenu.querySelector('a[href], button:not([disabled])');
    if (firstLink) window.requestAnimationFrame(() => firstLink.focus());
  };

  toggleButton.addEventListener('click', () => {
    if (navMenu.classList.contains('is-open')) closeMenu();
    else openMenu();
  });

  overlay.addEventListener('click', () => closeMenu({ restoreFocus: true }));

  navMenu.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener('click', () => closeMenu());
  });

  document.addEventListener('keydown', (event) => {
    if (!navMenu.classList.contains('is-open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusable();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 991 && navMenu.classList.contains('is-open')) closeMenu();
  });
}

function initBackToTop() {
  const topButton = document.getElementById('back-to-top-btn');
  if (!topButton) return;

  const updateVisibility = () => {
    topButton.classList.toggle('visible', window.scrollY > 350);
  };

  updateVisibility();
  window.addEventListener('scroll', updateVisibility, { passive: true });
  topButton.addEventListener('click', () => {
    try {
      if (navigator.vibrate) navigator.vibrate(20);
    } catch (error) {
      // Vibration is an optional enhancement.
    }

    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });
}

function initTouchEnhancements() {
  document.querySelectorAll('.feature-card, .team-card, .server-status-card, .btn-connect').forEach((card) => {
    card.addEventListener('touchstart', () => card.classList.add('touch-active'), { passive: true });
    card.addEventListener('touchend', () => {
      window.setTimeout(() => card.classList.remove('touch-active'), 300);
    }, { passive: true });
    card.addEventListener('touchcancel', () => card.classList.remove('touch-active'), { passive: true });
  });
}

function initCitizenBioModals() {
  const modal = document.getElementById('citizen-bio-modal');
  const closeButton = document.getElementById('close-bio-modal');
  const cards = document.querySelectorAll('.js-bio-card');
  if (!modal) return;

  const modalCard = modal.querySelector('.bio-modal-card');
  const name = document.getElementById('modal-bio-name');
  const rank = document.getElementById('modal-bio-rank');
  const image = document.getElementById('modal-bio-image');
  const text = document.getElementById('modal-bio-text');
  const linksContainer = document.getElementById('modal-links-container');
  const linksGrid = document.getElementById('modal-bio-links');
  let previouslyFocused = null;

  const closeModal = ({ restoreFocus = true } = {}) => {
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    document.body.style.overflow = '';

    if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  };

  const openModal = (profile, trigger = document.activeElement) => {
    previouslyFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;

    if (name) name.textContent = String(profile.name || 'Unknown Citizen');
    if (rank) {
      rank.textContent = String(profile.rank || 'Citizen');
      const safeRankClass = String(profile.rankClass || '').replace(/[^a-zA-Z0-9_-]/g, '');
      rank.className = `rank-badge${safeRankClass ? ` ${safeRankClass}` : ''}`;
    }
    setImageSource(image, profile.image);
    if (text) text.textContent = String(profile.bio || profile.aboutMe || profile.snippet || 'No dossier details available.');

    if (linksContainer && linksGrid) {
      const renderedCount = renderBioLinks(linksGrid, profile.links);
      linksContainer.style.display = renderedCount > 0 ? 'block' : 'none';
    }

    modal.removeAttribute('inert');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => (closeButton || modalCard || modal).focus());

    try {
      if (navigator.vibrate) navigator.vibrate(20);
    } catch (error) {
      // Vibration is an optional enhancement.
    }
  };

  window.openCitizenBioModal = openModal;
  window.closeCitizenBioModal = closeModal;

  cards.forEach((card) => {
    const profileFromCard = () => {
      let links = [];
      try {
        const parsed = JSON.parse(card.dataset.links || '[]');
        if (Array.isArray(parsed)) links = parsed;
      } catch (error) {
        console.warn('Could not parse citizen links JSON.', error);
      }

      return {
        name: card.dataset.name,
        rank: card.dataset.rank,
        rankClass: card.dataset.rankClass,
        image: card.dataset.image,
        bio: card.dataset.bio,
        links
      };
    };

    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      const focusReturnTarget = event.target.closest('.btn-bio-trigger') || card.querySelector('.btn-bio-trigger');
      openModal(profileFromCard(), focusReturnTarget);
    });

  });

  if (closeButton) closeButton.addEventListener('click', () => closeModal());

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  const discordButton = modal.querySelector('.bio-discord-btn');
  if (discordButton) discordButton.addEventListener('click', () => closeModal({ restoreFocus: false }));

  document.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('is-open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
})();
