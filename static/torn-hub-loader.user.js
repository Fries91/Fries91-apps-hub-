// ==UserScript==
// @name         Fries91 Apps Hub Loader
// @namespace    torn.hub.fries91
// @version      0.1.0
// @description  Main 🍟 loader hub that loads War Hub, Sinner's Insurance, and Giveaway/Lottery from their own live script URLs.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      torn-war-bot.onrender.com
// @connect      raw.githubusercontent.com
// @connect      sinner-s-lottery.onrender.com
// @downloadURL  https://raw.githubusercontent.com/Fries91/Fries91-apps-hub-/main/static/torn-hub-loader.user.js
// @updateURL    https://raw.githubusercontent.com/Fries91/Fries91-apps-hub-/main/static/torn-hub-loader.user.js
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const HUB_ID = 'fries-torn-hub';
  const HUB_SHIELD_ID = 'fries-torn-hub-shield';
  const HUB_OVERLAY_ID = 'fries-torn-hub-overlay';
  const HUB_STATUS_SLOT_ID = 'fries-torn-hub-status-slot';

  const K_HUB_OPEN = 'torn_hub_open';
  const K_HUB_MINIMIZE_ON_OPEN = 'torn_hub_minimize_on_open';
  const K_ENABLED_APPS = 'torn_hub_enabled_apps';

  const APPS = [
    {
      id: 'warhub',
      name: 'War Hub',
      icon: '⚔️',
      description: 'Loads War and Chain from your live War Hub script.',
      url: 'https://torn-war-bot.onrender.com/static/war-bot.user.js',
      bridge: '__FRIES_WARHUB_BRIDGE__',
      launcherSelector: '#warhub-shield, #warhub-badge',
      patch(source) {
        let code = String(source || '');
        if (!code) return code;

        if (code.includes("window.__FRIES_WARHUB_BRIDGE__")) return code;

        const tail = "    boot();\n\n})();";
        const injected = [
          "    window.__FRIES_WARHUB_BRIDGE__ = {",
          "        open: function () {",
          "            try { if (shield) { shield.style.display = 'none'; shield.style.opacity = '0'; shield.style.pointerEvents = 'none'; } } catch (_e) {}",
          "            try { setOverlayOpen(true); } catch (e) {",
          "                try { var ov = document.getElementById('warhub-overlay'); if (ov) ov.classList.add('open'); } catch (_e2) {}",
          "            }",
          "        },",
          "        close: function () {",
          "            try { setOverlayOpen(false); } catch (e) {",
          "                try { var ov = document.getElementById('warhub-overlay'); if (ov) ov.classList.remove('open'); } catch (_e2) {}",
          "            }",
          "        },",
          "        toggle: function () {",
          "            try { toggleOverlay(); } catch (e) {",
          "                try { var ov = document.getElementById('warhub-overlay'); if (ov) ov.classList.toggle('open'); } catch (_e2) {}",
          "            }",
          "        },",
          "        overlayEl: function () { return overlay || document.getElementById('warhub-overlay'); },",
          "        launcherEl: function () { return shield || document.getElementById('warhub-shield'); }",
          "    };",
          "",
          "    boot();",
          "",
          "})();"
        ].join('\n');

        if (code.indexOf(tail) !== -1) {
          code = code.replace(tail, injected);
        }
        return code;
      }
    },
    {
      id: 'insurance',
      name: "Sinner Insurance",
      icon: '💊',
      description: "Loads Sinner's Insurance from your live insurance script.",
      url: 'https://raw.githubusercontent.com/Fries91/xanax-insurance/main/static/xanax-insurance.user.js',
      bridge: '__FRIES_INSURANCE_BRIDGE__',
      launcherSelector: '#si-pda-launcher',
      patch(source) {
        let code = String(source || '');
        if (!code) return code;

        if (code.includes("window.__FRIES_INSURANCE_BRIDGE__")) return code;

        const bootMarker = "    if (document.readyState === 'loading') {\n        document.addEventListener('DOMContentLoaded', boot);\n    } else {\n        boot();\n    }\n})();";
        const injected = [
          "    window.__FRIES_INSURANCE_BRIDGE__ = {",
          "        open: function () {",
          "            try { ensureMounted(); } catch (_e) {}",
          "            try { if (launcher) { launcher.style.display = 'none'; launcher.style.opacity = '0'; launcher.style.pointerEvents = 'none'; } } catch (_e2) {}",
          "            try { openOverlay(); } catch (e) {",
          "                try { if (overlay) overlay.classList.add('open'); if (backdrop) backdrop.classList.add('open'); } catch (_e3) {}",
          "            }",
          "        },",
          "        close: function () {",
          "            try { closeOverlay(); } catch (e) {",
          "                try { if (overlay) overlay.classList.remove('open'); if (backdrop) backdrop.classList.remove('open'); } catch (_e2) {}",
          "            }",
          "        },",
          "        toggle: function () {",
          "            try { ensureMounted(); if (overlay && overlay.classList.contains('open')) closeOverlay(); else openOverlay(); } catch (_e) {}",
          "        },",
          "        overlayEl: function () { return overlay; },",
          "        launcherEl: function () { return launcher; }",
          "    };",
          "",
          "    if (document.readyState === 'loading') {",
          "        document.addEventListener('DOMContentLoaded', boot);",
          "    } else {",
          "        boot();",
          "    }",
          "})();"
        ].join('\n');

        if (code.indexOf(bootMarker) !== -1) {
          code = code.replace(bootMarker, injected);
        }
        return code;
      }
    },
    {
      id: 'giveaway',
      name: 'Giveaway / Lottery',
      icon: '🎟️',
      description: 'Loads Giveaway / Lottery from your live giveaway script.',
      url: 'https://sinner-s-lottery.onrender.com/static/giveaway.user.js',
      bridge: '__FRIES_GIVEAWAY_BRIDGE__',
      launcherSelector: '#giveaway-shield',
      patch(source) {
        let code = String(source || '');
        if (!code) return code;

        if (code.includes("window.__FRIES_GIVEAWAY_BRIDGE__")) return code;

        const bootMarker = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);\n  else boot();\n})();";
        const injected = [
          "  window.__FRIES_GIVEAWAY_BRIDGE__ = {",
          "    open: function () {",
          "      try { ensureDom(); } catch (_e) {}",
          "      try { var shield = document.getElementById('giveaway-shield'); if (shield) { shield.style.display = 'none'; shield.style.opacity = '0'; shield.style.pointerEvents = 'none'; } } catch (_e2) {}",
          "      try {",
          "        var overlay = document.getElementById('giveaway-overlay');",
          "        if (overlay && overlay.classList.contains('hidden')) { overlay.classList.remove('hidden'); setVal(K_OVERLAY_OPEN, true); }",
          "        else if (!overlay) { toggleOverlay(); }",
          "      } catch (e) { try { toggleOverlay(); } catch (_e3) {} }",
          "    },",
          "    close: function () {",
          "      try { var overlay = document.getElementById('giveaway-overlay'); if (overlay && !overlay.classList.contains('hidden')) { overlay.classList.add('hidden'); setVal(K_OVERLAY_OPEN, false); } } catch (_e) {}",
          "    },",
          "    toggle: function () { try { ensureDom(); toggleOverlay(); } catch (_e) {} },",
          "    overlayEl: function () { return document.getElementById('giveaway-overlay'); },",
          "    launcherEl: function () { return document.getElementById('giveaway-shield'); }",
          "  };",
          "",
          "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);",
          "  else boot();",
          "})();"
        ].join('\n');

        if (code.indexOf(bootMarker) !== -1) {
          code = code.replace(bootMarker, injected);
        }
        return code;
      }
    }
  ];

  const state = {
    apps: [],
    hubOpen: readBool(K_HUB_OPEN, false),
    minimizeOnOpen: readBool(K_HUB_MINIMIZE_ON_OPEN, true),
    mounted: false,
    lastTargetKey: '',
    observer: null,
    loaders: Object.create(null),
  };

  function readBool(key, fallback) {
    try { return !!GM_getValue(key, fallback); } catch (_) { return fallback; }
  }

  function readJSON(key, fallback) {
    try {
      const raw = GM_getValue(key, '');
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { GM_setValue(key, JSON.stringify(value)); } catch (_) {}
  }

  function appEnabled(appId) {
    const enabled = readJSON(K_ENABLED_APPS, null);
    if (!enabled || typeof enabled !== 'object') return true;
    return enabled[appId] !== false;
  }

  function setAppEnabled(appId, isEnabled) {
    const enabled = readJSON(K_ENABLED_APPS, {});
    enabled[appId] = !!isEnabled;
    writeJSON(K_ENABLED_APPS, enabled);
    renderHubCards();
  }

  function saveHubOpen(next) {
    state.hubOpen = !!next;
    try { GM_setValue(K_HUB_OPEN, state.hubOpen); } catch (_) {}
    renderHubVisibility();
  }

  function saveMinimizeOnOpen(next) {
    state.minimizeOnOpen = !!next;
    try { GM_setValue(K_HUB_MINIMIZE_ON_OPEN, state.minimizeOnOpen); } catch (_) {}
    renderHubCards();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyles() {
    GM_addStyle(`
      #${HUB_SHIELD_ID} {
        appearance: none;
        -webkit-appearance: none;
        position: relative;
        z-index: 2147483647;
        width: 20px;
        height: 20px;
        min-width: 20px;
        border-radius: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 0;
        box-shadow: none;
        color: #fff;
        font-size: 16px;
        line-height: 1;
        user-select: none;
        cursor: pointer;
        padding: 0;
        margin: 0;
        flex: 0 0 auto;
        transform: none;
        transition: opacity .15s ease, transform .15s ease;
        opacity: .96;
      }

      #${HUB_SHIELD_ID}:hover,
      #${HUB_SHIELD_ID}:focus {
        background: transparent;
        border-color: transparent;
        opacity: 1;
      }

      #${HUB_SHIELD_ID}:active {
        transform: scale(.96);
      }

      #${HUB_STATUS_SLOT_ID} {
        position: relative;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        margin-right: 0;
        flex: 0 0 auto;
        vertical-align: middle;
      }

      #${HUB_OVERLAY_ID} {
        position: fixed;
        z-index: 2147483646;
        right: 12px;
        top: 92px;
        width: min(360px, calc(100vw - 24px));
        max-height: min(78vh, 760px);
        display: none;
        flex-direction: column;
        background: rgba(12,14,18,.96);
        color: #eef3ff;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 16px;
        box-shadow: 0 16px 36px rgba(0,0,0,.5);
        overflow: hidden;
        backdrop-filter: blur(8px);
      }

      #${HUB_OVERLAY_ID}.open {
        display: flex;
      }

      .thub-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: linear-gradient(180deg, rgba(120,16,16,.28), rgba(255,255,255,.02));
        border-bottom: 1px solid rgba(255,255,255,.08);
      }

      .thub-title { font-weight: 800; letter-spacing: .3px; font-size: 15px; }
      .thub-sub { opacity: .72; font-size: 11px; margin-top: 2px; }
      .thub-actions { display: flex; gap: 8px; }
      .thub-btn {
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color: #fff;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .thub-body { padding: 12px; overflow: auto; }
      .thub-section-title { font-weight: 700; font-size: 13px; margin: 0 0 10px; }
      .thub-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
      .thub-card {
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 14px;
        padding: 12px;
        background: rgba(255,255,255,.04);
      }
      .thub-card-top { display: flex; align-items: center; gap: 10px; }
      .thub-app-icon {
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: rgba(255,255,255,.08);
        font-size: 20px;
        flex: 0 0 42px;
      }
      .thub-app-name { font-size: 14px; font-weight: 800; }
      .thub-app-desc { font-size: 12px; opacity: .8; margin-top: 3px; }
      .thub-card-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
      .thub-open { background: linear-gradient(180deg, #a01d1d, #6e1111); }
      .thub-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid rgba(255,255,255,.06);
      }
      .thub-note { font-size: 11px; opacity: .72; margin-top: 10px; }
      .thub-loading {
        border-radius: 12px;
        padding: 10px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.1);
        font-size: 12px;
      }

      #warhub-shield,
      #warhub-badge,
      #si-pda-launcher,
      #giveaway-shield {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `);
  }

  function ensureRoot() {
    if (document.getElementById(HUB_ID)) return;

    const root = document.createElement('div');
    root.id = HUB_ID;
    root.innerHTML = `
      <div id="${HUB_OVERLAY_ID}">
        <div class="thub-head">
          <div>
            <div class="thub-title">See Hub</div>
            <div class="thub-sub">Loader hub for your live app scripts</div>
          </div>
          <div class="thub-actions">
            <button class="thub-btn" id="thub-refresh-btn">↻</button>
            <button class="thub-btn" id="thub-close-btn">✕</button>
          </div>
        </div>
        <div class="thub-body">
          <div class="thub-section-title">Apps</div>
          <div class="thub-grid" id="thub-app-grid"></div>

          <div class="thub-section-title" style="margin-top:14px;">Hub Settings</div>
          <div class="thub-card">
            <div class="thub-toggle-row">
              <div>
                <div class="thub-app-name">Minimize hub after opening app</div>
                <div class="thub-app-desc">Cleaner for PDA and mobile screens.</div>
              </div>
              <button class="thub-btn" id="thub-minimize-toggle"></button>
            </div>
          </div>

          <div class="thub-note">
            This is a loader hub. The hub updates from its own URL, and each app loads from its own live script URL when opened.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    document.getElementById('thub-close-btn')?.addEventListener('click', () => saveHubOpen(false));
    document.getElementById('thub-refresh-btn')?.addEventListener('click', () => renderHubCards());
    document.getElementById('thub-minimize-toggle')?.addEventListener('click', () => saveMinimizeOnOpen(!state.minimizeOnOpen));

    renderHubVisibility();
    renderHubCards();
  }

  function renderHubVisibility() {
    const overlay = document.getElementById(HUB_OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.toggle('open', !!state.hubOpen);
  }

  function renderHubCards() {
    const grid = document.getElementById('thub-app-grid');
    const toggle = document.getElementById('thub-minimize-toggle');
    if (toggle) toggle.textContent = state.minimizeOnOpen ? 'On' : 'Off';
    if (!grid) return;

    const visible = APPS.filter((app) => appEnabled(app.id));
    if (!visible.length) {
      grid.innerHTML = `<div class="thub-loading">No apps enabled.</div>`;
      return;
    }

    grid.innerHTML = visible.map((app) => {
      const loader = state.loaders[app.id] || {};
      let status = 'Not loaded';
      if (loader.loading) status = 'Loading...';
      else if (loader.loaded) status = 'Loaded';
      else if (loader.error) status = 'Load failed';

      return `
        <div class="thub-card">
          <div class="thub-card-top">
            <div class="thub-app-icon">${escapeHtml(app.icon)}</div>
            <div>
              <div class="thub-app-name">${escapeHtml(app.name)}</div>
              <div class="thub-app-desc">${escapeHtml(app.description)}</div>
              <div class="thub-note" style="margin-top:4px;">Status: ${escapeHtml(status)}</div>
            </div>
          </div>
          <div class="thub-card-actions">
            <button class="thub-btn thub-open" data-open-app="${escapeHtml(app.id)}">Open</button>
            <button class="thub-btn" data-toggle-app="${escapeHtml(app.id)}">Hide</button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-open-app]').forEach((btn) => {
      btn.addEventListener('click', () => openApp(btn.getAttribute('data-open-app')));
    });
    grid.querySelectorAll('[data-toggle-app]').forEach((btn) => {
      btn.addEventListener('click', () => setAppEnabled(btn.getAttribute('data-toggle-app'), false));
    });
  }

  function reqRaw(url) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 30000,
        onload: (res) => resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, text: res.responseText || '' }),
        onerror: () => resolve({ ok: false, status: 0, text: '' }),
        ontimeout: () => resolve({ ok: false, status: 0, text: '' }),
      });
    });
  }

  function hideStandaloneLaunchers(selector) {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        el.style.display = 'none';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      });
    } catch (_) {}
  }

  async function ensureAppLoaded(app) {
    const slot = state.loaders[app.id] || (state.loaders[app.id] = { loading: false, loaded: false, error: '' });

    if (slot.loaded && window[app.bridge]) {
      hideStandaloneLaunchers(app.launcherSelector);
      return true;
    }
    if (slot.loading) {
      return new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (slot.loaded && window[app.bridge]) {
            clearInterval(timer);
            resolve(true);
          } else if (Date.now() - start > 30000) {
            clearInterval(timer);
            resolve(false);
          }
        }, 300);
      });
    }

    slot.loading = true;
    slot.error = '';
    renderHubCards();

    try {
      const res = await reqRaw(app.url);
      if (!res.ok || !res.text) {
        slot.loading = false;
        slot.error = 'Could not fetch script';
        renderHubCards();
        return false;
      }

      const patched = app.patch ? app.patch(res.text) : res.text;
      (0, eval)(patched);

      slot.loading = false;
      slot.loaded = !!window[app.bridge];
      if (!slot.loaded) slot.error = 'Bridge missing after load';
      hideStandaloneLaunchers(app.launcherSelector);
      renderHubCards();
      return slot.loaded;
    } catch (e) {
      slot.loading = false;
      slot.error = 'Eval failed';
      renderHubCards();
      return false;
    }
  }

  async function openApp(appId) {
    const app = APPS.find((x) => x.id === appId);
    if (!app) return;

    if (state.minimizeOnOpen) saveHubOpen(false);

    const ok = await ensureAppLoaded(app);
    if (!ok || !window[app.bridge] || typeof window[app.bridge].open !== 'function') {
      alert(app.name + ' could not load from its live script URL.');
      return;
    }

    hideStandaloneLaunchers(app.launcherSelector);
    try {
      window[app.bridge].open();
    } catch (_) {
      alert(app.name + ' bridge failed to open.');
    }
  }

  function isVisibleElement(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight;
  }

  function targetKey(el) {
    if (!el) return '';
    const cls = typeof el.className === 'string' ? el.className : '';
    return `${el.tagName}|${el.id || ''}|${cls}`;
  }

  function getHeaderMountTarget() {
    const candidates = Array.from(document.querySelectorAll('div, ul, section, nav, li, span'));
    const matches = [];

    for (const el of candidates) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;

      const hasMoney = text.includes('$');
      const hasPoints = /\bP\s*\d+/i.test(text) || /Points\s*:\s*\d+/i.test(text);
      const hasMerits = /\bMerits\s*:\s*\d+/i.test(text) || text.includes('Merits');
      const hasMessages = /Messages/i.test(text);
      const hasBattleStats = /Battle Stats/i.test(text);
      const hasGenderWords = /male|female/i.test(text);

      if (!hasMoney || !hasPoints) continue;
      if (hasMessages || hasBattleStats || hasGenderWords) continue;
      if (!isVisibleElement(el)) continue;

      const cls = typeof el.className === 'string' ? el.className : '';
      const strongBonus = /points-mobile/i.test(cls) ? -500 : 0;
      const mediumBonus = /swiperWrapper|status|user-information|info-row/i.test(cls) ? -150 : 0;
      const meritBonus = hasMerits ? -20 : 0;
      const score = text.length + strongBonus + mediumBonus + meritBonus;

      matches.push({ el, score });
    }

    matches.sort((a, b) => a.score - b.score);
    if (!matches.length) return null;

    const locked = matches.find((m) => targetKey(m.el) === state.lastTargetKey);
    return (locked && isVisibleElement(locked.el)) ? locked.el : matches[0].el;
  }

  function ensureHeaderButton() {
    let btn = document.getElementById(HUB_SHIELD_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = HUB_SHIELD_ID;
      btn.type = 'button';
      btn.title = 'See Hub';
      btn.setAttribute('aria-label', 'See Hub');
      btn.textContent = '🍟';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveHubOpen(!state.hubOpen);
      });
    }

    const target = getHeaderMountTarget();
    if (!target) return false;

    let slot = document.getElementById(HUB_STATUS_SLOT_ID);
    if (!slot) {
      slot = document.createElement('div');
      slot.id = HUB_STATUS_SLOT_ID;
    }

    const key = targetKey(target);
    const buttonMissing = !btn.isConnected || btn.parentElement !== slot;
    const slotMissing = !slot.isConnected || slot.parentElement !== target;

    if (slotMissing || buttonMissing || state.lastTargetKey !== key) {
      target.appendChild(slot);
      slot.appendChild(btn);
      state.lastTargetKey = key;
    }
    return true;
  }

  function boot() {
    ensureStyles();
    ensureRoot();

    if (!state.mounted) {
      state.mounted = true;
      try { GM_registerMenuCommand('Open See Hub', () => saveHubOpen(true)); } catch (_) {}
    }

    ensureHeaderButton();
    renderHubVisibility();
    renderHubCards();
  }

  function startMountWatch() {
    setInterval(() => {
      if (!document.body) return;
      if (!document.getElementById(HUB_ID)) ensureRoot();
      ensureHeaderButton();
      hideStandaloneLaunchers('#warhub-shield, #warhub-badge, #si-pda-launcher, #giveaway-shield');
    }, 1500);

    if (!state.observer) {
      state.observer = new MutationObserver(() => {
        ensureHeaderButton();
        hideStandaloneLaunchers('#warhub-shield, #warhub-badge, #si-pda-launcher, #giveaway-shield');
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  boot();
  startMountWatch();
})();
