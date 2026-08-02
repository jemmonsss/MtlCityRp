/** ==========================================================================
 * MTL City Rp - Interactive Website & Realtime API Integrations
 * Auto-pulls live server details and images directly from FiveM & Discord APIs!
 * ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initDiscordLiveStats();
  initFivemServerMonitor();
  initConnectButton();
  initSmoothNavigation();
});

/**
 * Connects to Discord's Official Widget API to dynamically display
 * live online member counts and activity in the Discord Hub section.
 */
async function initDiscordLiveStats() {
  const discordConfigElement = document.getElementById('discord-config-id');
  if (!discordConfigElement) return;

  const serverId = discordConfigElement.getAttribute('data-discord-id');
  if (!serverId) return;

  const onlineCountEl = document.getElementById('discord-online-count');
  const serverTitleEl = document.getElementById('discord-server-title');

  try {
    const response = await fetch(`https://discord.com/api/guilds/${serverId}/widget.json`);
    if (!response.ok) {
      console.warn("Discord Widget API couldn't be loaded. Check that 'Enable Server Widget' is ON in Discord Server Settings -> Widget.");
      if (onlineCountEl) onlineCountEl.innerHTML = "🟢 <strong>Live</strong> Community Hub";
      return;
    }

    const data = await response.json();

    // Update server title if returned
    if (serverTitleEl && data.name) {
      serverTitleEl.textContent = data.name;
    }

    // Update active user presence count
    if (onlineCountEl && data.presence_count !== undefined) {
      animateValue(onlineCountEl, 0, data.presence_count, 1500, "Active Citizens Online in Discord", "💬");
    }

    // Update connection button url to instant Discord invite if provided in widget
    if (data.instant_invite) {
      const inviteBtn = document.getElementById('discord-invite-btn');
      if (inviteBtn) {
        inviteBtn.setAttribute('href', data.instant_invite);
        inviteBtn.setAttribute('target', '_blank');
      }
    }
  } catch (error) {
    console.error("Error fetching live Discord stats:", error);
    if (onlineCountEl) onlineCountEl.innerHTML = "🟢 <strong>Online</strong> Active Discord Hub";
  }
}

/**
 * Automatically pulls real-time details from official FiveM server servers-frontend API (code: xeodpe).
 * Dynamically fetches live player counts, maximum slots, tags, and automatically updates
 * banner images whenever the team updates their FiveM/CFX configurations!
 */
async function initFivemServerMonitor() {
  const fivemConfigEl = document.getElementById('fivem-config-link');
  if (!fivemConfigEl) return;

  const joinCode = fivemConfigEl.getAttribute('data-join-code') || "xeodpe";
  const playersEl = document.getElementById('fivem-players-count');
  const bannerImgEl = document.getElementById('fivem-dynamic-banner');
  const tagsContainerEl = document.getElementById('fivem-dynamic-tags');
  const serverStatusBadge = document.getElementById('fivem-status-indicator');

  try {
    // Query official FiveM server details frontend API
    const response = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${joinCode}`);
    if (!response.ok) {
      if (playersEl) playersEl.innerHTML = "🟢 <strong>Join Code:</strong> " + joinCode.toUpperCase();
      return;
    }

    const json = await response.json();
    const server = json.Data;
    if (!server) return;

    // 1. Dynamic Player Counter Update
    if (playersEl && server.clients !== undefined && server.sv_maxclients !== undefined) {
      playersEl.innerHTML = `🎮 <strong>${server.clients} / ${server.sv_maxclients}</strong> Citizens Playing Live`;
      if (serverStatusBadge) {
        serverStatusBadge.innerHTML = `<span class="pulse-circle"></span> ONLINE - ${server.clients} Players In City`;
      }
    }

    // 2. Dynamic Banner Image Pull
    // If the developers update their server banner on their end, it instantly reflects on the site!
    const bannerUrl = server.vars?.banner_detail || server.vars?.banner_connecting || null;
    if (bannerUrl && bannerImgEl) {
      bannerImgEl.src = bannerUrl;
      bannerImgEl.style.display = 'block';
      bannerImgEl.parentElement.classList.add('has-dynamic-banner');
    }

    // 3. Dynamic Server Tags Display
    if (tagsContainerEl && server.vars?.tags) {
      const tagList = server.vars.tags.split(",").map(t => t.trim()).slice(0, 6);
      tagsContainerEl.innerHTML = tagList.map(tag => `<span class="server-tag-badge">#${tag}</span>`).join("");
    }

    // 4. Update any dynamic server description or host name if present
    const descEl = document.getElementById('fivem-dynamic-desc');
    if (descEl && server.vars?.sv_projectDesc) {
      descEl.textContent = server.vars.sv_projectDesc;
    }

  } catch (error) {
    console.warn("Live FiveM status query fallback active:", error);
    if (playersEl) playersEl.innerHTML = `🎮 <strong>cfx.re/join/${joinCode}</strong> Live Server`;
  }
}

/**
 * Smooth numeric counter animation for online players & members
 */
function animateValue(obj, start, end, duration, label, icon = "🟢") {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const currentValue = Math.floor(progress * (end - start) + start);
    obj.innerHTML = `${icon} <strong>${currentValue}</strong> ${label}`;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

/**
 * Handles FiveM direct connect & store buttons with interactive toast feedback
 */
function initConnectButton() {
  const connectButtons = document.querySelectorAll('.js-connect-btn');
  const joinCodeEl = document.getElementById('fivem-config-link');
  const joinLink = joinCodeEl ? joinCodeEl.getAttribute('data-join-link') : "cfx.re/join/xeodpe";

  connectButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (btn.getAttribute('data-copy-only') === "true") {
        e.preventDefault();
        navigator.clipboard.writeText(joinLink).then(() => {
          showNotification(`🎮 Copied Connect Code: ${joinLink}`);
        }).catch(() => {
          showNotification(`🚀 Direct Connect: ${joinLink}`);
        });
      } else {
        showNotification(`🔥 Connecting to MTL City Rp... See you in Los Santos!`);
      }
    });
  });
}

/**
 * Displays a stylish, glassmorphic toast notification when connecting or interacting
 */
function showNotification(message) {
  const existing = document.querySelector('.city-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'city-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
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
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    transform: translateY(40px);
    opacity: 0;
  `;
  toast.innerText = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateY(40px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/**
 * Highlights navigation menu items based on active page or scroll position
 */
function initSmoothNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const currentPath = window.location.pathname;

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (currentPath === href || (href !== '/' && currentPath.includes(href))) {
      link.classList.add('active');
    }
  });
}
