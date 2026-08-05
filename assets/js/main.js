/**
 * MTL City Rp - interactive controls and live status integrations.
 */
'use strict';

(() => {
const FALLBACK_AVATAR = document.body.dataset.fallbackAvatar || 'assets/images/default-avatar.svg';

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
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return await response.json();
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

document.addEventListener('DOMContentLoaded', () => {
  initDiscordLiveStats();
  initFivemServerMonitor();
  initConnectButton();
  initSmoothNavigation();
  initMobileNav();
  initBackToTop();
  initTouchEnhancements();
  initCitizenBioModals();
});

async function initDiscordLiveStats() {
  const config = document.getElementById('discord-config-id');
  if (!config) return;

  const serverId = config.dataset.discordId;
  if (!serverId) return;

  const onlineCount = document.getElementById('discord-online-count');
  const serverTitle = document.getElementById('discord-server-title');

  try {
    const data = await fetchJson(`https://discord.com/api/guilds/${encodeURIComponent(serverId)}/widget.json`);

    if (serverTitle && typeof data.name === 'string' && data.name.trim()) {
      serverTitle.textContent = data.name.trim();
    }

    const presenceCount = Number(data.presence_count);
    if (onlineCount && Number.isFinite(presenceCount) && presenceCount >= 0) {
      animateValue(onlineCount, 0, presenceCount, 1200, 'Active Citizens Online in Discord', '💬');
    }
  } catch (error) {
    console.warn('Discord community status is temporarily unavailable.', error);
    setRichStatus(onlineCount, {
      icon: '💬',
      value: 'Live',
      label: 'Community Hub'
    });
  }
}

async function requestFivemServer(targetUrl) {
  const requestUrls = [
    targetUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}`
  ];

  for (const requestUrl of requestUrls) {
    try {
      const payload = await fetchJson(requestUrl, 5500);
      if (payload && payload.Data && typeof payload.Data === 'object') return payload.Data;
    } catch (error) {
      console.warn('FiveM status source was unavailable; trying the next source.', error);
    }
  }

  return null;
}

async function initFivemServerMonitor() {
  const config = document.getElementById('fivem-config-link');
  const joinCode = (config && config.dataset.joinCode ? config.dataset.joinCode : 'xeodpe').trim().toLowerCase();
  const players = document.getElementById('fivem-players-count');
  const banner = document.getElementById('fivem-dynamic-banner');
  const tagsContainer = document.getElementById('fivem-dynamic-tags');
  const statusBadge = document.getElementById('fivem-status-indicator');
  const navCounter = document.getElementById('nav-player-counter');
  const description = document.getElementById('fivem-dynamic-desc');
  const targetUrl = `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(joinCode)}`;
  const server = await requestFivemServer(targetUrl);

  if (!server) {
    setRichStatus(navCounter, { value: `Join: ${joinCode.toUpperCase()}` });
    setRichStatus(players, {
      icon: '🎮',
      value: `cfx.re/join/${joinCode}`,
      label: 'Server link'
    });

    if (statusBadge) {
      statusBadge.classList.add('status-unknown');
      setRichStatus(statusBadge, {
        value: 'STATUS UNAVAILABLE',
        label: `— Join code ${joinCode.toUpperCase()}`
      });
    }
    return;
  }

  const onlineCount = Number(server.clients);
  const maxCount = Number(server.sv_maxclients);
  const hasPlayerCount = Number.isFinite(onlineCount) && onlineCount >= 0;
  const hasMaxCount = Number.isFinite(maxCount) && maxCount > 0;

  if (hasPlayerCount) {
    const countLabel = hasMaxCount ? `${onlineCount} / ${maxCount}` : String(onlineCount);
    setRichStatus(navCounter, { value: countLabel, label: 'Citizens Online' });
    setRichStatus(players, { icon: '🎮', value: countLabel, label: 'Citizens Playing Live' });

    if (statusBadge) {
      statusBadge.classList.remove('status-unknown');
      const pulse = document.createElement('span');
      pulse.className = 'pulse-circle';
      pulse.setAttribute('aria-hidden', 'true');
      const text = document.createTextNode(' ONLINE — ');
      const strong = document.createElement('strong');
      strong.textContent = `${onlineCount} ${onlineCount === 1 ? 'Player' : 'Players'}`;
      const suffix = document.createTextNode(' Active In City');
      statusBadge.replaceChildren(pulse, text, strong, suffix);
    }
  }

  const bannerUrl = safeExternalUrl(server.vars && (server.vars.banner_detail || server.vars.banner_connecting));
  if (banner && bannerUrl) {
    banner.src = bannerUrl;
    banner.style.display = 'block';
    if (banner.parentElement) banner.parentElement.classList.add('has-dynamic-banner');
  }

  if (tagsContainer && server.vars && typeof server.vars.tags === 'string') {
    const tagList = server.vars.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6);

    const tagNodes = tagList.map((tag) => {
      const badge = document.createElement('span');
      badge.className = 'server-tag-badge';
      badge.textContent = `#${tag}`;
      return badge;
    });
    tagsContainer.replaceChildren(...tagNodes);
  }

  if (description && server.vars && typeof server.vars.sv_projectDesc === 'string') {
    description.textContent = server.vars.sv_projectDesc;
  }
}

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
  const config = document.getElementById('fivem-config-link');
  const joinLink = config && config.dataset.joinLink ? config.dataset.joinLink : 'cfx.re/join/xeodpe';

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
