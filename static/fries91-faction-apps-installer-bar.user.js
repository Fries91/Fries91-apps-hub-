// ==UserScript==
// @name         🍟 Fries91's Faction Apps Installer Bar
// @namespace    torn.installer.fries91
// @version      1.0.0
// @description  Top Torn app bar that lets members install only the Fries91 app they select.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Fries91/Fries91-apps-hub-/main/static/fries91-faction-apps-installer-bar.user.js
// @downloadURL  https://raw.githubusercontent.com/Fries91/Fries91-apps-hub-/main/static/fries91-faction-apps-installer-bar.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__FRIES91_INSTALLER_BAR_V100__) return;
  window.__FRIES91_INSTALLER_BAR_V100__ = true;

  const APPS = [
    ['war', '⚔️', 'War & Chain', 'War overview, members, enemies, hospital, chain, targets, terms and administration.', 'https://torn-war-bot.onrender.com/static/war-bot.user.js'],
    ['insurance', '💊', "Sinner's Insurance", 'Faction insurance plans, coverage, claims and administration.', 'https://raw.githubusercontent.com/Fries91/xanax-insurance/main/static/xanax-insurance.user.js'],
    ['giveaway', '🎁', 'Faction Giveaway', 'Faction giveaway rounds, entrants, winners and wheel.', 'https://sinner-s-lottery.onrender.com/static/giveaway.user.js'],
    ['tse', '🚆', 'T.S.E Headquarters', 'Companies, trains, Hall of Fame search, notes and company keys.', 'https://raw.githubusercontent.com/Fries91/Trains-Selling-Enterprise-/main/static/tse-headquarters.user.js'],
    ['bankers', '🪙', 'Faction Bankers', 'Bank requests, banker alerts, balances and completed-request history.', 'https://faction-bankers-request.onrender.com/static/faction-bankers.user.js'],
    ['assist', '🆘', 'Assist Button', 'One-tap faction assist message on Torn attack pages.', 'https://raw.githubusercontent.com/Fries91/Assist-alert-button/main/static/assist-alert-button.user.js'],
    ['brain', '🧠', 'AI Brain', 'Stock, item, travel-profit and smart market learning tools.', 'https://fries91-torn-profit-brain.onrender.com/static/torn-brain.user.js'],
    ['chain', '⛓️', '100K Chain Command', 'Live chain timer, members, watcher scheduling and milestones.', 'https://torn-100k-chain-command.onrender.com/chain-command.user.js']
  ].map(([id, icon, name, description, url]) => ({ id, icon, name, description, url }));

  const IDS = {
    slot: 'fries91-installer-slot',
    bar: 'fries91-installer-bar',
    overlay: 'fries91-installer-overlay',
    panel: 'fries91-installer-panel',
    body: 'fries91-installer-body',
    style: 'fries91-installer-style',
    toast: 'fries91-installer-toast'
  };

  let mountLocked = false;
  let toastTimer = null;

  const appById = (id) => APPS.find((app) => app.id === id);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 180 && rect.height > 10 && rect.bottom > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findTopAnchor() {
    const width = Math.max(document.documentElement.clientWidth || 0, innerWidth || 0);
    const candidates = Array.from(document.querySelectorAll('div,section,header,nav,ul'));
    let best = null;
    let bestScore = -Infinity;

    for (const element of candidates) {
      if (!isVisible(element) || element.closest(`#${IDS.overlay}`)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < Math.min(260, width * 0.72) || rect.top < 120 || rect.top > 620 || rect.height > 120) continue;

      const text = String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 350) continue;

      const money = /\$\s*[\d,.]+[kmbt]?/i.test(text);
      const gender = /[♂♀]/.test(text);
      const icons = element.querySelectorAll('img,svg').length >= 2;
      if (!money && !(gender && icons)) continue;

      let score = (money ? 100 : 0) + (gender ? 45 : 0) + (icons ? 25 : 0);
      if (rect.width > width * 0.9) score += 50;
      if (rect.height < 70) score += 25;
      score -= Math.abs(rect.top - 400) * 0.08;

      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    return best;
  }

  function placeAfter(anchor, slot) {
    if (!anchor?.parentElement) return false;
    let target = anchor;

    for (let index = 0; index < 4 && target.parentElement; index += 1) {
      const currentRect = target.getBoundingClientRect();
      const parent = target.parentElement;
      const parentRect = parent.getBoundingClientRect();
      if (parentRect.width >= currentRect.width && parentRect.width >= innerWidth * 0.86 && parentRect.height <= 150) {
        target = parent;
      } else break;
    }

    target.parentElement.insertBefore(slot, target.nextSibling);
    return true;
  }

  function makeIcon(app) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fries91-installer-icon';
    button.title = `Install ${app.name}`;
    button.setAttribute('aria-label', `Install ${app.name}`);
    button.textContent = app.icon;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showApp(app.id);
    });
    return button;
  }

  function buildBar(bar) {
    bar.innerHTML = '';
    APPS.forEach((app) => bar.appendChild(makeIcon(app)));

    const catalog = document.createElement('button');
    catalog.type = 'button';
    catalog.className = 'fries91-installer-icon fries91-installer-home';
    catalog.title = 'Show all Fries91 apps';
    catalog.setAttribute('aria-label', 'Show all Fries91 apps');
    catalog.textContent = '🍟';
    catalog.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showCatalog();
    });
    bar.appendChild(catalog);
  }

  function ensureBar() {
    if (!document.body) return;

    let slot = document.getElementById(IDS.slot);
    let bar = document.getElementById(IDS.bar);

    if (!slot) {
      slot = document.createElement('div');
      slot.id = IDS.slot;
      mountLocked = false;
    }

    if (!bar) {
      bar = document.createElement('nav');
      bar.id = IDS.bar;
      bar.setAttribute('aria-label', 'Fries91 app installer bar');
      buildBar(bar);
    }

    if (bar.parentElement !== slot) slot.appendChild(bar);
    if (mountLocked && slot.isConnected) return;
    if (!slot.isConnected) mountLocked = false;

    const anchor = findTopAnchor();
    if (anchor && placeAfter(anchor, slot)) {
      mountLocked = true;
      return;
    }

    const content = document.querySelector('#mainContainer') || document.querySelector('main') || document.body;
    content.insertBefore(slot, content.firstChild);
    mountLocked = true;
  }

  function ensureOverlay() {
    if (document.getElementById(IDS.overlay)) return;

    const overlay = document.createElement('div');
    overlay.id = IDS.overlay;
    overlay.innerHTML = `
      <section id="${IDS.panel}" role="dialog" aria-modal="true">
        <header>
          <div><strong>🍟 Fries91's Faction Apps</strong><small>Install one app at a time</small></div>
          <button type="button" id="fries91-installer-close">×</button>
        </header>
        <main id="${IDS.body}"></main>
      </section>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeOverlay();
    });
    document.getElementById('fries91-installer-close').addEventListener('click', closeOverlay);
  }

  function openOverlay() {
    ensureOverlay();
    document.getElementById(IDS.overlay).classList.add('show');
  }

  function closeOverlay() {
    document.getElementById(IDS.overlay)?.classList.remove('show');
  }

  function openInstall(url) {
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) location.href = url;
  }

  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = url;
      input.style.position = 'fixed';
      input.style.left = '-10000px';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    toast('Install link copied.');
  }

  function showApp(id) {
    const app = appById(id);
    if (!app) return;
    openOverlay();

    const body = document.getElementById(IDS.body);
    body.innerHTML = `
      <button class="fries91-back" type="button">← All Apps</button>
      <article class="fries91-app-card">
        <div class="fries91-app-head"><span>${app.icon}</span><div><strong>${esc(app.name)}</strong><small>${esc(app.description)}</small></div></div>
        <p>This installs <b>only ${esc(app.name)}</b>. The other apps are not installed.</p>
        <label>Individual userscript link</label>
        <input type="text" readonly value="${esc(app.url)}">
        <div class="fries91-actions">
          <button class="fries91-install" type="button">Install This App Only</button>
          <button class="fries91-copy" type="button">Copy Link</button>
        </div>
      </article>`;

    body.querySelector('.fries91-back').addEventListener('click', showCatalog);
    body.querySelector('.fries91-install').addEventListener('click', () => openInstall(app.url));
    body.querySelector('.fries91-copy').addEventListener('click', () => copyLink(app.url));
  }

  function showCatalog() {
    openOverlay();
    const body = document.getElementById(IDS.body);
    body.innerHTML = `
      <p class="fries91-intro">Choose an app. Each button shows the individual install link for that app only.</p>
      <div class="fries91-grid">${APPS.map((app) => `
        <button type="button" data-app="${app.id}"><span>${app.icon}</span><strong>${esc(app.name)}</strong><small>View install link</small></button>
      `).join('')}</div>`;

    body.querySelectorAll('[data-app]').forEach((button) => {
      button.addEventListener('click', () => showApp(button.dataset.app));
    });
  }

  function toast(message) {
    let box = document.getElementById(IDS.toast);
    if (!box) {
      box = document.createElement('div');
      box.id = IDS.toast;
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2400);
  }

  function addStyles() {
    if (document.getElementById(IDS.style)) return;
    const style = document.createElement('style');
    style.id = IDS.style;
    style.textContent = `
      #${IDS.slot}{position:relative!important;display:block!important;width:100%!important;box-sizing:border-box!important;padding:3px 4px!important;margin:0!important;z-index:2147482000!important;background:#0b0c0e!important}
      #${IDS.bar}{display:grid!important;grid-template-columns:repeat(9,minmax(0,1fr))!important;gap:2px!important;width:100%!important;padding:3px!important;box-sizing:border-box!important;border:1px solid #9b6f25!important;border-radius:8px!important;background:linear-gradient(#7d1419,#41080b)!important}
      .fries91-installer-icon{width:100%!important;height:36px!important;min-height:36px!important;padding:0!important;border:1px solid #5d4c2d!important;border-radius:6px!important;background:linear-gradient(#1d2025,#090b0e)!important;color:#fff!important;font-size:20px!important;line-height:1!important;cursor:pointer!important}
      .fries91-installer-home{background:linear-gradient(#a11d23,#570d11)!important;border-color:#d6aa43!important}
      #${IDS.overlay}{position:fixed!important;inset:0!important;display:none!important;align-items:flex-start!important;justify-content:center!important;padding:8px!important;box-sizing:border-box!important;background:rgba(0,0,0,.78)!important;z-index:2147483600!important}
      #${IDS.overlay}.show{display:flex!important}
      #${IDS.panel}{width:min(560px,100%)!important;max-height:calc(100vh - 16px)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;border:1px solid #aa8132!important;border-radius:14px!important;background:#0c0f13!important;color:#f5ead0!important;font-family:Arial,sans-serif!important}
      #${IDS.panel}>header{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:11px!important;background:linear-gradient(#691116,#27070a)!important}
      #${IDS.panel}>header strong{display:block!important;font-size:15px!important}#${IDS.panel}>header small{display:block!important;margin-top:2px!important;color:#d5bd82!important;font-size:10px!important}
      #fries91-installer-close{width:38px!important;height:38px!important;padding:0!important;border:1px solid #7d6d49!important;border-radius:9px!important;background:#15181d!important;color:#fff!important;font-size:24px!important}
      #${IDS.body}{overflow:auto!important;padding:10px!important}.fries91-intro,.fries91-app-card p{padding:10px!important;border:1px solid #36516a!important;border-radius:9px!important;background:#101923!important;color:#c8dff2!important;font-size:11px!important;line-height:1.4!important}
      .fries91-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}.fries91-grid button{min-height:100px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:6px!important;border:1px solid #303943!important;border-radius:11px!important;background:linear-gradient(#171b21,#101318)!important;color:#fff!important}.fries91-grid span{font-size:28px!important}.fries91-grid strong{color:#fff0c5!important;font-size:12px!important}.fries91-grid small{color:#aeb8c5!important;font-size:9px!important}
      .fries91-back{min-height:32px!important;margin-bottom:9px!important;border:1px solid #5b513d!important;border-radius:8px!important;background:#15191f!important;color:#f6df9e!important;font-weight:800!important}.fries91-app-card{padding:12px!important;border:1px solid #303943!important;border-radius:12px!important;background:linear-gradient(#171b21,#0d1014)!important}.fries91-app-head{display:flex!important;gap:10px!important;align-items:flex-start!important}.fries91-app-head>span{width:48px!important;height:48px!important;display:flex!important;align-items:center!important;justify-content:center!important;border:1px solid #5d4c2d!important;border-radius:11px!important;background:#090b0e!important;font-size:27px!important}.fries91-app-head strong{display:block!important;color:#fff1c9!important;font-size:15px!important}.fries91-app-head small{display:block!important;margin-top:4px!important;color:#b4bfcb!important;font-size:10.5px!important;line-height:1.35!important}.fries91-app-card label{display:block!important;margin:8px 0 4px!important;color:#d8bd7b!important;font-size:9px!important;font-weight:800!important}.fries91-app-card input{width:100%!important;min-height:39px!important;box-sizing:border-box!important;padding:8px!important;border:1px solid #39414a!important;border-radius:8px!important;background:#080a0d!important;color:#e7edf3!important;font:10px monospace!important}.fries91-actions{display:grid!important;grid-template-columns:2fr 1fr!important;gap:7px!important;margin-top:10px!important}.fries91-actions button{min-height:42px!important;border-radius:9px!important;font-size:11px!important;font-weight:900!important}.fries91-install{border:1px solid #e3b543!important;background:linear-gradient(#a51d24,#590d12)!important;color:#fff!important}.fries91-copy{border:1px solid #4d5660!important;background:#181c22!important;color:#e9edf2!important}
      #${IDS.toast}{position:fixed!important;left:50%!important;bottom:18px!important;transform:translate(-50%,18px)!important;width:min(420px,calc(100% - 24px))!important;padding:11px!important;box-sizing:border-box!important;border:1px solid #34c978!important;border-radius:10px!important;background:#11151a!important;color:#b9f7d1!important;opacity:0!important;transition:.18s!important;text-align:center!important;font:800 11px Arial,sans-serif!important;z-index:2147483647!important;pointer-events:none!important}#${IDS.toast}.show{opacity:1!important;transform:translate(-50%,0)!important}
      @media(max-width:620px){#${IDS.overlay}{padding:0!important}#${IDS.panel}{width:100%!important;height:100%!important;max-height:100vh!important;border:0!important;border-radius:0!important}#${IDS.panel}>header{padding-top:max(10px,env(safe-area-inset-top,0px))!important}.fries91-installer-icon{height:35px!important;min-height:35px!important;font-size:19px!important}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function boot() {
    if (!document.body) return setTimeout(boot, 350);
    addStyles();
    ensureOverlay();
    ensureBar();
    setInterval(() => {
      const slot = document.getElementById(IDS.slot);
      if (!slot?.isConnected) mountLocked = false;
      ensureBar();
    }, 1600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();