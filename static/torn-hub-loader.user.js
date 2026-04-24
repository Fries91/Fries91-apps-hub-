// ==UserScript==
// @name         🍟 apps
// @namespace    torn.hub.fries91
// @version      0.5.2
// @description  PDA friendly Torn app hub launcher.
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
// @connect      ffscouter.com
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const HUB_ID = 'fries-torn-hub';
  const HUB_SHIELD_ID = 'fries-torn-hub-shield';
  const HUB_OVERLAY_ID = 'fries-torn-hub-overlay';
  const HUB_APP_LAYER_ID = 'fries-torn-app-layer';
  const HUB_STATUS_SLOT_ID = 'fries-torn-hub-status-slot';

  const K_HUB_OPEN = 'torn_hub_open';
  const K_HUB_MINIMIZE_ON_OPEN = 'torn_hub_minimize_on_open';
  const K_ENABLED_APPS = 'torn_hub_enabled_apps';

  const state = {
    apps: [],
    openApps: new Map(),
    hubOpen: false,
    minimizeOnOpen: false,
    mounted: false,
    lastTargetKey: '',
    observer: null,
    lastHubButtonTapAt: 0,
    hubForceOpenGuard: false,
  };

  function readBool(key, fallback) {
    try {
      return !!GM_getValue(key, fallback);
    } catch (_) {
      return fallback;
    }
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
    try {
      GM_setValue(key, JSON.stringify(value));
    } catch (_) {}
  }

  function saveHubOpen(next) {
    state.hubOpen = !!next;
    state.hubForceOpenGuard = !!next;

    // Do not let old saved storage reopen/close the Hub on PDA.
    try { GM_setValue(K_HUB_OPEN, false); } catch (_) {}

    renderHubVisibility();

    // Sticky open guard: Torn PDA can redraw/tap-leak right after opening.
    // Re-apply the open class a few times, but never close from here.
    if (state.hubOpen) {
      [60, 180, 420, 900].forEach(function (ms) {
        setTimeout(function () {
          if (state.hubOpen) renderHubVisibility();
        }, ms);
      });
    }
  }

  function saveMinimizeOnOpen(next) {
    state.minimizeOnOpen = false;
    try {
      GM_setValue(K_HUB_MINIMIZE_ON_OPEN, false);
    } catch (_) {}
    renderHubCards();
  }

  function appEnabled(appId) {
    return true;
  }

  function setAppEnabled(appId, isEnabled) {
    renderHubCards();
  }

  function registerApp(app) {
    if (!app || !app.id || !app.name || typeof app.open !== 'function') return;
    if (state.apps.some((a) => a.id === app.id)) return;

    state.apps.push({
      icon: '📦',
      description: '',
      enabledByDefault: true,
      ...app,
    });

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
        z-index: 2;
        width: 24px;
        height: 24px;
        min-width: 24px;
        border-radius: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 0;
        box-shadow: none;
        color: #fff;
        font-size: 20px;
        line-height: 1;
        user-select: none;
        cursor: pointer;
        padding: 0;
        margin: 0;
        flex: 0 0 auto;
        transform: none;
        transition: opacity .15s ease, transform .15s ease;
        opacity: .98;
      }

      #${HUB_SHIELD_ID}.thub-floating-fallback {
        display: none !important;
      }

      #${HUB_SHIELD_ID}:hover,
      #${HUB_SHIELD_ID}:focus {
        background: transparent;
        border-color: transparent;
        box-shadow: none;
        opacity: 1;
      }

      #${HUB_SHIELD_ID}:active {
        transform: scale(.96);
      }

      #${HUB_STATUS_SLOT_ID} {
        position: relative;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 6px;
        margin-right: 0;
        flex: 0 0 auto;
        vertical-align: middle;
        width: 28px;
        height: 28px;
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
        background: linear-gradient(180deg, rgba(24,10,12,.98), rgba(8,9,12,.98));
        color: #f7ead0;
        border: 1px solid rgba(205,164,74,.22);
        border-radius: 18px;
        box-shadow: 0 18px 42px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
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
        background: linear-gradient(180deg, rgba(120,18,18,.40), rgba(35,12,14,.62));
        border-bottom: 1px solid rgba(205,164,74,.18);
      }

      .thub-title {
        font-weight: 900;
        letter-spacing: .4px;
        font-size: 16px;
        color: #f4d98f;
      }

      .thub-sub {
        opacity: .72;
        font-size: 11px;
        margin-top: 2px;
      }

      .thub-actions {
        display: flex;
        gap: 8px;
      }

      .thub-btn {
        border: 1px solid rgba(205,164,74,.20);
        background: rgba(255,255,255,.07);
        color: #fff;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        cursor: pointer;
      }

      .thub-body {
        padding: 12px;
        overflow: auto;
      }

      .thub-section-title {
        font-weight: 700;
        font-size: 13px;
        margin: 0 0 10px;
      }

      .thub-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .thub-card {
        border: 1px solid rgba(205,164,74,.16);
        border-radius: 15px;
        padding: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.035));
      }

      .thub-card-top {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .thub-app-icon {
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: radial-gradient(circle at 35% 25%, rgba(205,164,74,.24), rgba(120,18,18,.20));
        border: 1px solid rgba(205,164,74,.14);
        font-size: 20px;
        flex: 0 0 42px;
      }

      .thub-app-name {
        font-size: 14px;
        font-weight: 800;
      }

      .thub-app-desc {
        font-size: 12px;
        opacity: .8;
        margin-top: 3px;
      }

      .thub-card-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
        flex-wrap: wrap;
      }

      #thub-app-grid .thub-card {
        text-align: center;
        padding: 14px 12px;
      }

      #thub-app-grid .thub-card-top {
        display: block;
        text-align: center;
      }

      #thub-app-grid .thub-app-icon,
      #thub-app-grid .thub-app-desc {
        display: none;
      }

      #thub-app-grid .thub-app-name {
        font-size: 15px;
      }

      #thub-app-grid .thub-card-actions {
        justify-content: center;
      }

      #thub-app-grid .thub-open {
        min-width: 112px;
      }

      .thub-open {
        background: linear-gradient(180deg, #b72525, #761313);
        border-color: rgba(244,217,143,.28);
      }

      .thub-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid rgba(255,255,255,.06);
      }

      .thub-note {
        font-size: 11px;
        opacity: .72;
        margin-top: 10px;
      }


      .thub-app-only {
        text-align: center;
        padding: 14px 12px;
      }

      .thub-app-only .thub-app-name {
        font-size: 15px;
        margin-bottom: 10px;
      }

      .thub-app-only .thub-card-actions {
        justify-content: center;
        margin-top: 0;
      }

      .thub-app-only .thub-open {
        min-width: 128px;
      }

      .thub-window {
        position: fixed;
        z-index: 2147483645;
        width: min(420px, calc(100vw - 20px));
        max-height: min(82vh, 900px);
        background: rgba(14,16,22,.98);
        color: #eef3ff;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(0,0,0,.5);
        overflow: hidden;
      }

      .thub-window-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02));
        border-bottom: 1px solid rgba(255,255,255,.08);
        cursor: move;
      }

      .thub-window-body {
        padding: 12px;
        overflow: auto;
        max-height: calc(min(82vh, 900px) - 50px);
      }

      .thub-empty {
        font-size: 12px;
        opacity: .8;
        padding: 10px 0;
      }
    `);
    GM_addStyle(`
      #warhub-shield,
      #warhub-badge,
      #si-pda-launcher,
      #giveaway-shield,
      #warhub-shield button,
      #warhub-badge * {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
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
            <div class="thub-title">Torn Hub</div>
            <div class="thub-sub">Open your apps</div>
          </div>
          <div class="thub-actions">
            <button class="thub-btn" id="thub-close-btn">✕</button>
          </div>
        </div>
        <div class="thub-body">
          <div class="thub-section-title">Apps</div>
          <div class="thub-grid" id="thub-app-grid"></div>
        </div>
      </div>
      <div id="${HUB_APP_LAYER_ID}"></div>
    `;
    document.body.appendChild(root);

    const hubOverlay = document.getElementById(HUB_OVERLAY_ID);
    if (hubOverlay) {
      ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend'].forEach((eventName) => {
        hubOverlay.addEventListener(eventName, (e) => {
          e.stopPropagation();
        }, true);
      });
    }

    const closeBtn = document.getElementById('thub-close-btn');

    if (closeBtn) closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveHubOpen(false);
    }, true);

    renderHubVisibility();
    renderHubCards();
  }

  function isAnyAppOverlayOpen() {
    const war = document.getElementById('warhub-overlay');
    const insurance = document.getElementById('si-pda-overlay');
    const giveaway = document.getElementById('giveaway-overlay');
    const hubWindow = document.querySelector('.thub-window');

    const warOpen = !!(war && war.classList.contains('open'));
    const insuranceOpen = !!(insurance && insurance.classList.contains('open'));
    const giveawayOpen = !!(giveaway && !giveaway.classList.contains('hidden'));
    const hubWindowOpen = !!(hubWindow && hubWindow.style.display !== 'none');

    return warOpen || insuranceOpen || giveawayOpen || hubWindowOpen;
  }

  function renderHubVisibility() {
    const overlay = document.getElementById(HUB_OVERLAY_ID);
    const shield = document.getElementById(HUB_SHIELD_ID);
    if (!overlay) return;

    if (state.hubOpen) {
      overlay.classList.add('open');
      overlay.style.setProperty('display', 'flex', 'important');
      overlay.style.setProperty('visibility', 'visible', 'important');
      overlay.style.setProperty('opacity', '1', 'important');
      overlay.style.setProperty('pointer-events', 'auto', 'important');
    } else {
      overlay.classList.remove('open');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }

    if (shield) {
      const showShield = !state.hubOpen && !isAnyAppOverlayOpen() && !shield.classList.contains('thub-floating-fallback');
      shield.style.setProperty('display', 'inline-flex', 'important');
      shield.style.setProperty('visibility', showShield ? 'visible' : 'hidden', 'important');
      shield.style.setProperty('opacity', showShield ? '0.98' : '0', 'important');
      shield.style.setProperty('pointer-events', showShield ? 'auto' : 'none', 'important');
    }
  }

  function renderHubCards() {
    const grid = document.getElementById('thub-app-grid');
    if (!grid) return;

    const apps = state.apps.slice();

    if (!apps.length) {
      grid.innerHTML = `<div class="thub-empty">No apps are loaded yet.</div>`;
      return;
    }

    grid.innerHTML = apps.map((app) => `
      <div class="thub-card thub-app-only" data-app-id="${escapeHtml(app.id)}">
        <div class="thub-app-name">${escapeHtml(app.name)}</div>
        <div class="thub-card-actions">
          <button class="thub-btn thub-open" data-open-app="${escapeHtml(app.id)}">Open</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-open-app]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openApp(btn.getAttribute('data-open-app'));
      });
    });
  }

  function openApp(appId) {
    const app = state.apps.find((a) => a.id === appId);
    if (!app) return;

    // PDA performance fix: close only the Hub menu after opening an app,
    // so the phone is not rendering two overlays at the same time.
    app.open({
      createWindow,
      closeWindow,
      isOpen: (id) => state.openApps.has(id),
    });

    saveHubOpen(false);
    setTimeout(renderHubVisibility, 80);
  }

  function createWindow({ id, title, width = 420, top = 110, left = null, content = '', onClose = null }) {
    if (!id) return null;

    const existing = document.getElementById(`thub-window-${id}`);
    if (existing) {
      existing.style.display = 'block';
      return existing;
    }

    const layer = document.getElementById(HUB_APP_LAYER_ID);
    if (!layer) return null;

    const win = document.createElement('div');
    win.className = 'thub-window';
    win.id = `thub-window-${id}`;
    win.style.width = `${width}px`;
    win.style.top = `${top}px`;
    win.style.left = left == null
      ? `${Math.max(10, window.innerWidth - width - 14)}px`
      : `${left}px`;

    win.innerHTML = `
      <div class="thub-window-head">
        <div class="thub-app-name">${escapeHtml(title || id)}</div>
        <div class="thub-actions">
          <button class="thub-btn" data-min>—</button>
          <button class="thub-btn" data-close>✕</button>
        </div>
      </div>
      <div class="thub-window-body">${content}</div>
    `;

    layer.appendChild(win);
    state.openApps.set(id, { id, onClose });

    const head = win.querySelector('.thub-window-head');
    const closeBtn = win.querySelector('[data-close]');
    const minBtn = win.querySelector('[data-min]');
    const body = win.querySelector('.thub-window-body');

    if (closeBtn) closeBtn.addEventListener('click', () => closeWindow(id));
    if (minBtn && body) {
      minBtn.addEventListener('click', () => {
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (head) makeDraggableWindow(head, win);
    return win;
  }

  function closeWindow(id) {
    const win = document.getElementById(`thub-window-${id}`);
    if (win) win.remove();

    const entry = state.openApps.get(id);
    if (entry && typeof entry.onClose === 'function') {
      try {
        entry.onClose();
      } catch (_) {}
    }
    state.openApps.delete(id);
  }

  function makeDraggableWindow(handle, target) {
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = target.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const nextLeft = Math.max(6, startLeft + (e.clientX - startX));
      const nextTop = Math.max(6, startTop + (e.clientY - startY));
      target.style.left = `${nextLeft}px`;
      target.style.top = `${nextTop}px`;
    });

    const finish = () => {
      dragging = false;
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  function isVisibleElement(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight
    );
  }

  function targetKey(el) {
    if (!el) return '';
    const cls = typeof el.className === 'string' ? el.className : '';
    return `${el.tagName}|${el.id || ''}|${cls}`;
  }

  function getHeaderMountTarget() {
    // PDA performance fix: check known Torn header/status rows first.
    const directSelectors = [
      '.points-mobile',
      '[class*="points-mobile"]',
      '[class*="user-information"]',
      '[class*="info-row"]',
      '[class*="status"]',
      '[class*="icons"]'
    ];

    for (const sel of directSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(sel)).find((el) => {
          if (!isVisibleElement(el)) return false;
          const rect = el.getBoundingClientRect();
          return rect.top < 460 && rect.height <= 95 && rect.width >= 80;
        });
        if (found) return found;
      } catch (_) {}
    }

    // Fallback is intentionally small. Full document scans were freezing PDA.
    const candidates = Array.from(document.querySelectorAll('div, ul, nav, section')).slice(0, 140);
    let best = null;
    let bestScore = 999999;

    for (const el of candidates) {
      if (!isVisibleElement(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top > 460 || rect.height > 95 || rect.width < 80) continue;

      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/Messages|Events|Awards|Battle Stats|Job Information|Property Information|bets worth|upcoming/i.test(text)) continue;

      const hasMoney = text.includes('$');
      const hasPoints = /\bP\s*\d+/i.test(text) || /Points\s*:?\s*\d+/i.test(text);
      const hasMerits = /\bMerits\s*:?\s*\d+/i.test(text) || /\bM\s*\d+/i.test(text);
      if (!hasMoney && !hasPoints && !hasMerits) continue;

      let score = text.length + rect.top;
      if (hasMoney) score -= 220;
      if (hasPoints) score -= 90;
      if (hasMerits) score -= 90;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return best;
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
        const now = Date.now();
        if (now - state.lastHubButtonTapAt < 650) return;
        state.lastHubButtonTapAt = now;
        saveHubOpen(true);
      }, true);
    }

    const target = getHeaderMountTarget();

    if (!target) {
      btn.classList.add('thub-floating-fallback');
      if (!btn.isConnected) document.body.appendChild(btn);
      btn.style.setProperty('display', 'none', 'important');
      btn.style.setProperty('visibility', 'hidden', 'important');
      btn.style.setProperty('pointer-events', 'none', 'important');
      return false;
    }

    btn.classList.remove('thub-floating-fallback');
    btn.style.removeProperty('display');

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


  function hideStandaloneLaunchers() {
    try {
      var ids = ['warhub-shield','warhub-badge','si-pda-launcher','giveaway-shield'];
      ids.forEach(function(id){
        var el = document.getElementById(id);
        if (!el) return;
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      });
    } catch (_) {}
  }


  function forceHideBottomCornerLaunchersCss() {
    try {
      if (document.getElementById('fries-hide-bottom-launchers-style')) return;
      var style = document.createElement('style');
      style.id = 'fries-hide-bottom-launchers-style';
      style.textContent = '#warhub-shield,#warhub-badge{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;}';
      document.documentElement.appendChild(style);
    } catch (_) {}
  }


  function openWarHubModule(createWindow) {
    if (window.__FRIES_WARHUB_BRIDGE__ && typeof window.__FRIES_WARHUB_BRIDGE__.open === 'function') {
      hideStandaloneLaunchers();
      window.__FRIES_WARHUB_BRIDGE__.open();
      setTimeout(renderHubVisibility, 50);
      return;
    }

    createWindow({
      id: 'warhub-error',
      title: 'War Hub',
      width: 420,
      content: `
        <div class="thub-card">
          <div class="thub-app-name">War Hub could not load</div>
          <div class="thub-app-desc">The embedded War and Chain module did not initialize. Refresh Torn once and try again.</div>
        </div>
      `,
    });
  }

  function registerDemoApps() {
    registerApp({
      id: 'warhub',
      name: 'War Hub',
      icon: '⚔️',
      description: 'War tools, members, enemies, hospital, chain, and faction support.',
      open: ({ createWindow }) => {
        openWarHubModule(createWindow);
      },
    });

        registerApp({
      id: 'insurance',
      name: 'Sinner Insurance',
      icon: '💊',
      description: 'Insurance plans, activations, claims, payouts, and admin tools.',
      open: ({ createWindow }) => {
        if (window.__FRIES_INSURANCE_BRIDGE__ && typeof window.__FRIES_INSURANCE_BRIDGE__.open === 'function') {
          try {
            const launcher = document.getElementById('si-pda-launcher');
            if (launcher) launcher.style.display = 'none';
          } catch (_) {}
          window.__FRIES_INSURANCE_BRIDGE__.open();
          setTimeout(renderHubVisibility, 50);
          return;
        }

        createWindow({
          id: 'insurance-error',
          title: 'Sinner Insurance',
          width: 420,
          content: `
            <div class="thub-card">
              <div class="thub-app-name">Sinner Insurance could not load</div>
              <div class="thub-app-desc">The embedded insurance module bridge was not found in this merged build.</div>
            </div>
          `,
        });
      },
    });

        registerApp({
      id: 'lottery',
      name: 'Giveaway',
      icon: '🎟️',
      description: 'Giveaway entries, draw wheel, winners, countdowns, and admin controls.',
      open: ({ createWindow }) => {
        if (window.__FRIES_GIVEAWAY_BRIDGE__ && typeof window.__FRIES_GIVEAWAY_BRIDGE__.open === 'function') {
          try {
            const launcher = document.getElementById('giveaway-shield');
            if (launcher) launcher.style.display = 'none';
          } catch (_) {}
          window.__FRIES_GIVEAWAY_BRIDGE__.open();
          setTimeout(renderHubVisibility, 50);
          return;
        }

        createWindow({
          id: 'lottery-error',
          title: 'Giveaway',
          width: 420,
          content: `
            <div class="thub-card">
              <div class="thub-app-name">Giveaway could not load</div>
              <div class="thub-app-desc">The embedded giveaway module bridge was not found in this merged build.</div>
            </div>
          `,
        });
      },
    });
  }

  function boot() {
    state.minimizeOnOpen = false;
    try { GM_setValue(K_HUB_MINIMIZE_ON_OPEN, false); } catch (_) {}
    ensureStyles();
    ensureRoot();

    if (!state.mounted) {
      state.mounted = true;
      registerDemoApps();

      try {
        GM_registerMenuCommand('Open Torn Hub', () => saveHubOpen(true));
      } catch (_) {}
    }

    ensureHeaderButton();
    forceHideBottomCornerLaunchersCss();
    hideStandaloneLaunchers();
    renderHubVisibility();
    renderHubCards();
  }

  function startMountWatch() {
    // PDA-safe light sync.
    // While the Hub is open, do not remount, move, or hide anything except
    // re-applying the visible state so Torn/PDA redraws cannot close it.
    setInterval(() => {
      if (!document.body) return;
      if (!document.getElementById(HUB_ID)) ensureRoot();

      if (state.hubOpen) {
        renderHubVisibility();
        return;
      }

      forceHideBottomCornerLaunchersCss();
      hideStandaloneLaunchers();

      if (isAnyAppOverlayOpen()) {
        renderHubVisibility();
        return;
      }

      ensureHeaderButton();
      renderHubVisibility();
    }, 5000);
  }

  try { boot(); } catch (e) {}
  try { startMountWatch(); } catch (e) {}
})();

/* ===== Embedded War and Chain module ===== */

// ==UserScript==
// @name         War and Chain ⚔️
// @namespace    fries91-war-hub
// @version      3.6.6
// @description  War and Chain by Fries91. Free-access rebuild with admin and leader/co-leader restrictions kept.
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @downloadURL  https://torn-war-bot.onrender.com/static/war-bot.user.js
// @updateURL    https://torn-war-bot.onrender.com/static/war-bot.user.js
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      torn-war-bot.onrender.com
// @connect      ffscouter.com
// ==/UserScript==

(function () {
    'use strict';


    if (window.__WAR_HUB_V291__ && document.getElementById('warhub-shield')) return;
    window.__WAR_HUB_V291__ = true;
    window.__WAR_HUB_EMBEDDED__ = true;

    // ============================================================
    // 01. CORE CONFIG / STORAGE KEYS
    // ============================================================

    var BASE_URL = 'https://torn-war-bot.onrender.com';

    var K_API_KEY = 'warhub_api_key_v3';
    var K_ADMIN_KEY = 'warhub_admin_key_v3';
    var K_OWNER_TOKEN = 'warhub_owner_token_v3';
    var K_SESSION = 'warhub_session_v3';
    var K_OPEN = 'warhub_open_v3';
    var K_TAB = 'warhub_tab_v3';
    var K_SHIELD_POS = 'warhub_shield_pos_v6';
    var K_OVERLAY_POS = 'warhub_overlay_pos_v3';
    var K_REFRESH = 'warhub_refresh_ms_v3';
    var K_LOCAL_NOTIFICATIONS = 'warhub_local_notifications_v3';
    var K_ACCESS_CACHE = 'warhub_access_cache_v3';
    var K_OVERVIEW_BOXES = 'warhub_overview_boxes_v3';
    var K_OVERLAY_SCROLL = 'warhub_overlay_scroll_v3';
    var K_FF_SCOUTER_KEY = 'warhub_ff_scouter_key_v1';
    var K_FF_SCOUTER_CACHE = 'warhub_ff_scouter_cache_v1';
    var K_TARGETS_LOCAL = 'warhub_targets_local_v1';

    
    // ============================================================
    // 02. OWNER CONFIG
    // ============================================================

    var OWNER_NAME = 'Fries91';
    var OWNER_USER_ID = '3679030';

    // ============================================================
    // 03. TAB ORDER
    // ============================================================

    var TAB_ROW_1 = [
        ['overview', 'Overview'],
        ['members', 'Members'],
        ['enemies', 'Enemies'],
        ['hospital', 'Hospital'],
        ['chain', 'Chain']
    ];

    var TAB_ROW_2 = [
        ['meddeals', 'Med Deals'],
        ['terms', 'Terms'],
        ['settings', 'Settings'],
        ['instructions', 'Help'],
        ['admin', 'Admin']
    ];

    // ============================================================
    // 04. RUNTIME STATE / CACHES
    // ============================================================

    var state = null;
    var analyticsCache = null;
    var adminTopFiveCache = null;
    var factionMembersCache = null;
    var currentFactionMembers = [];
    var liveSummaryCache = null;
    var liveSummaryLoading = false;
    var liveSummaryError = '';
    var liveSummaryLastAt = 0;
    var warEnemiesCache = [];
    var warEnemiesFactionName = '';
    var warEnemiesFactionId = '';
    var warEnemiesLoadedAt = 0;
    var warEnemyStatsCache = {};
    var warEnemyStatsLoadedAt = 0;

    var overlay = null;
    var shield = null;
    var badge = null;

    var mounted = false;
    var dragMoved = false;
    var isOpen = !!GM_getValue(K_OPEN, false);
    var currentTab = GM_getValue(K_TAB, 'settings');
    if (currentTab === 'owner') currentTab = 'admin';
    if (currentTab === 'summary' || currentTab === 'wartop5' || currentTab === 'faction') currentTab = 'overview';

    var pollTimer = null;
    var remountTimer = null;
    var loadInFlight = false;
    var factionHydratePending = false;

    var membersCountdownTimer = null;
    var membersLiveStamp = 0;

    var lastStatusMsg = '';
    var lastStatusErr = false;

    var accessState = normalizeAccessCache(GM_getValue(K_ACCESS_CACHE, null));

    var FF_SCOUTER_CACHE_MS = 30 * 1000; function getFfScouterKey() {
        return String(GM_getValue(K_FF_SCOUTER_KEY, '') || '').trim();
    }

    function getFfScouterCacheMap() {
        var raw = GM_getValue(K_FF_SCOUTER_CACHE, '{}');
        try {
            var parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_e) {
            return {};
        }
    }

    function setFfScouterCacheMap(map) {
        try {
            GM_setValue(K_FF_SCOUTER_CACHE, JSON.stringify(map || {}));
        } catch (_e) {}
    }

    function getFfScouterData(member) {
        var id = String(getMemberId(member) || '').trim();
        if (!id) return null;
        var direct = warEnemyStatsCache && warEnemyStatsCache[id];
        if (direct && direct.ffscouter) return direct.ffscouter;
        return null;
    }

    function getFfScouterCached(id) {
        var map = getFfScouterCacheMap();
        var item = map[String(id || '')];
        if (!item || !item.fetched_at || !item.payload) return null;
        if ((Date.now() - Number(item.fetched_at || 0)) > FF_SCOUTER_CACHE_MS) {
            delete map[String(id || '')];
            setFfScouterCacheMap(map);
            return null;
        }
        return item.payload;
    }

    function setFfScouterCached(id, payload) {
        if (!id || !payload) return;
        var map = getFfScouterCacheMap();
        map[String(id)] = { fetched_at: Date.now(), payload: payload };
        setFfScouterCacheMap(map);
    }

    function ffDifficultyLabel(ff) {
        ff = Number(ff || 0);
        if (!Number.isFinite(ff) || ff <= 0) return '';
        if (ff <= 1) return 'Extremely easy';
        if (ff <= 2) return 'Easy';
        if (ff <= 3.5) return 'Moderately difficult';
        if (ff <= 4.5) return 'Difficult';
        return 'May be impossible';
    }

    function normalizeFfScouterItem(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var ff = Number(raw.fair_fight);
        var bsEstimate = Number(raw.bs_estimate || 0);
        var bsEstimateHuman = String(raw.bs_estimate_human || '').trim();
        var updated = raw.last_updated || '';
        var noData = raw.no_data === true || raw.fair_fight == null;
        var estimateMillions = 0;
        if (Number.isFinite(bsEstimate) && bsEstimate > 0) {
            estimateMillions = bsEstimate / 1000000;
        } else if (bsEstimateHuman) {
            estimateMillions = parseBattleNumber(bsEstimateHuman);
        }
        return {
            fair_fight: Number.isFinite(ff) ? ff : 0,
            difficulty: ffDifficultyLabel(ff),
            bs_estimate: Number.isFinite(bsEstimate) ? bsEstimate : 0,
            bs_estimate_human: bsEstimateHuman,
            estimate_m: Number.isFinite(estimateMillions) ? estimateMillions : 0,
            last_updated: updated,
            no_data: noData
        };
    }

    function fetchFfScouterStatsBatch(ids) {
        var key = getFfScouterKey();
        ids = arr(ids).map(function (id) { return String(id || '').trim(); }).filter(Boolean);
        if (!key || !ids.length) return Promise.resolve({});

        var url = 'https://ffscouter.com/api/v1/get-stats?key=' + encodeURIComponent(key) + '&targets=' + encodeURIComponent(ids.join(','));

        return new Promise(function (resolve) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (resp) {
                    try {
                        var data = JSON.parse((resp && resp.responseText) || '[]');
                        var out = {};
                        arr(data).forEach(function (item) {
                            if (!item || !item.player_id) return;
                            out[String(item.player_id)] = normalizeFfScouterItem(item);
                            setFfScouterCached(String(item.player_id), item);
                        });
                        resolve(out);
                    } catch (_e) {
                        resolve({});
                    }
                },
                onerror: function () { resolve({}); }
            });
        });
    }

    function queueEnemyFfPredictions(list) {
        var members = arr(list);
        if (!members.length) return;

        warEnemyStatsCache = warEnemyStatsCache || {};
        var idsToFetch = [];

        members.forEach(function (member) {
            var id = String(getMemberId(member) || '').trim();
            if (!id) return;
            if (!warEnemyStatsCache[id]) warEnemyStatsCache[id] = {};

            var cached = getFfScouterCached(id);
            if (cached) {
                warEnemyStatsCache[id].ffscouter = normalizeFfScouterItem(cached);
            } else if (!warEnemyStatsCache[id].ff_loading) {
                warEnemyStatsCache[id].ff_loading = true;
                idsToFetch.push(id);
            }
        });

        if (!idsToFetch.length) return;

        fetchFfScouterStatsBatch(idsToFetch).then(function (map) {
            idsToFetch.forEach(function (id) {
                if (!warEnemyStatsCache[id]) warEnemyStatsCache[id] = {};
                warEnemyStatsCache[id].ff_loading = false;
                if (map[id]) warEnemyStatsCache[id].ffscouter = map[id];
            });
            if (currentTab === 'enemies' && overlay && overlay.classList.contains('open')) {
                renderBody();
            }
        }).catch(function () {
            idsToFetch.forEach(function (id) {
                if (!warEnemyStatsCache[id]) warEnemyStatsCache[id] = {};
                warEnemyStatsCache[id].ff_loading = false;
            });
        });
    }


    // ============================================================
    // 05. STYLES
    // ============================================================

    var css = "\n\
#warhub-shield {\n\
  position: fixed !important;\n\
  z-index: 2147483647 !important;\n\
  width: 36px !important;\n\
  height: 36px !important;\n\
  border-radius: 10px !important;\n\
  display: flex !important;\n\
  align-items: center !important;\n\
  justify-content: center !important;\n\
  font-size: 18px !important;\n\
  line-height: 1 !important;\n\
  cursor: pointer !important;\n\
  user-select: none !important;\n\
  -webkit-user-select: none !important;\n\
  -webkit-touch-callout: none !important;\n\
  -webkit-tap-highlight-color: transparent !important;\n\
  touch-action: none !important;\n\
  box-shadow: 0 8px 24px rgba(0,0,0,.45) !important;\n\
  border: 1px solid rgba(255,255,255,.10) !important;\n\
  background: radial-gradient(circle at 30% 20%, rgba(220,75,75,.98), rgba(110,12,12,.98) 55%, rgba(48,6,6,.98)) !important;\n\
  color: #fff !important;\n\
  left: auto !important;\n\
  right: 14px !important;\n\
  top: 50% !important;\n\
  bottom: auto !important;\n\
  transform: translateY(-50%) !important;\n\
  opacity: 1 !important;\n\
  visibility: visible !important;\n\
  pointer-events: auto !important;\n\
}\n\
\n\
#warhub-badge {\n\
  position: fixed !important;\n\
  z-index: 2147483647 !important;\n\
  min-width: 16px !important;\n\
  height: 16px !important;\n\
  padding: 0 4px !important;\n\
  border-radius: 999px !important;\n\
  background: #ffd54a !important;\n\
  color: #111 !important;\n\
  font-size: 10px !important;\n\
  line-height: 16px !important;\n\
  text-align: center !important;\n\
  font-weight: 800 !important;\n\
  box-shadow: 0 3px 12px rgba(0,0,0,.45) !important;\n\
  display: none !important;\n\
  pointer-events: none !important;\n\
}\n\
#warhub-overlay {\n\
  position: fixed !important;\n\
  z-index: 2147483646 !important;\n\
  left: 8px !important;\n\
  right: 8px !important;\n\
  top: 8px !important;\n\
  bottom: 8px !important;\n\
  width: auto !important;\n\
  max-width: 520px !important;\n\
  margin: 0 auto !important;\n\
  border-radius: 14px !important;\n\
  background: linear-gradient(180deg, #171717, #0c0c0c) !important;\n\
  color: #f2f2f2 !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  box-shadow: 0 16px 38px rgba(0,0,0,.54) !important;\n\
  display: none !important;\n\
  flex-direction: column !important;\n\
  box-sizing: border-box !important;\n\
  overflow: hidden !important;\n\
  opacity: 1 !important;\n\
  visibility: visible !important;\n\
  overscroll-behavior: contain !important;\n\
}\n\
#warhub-overlay.open {\n\
  display: flex !important;\n\
}\n\
#warhub-overlay *,\n\
#warhub-overlay *::before,\n\
#warhub-overlay *::after {\n\
  box-sizing: border-box !important;\n\
}\n\
\n\
.warhub-head {\n\
  flex: 0 0 auto !important;\n\
  padding: 12px 12px 10px !important;\n\
  border-bottom: 1px solid rgba(255,255,255,.08) !important;\n\
  background: rgba(255,255,255,.03) !important;\n\
  touch-action: none !important;\n\
}\n\
\n\
.warhub-toprow {\n\
  display: flex !important;\n\
  align-items: center !important;\n\
  justify-content: space-between !important;\n\
  gap: 10px !important;\n\
  width: 100% !important;\n\
}\n\
\n\
.warhub-title {\n\
  font-weight: 800 !important;\n\
  font-size: 16px !important;\n\
  letter-spacing: .2px !important;\n\
  color: #fff !important;\n\
}\n\
.warhub-sub {\n\
  opacity: .72 !important;\n\
  font-size: 11px !important;\n\
  margin-top: 2px !important;\n\
  color: #fff !important;\n\
}\n\
\n\
.warhub-close {\n\
  appearance: none !important;\n\
  -webkit-appearance: none !important;\n\
  border: 0 !important;\n\
  border-radius: 10px !important;\n\
  background: rgba(255,255,255,.08) !important;\n\
  color: #fff !important;\n\
  padding: 6px 10px !important;\n\
  font-weight: 700 !important;\n\
  cursor: pointer !important;\n\
  font-size: 12px !important;\n\
  flex: 0 0 auto !important;\n\
  display: inline-flex !important;\n\
  align-items: center !important;\n\
  justify-content: center !important;\n\
  min-height: 34px !important;\n\
  min-width: 58px !important;\n\
  -webkit-tap-highlight-color: transparent !important;\n\
}\n\
\n\
.warhub-tabs {\n\
  display: flex !important;\n\
  gap: 4px !important;\n\
  padding: 6px 8px !important;\n\
  overflow-x: auto !important;\n\
  overflow-y: hidden !important;\n\
  -webkit-overflow-scrolling: touch !important;\n\
  scrollbar-width: none !important;\n\
  flex-wrap: nowrap !important;\n\
}\n\
.warhub-tabs::-webkit-scrollbar {\n\
  display: none !important;\n\
}\n\
.warhub-tab {\n\
  appearance: none !important;\n\
  -webkit-appearance: none !important;\n\
  border: 1px solid rgba(255,255,255,.10) !important;\n\
  background: rgba(255,255,255,.06) !important;\n\
  color: #fff !important;\n\
  border-radius: 10px !important;\n\
  padding: 7px 9px !important;\n\
  min-height: 34px !important;\n\
  min-width: 78px !important;\n\
  font-size: 12px !important;\n\
  font-weight: 700 !important;\n\
  line-height: 1.1 !important;\n\
  white-space: nowrap !important;\n\
  flex: 0 0 auto !important;\n\
}\n\
.warhub-tab.active {\n\
  background: linear-gradient(180deg, rgba(220,50,50,.95), rgba(145,18,18,.98)) !important;\n\
  border-color: rgba(255,255,255,.16) !important;\n\
}\n\
.warhub-body {\n\
  flex: 1 1 auto !important;\n\
  min-height: 0 !important;\n\
  overflow-y: auto !important;\n\
  overflow-x: hidden !important;\n\
  -webkit-overflow-scrolling: touch !important;\n\
  padding: 12px !important;\n\
}\n\
\n\
.warhub-status-wrap {\n\
  margin: 0 0 10px !important;\n\
}\n\
\n\
.warhub-grid { display: grid !important; gap: 10px !important; }\n\
.warhub-card {\n\
  background: rgba(255,255,255,.04) !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  border-radius: 12px !important;\n\
  padding: 10px !important;\n\
  box-shadow: inset 0 1px 0 rgba(255,255,255,.03) !important;\n\
}\n\
.warhub-card h3,\n\
.warhub-card h4 {\n\
  margin: 0 0 8px !important;\n\
  color: #fff !important;\n\
}\n\
.warhub-muted { opacity: .72 !important; }\n\
.warhub-row {\n\
  display: flex !important;\n\
  align-items: center !important;\n\
  gap: 8px !important;\n\
  flex-wrap: wrap !important;\n\
}\n\
.warhub-col {\n\
  display: flex !important;\n\
  flex-direction: column !important;\n\
  gap: 8px !important;\n\
}\n\
.warhub-space { height: 8px !important; }\n\
.warhub-label {\n\
  font-size: 12px !important;\n\
  font-weight: 700 !important;\n\
  opacity: .85 !important;\n\
}\n\
.warhub-input,\n\
.warhub-textarea,\n\
.warhub-select {\n\
  width: 100% !important;\n\
  padding: 10px 11px !important;\n\
  border-radius: 10px !important;\n\
  border: 1px solid rgba(255,255,255,.12) !important;\n\
  background: rgba(255,255,255,.07) !important;\n\
  color: #fff !important;\n\
  outline: none !important;\n\
  font-size: 16px !important;\n\
}\n\
.warhub-textarea {\n\
  min-height: 110px !important;\n\
  resize: vertical !important;\n\
}\n\
.warhub-btn {\n\
  appearance: none !important;\n\
  -webkit-appearance: none !important;\n\
  border: 1px solid rgba(255,255,255,.12) !important;\n\
  background: linear-gradient(180deg, rgba(220,50,50,.95), rgba(145,18,18,.98)) !important;\n\
  color: #fff !important;\n\
  border-radius: 10px !important;\n\
  padding: 9px 12px !important;\n\
  min-height: 38px !important;\n\
  font-size: 13px !important;\n\
  font-weight: 800 !important;\n\
  cursor: pointer !important;\n\
  -webkit-tap-highlight-color: transparent !important;\n\
}\n\
.warhub-btn.ghost { background: rgba(255,255,255,.08) !important; }\n\
.warhub-btn.gray { background: rgba(255,255,255,.10) !important; }\n\
.warhub-btn.green { background: linear-gradient(180deg, rgba(42,168,95,.98), rgba(21,120,64,.98)) !important; }\n\
.warhub-btn.warn { background: linear-gradient(180deg, rgba(226,154,27,.98), rgba(163,102,8,.98)) !important; }\n\.warhub-btn.bounty { background: linear-gradient(180deg, rgba(220,50,50,.98), rgba(145,18,18,.98)) !important; border-color: rgba(255,255,255,.14) !important; }\n\
.warhub-pill {\n\
  display: inline-flex !important;\n\
  align-items: center !important;\n\
  justify-content: center !important;\n\
  min-height: 24px !important;\n\
  padding: 4px 8px !important;\n\
  border-radius: 999px !important;\n\
  font-size: 12px !important;\n\
  font-weight: 800 !important;\n\
  line-height: 1 !important;\n\
  border: 1px solid rgba(255,255,255,.10) !important;\n\
  background: rgba(255,255,255,.08) !important;\n\
  color: #fff !important;\n\
}\n\
.warhub-pill.good { background: rgba(36,140,82,.35) !important; }\n\
.warhub-pill.bad { background: rgba(170,32,32,.35) !important; }\n\
.warhub-pill.neutral { background: rgba(255,255,255,.08) !important; }\n\
.warhub-pill.online { background: rgba(42,168,95,.35) !important; }\n\
.warhub-pill.idle { background: rgba(197,142,32,.35) !important; }\n\
.warhub-pill.travel { background: rgba(66,124,206,.35) !important; }\n\
.warhub-pill.jail { background: rgba(120,85,160,.35) !important; }\n\
.warhub-pill.hospital { background: rgba(199,70,70,.35) !important; }\n\
.warhub-pill.offline { background: rgba(105,105,105,.35) !important; }\n\
.warhub-kv {\n\
  display: grid !important;\n\
  grid-template-columns: 1fr auto !important;\n\
  gap: 8px !important;\n\
  align-items: center !important;\n\
  padding: 8px 0 !important;\n\
  border-bottom: 1px solid rgba(255,255,255,.05) !important;\n\
}\n\
.warhub-kv:last-child { border-bottom: 0 !important; }\n\
.warhub-member-group {\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  border-radius: 12px !important;\n\
  overflow: hidden !important;\n\
  background: rgba(255,255,255,.03) !important;\n\
}\n\
.warhub-member-group-head {\n\
  display: flex !important;\n\
  align-items: center !important;\n\
  justify-content: space-between !important;\n\
  gap: 8px !important;\n\
  padding: 10px !important;\n\
  background: rgba(255,255,255,.05) !important;\n\
  cursor: pointer !important;\n\
  -webkit-tap-highlight-color: transparent !important;\n\
}\n\
.warhub-member-list {\n\
  display: flex !important;\n\
  flex-direction: column !important;\n\
}\n\
.warhub-member-row {\n\
  display: flex !important;\n\
  flex-direction: column !important;\n\
  gap: 8px !important;\n\
  padding: 10px !important;\n\
  border-top: 1px solid rgba(255,255,255,.06) !important;\n\
}\n\
.warhub-member-main {\n\
  display: flex !important;\n\
  align-items: center !important;\n\
  justify-content: space-between !important;\n\
  gap: 8px !important;\n\
  flex-wrap: wrap !important;\n\
}\n\
.warhub-member-name {\n\
  font-weight: 800 !important;\n\
  color: #fff !important;\n\
  text-decoration: none !important;\n\
}\n\
.warhub-statline {\n\
  display: flex !important;\n\
  align-items: center !important;\n\
  gap: 10px !important;\n\
  flex-wrap: wrap !important;\n\
  font-size: 12px !important;\n\
  opacity: .95 !important;\n\
}\n\
.warhub-spy-box {\n\
  width: 100% !important;\n\
  border-radius: 10px !important;\n\
  background: rgba(0,0,0,.25) !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  padding: 8px !important;\n\
  font-size: 12px !important;\n\
}\n\
.warhub-hero-card {\n\
  padding: 12px !important;\n\
  border-radius: 14px !important;\n\
  background: linear-gradient(180deg, rgba(160,18,18,.20), rgba(255,255,255,.03)) !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
}\n\
.warhub-mini-grid {\n\
  display: grid !important;\n\
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;\n\
  gap: 8px !important;\n\
}\n\
.warhub-section-scroll {\n\
  max-height: 38vh !important;\n\
  overflow: auto !important;\n\
  -webkit-overflow-scrolling: touch !important;\n\
}\n\
.warhub-overview-hero {\n\
  display: flex !important;\n\
  flex-direction: column !important;\n\
  gap: 10px !important;\n\
}\n\
.warhub-war-head {\n\
  display: grid !important;\n\
  grid-template-columns: 1fr auto 1fr !important;\n\
  gap: 10px !important;\n\
  align-items: center !important;\n\
}\n\
.warhub-war-side {\n\
  min-width: 0 !important;\n\
  border-radius: 12px !important;\n\
  background: rgba(255,255,255,.05) !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  padding: 10px !important;\n\
}\n\
.warhub-war-side.right { text-align: right !important; }\n\
.warhub-war-side-label {\n\
  font-size: 11px !important;\n\
  opacity: .72 !important;\n\
  margin-bottom: 4px !important;\n\
}\n\
.warhub-war-side-name {\n\
  font-size: 14px !important;\n\
  font-weight: 800 !important;\n\
  color: #fff !important;\n\
  line-height: 1.25 !important;\n\
  word-break: break-word !important;\n\
}\n\
.warhub-war-vs {\n\
  font-size: 12px !important;\n\
  font-weight: 900 !important;\n\
  letter-spacing: .8px !important;\n\
  opacity: .78 !important;\n\
}\n\
.warhub-overview-stats {\n\
  display: grid !important;\n\
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;\n\
  gap: 8px !important;\n\
}\n\
.warhub-stat-card {\n\
  border-radius: 12px !important;\n\
  background: rgba(255,255,255,.05) !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  padding: 10px !important;\n\
}\n\
.warhub-stat-card.good {\n\
  border-color: rgba(90,200,120,.22) !important;\n\
  background: linear-gradient(180deg, rgba(90,200,120,.10), rgba(255,255,255,.04)) !important;\n\
}\n\
.warhub-stat-card.bad {\n\
  border-color: rgba(220,90,90,.22) !important;\n\
  background: linear-gradient(180deg, rgba(220,90,90,.10), rgba(255,255,255,.04)) !important;\n\
}\n\
.warhub-stat-label {\n\
  font-size: 11px !important;\n\
  opacity: .74 !important;\n\
  margin-bottom: 5px !important;\n\
}\n\
.warhub-stat-value {\n\
  font-size: 22px !important;\n\
  line-height: 1 !important;\n\
  font-weight: 900 !important;\n\
  color: #fff !important;\n\
}\n\
.warhub-overview-link-card {\n\
  min-height: 152px !important;\n\
  display: flex !important;\n\
  flex-direction: column !important;\n\
}\n\
   .warhub-alert-grid {\n\
  display: grid !important;\n\
  grid-template-columns: 1fr 1fr !important;\n\
  gap: 8px !important;\n\
}\n\
.warhub-alert-card {\n\
  border-radius: 12px !important;\n\
  background: rgba(255,255,255,.05) !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  padding: 10px !important;\n\
}\n\
.warhub-alert-card h4 {\n\
  margin: 0 0 8px !important;\n\
  font-size: 13px !important;\n\
  color: #fff !important;\n\
}\n\
.warhub-summary-list {\n\
  display: flex !important;\n\
  flex-direction: column !important;\n\
  gap: 6px !important;\n\
}\n\
.warhub-summary-item {\n\
  display: flex !important;\n\
  justify-content: space-between !important;\n\
  align-items: center !important;\n\
  gap: 8px !important;\n\
  padding: 7px 8px !important;\n\
  border-radius: 10px !important;\n\
  background: rgba(0,0,0,.22) !important;\n\
  border: 1px solid rgba(255,255,255,.06) !important;\n\
}\n\
.warhub-summary-name {\n\
  font-weight: 800 !important;\n\
  color: #fff !important;\n\
}\n\
.warhub-summary-meta {\n\
  opacity: .78 !important;\n\
  font-size: 11px !important;\n\
}\n\
.warhub-table-wrap {\n\
  width: 100% !important;\n\
  overflow-x: auto !important;\n\
  -webkit-overflow-scrolling: touch !important;\n\
  border-radius: 12px !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
}\n\
.warhub-table {\n\
  width: 100% !important;\n\
  min-width: 860px !important;\n\
  border-collapse: collapse !important;\n\
  font-size: 12px !important;\n\
}\n\
.warhub-table th,\n\
.warhub-table td {\n\
  padding: 8px 9px !important;\n\
  border-bottom: 1px solid rgba(255,255,255,.06) !important;\n\
  text-align: left !important;\n\
  vertical-align: middle !important;\n\
}\n\
.warhub-table th {\n\
  position: sticky !important;\n\
  top: 0 !important;\n\
  background: #121212 !important;\n\
  z-index: 1 !important;\n\
  font-size: 11px !important;\n\
  letter-spacing: .2px !important;\n\
}\n\
.warhub-flag-row {\n\
  display: flex !important;\n\
  flex-wrap: wrap !important;\n\
  gap: 4px !important;\n\
}\n\
.warhub-flag {\n\
  display: inline-flex !important;\n\
  align-items: center !important;\n\
  min-height: 20px !important;\n\
  padding: 2px 7px !important;\n\
  border-radius: 999px !important;\n\
  font-size: 10px !important;\n\
  font-weight: 800 !important;\n\
  background: rgba(255,255,255,.08) !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
}\n\
.warhub-dropbox {\n\
  border-radius: 12px !important;\n\
  border: 1px solid rgba(255,255,255,.08) !important;\n\
  background: rgba(255,255,255,.04) !important;\n\
  overflow: hidden !important;\n\
}\n\
.warhub-dropbox-head {\n\
  cursor: pointer !important;\n\
  list-style: none !important;\n\
  padding: 10px !important;\n\
  font-weight: 800 !important;\n\
}\n\
.warhub-dropbox-head::-webkit-details-marker {\n\
  display: none !important;\n\
}\n\
.warhub-dropbox-body {\n\
  padding: 0 10px 10px !important;\n\
}\n\
@media (max-width: 520px) {\n\
  .warhub-alert-grid {\n\
    grid-template-columns: 1fr !important;\n\
  }\n\
}\n\
.warhub-overview-link-card .warhub-spy-box { flex: 1 1 auto !important; }\n\
.warhub-overview-link-card .warhub-row { margin-top: auto !important; }\n\
.warhub-overview-link-card.terms { border-color: rgba(255,255,255,.10) !important; }\n\
.warhub-overview-link-card.meddeals { border-color: rgba(90,200,120,.18) !important; }\n\
.warhub-overview-link-card.dibs { border-color: rgba(220,90,90,.18) !important; }\n\
@media (max-width: 520px) {\n\
  #warhub-shield {\n\
    width: 44px !important;\n\
    height: 44px !important;\n\
    font-size: 22px !important;\n\
    border-radius: 12px !important;\n\
  }\n\
  #warhub-overlay {\n\
    left: 6px !important;\n\
    right: 6px !important;\n\
    top: 6px !important;\n\
    bottom: 6px !important;\n\
    max-width: none !important;\n\
    border-radius: 12px !important;\n\
  }\n\
  .warhub-mini-grid { grid-template-columns: 1fr !important; }\n\
  .warhub-war-head { grid-template-columns: 1fr !important; }\n\
  .warhub-war-vs { text-align: center !important; }\n\
  .warhub-overview-stats { grid-template-columns: 1fr 1fr !important; }\n\
  .warhub-section-scroll { max-height: 34vh !important; }\n\
  .warhub-tabs {\n\
    min-height: 50px !important;\n\
    max-height: 50px !important;\n\
    padding: 8px 6px !important;\n\
    gap: 6px !important;\n\
  }\n\
    .warhub-tabs {\n\
    min-height: 46px !important;\n\
    max-height: 46px !important;\n\
    padding: 6px 5px !important;\n\
    gap: 4px !important;\n\
  }\n\
  .warhub-tab {\n\
    font-size: 11px !important;\n\
    padding: 7px 8px !important;\n\
    min-height: 34px !important;\n\
    min-width: 70px !important;\n\
  }\n\
  .warhub-body { padding: 10px !important; }\n\
}\n\
";

    GM_addStyle(css);
    GM_addStyle([
        '#warhub-shield { left: 10px !important; bottom: 44px !important; top: auto !important; right: auto !important; width: 118px !important; height: 28px !important; background: transparent !important; border: 0 !important; box-shadow: none !important; transform: none !important; }',
        '#warhub-shield button { width: 118px !important; height: 28px !important; border-radius: 9px !important; border: 1px solid rgba(205,164,74,.5) !important; background: linear-gradient(180deg, rgba(90,12,18,.95), rgba(35,8,10,.98)) !important; color: #f5df9d !important; font-size: 10px !important; font-weight: 800 !important; letter-spacing: .1px !important; box-shadow: 0 8px 20px rgba(0,0,0,.35) !important; padding: 0 !important; margin: 0 !important; cursor: pointer !important; }',
        '@media (max-width: 520px) { #warhub-shield { left: 10px !important; bottom: 44px !important; width: 118px !important; height: 28px !important; } #warhub-shield button { width: 118px !important; height: 28px !important; font-size: 10px !important; border-radius: 9px !important; } }'
    ].join('\n'));

    // ============================================================
    // 06. BASIC UTILITIES
    // ============================================================

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtNum(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n.toLocaleString() : '—';
    }

    function netPill(value, label) {
        var n = Number(value || 0);
        var cls = n > 0 ? 'good' : (n < 0 ? 'bad' : 'neutral');
        return '<span class="warhub-pill ' + cls + '">' + esc(label || 'Net') + ' ' + fmtNum(n) + '</span>';
    }

    function fmtMoney(v) {
        var n = Number(v);
        return Number.isFinite(n) ? '$' + n.toLocaleString() : '—';
    }

    function fmtHosp(v, txt) {
        if (txt) return txt;
        var n = Number(v);
        return Number.isFinite(n) && n > 0 ? String(n) + 's' : '—';
    }

    function fmtTs(v) {
        if (!v) return '—';
        try {
            var d = new Date(v);
            if (Number.isNaN(d.getTime())) return String(v);
            return d.toLocaleString();
        } catch (_unused) {
            return String(v);
        }
    }

    function fmtDaysLeftFromIso(v) {
        if (!v) return null;
        try {
            var ms = new Date(v).getTime() - Date.now();
            if (!Number.isFinite(ms)) return null;
            return Math.ceil(ms / 86400000);
        } catch (_unused2) {
            return null;
        }
    }


    function shouldKeepOverviewDib(item) {
        if (!item || typeof item !== 'object') return false;
        if (item.in_hospital) return true;

        var now = Date.now();
        var leftAt = item.left_hospital_at ? new Date(item.left_hospital_at).getTime() : 0;
        if (Number.isFinite(leftAt) && leftAt > 0) {
            return (now - leftAt) <= 30000;
        }

        var removeAt = Number(item.overview_remove_after_ts || 0);
        if (Number.isFinite(removeAt) && removeAt > 0) {
            return (removeAt * 1000) > now;
        }

        return false;
    }

    function arr(v) {
        return Array.isArray(v) ? v : [];
    }

    function cleanInputValue(v) {
        return String(v || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim()
            .replace(/^['"]+|['"]+$/g, '')
            .trim();
    }

    function getSideLocks() { return { members: {}, enemies: {}, war_id: '' }; }

    function saveSideLocks() { return { members: {}, enemies: {}, war_id: '' }; }

    function clearSideLocksIfWarChanged() { return { members: {}, enemies: {}, war_id: '' }; }

    function rememberMemberLocks() { return { members: {}, enemies: {}, war_id: '' }; }

    function rememberEnemyLocks() { return { members: {}, enemies: {}, war_id: '' }; }

    function formatCountdown(totalSecs) {
        totalSecs = Math.max(0, Number(totalSecs || 0) | 0);

        var h = Math.floor(totalSecs / 3600);
        var m = Math.floor((totalSecs % 3600) / 60);
        var s = totalSecs % 60;

        if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
        if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
        return s + 's';
    }

    function stopMembersCountdownLoop() {
        if (membersCountdownTimer) {
            clearInterval(membersCountdownTimer);
            membersCountdownTimer = null;
        }
    }

    function tickMembersCountdowns() {
        if (!overlay) return;
        if (currentTab !== 'members' && currentTab !== 'hospital' && currentTab !== 'enemies') return;
        if (!membersLiveStamp) return;

        var elapsed = Math.floor((Date.now() - membersLiveStamp) / 1000);
        var rows = overlay.querySelectorAll('.warhub-member-row');

        rows.forEach(function (row) {
            var medEl = row.querySelector('[data-medcd]');
            var statusEl = row.querySelector('[data-statuscd]');
            var etaEl = row.querySelector('[data-hospital-eta]');

            if (medEl) {
                var baseMed = Number(row.getAttribute('data-medcd-base') || 0);
                var liveMed = Math.max(0, baseMed - elapsed);
                medEl.textContent = liveMed > 0 ? formatCountdown(liveMed) : 'Ready';
            }

            var baseStatus = Number(row.getAttribute('data-statuscd-base') || 0);
            var stateName = String(row.getAttribute('data-state-name') || '').toLowerCase();
            var liveStatus = Math.max(0, baseStatus - elapsed);

            if (statusEl) {
                if (stateName === 'hospital') {
                    statusEl.textContent = liveStatus > 0 ? 'Hospital (' + formatCountdown(liveStatus) + ')' : 'Hospital';
                } else if (stateName === 'jail') {
                    statusEl.textContent = liveStatus > 0 ? 'Jail (' + formatCountdown(liveStatus) + ')' : 'Jail';
                } else if (stateName === 'travel') {
                    statusEl.textContent = liveStatus > 0 ? 'Travel (' + formatCountdown(liveStatus) + ')' : 'Travel';
                } else if (stateName === 'idle') {
                    statusEl.textContent = 'Idle';
                } else if (stateName === 'online') {
                    statusEl.textContent = 'Online';
                } else {
                    statusEl.textContent = 'Offline';
                }
            }

            if (etaEl) {
                etaEl.textContent = liveStatus > 0 ? formatCountdown(liveStatus) : 'Out now';
            }
        });
    }

    function startMembersCountdownLoop() {
        stopMembersCountdownLoop();
        if (currentTab !== 'members' && currentTab !== 'hospital' && currentTab !== 'enemies') return;

        membersCountdownTimer = setInterval(function () {
            tickMembersCountdowns();
        }, 1000);
    }

    // ============================================================
    // 07. LOCAL NOTIFICATIONS / STATUS
    // ============================================================

    function getLocalNotifications() {
        return arr(GM_getValue(K_LOCAL_NOTIFICATIONS, []));
    }

    function setLocalNotifications(v) {
        GM_setValue(K_LOCAL_NOTIFICATIONS, arr(v));
    }

    function pushLocalNotification(kind, text) {
        var items = getLocalNotifications();
        items.unshift({
            id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 8),
            kind: String(kind || 'info'),
            text: String(text || ''),
            created_at: new Date().toISOString()
        });
        if (items.length > 50) items = items.slice(0, 50);
        setLocalNotifications(items);
        updateBadge();
    }

    function setStatus(msg, isErr) {
        lastStatusMsg = String(msg || '');
        lastStatusErr = !!isErr;
        renderStatus();
    }

    function renderStatus() {
        if (!overlay) return;
        var box = overlay.querySelector('#warhub-status');
        if (!box) return;

        if (!lastStatusMsg) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }

        box.style.display = 'block';
        box.innerHTML = '<div class="warhub-pill ' + (lastStatusErr ? 'bad' : 'good') + '">' + esc(lastStatusMsg) + '</div>';
    }

    function updateBadge() {
        if (!badge) return;
        var count = getLocalNotifications().filter(function (x) { return !x.seen; }).length;

        if (!count) {
            badge.style.display = 'none';
            badge.textContent = '';
            return;
        }

        badge.style.display = 'block';
        badge.textContent = count > 99 ? '99+' : String(count);
        positionBadge();
    }

    // ============================================================
    // 08. ASYNC / REQUEST HELPERS
    // ============================================================

    function _asyncToGenerator(fn) {
        return function () {
            var self = this;
            var args = arguments;

            return new Promise(function (resolve, reject) {
                var gen = fn.apply(self, args);

                function step(key, arg) {
                    var info;
                    try {
                        info = gen[key](arg);
                    } catch (error) {
                        reject(error);
                        return;
                    }

                    var value = info.value;
                    if (info.done) {
                        resolve(value);
                    } else {
                        Promise.resolve(value).then(function (val) {
                            step('next', val);
                        }, function (err) {
                            step('throw', err);
                        });
                    }
                }

                step('next');
            });
        };
    }

    function req(method, path, body, extraHeaders) {
        return new Promise(function (resolve) {
            var headers = Object.assign({
                'Content-Type': 'application/json'
            }, extraHeaders || {});

            GM_xmlhttpRequest({
                method: method || 'GET',
                url: BASE_URL + path,
                headers: headers,
                data: body ? JSON.stringify(body) : undefined,
                timeout: 30000,
                onload: function (res) {
                    var json = null;
                    try {
                        json = JSON.parse(res.responseText || '{}');
                    } catch (_unused3) {
                        json = null;
                    }

                    resolve({
                        ok: res.status >= 200 && res.status < 300,
                        status: res.status,
                        json: json,
                        text: res.responseText || ''
                    });
                },
                onerror: function () {
                    resolve({ ok: false, status: 0, json: null, text: '' });
                },
                ontimeout: function () {
                    resolve({ ok: false, status: 0, json: null, text: '' });
                }
            });
        });
    }

    function getSessionToken() {
        return cleanInputValue(GM_getValue(K_SESSION, ''));
    }

    function getApiKey() {
        return cleanInputValue(GM_getValue(K_API_KEY, ''));
    }

    function getAdminKey() {
        return cleanInputValue(GM_getValue(K_ADMIN_KEY, ''));
    }

    function getOwnerToken() {
        return cleanInputValue(GM_getValue(K_OWNER_TOKEN, ''));
    }

    function isLoggedIn() {
        return !!getSessionToken();
    }

    function authedReq(method, path, body, extraHeaders) {
        var token = getSessionToken();
        var headers = Object.assign({}, extraHeaders || {});
        if (token) headers['X-Session-Token'] = token;
        return req(method, path, body, headers);
    }

    function adminReq(method, path, body, extraHeaders) {
        var headers = Object.assign({}, extraHeaders || {});
        var token = getOwnerToken() || getAdminKey();
        if (token) headers['X-License-Admin'] = token;
        return authedReq(method, path, body, headers);
    }

    // ============================================================
    // 09. ACCESS / ROLE HELPERS
    // ============================================================

    function normalizeAccessCache(v) { if (!v || typeof v !== 'object') { return { status: 'logged_out', message: 'Not logged in.', can_use_features: false, is_faction_leader: false, is_admin: false, member_enabled: false, blocked: false }; } return { status: String(v.status || 'unknown'), message: String(v.message || ''), can_use_features: !!v.can_use_features, is_faction_leader: !!v.is_faction_leader, is_admin: !!v.is_admin, member_enabled: !!v.member_enabled, blocked: !!v.blocked }; } function setAccessCache(v) {
        accessState = normalizeAccessCache(v);
        GM_setValue(K_ACCESS_CACHE, accessState);
    }

    function viewerUserId() {
        return String(
            (state && state.viewer && state.viewer.user_id) ||
            (state && state.me && state.me.user_id) ||
            ''
        );
    }

    function viewerName() {
        return String(
            (state && state.viewer && state.viewer.name) ||
            (state && state.me && state.me.name) ||
            ''
        );
    }

    function isOwnerSession() {
        var uid = viewerUserId();
        var name = viewerName().toLowerCase();
        if (uid && uid === String(OWNER_USER_ID)) return true;
        if (name && name === String(OWNER_NAME).toLowerCase()) return true;
        return !!getOwnerToken();
    }

    function canManageFaction() {
        var a = normalizeAccessCache((state && state.access) || accessState);
        return !!(a.is_faction_leader || a.is_admin || isOwnerSession());
    }

    function canSeeSummary() {
        return canManageFaction();
    }

    function canSeeAdmin() {
        return !!(isOwnerSession() || ((state && state.access && state.access.is_admin) ? true : false));
    }

    function canUseFeatures() {
        var a = normalizeAccessCache((state && state.access) || accessState);
        return !!(a.can_use_features || a.is_admin || isOwnerSession());
    }

    function shouldShowTab(key) {
        if (key === 'admin') return canSeeAdmin();
        if (key === 'faction') return false;
        if (key === 'summary') return false;
        return true;
    }

    function getVisibleTabs(rows) {
        return rows.filter(function (pair) {
            return shouldShowTab(pair[0]);
        });
    }

    // ============================================================
    // 10. POSITION / DRAG HELPERS
    // ============================================================

    function getViewport() {
        var de = document.documentElement || {};
        return {
            w: Math.max(de.clientWidth || 0, window.innerWidth || 0, 320),
            h: Math.max(de.clientHeight || 0, window.innerHeight || 0, 320)
        };
    }

    function clamp(n, min, max) {
        n = Number(n || 0);
        if (!isFinite(n)) n = 0;
        return Math.max(min, Math.min(max, n));
    }

    function loadPos(key, fallback) {
        var raw = GM_getValue(key, null);

        if (!raw) return { left: fallback.left, top: fallback.top };

        if (typeof raw === 'string') {
            try {
                raw = JSON.parse(raw);
            } catch (_unused4) {
                return { left: fallback.left, top: fallback.top };
            }
        }

        if (!raw || typeof raw !== 'object') {
            return { left: fallback.left, top: fallback.top };
        }

        return {
            left: isFinite(Number(raw.left)) ? Number(raw.left) : fallback.left,
            top: isFinite(Number(raw.top)) ? Number(raw.top) : fallback.top
        };
    }

    function savePos(key, pos) {
        GM_setValue(key, {
            left: Math.round(Number(pos.left || 0)),
            top: Math.round(Number(pos.top || 0))
        });
    }


function getOrCreateOwnHeaderSlot() {
    return null;
}

function mountShieldIntoHeader() {
    return false;
}

function applyShieldPos() {
    if (!shield) return;

    shield.classList.remove('warhub-header-mounted');
    if (document.body && shield.parentNode !== document.body) document.body.appendChild(shield);

    var leftPx = 10;
    var bottomPx = 44;
    var sinner = document.getElementById('si-pda-launcher');
    if (sinner && typeof sinner.getBoundingClientRect === 'function') {
        var rect = sinner.getBoundingClientRect();
        if (rect && isFinite(rect.top) && rect.top > 0) {
            leftPx = Math.max(10, Math.round(rect.left || 10));
            bottomPx = Math.max(44, Math.round(window.innerHeight - rect.top + 6));
        }
    }

    shield.style.left = leftPx + 'px';
    shield.style.bottom = bottomPx + 'px';
    shield.style.top = 'auto';
    shield.style.right = 'auto';
    shield.style.transform = 'none';
    shield.style.zIndex = '2147483647';

    positionBadge();
}

    function applyOverlayPos() {
        if (!overlay) return;

        var vp = getViewport();
        var width = Math.min(520, vp.w - 12);
        var left = Math.max(6, Math.round((vp.w - width) / 2));

        overlay.style.left = left + 'px';
        overlay.style.right = 'auto';
        overlay.style.top = '60px';
        overlay.style.bottom = '6px';
        overlay.style.width = width + 'px';
        overlay.style.maxWidth = '520px';
    }

    function positionBadge() {
        if (!badge || !shield) return;

        var rect = shield.getBoundingClientRect();
        badge.classList.remove('warhub-header-badge');
        if (document.body && badge.parentNode !== document.body) document.body.appendChild(badge);
        badge.style.left = Math.round(rect.right - 6) + 'px';
        badge.style.top = Math.round(rect.top - 6) + 'px';
        badge.style.right = 'auto';
    }

function makeHoldDraggable(handle, target, key) {
    if (!handle || !target) {
        return {
            didMove: function () { return false; },
            isDragging: function () { return false; }
        };
    }

    var dragging = false;
    var moved = false;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var pointerId = null;
    var DRAG_THRESHOLD = 6;

    function viewportClamp(left, top) {
        var vp = getViewport();
        return {
            left: Math.min(Math.max(8, Math.round(left)), Math.max(8, vp.w - 44)),
            top: Math.min(Math.max(8, Math.round(top)), Math.max(8, vp.h - 44))
        };
    }

    function getPoint(ev) {
        if (ev.touches && ev.touches.length) return ev.touches[0];
        if (ev.changedTouches && ev.changedTouches.length) return ev.changedTouches[0];
        return ev;
    }

    function onDown(ev) {
        var pt = getPoint(ev);
        dragging = true;
        moved = false;
        pointerId = pt && pt.identifier != null ? pt.identifier : 'mouse';
        startX = Number(pt.clientX || 0);
        startY = Number(pt.clientY || 0);
        var rect = target.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
    }

    function onMove(ev) {
        if (!dragging) return;
        var pt = getPoint(ev);
        var dx = Number(pt.clientX || 0) - startX;
        var dy = Number(pt.clientY || 0) - startY;
        if (!moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) moved = true;
        if (!moved) return;
        var pos = viewportClamp(startLeft + dx, startTop + dy);
        target.style.left = pos.left + 'px';
        target.style.top = pos.top + 'px';
        target.style.right = 'auto';
        target.style.bottom = 'auto';
        target.style.transform = 'none';
        positionBadge();
        if (ev.cancelable) ev.preventDefault();
    }

    function onUp(ev) {
        if (!dragging) return;
        dragging = false;
        var rect = target.getBoundingClientRect();
        var pos = viewportClamp(rect.left, rect.top);
        target.style.left = pos.left + 'px';
        target.style.top = pos.top + 'px';
        savePos(key, pos);
        positionBadge();
        if (!moved) setOverlayOpen(!isOpen);
        if (ev && ev.cancelable) ev.preventDefault();
    }

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp, { passive: false });
    window.addEventListener('touchend', onUp, { passive: false });
    handle.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

    return {
        didMove: function () { return moved; },
        isDragging: function () { return dragging; }
    };
}

    // ============================================================
    // 11. AUTH / LOGIN
    // ============================================================

    function doLogin() {
        return _doLogin.apply(this, arguments);
    }

    function _doLogin() {
        _doLogin = _asyncToGenerator(function* () {
            var input = overlay && overlay.querySelector('#warhub-api-key');
            var ownerInput = overlay && overlay.querySelector('#warhub-owner-token');
            var ffInput = overlay && overlay.querySelector('#warhub-ff-key');
            var key = cleanInputValue(input && input.value);
            var ownerToken = cleanInputValue(ownerInput && ownerInput.value);
            var ffKey = cleanInputValue(ffInput && ffInput.value);
            var storedKey = cleanInputValue(getApiKey());
            var maskedOnly = /^\*+$/.test(String(key || ''));

            if ((!key || maskedOnly) && storedKey) {
                key = storedKey;
            }

            if (!key) {
                setStatus('Enter your Torn API key.', true);
                return;
            }

            GM_setValue(K_API_KEY, key);
            if (ownerToken) GM_setValue(K_OWNER_TOKEN, ownerToken);
            if (ffKey || ffInput) GM_setValue(K_FF_SCOUTER_KEY, ffKey);

            setStatus('Logging in...', false);

            var res = yield req('POST', '/api/auth', {
                api_key: key
            });

            if (!res.ok || !res.json || !res.json.token) {
                setStatus((res.json && res.json.error) || 'Login failed.', true);
                return;
            }

            GM_setValue(K_SESSION, String(res.json.token));

            if (res.json.state && typeof res.json.state === 'object') {
                state = res.json.state;
                if (!state.viewer && res.json.viewer) state.viewer = res.json.viewer;
                if (!state.user && res.json.user) state.user = res.json.user;
                if (!state.access && res.json.access) state.access = res.json.access;
                try { setAccessCache(state.access || {}); } catch (_e0) {}
            } else if (res.json.viewer || res.json.user || res.json.access) {
                state = state || {};
                if (res.json.viewer) state.viewer = res.json.viewer;
                if (res.json.user) state.user = res.json.user;
                if (res.json.access) {
                    state.access = res.json.access;
                    try { setAccessCache(res.json.access || {}); } catch (_e00) {}
                }
            }

            if (res.json.viewer && res.json.viewer.name) {
                pushLocalNotification('info', 'Logged in as ' + res.json.viewer.name);
            } else {
                pushLocalNotification('info', 'Logged in.');
            }

            try {
                yield loadState();
                renderBody();
                restartPolling();
            } catch (refreshErr) {
                try { renderBody(); } catch (_e) {}
                try { restartPolling(); } catch (_e2) {}
            }
            setStatus('Logged in successfully.', false);
        });

        return _doLogin.apply(this, arguments);
    }

    function doLogout() {
        GM_deleteValue(K_SESSION);
        state = null;
        currentFactionMembers = [];
        factionMembersCache = null;
        liveSummaryCache = null;
        liveSummaryError = '';
        warEnemiesCache = [];
        warEnemiesFactionName = '';
        warEnemiesFactionId = '';
        membersLiveStamp = 0;

        setAccessCache({
            status: 'logged_out',
            message: 'Logged out.',
            can_use_features: false
        });

        stopMembersCountdownLoop();
        setStatus('Logged out.', false);
        renderBody();
        updateBadge();
    }

    // ============================================================
    // 12. DATA LOADERS
    // ============================================================

    function loadState() {
    return _loadState.apply(this, arguments);
}


function _loadState() {
    _loadState = _asyncToGenerator(function* () {
        if (!isLoggedIn()) {
            state = null;
            currentFactionMembers = [];
            factionMembersCache = [];
            warEnemiesCache = [];
            warEnemiesFactionId = '';
            warEnemiesFactionName = '';
            renderBody();
            return null;
        }

        var res = yield authedReq('GET', '/api/state');
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                GM_deleteValue(K_SESSION);
                state = null;
                currentFactionMembers = [];
                factionMembersCache = [];
                warEnemiesCache = [];
                warEnemiesFactionId = '';
                warEnemiesFactionName = '';
                setAccessCache({
                    status: 'unauthorized',
                    message: 'Session expired. Please log in again.',
                    can_use_features: false
                });
                renderBody();
            }
            return null;
        }

        state = (res.json && typeof res.json === 'object') ? res.json : {};
        setAccessCache(state.access || {});

        if (!state.war || typeof state.war !== 'object') state.war = {};
        if (!state.faction || typeof state.faction !== 'object') state.faction = {};
        if (!Array.isArray(state.targets)) state.targets = [];
        state.targets = mergeTargets(state.targets, getLocalTargets());
        if (!state.hospital || typeof state.hospital !== 'object') state.hospital = { items: [] };

        warEnemiesFactionId = String(state.war.enemy_faction_id || '');
        warEnemiesFactionName = String(state.war.enemy_faction_name || '');

        currentFactionMembers = arr(factionMembersCache).slice();

        return state;
    });

    return _loadState.apply(this, arguments);
}
    
function loadFactionMembers(force) {
    return _loadFactionMembers.apply(this, arguments);
}


function _loadFactionMembers() {
    _loadFactionMembers = _asyncToGenerator(function* (force) {
        if (!isLoggedIn()) return [];

        if (!force && Array.isArray(factionMembersCache) && factionMembersCache.length) {
            return factionMembersCache.slice();
        }

        var res = yield authedReq('GET', '/api/faction/members');

        if (!res.ok || !res.json || typeof res.json !== 'object') {
            factionMembersCache = [];
            currentFactionMembers = [];
            membersLiveStamp = 0;
            return [];
        }

        var payload = res.json || {};
        var members = arr(payload.items || payload.members || []);
        var meId = String(
            (state && state.viewer && state.viewer.user_id)
            || (state && state.me && state.me.user_id)
            || (payload && payload.viewer_user_id)
            || ''
        ).trim();

        if (meId) {
            members = members.map(function (member) {
                var row = member && typeof member === 'object' ? Object.assign({}, member) : {};
                var rowId = String((row && (row.user_id || row.id || row.player_id)) || '').trim();
                if (rowId && rowId === meId) {
                    row.online_state = 'online';
                    row.status = 'Online';
                    row.status_detail = '';
                    row.last_action = 'Online';
                }
                return row;
            });
        }

        state = state || {};
        state.faction = Object.assign({}, state.faction || {}, {
            faction_id: payload.faction_id || '',
            faction_name: payload.faction_name || '',
            name: payload.faction_name || ''
        });

        factionMembersCache = members.slice();
        currentFactionMembers = members.slice();
        membersLiveStamp = Date.now();
        state.faction.members = members.slice();

        return factionMembersCache.slice();
    });

    return _loadFactionMembers.apply(this, arguments);
}

    function loadWarData(force) {
        return _loadWarData.apply(this, arguments);
    }

    function _loadWarData() {
        _loadWarData = _asyncToGenerator(function* (force) {
            if (!isLoggedIn()) return null;

            if (!force && state && state.war && (Date.now() - warEnemiesLoadedAt) < 15000) {
                return state.war;
            }

            var res = yield authedReq('GET', '/api/war');
            if (!res.ok || !res.json) return (state && state.war) || null;

            state = state || {};
            state.war = res.json.war || res.json || null;

            if (state.war) {
                warEnemiesFactionId = String(state.war.enemy_faction_id || '');
                warEnemiesFactionName = String(state.war.enemy_faction_name || '');
            }

            return state.war;
        });

        return _loadWarData.apply(this, arguments);
    }

function loadEnemies(force) {
    return _loadEnemies.apply(this, arguments);
}

function loadHospital(force) {
    return _loadHospital.apply(this, arguments);
}

function _loadHospital() {
    _loadHospital = _asyncToGenerator(function* (force) {
        if (!isLoggedIn()) return [];

        if (!force && state && state.hospital && Array.isArray(state.hospital.items) && state.hospital.items.length && (Date.now() - warEnemiesLoadedAt) < 15000) {
            return state.hospital.items;
        }

        var res = yield authedReq('GET', '/api/hospital');
        if (!res.ok || !res.json) return (state && state.hospital && state.hospital.items) || [];

        state = state || {};
        state.hospital = res.json || { items: [] };

        var war = (res.json && res.json.war && typeof res.json.war === 'object') ? res.json.war : {};
        if (war.enemy_faction_id || war.enemy_faction_name) {
            state.war = Object.assign({}, state.war || {}, war, {
                enemy_faction_id: war.enemy_faction_id || (state.war && state.war.enemy_faction_id) || '',
                enemy_faction_name: war.enemy_faction_name || (state.war && state.war.enemy_faction_name) || ''
            });
            warEnemiesFactionId = String(state.war.enemy_faction_id || '');
            warEnemiesFactionName = String(state.war.enemy_faction_name || '');
        }

        return arr(state.hospital.items);
    });

    return _loadHospital.apply(this, arguments);
}


function _loadEnemies() {
    _loadEnemies = _asyncToGenerator(function* (force) {
        if (!isLoggedIn()) return [];

        if (!force && warEnemiesCache && warEnemiesCache.length && (Date.now() - warEnemiesLoadedAt) < 15000) {
            return warEnemiesCache;
        }

        var res = yield authedReq('GET', '/api/enemies');
        if (!res.ok || !res.json) return warEnemiesCache || [];

        var payload = res.json || {};
        var war = (payload.war && typeof payload.war === 'object') ? payload.war : {};

        var enemies = arr(payload.items || []);
        warEnemiesCache = enemies.slice();
        warEnemiesFactionId = String(payload.faction_id || war.enemy_faction_id || '');
        warEnemiesFactionName = String(payload.faction_name || war.enemy_faction_name || '');
        warEnemiesLoadedAt = Date.now();

        state = state || {};
        state.enemies = enemies.slice();
        state.war = Object.assign({}, state.war || {}, war, {
            enemy_faction_id: warEnemiesFactionId,
            enemy_faction_name: warEnemiesFactionName
        });

        queueEnemyFfPredictions(enemies);

        return enemies.slice();
    });

    return _loadEnemies.apply(this, arguments);
}
    function loadLiveSummary(force) {
        return _loadLiveSummary.apply(this, arguments);
    }

    function _loadLiveSummary() {
        _loadLiveSummary = _asyncToGenerator(function* (force) {
            if (!isLoggedIn()) return null;
            if (!canSeeSummary()) return null;
            if (liveSummaryLoading) return liveSummaryCache;
            if (!force && liveSummaryCache && (Date.now() - liveSummaryLastAt) < 15000) return liveSummaryCache;

            liveSummaryLoading = true;
            liveSummaryError = '';

            try {
                var res = yield authedReq('GET', '/api/live-summary');
                if (!res.ok || !res.json) {
                    liveSummaryError = (res.json && res.json.error) || 'Unable to load live summary.';
                    return liveSummaryCache;
                }

                liveSummaryCache = res.json;
                liveSummaryLastAt = Date.now();
                return liveSummaryCache;
            } finally {
                liveSummaryLoading = false;
            }
        });

        return _loadLiveSummary.apply(this, arguments);
    }
    function loadAdminDashboard(force) {
        return _loadAdminDashboard.apply(this, arguments);
    }

    function _loadAdminDashboard() {
        _loadAdminDashboard = _asyncToGenerator(function* (force) {
            if (!canSeeAdmin()) return null;

            if (!force && analyticsCache) return analyticsCache;

            var res = yield adminReq('GET', '/api/admin/dashboard');
            if (!res.ok || !res.json) return analyticsCache;

            analyticsCache = res.json;
            if (analyticsCache.summary && typeof analyticsCache.summary === 'object') {
                Object.keys(analyticsCache.summary).forEach(function (key) {
                    if (analyticsCache[key] == null) analyticsCache[key] = analyticsCache.summary[key];
                });
            }
            if (!analyticsCache.faction_licenses && Array.isArray(analyticsCache.items)) {
                analyticsCache.faction_licenses = analyticsCache.items.slice();
            }
            return analyticsCache;
        });

        return _loadAdminDashboard.apply(this, arguments);
    }

    function loadAdminTopFive(force) {
        return _loadAdminTopFive.apply(this, arguments);
    }

    function _loadAdminTopFive() {
        _loadAdminTopFive = _asyncToGenerator(function* (force) {
            if (!canSeeAdmin()) return null;

            if (!force && adminTopFiveCache) return adminTopFiveCache;

            var res = yield adminReq('GET', '/api/admin/top-five');
            if (!res.ok || !res.json) return adminTopFiveCache;

            adminTopFiveCache = res.json;
            return adminTopFiveCache;
        });

        return _loadAdminTopFive.apply(this, arguments);
    }

        function loadOverviewLive() {
        return _loadOverviewLive.apply(this, arguments);
    }

    function _loadOverviewLive() {
        _loadOverviewLive = _asyncToGenerator(function* () {
            if (!isLoggedIn()) return null;

            var res = yield authedReq('GET', '/api/overview/live');
            if (!res.ok || !res.json || !res.json.overview) {
                return yield loadState();
            }

            state = state || {};
            state.war = Object.assign({}, state.war || {}, res.json.overview || {});
            state.faction = Object.assign({}, state.faction || {}, {
                faction_id: (res.json.overview && res.json.overview.faction_id) || '',
                faction_name: (res.json.overview && res.json.overview.faction_name) || '',
                name: (res.json.overview && res.json.overview.faction_name) || ''
            });

            return res.json.overview;
        });

        return _loadOverviewLive.apply(this, arguments);
    }

            function refreshOverviewLive() {
        return _refreshOverviewLive.apply(this, arguments);
    }

    function _refreshOverviewLive() {
        _refreshOverviewLive = _asyncToGenerator(function* () {
            yield loadOverviewLive();
        });

        return _refreshOverviewLive.apply(this, arguments);
    }

    function refreshMembersLive() {
        return _refreshMembersLive.apply(this, arguments);
    }

    function _refreshMembersLive() {
        _refreshMembersLive = _asyncToGenerator(function* () {
            yield loadFactionMembers(true);
            membersLiveStamp = Date.now();
        });

        return _refreshMembersLive.apply(this, arguments);
    }

    function refreshEnemiesLive() {
    return _refreshEnemiesLive.apply(this, arguments);
}

function _refreshEnemiesLive() {
    _refreshEnemiesLive = _asyncToGenerator(function* () {
        yield loadWarData(true);
        yield loadEnemies(true);
    });

    return _refreshEnemiesLive.apply(this, arguments);
}

    function refreshHospitalLive() {
        return _refreshHospitalLive.apply(this, arguments);
    }

    function _refreshHospitalLive() {
        _refreshHospitalLive = _asyncToGenerator(function* () {
            yield loadWarData(true);
            yield loadEnemies(true);
            if (typeof loadHospital === 'function') {
                yield loadHospital(true);
            }
        });

        return _refreshHospitalLive.apply(this, arguments);
    }

    function refreshSummaryLive() {
        return _refreshSummaryLive.apply(this, arguments);
    }

    function _refreshSummaryLive() {
        _refreshSummaryLive = _asyncToGenerator(function* () {
            yield loadLiveSummary(true);
        });

        return _refreshSummaryLive.apply(this, arguments);
    }

    // ============================================================
    // 13. TAB / POLLING FLOW
    // ============================================================

    function tabNeedsLivePolling(tab) {
        return tab === 'overview'
            || tab === 'members'
            || tab === 'enemies'
            || tab === 'hospital'
            || tab === 'chain'
            || tab === 'faction';
    }

    function getTabPollMs(tab) {
        if (tab === 'hospital') return 6000;
        if (tab === 'enemies') return 7000;
        if (tab === 'members') return 10000;
        if (tab === 'chain') return 10000;
        if (tab === 'overview') return 12000;
        if (tab === 'summary') return 12000;
        if (tab === 'faction') return 30000;
        if (tab === 'admin') return 30000;
        return 0;
    }

    function restartPolling() {
        restartPollingForCurrentTab();
    }

    function tickCurrentTab() {
        return _tickCurrentTab.apply(this, arguments);
    }

    function _tickCurrentTab() {
        _tickCurrentTab = _asyncToGenerator(function* () {
            if (loadInFlight) return;
            if (!isLoggedIn()) return;
            if (!tabNeedsLivePolling(currentTab)) return;

            loadInFlight = true;
            try {
                if (currentTab === 'overview') {
                    yield refreshOverviewLive();
                    renderLiveTabOnly();
                    return;
                }

                if (currentTab === 'members') {
                    yield refreshMembersLive();
                    renderLiveTabOnly();
                    return;
                }

                if (currentTab === 'chain') {
                    yield refreshMembersLive();
                    renderLiveTabOnly();
                    return;
                }

                if (currentTab === 'enemies') {
                    yield refreshEnemiesLive();
                    renderLiveTabOnly();
                    return;
}

                if (currentTab === 'hospital') {
                    yield refreshHospitalLive();
                    renderLiveTabOnly();
                    return;
                }

                if (currentTab === 'faction') {
                    currentTab = 'overview';
                    GM_setValue(K_TAB, currentTab);
                    yield refreshOverviewLive();
                    renderLiveTabOnly();
                    return;
                }
            } catch (err) {
            } finally {
                loadInFlight = false;
            }
        });

        return _tickCurrentTab.apply(this, arguments);
    }

    function handleTabClick(tab) {
    return _handleTabClick.apply(this, arguments);
}

function _handleTabClick() {
    _handleTabClick = _asyncToGenerator(function* (tab) {
        currentTab = String(tab || 'overview');
        GM_setValue(K_TAB, currentTab);

        state = state || {};
        if (currentTab === 'targets' && !Array.isArray(state.targets)) state.targets = [];
        renderBody();
        restartPollingForCurrentTab();

        if (loadInFlight) return;

        loadInFlight = true;
        try {
            if (currentTab === 'members') {
                yield loadFactionMembers(true);
                membersLiveStamp = Date.now();
            } else if (currentTab === 'chain') {
                yield loadFactionMembers(true);
                membersLiveStamp = Date.now();
            } else if (currentTab === 'enemies') {
                yield loadWarData(true);
                yield loadEnemies(true);
            } else if (currentTab === 'hospital') {
                yield loadWarData(true);
                yield loadEnemies(true);
                if (typeof loadHospital === 'function') {
                    yield loadHospital(true);
                }
            } else if (currentTab === 'targets') {
                yield loadWarData(true);
                yield loadEnemies(true);
                state = state || {};
                if (!Array.isArray(state.targets)) state.targets = [];
            } else if (currentTab === 'admin') {
                if (canSeeAdmin()) {
                    yield loadAdminDashboard(true);
                    yield loadAdminTopFive(true);
                }
            } else if (currentTab === 'overview') {
                yield refreshOverviewLive();
            }
        } catch (err) {
        } finally {
            loadInFlight = false;
        }

        renderBody();
        restartPollingForCurrentTab();
    });

    return _handleTabClick.apply(this, arguments);
}
    // ============================================================
    // 14. VISIBILITY / OPEN STATE
    // ============================================================

    function isOverlayOpen() {
        return !!(overlay && overlay.classList.contains('open'));
    }

    function shouldRunLivePolling() {
        if (!isLoggedIn()) return false;
        if (!tabNeedsLivePolling(currentTab)) return false;
        if (document.hidden) return false;
        if (!isOverlayOpen()) return false;
        return true;
    }

    function restartPollingForCurrentTab() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }

        if (!shouldRunLivePolling()) return;

        var refreshMs = getTabPollMs(currentTab);
        if (!Number.isFinite(refreshMs) || refreshMs < 5000) refreshMs = 5000;

        pollTimer = setInterval(function () {
            if (!shouldRunLivePolling()) {
                if (pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
                return;
            }
            tickCurrentTab();
        }, refreshMs);
    }

    function bindVisibilityPolling() {
        document.addEventListener('visibilitychange', function () {
            restartPollingForCurrentTab();
        });
    }
    // ============================================================
    // 14. OVERLAY MOUNT / DOM
    // ============================================================

    function bindTap(el, handler) {
        if (!el) return;

        el.addEventListener('touchend', function (e) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            handler(e);
        }, { passive: false });
    }

    function mount() {
        if (mounted) return;

        shield = null;
        badge = null;

        overlay = document.createElement('div');
        overlay.id = 'warhub-overlay';
        overlay.innerHTML = [
            '<div class="warhub-head" id="warhub-head">',
                '<div class="warhub-toprow">',
                    '<div>',
                        '<div class="warhub-title">War and Chain ⚔️</div>',
                        '<div class="warhub-sub">Faction tools, access, and war support</div>',
                    '</div>',
                    '<button class="warhub-close" id="warhub-close" type="button">Close</button>',
                '</div>',
            '</div>',
            '<div class="warhub-tabs" id="warhub-tabs-row-1"></div>',
            '<div class="warhub-tabs" id="warhub-tabs-row-2"></div>',
            '<div class="warhub-body" id="warhub-body">',
                '<div class="warhub-status-wrap"><div id="warhub-status" style="display:none;"></div></div>',
                '<div id="warhub-content"></div>',
            '</div>'
        ].join('');

        document.body.appendChild(overlay);

        applyOverlayPos();
        updateBadge();

        function shieldTapBlocked() {
            return false;
        }

        bindTap(overlay.querySelector('#warhub-close'), function () {
            setOverlayOpen(false);
        });

        overlay.addEventListener('touchend', function (e) {
            var tabBtn = e.target.closest('[data-tab]');
            if (tabBtn) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                handleTabClick(tabBtn.getAttribute('data-tab'));
                return;
            }

            var act = e.target.closest('[data-action]');
            if (act) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                handleActionClick(act);
                return;
            }

            var groupHead = e.target.closest('[data-group-toggle]');
            if (groupHead) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                var key = groupHead.getAttribute('data-group-toggle');
                toggleGroup(key);
                return;
            }
        }, { passive: false });

        overlay.addEventListener('change', function (e) {
            var t = e.target;

            if (t && t.id === 'warhub-api-key') {
                GM_setValue(K_API_KEY, cleanInputValue(t.value));
            }
            if (t && t.id === 'warhub-owner-token') {
                GM_setValue(K_OWNER_TOKEN, cleanInputValue(t.value));
            }
            if (t && t.id === 'warhub-ff-key') {
                GM_setValue(K_FF_SCOUTER_KEY, cleanInputValue(t.value));
            }
            if (t && t.id === 'warhub-ff-key') {
                GM_setValue(K_FF_SCOUTER_KEY, cleanInputValue(t.value));
            }
        });

        overlay.addEventListener('input', function (e) {
            var t = e.target;

            if (t && t.id === 'warhub-api-key') {
                GM_setValue(K_API_KEY, cleanInputValue(t.value));
            }
            if (t && t.id === 'warhub-owner-token') {
                GM_setValue(K_OWNER_TOKEN, cleanInputValue(t.value));
            }
            if (t && t.id === 'warhub-ff-key') {
                GM_setValue(K_FF_SCOUTER_KEY, cleanInputValue(t.value));
            }
        });

        window.addEventListener('resize', function () {
            applyShieldPos();
            applyOverlayPos();
            positionBadge();
        });

        mounted = true;
        bindVisibilityPolling();
        setOverlayOpen(isOpen);
        renderBody();
    }

        function setOverlayOpen(open) {
        isOpen = !!open;
        GM_setValue(K_OPEN, isOpen);

        if (!overlay) return;

        overlay.classList.toggle('open', isOpen);

        if (isOpen) {
            applyOverlayPos();
            positionBadge();
            renderBody();
            restartPollingForCurrentTab();
        } else {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        }
    }
    function toggleOverlay() {
        setOverlayOpen(!isOpen);
    }
        // ============================================================
    // 15. GROUP COLLAPSE STATE
    // ============================================================

    function isGroupOpen(key, defaultOpen) {
        var raw = GM_getValue('warhub_group_' + String(key), null);
        if (raw === null || raw === undefined) return !!defaultOpen;
        return !!raw;
    }

    function toggleGroup(key) {
        var k = 'warhub_group_' + String(key);
        GM_setValue(k, !isGroupOpen(key, true));
        renderBody();
    }

    // ============================================================
    // 16. MEMBER / WAR HELPERS
    // ============================================================

    function shortCd(v, fallback) {
        var n = Number(v || 0);
        if (!Number.isFinite(n) || n <= 0) return String(fallback || 'Ready');

        var h = Math.floor(n / 3600);
        var m = Math.floor((n % 3600) / 60);
        var s = Math.floor(n % 60);

        if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
        if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
        return s + 's';
    }

    function getMemberId(member) {
        return String(
            (member && (member.user_id || member.id || member.player_id)) ||
            ''
        );
    }

    function getMemberName(member) {
        return String(
            (member && (
                member.name ||
                member.user_name ||
                member.player_name ||
                member.username ||
                member.member_name
            )) ||
            'Unknown'
        );
    }

    function pickBarCurrent(bar) {
        if (!bar || typeof bar !== 'object') return null;
        var keys = ['current', 'amount', 'value', 'now', 'used', 'remaining_current'];
        for (var i = 0; i < keys.length; i += 1) {
            var n = Number(bar[keys[i]]);
            if (Number.isFinite(n)) return n;
        }
        return null;
    }

    function pickBarMaximum(bar) {
        if (!bar || typeof bar !== 'object') return null;
        var keys = ['maximum', 'max', 'total', 'full', 'capacity'];
        for (var i = 0; i < keys.length; i += 1) {
            var n = Number(bar[keys[i]]);
            if (Number.isFinite(n)) return n;
        }
        return null;
    }

    function energyValue(member) {
        member = member || {};
        var direct = Number(member.energy_current || member.energy || member.current_energy);
        if (Number.isFinite(direct)) return direct;
        return pickBarCurrent(member.energy);
    }

    function lifeValue(member) {
        member = member || {};
        var lifeBar = member.life || {};
        var cur = Number(member.life_current);
        if (!Number.isFinite(cur)) cur = pickBarCurrent(lifeBar);
        var max = Number(member.life_max || member.max_life);
        if (!Number.isFinite(max)) max = pickBarMaximum(lifeBar);
        if (Number.isFinite(cur) && Number.isFinite(max) && max > 0) return String(cur) + '/' + String(max);
        if (Number.isFinite(cur)) return String(cur);
        return '—';
    }

    function medCooldownValue(member) {
        member = member || {};
        var raw = Number(member.med_cd || member.med_cooldown || member.medical_cooldown || 0);
        if (Number.isFinite(raw) && raw > 0) return shortCd(raw, 'Ready');
        var txt = String(member.medical_cooldown_text || member.med_cooldown_text || '').trim();
        return txt || 'Ready';
    }

    function boosterCooldownValue(member) {
        member = member || {};
        var raw = Number(member.booster_cd || member.booster_cooldown || member.drug_cooldown || member.boosters_cooldown || 0);
        if (Number.isFinite(raw) && raw > 0) return shortCd(raw, 'Ready');
        var txt = String(member.booster_cooldown_text || member.booster_cd_text || member.drug_cooldown_text || '').trim();
        return txt || 'Ready';
    }

    function mergeChainMember(item) {
        item = item || {};
        var uid = String(item.user_id || item.id || item.player_id || '').trim();
        if (!uid) return item;
        var pools = [];
        if (state && state.faction && Array.isArray(state.faction.members)) pools.push(state.faction.members);
        if (Array.isArray(factionMembersCache)) pools.push(factionMembersCache);
        if (Array.isArray(currentFactionMembers)) pools.push(currentFactionMembers);
        for (var i = 0; i < pools.length; i += 1) {
            var list = pools[i] || [];
            for (var j = 0; j < list.length; j += 1) {
                var row = list[j] || {};
                var rid = String(row.user_id || row.id || row.player_id || '').trim();
                if (rid && rid === uid) {
                    return Object.assign({}, row, item, {
                        user_id: uid,
                        user_name: item.user_name || row.user_name || row.name || '',
                        name: item.name || row.name || row.user_name || item.user_name || ''
                    });
                }
            }
        }
        return item;
    }

    function humanStateLabel(st) {
        st = String(st || '').toLowerCase();
        if (st === 'online') return 'Online';
        if (st === 'idle') return 'Idle';
        if (st === 'travel') return 'Travel';
        if (st === 'jail') return 'Jail';
        if (st === 'hospital') return 'Hospital';
        return 'Offline';
    }

    function stateLabel(member) {
        member = member || {};
        var nowSec = Math.floor(Date.now() / 1000);
        var inHospital = !!(member.in_hospital || member.is_hospitalized || member.hospitalized);
        var hospitalUntilTs = Number(member.hospital_until_ts || member.hospital_until || member.status_until || member.until || 0);
        var hospitalSeconds = Number(member.hospital_seconds || member.hospital_time_left || member.hospital_eta_seconds || member.seconds_left || 0);
        if (inHospital || hospitalSeconds > 0 || hospitalUntilTs > nowSec) return 'hospital';
        var raw = String((member.state || member.presence || member.status || member.status_state || member.online_state || '')).toLowerCase();
        if (raw.indexOf('hospital') >= 0) return 'hospital';
        if (raw.indexOf('jail') >= 0) return 'jail';
        if (raw.indexOf('travel') >= 0) return 'travel';
        if (raw.indexOf('idle') >= 0) return 'idle';
        if (raw.indexOf('online') >= 0) return 'online';
        if (raw.indexOf('offline') >= 0) return 'offline';
        var detail = String(member.status_detail || member.detail || member.description || '').toLowerCase();
        if (detail.indexOf('hospital') >= 0) return 'hospital';
        if (detail.indexOf('jail') >= 0) return 'jail';
        if (detail.indexOf('travel') >= 0 || detail.indexOf('abroad') >= 0) return 'travel';
        if (member.online === true || member.is_online === true) return 'online';
        var lastAction = String(member.last_action || member.lastAction || '').toLowerCase();
        if (lastAction.indexOf('idle') >= 0) return 'idle';
        if (lastAction.indexOf('online') >= 0) return 'online';
        return 'offline';
    }

    function stateCountdown(member) {
        member = member || {};
        var nowSec = Math.floor(Date.now() / 1000);
        var until = Number(member.hospital_until_ts || member.hospital_until || member.jail_until || member.travel_until || member.status_until || member.until || 0);
        if (Number.isFinite(until) && until > nowSec) return Math.max(0, until - nowSec);
        var seconds = Number(member.hospital_seconds || member.hospital_time_left || member.hospital_eta_seconds || member.time_left || member.seconds_left || 0);
        if (Number.isFinite(seconds) && seconds > 0) return Math.max(0, seconds);
        return 0;
    }

    function travelDestinationText(member) {
        member = member || {};
        var parts = [
            member.travel_destination,
            member.destination,
            member.travel_to,
            member.traveling_to,
            member.status_detail,
            member.detail,
            member.description
        ].filter(function (v) { return !!String(v || '').trim(); }).map(function (v) {
            return String(v || '').trim();
        });

        for (var i = 0; i < parts.length; i++) {
            var txt = parts[i];
            if (/travel|flying|landing|arriv|abroad/i.test(txt)) return txt;
        }
        return parts.length ? parts[0] : '';
    }

    function travelArrivalText(member) {
        member = member || {};
        var nowSec = Math.floor(Date.now() / 1000);
        var until = Number(member.travel_until || member.arrive_ts || member.arrival_ts || member.until || member.status_until || 0);
        if (Number.isFinite(until) && until > nowSec) {
            return 'Arrives in ' + formatCountdown(until - nowSec);
        }
        var sec = Number(member.travel_seconds || member.travel_time_left || member.time_left || member.seconds_left || 0);
        if (Number.isFinite(sec) && sec > 0) {
            return 'Arrives in ' + formatCountdown(sec);
        }
        return '';
    }


    function spyText(member) {
        return String(
            (member && (
                member.spy_report ||
                member.spy ||
                member.spy_text ||
                member.stats_summary
            )) || ''
        ).trim();
    }

    function profileUrl(member) {
        var id = getMemberId(member);
        return id ? ('https://www.torn.com/profiles.php?XID=' + encodeURIComponent(id)) : '#';
    }

    function attackUrl(member) {
        var id = getMemberId(member);
        return id ? ('https://www.torn.com/loader.php?sid=attack&user2ID=' + encodeURIComponent(id)) : '#';
    }

    function bountyUrl(member) {
        var id = getMemberId(member);
        return id ? ('https://www.torn.com/bounties.php?p=add&userID=' + encodeURIComponent(id)) : '#';
    }

    function memberSearchText(member) {
        return [
            getMemberName(member),
            getMemberId(member),
            stateLabel(member),
            String((member && member.position) || ''),
            String((member && member.role) || '')
        ].join(' ').toLowerCase();
    }

    function groupMembers(items) {
        var grouped = {
            online: [],
            idle: [],
            travel: [],
            jail: [],
            hospital: [],
            offline: []
        };

        arr(items).forEach(function (m) {
            var st = stateLabel(m);
            if (!grouped[st]) st = 'offline';
            grouped[st].push(m);
        });

        return grouped;
    }

    function renderGroupBlock(key, items, rowRenderer, defaultOpen) {
        var open = isGroupOpen(key, defaultOpen);
        var title = String(key || '')
            .replace(/^members_/, '')
            .replace(/^enemies_/, '')
            .replace(/^hospital_/, '')
            .replace(/_/g, ' ');

        title = humanStateLabel(title);

        return [
            '<div class="warhub-member-group">',
                '<div class="warhub-member-group-head" data-group-toggle="' + esc(key) + '">',
                    '<div class="warhub-row">',
                        '<span class="warhub-pill ' + esc(String(title).toLowerCase()) + '">' + esc(title) + '</span>',
                        '<span class="warhub-pill neutral">' + esc(String(arr(items).length)) + '</span>',
                    '</div>',
                    '<div class="warhub-pill neutral">' + (open ? 'Hide' : 'Show') + '</div>',
                '</div>',
                open
                    ? '<div class="warhub-member-list">' + arr(items).map(rowRenderer).join('') + '</div>'
                    : '',
            '</div>'
        ].join('');
    }

    function statCard(label, value, sub) {
        return [
            '<div class="warhub-stat-card">',
                '<div class="warhub-stat-label">' + esc(label) + '</div>',
                '<div class="warhub-stat-value">' + esc(String(value == null ? '—' : value)) + '</div>',
                sub ? '<div class="warhub-sub" style="margin-top:6px;">' + esc(sub) + '</div>' : '',
            '</div>'
        ].join('');
    }

    // ============================================================
    // 17. ROW RENDERERS
    // ============================================================

    function renderMemberRow(member) {
        var id = getMemberId(member);
        var name = getMemberName(member);
        var st = stateLabel(member);
        var stateCd = stateCountdown(member);
        var energy = energyValue(member);
        var life = lifeValue(member);
        var med = medCooldownValue(member);
        var position = String((member && (member.position || member.faction_position || member.role || '')) || '').trim();

        return [
            '<div class="warhub-member-row" ' +
                'data-medcd-base="' + esc(String(Number(member && (member.med_cd || member.med_cooldown || member.medical_cooldown || 0)) || 0)) + '" ' +
                'data-statuscd-base="' + esc(String(stateCd)) + '" ' +
                'data-state-name="' + esc(st) + '">',
                '<div class="warhub-member-main">',
                    '<div class="warhub-row" style="gap:8px;min-width:0;flex:1;align-items:center;">',
                        '<a class="warhub-member-name" href="' + esc(profileUrl(member)) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>',
                        (position ? '<span class="warhub-pill neutral">' + esc(position) + '</span>' : ''),
                        '<span class="warhub-pill ' + esc(st) + '" data-statuscd>' + esc(
                            st === 'hospital' ? (stateCd > 0 ? 'Hospital (' + shortCd(stateCd, 'Hospital') + ')' : 'Hospital') :
                            st === 'jail' ? (stateCd > 0 ? 'Jail (' + shortCd(stateCd, 'Jail') + ')' : 'Jail') :
                            st === 'travel' ? (stateCd > 0 ? 'Travel (' + shortCd(stateCd, 'Travel') + ')' : 'Travel') :
                            humanStateLabel(st)
                        ) + '</span>',
                    '</div>',
                    '<div class="warhub-row">',
                        '<a class="warhub-btn bounty" href="' + esc(bountyUrl(member)) + '">Bounty</a>',
                    '</div>',
                '</div>',
                '<div class="warhub-statline">',
                    '<span title="Energy">⚡ ' + esc(energy == null ? '—' : String(energy)) + '</span>',
                    '<span title="Life">❤️ ' + esc(life) + '</span>',
                    '<span title="Medical Cooldown">💊 <span data-medcd>' + esc(med) + '</span></span>',
                '</div>',
            '</div>'
        ].join('');
    }

function getMyBattleStatsMillions() {
    var viewer = (state && state.viewer) || {};
    var direct = Number(viewer && (viewer.battle_stats_total_m || viewer.battle_stats_m || viewer.total_battle_stats_m));
    if (Number.isFinite(direct) && direct > 0) return direct;

    var total = Number(viewer && (viewer.battle_stats_total || viewer.total_battle_stats || 0));
    if (Number.isFinite(total) && total > 0) {
        return total >= 100000 ? (total / 1000000) : total;
    }
    return 0;
}

function formatBattleMillions(n) {
    var v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return '—';
    var abs = Math.abs(v);
    var rounded = Math.round(abs * 10) / 10;
    return (v < 0 ? '-' : '') + rounded.toFixed(abs >= 100 ? 0 : 1) + 'm';
}

function parseBattleNumber(token) {
    var s = String(token || '').trim().toLowerCase().replace(/,/g, '');
    if (!s) return null;
    var m = s.match(/^(\d+(?:\.\d+)?)([kmbt])?$/);
    if (!m) return null;
    var n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    var unit = m[2] || '';
    if (unit === 'k') n /= 1000;
    else if (unit === 'b') n *= 1000;
    else if (unit === 't') n *= 1000000;
    return n;
}

function parseEnemyBattleStatsMillions(member) {
    var ff = getFfScouterData(member);
    if (ff && ff.estimate_m > 0) {
        return Number(ff.estimate_m.toFixed(2));
    }
    return 0;
}

function predictionMeta(member) {
    var ff = getFfScouterData(member);
    if (!ff) {
        return {
            source: 'FF Scouter',
            confidence: 'Waiting',
            summary: 'Waiting for FF Scouter data for this target.',
            updated_at: ''
        };
    }

    if (ff.no_data) {
        return {
            source: 'FF Scouter',
            confidence: 'No data',
            summary: 'FF Scouter has no current fair-fight data for this target.',
            updated_at: ff.last_updated || ''
        };
    }

    return {
        source: 'FF Scouter',
        confidence: 'Fair Fight',
        summary: ff.fair_fight > 0 ? ('FF Scouter fair-fight ' + ff.fair_fight.toFixed(2) + '.') : 'FF Scouter fair-fight —.',
        updated_at: ff.last_updated || ''
    };
}

function enemyPredictionData(member) {
    var ff = getFfScouterData(member);
    var color = 'neutral';
    var tier = 'Waiting';
    var summary = 'Waiting for FF Scouter data.';

    if (ff) {
        if (ff.no_data) {
            color = 'offline';
            tier = 'No data';
            summary = 'FF Scouter has no data for this target.';
        } else if (ff.fair_fight > 0) {
            if (ff.fair_fight <= 2) color = 'good';
            else if (ff.fair_fight <= 3.5) color = 'neutral';
            else if (ff.fair_fight <= 4.5) color = 'warn';
            else color = 'bad';
            tier = ff.fair_fight.toFixed(2);
            summary = 'FF ' + ff.fair_fight.toFixed(2);
        }
    }

    var meta = predictionMeta(member);
    if (meta.summary) summary = meta.summary;

    return {
        color: color,
        tier: tier,
        summary: summary,
        source: meta.source,
        confidence: meta.confidence,
        updated_at: meta.updated_at
    };
}

function renderEnemyPredictionBox(member) {
    var pred = enemyPredictionData(member);
    return '<div class="warhub-sub">' + esc(pred.summary || '') + '</div>';
}

function renderEnemyRow(member, opts) {
    opts = opts || {};
    var id = getMemberId(member);
    var name = getMemberName(member);
    var st = stateLabel(member);
    var spy = spyText(member);
    var stateCd = stateCountdown(member);
    var dibbedBy = String((member && (member.dibbed_by_name || member.dibbedByName)) || '').trim();
    var dibText = dibbedBy ? ('Dibbed by ' + dibbedBy) : '';
    var pred = enemyPredictionData(member);
    var ff = getFfScouterData(member);
    var ffBubbleText = getFfScouterKey() ? 'FF …' : 'FF key';
    if (ff) {
        if (ff.no_data) ffBubbleText = 'FF n/a';
        else if (ff.fair_fight > 0) ffBubbleText = 'FF ' + ff.fair_fight.toFixed(2);
    }
    var travelDetail = st === 'travel' ? travelDestinationText(member) : '';
    var travelArrival = st === 'travel' ? travelArrivalText(member) : '';
    var actionHtml = '';

    if (state && state.members && arr(state.members).length) {
        var ownIds = {};
        arr(state.members).forEach(function (m) {
            var ownId = String((m && (m.user_id || m.id)) || '').trim();
            if (ownId) ownIds[ownId] = true;
        });
        if (id && ownIds[String(id)]) return '';
    }

    if (opts.mode === 'hospital') {
        var dibsAvailable = !!(member && member.dibs_available);
        var dibsLocked = !!(member && member.dibs_locked);
        actionHtml = '<button type="button" class="warhub-btn ' + (dibsAvailable ? 'warn' : 'ghost') + '" data-action="hospital-dibs" data-user-id="' + esc(id) + '" ' + ((dibsAvailable && !dibbedBy && !dibsLocked) ? '' : 'disabled') + '>Dibs</button>';
    } else {
        actionHtml = '<a class="warhub-btn" href="' + esc(attackUrl(member)) + '" target="_blank" rel="noopener noreferrer">Attack</a>';
    }

    return [
        '<div class="warhub-member-row" data-statuscd-base="' + esc(String(stateCd)) + '" data-state-name="' + esc(st) + '">',
            '<div class="warhub-member-main">',
                '<div class="warhub-row" style="justify-content:space-between;gap:8px;flex-wrap:nowrap;align-items:center;">',
                    '<div class="warhub-row" style="gap:8px;min-width:0;flex:1;flex-wrap:nowrap;align-items:center;">',
                        '<a class="warhub-member-name" href="' + esc(profileUrl(member)) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>',
                        '<span class="warhub-pill ' + esc(pred.color || 'neutral') + '">' + esc(ffBubbleText) + '</span>',
                        '<span class="warhub-pill ' + esc(st) + '" data-statuscd>' + esc(
                            st === 'hospital' ? (stateCd > 0 ? 'Hospital (' + shortCd(stateCd, 'Hospital') + ')' : 'Hospital') :
                            st === 'jail' ? (stateCd > 0 ? 'Jail (' + shortCd(stateCd, 'Jail') + ')' : 'Jail') :
                            st === 'travel' ? (stateCd > 0 ? 'Travel (' + shortCd(stateCd, 'Travel') + ')' : 'Travel') :
                            humanStateLabel(st)
                        ) + '</span>',
                        (opts.mode === 'hospital' ? '' : (dibText ? '<span class="warhub-pill warn">' + esc(dibText) + '</span>' : '')),
                    '</div>',
                    actionHtml,
                '</div>',
            '</div>',
            (st === 'travel' && travelDetail) ? '<div class="warhub-spy-box">' + esc(travelDetail) + (travelArrival ? '<div class="warhub-sub" style="margin-top:6px;">' + esc(travelArrival) + '</div>' : '') + '</div>' : '',
            spy ? '<div class="warhub-spy-box">' + esc(spy) + '</div>' : '',
        '</div>'
    ].join('');
}

    // ============================================================
    // 18. TAB RENDERS: LOGIN / OVERVIEW / MEMBERS / ENEMIES
    // ============================================================

    function renderLoginView() {
        return [
            '<div class="warhub-grid">',
                '<div class="warhub-hero-card">',
                    '<div class="warhub-title">Login</div>',
                    '<div class="warhub-sub">Use your Torn API key to connect to War and Chain.</div>',
                '</div>',
                '<div class="warhub-card warhub-col">',
                    '<label class="warhub-label" for="warhub-api-key">Torn API Key</label>',
                    '<input id="warhub-api-key" class="warhub-input" type="password" value="' + esc(getApiKey()) + '" placeholder="Enter API key" />',
                    '<label class="warhub-label" for="warhub-owner-token">Owner/Admin Token (optional)</label>',
                    '<input id="warhub-owner-token" class="warhub-input" type="password" value="' + esc(getOwnerToken()) + '" placeholder="Owner/admin token" />',
                    '<label class="warhub-label" for="warhub-ff-key">FF Scouter Limited Key (optional)</label>',
                    '<input id="warhub-ff-key" class="warhub-input" type="password" value="' + esc(getFfScouterKey()) + '" placeholder="FF Scouter key for fair-fight values" />',
                    '<div class="warhub-row">',
                        '<button type="button" class="warhub-btn" data-action="login">Login</button>',
                    '</div>',
                '</div>',
                '<div class="warhub-card">',
                    '<div class="warhub-kv"><div>Status</div><div>Logged out</div></div>',
                    '',
                    '',
                '</div>',
            '</div>'
        ].join('');
    }

function renderOverviewTab() {
    var war = (state && state.war) || {};
    var ownFaction = (state && state.faction) || {};

    var ownName = String(
        ownFaction.name ||
        war.our_faction_name ||
        war.faction_name ||
        'Your Faction'
    );

    var enemyName = String(
        war.enemy_faction_name ||
        'No current enemy'
    );

    var scoreUs = Number(war.score_us || war.our_score || 0);
    var scoreThem = Number(war.score_them || war.enemy_score || 0);
    var chainUs = Number(war.chain_us || 0);
    var chainThem = Number(war.chain_them || 0);

    var termsText = String((state && state.terms_summary && state.terms_summary.text) || '');
    var medDealsText = String((state && state.med_deals && state.med_deals.text) || '');

    var overviewDibs = arr(state && state.hospital && state.hospital.overview_items).filter(function (item) {
        return shouldKeepOverviewDib(item);
    });

    var dibsText = overviewDibs.length ? overviewDibs.map(function (item) {
        var dibbedBy = String((item && item.dibbed_by_name) || 'Unknown').trim();
        var dibEnemyName = String((item && item.enemy_name) || 'Enemy').trim();
        var suffix = '';
        if (item && item.in_hospital) {
            suffix = ' (In hospital)';
        } else if (item && item.left_hospital_at) {
            var leftAt = new Date(item.left_hospital_at).getTime();
            var secsLeft = Number.isFinite(leftAt) && leftAt > 0 ? Math.max(0, 30 - Math.floor((Date.now() - leftAt) / 1000)) : 0;
            suffix = secsLeft > 0 ? ' (Out ' + secsLeft + 's)' : '';
        }
        return dibbedBy + ' → ' + dibEnemyName + suffix;
    }).join('\n') : '';

    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card warhub-overview-hero">',
                '<div class="warhub-title">War Overview</div>',
                '<div class="warhub-sub">Faction vs enemy war view with chain, score, med deals, terms, and dibs.</div>',
                '<div class="warhub-war-head">',
                    '<div class="warhub-war-side">',
                        '<div class="warhub-war-side-label">Your faction</div>',
                        '<div class="warhub-war-side-name">' + esc(ownName) + '</div>',
                    '</div>',
                    '<div class="warhub-war-vs">VS</div>',
                    '<div class="warhub-war-side right">',
                        '<div class="warhub-war-side-label">Enemy faction</div>',
                        '<div class="warhub-war-side-name">' + esc(enemyName) + '</div>',
                    '</div>',
                '</div>',
            '</div>',
            '<div class="warhub-overview-stats">',
                '<div class="warhub-stat-card good"><div class="warhub-stat-label">Our Score</div><div class="warhub-stat-value">' + esc(fmtNum(scoreUs)) + '</div></div>',
                '<div class="warhub-stat-card bad"><div class="warhub-stat-label">Enemy Score</div><div class="warhub-stat-value">' + esc(fmtNum(scoreThem)) + '</div></div>',
                '<div class="warhub-stat-card good"><div class="warhub-stat-label">Our Chain</div><div class="warhub-stat-value">' + esc(fmtNum(chainUs)) + '</div></div>',
                '<div class="warhub-stat-card bad"><div class="warhub-stat-label">Enemy Chain</div><div class="warhub-stat-value">' + esc(fmtNum(chainThem)) + '</div></div>',
            '</div>',
            '<div class="warhub-alert-grid">',
                '<div class="warhub-card warhub-overview-link-card terms"><h4>Terms</h4><div class="warhub-spy-box">' + esc(termsText || 'No terms saved yet.') + '</div></div>',
                '<div class="warhub-card warhub-overview-link-card meddeals"><h4>Med Deals</h4><div class="warhub-spy-box">' + esc(medDealsText || 'No med deals saved yet.') + '</div></div>',
                '<div class="warhub-card warhub-overview-link-card dibs"><h4>Dibs</h4><div class="warhub-spy-box">' + esc(dibsText || 'No dibs claimed yet.') + '</div></div>',
            '</div>',
        '</div>'
    ].join('');
}

function renderMembersTab() {
    var members = arr(currentFactionMembers || factionMembersCache || []);

    var search = String(GM_getValue('warhub_members_search', '') || '').trim().toLowerCase();

    var filtered = members.filter(function (m) {
        if (!search) return true;
        return memberSearchText(m).indexOf(search) >= 0;
    });

    var grouped = groupMembers(filtered);
    var total = filtered.length;

    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Members</div>',
                '<div class="warhub-sub">Faction members only. Live energy, life, and med cooldown stay here only.</div>',
            '</div>',

            '<div class="warhub-card">',
                '<div class="warhub-row">',
                    '<input id="warhub-members-search" class="warhub-input" type="text" value="' + esc(search) + '" placeholder="Search member name, ID, status or position" />',
                    '<button type="button" class="warhub-btn ghost" data-action="members-refresh">Refresh</button>',
                '</div>',
            '</div>',

            '<div class="warhub-card">',
                '<div class="warhub-row">',
                    '<span class="warhub-pill neutral">Total ' + esc(String(total)) + '</span>',
                    '<span class="warhub-pill online">Online ' + esc(String(grouped.online.length)) + '</span>',
                    '<span class="warhub-pill idle">Idle ' + esc(String(grouped.idle.length)) + '</span>',
                    '<span class="warhub-pill travel">Travel ' + esc(String(grouped.travel.length)) + '</span>',
                    '<span class="warhub-pill jail">Jail ' + esc(String(grouped.jail.length)) + '</span>',
                    '<span class="warhub-pill hospital">Hospital ' + esc(String(grouped.hospital.length)) + '</span>',
                    '<span class="warhub-pill offline">Offline ' + esc(String(grouped.offline.length)) + '</span>',
                '</div>',
            '</div>',

            total ? renderGroupBlock('members_online', grouped.online, renderMemberRow, true) : '<div class="warhub-card">No faction members loaded yet.</div>',
            total ? renderGroupBlock('members_idle', grouped.idle, renderMemberRow, true) : '',
            total ? renderGroupBlock('members_travel', grouped.travel, renderMemberRow, false) : '',
            total ? renderGroupBlock('members_jail', grouped.jail, renderMemberRow, false) : '',
            total ? renderGroupBlock('members_hospital', grouped.hospital, renderMemberRow, true) : '',
            total ? renderGroupBlock('members_offline', grouped.offline, renderMemberRow, false) : '',
        '</div>'
    ].join('');
}
    
function renderEnemiesTab() {
    var enemies = arr(warEnemiesCache || (state && state.enemies) || []).filter(function (m) {
        var id = String((m && (m.user_id || m.id)) || '').trim();
        return !!id;
    });
    if (enemies.length) queueEnemyFfPredictions(enemies);
    var war = (state && state.war) || {};
    var enemyFactionId = String(war.enemy_faction_id || warEnemiesFactionId || '').trim();
    var enemyFactionName = String(war.enemy_faction_name || warEnemiesFactionName || 'Enemy Faction');
    var grouped = groupMembers(enemies);
    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Enemies</div>',
                '<div class="warhub-sub">' + esc(enemyFactionId ? (enemyFactionName + ' #' + enemyFactionId) : enemyFactionName) + '</div>',
                '<div class="warhub-sub">Real-time enemy faction status</div>',
            '</div>',
            enemyFactionId || enemies.length ? '' : '<div class="warhub-card">No current enemy faction detected yet.</div>',
            renderGroupBlock('enemies_online', grouped.online, function (m) { return renderEnemyRow(m); }, true),
            renderGroupBlock('enemies_idle', grouped.idle, function (m) { return renderEnemyRow(m); }, true),
            renderGroupBlock('enemies_travel', grouped.travel, function (m) { return renderEnemyRow(m); }, false),
            renderGroupBlock('enemies_jail', grouped.jail, function (m) { return renderEnemyRow(m); }, false),
            renderGroupBlock('enemies_hospital', grouped.hospital, function (m) { return renderEnemyRow(m); }, true),
            renderGroupBlock('enemies_offline', grouped.offline, function (m) { return renderEnemyRow(m); }, false),
        '</div>'
    ].join('');
}


    


    function renderHospitalTab() {
        var hospitalState = (state && state.hospital) || {};
        var enemies = arr((hospitalState && hospitalState.items) || []);
        var nowSec = Math.floor(Date.now() / 1000);
        var hospitalOnly = enemies.filter(function (m) {
            var untilTs = Number((m && (m.hospital_until_ts || m.hospital_until || m.status_until || m.until)) || 0);
            var seconds = Number((m && (m.hospital_seconds || m.hospital_time_left || m.hospital_eta_seconds)) || 0);
            return !!(m && (m.in_hospital || m.is_hospitalized)) || stateLabel(m) === 'hospital' || seconds > 0 || untilTs > nowSec;
        }).sort(function (a, b) {
            var aCd = Number(stateCountdown(a) || 0);
            var bCd = Number(stateCountdown(b) || 0);
            if (aCd !== bCd) return aCd - bCd;
            return getMemberName(a).localeCompare(getMemberName(b));
        });
        return [
            '<div class="warhub-grid">',
                '<div class="warhub-hero-card">',
                    '<div class="warhub-title">Hospital</div>',
                    '<div class="warhub-sub">Current enemy hospital list, lowest timer first, kept live from current war</div>',
                '</div>',
                hospitalOnly.length ? renderGroupBlock('hospital_enemies', hospitalOnly, function (m) { return renderEnemyRow(m, { mode: 'hospital' }); }, true) : '<div class="warhub-card">No hospital enemies right now.</div>',
            '</div>'
        ].join('');
    }

    

    function renderChainTab() {
        var chain = (state && state.chain) || {};
        var ownFactionName = String(((state && state.faction && (state.faction.faction_name || state.faction.name)) || 'Your Faction'));
        var availableItems = arr(chain.available_items).map(mergeChainMember).slice().sort(function (a, b) {
            return getMemberName(a).localeCompare(getMemberName(b));
        });
        var sitterItems = arr(chain.sitter_items).map(mergeChainMember).slice().sort(function (a, b) {
            return getMemberName(a).localeCompare(getMemberName(b));
        });
        var current = Number(chain.current || 0);
        var cooldown = Number(chain.cooldown || 0);
        var isAvailable = !!chain.available;
        var isSitter = !!chain.sitter_enabled;
        var viewerIsUnavailable = !isAvailable;
        var yourStatus = isAvailable ? (isSitter ? 'Available · Chain Sitter On' : 'Available') : (isSitter ? 'Unavailable · Chain Sitter On' : 'Unavailable');
        var bonusTiers = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
        var nextBonus = 0;
        var previousBonus = 0;
        var i;
        for (i = 0; i < bonusTiers.length; i += 1) {
            if (current < bonusTiers[i]) {
                nextBonus = bonusTiers[i];
                previousBonus = i > 0 ? bonusTiers[i - 1] : 0;
                break;
            }
            previousBonus = bonusTiers[i];
        }
        if (!nextBonus) {
            previousBonus = bonusTiers[bonusTiers.length - 1];
            nextBonus = previousBonus + 50000;
        }
        var hitsToBonus = Math.max(0, nextBonus - current);
        var progressBase = Math.max(1, nextBonus - previousBonus);
        var progressValue = Math.max(0, current - previousBonus);
        var meterPct = Math.max(6, Math.min(100, Math.round((progressValue / progressBase) * 100)));
        var bonusCountdown = hitsToBonus <= 0 ? 'Bonus hit ready now' : (hitsToBonus === 1 ? '1 hit to next bonus' : (fmtNum(hitsToBonus) + ' hits to next bonus'));
        var tierLabel = previousBonus > 0 ? (fmtNum(previousBonus) + ' → ' + fmtNum(nextBonus)) : ('0 → ' + fmtNum(nextBonus));
        var chainColorClass = current >= nextBonus ? 'good' : (hitsToBonus <= 3 ? 'warn' : 'neutral');

        function chainBtnClass(activeClass, isActive) {
            return 'warhub-btn ' + (isActive ? activeClass : 'gray');
        }

        function renderChainPersonRow(item, mode) {
            item = mergeChainMember(item);
            var uid = String((item && item.user_id) || '');
            var name = getMemberName(item);
            var profile = uid ? profileUrl(uid) : '';
            var energy = energyValue(item);
            var booster = boosterCooldownValue(item);
            var med = medCooldownValue(item);
            var statusText = mode === 'sitter'
                ? ((item && item.sitter_enabled) ? 'Chain sitter enabled' : 'Chain sitter disabled')
                : 'Marked available';
            return [
                '<div class="chain-person-row warhub-member-row">',
                    '<div class="warhub-member-main">',
                        '<div class="warhub-col" style="min-width:0;flex:1;">',
                            profile
                                ? '<a class="warhub-member-name" href="' + esc(profile) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>'
                                : '<div class="warhub-member-name">' + esc(name) + '</div>',
                            '<div class="warhub-summary-meta">' + esc(statusText) + '</div>',
                        '</div>',
                        '<div class="warhub-flag-row">',
                            mode === 'sitter'
                                ? '<span class="warhub-pill warn">Sitter</span>'
                                : '<span class="warhub-pill good">Available</span>',
                        '</div>',
                    '</div>',
                    '<div class="warhub-statline">',
                        '<span title="Energy">⚡ ' + esc(energy == null ? '—' : String(energy)) + '</span>',
                        '<span title="Booster Cooldown">🧪 ' + esc(booster) + '</span>',
                        '<span title="Medical Cooldown">💊 ' + esc(med) + '</span>',
                    '</div>',
                '</div>'
            ].join('');
        }

        return [
            '<div class="warhub-grid">',
                '<div class="warhub-hero-card chain-hero" style="background:linear-gradient(180deg, rgba(165,24,24,.35), rgba(140,96,22,.18) 55%, rgba(255,255,255,.04)); border-color: rgba(255,208,82,.22);">',
                    '<div class="warhub-title">Chain Rack</div>',
                    '<div class="warhub-sub">' + esc(ownFactionName) + ' live chain control</div>',
                    '<div class="warhub-space"></div>',
                    '<div class="chain-stat-grid">',
                        '<div class="chain-stat-box" style="background:linear-gradient(180deg, rgba(188,34,34,.22), rgba(255,255,255,.04)); border:1px solid rgba(255,98,98,.18); border-radius:12px; padding:10px;">',
                            '<div class="label">Chain Score</div>',
                            '<div class="value" style="font-size:28px; color:#ffdf7d;">' + esc(fmtNum(current)) + '</div>',
                        '</div>',
                        '<div class="chain-stat-box" style="background:linear-gradient(180deg, rgba(214,151,28,.22), rgba(255,255,255,.04)); border:1px solid rgba(255,208,82,.20); border-radius:12px; padding:10px;">',
                            '<div class="label">Next Bonus Hit</div>',
                            '<div class="value" style="font-size:24px; color:#ffe48e;">' + esc(fmtNum(nextBonus)) + '</div>',
                            '<div class="warhub-summary-meta">Tier ' + esc(tierLabel) + '</div>',
                        '</div>',
                        '<div class="chain-stat-box" style="background:linear-gradient(180deg, rgba(48,138,88,.22), rgba(255,255,255,.04)); border:1px solid rgba(90,200,120,.18); border-radius:12px; padding:10px;">',
                            '<div class="label">Bonus Countdown</div>',
                            '<div class="value" style="font-size:18px; color:#b8ffd1;">' + esc(bonusCountdown) + '</div>',
                            '<div class="warhub-summary-meta">Cooldown ' + esc(shortCd(cooldown, 'Ready')) + '</div>',
                        '</div>',
                        '<div class="chain-stat-box" style="background:linear-gradient(180deg, rgba(73,86,190,.18), rgba(255,255,255,.04)); border:1px solid rgba(112,132,255,.16); border-radius:12px; padding:10px;">',
                            '<div class="label">Your Status</div>',
                            '<div class="value" style="font-size:18px; color:#dfe5ff;">' + esc(yourStatus) + '</div>',
                        '</div>',
                    '</div>',
                    '<div class="warhub-space"></div>',
                    '<div class="chain-meter" style="background:rgba(255,255,255,.08); border-radius:999px; overflow:hidden; border:1px solid rgba(255,255,255,.08);">',
                        '<div class="chain-meter-fill" style="width:' + esc(String(meterPct)) + '%; height:14px; background:linear-gradient(90deg, rgba(255,208,82,.95), rgba(255,104,104,.92));"></div>',
                    '</div>',
                    '<div class="warhub-space"></div>',
                    '<div class="warhub-row">',
                        '<span class="warhub-pill ' + (isAvailable ? 'good' : 'bad') + '">' + esc(isAvailable ? 'Available' : 'Unavailable') + '</span>',
                        '<span class="warhub-pill ' + (isSitter ? 'warn' : 'neutral') + '">' + esc(isSitter ? 'Chain Sitter On' : 'Chain Sitter Off') + '</span>',
                        '<span class="warhub-pill online">Available ' + esc(String(availableItems.length)) + '</span>',
                        '<span class="warhub-pill idle">Sitters ' + esc(String(sitterItems.length)) + '</span>',
                        '<span class="warhub-pill ' + esc(chainColorClass) + '">Next ' + esc(fmtNum(nextBonus)) + '</span>',
                    '</div>',
                '</div>',
                '<div class="warhub-card">',
                    '<div class="warhub-row">',
                        '<button type="button" class="' + esc(chainBtnClass('green', isAvailable)) + '" data-action="chain-available">Available</button>',
                        '<button type="button" class="' + esc(chainBtnClass('', viewerIsUnavailable)) + '" data-action="chain-unavailable">Unavailable</button>',
                        '<button type="button" class="' + esc(chainBtnClass('warn', isSitter)) + '" data-action="chain-toggle-sitter">Toggle sitter</button>',
                    '</div>',
                '</div>',
                '<div class="warhub-card">',
                    '<h3>Available</h3>',
                    availableItems.length
                        ? availableItems.map(function (item) { return renderChainPersonRow(item, 'available'); }).join('')
                        : '<div class="warhub-muted">No members marked available.</div>',
                '</div>',
                '<div class="warhub-card">',
                    '<h3>Chain Sitters</h3>',
                    sitterItems.length
                        ? sitterItems.map(function (item) { return renderChainPersonRow(item, 'sitter'); }).join('')
                        : '<div class="warhub-muted">No chain sitters enabled.</div>',
                '</div>',
            '</div>'
        ].join('');
    }

    function sortMembers(list) {
        return arr(list).slice().sort(function (a, b) {
            var aState = stateLabel(a);
            var bState = stateLabel(b);
            var rank = { online: 0, idle: 1, hospital: 2, jail: 3, travel: 4, offline: 5 };
            var diff = (rank[aState] ?? 99) - (rank[bState] ?? 99);
            if (diff) return diff;
            return getMemberName(a).localeCompare(getMemberName(b));
        });
    }

    function renderTargetsTab() {
    var targets = mergeTargets((state && state.targets) || [], getLocalTargets());
    var enemyPool = [];
    enemyPool = enemyPool.concat(arr(warEnemiesCache || []));
    enemyPool = enemyPool.concat(arr((state && state.enemies) || []));
    enemyPool = enemyPool.concat(arr((((state || {}).hospital || {}).items) || []));
    var seenEnemyIds = {};
    var enemies = sortMembers(enemyPool.filter(function (m) {
        var id = getMemberId(m);
        if (!id || seenEnemyIds[id]) return false;
        seenEnemyIds[id] = true;
        return true;
    }));

    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Targets</div>',
                '<div class="warhub-sub">Save one or more war enemies and manage them here</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>Saved Enemy</h3>',
                targets.length ? targets.map(function (t) {
                    var id = String(t.user_id || t.target_user_id || t.id || t.player_id || '');
                    var name = String(t.name || t.target_name || t.player_name || 'Enemy');
                    var note = String(t.note || '');

                    return [
                        '<div class="warhub-member-row">',
                            '<div class="warhub-member-main">',
                                '<div class="warhub-row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">',
                                    '<a class="warhub-member-name" href="https://www.torn.com/profiles.php?XID=' + esc(id) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>',
                                    '<div class="warhub-row" style="gap:8px;flex-wrap:wrap;">',
                                        id ? '<a class="warhub-btn" href="https://www.torn.com/loader.php?sid=attack&user2ID=' + esc(id) + '" target="_blank" rel="noopener noreferrer">Attack</a>' : '',
                                        id ? '<button type="button" class="warhub-btn gray" data-action="target-delete" data-user-id="' + esc(id) + '">Delete</button>' : '',
                                    '</div>',
                                '</div>',
                                note ? '<div class="warhub-spy-box">' + esc(note) + '</div>' : '',
                            '</div>',
                        '</div>'
                    ].join('');
                }).join('') : '<div class="warhub-muted">No enemy saved yet.</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<label class="warhub-label" for="warhub-target-name">Enemy</label>',
                '<select id="warhub-target-name" class="warhub-select">',
                    '<option value="">Select enemy member</option>',
                    enemies.map(function (m) {
                        var id = getMemberId(m);
                        var name = getMemberName(m);
                        return '<option value="' + esc(id) + '">' + esc(name) + '</option>';
                    }).join(''),
                '</select>',

                '<label class="warhub-label" for="warhub-target-note">Note (optional)</label>',
                '<textarea id="warhub-target-note" class="warhub-textarea" placeholder="Optional note for yourself"></textarea>',

                '<div class="warhub-row">',
                    '<button type="button" class="warhub-btn green" data-action="target-save">Save Enemy</button>',
                '</div>',
            '</div>',
        '</div>'
    ].join('');
}
    function renderMedDealsTab() {
        var medDeals = (state && state.med_deals) || {};
        var items = arr(medDeals.items || []);
        var enemies = sortMembers(arr((state && state.enemies) || warEnemiesCache || []));
        var viewer = (state && state.viewer) || {};
        var viewerUserId = String(viewer.user_id || '').trim();
        var viewerName = String(viewer.name || 'You');
        var mine = items.find(function (row) {
            return String((row && row.user_id) || '').trim() === viewerUserId;
        }) || {};
        var selectedEnemyUserId = String(mine.enemy_user_id || '');

        return [
            '<div class="warhub-grid">',
                '<div class="warhub-hero-card">',
                    '<div class="warhub-title">Med Deals</div>',
                    '<div class="warhub-sub">Pick your enemy from current war. Shared on Overview for the faction.</div>',
                '</div>',
                '<div class="warhub-card warhub-col">',
                    '<div class="warhub-kv"><div>Your member</div><div>' + esc(viewerName) + '</div></div>',
                    '<label class="warhub-label" for="warhub-meddeals-enemy">Enemy player</label>',
                    '<select id="warhub-meddeals-enemy" class="warhub-select">',
                        '<option value="">Select enemy player</option>',
                        enemies.map(function (m) {
                            if (typeof m === 'string') return m;
                            var id = getMemberId(m);
                            var name = getMemberName(m);
                            var selected = id && selectedEnemyUserId && String(id) === String(selectedEnemyUserId) ? ' selected' : '';
                            return '<option value="' + esc(id) + '"' + selected + '>' + esc(name) + '</option>';
                        }).join(''),
                    '</select>',
                    '<div class="warhub-row">',
                        '<button type="button" class="warhub-btn" data-action="meddeals-save">Save</button>',
                        '<button type="button" class="warhub-btn gray" data-action="meddeals-clear">Delete</button>',
                    '</div>',
                '</div>',
                items.length ? [
                    '<div class="warhub-card warhub-col">',
                        '<h3>Current Med Deals</h3>',
                        items.map(function (row) {
                            var userName = String(row.user_name || row.user_id || 'Member');
                            var enemyName = String(row.enemy_name || row.enemy_user_id || 'Enemy');
                            return '<div class="warhub-spy-box">' + esc(userName + ' → ' + enemyName) + '</div>';
                        }).join(''),
                    '</div>'
                ].join('') : '<div class="warhub-card">No med deals posted yet.</div>',
            '</div>'
        ].join('');
    }

function renderTermsTab() {
    var box = (state && state.terms_summary) || {};
    var text = String(box.text || '');

    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Terms</div>',
                '<div class="warhub-sub">Leader shared Terms / Summary box for the whole faction</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<label class="warhub-label" for="warhub-terms-summary-text">Terms / Summary</label>',
                '<textarea id="warhub-terms-summary-text" class="warhub-textarea" placeholder="Write terms, summary, instructions, or improvements here...">' + esc(text) + '</textarea>',
                '<div class="warhub-row">',
                    '<button type="button" class="warhub-btn" data-action="terms-summary-save">Save</button>',
                    '<button type="button" class="warhub-btn gray" data-action="terms-summary-clear">Delete</button>',
                '</div>',
            '</div>',
        '</div>'
    ].join('');
}
    function renderSummaryTab() {
    var summary = liveSummaryCache || {};
    var cards = arr(summary.cards);
    var top = summary.top || {};
    var rows = arr(summary.rows);
    if (!rows.length) {
        rows = arr((state && state.members) || []).map(function (m) {
            var uid = String((m && (m.user_id || m.id)) || '');
            return {
                user_id: uid,
                name: getMemberName(m),
                role: String((m && (m.position || (m.member_access && m.member_access.position))) || 'Member'),
                status: String((m && (m.status || m.online_state)) || '—'),
                profile_url: uid ? profileUrl(uid) : '',
                enabled: !!(m && (m.enabled || (m.member_access && m.member_access.enabled))),
                member_access: (m && m.member_access) || {},
                has_stored_api_key: !!(m && (m.has_stored_api_key || (m.member_access && m.member_access.member_api_key))),
                online_state: String((m && m.online_state) || '').toLowerCase(),
                hits: 0,
                respect_gain: 0,
                respect_lost: 0,
                net_impact: 0,
                hits_taken: 0,
                efficiency: 0,
                last_action: String((m && m.last_action) || ''),
                hospital_eta: '',
                hospital_eta_seconds: 0,
                no_show: true,
                recovering_soon: false,
                flags: []
            };
        });
    }
    var topFive = summary.top_five || {};
    var alerts = summary.alerts || {};
    var trend = summary.trend || {};
    var war = summary.war || (state && state.war) || {};

    function num(v, fallback) {
        var n = Number(v);
        return Number.isFinite(n) ? n : Number(fallback || 0);
    }

    function txt(v, fallback) {
        var s = String(v == null ? '' : v).trim();
        return s || String(fallback || '—');
    }

    function pickList() {
        for (var i = 0; i < arguments.length; i++) {
            if (Array.isArray(arguments[i])) return arguments[i];
        }
        return [];
    }

    function renderAlertList(title, items, metricLabel) {
        items = arr(items).slice(0, 5);

        return [
            '<div class="warhub-alert-card">',
                '<h4>' + esc(title) + '</h4>',
                items.length
                    ? [
                        '<div class="warhub-summary-list">',
                            items.map(function (item) {
                                var name = txt(item.name || item.user_name || item.player_name, 'Player');
                                var metric = item.metric_label || item.label || metricLabel || '';
                                var value = item.metric_value != null ? item.metric_value : (
                                    item.value != null ? item.value : (
                                        item.net_impact != null ? fmtNum(item.net_impact) : '—'
                                    )
                                );

                                return [
                                    '<div class="warhub-summary-item">',
                                        '<div>',
                                            '<div class="warhub-summary-name">' + esc(name) + '</div>',
                                            metric ? '<div class="warhub-summary-meta">' + esc(metric) + '</div>' : '',
                                        '</div>',
                                        '<div class="warhub-pill neutral">' + esc(String(value)) + '</div>',
                                    '</div>'
                                ].join('');
                            }).join(''),
                        '</div>'
                    ].join('')
                    : '<div class="warhub-sub">No data yet.</div>',
            '</div>'
        ].join('');
    }

    function renderTrendCard(title, box) {
        box = box || {};
        return [
            '<div class="warhub-stat-card">',
                '<div class="warhub-stat-label">' + esc(title) + '</div>',
                '<div class="warhub-kv"><div>Respect Gained</div><div>' + esc(fmtNum(num(box.respect_gain))) + '</div></div>',
                '<div class="warhub-kv"><div>Respect Lost</div><div>' + esc(fmtNum(num(box.respect_lost))) + '</div></div>',
                '<div class="warhub-kv"><div>Net</div><div>' + netPill(num(box.net), '') + '</div></div>',
                '<div class="warhub-kv"><div>Hits</div><div>' + esc(fmtNum(num(box.hits))) + '</div></div>',
                '<div class="warhub-kv"><div>Hits Taken</div><div>' + esc(fmtNum(num(box.hits_taken))) + '</div></div>',
            '</div>'
        ].join('');
    }

    function renderFlags(flags) {
        flags = arr(flags);
        if (!flags.length) return '—';

        return [
            '<div class="warhub-flag-row">',
                flags.map(function (flag) {
                    return '<span class="warhub-flag">' + esc(String(flag)) + '</span>';
                }).join(''),
            '</div>'
        ].join('');
    }

    function renderTableRows(items) {
        items = arr(items);

        if (!items.length) {
            return '<tr><td colspan="14">No summary rows yet.</td></tr>';
        }

        return items.map(function (r) {
            var userId = txt(r.user_id, '');
            var name = txt(r.name || r.user_name || r.player_name, 'Player');
            var hits = num(r.hits);
            var gained = num(r.respect_gain);
            var lost = num(r.respect_lost);
            var net = num(r.net_impact, gained - lost);
            var taken = num(r.hits_taken);
            var efficiency = num(r.efficiency);
            var lastAction = txt(r.last_action, '—');
            var hospitalEta = txt(r.hospital_eta, '—');
            var role = txt(r.role, 'Member');
            var status = txt(r.status, '—');
            var isEnabled = !!r.enabled;
            var hasLogin = !!r.has_stored_api_key;
            var onlineState = txt(r.online_state, '').toLowerCase();
            var profile = txt(r.profile_url, '') || (userId ? 'https://www.torn.com/profiles.php?XID=' + encodeURIComponent(userId) : '');

            return [
                '<tr>',
                    '<td>',
                        profile
                            ? '<a class="warhub-member-name" href="' + esc(profile) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>'
                            : '<span class="warhub-member-name">' + esc(name) + '</span>',
                    '</td>',
                    '<td>' + esc(role) + '</td>',
                    '<td>' + (isEnabled ? '<span class="warhub-pill good">Enabled</span>' : '<span class="warhub-pill bad">Off</span>') + '</td>',
                    '<td>' + (hasLogin ? '<span class="warhub-pill good">Logged In</span>' : '<span class="warhub-pill neutral">No Login</span>') + '</td>',
                    '<td>' + (onlineState ? '<span class="warhub-pill ' + esc(onlineState) + '">' + esc(status) + '</span>' : esc(status)) + '</td>',
                    '<td>' + esc(fmtNum(hits)) + '</td>',
                    '<td>' + esc(fmtNum(gained)) + '</td>',
                    '<td>' + esc(fmtNum(lost)) + '</td>',
                    '<td>' + netPill(net, '') + '</td>',
                    '<td>' + esc(fmtNum(taken)) + '</td>',
                    '<td>' + esc(efficiency ? efficiency.toFixed(2) : '0.00') + '</td>',
                    '<td>' + esc(lastAction) + '</td>',
                    '<td>' + esc(hospitalEta) + '</td>',
                    '<td>' + renderFlags(r.flags) + '</td>',
                '</tr>'
            ].join('');
        }).join('');
    }

    function renderTopFiveBox(title, rowsList, emptyText) {
        rowsList = arr(rowsList).slice(0, 5);

        return [
            '<div class="warhub-card warhub-col">',
                '<h3>' + esc(title) + '</h3>',
                rowsList.length ? [
                    '<div class="warhub-col">',
                        rowsList.map(function (row, idx) {
                            var userId = txt(row.user_id, '');
                            var name = txt(row.name || row.user_name || row.player_name, 'Player');
                            var gained = num(row.respect_gain);
                            var lost = num(row.respect_lost);
                            var net = num(row.net_impact, gained - lost);
                            var hits = num(row.hits);
                            var taken = num(row.hits_taken);
                            var efficiency = num(row.efficiency);
                            var role = txt(row.role, 'Member');
                            var status = txt(row.status, '—');
                            var isEnabled = !!row.enabled;
                            var hasLogin = !!row.has_stored_api_key;
                            var onlineState = txt(row.online_state, '').toLowerCase();
                            var profile = txt(row.profile_url, '') || (userId ? 'https://www.torn.com/profiles.php?XID=' + encodeURIComponent(userId) : '');

                            return [
                                '<details class="warhub-dropbox">',
                                    '<summary class="warhub-dropbox-head">#' + esc(String(idx + 1)) + ' ' + esc(name) + '</summary>',
                                    '<div class="warhub-dropbox-body">',
                                        '<div class="warhub-row" style="margin-bottom:8px;">',
                                            profile ? '<a class="warhub-btn ghost" href="' + esc(profile) + '" target="_blank" rel="noopener noreferrer">Open Profile</a>' : '',
                                            '<span class="warhub-pill neutral">' + esc(role) + '</span>',
                                            (isEnabled ? '<span class="warhub-pill good">Enabled</span>' : '<span class="warhub-pill bad">Off</span>'),
                                            (hasLogin ? '<span class="warhub-pill good">Logged In</span>' : '<span class="warhub-pill neutral">No Login</span>'),
                                            (onlineState ? '<span class="warhub-pill ' + esc(onlineState) + '">' + esc(status) + '</span>' : '<span class="warhub-pill neutral">' + esc(status) + '</span>'),
                                        '</div>',
                                        '<div class="warhub-kv"><div>Hits</div><div>' + esc(fmtNum(hits)) + '</div></div>',
                                        '<div class="warhub-kv"><div>Respect Gained</div><div>' + esc(fmtNum(gained)) + '</div></div>',
                                        '<div class="warhub-kv"><div>Respect Lost</div><div>' + esc(fmtNum(lost)) + '</div></div>',
                                        '<div class="warhub-kv"><div>Net Impact</div><div>' + esc(fmtNum(net)) + '</div></div>',
                                        '<div class="warhub-kv"><div>Hits Taken</div><div>' + esc(fmtNum(taken)) + '</div></div>',
                                        '<div class="warhub-kv"><div>Efficiency</div><div>' + esc(efficiency ? efficiency.toFixed(2) : '0.00') + '</div></div>',
                                    '</div>',
                                '</details>'
                            ].join('');
                        }).join(''),
                    '</div>'
                ].join('') : '<div class="warhub-sub">' + esc(emptyText || 'No data yet.') + '</div>',
            '</div>'
        ].join('');
    }

    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">War Summary</div>',
                '<div class="warhub-sub">Leader command board for live war performance</div>',
            '</div>',

            liveSummaryError
                ? '<div class="warhub-card"><span class="warhub-pill bad">' + esc(liveSummaryError) + '</span></div>'
                : '',

            cards.length ? [
                '<div class="warhub-overview-stats">',
                    cards.map(function (c) {
                        return [
                            '<div class="warhub-stat-card ' + esc(String(c.cls || '')) + '">',
                                '<div class="warhub-stat-label">' + esc(txt(c.label, 'Metric')) + '</div>',
                                '<div class="warhub-stat-value">' + esc(String(c.value == null ? '—' : c.value)) + '</div>',
                                c.sub ? '<div class="warhub-sub" style="margin-top:6px;">' + esc(String(c.sub)) + '</div>' : '',
                            '</div>'
                        ].join('');
                    }).join(''),
                '</div>'
            ].join('') : '',

            '<div class="warhub-card warhub-col">',
                '<h3>War Snapshot</h3>',
                '<div class="warhub-kv"><div>Our Faction</div><div>' + esc(txt(war.our_faction_name || war.faction_name, 'Your Faction')) + '</div></div>',
                '<div class="warhub-kv"><div>Enemy Faction</div><div>' + esc(txt(war.enemy_faction_name, '—')) + '</div></div>',
                '<div class="warhub-kv"><div>Top Hitter</div><div>' + esc(txt(top.top_hitter, '—')) + '</div></div>',
                '<div class="warhub-kv"><div>Most Respect Gained</div><div>' + esc(txt(top.top_respect_gain, '—')) + '</div></div>',
                '<div class="warhub-kv"><div>Most Respect Lost</div><div>' + esc(txt(top.top_respect_lost || top.top_points_bleeder, '—')) + '</div></div>',
                '<div class="warhub-kv"><div>Most Hits Taken</div><div>' + esc(txt(top.top_hits_taken, '—')) + '</div></div>',
                '<div class="warhub-kv"><div>Best Efficiency</div><div>' + esc(txt(top.best_efficiency, '—')) + '</div></div>',
                '<div class="warhub-kv"><div>Best Finisher</div><div>' + esc(txt(top.best_finisher, '—')) + '</div></div>',
            '</div>',

            '<div class="warhub-overview-stats">',
                renderTrendCard('Last 15m', trend.last_15m),
                renderTrendCard('Last 60m', trend.last_60m),
                renderTrendCard('Overall', trend.overall),
            '</div>',

            '<div class="warhub-alert-grid">',
                renderAlertList('No Shows', alerts.no_shows, '0 hits'),
                renderAlertList('Bleeding', alerts.bleeding, 'High respect lost'),
                renderAlertList('Under Fire', alerts.under_fire, 'High hits taken'),
                renderAlertList('Recovering Soon', alerts.recovering_soon, 'Leaving hospital soon'),
                renderAlertList('Carrying', alerts.carrying, 'Top positive impact'),
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<div class="warhub-row" style="justify-content:space-between;align-items:center;">',
                    '<h3>Member Performance</h3>',
                    '<span class="warhub-sub">Shows leader activation, login presence, live status, and war output together</span>',
                    '<span class="warhub-pill neutral">' + esc(fmtNum(rows.length)) + ' rows</span>',
                '</div>',
                '<div class="warhub-table-wrap">',
                    '<table class="warhub-table">',
                        '<thead>',
                            '<tr>',
                                '<th>Name</th>',
                                '<th>Role</th>',
                                '<th>Access</th>',
                                '<th>Login</th>',
                                '<th>Status</th>',
                                '<th>Hits</th>',
                                '<th>Respect Gained</th>',
                                '<th>Respect Lost</th>',
                                '<th>Net Impact</th>',
                                '<th>Hits Taken</th>',
                                '<th>Efficiency</th>',
                                '<th>Last Action</th>',
                                '<th>Hospital ETA</th>',
                                '<th>Flags</th>',
                            '</tr>',
                        '</thead>',
                        '<tbody>',
                            renderTableRows(rows),
                        '</tbody>',
                    '</table>',
                '</div>',
            '</div>',

            renderTopFiveBox('Top 5 Hitters', pickList(topFive.top_hitters, topFive.top_hitter), 'No hitter data yet.'),
            renderTopFiveBox('Top 5 Respect Gained', pickList(topFive.top_respect_gain, topFive.top_respect_gained), 'No respect gain data yet.'),
            renderTopFiveBox('Top 5 Respect Lost', pickList(topFive.top_respect_lost, topFive.top_points_bleeder), 'No respect lost data yet.'),
            renderTopFiveBox('Top 5 Hits Taken', pickList(topFive.top_hits_taken), 'No hits taken data yet.'),
            renderTopFiveBox('Top 5 Net Impact', pickList(topFive.top_net_impact), 'No net impact data yet.'),
            renderTopFiveBox('No Shows', pickList(topFive.no_shows), 'No no-show list right now.'),
            renderTopFiveBox('Recovering Soon', pickList(topFive.recovering_soon), 'No recovering-soon list right now.'),
        '</div>'
    ].join('');
}
        // ============================================================
    // 20. TAB RENDERS: FACTION
    // ============================================================

    function renderFactionTab() {
    var faction = (state && state.faction) || {};
    var members = arr(factionMembersCache);
    var factionName = String((faction && (faction.name || faction.faction_name)) || 'Your Faction');
    var factionId = String((faction && faction.faction_id) || '');
    var search = String(GM_getValue('warhub_faction_search', '') || '').trim().toLowerCase();

    members = members.filter(function (m) {
        return !!String(getMemberId(m) || '').trim();
    }).slice().sort(function (a, b) {
        var aEnabled = !!(a && (a.enabled || a.member_enabled || a.active_for_cycle || a.is_active || a.activated || a.is_enabled || a.active));
        var bEnabled = !!(b && (b.enabled || b.member_enabled || b.active_for_cycle || b.is_active || b.activated || b.is_enabled || b.active));
        if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
        return getMemberName(a).localeCompare(getMemberName(b));
    });

    var filtered = members.filter(function (m) {
        if (!search) return true;
        return memberSearchText(m).indexOf(search) >= 0;
    });

    var enabledCount = Number(members.filter(function (m) {
        return !!(m && (m.enabled || m.member_enabled || m.active_for_cycle || m.is_active || m.activated || m.is_enabled || m.active));
    }).length || 0);

    var visibleCanManage = canManageFaction();

    function renderFactionMemberRow(m) {
        var id = getMemberId(m);
        var name = getMemberName(m);
        var enabled = !!(m && (m.enabled || m.member_enabled || m.active_for_cycle || m.is_active || m.activated || m.is_enabled || m.active));
        var role = String((m && (m.position || m.role || (m.member_access && m.member_access.position))) || '').trim() || 'Member';
        var st = stateLabel(m);
        var stateCd = stateCountdown(m);
        var energy = energyValue(m);
        var life = lifeValue(m);
        var medBase = Number(m && (m.med_cd || m.med_cooldown || m.medical_cooldown || 0)) || 0;
        var medText = medCooldownValue(m);

        return [
            '<div class="warhub-member-row" ' +
                'data-medcd-base="' + esc(String(medBase)) + '" ' +
                'data-statuscd-base="' + esc(String(stateCd)) + '" ' +
                'data-state-name="' + esc(st) + '">',
                '<div class="warhub-member-main">',
                    '<div class="warhub-row" style="gap:8px;min-width:0;flex:1;">',
                        '<a class="warhub-member-name" href="' + esc(profileUrl(m)) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>',
                        '<span class="warhub-pill neutral">' + esc(role) + '</span>',
                        '<span class="warhub-pill ' + esc(st) + '" data-statuscd>' + esc(
                            st === 'hospital' ? (stateCd > 0 ? 'Hospital (' + shortCd(stateCd, 'Hospital') + ')' : 'Hospital') :
                            st === 'jail' ? (stateCd > 0 ? 'Jail (' + shortCd(stateCd, 'Jail') + ')' : 'Jail') :
                            st === 'travel' ? (stateCd > 0 ? 'Travel (' + shortCd(stateCd, 'Travel') + ')' : 'Travel') :
                            humanStateLabel(st)
                        ) + '</span>',
                        '<span class="warhub-pill ' + (enabled ? 'good' : 'bad') + '">' + (enabled ? 'Enabled' : 'Disabled') + '</span>',
                    '</div>',
                    visibleCanManage ? '<div class="warhub-row">' + (
                        enabled
                            ? '<button type="button" class="warhub-btn gray" data-action="remove-member" data-user-id="' + esc(id) + '">Disable</button>'
                            : '<button type="button" class="warhub-btn green" data-action="activate-member" data-user-id="' + esc(id) + '">Enable</button>'
                    ) + '</div>' : '',
                '</div>',
                '<div class="warhub-statline">',
                    '<span>⚡ ' + esc(energy == null ? '—' : String(energy)) + '</span>',
                    '<span>✚ ' + esc(life) + '</span>',
                    '<span>💊 <span data-medcd>' + esc(medText) + '</span></span>',
                    '<span>#' + esc(id || '—') + '</span>',
                '</div>',
            '</div>'
        ].join('');
    }

    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Faction</div>',
                '<div class="warhub-sub">All faction members with live energy, life, and medical cooldown for admin, leaders, and co-leaders</div>',
            '</div>',

            '<div class="warhub-card">',
                '<div class="warhub-row" style="justify-content:space-between;align-items:flex-start;gap:8px;">',
                    '<div>',
                        '<div class="warhub-member-name">' + esc(factionName) + '</div>',
                        '<div class="warhub-sub">Faction #' + esc(factionId || '—') + '</div>',
                    '</div>',
                    '<div class="warhub-row" style="flex-wrap:wrap;justify-content:flex-end;">',
                        '<span class="warhub-pill good">Enabled ' + esc(String(enabledCount)) + '</span>',
                        '<span class="warhub-pill neutral">Members ' + esc(String(members.length)) + '</span>',
                        '<span class="warhub-pill neutral">Shown ' + esc(String(filtered.length)) + '</span>',
                    '</div>',
                '</div>',
                '<div class="warhub-sub" style="margin-top:10px;">Live bars only show when the backend has usable Torn data for that member. No fake fallback values are shown.</div>',
            '</div>',

            '<div class="warhub-card">',
                '<div class="warhub-row">',
                    '<input id="warhub-faction-search" class="warhub-input" type="text" value="' + esc(search) + '" placeholder="Search member name, ID, status or position" />',
                    '<button type="button" class="warhub-btn ghost" data-action="faction-refresh">Refresh</button>',
                '</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<div class="warhub-row" style="justify-content:space-between;align-items:center;">',
                    '<h3>Faction Members</h3>',
                    '<span class="warhub-pill neutral">' + esc(fmtNum(filtered.length)) + ' shown</span>',
                '</div>',
                filtered.length
                    ? '<div class="warhub-col">' + filtered.map(renderFactionMemberRow).join('') + '</div>'
                    : '<div class="warhub-empty">No faction members found.</div>',
            '</div>',
        '</div>'
    ].join('');
} function renderSettingsTab() {
    var viewer = (state && state.viewer) || {};
    var access = normalizeAccessCache((state && state.access) || accessState);
    var maskedKey = getApiKey() ? '********' : '';
    var bs = (viewer && viewer.battle_stats) || viewer.stats || {};
    var strength = Number((bs && (bs.strength || bs.str || viewer.strength)) || 0);
    var speed = Number((bs && (bs.speed || bs.spd || viewer.speed)) || 0);
    var defense = Number((bs && (bs.defense || bs.defence || bs.def || viewer.defense || viewer.defence)) || 0);
    var dexterity = Number((bs && (bs.dexterity || bs.dex || viewer.dexterity)) || 0);
    var totalRaw = Number((viewer && (viewer.battle_stats_total || viewer.total_battle_stats || viewer.total || (strength + speed + defense + dexterity))) || 0);
    var totalM = Number((viewer && (viewer.battle_stats_total_m || viewer.total_battle_stats_m)) || 0);
    if ((!Number.isFinite(totalM) || totalM <= 0) && Number.isFinite(totalRaw) && totalRaw > 0) {
        totalM = totalRaw >= 100000 ? (totalRaw / 1000000) : totalRaw;
    }
    var totalText = Number.isFinite(totalRaw) && totalRaw > 0 ? fmtNum(totalRaw) : '0';
    var totalMillionsText = Number.isFinite(totalM) && totalM > 0 ? formatBattleMillions(totalM) : '0.0m';
    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Settings</div>',
                '<div class="warhub-sub">Account and local script settings</div>',
            '</div>',
            '<div class="warhub-card warhub-col">',
                '<label class="warhub-label" for="warhub-api-key">Torn API Key</label>',
                '<input id="warhub-api-key" class="warhub-input" type="password" value="" placeholder="' + esc(maskedKey ? 'Saved API key' : 'Enter API key') + '" />',
                '<label class="warhub-label" for="warhub-ff-key">FF Scouter Limited Key</label>',
                '<input id="warhub-ff-key" class="warhub-input" type="password" value="' + esc(getFfScouterKey()) + '" placeholder="Optional FF Scouter key for fair-fight values" />',
                '<div class="warhub-sub">FF Scouter key powers the fair-fight values in enemy rows and refreshes automatically while Enemies is open.</div>',
                '<div class="warhub-row">',
                    '<button type="button" class="warhub-btn" data-action="login">Re-login</button>',
                    '<button type="button" class="warhub-btn gray" data-action="logout">Logout</button>',
                '</div>',
            '</div>',

            '<div class="warhub-card">',
                '<div class="warhub-kv"><div>User</div><div>' + esc(String(viewer.name || 'Logged out')) + '</div></div>',
                '<div class="warhub-kv"><div>User ID</div><div>' + esc(String(viewer.user_id || '—')) + '</div></div>',
                '<div class="warhub-kv"><div>Faction active</div><div>' + (canUseFeatures() ? 'Yes' : 'No') + '</div></div>',
                '<div class="warhub-kv"><div>Leader activated</div><div>' + (access.member_enabled ? 'Yes' : 'No') + '</div></div>',
            '</div>',

        '</div>'
    ].join('');
}



    function renderInstructionsTab() {
    return [
        '<div class="warhub-grid">',

            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Help & API Terms</div>',
                '<div class="warhub-sub">Colorful quick guide for setup, faction use, and Torn API key rules</div>',
                '<div class="warhub-row" style="margin-top:8px;gap:6px;">',
                    '<span class="warhub-pill good">Setup</span>',
                    '<span class="warhub-pill online">Faction Tools</span>',
                    '<span class="warhub-pill travel">API Key Safety</span>',
                    '<span class="warhub-pill hospital">ToS</span>',
                '</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>Quick start</h3>',
                '<div class="warhub-spy-box">',
                    '<div><b>1.</b> Open <b>Settings</b> and paste your Torn API key.</div>',
                    '<div><b>2.</b> Press <b>Re-login</b> to create a backend session and load your faction-linked state.</div>',
                    '<div><b>3.</b> Open <b>Members</b>, <b>Enemies</b>, <b>Hospital</b>, and <b>Chain</b> to pull live faction war tools.</div>',
                    '<div><b>4.</b> Leaders and co-leaders can activate members and manage faction-only tools.</div>',
                    '<div><b>5.</b> Refresh a tab when you want a fresh pull right away.</div>',
                '</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>What this script does</h3>',
                '<div class="warhub-mini-grid">',
                    '<div class="warhub-stat-card good"><div class="warhub-stat-label">Members</div><div class="warhub-summary-meta">View faction members, live bars, med cooldowns, and status buckets.</div></div>',
                    '<div class="warhub-stat-card bad"><div class="warhub-stat-label">Enemies</div><div class="warhub-summary-meta">Track enemy roster, hospital timing, dibs, and attack links during war.</div></div>',
                    '<div class="warhub-stat-card"><div class="warhub-stat-label">Chain</div><div class="warhub-summary-meta">Show availability, sitter status, chain numbers, and faction coordination tools.</div></div>',
                    '<div class="warhub-stat-card"><div class="warhub-stat-label">Shared faction view</div><div class="warhub-summary-meta">Activated members can appear in faction tools so teammates can coordinate faster.</div></div>',
                '</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>Torn API ToS summary</h3>',
                '<div class="warhub-spy-box">',
                    '<div>Torn says users must know <b>how their key is used</b>, what is stored, who can access the data, and what access level is needed.</div>',
                    '<div style="margin-top:6px;">Torn also says scripts should <b>never ask for passwords</b>, should keep keys <b>secure and confidential</b>, and should request <b>only the data needed</b>.</div>',
                    '<div style="margin-top:6px;">If a tool stores or shares data beyond the local browser, the ToS should be shown clearly where the key is entered.</div>',
                '</div>',
                '<div class="warhub-space"></div>',
                '<div class="warhub-kv"><div>Passwords requested</div><div><span class="warhub-pill good">No</span></div></div>',
                '<div class="warhub-kv"><div>Key owner awareness</div><div><span class="warhub-pill travel">Required</span></div></div>',
                '<div class="warhub-kv"><div>Use least data needed</div><div><span class="warhub-pill online">Yes</span></div></div>',
                '<div class="warhub-kv"><div>Keep keys confidential</div><div><span class="warhub-pill hospital">Yes</span></div></div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>War and Chain ToS snapshot</h3>',
                '<div class="warhub-kv"><div>Data storage</div><div><span class="warhub-pill bad">Remote + local</span></div></div>',
                '<div class="warhub-summary-meta">This build stores local preferences in userscript storage and also sends your API key to the backend for login, sessions, and faction-linked features.</div>',
                '<div class="warhub-kv"><div>Data sharing</div><div><span class="warhub-pill online">Faction tools</span></div></div>',
                '<div class="warhub-summary-meta">Faction-linked outputs such as shared member or war coordination views may be visible to other users in the same faction who are using the script.</div>',
                '<div class="warhub-kv"><div>Purpose of use</div><div><span class="warhub-pill travel">War support</span></div></div>',
                '<div class="warhub-summary-meta">Used for faction organization, war tracking, member access, chain coordination, enemy tracking, and related quality-of-life features.</div>',
                '<div class="warhub-kv"><div>Key storage & use</div><div><span class="warhub-pill hospital">Automation</span></div></div>',
                '<div class="warhub-summary-meta">Your key is used by the backend to authenticate you, build your session, and pull the live Torn data needed for enabled features.</div>',
                '<div class="warhub-kv"><div>Recommended key access</div><div><span class="warhub-pill good">Lowest needed</span></div></div>',
                '<div class="warhub-summary-meta">Use the lowest access or custom key that still supports the tabs you want to use.</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>API key storage and safety</h3>',
                '<div class="warhub-spy-box">',
                    '<div><b>Local storage:</b> the userscript saves your session token, open tab, overlay state, FF key, and other convenience settings in userscript storage on your device/browser.</div>',
                    '<div style="margin-top:6px;"><b>Backend use:</b> when you log in, your API key is sent to the War and Chain backend and used to authenticate your account and power faction-linked live features.</div>',
                    '<div style="margin-top:6px;"><b>Best practice:</b> do not share your key, do not paste someone else\'s key, and do not use more access than the script actually needs.</div>',
                    '<div style="margin-top:6px;"><b>Important:</b> if you think your key has been misused, replace it in Torn and log in again with a fresh one.</div>',
                '</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>Using the script safely</h3>',
                '<div>• Only use your own Torn API key.</div>',
                '<div>• Never give your Torn password to any script or website.</div>',
                '<div>• Leaders and co-leaders should only activate members who should have faction access.</div>',
                '<div>• Data shown in the overlay depends on Torn API responses, backend state, and your current session.</div>',
                '<div>• If something looks wrong, refresh the tab or re-login before assuming the data is final.</div>',
            '</div>',

            '<div class="warhub-card warhub-col">',
                '<h3>Good key setup</h3>',
                '<div class="warhub-row">',
                    '<span class="warhub-pill good">Custom key</span>',
                    '<span class="warhub-pill online">Needed selections only</span>',
                    '<span class="warhub-pill travel">Rotate if unsure</span>',
                '</div>',
                '<div class="warhub-space"></div>',
                '<div>For best safety, build a custom key with only the selections needed for the features you use most.</div>',
                '<div>If a tab stops working after changing key access, raise the access only as much as needed instead of using a wider key by default.</div>',
            '</div>',

        '</div>'
    ].join('');
}


    function renderWarTop5Tab() {
    var summary = liveSummaryCache || {};
    var topFive = summary.top_five || {};

    function txt(v, fallback) {
        var s = String(v == null ? '' : v).trim();
        return s || String(fallback || '—');
    }

    function num(v, fallback) {
        var n = Number(v);
        return Number.isFinite(n) ? n : Number(fallback || 0);
    }

    function pickList() {
        for (var i = 0; i < arguments.length; i++) {
            if (Array.isArray(arguments[i])) return arguments[i];
        }
        return [];
    }

    function renderQuickBox(title, rows) {
        rows = arr(rows).slice(0, 5);

        return [
            '<div class="warhub-card warhub-col">',
                '<h3>' + esc(title) + '</h3>',
                rows.length ? rows.map(function (row, idx) {
                    var userId = txt(row.user_id, '');
                    var name = txt(row.name || row.user_name || row.player_name, 'Player');
                    var hits = num(row.hits);
                    var gain = num(row.respect_gain);
                    var lost = num(row.respect_lost);
                    var taken = num(row.hits_taken);
                    var net = num(row.net_impact, gain - lost);
                    var role = txt(row.role, 'Member');
                    var isEnabled = !!row.enabled;
                    var hasLogin = !!row.has_stored_api_key;
                    var profile = txt(row.profile_url, '') || (userId ? 'https://www.torn.com/profiles.php?XID=' + encodeURIComponent(userId) : '');

                    return [
                        '<details class="warhub-dropbox">',
                            '<summary class="warhub-dropbox-head">#' + esc(String(idx + 1)) + ' ' + esc(name) + '</summary>',
                            '<div class="warhub-dropbox-body">',
                                '<div class="warhub-row" style="margin-bottom:8px;">',
                                    profile ? '<a class="warhub-btn ghost" href="' + esc(profile) + '" target="_blank" rel="noopener noreferrer">Open Profile</a>' : '',
                                    '<span class="warhub-pill neutral">' + esc(role) + '</span>',
                                    (isEnabled ? '<span class="warhub-pill good">Enabled</span>' : '<span class="warhub-pill bad">Off</span>'),
                                    (hasLogin ? '<span class="warhub-pill good">Logged In</span>' : '<span class="warhub-pill neutral">No Login</span>'),
                                '</div>',
                                '<div class="warhub-summary-meta">Hits ' + esc(fmtNum(hits)) + ' • Gain ' + esc(fmtNum(gain)) + ' • Lost ' + esc(fmtNum(lost)) + ' • Taken ' + esc(fmtNum(taken)) + ' • Net ' + esc(fmtNum(net)) + '</div>',
                            '</div>',
                        '</details>'
                    ].join('');
                }).join('') : '<div class="warhub-sub">No data yet.</div>',
            '</div>'
        ].join('');
    }

    return [
        '<div class="warhub-grid">',
            '<div class="warhub-hero-card">',
                '<div class="warhub-title">Top 5</div>',
                '<div class="warhub-sub">Quick leader ranking view with profile, login, and activation status</div>',
            '</div>',

            renderQuickBox('Top Hitters', pickList(topFive.top_hitters, topFive.top_hitter)),
            renderQuickBox('Top Respect Gained', pickList(topFive.top_respect_gain, topFive.top_respect_gained)),
            renderQuickBox('Top Respect Lost', pickList(topFive.top_respect_lost, topFive.top_points_bleeder)),
            renderQuickBox('Top Hits Taken', pickList(topFive.top_hits_taken)),
            renderQuickBox('Top Net Impact', pickList(topFive.top_net_impact)),
            renderQuickBox('Recovering Soon', pickList(topFive.recovering_soon)),
        '</div>'
    ].join('');
}

function renderAdminTab() { var dash = analyticsCache || {}; var recent = arr(dash.recent_activity || dash.recent || []); var recentHtml = recent.length ? recent.map(function (row) { return [ '<div class="warhub-member-row">', '<div class="warhub-member-main">', '<div class="warhub-row"><span class="warhub-member-name">' + esc(String(row.title || row.kind || 'Activity')) + '</span></div>', '<div class="warhub-row"><span class="warhub-pill neutral">' + esc(fmtTs(row.created_at || row.at || '')) + '</span></div>', '</div>', row.text ? '<div class="warhub-spy-box">' + esc(String(row.text)) + '</div>' : '', '</div>' ].join(''); }).join('') : '<div class="warhub-empty">No recent activity.</div>'; return [ '<div class="warhub-grid">', '<div class="warhub-hero-card">', '<div class="warhub-title">Admin</div>', '<div class="warhub-sub">Owner-only overview and activity</div>', '</div>', '<div class="warhub-row">', '<span class="warhub-pill neutral">Factions: ' + esc(fmtNum(dash.total_factions || dash.faction_licenses_total || 0)) + '</span>', '<span class="warhub-pill neutral">Users: ' + esc(fmtNum(dash.users_using_script || dash.members_using_bot || 0)) + '</span>', '<span class="warhub-pill neutral">Leaders: ' + esc(fmtNum(dash.leaders_using_bot || 0)) + '</span>', '</div>', '<div class="warhub-card"><div class="warhub-sub">This free-access rebuild keeps owner-only admin access but removes paid-access management from the interface.</div></div>', '<div class="warhub-card warhub-col"><h3>Recent Activity</h3>' + recentHtml + '</div>', '</div>' ].join(''); } function handleActionClick(el) {
    return _handleActionClick.apply(this, arguments);
}

function _handleActionClick() {
    _handleActionClick = _asyncToGenerator(function* (el) {
        var action = el && el.getAttribute('data-action');
        if (!action) return;

        try {
            if (action === 'login') {
                yield doLogin();
                return;
            }

                if (action === 'logout') {
                doLogout();
                return;
            }

            if (action === 'members-refresh') {
                setStatus('Refreshing members...', false);
                yield loadFactionMembers(true);
                membersLiveStamp = Date.now();
                renderBody();
                setStatus('Members refreshed.', false);
                return;
            }

            if (action === 'faction-refresh') {
                setStatus('Refreshing faction...', false);
                yield loadFactionMembers(true);
                membersLiveStamp = Date.now();
                renderBody();
                setStatus('Faction refreshed.', false);
                return;
            }

            if (action === 'enemies-refresh') {
                setStatus('Refreshing enemies...', false);
                yield loadWarData(true);
                yield loadEnemies(true);
                renderBody();
                setStatus('Enemies refreshed.', false);
                return;
            }

            if (action === 'meddeals-save') {
                var medDealsEnemyEl = overlay && overlay.querySelector('#warhub-meddeals-enemy');
                var chosenEnemyUserId = cleanInputValue(medDealsEnemyEl && medDealsEnemyEl.value);
                var enemiesForMedDeals = sortMembers(arr((state && state.enemies) || warEnemiesCache || []));
                var chosenEnemy = enemiesForMedDeals.find(function (m) {
                    return String(getMemberId(m)) === String(chosenEnemyUserId);
                }) || {};

                if (!chosenEnemyUserId) {
                    setStatus('Select an enemy player first.', true);
                    return;
                }

                var saveMedDealsRes = yield authedReq('POST', '/api/meddeals', {
                    user_id: String((state && state.viewer && state.viewer.user_id) || ''),
                    user_name: String((state && state.viewer && state.viewer.name) || ''),
                    enemy_user_id: chosenEnemyUserId,
                    enemy_name: String(getMemberName(chosenEnemy) || chosenEnemyUserId)
                });

                if (!saveMedDealsRes.ok) {
                    setStatus((saveMedDealsRes.json && saveMedDealsRes.json.error) || 'Failed to save med deals.', true);
                    return;
                }

                state = state || {};
                state.med_deals = state.med_deals || {};
                state.med_deals.items = arr(saveMedDealsRes.json && saveMedDealsRes.json.items);
                state.med_deals.text = state.med_deals.items.map(function (row) {
                    return String((row.user_name || row.user_id || '') + ' → ' + (row.enemy_name || row.enemy_user_id || '')).trim();
                }).filter(Boolean).join('\n');
                renderBody();
                setStatus('Med deal saved.', false);
                return;
            }

            if (action === 'meddeals-clear') {
                var viewerIdForClear = String((state && state.viewer && state.viewer.user_id) || '').trim();
                var myDeal = arr((state && state.med_deals && state.med_deals.items) || []).find(function (row) {
                    return String((row && row.user_id) || '').trim() === viewerIdForClear;
                }) || {};
                var clearEnemyUserId = String((myDeal && myDeal.enemy_user_id) || '').trim();

                if (!clearEnemyUserId) {
                    state = state || {};
                    state.med_deals = state.med_deals || {};
                    state.med_deals.items = arr(state.med_deals.items).filter(function (row) {
                        return String((row && row.user_id) || '').trim() !== viewerIdForClear;
                    });
                    state.med_deals.text = state.med_deals.items.map(function (row) {
                        return String((row.user_name || row.user_id || '') + ' → ' + (row.enemy_name || row.enemy_user_id || '')).trim();
                    }).filter(Boolean).join('\n');
                    renderBody();
                    setStatus('No med deal to clear.', false);
                    return;
                }

                var clearMedDealsRes = yield authedReq('DELETE', '/api/meddeals/' + encodeURIComponent(clearEnemyUserId), null);
                if (!clearMedDealsRes.ok && clearMedDealsRes.status === 405) {
                    clearMedDealsRes = yield authedReq('POST', '/api/meddeals/' + encodeURIComponent(clearEnemyUserId), {});
                }

                if (!clearMedDealsRes.ok) {
                    setStatus((clearMedDealsRes.json && clearMedDealsRes.json.error) || 'Failed to clear med deals.', true);
                    return;
                }

                state = state || {};
                state.med_deals = state.med_deals || {};
                state.med_deals.items = arr(clearMedDealsRes.json && clearMedDealsRes.json.items);
                state.med_deals.text = state.med_deals.items.map(function (row) {
                    return String((row.user_name || row.user_id || '') + ' → ' + (row.enemy_name || row.enemy_user_id || '')).trim();
                }).filter(Boolean).join('\n');
                renderBody();
                setStatus('Med deal cleared.', false);
                return;
            }

            if (action === 'terms-summary-save') {
                var boxEl = overlay && overlay.querySelector('#warhub-terms-summary-text');
                var boxText = String((boxEl && boxEl.value) || '');

                var saveBoxRes = yield authedReq('POST', '/api/terms', {
                    text: boxText
                });

                if (!saveBoxRes.ok) {
                    setStatus((saveBoxRes.json && saveBoxRes.json.error) || 'Failed to save Terms / Summary.', true);
                    return;
                }

                state = state || {};
                state.terms_summary = state.terms_summary || {};
                state.terms_summary.text = boxText;
                renderBody();
                setStatus('Terms / Summary saved.', false);
                return;
            }

            if (action === 'terms-summary-clear') {
                var clearBoxRes = yield authedReq('POST', '/api/terms', {
                    text: ''
                });

                if (!clearBoxRes.ok) {
                    setStatus((clearBoxRes.json && clearBoxRes.json.error) || 'Failed to clear Terms / Summary.', true);
                    return;
                }

                state = state || {};
                state.terms_summary = state.terms_summary || {};
                state.terms_summary.text = '';
                renderBody();
                setStatus('Terms / Summary cleared.', false);
                return;
            }

            if (action === 'target-save') {
                var targetSelectEl = overlay && overlay.querySelector('#warhub-target-name');
                var targetNoteEl = overlay && overlay.querySelector('#warhub-target-note');

                var selectedUserId = cleanInputValue(targetSelectEl && targetSelectEl.value);
                if (!selectedUserId) {
                    setStatus('Select an enemy target first.', true);
                    return;
                }

                var enemies = arr((state && state.enemies) || []);
                var picked = enemies.find(function (m) {
                    return getMemberId(m) === selectedUserId;
                });

                if (!picked) {
                    setStatus('Selected enemy was not found in current war list.', true);
                    return;
                }

                var targetPayload = {
                    name: getMemberName(picked),
                    user_id: selectedUserId,
                    note: String((targetNoteEl && targetNoteEl.value) || '').trim()
                };

                var nextTargets = mergeTargets([targetPayload], mergeTargets((state && state.targets) || [], getLocalTargets()));
                state = state || {};
                state.targets = nextTargets.slice();
                setLocalTargets(nextTargets);
                renderBody();

                var targetRes = yield authedReq('POST', '/api/targets', targetPayload);
                if (!targetRes.ok) {
                    setStatus((targetRes.json && targetRes.json.error) || 'Failed to save target.', true);
                    return;
                }

                if (targetRes.json && Array.isArray(targetRes.json.items)) {
                    state.targets = mergeTargets(targetRes.json.items, state.targets || []);
                    setLocalTargets(state.targets);
                }

                renderBody();
                setStatus('Target saved.', false);
                return;
            }

            if (action === 'target-delete') {
                var deleteTargetUserId = cleanInputValue(el && el.getAttribute('data-user-id'));
                if (!deleteTargetUserId) {
                    setStatus('Missing target ID.', true);
                    return;
                }

                state = state || {};
                state.targets = mergeTargets(state.targets || [], getLocalTargets()).filter(function (t) {
                    return targetItemId(t) !== deleteTargetUserId;
                });
                setLocalTargets(state.targets);
                renderBody();

                var deleteTargetRes = yield authedReq('DELETE', '/api/targets/' + encodeURIComponent(deleteTargetUserId), null);
                if (!deleteTargetRes.ok && deleteTargetRes.status === 405) {
                    deleteTargetRes = yield authedReq('POST', '/api/targets/' + encodeURIComponent(deleteTargetUserId), {});
                }
                if (!deleteTargetRes.ok) {
                    yield loadState();
                    renderBody();
                    setStatus((deleteTargetRes.json && deleteTargetRes.json.error) || 'Failed to delete target.', true);
                    return;
                }

                if (deleteTargetRes.json && Array.isArray(deleteTargetRes.json.items)) {
                    state.targets = mergeTargets(deleteTargetRes.json.items, []);
                    setLocalTargets(state.targets);
                }
                renderBody();
                setStatus('Target deleted.', false);
                return;
            }

            if (action === 'activate-member') {
                var activateUserId = el.getAttribute('data-user-id');
                if (!activateUserId) return;

                var activateRes = yield authedReq('POST', '/api/faction/members/' + encodeURIComponent(activateUserId) + '/activate', {});
                if (!activateRes.ok) {
                    setStatus((activateRes.json && activateRes.json.error) || 'Failed to activate member.', true);
                    return;
                }

                yield loadFactionMembers(true);
                renderBody();
                setStatus('Member activated.', false);
                return;
            }

            if (action === 'remove-member') {
                var removeUserId = el.getAttribute('data-user-id');
                if (!removeUserId) return;

                var removeRes = yield authedReq('POST', '/api/faction/members/' + encodeURIComponent(removeUserId) + '/remove', {});
                if (!removeRes.ok) {
                    setStatus((removeRes.json && removeRes.json.error) || 'Failed to remove member.', true);
                    return;
                }

                yield loadFactionMembers(true);
                renderBody();
                setStatus('Member removed.', false);
                return;
            }

            if (action === 'hospital-dibs') {
                var dibEnemyId = String(el.getAttribute('data-user-id') || '').trim();
                if (!dibEnemyId) return;

                state = state || {};
                state.hospital = Object.assign({}, state.hospital || {});
                var viewerDibName = String(
                    (state.viewer && state.viewer.name) ||
                    (state.me && state.me.name) ||
                    ''
                ).trim();

                if (Array.isArray(state.hospital.items)) {
                    state.hospital.items = state.hospital.items.map(function (item) {
                        var row = item && typeof item === 'object' ? Object.assign({}, item) : {};
                        var rowId = String((row.enemy_user_id || row.user_id || row.id || '')).trim();
                        if (rowId === dibEnemyId) {
                            row.dibbed_by_name = viewerDibName || String(row.dibbed_by_name || '');
                            row.dibbed_by_user_id = String(
                                (state.viewer && state.viewer.user_id) ||
                                (state.me && state.me.user_id) ||
                                row.dibbed_by_user_id ||
                                ''
                            ).trim();
                            row.dibs_available = false;
                            row.dibs_locked = false;
                        }
                        return row;
                    });
                }

                renderBody();
                setStatus('Claiming dibs...', false);

                var dibRes = yield authedReq('POST', '/api/hospital/dibs/' + encodeURIComponent(dibEnemyId), {});
                if (!dibRes.ok) {
                    yield loadHospital(true);
                    renderBody();
                    setStatus((dibRes.json && dibRes.json.error) || 'Failed to claim dibs.', true);
                    return;
                }

                if (dibRes.json && Array.isArray(dibRes.json.hospital_items)) {
                    state.hospital.items = dibRes.json.hospital_items.slice();
                    state.hospital.count = Number(dibRes.json.hospital_count || state.hospital.items.length || 0);
                } else {
                    yield loadHospital(true);
                }

                if (dibRes.json && Array.isArray(dibRes.json.overview_items)) {
                    state.hospital.overview_items = dibRes.json.overview_items.slice();
                    state.hospital.overview_count = Number(dibRes.json.overview_count || state.hospital.overview_items.length || 0);
                }

                renderBody();
                setStatus('Dibs claimed.', false);
                return;
            }

            if (action === 'chain-available') {
                var chainAvailableRes = yield authedReq('POST', '/api/chain', { available: true });
                if (!chainAvailableRes.ok) {
                    setStatus((chainAvailableRes.json && chainAvailableRes.json.error) || 'Failed to update chain.', true);
                    return;
                }

                state = state || {};
                state.chain = Object.assign({}, state.chain || {}, chainAvailableRes.json || {}, { available: true });
                renderBody();
                setStatus('Chain marked available.', false);
                return;
            }

            if (action === 'chain-unavailable') {
                var chainUnavailableRes = yield authedReq('POST', '/api/chain', { available: false });
                if (!chainUnavailableRes.ok) {
                    setStatus((chainUnavailableRes.json && chainUnavailableRes.json.error) || 'Failed to update chain.', true);
                    return;
                }

                state = state || {};
                state.chain = Object.assign({}, state.chain || {}, chainUnavailableRes.json || {}, { available: false });
                renderBody();
                setStatus('Chain marked unavailable.', false);
                return;
            }

            if (action === 'chain-toggle-sitter') {
                var current = !!(state && state.chain && state.chain.sitter_enabled);
                var chainSitterRes = yield authedReq('POST', '/api/chain', { sitter_enabled: !current });
                if (!chainSitterRes.ok) {
                    setStatus((chainSitterRes.json && chainSitterRes.json.error) || 'Failed to update chain sitter.', true);
                    return;
                }

                state = state || {};
                state.chain = Object.assign({}, state.chain || {}, chainSitterRes.json || {}, { sitter_enabled: !current });
                renderBody();
                setStatus('Chain sitter updated.', false);
                return;
            }
        } catch (err) {
            setStatus('Action failed: ' + action, true);
        }
    });

    return _handleActionClick.apply(this, arguments);
}
    // ============================================================
    // 23. MAIN RENDER / INPUT BINDINGS
    // ============================================================

    function renderTabsRow(rowId, rows) {
        var host = overlay && overlay.querySelector('#' + rowId);
        if (!host) return;

        host.innerHTML = getVisibleTabs(rows).map(function (pair) {
            var key = pair[0];
            var label = pair[1];
            var active = key === currentTab ? ' active' : '';
            return '<button type="button" class="warhub-tab' + active + '" data-tab="' + esc(key) + '">' + esc(label) + '</button>';
        }).join('');
    }

    function renderCurrentTab() {
        if (!isLoggedIn()) return renderLoginView();

        if (currentTab === 'overview') return renderOverviewTab();
        if (currentTab === 'members') return renderMembersTab();
        if (currentTab === 'enemies') return renderEnemiesTab();
        if (currentTab === 'hospital') return renderHospitalTab();
        if (currentTab === 'chain') return renderChainTab();
        if (currentTab === 'targets') return renderTargetsTab();
        if (currentTab === 'meddeals') return renderMedDealsTab();
        if (currentTab === 'terms') return renderTermsTab();
        if (currentTab === 'faction') return canManageFaction() ? renderFactionTab() : '<div class="warhub-card">Faction tab is leader only.</div>';
        if (currentTab === 'settings') return renderSettingsTab();
        if (currentTab === 'instructions') return renderInstructionsTab();
        if (currentTab === 'admin') return canSeeAdmin() ? renderAdminTab() : '<div class="warhub-card">Admin only.</div>';

        return renderOverviewTab();
    }

    function renderBody() {
        if (!overlay) return;

        renderTabsRow('warhub-tabs-row-1', TAB_ROW_1);
        renderTabsRow('warhub-tabs-row-2', TAB_ROW_2);

        var content = overlay.querySelector('#warhub-content');
        if (content) {
            content.innerHTML = renderCurrentTab();
        }

        renderStatus();

        if (currentTab === 'members' || currentTab === 'enemies' || currentTab === 'hospital' || currentTab === 'faction') {
            startMembersCountdownLoop();
        } else {
            stopMembersCountdownLoop();
        }

        var body = overlay.querySelector('#warhub-body');
        if (body) {
            var scrollTop = Number(GM_getValue(K_OVERLAY_SCROLL, 0) || 0);
            if (Number.isFinite(scrollTop) && scrollTop > 0) {
                body.scrollTop = scrollTop;
            }

            if (!body.__warhubScrollBound) {
                body.__warhubScrollBound = true;
                body.addEventListener('scroll', function () {
                    GM_setValue(K_OVERLAY_SCROLL, body.scrollTop || 0);
                }, { passive: true });
            }
        }
    }

        function renderLiveTabOnly() {
        if (!overlay) return;

        var content = overlay.querySelector('#warhub-content');
        if (content) {
            content.innerHTML = renderCurrentTab();
        }

        renderStatus();

        if (currentTab === 'members' || currentTab === 'enemies' || currentTab === 'hospital' || currentTab === 'faction') {
            startMembersCountdownLoop();
        } else {
            stopMembersCountdownLoop();
        }

        bindDynamicInputs();
    }

    function bindDynamicInputs() {
        if (!overlay) return;

        var membersSearch = overlay.querySelector('#warhub-members-search');
        if (membersSearch && !membersSearch.__warhubBound) {
            membersSearch.__warhubBound = true;
            membersSearch.addEventListener('input', function () {
                GM_setValue('warhub_members_search', String(membersSearch.value || ''));
            });
        }

        var enemiesSearch = overlay.querySelector('#warhub-enemies-search');
        if (enemiesSearch && !enemiesSearch.__warhubBound) {
            enemiesSearch.__warhubBound = true;
            enemiesSearch.addEventListener('input', function () {
                GM_setValue('warhub_enemies_search', String(enemiesSearch.value || ''));
                if (currentTab === 'members' || currentTab === 'enemies') renderBody();
            });
        }

        var factionSearch = overlay.querySelector('#warhub-faction-search');
        if (factionSearch && !factionSearch.__warhubBound) {
            factionSearch.__warhubBound = true;
            factionSearch.addEventListener('input', function () {
                GM_setValue('warhub_faction_search', String(factionSearch.value || ''));
                if (currentTab === 'faction') renderBody();
            });
        }
    }

    var _renderBodyOriginal = renderBody;
    renderBody = function () {
        _renderBodyOriginal();
        bindDynamicInputs();
    };

    // ============================================================
    // 24. REMOUNT / BOOT
    // ============================================================

    function ensureMounted() {
        if (!document.body) return;

        var hasOverlay = !!document.getElementById('warhub-overlay');

        if (!hasOverlay || !overlay) {
            mounted = false;
            shield = null;
            badge = null;
            overlay = null;
            mount();
        }
    }

    function startRemountWatch() {
        if (remountTimer) {
            clearInterval(remountTimer);
            remountTimer = null;
        }

        remountTimer = setInterval(function () {
            try {
                if (!document.body) return;

                if (!document.getElementById('warhub-overlay')) {
                    mounted = false;
                    shield = null;
                    badge = null;
                    overlay = null;
                    ensureMounted();
                    renderBody();
                }
            } catch (err) {
            }
        }, 2000);
    }

    function boot() {
        ensureMounted();
        restartPolling();
        startRemountWatch();

        if (isLoggedIn()) {
            loadState().then(function () {
                renderBody();
            }).catch(function (err) {
                renderBody();
            });
        } else {
            renderBody();
        }
    }


    window.__FRIES_WARHUB_BRIDGE__ = {
        open: function () {
            try { setOverlayOpen(true); } catch (e) {
                try {
                    isOpen = true;
                    if (overlay) overlay.classList.add('open');
                    renderBody();
                } catch (_e) {}
            }
        },
        close: function () {
            try { setOverlayOpen(false); } catch (e) {
                try {
                    isOpen = false;
                    if (overlay) overlay.classList.remove('open');
                } catch (_e) {}
            }
        },
        toggle: function () {
            try { setOverlayOpen(!isOpen); } catch (e) {
                try {
                    if (overlay) overlay.classList.toggle('open');
                    isOpen = !!(overlay && overlay.classList.contains('open'));
                    renderBody();
                } catch (_e) {}
            }
        },
        overlayEl: function () { return overlay; },
        shieldEl: function () { return shield; }
    };

    boot();

})();

/* ===== Embedded Sinner's Insurance module ===== */

// ==UserScript==
// @name         Sinner's Insurance 7DS
// @namespace    fries91-xanax-insurance
// @version      4.0.3
// @description  Sinner's Insurance
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_deleteValue
// @updateURL    https://raw.githubusercontent.com/Fries91/xanax-insurance/main/static/xanax-insurance.user.js
// @downloadURL  https://raw.githubusercontent.com/Fries91/xanax-insurance/main/static/xanax-insurance.user.js
// @connect      xanax-insurance.onrender.com
// @connect      api.torn.com
// ==/UserScript==

(function () {
    'use strict';

    var launcher = null;
    var overlay = null;
    var backdrop = null;
    var remountTimer = null;
    var historyLoading = false;
    var warTabLoading = false;
    var warTabEnabled = !!gv('si_war_tab_enabled', 0);
    var warTabUpdatedAt = gv('si_war_tab_updated_at', '');
    var warTabUpdatedBy = gv('si_war_tab_updated_by', '');
    var warTabViewerCanManage = false;

    var activeTab = gv('si_active_tab', 'rules');
    var selectedPlan = gv('si_selected_plan', 'None');
    var sessionRole = gv('si_session_role', 'guest');
    var sessionName = gv('si_session_name', 'Guest');
    var claimStatus = gv('si_claim_status', 'Not submitted');
    var claimNote = gv('si_claim_note', '');
    var claimLoss = gv('si_claim_loss', '');
    var claimProof = gv('si_claim_proof', '');
    var claimStack = gv('si_claim_stack', '');
    var claimHistory = gv('si_claim_history', '[]');
    var claimId = gv('si_claim_id', '');
    var payoutAmount = gv('si_payout_amount', '');
    var decisionNote = gv('si_decision_note', '');
    var claimsDb = gv('si_claims_db', '[]');
    var selectedClaimId = gv('si_selected_claim_id', '');
    var claimFilterStatus = gv('si_claim_filter_status', 'all');
    var claimFilterMember = gv('si_claim_filter_member', '');
    var claimSortMode = gv('si_claim_sort_mode', 'newest');
    var apiBase = gv('si_api_base', 'https://xanax-insurance.onrender.com');
    var syncSecret = gv('si_sync_secret', '6282');
    var backendStatus = gv('si_backend_status', 'Not tested');
    var lastSyncAt = gv('si_last_sync_at', 'Never');
    var finVerifiedXanax = Number(gv('si_fin_verified_xanax', 0) || 0);
    var finFactionCut = Number(gv('si_fin_faction_cut', 0) || 0);
    var finPool = Number(gv('si_fin_pool', 0) || 0);
    var finReceiptCount = Number(gv('si_fin_receipt_count', 0) || 0);
    var finMemberPayCount = Number(gv('si_fin_member_pay_count', 0) || 0);
    var finPayoutCount = Number(gv('si_fin_payout_count', 0) || 0);
    var financeLoading = false;
    var adminApiKey = gv('si_admin_api_key', '');
    var memberApiKey = gv('si_member_api_key', '');
    var singleApiKey = gv('si_single_api_key', gv('si_member_api_key', ''));
    var factionIdLock = gv('si_faction_id_lock', '49384');
    var authMode = gv('si_auth_mode', 'local');
    var settingsNotice = gv('si_settings_notice', 'Waiting for API key save or login.');
    var autoLoginTriedAt = gv('si_auto_login_tried_at', '');
    var autoLoginBusy = false;
    var xanaxRequestTotalOwed = Number(gv('si_xr_total_owed', 0) || 0);
    var xanaxRequestRequested = !!gv('si_xr_requested', 0);
    var xanaxRequestRequestedAt = gv('si_xr_requested_at', '');
    var xanaxRequestRequestedBy = gv('si_xr_requested_by', '');
    var xanaxRequestSentAt = gv('si_xr_sent_at', '');
    var xanaxRequestSentBy = gv('si_xr_sent_by', '');
    var xanaxRequestResetAt = gv('si_xr_reset_at', '');
    var xanaxRequestResetBy = gv('si_xr_reset_by', '');
    var xanaxRequestStatus = gv('si_xr_status', 'idle');
    var xanaxRequestViewerCanRequest = false;
    var xanaxRequestViewerIsAdmin = false;
    var alertUnreadClaims = Number(gv('si_alert_unread_claims', 0) || 0);
    var alertPendingActivations = Number(gv('si_alert_pending_activations', 0) || 0);
    var activationsDb = gv('si_activations_db', '[]');
    var selectedActivationId = gv('si_selected_activation_id', '');
    var activationNotice = gv('si_activation_notice', '');

    var scanTimer = null;
    var activeCoverageEnabled = !!gv('si_active_coverage_enabled', 0);
    var activeCoveragePlan = gv('si_active_coverage_plan', '');
    var activeCoverageStage = gv('si_active_coverage_stage', '');
    var activeCoverageArmedAt = gv('si_active_coverage_armed_at', '');
    var activeCoverageExpiresAt = gv('si_active_coverage_expires_at', '');
    var activeCoverageDetectStatus = gv('si_active_coverage_detect_status', 'idle');
    var activeCoverageLastCheckAt = gv('si_active_coverage_last_check_at', '');
    var activeCoverageLastEventKey = gv('si_active_coverage_last_event_key', '');
    var activeCoverageLastClaimId = gv('si_active_coverage_last_claim_id', '');
    var activeCoverageAutoSubmittedAt = gv('si_active_coverage_auto_submitted_at', '');
    var activeCoverageArmedEnergy = gv('si_active_coverage_armed_energy', '');
    var activeCoverageArmedBoosterCd = gv('si_active_coverage_armed_booster_cd', '');
    var activeCoverageRuleCheck = gv('si_active_coverage_rule_check', '');

    var PLANS = [
        {
            name: 'Pride',
            coverage: '6 Xanax',
            payment: '2 Xanax',
            window: '30 mins',
            payout: '6 Xanax',
            stackType: 'any',
            rule: 'Can start with any amount of energy.',
            oldRows: [
                ['Payment', '2 Xanax'],
                ['Window', '30 mins'],
                ['Payout', '6 Xanax']
            ]
        },
        {
            name: 'Envy',
            coverage: '25 Xanax + 3 E-DVD',
            payment: '5 Xanax',
            window: '30 mins',
            payout: '10 Xanax + 2 E-DVD',
            stackType: 'mixed',
            rule: 'Use for approved Envy claims only.',
            oldRows: [
                ['Payment', '5 Xanax'],
                ['Window', '30 mins'],
                ['Payout', '10 Xanax + 2 E-DVD']
            ]
        },
        {
            name: 'Wrath',
            coverage: 'Stage based',
            payment: '2 Xanax each stage',
            window: '30 mins each stage',
            payout: '4 / 5 / 6 / 8 Xanax',
            stackType: 'xanax',
            rule: 'Each stage has a required starting energy amount and must be armed on the matching stage.',
            stages: [
                { stage: 'Stage 1', coverage: '5 Xanax', payment: '2 Xanax', payout: '4 Xanax', terms: 'Start at 0 energy', window: '30 mins' },
                { stage: 'Stage 2', coverage: '10 Xanax', payment: '2 Xanax', payout: '5 Xanax', terms: 'Start at 250 energy', window: '30 mins' },
                { stage: 'Stage 3', coverage: '15 Xanax', payment: '2 Xanax', payout: '6 Xanax', terms: 'Start at 500 energy', window: '30 mins' },
                { stage: 'Stage 4', coverage: '20 Xanax', payment: '2 Xanax', payout: '8 Xanax', terms: 'Start at 750 energy', window: '30 mins' }
            ],
            oldRows: [
                ['Payment', '2 Xanax each stage'],
                ['Window', '30 mins each stage'],
                ['Payout', '4 / 5 / 6 / 8 Xanax']
            ]
        }
    ];


    function gv(key, fallback) {
        try {
            return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function sv(key, value) {
        try {
            if (typeof GM_setValue === 'function') GM_setValue(key, value);
        } catch (e) {}
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function saveSession() {
        sv('si_active_tab', activeTab || 'overview');
        sv('si_selected_plan', selectedPlan || 'None');
        sv('si_session_role', sessionRole || 'guest');
        sv('si_session_name', sessionName || 'Guest');
        sv('si_claim_status', claimStatus || 'Not submitted');
        sv('si_claim_note', claimNote || '');
        sv('si_claim_loss', claimLoss || '');
        sv('si_claim_proof', claimProof || '');
        sv('si_claim_stack', claimStack || '');
        sv('si_claim_history', claimHistory || '[]');
        sv('si_claim_id', claimId || '');
        sv('si_payout_amount', payoutAmount || '');
        sv('si_decision_note', decisionNote || '');
        sv('si_claims_db', claimsDb || '[]');
        sv('si_selected_claim_id', selectedClaimId || '');
        sv('si_claim_filter_status', claimFilterStatus || 'all');
        sv('si_claim_filter_member', claimFilterMember || '');
        sv('si_claim_sort_mode', claimSortMode || 'newest');
        sv('si_api_base', apiBase || '');
        sv('si_sync_secret', syncSecret || '');
        sv('si_backend_status', backendStatus || 'Not tested');
        sv('si_last_sync_at', lastSyncAt || 'Never');
        sv('si_fin_verified_xanax', finVerifiedXanax || 0);
        sv('si_fin_faction_cut', finFactionCut || 0);
        sv('si_fin_pool', finPool || 0);
        sv('si_fin_receipt_count', finReceiptCount || 0);
        sv('si_fin_member_pay_count', finMemberPayCount || 0);
        sv('si_fin_payout_count', finPayoutCount || 0);
        sv('si_admin_api_key', adminApiKey || '');
        sv('si_member_api_key', memberApiKey || '');
        sv('si_single_api_key', singleApiKey || '');
        sv('si_faction_id_lock', factionIdLock || '');
        sv('si_auth_mode', authMode || 'local');
        sv('si_settings_notice', settingsNotice || '');
        sv('si_auto_login_tried_at', autoLoginTriedAt || '');
        sv('si_xr_total_owed', xanaxRequestTotalOwed || 0);
        sv('si_xr_requested', xanaxRequestRequested ? 1 : 0);
        sv('si_xr_requested_at', xanaxRequestRequestedAt || '');
        sv('si_xr_requested_by', xanaxRequestRequestedBy || '');
        sv('si_xr_sent_at', xanaxRequestSentAt || '');
        sv('si_xr_sent_by', xanaxRequestSentBy || '');
        sv('si_xr_reset_at', xanaxRequestResetAt || '');
        sv('si_xr_reset_by', xanaxRequestResetBy || '');
        sv('si_xr_status', xanaxRequestStatus || 'idle');
        sv('si_alert_unread_claims', alertUnreadClaims || 0);
        sv('si_alert_pending_activations', alertPendingActivations || 0);
        sv('si_activations_db', activationsDb || '[]');
        sv('si_selected_activation_id', selectedActivationId || '');
        sv('si_activation_notice', activationNotice || '');
        sv('si_active_coverage_enabled', activeCoverageEnabled ? 1 : 0);
        sv('si_active_coverage_plan', activeCoveragePlan || '');
        sv('si_active_coverage_stage', activeCoverageStage || '');
        sv('si_active_coverage_armed_at', activeCoverageArmedAt || '');
        sv('si_active_coverage_expires_at', activeCoverageExpiresAt || '');
        sv('si_active_coverage_detect_status', activeCoverageDetectStatus || 'idle');
        sv('si_active_coverage_last_check_at', activeCoverageLastCheckAt || '');
        sv('si_active_coverage_last_event_key', activeCoverageLastEventKey || '');
        sv('si_active_coverage_last_claim_id', activeCoverageLastClaimId || '');
        sv('si_active_coverage_auto_submitted_at', activeCoverageAutoSubmittedAt || '');
        sv('si_active_coverage_armed_energy', activeCoverageArmedEnergy || '');
        sv('si_active_coverage_armed_booster_cd', activeCoverageArmedBoosterCd || '');
        sv('si_active_coverage_rule_check', activeCoverageRuleCheck || '');
        sv('si_war_tab_enabled', warTabEnabled ? 1 : 0);
        sv('si_war_tab_updated_at', warTabUpdatedAt || '');
        sv('si_war_tab_updated_by', warTabUpdatedBy || '');
    }

    function isAdmin() {
        return sessionRole === 'admin';
    }

    function isMember() {
        return sessionRole === 'member' || sessionRole === 'admin';
    }

    function canManageWarStackUi() {
        return sessionRole === 'admin' || sessionRole === 'leader' || sessionRole === 'co-leader';
    }

    function canSeeClaimsUi() {
        return sessionRole === 'admin';
    }

    function canSeeActivationsUi() {
        return sessionRole === 'admin';
    }

    function canSeeXanaxRequestUi() {
        return sessionRole === 'admin' || sessionRole === 'leader';
    }

    function maskApiKeyForDisplay(value) {
        var v = String(value || '');
        if (!v) return '';
        if (v.length <= 4) return '****';
        return Array(Math.max(4, v.length - 4) + 1).join('*') + v.slice(-4);
    }

    function getPlanByName(name) {
        return PLANS.find(function (p) { return p.name === name; }) || null;
    }

    function getPlanRuleText(name) {
        var p = getPlanByName(name);
        return p ? p.rule : 'No plan selected.';
    }

    function getGreedPlanData() {
        return {
            name: 'Greed',
            coverage: '1 Feathery Hotel Coupon',
            payment: '1 Xanax',
            window: '30 mins',
            payout: '1 Feathery Hotel Coupon',
            terms: [
                'Greed Terms:',
                'Any energy.',
                'Payment: 1 Xanax.',
                'Payout: 1 Feathery Hotel Coupon.',
                'Window: 30 mins.',
                'Only available when War Stack is activated.'
            ].join('\n')
        };
    }

    function getDetailedPlanTerms(name) {
        var p = getPlanByName(name);
        if (!p) return 'No plan selected.';
        if (name === 'Wrath' && p.stages && p.stages.length) {
            return [
                'Wrath Terms:',
                'Window: 30 mins for every stage.',
                'Payment: 2 Xanax per stage.',
                'Stage 1 payout: 4 Xanax | Terms: Start at 0 energy.',
                'Stage 2 payout: 5 Xanax | Terms: Start at 250 energy.',
                'Stage 3 payout: 6 Xanax | Terms: Start at 500 energy.',
                'Stage 4 payout: 8 Xanax | Terms: Start at 750 energy.'
            ].join('\n');
        }
        if (name === 'Envy') {
            return [
                'Envy Terms:',
                'Use for approved Envy claims only.',
                'Must start with 1000 energy.',
                'Must start with 0 booster cool down.',
                'Can use Wrath for stack.',
                'Payout: 10 Xanax + 2 E-DVD.',
                'Payment: 5 Xanax.',
                'Window: 30 mins.'
            ].join('\n');
        }
        if (name === 'Pride') {
            return [
                'Pride Terms:',
                'Payout: 6 Xanax.',
                'Payment: 2 Xanax.',
                'Window: 30 mins.',
                p.rule
            ].join('\n');
        }
        return p.rule;
    }

    function getPayoutGuide(name) {
        var p = getPlanByName(name);
        return p ? p.payout : 'Admin review';
    }

    function stackMatchesPlan(name, stackText) {
        var p = getPlanByName(name);
        if (!p) return true;
        var s = String(stackText || '').toLowerCase();
        if (p.stackType === 'any') return true;
        if (p.stackType === 'xanax') return s.indexOf('xanax') >= 0;
        if (p.stackType === 'mixed') return s.indexOf('xanax') >= 0 || s.indexOf('dvd') >= 0 || s.indexOf('edvd') >= 0;
        return true;
    }


    function toMs(value) {
        var t = Date.parse(String(value || ''));
        return isNaN(t) ? 0 : t;
    }

    function nowMs() {
        return Date.now();
    }

    function formatDateTime(value) {
        var ms = toMs(value);
        return ms ? new Date(ms).toLocaleString() : 'Not set';
    }

    function formatRemaining(ms) {
        ms = Number(ms || 0);
        if (ms <= 0) return 'Expired';
        var total = Math.floor(ms / 1000);
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
        return m + 'm ' + s + 's';
    }

    function getPlanStackLabel(name) {
        var p = getPlanByName(name);
        if (!p) return 'Unknown';
        if (p.stackType === 'xanax') return 'Xanax';
        if (p.stackType === 'mixed') return 'Mixed';
        return 'Any';
    }

    function getPlanWindowMinutes(name, stageName) {
        return 30;
    }

    function getPlanPayoutText(name, stageName) {
        if (name === 'Wrath') {
            var p = getPlanByName(name);
            if (p && p.stages) {
                var s = p.stages.find(function (x) { return x.stage === stageName; }) || p.stages[0];
                if (s) return s.payout;
            }
        }
        return getPayoutGuide(name);
    }

    function getPlanRuleForActivation(name, stageName) {
        if (name === 'Wrath') {
            var p = getPlanByName(name);
            if (p && p.stages) {
                var s = p.stages.find(function (x) { return x.stage === stageName; }) || p.stages[0];
                if (s) return 'Wrath active - ' + s.stage + '. ' + s.terms + '.';
            }
            return 'Wrath active.';
        }
        return getPlanRuleText(name);
    }

    function currentCoverageRemainingMs() {
        return Math.max(0, toMs(activeCoverageExpiresAt) - nowMs());
    }

    function isCoverageActive() {
        if (!activeCoverageEnabled) return false;
        var expires = toMs(activeCoverageExpiresAt);
        return !!expires && expires > nowMs();
    }

    function clearCoverageState(reason) {
        activeCoverageEnabled = false;
        activeCoveragePlan = '';
        activeCoverageStage = '';
        activeCoverageArmedAt = '';
        activeCoverageExpiresAt = '';
        activeCoverageDetectStatus = reason || 'idle';
        activeCoverageArmedEnergy = '';
        activeCoverageArmedBoosterCd = '';
        activeCoverageRuleCheck = '';
        saveSession();
    }

    function armPlanCoverage(name, stageName) {
        if (!isMember()) {
            window.alert('Log in first.');
            return;
        }
        if (!name || name === 'None') {
            window.alert('Select a plan first.');
            return;
        }

        var payment = getRequiredPaymentForPlan(name, stageName);
        var paymentNote = window.prompt('Enter payment sent note / proof for ' + name + (stageName ? ' ' + stageName : '') + '\nRequired: ' + payment.qty + ' ' + payment.item, '') || '';

        var now = new Date();
        var mins = getPlanWindowMinutes(name, stageName);
        var expiry = new Date(now.getTime() + (mins * 60000));

        selectedPlan = name;
        activeCoverageEnabled = true;
        activeCoveragePlan = name;
        activeCoverageStage = stageName || '';
        activeCoverageArmedAt = now.toISOString();
        activeCoverageExpiresAt = expiry.toISOString();
        activeCoverageDetectStatus = 'armed-pending-verification';
        activeCoverageLastCheckAt = '';
        activeCoverageLastEventKey = '';
        activeCoverageLastClaimId = '';
        activeCoverageAutoSubmittedAt = '';
        activeCoverageArmedEnergy = '';
        activeCoverageArmedBoosterCd = '';
        activeCoverageRuleCheck = getPlanRuleForActivation(name, stageName);

        var activationId = makeActivationId();
        activationNotice = 'Activation requested. Waiting for admin payment verification.';
        upsertActivationLocal({
            id: activationId,
            member: sessionName || 'Member',
            memberId: '',
            plan: name,
            stage: stageName || '',
            status: 'Pending verification',
            requiredPaymentItem: payment.item,
            requiredPaymentQty: payment.qty,
            paymentNote: paymentNote,
            memberPaymentVerified: 0,
            adminReceiptVerified: 0,
            reviewedBy: '',
            reviewNote: '',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        });
        saveSession();
        renderOverlay();
        maybeAutoLogin(false);
        pushActivation('member_request', {
            id: activationId,
            plan: name,
            stage: stageName || '',
            paymentNote: paymentNote
        });
        window.alert(name + (stageName ? ' ' + stageName : '') + ' armed for ' + mins + ' minutes. Verification request sent to admin.');
        runCoverageScan();
    }

    function cancelCoverageState() {
        clearCoverageState('cancelled');
        renderOverlay();
    }

    function parseScanTimestamp(entry) {
        var candidates = [
            entry && entry.timestamp,
            entry && entry.started,
            entry && entry.time,
            entry && entry.createdAt,
            entry && entry.at
        ];
        for (var i = 0; i < candidates.length; i += 1) {
            var v = candidates[i];
            if (typeof v === 'number' && isFinite(v)) {
                return v > 1000000000000 ? v : (v * 1000);
            }
            var ms = toMs(v);
            if (ms) return ms;
        }
        return 0;
    }

    function collectLogEntries(data) {
        var out = [];
        function pushOne(key, entry) {
            if (!entry) return;
            var text = '';
            if (typeof entry === 'string') text = entry;
            if (!text) text = [entry.title, entry.type, entry.text, entry.description, entry.details, entry.reason, entry.message].filter(Boolean).join(' | ');
            out.push({
                key: String(key || entry.id || parseScanTimestamp(entry) || out.length),
                text: String(text || ''),
                timestampMs: parseScanTimestamp(entry),
                raw: entry
            });
        }

        var sources = [data && data.log, data && data.logs, data && data.events, data && data.event];
        sources.forEach(function (src) {
            if (!src) return;
            if (Array.isArray(src)) {
                src.forEach(function (entry, idx) { pushOne(idx, entry); });
            } else if (typeof src === 'object') {
                Object.keys(src).forEach(function (key) { pushOne(key, src[key]); });
            }
        });
        return out;
    }

    function findOdLikeEvent(data) {
        var armedAtMs = toMs(activeCoverageArmedAt);
        var expiryMs = toMs(activeCoverageExpiresAt);
        var logEntries = collectLogEntries(data);
        for (var i = 0; i < logEntries.length; i += 1) {
            var item = logEntries[i];
            var txt = String(item.text || '').toLowerCase();
            if (txt.indexOf('overdose') >= 0 || txt.indexOf('overdosed') >= 0 || txt.indexOf('over dos') >= 0 || txt.indexOf('rehab') >= 0) {
                var ts = item.timestampMs || nowMs();
                if (ts >= armedAtMs && ts <= expiryMs) return item;
            }
        }

        var profile = data && (data.profile || data.user || data.player || data);
        var status = profile && profile.status;
        var statusText = [
            status && status.description,
            status && status.details,
            status && status.state,
            status && status.reason,
            profile && profile.status_description,
            profile && profile.status_details
        ].filter(Boolean).join(' | ').toLowerCase();

        if (statusText.indexOf('overdose') >= 0 || statusText.indexOf('overdosed') >= 0) {
            return {
                key: 'status-' + Math.floor(nowMs() / 30000),
                text: statusText || 'Status indicates overdose.',
                timestampMs: nowMs(),
                raw: status || {}
            };
        }

        return null;
    }

    function fetchTornScanData(apiKey) {
        if (!apiKey) return Promise.resolve(null);
        var url = 'https://api.torn.com/user/?selections=profile,log&key=' + encodeURIComponent(apiKey);
        return new Promise(function (resolve) {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: function (res) {
                        try { resolve(JSON.parse(res.responseText || '{}')); } catch (e) { resolve(null); }
                    },
                    onerror: function () { resolve(null); }
                });
                return;
            }
            fetch(url).then(function (r) { return r.json(); }).then(resolve).catch(function () { resolve(null); });
        });
    }

    function createAutoDetectedClaim(eventInfo) {
        if (!eventInfo || activeCoverageLastEventKey === String(eventInfo.key || '')) return;
        if (!isCoverageActive()) return;

        var payoutText = getPlanPayoutText(activeCoveragePlan, activeCoverageStage);
        var proofText = 'Auto OD detect | ' + formatDateTime(new Date(eventInfo.timestampMs || nowMs()).toISOString()) + ' | ' + String(eventInfo.text || 'OD event');
        claimId = makeClaimId();
        selectedClaimId = claimId;
        selectedPlan = activeCoveragePlan || selectedPlan;
        claimStatus = 'Pending review';
        claimNote = 'Auto-detected OD during active ' + activeCoveragePlan + (activeCoverageStage ? ' ' + activeCoverageStage : '') + ' window.';
        claimLoss = payoutText;
        claimProof = proofText;
        claimStack = getPlanStackLabel(activeCoveragePlan);
        payoutAmount = '';
        decisionNote = '';
        activeCoverageDetectStatus = 'auto-claim-submitted';
        activeCoverageLastEventKey = String(eventInfo.key || '');
        activeCoverageLastClaimId = claimId;
        activeCoverageAutoSubmittedAt = new Date().toISOString();
        upsertCurrentClaim();
        addHistory('Auto-detected OD and created claim ' + claimId + '.');
        saveSession();
        pushCurrentClaimToBackend('auto_detect');
        renderOverlay();
    }

    function runCoverageScan() {
        if (!isCoverageActive()) {
            if (activeCoverageEnabled && currentCoverageRemainingMs() <= 0) {
                clearCoverageState('expired');
                renderOverlay();
            }
            return Promise.resolve(null);
        }

        if (!singleApiKey) return Promise.resolve(null);
        activeCoverageLastCheckAt = new Date().toISOString();
        activeCoverageDetectStatus = 'scanning';
        saveSession();

        return fetchTornScanData(singleApiKey).then(function (data) {
            if (!data) {
                activeCoverageDetectStatus = 'scan-failed';
                saveSession();
                return null;
            }

            var found = findOdLikeEvent(data);
            if (found) {
                createAutoDetectedClaim(found);
            } else {
                activeCoverageDetectStatus = 'clear';
                saveSession();
                renderOverlay();
            }
            return found;
        });
    }

    function ensureCoverageTimer() {
        if (scanTimer) return;
        scanTimer = setInterval(function () {
            if (isCoverageActive()) {
                runCoverageScan();
                renderOverlay();
            } else if (activeCoverageEnabled && currentCoverageRemainingMs() <= 0) {
                clearCoverageState('expired');
                renderOverlay();
            }
        }, 30000);
    }

    function getClaimsDbItems() {
        try {
            var arr = JSON.parse(claimsDb || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveClaimsDbItems(arr) {
        claimsDb = JSON.stringify(Array.isArray(arr) ? arr : []);
        saveSession();
    }

    function getClaimHistoryItems() {
        try {
            var arr = JSON.parse(claimHistory || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory(items) {
        claimHistory = JSON.stringify(Array.isArray(items) ? items : []);
        saveSession();
    }


    function getActivationsDbItems() {
        try {
            var arr = JSON.parse(activationsDb || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveActivationsDbItems(arr) {
        activationsDb = JSON.stringify(Array.isArray(arr) ? arr : []);
        saveSession();
    }

    function makeActivationId() {
        return 'ACT-' + String(Date.now()).slice(-8);
    }

    function getRequiredPaymentForPlan(name, stageName) {
        var plan = String(name || '').toLowerCase();
        if (plan === 'pride') return { item: 'Xanax', qty: '2' };
        if (plan === 'envy') return { item: 'Xanax', qty: '5' };
        if (plan === 'wrath') return { item: 'Xanax', qty: '2' };
        if (plan === 'greed') return { item: 'Xanax', qty: '1' };
        return { item: 'Xanax', qty: '0' };
    }

    function upsertActivationLocal(rec) {
        var items = getActivationsDbItems();
        var idx = items.findIndex(function (x) { return x && x.id === rec.id; });
        if (idx >= 0) items[idx] = rec; else items.unshift(rec);
        selectedActivationId = rec.id || selectedActivationId;
        saveActivationsDbItems(items.slice(0, 100));
    }

    function fetchAlertsState() {
        if (!syncSecret) return Promise.resolve(null);
        return apiRequest('POST', '/api/alerts/state', { secret: syncSecret, auth: buildServerAuthPayload() }).then(function (data) {
            var st = data && data.state;
            if (st) {
                alertUnreadClaims = Number(st.unreadClaims || 0);
                alertPendingActivations = Number(st.pendingActivations || 0);
                saveSession();
                renderOverlay();
            }
            return data;
        }).catch(function () { return null; });
    }

    function fetchActivations() {
        if (!syncSecret) return Promise.resolve(null);
        return apiRequest('POST', '/api/activations/pull', { secret: syncSecret, auth: buildServerAuthPayload() }).then(function (data) {
            if (data && Array.isArray(data.activations)) {
                saveActivationsDbItems(data.activations);
                if (!selectedActivationId && data.activations.length) selectedActivationId = data.activations[0].id || '';
                fetchAlertsState();
                renderOverlay();
            }
            return data;
        }).catch(function () { return null; });
    }

    function pushActivation(action, activation) {
        return apiRequest('POST', '/api/activations/push', {
            secret: syncSecret,
            action: action,
            auth: buildServerAuthPayload(),
            activation: activation || {}
        }).then(function (data) {
            if (data && data.activation) {
                upsertActivationLocal(data.activation);
                fetchAlertsState();
                renderOverlay();
            }
            return data;
        }).catch(function () { return null; });
    }

    function addHistory(text) {
        var arr = getClaimHistoryItems();
        arr.unshift({ at: new Date().toLocaleString(), text: text });
        saveHistory(arr.slice(0, 20));
    }

    function makeClaimId() {
        return 'SIN-' + String(Date.now()).slice(-8);
    }

    function getSelectedClaimRecord() {
        var items = getClaimsDbItems();
        var rec = items.find(function (item) { return item && item.id === selectedClaimId; });
        if (rec) return rec;
        if (items.length) {
            selectedClaimId = items[0].id || '';
            return items[0];
        }
        return null;
    }

    function syncFromSelectedClaim() {
        var rec = getSelectedClaimRecord();
        if (!rec) return;
        claimId = rec.id || '';
        selectedClaimId = rec.id || '';
        selectedPlan = rec.plan || selectedPlan || 'None';
        claimStatus = rec.status || 'Not submitted';
        claimNote = rec.note || '';
        claimLoss = rec.loss || '';
        claimProof = rec.proof || '';
        claimStack = rec.stack || '';
        payoutAmount = rec.payout || '';
        decisionNote = rec.decision || '';
    }

    function upsertCurrentClaim() {
        if (!claimId) return;
        var items = getClaimsDbItems();
        var idx = items.findIndex(function (item) { return item && item.id === claimId; });
        var rec = {
            id: claimId,
            member: sessionName || 'Guest',
            plan: selectedPlan || 'None',
            status: claimStatus || 'Not submitted',
            note: claimNote || '',
            loss: claimLoss || '',
            proof: claimProof || '',
            stack: claimStack || '',
            payout: payoutAmount || '',
            decision: decisionNote || '',
            updatedAt: new Date().toLocaleString()
        };
        if (idx >= 0) items[idx] = rec;
        else items.unshift(rec);
        selectedClaimId = claimId;
        saveClaimsDbItems(items.slice(0, 50));
    }

    function getStatusSortRank(status) {
        var s = String(status || '');
        if (s === 'Pending review') return 1;
        if (s === 'Under review') return 2;
        if (s === 'Approved') return 3;
        if (s === 'Denied') return 4;
        if (s === 'Paid') return 5;
        return 99;
    }

    function sortClaimsItems(items) {
        var arr = items.slice();
        arr.sort(function (a, b) {
            var mode = String(claimSortMode || 'newest');
            if (mode === 'oldest') return String(a && a.id || '').localeCompare(String(b && b.id || ''));
            if (mode === 'member_az') {
                var byMember = String(a && a.member || '').localeCompare(String(b && b.member || ''));
                if (byMember !== 0) return byMember;
            }
            if (mode === 'status') {
                var byStatus = getStatusSortRank(a && a.status) - getStatusSortRank(b && b.status);
                if (byStatus !== 0) return byStatus;
            }
            return String(b && b.id || '').localeCompare(String(a && a.id || ''));
        });
        return arr;
    }

    function getRecentMemberClaims(limit) {
        limit = Number(limit || 5) || 5;
        var name = String(sessionName || '').toLowerCase();
        return getClaimsDbItems()
            .filter(function (item) {
                return item && String(item.member || '').toLowerCase() === name;
            })
            .slice(0, limit);
    }

    function getFilteredClaimsDbItems() {
        var filtered = getClaimsDbItems().filter(function (item) {
            if (!item) return false;
            var statusOk = claimFilterStatus === 'all' || String(item.status || '') === String(claimFilterStatus || '');
            var needle = String(claimFilterMember || '').trim().toLowerCase();
            var member = String(item.member || '').toLowerCase();
            var memberOk = !needle || member.indexOf(needle) >= 0;
            return statusOk && memberOk;
        });

        filtered = sortClaimsItems(filtered);

        if (isMember() && !isAdmin()) {
            filtered = filtered.filter(function (item) {
                return String(item && item.member || '').toLowerCase() === String(sessionName || '').toLowerCase();
            });
        }

        return filtered;
    }

    function getMemberClaimSummary() {
        var items = getClaimsDbItems();
        var total = items.length;
        var pending = 0;
        var approved = 0;
        var denied = 0;
        var paid = 0;
        var payouts = 0;
        var names = {};

        items.forEach(function (x) {
            var st = String(x && x.status || '');
            if (st === 'Pending review' || st === 'Under review') pending += 1;
            if (st === 'Approved') approved += 1;
            if (st === 'Denied') denied += 1;
            if (st === 'Paid') paid += 1;
            var n = String(x && x.member || '').trim();
            if (n) names[n.toLowerCase()] = true;
            var p = String(x && x.payout || '').replace(/[^0-9.-]/g, '');
            payouts += Number(p || 0) || 0;
        });

        return {
            total: total,
            pending: pending,
            approved: approved,
            denied: denied,
            paid: paid,
            members: Object.keys(names).length,
            payouts: payouts
        };
    }


    function getScriptUsersCount() {
        var names = {};

        getClaimsDbItems().forEach(function (item) {
            var n = String(item && item.member || '').trim().toLowerCase();
            if (n) names[n] = true;
        });

        getActivationsDbItems().forEach(function (item) {
            var n = String(item && item.member || '').trim().toLowerCase();
            if (n) names[n] = true;
        });

        var current = String(sessionName || '').trim().toLowerCase();
        if (current && current !== 'guest') names[current] = true;

        return Object.keys(names).length;
    }

    function apiRequest(method, path, payload) {
        var url = String(apiBase || '').replace(/\/$/, '') + path;

        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise(function (resolve, reject) {
                GM_xmlhttpRequest({
                    method: method,
                    url: url,
                    headers: { 'Content-Type': 'application/json' },
                    data: payload ? JSON.stringify(payload) : undefined,
                    onload: function (res) {
                        try {
                            resolve(JSON.parse(res.responseText || '{}'));
                        } catch (e) {
                            resolve({});
                        }
                    },
                    onerror: reject
                });
            });
        }

        return fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: payload ? JSON.stringify(payload) : undefined
        }).then(function (res) { return res.json(); });
    }

    function buildServerAuthPayload() {
        return {
            mode: authMode || 'local',
            admin_api_key: adminApiKey || singleApiKey || '',
            api_key: memberApiKey || singleApiKey || '',
            faction_id: factionIdLock || ''
        };
    }

    function testBackendConnection() {
        return apiRequest('GET', '/api/health', null).then(function (data) {
            backendStatus = data && data.ok ? 'Connected' : 'Health check failed';
            lastSyncAt = new Date().toLocaleString();
            saveSession();
            renderOverlay();
            return data;
        }).catch(function () {
            backendStatus = 'Connection failed';
            lastSyncAt = new Date().toLocaleString();
            saveSession();
            renderOverlay();
            return null;
        });
    }

    function syncClaimsFromBackend() {
        if (!syncSecret) {
            window.alert('Enter Sync Secret first.');
            return Promise.resolve(null);
        }
        return apiRequest('POST', '/api/claims/pull', { secret: syncSecret }).then(function (data) {
            if (data && Array.isArray(data.claims)) {
                saveClaimsDbItems(data.claims);
                if (!selectedClaimId && data.claims.length) selectedClaimId = data.claims[0].id || '';
                syncFromSelectedClaim();
                backendStatus = 'Claims pulled';
                lastSyncAt = new Date().toLocaleString();
                saveSession();
                renderOverlay();
            }
            return data;
        }).catch(function () {
            backendStatus = 'Pull failed';
            lastSyncAt = new Date().toLocaleString();
            saveSession();
            renderOverlay();
            return null;
        });
    }


    function fetchFinancialSummary() {
        if (!syncSecret || financeLoading) return Promise.resolve(null);
        financeLoading = true;
        return apiRequest('POST', '/api/overview/financial-summary', {
            secret: syncSecret,
            auth: buildServerAuthPayload()
        }).then(function (data) {
            financeLoading = false;
            var summary = data && data.summary;
            if (summary) {
                finVerifiedXanax = Number(summary.verified_xanax_in || 0);
                finFactionCut = Number(summary.faction_cut_xanax || 0);
                finPool = Number(summary.insurance_pool_xanax || 0);
                finReceiptCount = Number(summary.verified_receipts_count || 0);
                finMemberPayCount = Number(summary.member_payment_verified_count || 0);
                finPayoutCount = Number(summary.admin_payout_verified_count || 0);
                backendStatus = 'Payments loaded';
                lastSyncAt = new Date().toLocaleString();
                saveSession();
                renderOverlay();
            }
            return data;
        }).catch(function () {
            financeLoading = false;
            return null;
        });
    }

    function fetchWarTabState() {
        if (!syncSecret || warTabLoading) return Promise.resolve(null);
        warTabLoading = true;
        return apiRequest('POST', '/api/warstack/state', {
            secret: syncSecret,
            auth: buildServerAuthPayload()
        }).then(function (data) {
            warTabLoading = false;
            var state = data && (data.state || data.warstack);
            if (state) {
                warTabEnabled = !!state.enabled;
                warTabUpdatedAt = state.updatedAt || '';
                warTabUpdatedBy = state.updatedAt ? (state.updatedBy || '') : (state.updatedBy || '');
                warTabViewerCanManage = !!state.viewerCanManage;
                if (!warTabEnabled && activeTab === 'war_stack') activeTab = 'overview';
                backendStatus = 'War Stack loaded';
                lastSyncAt = new Date().toLocaleString();
                saveSession();
                renderOverlay();
            }
            return data;
        }).catch(function () {
            warTabLoading = false;
            return null;
        });
    }

    function setWarTabState(enabled) {
        if (!syncSecret) {
            window.alert('Enter Sync Secret first.');
            return;
        }
        apiRequest('POST', '/api/warstack/set-state', {
            secret: syncSecret,
            auth: buildServerAuthPayload(),
            enabled: enabled ? 1 : 0
        }).then(function (data) {
            var state = data && (data.state || data.warstack);
            if (state) {
                warTabEnabled = !!state.enabled;
                warTabUpdatedAt = state.updatedAt || '';
                warTabUpdatedBy = state.updatedBy || '';
                warTabViewerCanManage = !!state.viewerCanManage;
                if (!warTabEnabled && activeTab === 'war_stack') activeTab = 'overview';
                backendStatus = 'War Stack updated';
                lastSyncAt = new Date().toLocaleString();
                saveSession();
                renderOverlay();
            } else {
                window.alert((data && data.error) ? data.error : 'War tab update failed.');
            }
        }).catch(function () {
            window.alert('War tab update failed.');
        });
    }

    function pushCurrentClaimToBackend(actionOverride) {
        if (!claimId || !syncSecret) return Promise.resolve(null);

        var action = actionOverride || (isAdmin() ? 'admin_update' : (isMember() ? 'member_submit' : 'guest'));
        var payload = {
            secret: syncSecret,
            action: action,
            auth: buildServerAuthPayload(),
            claim: {
                id: claimId || '',
                member: sessionName || 'Guest',
                plan: selectedPlan || 'None',
                status: claimStatus || 'Not submitted',
                note: claimNote || '',
                loss: claimLoss || '',
                proof: claimProof || '',
                stack: claimStack || '',
                payout: payoutAmount || '',
                decision: decisionNote || '',
                armedAt: activeCoverageArmedAt || '',
                armedPlan: activeCoveragePlan || '',
                armedStage: activeCoverageStage || '',
                armedEnergy: activeCoverageArmedEnergy || '',
                armedBoosterCd: activeCoverageArmedBoosterCd || '',
                expiresAt: activeCoverageExpiresAt || '',
                odDetectedAt: activeCoverageAutoSubmittedAt || '',
                ruleCheck: activeCoverageRuleCheck || '',
                detectStatus: activeCoverageDetectStatus || '',
                updatedAt: new Date().toISOString()
            }
        };

        return apiRequest('POST', '/api/claims/push', payload).then(function (data) {
            backendStatus = data && data.ok ? 'Claim pushed' : ((data && data.error) ? data.error : 'Push failed');
            lastSyncAt = new Date().toLocaleString();
            if (data && data.claim) {
                var rec = data.claim;
                claimId = rec.id || claimId;
                selectedClaimId = rec.id || selectedClaimId;
                selectedPlan = rec.plan || selectedPlan;
                claimStatus = rec.status || claimStatus;
                claimNote = rec.note || claimNote;
                claimLoss = rec.loss || claimLoss;
                claimProof = rec.proof || claimProof;
                claimStack = rec.stack || claimStack;
                payoutAmount = rec.payout || payoutAmount;
                decisionNote = rec.decision || decisionNote;
                upsertCurrentClaim();
            }
            saveSession();
            renderOverlay();
            return data;
        }).catch(function () {
            backendStatus = 'Push failed';
            lastSyncAt = new Date().toLocaleString();
            saveSession();
            renderOverlay();
            return null;
        });
    }

    function fetchSelectedClaimHistory() {
        if (!selectedClaimId || !syncSecret || historyLoading) return Promise.resolve(null);
        historyLoading = true;
        return apiRequest('POST', '/api/claims/history', {
            secret: syncSecret,
            claim_id: selectedClaimId
        }).then(function (data) {
            historyLoading = false;
            if (data && Array.isArray(data.history)) {
                saveHistory(data.history.map(function (x) {
                    return { at: x.at || x.createdAt || '', text: x.text || x.note || JSON.stringify(x) };
                }));
                renderOverlay();
            }
            return data;
        }).catch(function () {
            historyLoading = false;
            return null;
        });
    }

    function finishLoginSuccess(user, roleLabel) {
        sessionRole = (user && user.role) ? user.role : (roleLabel || 'member');
        sessionName = (user && user.name) ? user.name : 'Member';
        authMode = 'backend';
        backendStatus = roleLabel === 'admin' ? 'Admin login ok' : 'Member login ok';
        settingsNotice = 'Login successful. Signed in as ' + sessionName + '.';
        lastSyncAt = new Date().toLocaleString();
        autoLoginTriedAt = new Date().toISOString();
        saveSession();
        renderOverlay();
        if (typeof touchScriptUsage === 'function') touchScriptUsage();
        if (typeof fetchWarTabState === 'function') fetchWarTabState();
        if (typeof fetchFinancialSummary === 'function') fetchFinancialSummary();
        if (typeof fetchUsageSummary === 'function') fetchUsageSummary();
        if (typeof fetchXanaxRequestState === 'function') fetchXanaxRequestState();
        if (typeof syncClaimsFromBackend === 'function') syncClaimsFromBackend();
        if (typeof fetchAlerts === 'function') fetchAlerts();
        if (typeof fetchActivations === 'function') fetchActivations();
    }

    function tryBackendLoginSilently() {
        if (!singleApiKey || autoLoginBusy) return Promise.resolve(false);
        autoLoginBusy = true;

        return apiRequest('POST', '/api/auth/admin-key-login', {
            secret: syncSecret,
            api_key: singleApiKey
        }).then(function (data) {
            if (data && data.ok && data.user) {
                finishLoginSuccess(data.user, 'admin');
                autoLoginBusy = false;
                return true;
            }
            return apiRequest('POST', '/api/auth/faction-login', {
                secret: syncSecret,
                api_key: singleApiKey,
                faction_id: factionIdLock
            }).then(function (memberData) {
                if (memberData && memberData.ok && memberData.user) {
                    finishLoginSuccess(memberData.user, 'member');
                    autoLoginBusy = false;
                    return true;
                }
                autoLoginBusy = false;
                return false;
            });
        }).catch(function () {
            autoLoginBusy = false;
            return false;
        });
    }

    function maybeAutoLogin(force) {
        if (!singleApiKey) return Promise.resolve(false);
        if (sessionRole !== 'guest' && !force) return Promise.resolve(true);

        var now = Date.now();
        var lastTry = Date.parse(String(autoLoginTriedAt || '')) || 0;
        if (!force && lastTry && (now - lastTry) < 15000) {
            return Promise.resolve(false);
        }

        autoLoginTriedAt = new Date().toISOString();
        saveSession();
        return tryBackendLoginSilently();
    }

    function singleBackendLogin() {
        if (!apiBase || !syncSecret || !singleApiKey) {
            window.alert('Enter your Torn API key first.');
            return;
        }

        adminApiKey = singleApiKey;
        memberApiKey = singleApiKey;

        apiRequest('POST', '/api/auth/admin-key-login', {
            api_key: singleApiKey,
            secret: syncSecret
        }).then(function (data) {
            if (data && data.ok && data.user) {
                sessionName = data.user.name || 'Admin';
                sessionRole = 'admin';
                authMode = 'backend-admin-key';
                backendStatus = 'Admin login ok';
                settingsNotice = 'Login successful. Signed in as admin.';
                lastSyncAt = new Date().toLocaleString();
                saveSession();
                renderOverlay();
                fetchWarTabState();
                fetchFinancialSummary();
                fetchXanaxRequestState();
                fetchAlertsState();
                fetchActivations();
                syncClaimsFromBackend();
                return;
            }

            return apiRequest('POST', '/api/auth/faction-login', {
                api_key: singleApiKey,
                faction_id: factionIdLock || '',
                secret: syncSecret
            }).then(function (memberData) {
                if (memberData && memberData.ok && memberData.user) {
                    sessionName = memberData.user.name || 'Member';
                    sessionRole = memberData.user.role || 'member';
                    authMode = 'backend-faction';
                    backendStatus = 'Member login ok';
                    settingsNotice = 'Login successful. Signed in as ' + (memberData.user.name || 'Member') + '.';
                    lastSyncAt = new Date().toLocaleString();
                    saveSession();
                    renderOverlay();
                    fetchWarTabState();
                    fetchFinancialSummary();
                    syncClaimsFromBackend();
                } else {
                    window.alert((memberData && memberData.error) ? memberData.error : 'Login failed.');
                }
            });
        }).catch(function () {
            window.alert('Login failed.');
        });
    }

    function localLogin(role) {
        var name = window.prompt(role === 'admin' ? 'Enter admin name' : 'Enter member name', sessionName || '');
        if (!name) return;
        var pass = window.prompt(role === 'admin' ? 'Enter admin passcode' : 'Enter member passcode', '');
        if (pass === null) return;

        if (role === 'admin' && pass !== 'wrathadmin') {
            window.alert('Admin login failed.');
            return;
        }
        if (role === 'member' && pass !== 'sinsmember') {
            window.alert('Member login failed.');
            return;
        }

        sessionRole = role;
        sessionName = String(name).trim() || (role === 'admin' ? 'Admin' : 'Member');
        authMode = 'local';
        saveSession();
        renderOverlay();
    }

    function logoutSession() {
        sessionRole = 'guest';
        sessionName = 'Guest';
        authMode = 'local';
        settingsNotice = 'Logged out.';
        saveSession();
        renderOverlay();
    }

    function selectPlan(name) {
        selectedPlan = name;
        saveSession();
        renderOverlay();
    }

    function showPlanTerms(name) {
        window.alert(getDetailedPlanTerms(name));
    }

    function valueOf(selector) {
        var el = overlay && overlay.querySelector(selector);
        return el ? String(el.value || '').trim() : '';
    }

    function updateClaimFilters() {
        claimFilterStatus = valueOf('#si-claim-filter-status') || 'all';
        claimFilterMember = valueOf('#si-claim-filter-member') || '';
        claimSortMode = valueOf('#si-claim-sort-mode') || 'newest';
        saveSession();
        renderOverlay();
    }

    function submitClaim() {
        if (!isMember()) {
            window.alert('Log in as a member first.');
            return;
        }
        if (!selectedPlan || selectedPlan === 'None') {
            window.alert('Select a plan first.');
            return;
        }

        claimNote = valueOf('#si-claim-note');
        claimLoss = valueOf('#si-claim-loss');
        claimProof = valueOf('#si-claim-proof');
        claimStack = valueOf('#si-claim-stack');

        if (!claimNote || !claimLoss || !claimProof || !claimStack) {
            window.alert('Fill in all claim fields.');
            return;
        }
        if (!stackMatchesPlan(selectedPlan, claimStack)) {
            window.alert('Stack type does not match selected plan.\n\nRule: ' + getPlanRuleText(selectedPlan));
            return;
        }

        if (!claimId) claimId = makeClaimId();
        selectedClaimId = claimId;
        claimStatus = 'Pending review';
        upsertCurrentClaim();
        addHistory((sessionName || 'Member') + ' submitted claim ' + claimId + '.');
        saveSession();
        pushCurrentClaimToBackend('member_submit');
        activeTab = 'claims';
        renderOverlay();
    }

    function adminSetClaimStatus(nextStatus) {
        if (!isAdmin()) {
            window.alert('Admin login required.');
            return;
        }
        claimStatus = nextStatus;
        payoutAmount = valueOf('#si-payout') || payoutAmount;
        decisionNote = valueOf('#si-decision') || decisionNote;
        upsertCurrentClaim();
        addHistory((sessionName || 'Admin') + ' changed status to ' + nextStatus + '.');
        saveSession();
        pushCurrentClaimToBackend('admin_update');
        renderOverlay();
    }

    function card(title, body) {
        return '<div class="si-card"><div class="si-card-title">' + esc(title) + '</div>' + body + '</div>';
    }

    function tile(value, label) {
        return '<div class="si-tile"><div class="si-tile-num">' + esc(value) + '</div><div class="si-tile-label">' + esc(label) + '</div></div>';
    }


    function fetchXanaxRequestState() {
        if (!syncSecret) return Promise.resolve(null);
        return apiRequest('POST', '/api/xanax-request/state', {
            secret: syncSecret,
            auth: buildServerAuthPayload()
        }).then(function (data) {
            var state = data && data.state;
            if (state) {
                xanaxRequestTotalOwed = Number(state.totalOwed || 0);
                xanaxRequestRequested = !!state.requested;
                xanaxRequestRequestedAt = state.requestedAt || '';
                xanaxRequestRequestedBy = state.requestedBy || '';
                xanaxRequestSentAt = state.sentAt || '';
                xanaxRequestSentBy = state.sentBy || '';
                xanaxRequestResetAt = state.resetAt || '';
                xanaxRequestResetBy = state.resetBy || '';
                xanaxRequestStatus = state.status || 'idle';
                xanaxRequestViewerCanRequest = !!state.viewerCanRequest;
                xanaxRequestViewerIsAdmin = !!state.viewerIsAdmin;
                saveSession();
                renderOverlay();
            }
            return data;
        }).catch(function () { return null; });
    }

    function requestXanaxCut() {
        return apiRequest('POST', '/api/xanax-request/request', {
            secret: syncSecret,
            auth: buildServerAuthPayload()
        }).then(function (data) {
            if (data && data.state) {
                window.alert('Faction cut request sent to admin.');
                return fetchXanaxRequestState();
            }
            window.alert((data && data.error) ? data.error : 'Request failed.');
            return data;
        }).catch(function () {
            window.alert('Request failed.');
            return null;
        });
    }

    function markXanaxCutSent() {
        return apiRequest('POST', '/api/xanax-request/mark-sent', {
            secret: syncSecret,
            auth: buildServerAuthPayload()
        }).then(function (data) {
            if (data && data.state) {
                window.alert('Faction cut marked as sent.');
                return fetchXanaxRequestState();
            }
            window.alert((data && data.error) ? data.error : 'Mark sent failed.');
            return data;
        }).catch(function () {
            window.alert('Mark sent failed.');
            return null;
        });
    }

    function resetXanaxCutTotal() {
        return apiRequest('POST', '/api/xanax-request/reset', {
            secret: syncSecret,
            auth: buildServerAuthPayload()
        }).then(function (data) {
            if (data && data.state) {
                window.alert('Faction cut total reset.');
                return fetchXanaxRequestState();
            }
            window.alert((data && data.error) ? data.error : 'Reset failed.');
            return data;
        }).catch(function () {
            window.alert('Reset failed.');
            return null;
        });
    }

    function renderXanaxRequest() {
        var requestBtn = xanaxRequestViewerCanRequest
            ? '<div class="si-btnrow"><button id="si-xr-request" class="si-btn good">Request 15% Faction Cut</button></div>'
            : '<div class="si-text">Leader and Co-Leader can request the faction cut. Admin can send and reset it.</div>';

        var adminBtns = xanaxRequestViewerIsAdmin
            ? '<div class="si-btnrow"><button id="si-xr-sent" class="si-btn">Mark Sent</button><button id="si-xr-reset" class="si-btn alt">Reset Total Owed</button></div>'
            : '';

        return card('Xanax Request',
            '<div class="si-row"><span class="si-label">Total Owed</span><span>' + esc(xanaxRequestTotalOwed + ' Xanax') + '</span></div>'
            + '<div class="si-row"><span class="si-label">Status</span><span>' + esc(xanaxRequestStatus || 'idle') + '</span></div>'
            + '<div class="si-row"><span class="si-label">Requested By</span><span>' + esc(xanaxRequestRequestedBy || 'Not requested') + '</span></div>'
            + '<div class="si-row"><span class="si-label">Requested At</span><span>' + esc(formatDateTime(xanaxRequestRequestedAt)) + '</span></div>'
            + '<div class="si-row"><span class="si-label">Sent By</span><span>' + esc(xanaxRequestSentBy || 'Not sent') + '</span></div>'
            + '<div class="si-row"><span class="si-label">Sent At</span><span>' + esc(formatDateTime(xanaxRequestSentAt)) + '</span></div>'
            + '<div class="si-row"><span class="si-label">Last Reset By</span><span>' + esc(xanaxRequestResetBy || 'Never') + '</span></div>'
            + '<div class="si-row"><span class="si-label">Last Reset At</span><span>' + esc(formatDateTime(xanaxRequestResetAt)) + '</span></div>'
            + requestBtn
            + adminBtns
        );
    }


    function renderWarStackControls() {
        var canManage = isAdmin() || sessionRole === 'leader' || sessionRole === 'co-leader';
        var stateText = warTabEnabled ? 'Activated' : 'Inactive';
        var buttons = canManage
            ? '<div class="si-btnrow">'
                + '<button id="si-war-on" class="si-btn good">Activate War Stack</button>'
                + '<button id="si-war-off" class="si-btn alt">Deactivate War Stack</button>'
              + '</div>'
            : '<div class="si-text">Login with your Torn API key to manage War Stack.</div>';

        return card('War Stack',
            '<div class="si-row"><span class="si-label">Status</span><span class="si-badge">' + esc(stateText) + '</span></div>'
            + '<div class="si-row"><span class="si-label">Updated By</span><span>' + esc(warTabUpdatedBy || 'Not set') + '</span></div>'
            + '<div class="si-row"><span class="si-label">Updated At</span><span>' + esc(warTabUpdatedAt || 'Never') + '</span></div>'
            + buttons
        );
    }


    function renderWarStackTab() {
        var greed = getGreedPlanData();
        var greedIsActive = isCoverageActive() && activeCoveragePlan === 'Greed';
        var greedCountdown = greedIsActive
            ? '<div class="si-row"><span class="si-label">Timer</span><span>' + esc(formatRemaining(currentCoverageRemainingMs())) + '</span></div>'
            : '<div class="si-row"><span class="si-label">Timer</span><span>Not active</span></div>';

        var greedButtons = '<div class="si-btnrow">'
            + '<button id="si-greed-select" class="si-btn">Select</button>'
            + '<button id="si-greed-arm" class="si-btn ' + (greedIsActive ? 'good' : '') + '">' + (greedIsActive ? 'Activated' : 'Activate') + '</button>'
            + '<button id="si-greed-terms" class="si-btn alt">Terms</button>'
            + '</div>';

        return ''
            + card('War Stack Greed',
                '<div class="si-row"><span class="si-label">Coverage</span><span>' + esc(greed.coverage) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Payment</span><span>' + esc(greed.payment) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Payout</span><span>' + esc(greed.payout) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Window</span><span>' + esc(greed.window) + '</span></div>'
                + greedCountdown
                + greedButtons
            );
    }

    function renderOldPlanRows(rows) {
        return rows.map(function (row) {
            return '<div class="si-row"><span class="si-label">' + esc(row[0]) + '</span><span>' + esc(row[1]) + '</span></div>';
        }).join('');
    }

    function renderRules() {
        return ''
            + card('Rules',
                '<div class="si-text">1. Save your Torn API key in Settings and log in first.</div>'
                + '<div class="si-text">2. Use only the correct plan for the stack or situation you are covering.</div>'
                + '<div class="si-text">3. Make sure the required payment is sent for the plan before relying on coverage.</div>'
                + '<div class="si-text">4. Read the plan Terms button carefully before activating any plan or Wrath stage.</div>'
                + '<div class="si-text">5. If War Stack is active, only use War Stack plans inside that tab.</div>'
                + '<div class="si-text">6. False, misleading, or rule-breaking claims can be denied.</div>'
                + '<div class="si-text">7. Payout is only final after admin review and verification.</div>')
            + card('How To Use It Properly To Receive Payment If You OD',
                '<div class="si-text">Step 1: Open Settings, save your Torn API key, and log in.</div>'
                + '<div class="si-text">Step 2: Go to Plans and choose the correct plan for what you are doing.</div>'
                + '<div class="si-text">Step 3: Read the Terms button for that plan and make sure you match its rules.</div>'
                + '<div class="si-text">Step 4: Activate the plan or the correct Wrath stage before you start.</div>'
                + '<div class="si-text">Step 5: Stay within the active coverage window shown by the script.</div>'
                + '<div class="si-text">Step 6: If an OD happens during the active window, the system can create a pending claim for review.</div>'
                + '<div class="si-text">Step 7: Admin reviews the claim, payment proof, and plan rules before payout is approved.</div>')
            + card('How It Works',
                '<div class="si-text">Sinner\'s Insurance lets members log in with one Torn API key, activate a plan, and run a timed coverage window.</div>'
                + '<div class="si-text">During an active window, the script checks for OD-style events and can submit a pending claim automatically.</div>'
                + '<div class="si-text">Claims, payment checks, admin review, War Stack controls, and faction request tools are all managed through the overlay and backend.</div>'
                + '<div class="si-text">Different plans have different payment, coverage, payout, and terms rules, so always follow the exact plan requirements.</div>');
    }

    function renderOverview() {
        var financeTiles = '<div class="si-tiles">'
            + tile(finReceiptCount, 'Claims')
            + tile(finFactionCut + 'x', 'Faction Cut')
            + tile(finPayoutCount, 'Payouts Verified')
            + '</div>';

        var financeCard = card('Insurance Overview',
            financeTiles
            + '<div class="si-row"><span class="si-label">Faction Cut</span><span>' + esc(finFactionCut + ' Xanax') + '</span></div>'
            + '<div class="si-row"><span class="si-label">Member Payments Verified</span><span>' + esc(finMemberPayCount) + '</span></div>'
            + '<div class="si-row"><span class="si-label">Admin Payouts Verified</span><span>' + esc(finPayoutCount) + '</span></div>'
        );

        var adminAlerts = isAdmin()
            ? card('Admin Alerts',
                '<div class="si-row"><span class="si-label">Unread Claims</span><span>' + esc(alertUnreadClaims) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Pending Activations</span><span>' + esc(alertPendingActivations) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Members Using Script</span><span>' + esc(getScriptUsersCount()) + '</span></div>')
            : '';

        var coverageInfo = '';
        if (activeCoveragePlan) {
            coverageInfo = card('Active Coverage',
                '<div class="si-row"><span class="si-label">Plan</span><span>' + esc(activeCoveragePlan || 'None') + '</span></div>'
                + '<div class="si-row"><span class="si-label">Stage</span><span>' + esc(activeCoverageStage || '-') + '</span></div>'
                + '<div class="si-row"><span class="si-label">Payout</span><span>' + esc(getPlanPayoutText(activeCoveragePlan, activeCoverageStage) || '-') + '</span></div>'
                + '<div class="si-row"><span class="si-label">Status</span><span class="si-badge">' + esc(isCoverageActive() ? 'Active' : (activeCoverageDetectStatus || 'Idle')) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Expires</span><span>' + esc(formatDateTime(activeCoverageExpiresAt)) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Remaining</span><span>' + esc(isCoverageActive() ? formatRemaining(currentCoverageRemainingMs()) : 'Not active') + '</span></div>'
            );
        }

        var warStackCard = canManageWarStackUi() ? renderWarStackControls() : '';

        return financeCard + adminAlerts + coverageInfo + warStackCard;
    }

    function renderPlans() {
        return PLANS.map(function (p) {
            var rows = renderOldPlanRows(p.oldRows || []);
            var planIsActive = isCoverageActive() && activeCoveragePlan === p.name && !activeCoverageStage;
            var planCountdown = planIsActive
                ? '<div class="si-row"><span class="si-label">Timer</span><span>' + esc(formatRemaining(currentCoverageRemainingMs())) + '</span></div>'
                : '';

            var wrathStages = '';
            if (p.stages && p.stages.length) {
                wrathStages = '<div class="si-wrath-wrap">'
                    + p.stages.map(function (s) {
                        var stageIsActive = isCoverageActive() && activeCoveragePlan === p.name && activeCoverageStage === s.stage;
                        var stageCountdown = stageIsActive
                            ? '<div class="si-row"><span class="si-label">Timer</span><span>' + esc(formatRemaining(currentCoverageRemainingMs())) + '</span></div>'
                            : '';
                        return '<div class="si-wrath-stage">'
                            + '<div class="si-wrath-title">' + esc(s.stage) + '</div>'
                            + '<div class="si-row"><span class="si-label">Payout</span><span>' + esc(s.payout) + '</span></div>'
                            + '<div class="si-row"><span class="si-label">Payment</span><span>' + esc(s.payment) + '</span></div>'
                            + '<div class="si-row"><span class="si-label">Terms</span><span>' + esc(s.terms) + '</span></div>'
                            + '<div class="si-row"><span class="si-label">Window</span><span>' + esc(s.window) + '</span></div>'
                            + stageCountdown
                            + '<div class="si-btnrow">'
                                + '<button class="si-btn" data-action="select-stage" data-plan="' + esc(p.name) + '" data-stage="' + esc(s.stage) + '">Select ' + esc(s.stage) + '</button>'
                                + '<button class="si-btn ' + (stageIsActive ? 'good' : '') + '" data-action="arm-stage" data-plan="' + esc(p.name) + '" data-stage="' + esc(s.stage) + '">' + (stageIsActive ? 'Activated ' + esc(s.stage) : 'Activate ' + esc(s.stage)) + '</button>'
                            + '</div>'
                        + '</div>';
                    }).join('')
                    + '</div>';
            }

            var buttonRow = '<div class="si-btnrow">'
                + '<button class="si-btn" data-action="select-plan" data-plan="' + esc(p.name) + '">Select</button>'
                + ((p.name === 'Pride' || p.name === 'Envy')
                    ? '<button class="si-btn ' + (planIsActive ? 'good' : '') + '" data-action="arm-plan" data-plan="' + esc(p.name) + '">' + (planIsActive ? 'Activated' : 'Activate') + '</button>'
                    : '')
                + '<button class="si-btn alt" data-action="terms-plan" data-plan="' + esc(p.name) + '">Terms</button>'
                + '</div>';

            return card(p.name, rows + planCountdown + wrathStages + buttonRow);
        }).join('');
    }

    function renderClaims() {
        if (!isAdmin()) {
            var recent = getRecentMemberClaims(6);
            return card('Your Recent Claims',
                recent.length ? recent.map(function (item) {
                    return '<div class="si-history-item">'
                        + '<div class="si-history-at">' + esc(item.updatedAt || '') + '</div>'
                        + '<div class="si-text"><strong>' + esc(item.id || '') + '</strong> | '
                        + esc(item.plan || 'None') + ' | ' + esc(item.status || 'Unknown')
                        + (item.loss ? ' | Loss: ' + esc(item.loss) : '')
                        + '</div>'
                        + (item.note ? '<div class="si-text">' + esc(item.note) + '</div>' : '')
                        + '</div>';
                }).join('') : '<div class="si-text">No recent claims yet.</div>');
        }

        syncFromSelectedClaim();
        var items = getFilteredClaimsDbItems();
        var history = getClaimHistoryItems();
        var options = items.map(function (item) {
            return '<option value="' + esc(item.id) + '"' + (selectedClaimId === item.id ? ' selected' : '') + '>'
                + esc(item.id + ' | ' + item.member + ' | ' + item.status)
                + '</option>';
        }).join('');

        return ''
            + card('Claim Filters',
                '<div class="si-field"><label>Status</label><select id="si-claim-filter-status" class="si-input">'
                + '<option value="all"' + (claimFilterStatus === 'all' ? ' selected' : '') + '>All</option>'
                + '<option value="Pending review"' + (claimFilterStatus === 'Pending review' ? ' selected' : '') + '>Pending review</option>'
                + '<option value="Under review"' + (claimFilterStatus === 'Under review' ? ' selected' : '') + '>Under review</option>'
                + '<option value="Approved"' + (claimFilterStatus === 'Approved' ? ' selected' : '') + '>Approved</option>'
                + '<option value="Denied"' + (claimFilterStatus === 'Denied' ? ' selected' : '') + '>Denied</option>'
                + '<option value="Paid"' + (claimFilterStatus === 'Paid' ? ' selected' : '') + '>Paid</option>'
                + '</select></div>'
                + '<div class="si-field"><label>Member Filter</label><input id="si-claim-filter-member" class="si-input" value="' + esc(claimFilterMember) + '" placeholder="Search member"></div>'
                + '<div class="si-field"><label>Sort</label><select id="si-claim-sort-mode" class="si-input">'
                + '<option value="newest"' + (claimSortMode === 'newest' ? ' selected' : '') + '>Newest</option>'
                + '<option value="oldest"' + (claimSortMode === 'oldest' ? ' selected' : '') + '>Oldest</option>'
                + '<option value="member_az"' + (claimSortMode === 'member_az' ? ' selected' : '') + '>Member A-Z</option>'
                + '<option value="status"' + (claimSortMode === 'status' ? ' selected' : '') + '>Status</option>'
                + '</select></div>'
                + '<div class="si-btnrow"><button id="si-apply-filters" class="si-btn alt">Apply Filters</button></div>')
            + card('Current Claim',
                '<div class="si-field"><label>Saved Claims</label><select id="si-claim-select" class="si-input"><option value="">Select claim</option>' + options + '</select></div>'
                + '<div class="si-field"><label>Plan</label><div class="si-text">' + esc(selectedPlan) + '</div></div>'
                + '<div class="si-field"><label>Claim Note</label><textarea id="si-claim-note" class="si-textarea" placeholder="Describe what happened">' + esc(claimNote) + '</textarea></div>'
                + '<div class="si-field"><label>Loss</label><input id="si-claim-loss" class="si-input" value="' + esc(claimLoss) + '" placeholder="Loss amount"></div>'
                + '<div class="si-field"><label>Proof</label><input id="si-claim-proof" class="si-input" value="' + esc(claimProof) + '" placeholder="Proof or logs"></div>'
                + '<div class="si-field"><label>Stack Type</label><input id="si-claim-stack" class="si-input" value="' + esc(claimStack) + '" placeholder="Xanax / E-DVD / Mixed"></div>'
                + '<div class="si-row"><span class="si-label">Status</span><span class="si-status">' + esc(claimStatus) + '</span></div>'
                + '<div class="si-row"><span class="si-label">Auto Window</span><span>' + esc(activeCoveragePlan ? (activeCoveragePlan + (activeCoverageStage ? ' ' + activeCoverageStage : '')) : 'None') + '</span></div>'
                + '<div class="si-row"><span class="si-label">Detect</span><span>' + esc(activeCoverageDetectStatus || 'idle') + '</span></div>'
                + '<div class="si-btnrow"><button id="si-submit-claim" class="si-btn">Submit Claim</button></div>')
            + card('Admin Review',
                '<div class="si-field"><label>Payout</label><input id="si-payout" class="si-input" value="' + esc(payoutAmount) + '" placeholder="Payout amount"></div>'
                + '<div class="si-field"><label>Decision Note</label><textarea id="si-decision" class="si-textarea" placeholder="Admin note">' + esc(decisionNote) + '</textarea></div>'
                + '<div class="si-btnstack">'
                + '<button id="si-under-review" class="si-btn alt">Under Review</button>'
                + '<button id="si-approve" class="si-btn good">Approve</button>'
                + '<button id="si-deny" class="si-btn bad">Deny</button>'
                + '<button id="si-paid" class="si-btn">Mark Paid</button>'
                + '</div>')
            + card('Claim History',
                history.length ? history.map(function (item) {
                    return '<div class="si-history-item"><div class="si-history-at">' + esc(item.at) + '</div><div class="si-text">' + esc(item.text) + '</div></div>';
                }).join('') : '<div class="si-text">No history yet.</div>');
    }

    function renderSettings() {
        var maskedKey = maskApiKeyForDisplay(singleApiKey);
        return ''
            + card('Torn Login',
                '<div class="si-field"><label>Torn API Key</label><input id="si-single-api-key" type="password" class="si-input" value="' + esc(singleApiKey) + '" placeholder="Enter your Torn API key"></div>'
                + '<div class="si-row"><span class="si-label">Saved Key</span><span>' + esc(singleApiKey ? maskedKey : 'Not saved') + '</span></div>'
                + '<div class="si-btnrow">'
                + '<button id="si-save-settings" class="si-btn">Save API Key</button>'
                + '<button id="si-single-login" class="si-btn good">Login</button>'
                + '<button id="si-logout" class="si-btn alt">Logout</button>'
                + '</div>'
                + '<div class="si-text">Use one Torn API key to log in. After saving, the key is masked in the status display.</div>')
            + card('API Key Status',
                '<div class="si-row"><span class="si-label">Login Status</span><span>' + esc(sessionRole === 'guest' ? 'Not logged in' : ('Logged in as ' + sessionName + ' (' + sessionRole + ')')) + '</span></div>'
                + '<div class="si-text">' + esc(settingsNotice || 'Waiting for API key save or login.') + '</div>')
            + card('ToS',
                '<div class="si-text">By using Sinner\'s Insurance, you agree that coverage, activations, and claims are subject to faction rules and review. Payouts are only valid after approval and verification. False claims, false proofs, or abuse of the system may lead to denial and removal of access.</div>')
            + card('API Key Storage and Usage',
                '<div class="si-text">Your Torn API key is stored locally in userscript storage on your device. It is used only for Torn login, plan activation, OD scan checks during active windows, and syncing insurance data with the Sinner\'s Insurance backend. Keep your key private and rotate it if your device or install is no longer trusted.</div>');
    }

    function bindEvents() {
        if (!overlay) return;

        overlay.querySelectorAll('[data-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                activeTab = btn.getAttribute('data-tab') || 'overview';
                saveSession();
                renderOverlay();
                if (activeTab === 'overview') {
                    fetchFinancialSummary();
                    fetchWarTabState();
                }
                if (activeTab === 'xanax_request') fetchXanaxRequestState();
                if (activeTab === 'claims') fetchSelectedClaimHistory();
            });
        });

        overlay.querySelectorAll('[data-plan]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var name = btn.getAttribute('data-plan') || '';
                var action = btn.getAttribute('data-action') || '';
                var stage = btn.getAttribute('data-stage') || '';
                if (action === 'select-plan') selectPlan(name);
                if (action === 'terms-plan') showPlanTerms(name);
                if (action === 'arm-plan') armPlanCoverage(name, '');
                if (action === 'arm-stage') armPlanCoverage(name, stage);
            });
        });

        var closeBtn = overlay.querySelector('#si-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

        var saveBtn = overlay.querySelector('#si-save-settings');
        if (saveBtn) saveBtn.addEventListener('click', function () {
            singleApiKey = valueOf('#si-single-api-key') || '';
            adminApiKey = singleApiKey;
            memberApiKey = singleApiKey;
            settingsNotice = singleApiKey ? 'API key saved successfully.' : 'No API key saved yet.';
            saveSession();
            renderOverlay();
            maybeAutoLogin(true);
        });

        var applyFiltersBtn = overlay.querySelector('#si-apply-filters');
        if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', updateClaimFilters);

        var testBtn = overlay.querySelector('#si-test-backend');
        if (testBtn) testBtn.addEventListener('click', testBackendConnection);

        var pullBtn = overlay.querySelector('#si-pull-claims');
        if (pullBtn) pullBtn.addEventListener('click', syncClaimsFromBackend);

        var singleLoginBtn = overlay.querySelector('#si-single-login');
        if (singleLoginBtn) singleLoginBtn.addEventListener('click', singleBackendLogin);

        var warOnBtn = overlay.querySelector('#si-war-on');
        if (warOnBtn) warOnBtn.addEventListener('click', function () { setWarTabState(true); });

        var warOffBtn = overlay.querySelector('#si-war-off');
        if (warOffBtn) warOffBtn.addEventListener('click', function () { setWarTabState(false); });

        var scanNowBtn = overlay.querySelector('#si-scan-now');
        if (scanNowBtn) scanNowBtn.addEventListener('click', runCoverageScan);

        var cancelCoverageBtn = overlay.querySelector('#si-cancel-coverage');
        if (cancelCoverageBtn) cancelCoverageBtn.addEventListener('click', cancelCoverageState);

        var greedSelectBtn = overlay.querySelector('#si-greed-select');
        if (greedSelectBtn) greedSelectBtn.addEventListener('click', function () {
            selectedPlan = 'Greed';
            saveSession();
            renderOverlay();
        });

        var greedArmBtn = overlay.querySelector('#si-greed-arm');
        if (greedArmBtn) greedArmBtn.addEventListener('click', function () {
            armPlanCoverage('Greed', '');
        });

        var greedTermsBtn = overlay.querySelector('#si-greed-terms');
        if (greedTermsBtn) greedTermsBtn.addEventListener('click', function () {
            window.alert(getGreedPlanData().terms);
        });

        var xrRequestBtn = overlay.querySelector('#si-xr-request');
        if (xrRequestBtn) xrRequestBtn.addEventListener('click', requestXanaxCut);

        var xrSentBtn = overlay.querySelector('#si-xr-sent');
        if (xrSentBtn) xrSentBtn.addEventListener('click', markXanaxCutSent);

        var xrResetBtn = overlay.querySelector('#si-xr-reset');
        if (xrResetBtn) xrResetBtn.addEventListener('click', resetXanaxCutTotal);

        var refreshActivationsBtn = overlay.querySelector('#si-refresh-activations');
        if (refreshActivationsBtn) refreshActivationsBtn.addEventListener('click', fetchActivations);

        var activationSelect = overlay.querySelector('#si-activation-select');
        if (activationSelect) activationSelect.addEventListener('change', function () {
            selectedActivationId = activationSelect.value || '';
            saveSession();
            renderOverlay();
        });

        var actVerifyPaymentBtn = overlay.querySelector('#si-act-verify-payment');
        if (actVerifyPaymentBtn) actVerifyPaymentBtn.addEventListener('click', function () {
            var note = valueOf('#si-activation-admin-note') || '';
            if (!selectedActivationId) return;
            pushActivation('admin_verify_payment', { id: selectedActivationId, reviewNote: note });
        });

        var actVerifyReceiptBtn = overlay.querySelector('#si-act-verify-receipt');
        if (actVerifyReceiptBtn) actVerifyReceiptBtn.addEventListener('click', function () {
            var note = valueOf('#si-activation-admin-note') || '';
            if (!selectedActivationId) return;
            pushActivation('admin_verify_receipt', { id: selectedActivationId, reviewNote: note });
        });

        var actRejectBtn = overlay.querySelector('#si-act-reject');
        if (actRejectBtn) actRejectBtn.addEventListener('click', function () {
            var note = valueOf('#si-activation-admin-note') || '';
            if (!selectedActivationId) return;
            pushActivation('admin_reject', { id: selectedActivationId, reviewNote: note });
        });

        var logoutBtn = overlay.querySelector('#si-logout');
        if (logoutBtn) logoutBtn.addEventListener('click', logoutSession);

        var submitBtn = overlay.querySelector('#si-submit-claim');
        if (submitBtn) submitBtn.addEventListener('click', submitClaim);

        var claimSelect = overlay.querySelector('#si-claim-select');
        if (claimSelect) claimSelect.addEventListener('change', function () {
            selectedClaimId = claimSelect.value || '';
            syncFromSelectedClaim();
            saveSession();
            renderOverlay();
            fetchSelectedClaimHistory();
        });

        var approveBtn = overlay.querySelector('#si-approve');
        if (approveBtn) approveBtn.addEventListener('click', function () { adminSetClaimStatus('Approved'); });

        var underReviewBtn = overlay.querySelector('#si-under-review');
        if (underReviewBtn) underReviewBtn.addEventListener('click', function () { adminSetClaimStatus('Under review'); });

        var denyBtn = overlay.querySelector('#si-deny');
        if (denyBtn) denyBtn.addEventListener('click', function () { adminSetClaimStatus('Denied'); });

        var paidBtn = overlay.querySelector('#si-paid');
        if (paidBtn) paidBtn.addEventListener('click', function () { adminSetClaimStatus('Paid'); });
    }

    function openOverlay() {
        ensureMounted();
        if (overlay) overlay.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
    }

    function closeOverlay() {
        if (overlay) overlay.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
    }

    function renderOverlay() {
        if (activeTab === 'claims' && !canSeeClaimsUi()) activeTab = 'overview';
        if (activeTab === 'activations') activeTab = 'overview';
        if (activeTab === 'xanax_request' && !canSeeXanaxRequestUi()) activeTab = 'overview';
        if (activeTab === 'war_stack' && !(warTabEnabled && canManageWarStackUi())) activeTab = 'overview';
        ensureMounted();
        if (!overlay) return;

        var body = renderOverview();
        if (activeTab === 'rules') body = renderRules();
        if (activeTab === 'plans') body = renderPlans();
        if (activeTab === 'claims') body = renderClaims();
        if (activeTab === 'xanax_request') body = renderXanaxRequest();
        if (activeTab === 'war_stack') body = renderWarStackTab();
        if (activeTab === 'settings') body = renderSettings();

        overlay.innerHTML = ''
            + '<div class="si-head">'
            + '<div><div class="si-title">Sinners Insurance</div><div class="si-sub">thin classic panel</div></div>'
            + '<button id="si-close-btn" class="si-close" type="button">×</button>'
            + '</div>'
            + '<div class="si-tabs">'
            + '<button class="si-tab ' + (activeTab === 'rules' ? 'active' : '') + '" data-tab="rules">RULES</button>'
            + '<button class="si-tab ' + (activeTab === 'overview' ? 'active' : '') + '" data-tab="overview">Overview</button>'
            + '<button class="si-tab ' + (activeTab === 'plans' ? 'active' : '') + '" data-tab="plans">Plans</button>'
            + (canSeeClaimsUi() ? '<button class="si-tab ' + (activeTab === 'claims' ? 'active' : '') + '" data-tab="claims">Claims' + (alertUnreadClaims ? ' (' + alertUnreadClaims + ')' : '') + '</button>' : '')
            + (warTabEnabled && canManageWarStackUi() ? '<button class=\"si-tab ' + (activeTab === 'war_stack' ? 'active' : '') + '\" data-tab=\"war_stack\">War Stack</button>' : '')
            + (canSeeXanaxRequestUi() ? '<button class="si-tab ' + (activeTab === 'xanax_request' ? 'active' : '') + '" data-tab="xanax_request">Xanax Request</button>' : '')
            + '<button class="si-tab ' + (activeTab === 'settings' ? 'active' : '') + '" data-tab="settings">Settings</button>'
            + '</div>'
            + '<div class="si-body">' + body + '</div>';

        bindEvents();
    }

    function addStyles() {
        if (document.getElementById('si-pda-style-flag')) return;
        GM_addStyle(`
#si-pda-launcher{position:fixed!important;left:10px!important;bottom:10px!important;z-index:2147483647!important;width:118px!important;height:28px!important;display:flex!important;align-items:center!important;justify-content:center!important;}
#si-pda-launcher button{width:118px!important;height:28px!important;border-radius:9px!important;border:1px solid rgba(205,164,74,.5)!important;background:linear-gradient(180deg,rgba(90,12,18,.95),rgba(35,8,10,.98))!important;color:#f5df9d!important;font-size:10px!important;font-weight:800!important;letter-spacing:.1px!important;box-shadow:0 8px 20px rgba(0,0,0,.35)!important;}
#si-pda-backdrop{position:fixed!important;inset:0!important;background:rgba(0,0,0,.62)!important;z-index:2147483645!important;display:none!important;}
#si-pda-backdrop.open{display:block!important;}
#si-pda-overlay{position:fixed!important;left:10px!important;right:10px!important;top:78px!important;bottom:84px!important;z-index:2147483646!important;display:none!important;flex-direction:column!important;overflow:hidden!important;border-radius:14px!important;border:1px solid rgba(201,162,80,.22)!important;background:linear-gradient(180deg,rgba(28,10,14,.99),rgba(8,5,8,.99))!important;color:#f7ead0!important;box-shadow:0 20px 55px rgba(0,0,0,.55)!important;}
#si-pda-overlay.open{display:flex!important;}
#si-pda-overlay .si-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;padding:10px 12px!important;border-bottom:1px solid rgba(201,162,80,.18)!important;}
#si-pda-overlay .si-title{font-size:14px!important;font-weight:900!important;color:#f2de9f!important;text-transform:uppercase!important;}
#si-pda-overlay .si-sub{font-size:10px!important;color:rgba(241,223,171,.78)!important;text-transform:uppercase!important;}
#si-pda-overlay .si-close{width:40px!important;height:40px!important;border-radius:10px!important;border:1px solid rgba(201,162,80,.22)!important;background:linear-gradient(180deg,rgba(72,14,18,.96),rgba(24,7,10,.98))!important;color:#f2de9f!important;font-size:22px!important;}
#si-pda-overlay .si-tabs{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:5px!important;padding:8px 8px 0!important;}
#si-pda-overlay .si-tab{min-height:32px!important;border-radius:9px!important;border:1px solid rgba(201,162,80,.16)!important;background:linear-gradient(180deg,rgba(60,12,16,.85),rgba(24,7,10,.92))!important;color:#f1dfab!important;font-size:10px!important;font-weight:800!important;}
#si-pda-overlay .si-tab.active{background:linear-gradient(180deg,rgba(124,19,26,.95),rgba(64,10,15,.98))!important;}
#si-pda-overlay .si-body{overflow:auto!important;padding:8px!important;display:grid!important;gap:8px!important;}
#si-pda-overlay .si-card{border-radius:12px!important;border:1px solid rgba(201,162,80,.14)!important;background:rgba(255,255,255,.03)!important;padding:10px!important;}
#si-pda-overlay .si-card-title{font-size:11px!important;font-weight:900!important;color:#f0dd9f!important;text-transform:uppercase!important;margin-bottom:8px!important;}
#si-pda-overlay .si-grid3{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;}
#si-pda-overlay .si-tile{border-radius:10px!important;padding:10px!important;background:rgba(255,255,255,.02)!important;border:1px solid rgba(201,162,80,.12)!important;text-align:center!important;}
#si-pda-overlay .si-tile-num{font-size:16px!important;font-weight:900!important;color:#f7e4a7!important;}
#si-pda-overlay .si-tile-label{font-size:10px!important;font-weight:800!important;color:rgba(241,223,171,.76)!important;text-transform:uppercase!important;}
#si-pda-overlay .si-row{display:flex!important;justify-content:space-between!important;gap:10px!important;padding:7px 0!important;border-bottom:1px solid rgba(201,162,80,.08)!important;}
#si-pda-overlay .si-label{color:#f2de9f!important;font-weight:800!important;font-size:11px!important;text-transform:uppercase!important;}
#si-pda-overlay .si-text{font-size:13px!important;line-height:1.45!important;color:#f8f0dd!important;}
#si-pda-overlay .si-plan-head{display:flex!important;justify-content:space-between!important;gap:10px!important;align-items:center!important;margin-bottom:10px!important;}
#si-pda-overlay .si-plan-name{font-size:14px!important;font-weight:900!important;color:#f2de9f!important;text-transform:uppercase!important;}
#si-pda-overlay .si-badge,#si-pda-overlay .si-status{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:28px!important;padding:0 10px!important;border-radius:999px!important;border:1px solid rgba(201,162,80,.18)!important;background:rgba(119,17,22,.22)!important;color:#f1dfab!important;font-size:11px!important;font-weight:900!important;}
#si-pda-overlay .si-stat-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;margin-bottom:10px!important;}
#si-pda-overlay .si-stat{border-radius:10px!important;padding:8px!important;background:rgba(255,255,255,.02)!important;border:1px solid rgba(201,162,80,.12)!important;}
#si-pda-overlay .si-stat-k{font-size:10px!important;font-weight:800!important;color:rgba(241,223,171,.72)!important;text-transform:uppercase!important;margin-bottom:4px!important;}
#si-pda-overlay .si-stat-v{font-size:12px!important;font-weight:800!important;color:#f8f0dd!important;}
#si-pda-overlay .si-btnrow,#si-pda-overlay .si-btnstack{display:flex!important;flex-wrap:wrap!important;gap:8px!important;}
#si-pda-overlay .si-btnstack{display:grid!important;grid-template-columns:1fr!important;}
#si-pda-overlay .si-btn{min-height:40px!important;padding:0 12px!important;border-radius:10px!important;border:1px solid rgba(201,162,80,.24)!important;background:linear-gradient(180deg,rgba(124,19,26,.95),rgba(64,10,15,.98))!important;color:#f7e4a7!important;font-size:11px!important;font-weight:900!important;text-transform:uppercase!important;}
#si-pda-overlay .si-btn.alt{background:linear-gradient(180deg,rgba(60,12,16,.92),rgba(24,7,10,.96))!important;}
#si-pda-overlay .si-btn.good{background:linear-gradient(180deg,rgba(20,112,58,.94),rgba(12,66,34,.98))!important;}
#si-pda-overlay .si-btn.bad{background:linear-gradient(180deg,rgba(120,26,32,.94),rgba(70,12,18,.98))!important;}
#si-pda-overlay .si-field{display:grid!important;gap:6px!important;margin-bottom:10px!important;}
#si-pda-overlay .si-field label{font-size:11px!important;font-weight:800!important;color:#f2de9f!important;text-transform:uppercase!important;}
#si-pda-overlay .si-input,#si-pda-overlay .si-textarea{width:100%!important;box-sizing:border-box!important;border-radius:10px!important;border:1px solid rgba(201,162,80,.18)!important;background:rgba(255,255,255,.04)!important;color:#f8f0dd!important;padding:11px!important;font-size:14px!important;}
#si-pda-overlay .si-textarea{min-height:92px!important;resize:none!important;}
#si-pda-overlay .si-history-item{border-radius:10px!important;background:rgba(255,255,255,.02)!important;border:1px solid rgba(201,162,80,.10)!important;padding:10px!important;margin-bottom:8px!important;}
#si-pda-overlay .si-history-at{font-size:10px!important;color:rgba(241,223,171,.72)!important;margin-bottom:4px!important;}
#si-pda-overlay .si-wrath-wrap{display:grid!important;gap:8px!important;margin:8px 0!important;}
#si-pda-overlay .si-wrath-stage{border-radius:10px!important;padding:8px!important;background:rgba(255,255,255,.02)!important;border:1px solid rgba(201,162,80,.12)!important;}
#si-pda-overlay .si-wrath-title{font-size:11px!important;font-weight:900!important;color:#f7e4a7!important;text-transform:uppercase!important;margin-bottom:6px!important;}
`);
        var flag = document.createElement('div');
        flag.id = 'si-pda-style-flag';
        flag.style.display = 'none';
        document.documentElement.appendChild(flag);
    }

    function ensureMounted() {
        addStyles();

        if (!document.body) return;

        if (!backdrop || !document.body.contains(backdrop)) {
            backdrop = document.createElement('div');
            backdrop.id = 'si-pda-backdrop';
            backdrop.addEventListener('click', closeOverlay);
            document.body.appendChild(backdrop);
        }

        if (!overlay || !document.body.contains(overlay)) {
            overlay = document.createElement('div');
            overlay.id = 'si-pda-overlay';
            document.body.appendChild(overlay);
        }

        if (!launcher || !document.body.contains(launcher)) {
            launcher = document.createElement('div');
            launcher.id = 'si-pda-launcher';
            launcher.innerHTML = '<button type="button">💊 Sinner\'s Insurance</button>';
            document.body.appendChild(launcher);
            var btn = launcher.querySelector('button');
            if (btn) btn.addEventListener('click', openOverlay);
        }
        if (launcher) {
            launcher.style.display = 'none';
            launcher.style.opacity = '0';
            launcher.style.pointerEvents = 'none';
        }
    }

    function boot() {
        ensureMounted();
        ensureCoverageTimer();
        maybeAutoLogin(false);
        fetchXanaxRequestState();
        fetchAlertsState();
        fetchActivations();
        renderOverlay();
        if (syncSecret) {
            fetchWarTabState();
            fetchFinancialSummary();
            syncClaimsFromBackend();
        }
        if (isCoverageActive()) runCoverageScan();
        if (!remountTimer) {
            remountTimer = setInterval(function () {
                if (!document.body) return;
                ensureMounted();
            }, 2000);
        }
    }

    window.__FRIES_INSURANCE_BRIDGE__ = {
        open: function () {
            try { ensureMounted(); } catch (_e) {}
            try {
                if (launcher) {
                    launcher.style.display = 'none';
                    launcher.style.opacity = '0';
                    launcher.style.pointerEvents = 'none';
                }
            } catch (_e2) {}
            try { openOverlay(); } catch (e) {
                try {
                    if (overlay) overlay.classList.add('open');
                    if (backdrop) backdrop.classList.add('open');
                } catch (_e3) {}
            }
        },
        close: function () {
            try { closeOverlay(); } catch (e) {
                try {
                    if (overlay) overlay.classList.remove('open');
                    if (backdrop) backdrop.classList.remove('open');
                } catch (_e2) {}
            }
        },
        toggle: function () {
            try {
                ensureMounted();
                if (overlay && overlay.classList.contains('open')) {
                    closeOverlay();
                } else {
                    openOverlay();
                }
            } catch (e) {}
        },
        overlayEl: function () { return overlay; },
        launcherEl: function () { return launcher; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/* ===== Embedded Giveaway / Lottery module ===== */

// ==UserScript==
// @name         Torn Giveaway Overlay
// @namespace    torn.giveaway.overlay
// @version      1.4.3
// @description  Giveaway overlay for Torn with entry requirement, reward, countdown, entrants, winners, and admin controls, plus a visual wheel tab.
// @author       OpenAI
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
// @downloadURL  https://sinner-s-lottery.onrender.com/static/giveaway.user.js
// @updateURL    https://sinner-s-lottery.onrender.com/static/giveaway.user.js
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  window.__FRIES_GIVEAWAY_EMBEDDED__ = true;

  const DEFAULT_BASE_URL = 'https://sinner-s-lottery.onrender.com';
  const K_BASE_URL = 'giveaway_base_url';
  const K_API_KEY = 'giveaway_api_key';
  const K_SESSION = 'giveaway_session';
  const K_OVERLAY_OPEN = 'giveaway_overlay_open';
  const K_SHIELD_POS = 'giveaway_shield_pos';
  const K_OVERLAY_POS = 'giveaway_overlay_pos';
  const K_ACTIVE_TAB = 'giveaway_active_tab';
  const K_REFRESH = 'giveaway_refresh_seconds';
  const K_WHEEL_LAYOUTS = 'giveaway_wheel_layouts';
  const K_WHEEL_SPINS = 'giveaway_wheel_spins';

  const APP_KEY = '__torn_giveaway_overlay_running__';
  let watchStarted = false;
  let ensureTimer = null;
  let refreshTimer = null;
  let wheelAnimFrame = null;
  let wheelState = {
    rotation: 0,
    spinning: false,
    lastSpinKey: '',
  };

  if (window[APP_KEY]) return;
  window[APP_KEY] = true;


  function getBaseUrl() {
    return String(getVal(K_BASE_URL, DEFAULT_BASE_URL) || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  function setBaseUrl(url) {
    const clean = String(url || '').trim().replace(/\/$/, '');
    if (!clean) return false;
    setVal(K_BASE_URL, clean);
    return true;
  }

  let state = {
    user: null,
    current: null,
    history: [],
    entrantSearch: '',
    entrantSort: 'az',
    loading: false,
    message: '',
    error: '',
  };

  function getVal(key, fallback) {
    try { return GM_getValue(key, fallback); } catch (_) { return fallback; }
  }
  function setVal(key, value) {
    try { GM_setValue(key, value); } catch (_) {}
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function fmtTs(ts) {
    if (!ts) return '-';
    const d = new Date(Number(ts) * 1000);
    return d.toLocaleString();
  }
  function countdownText(ts) {
    if (!ts) return '-';
    let diff = Number(ts) * 1000 - Date.now();
    if (diff <= 0) return 'Ended';
    const s = Math.floor(diff / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${d}d ${h}h ${m}m ${sec}s`;
  }


  function safeJsonParse(raw, fallback) {
    try {
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getStoredObject(key) {
    const raw = getVal(key, '');
    if (!raw) return {};
    if (typeof raw === 'object' && raw) return raw;
    return safeJsonParse(String(raw), {});
  }

  function setStoredObject(key, value) {
    setVal(key, JSON.stringify(value || {}));
  }

  function getGiveawayId() {
    const g = state.current?.giveaway || {};
    return String(g.id || g.giveaway_id || g.draw_id || 'default');
  }

  function normalizeEntrants() {
    const raw = Array.isArray(state.current?.entrants) ? state.current.entrants : [];
    const slices = [];
    raw.forEach((entry, idx) => {
      const count = Math.max(1, Number(entry?.entries || 1));
      const userId = Number(entry?.user_id || 0) || 0;
      const userName = String(entry?.user_name || `Entrant ${idx + 1}`);
      for (let i = 0; i < count; i += 1) {
        slices.push({
          user_id: userId,
          user_name: userName,
          entry_index: i + 1,
          slice_key: `${userId || 'u'}:${userName}:${i + 1}`,
        });
      }
    });
    return slices;
  }

  function entrantSignature(slices) {
    return slices.map(s => `${s.user_id}:${s.user_name}:${s.entry_index}`).sort().join('|');
  }

  function shuffleArray(items) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getWheelSlices() {
    const slices = normalizeEntrants();
    const giveawayId = getGiveawayId();
    const signature = entrantSignature(slices);
    const store = getStoredObject(K_WHEEL_LAYOUTS);
    const saved = store[giveawayId];
    if (saved && saved.signature === signature && Array.isArray(saved.order) && saved.order.length === slices.length) {
      const byKey = new Map(slices.map(s => [s.slice_key, s]));
      const restored = saved.order.map(key => byKey.get(key)).filter(Boolean);
      if (restored.length === slices.length) return restored;
    }
    const shuffled = shuffleArray(slices);
    store[giveawayId] = {
      signature,
      order: shuffled.map(s => s.slice_key),
      created_at: Date.now(),
    };
    setStoredObject(K_WHEEL_LAYOUTS, store);
    return shuffled;
  }

  function getWheelDisplayName(slice) {
    if (!slice) return '-';
    return slice.entry_index > 1 ? `${slice.user_name} (${slice.entry_index})` : slice.user_name;
  }

  function getWinnerSliceIndex(slices) {
    const winnerId = Number(state.current?.giveaway?.winner_user_id || 0);
    if (!winnerId) return -1;
    return slices.findIndex(s => Number(s.user_id || 0) === winnerId);
  }

  function getWheelCanvas() {
    return document.getElementById('gw-wheel-canvas');
  }

  function resizeWheelCanvas(canvas) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const width = Math.max(260, Math.min(380, Math.floor((parent?.clientWidth || 320) - 8)));
    canvas.width = width;
    canvas.height = width;
  }

  function drawWheel(rotationOverride) {
    const canvas = getWheelCanvas();
    if (!canvas) return;
    resizeWheelCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const slices = getWheelSlices();
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size * 0.46;
    const innerRadius = size * 0.16;
    const rotation = typeof rotationOverride === 'number' ? rotationOverride : wheelState.rotation || 0;

    ctx.clearRect(0, 0, size, size);

    if (!slices.length) {
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4dddd';
      ctx.font = `700 ${Math.max(18, Math.floor(size * 0.05))}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No entrants yet', cx, cy);
      return;
    }

    const anglePer = (Math.PI * 2) / slices.length;
    const colors = ['#8f1f1f', '#b53333', '#6c1515', '#c24a4a', '#7b2323', '#a82d2d'];

    slices.forEach((slice, index) => {
      const start = rotation + (index * anglePer) - (Math.PI / 2);
      const end = start + anglePer;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerRadius, start, end);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1a0909';
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + anglePer / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff5f5';
      ctx.font = `700 ${Math.max(11, Math.floor(size * 0.032))}px Arial`;
      const label = getWheelDisplayName(slice).slice(0, 20);
      ctx.fillText(label, outerRadius - 12, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#190909';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#e3b9b9';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.max(16, Math.floor(size * 0.06))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WHEEL', cx, cy);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function markSpinDone(key) {
    const store = getStoredObject(K_WHEEL_SPINS);
    store[key] = Date.now();
    setStoredObject(K_WHEEL_SPINS, store);
  }

  function hasSpinBeenDone(key) {
    const store = getStoredObject(K_WHEEL_SPINS);
    return !!store[key];
  }

  function spinWheelToIndex(index, spinKey, opts = {}) {
    const slices = getWheelSlices();
    if (!slices.length || index < 0 || index >= slices.length) return;
    if (wheelAnimFrame) cancelAnimationFrame(wheelAnimFrame);

    const anglePer = (Math.PI * 2) / slices.length;
    const targetCenter = (index * anglePer) + (anglePer / 2);
    const baseTarget = (Math.PI * 2) - targetCenter;
    const current = wheelState.rotation || 0;
    const normalizedCurrent = ((current % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
    let delta = baseTarget - normalizedCurrent;
    while (delta <= 0) delta += Math.PI * 2;
    const extraTurns = opts.extraTurns || 6;
    const target = current + delta + (Math.PI * 2 * extraTurns);
    const duration = opts.duration || 5200;
    const start = performance.now();

    wheelState.spinning = true;

    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(progress);
      wheelState.rotation = current + ((target - current) * eased);
      drawWheel(wheelState.rotation);
      if (progress < 1) {
        wheelAnimFrame = requestAnimationFrame(frame);
      } else {
        wheelState.rotation = target % (Math.PI * 2);
        wheelState.spinning = false;
        wheelState.lastSpinKey = spinKey || '';
        drawWheel(wheelState.rotation);
        if (spinKey) markSpinDone(spinKey);
      }
    }

    wheelAnimFrame = requestAnimationFrame(frame);
  }

  function maybeSpinWinningWheel() {
    const g = state.current?.giveaway || {};
    const slices = getWheelSlices();
    if (!slices.length) return;
    const winnerIndex = getWinnerSliceIndex(slices);
    if (winnerIndex < 0) return;
    const spinKey = `${getGiveawayId()}:${g.winner_user_id || 0}:${g.drawn_ts || 0}`;
    if (wheelState.spinning || hasSpinBeenDone(spinKey) || wheelState.lastSpinKey === spinKey) return;
    spinWheelToIndex(winnerIndex, spinKey, { extraTurns: 7, duration: 5600 });
  }

  function spinPreviewWheel() {
    const slices = getWheelSlices();
    if (!slices.length || wheelState.spinning) return;
    const randomIndex = Math.floor(Math.random() * slices.length);
    spinWheelToIndex(randomIndex, '', { extraTurns: 4, duration: 2600 });
  }

  function wheelTab() {
    const slices = getWheelSlices();
    const g = state.current?.giveaway || {};
    const winnerName = g.winner_name || 'Not drawn yet';
    const winnerId = g.winner_user_id || 0;
    const canPreview = !!slices.length;
    return `
      <div class="gw-card gw-hero">
        <div class="gw-label">Wheel Draw</div>
        <div class="gw-spacer"></div>
        <div class="gw-wheel-wrap">
          <div class="gw-wheel-pointer"></div>
          <canvas id="gw-wheel-canvas" class="gw-wheel-canvas" width="320" height="320"></canvas>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-stat">
            <div class="gw-label">Slices</div>
            <div class="gw-value">${slices.length}</div>
          </div>
          <div class="gw-stat">
            <div class="gw-label">Status</div>
            <div class="gw-value">${esc(g.status || '-')}</div>
          </div>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-actions">
          <div class="gw-btn ${canPreview ? '' : 'warn'}" id="gw-wheel-preview-btn">${canPreview ? 'Spin Preview' : 'Waiting For Entrants'}</div>
          <div class="gw-btn" id="gw-wheel-refresh-btn">Refresh Wheel</div>
        </div>
      </div>
      <div class="gw-card gw-highlight">
        <div class="gw-label">Winner</div>
        <div class="gw-winner-big">${esc(winnerName)}</div>
        <div class="gw-mini">${winnerId ? `Torn ID: ${winnerId}` : 'The wheel will land on the backend winner when the draw is done.'}</div>
      </div>
      <div class="gw-card">
        <div class="gw-label">How It Works</div>
        <div class="gw-spacer"></div>
        <div class="gw-mini">Entrants are shuffled into random wheel positions for this draw. When the giveaway is drawn, the wheel animates to the backend winner instead of choosing one on its own.</div>
      </div>
      ${!slices.length ? `<div class="gw-card"><div class="gw-value">No entrant list is available yet. If your backend does not return entrants for this endpoint, the wheel cannot build slices until that data is included.</div></div>` : ''}
    `;
  }

  function initWheelTab() {
    if (getVal(K_ACTIVE_TAB, 'overview') !== 'wheel') return;
    const canvas = getWheelCanvas();
    if (!canvas) return;
    drawWheel();
    window.requestAnimationFrame(() => {
      drawWheel();
      maybeSpinWinningWheel();
    });
  }

  function req(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      const token = getVal(K_SESSION, '');
      if (token) headers['X-Session-Token'] = token;
      GM_xmlhttpRequest({
        method,
        url: `${getBaseUrl()}${path}`,
        headers,
        data: body ? JSON.stringify(body) : null,
        onload: (r) => {
          try {
            const data = JSON.parse(r.responseText || '{}');
            if (r.status >= 200 && r.status < 300) resolve(data);
            else reject(data);
          } catch (e) {
            reject({ error: `Bad response: ${e}` });
          }
        },
        onerror: () => reject({ error: 'Network error' }),
      });
    });
  }

  function showMsg(msg, isErr = false) {
    state.message = isErr ? '' : msg;
    state.error = isErr ? msg : '';
    render();
    if (msg) setTimeout(() => {
      if (state.message === msg) state.message = '';
      if (state.error === msg) state.error = '';
      render();
    }, 3000);
  }

  async function login() {
    const apiKey = prompt('Enter your Torn API key');
    if (!apiKey) return;
    setVal(K_API_KEY, apiKey.trim());
    try {
      const data = await req('/api/login', 'POST', { api_key: apiKey.trim() });
      if (!data.ok) throw data;
      setVal(K_SESSION, data.token || '');
      state.user = data.user || null;
      showMsg(`Logged in as ${state.user?.user_name || 'user'}`);
      await refreshAll();
    } catch (e) {
      showMsg(e.error || 'Login failed', true);
    }
  }


  async function tryAutoLogin() {
    const token = getVal(K_SESSION, '');
    if (token) return;
    const apiKey = String(getVal(K_API_KEY, '') || '').trim();
    if (!apiKey) return;
    try {
      const data = await req('/api/login', 'POST', { api_key: apiKey });
      if (!data.ok) throw data;
      setVal(K_SESSION, data.token || '');
      state.user = data.user || null;
    } catch (_) {}
  }

  async function logout() {
    try { await req('/api/logout', 'POST', {}); } catch (_) {}
    setVal(K_SESSION, '');
    state.user = null;
    showMsg('Logged out');
    await refreshAll();
  }

  async function refreshCurrent() {
    try {
      const data = await req('/api/giveaway/current');
      state.current = data;
    } catch (e) {
      showMsg(e.error || 'Failed loading giveaway', true);
    }
  }

  async function refreshHistory() {
    try {
      const data = await req('/api/giveaway/history');
      state.history = data.history || [];
    } catch (_) {}
  }

  async function refreshMe() {
    try {
      const data = await req('/api/me');
      state.user = data.user || null;
    } catch (_) {
      state.user = null;
    }
  }

  async function refreshAll() {
    if (state.loading) return;
    state.loading = true;
    render();
    await Promise.all([refreshMe(), refreshCurrent(), refreshHistory()]);
    state.loading = false;
    render();
  }

  async function refreshForTab(tab) {
    if (state.loading) return;
    state.loading = true;
    render();
    try {
      if (tab === 'overview') {
        await Promise.all([refreshCurrent(), refreshMe()]);
      } else if (tab === 'wheel') {
        await refreshCurrent();
      } else if (tab === 'entrants') {
        await Promise.all([refreshCurrent(), refreshMe()]);
      } else if (tab === 'winners') {
        await Promise.all([refreshCurrent(), refreshHistory()]);
      } else if (tab === 'admin') {
        await Promise.all([refreshCurrent(), refreshMe()]);
      } else if (tab === 'settings') {
        await refreshMe();
      } else {
        await Promise.all([refreshMe(), refreshCurrent(), refreshHistory()]);
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function enterGiveaway() {
    try {
      const data = await req('/api/giveaway/enter', 'POST', {});
      if (!data.ok) throw data;
      state.current = data;
      showMsg(data.message || 'Entry added');
    } catch (e) {
      showMsg(e.error || 'Could not enter giveaway', true);
    }
  }

  async function adminSave() {
    if (!state.user || state.user.role !== 'admin') return showMsg('Admin access required', true);
    const current = state.current?.giveaway || {};

    const title = String(document.getElementById('gw-admin-title')?.value || '').trim();
    const entry_requirement = String(document.getElementById('gw-admin-entry')?.value || '').trim();
    const reward = String(document.getElementById('gw-admin-reward')?.value || '').trim();
    const rules = String(current.rules || '').trim();
    const startRaw = String(document.getElementById('gw-admin-start')?.value || '').trim();
    const endRaw = String(document.getElementById('gw-admin-end')?.value || '').trim();
    const maxEntries = Number(document.getElementById('gw-admin-max')?.value || current.max_entries_per_user || 1) || 1;
    const status = String(document.getElementById('gw-admin-status')?.value || current.status || 'draft').trim();

    if (!title) return showMsg('Enter a giveaway title', true);
    if (!reward) return showMsg('Enter a reward', true);

    function parseLocal(value) {
      if (!value.trim()) return 0;
      const dt = new Date(value);
      return Number.isNaN(dt.getTime()) ? 0 : Math.floor(dt.getTime() / 1000);
    }

    try {
      const data = await req('/api/giveaway/admin/save', 'POST', {
        id: current.id || 0,
        title,
        entry_requirement: entry_requirement || '1 free entry',
        reward,
        rules,
        start_ts: parseLocal(startRaw),
        end_ts: parseLocal(endRaw),
        max_entries_per_user: Math.max(1, maxEntries),
        status: status || 'draft',
      });
      if (!data.ok) throw data;
      showMsg('Giveaway saved');
      await refreshAll();
    } catch (e) {
      showMsg(e.error || 'Save failed', true);
    }
  }

  async function adminStatus(status) {
    try {
      const current = state.current?.giveaway || {};
      const data = await req('/api/giveaway/admin/status', 'POST', { id: current.id || 0, status });
      if (!data.ok) throw data;
      showMsg(`Status set to ${status}`);
      await refreshAll();
    } catch (e) {
      showMsg(e.error || 'Status update failed', true);
    }
  }

  async function adminDraw() {
    if (!confirm('Pick a winner for the current draw now?')) return;
    try {
      const current = state.current?.giveaway || {};
      const data = await req('/api/giveaway/admin/draw', 'POST', { id: current.id || 0 });
      if (!data.ok) throw data;
      wheelState.lastSpinKey = '';
      showMsg(`Winner picked: ${data.giveaway?.winner_name || 'Unknown'}`);
      await refreshAll();
    } catch (e) {
      showMsg(e.error || 'Draw failed', true);
    }
  }

  function css() {
    return `
#giveaway-shield{position:fixed;right:0;top:50vh;transform:translateY(-50%);z-index:2147483647;width:120px;height:40px;border-radius:14px 0 0 14px;background:linear-gradient(180deg,#a51515 0%, #5e0d0d 100%);box-shadow:0 4px 14px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;cursor:pointer;user-select:none;letter-spacing:.5px;writing-mode:horizontal-tb;text-orientation:mixed;white-space:nowrap}
#giveaway-overlay{position:fixed;right:78px;top:110px;width:min(440px,92vw);max-height:78vh;overflow:auto;z-index:2147483646;background:#111;border:1px solid #571818;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.6);color:#eee;font:14px/1.35 Arial,sans-serif}
#giveaway-overlay.hidden{display:none}
.gw-head{position:sticky;top:0;background:linear-gradient(180deg,#2b0b0b,#120606);padding:10px 12px;border-bottom:1px solid #4e1717;display:flex;justify-content:space-between;align-items:center;z-index:2}
.gw-title{font-size:16px;font-weight:800}
.gw-body{padding:10px}
.gw-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px}
.gw-tab,.gw-btn{background:#220b0b;color:#f2d7d7;border:1px solid #5a2020;border-radius:10px;padding:8px 9px;text-align:center;cursor:pointer}
.gw-tab.active{background:#5a1717;color:#fff}
.gw-btn.primary{background:#7c1717;color:#fff;border-color:#a82b2b;font-weight:800}
.gw-btn.warn{background:#5b4110;border-color:#8d6720;color:#ffe2a2}
.gw-card{background:#181818;border:1px solid #2e2e2e;border-radius:12px;padding:10px;margin-bottom:10px}
.gw-hero{background:linear-gradient(180deg,#1f0c0c,#140909);border:1px solid #5f1f1f}
.gw-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.gw-grid-entrants-tools{align-items:end}
.gw-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.gw-label{font-size:11px;color:#bfa1a1;text-transform:uppercase;letter-spacing:.08em}
.gw-value{font-size:14px;font-weight:700;margin-top:2px;word-break:break-word}
.gw-list{display:flex;flex-direction:column;gap:6px}
.gw-row{display:flex;justify-content:space-between;gap:8px;padding:8px;border-radius:10px;background:#151515;border:1px solid #2b2b2b}
.gw-note{padding:8px 10px;border-radius:10px;margin-bottom:10px}
.gw-note.ok{background:#112814;border:1px solid #1f6d2d;color:#bff1c7}
.gw-note.err{background:#2b1010;border:1px solid #7f2323;color:#ffc7c7}
.gw-mini{font-size:12px;color:#b9b9b9}
.gw-spacer{height:6px}
.gw-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
.gw-hero-title{font-size:18px;font-weight:900;line-height:1.15}
.gw-status-pill{display:inline-flex;align-items:center;justify-content:center;min-width:74px;padding:6px 10px;border-radius:999px;background:#2b1212;border:1px solid #6f2424;font-size:12px;font-weight:800;text-transform:uppercase}
.gw-stat{background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:10px}
.gw-stat .gw-value{font-size:16px}
.gw-form{display:flex;flex-direction:column;gap:10px}
.gw-field{display:flex;flex-direction:column;gap:5px}
.gw-input,.gw-textarea,.gw-select{width:100%;box-sizing:border-box;background:#101010;border:1px solid #3a1a1a;border-radius:10px;color:#f3e6e6;padding:10px;font:14px Arial,sans-serif}
.gw-textarea{min-height:86px;resize:vertical}
.gw-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.gw-actions-3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.gw-subtle{color:#c8b4b4;font-size:12px}
.gw-overview-hero{padding:12px 12px 14px}
.gw-overview-main{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.gw-overview-title{font-size:20px;font-weight:900;line-height:1.1;margin-top:4px}
.gw-overview-countdown .gw-value{font-size:22px;line-height:1.05}
.gw-overview-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.gw-highlight{border-color:#5e2020;background:linear-gradient(180deg,#211010,#151010)}
.gw-enter-main{margin-top:10px}
.gw-winner-big{font-size:18px;font-weight:900}
.gw-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}

.gw-wheel-wrap{position:relative;display:flex;align-items:center;justify-content:center;padding-top:18px}
.gw-wheel-canvas{display:block;width:min(100%,380px);height:auto;background:radial-gradient(circle at center,#241010 0%,#140909 65%,#0f0808 100%);border:1px solid #5a2020;border-radius:50%;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.gw-wheel-pointer{position:absolute;top:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-top:0;border-bottom:26px solid #f6df90;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5));z-index:2}
.gw-history-row{display:flex;justify-content:space-between;gap:10px;padding:8px;border-radius:10px;background:#151515;border:1px solid #2b2b2b}
.gw-history-main{display:flex;flex-direction:column;gap:2px}
.gw-history-name{font-weight:800}
.gw-history-reward{font-weight:700;text-align:right}
.gw-countdown-big{font-size:22px;font-weight:900;line-height:1.05}
.gw-winner-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.gw-winner-badge{padding:6px 10px;border-radius:999px;background:#2b1212;border:1px solid #6f2424;font-size:12px;font-weight:800}
.gw-info-box,.gw-tos{background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:10px}
.gw-stat-num{font-size:16px;font-weight:800;word-break:break-word}
.gw-stat-label{font-size:11px;color:#bfa1a1;text-transform:uppercase;letter-spacing:.08em;margin-top:3px}
.gw-linkbtn{text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.gw-empty{padding:8px;border-radius:10px;background:#151515;border:1px solid #2b2b2b}

@media (max-width:640px){
  #giveaway-overlay{right:4vw;left:4vw;width:auto;top:80px;max-height:82vh}
  .gw-tabs{grid-template-columns:repeat(3,1fr)}
  .gw-grid,.gw-grid-3,.gw-actions,.gw-actions-3,.gw-overview-stats,.gw-detail-grid{grid-template-columns:1fr}
  #giveaway-shield{right:0;top:50vh;transform:translateY(-50%);width:104px;height:36px;border-radius:12px 0 0 12px;font-size:12px}
}
    `;
  }

  function ensureDom() {
    if (!document.getElementById('giveaway-style')) {
      GM_addStyle(css());
      const marker = document.createElement('div');
      marker.id = 'giveaway-style';
      marker.style.display = 'none';
      document.body.appendChild(marker);
    }

    let shield = document.getElementById('giveaway-shield');
    if (!shield) {
      shield = document.createElement('div');
      shield.id = 'giveaway-shield';
      shield.textContent = 'GIVEAWAY';
      if (window.__FRIES_GIVEAWAY_EMBEDDED__) shield.style.display = 'none';
      document.body.appendChild(shield);
      shield.addEventListener('click', toggleOverlay);
      makeDraggable(shield, K_SHIELD_POS);
      applyStoredPos(shield, K_SHIELD_POS, { right: '0', top: '50vh', transform: 'translateY(-50%)' });
    }

    let overlay = document.getElementById('giveaway-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'giveaway-overlay';
      document.body.appendChild(overlay);
      if (!getVal(K_OVERLAY_OPEN, false)) overlay.classList.add('hidden');
      makeDraggable(overlay, K_OVERLAY_POS, '.gw-head');
      applyStoredPos(overlay, K_OVERLAY_POS, { right: '78px', top: '90px' });

      render();
    }
  }

  function applyStoredPos(el, key, fallback) {
    const p = getVal(key, null);
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    if (p && typeof p === 'object') {
      const left = Number(p.left);
      const top = Number(p.top);
      const width = Math.max(80, el.offsetWidth || 120);
      const height = Math.max(36, el.offsetHeight || 40);
      const isValid = Number.isFinite(left) && Number.isFinite(top)
        && left > -width + 16
        && top > 0
        && left < vw - 16
        && top < vh - 16;

      if (isValid) {
        Object.assign(el.style, { left: `${left}px`, top: `${top}px`, right: 'auto', transform: 'none' });
        return;
      }

      setVal(key, null);
    }

    Object.assign(el.style, fallback);
  }

  function makeDraggable(el, key, handleSel) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const handle = handleSel ? () => el.querySelector(handleSel) : () => el;
    el.addEventListener('mousedown', (e) => {
      const h = handle();
      if (h && !h.contains(e.target)) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const left = ox + (e.clientX - sx);
      const top = oy + (e.clientY - sy);
      Object.assign(el.style, { left: `${left}px`, top: `${top}px`, right: 'auto', transform: 'none' });
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      const r = el.getBoundingClientRect();
      setVal(key, { left: Math.round(r.left), top: Math.round(r.top) });
    });
  }

  async function toggleOverlay() {
    const overlay = document.getElementById('giveaway-overlay');
    if (!overlay) return;
    const willOpen = overlay.classList.contains('hidden');
    overlay.classList.toggle('hidden');
    setVal(K_OVERLAY_OPEN, !overlay.classList.contains('hidden'));
    if (willOpen) {
      await refreshForTab(getVal(K_ACTIVE_TAB, 'overview'));
    }
  }

  function tabBtn(key, label) {
    const active = getVal(K_ACTIVE_TAB, 'overview') === key ? 'active' : '';
    return `<div class="gw-tab ${active}" data-tab="${key}">${label}</div>`;
  }

  function overviewTab() {
    const g = state.current?.giveaway;
    const c = state.current?.counts || { total_entries: 0, entrant_count: 0, my_entries: 0 };
    const canEnter = !!g && g.status === 'open';
    const loginLabel = state.user ? `Logged in as ${esc(state.user.user_name)}` : 'Login needed to enter';
    if (!g) return `<div class="gw-card"><div class="gw-value">No giveaway created yet</div></div>`;
    return `
      <div class="gw-card gw-hero gw-overview-hero">
        <div class="gw-overview-main">
          <div>
            <div class="gw-label">Current Giveaway</div>
            <div class="gw-overview-title">${esc(g.title || '-')}</div>
            <div class="gw-mini">${esc(loginLabel)}</div>
          </div>
          <div class="gw-status-pill">${esc(g.status || '-')}</div>
        </div>
        <div class="gw-grid" style="margin-bottom:8px;">
          <div class="gw-stat">
            <div class="gw-label">Reward</div>
            <div class="gw-value">${esc(g.reward || '-')}</div>
          </div>
          <div class="gw-stat gw-overview-countdown">
            <div class="gw-label">Countdown</div>
            <div class="gw-value" id="gw-live-countdown">${esc(countdownText(g.end_ts))}</div>
          </div>
        </div>
        <div class="gw-overview-stats">
          <div class="gw-stat"><div class="gw-label">Entrants</div><div class="gw-value">${c.entrant_count}</div></div>
          <div class="gw-stat"><div class="gw-label">Total Entries</div><div class="gw-value">${c.total_entries}</div></div>
          <div class="gw-stat"><div class="gw-label">My Entries</div><div class="gw-value">${c.my_entries}</div></div>
          <div class="gw-stat"><div class="gw-label">Max Per User</div><div class="gw-value">${g.max_entries_per_user || 1}</div></div>
        </div>
        <div class="gw-btn primary gw-enter-main" id="gw-overview-enter-btn">${canEnter ? 'Enter Giveaway' : 'Giveaway Not Open'}</div>
      </div>
      <div class="gw-card gw-highlight">
        <div class="gw-label">Winner</div>
        <div class="gw-winner-big">${esc(g.winner_name || 'Not drawn yet')}</div>
      </div>
      <div class="gw-card">
        <div class="gw-label">Giveaway Details</div>
        <div class="gw-spacer"></div>
        <div class="gw-detail-grid">
          <div><div class="gw-label">Entry Requirement</div><div class="gw-value">${esc(g.entry_requirement || '-')}</div></div>
          <div><div class="gw-label">Start</div><div class="gw-value">${esc(fmtTs(g.start_ts))}</div></div>
          <div><div class="gw-label">End</div><div class="gw-value">${esc(fmtTs(g.end_ts))}</div></div>
          <div><div class="gw-label">Status</div><div class="gw-value">${esc(g.status || '-')}</div></div>
        </div>
      </div>
    `;
  }


  function entrantsTab() {
    if (!state.user || state.user.role !== 'admin') {
      return `<div class="gw-card"><div class="gw-value">Admin access only</div></div>`;
    }
    const rawEntrants = Array.isArray(state.current?.entrants) ? [...state.current.entrants] : [];
    const search = String(state.entrantSearch || '').trim().toLowerCase();
    const sort = state.entrantSort || 'az';
    const entrants = rawEntrants
      .filter(e => !search || String(e.user_name || '').toLowerCase().includes(search) || String(e.user_id || '').includes(search))
      .sort((a, b) => {
        if (sort === 'entries_desc') return Number(b.entries || 0) - Number(a.entries || 0) || String(a.user_name || '').localeCompare(String(b.user_name || ''));
        if (sort === 'entries_asc') return Number(a.entries || 0) - Number(b.entries || 0) || String(a.user_name || '').localeCompare(String(b.user_name || ''));
        return String(a.user_name || '').localeCompare(String(b.user_name || ''));
      });

    return `
      <div class="gw-card">
        <div class="gw-grid gw-grid-entrants-tools">
          <div class="gw-field">
            <label class="gw-label" for="gw-entrant-search">Search</label>
            <input class="gw-input" id="gw-entrant-search" type="text" value="${esc(state.entrantSearch || '')}" placeholder="Name or ID">
          </div>
          <div class="gw-field">
            <label class="gw-label" for="gw-entrant-sort">Sort</label>
            <select class="gw-select" id="gw-entrant-sort">
              <option value="az" ${sort === 'az' ? 'selected' : ''}>A-Z</option>
              <option value="entries_desc" ${sort === 'entries_desc' ? 'selected' : ''}>Most Entries</option>
              <option value="entries_asc" ${sort === 'entries_asc' ? 'selected' : ''}>Least Entries</option>
            </select>
          </div>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div><div class="gw-label">Visible Entrants</div><div class="gw-value">${entrants.length}</div></div>
          <div><div class="gw-label">Total Entrants</div><div class="gw-value">${rawEntrants.length}</div></div>
        </div>
      </div>
      <div class="gw-card">
        <div class="gw-label">Entrants</div>
        <div class="gw-list">
          ${entrants.length ? entrants.map(e => `<div class="gw-row"><div><b>${esc(e.user_name)}</b> <span class="gw-mini">[${e.user_id}]</span></div><div>${Number(e.entries || 0)} ${Number(e.entries || 0) === 1 ? 'entry' : 'entries'}</div></div>`).join('') : '<div class="gw-row"><div>No matching entrants</div></div>'}
        </div>
      </div>
    `;
  }

  function adminTab() {
    if (!state.user || state.user.role !== 'admin') {
      return `<div class="gw-card"><div class="gw-value">Admin access only</div></div>`;
    }
    const g = state.current?.giveaway || {};
    const c = state.current?.counts || { total_entries: 0, entrant_count: 0 };
    const winnerName = g.winner_name || 'Not picked yet';
    const winnerId = g.winner_user_id || 0;
    const drawnAt = g.drawn_ts ? fmtTs(g.drawn_ts) : '-';

    return `
      <div class="gw-card">
        <div class="gw-label">Giveaway Setup</div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div>
            <div class="gw-label">Title</div>
            <input class="gw-input" id="gw-admin-title" value="${esc(g.title || '')}" placeholder="Giveaway title" />
          </div>
          <div>
            <div class="gw-label">Entry Requirement</div>
            <input class="gw-input" id="gw-admin-entry" value="${esc(g.entry_requirement || '')}" placeholder="Entry requirement" />
          </div>
          <div>
            <div class="gw-label">Reward</div>
            <input class="gw-input" id="gw-admin-reward" value="${esc(g.reward || '')}" placeholder="Reward" />
          </div>
          <div>
            <div class="gw-label">Max Entries</div>
            <input class="gw-input" id="gw-admin-max" type="number" min="1" value="${Number(g.max_entries_per_user || 1)}" />
          </div>
          <div>
            <div class="gw-label">Start</div>
            <input class="gw-input" id="gw-admin-start" value="${g.start_ts ? new Date(g.start_ts * 1000).toISOString().slice(0,16).replace('T',' ') : ''}" placeholder="YYYY-MM-DD HH:MM" />
          </div>
          <div>
            <div class="gw-label">End</div>
            <input class="gw-input" id="gw-admin-end" value="${g.end_ts ? new Date(g.end_ts * 1000).toISOString().slice(0,16).replace('T',' ') : ''}" placeholder="YYYY-MM-DD HH:MM" />
          </div>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-stat">
            <div class="gw-stat-num">${esc(g.status || '-')}</div>
            <div class="gw-stat-label">Status</div>
          </div>
          <div class="gw-stat">
            <div class="gw-stat-num">${c.entrant_count}</div>
            <div class="gw-stat-label">Entrants</div>
          </div>
          <div class="gw-stat">
            <div class="gw-stat-num">${c.total_entries}</div>
            <div class="gw-stat-label">Total Entries</div>
          </div>
          <div class="gw-stat">
            <div class="gw-stat-num">${esc(drawnAt)}</div>
            <div class="gw-stat-label">Draw Time</div>
          </div>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-btn" id="gw-admin-save">Save</div>
          <div class="gw-btn" id="gw-admin-open">Open</div>
          <div class="gw-btn" id="gw-admin-close">Close</div>
          <div class="gw-btn" id="gw-admin-pick">Pick Winner</div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-label">Winner</div>
        <div class="gw-spacer"></div>
        <div class="gw-winner-top">
          <div>
            <div class="gw-value">${esc(winnerName)}</div>
            <div class="gw-mini">${winnerId ? `Torn ID: ${winnerId}` : 'No winner picked yet'}</div>
          </div>
          <div class="gw-winner-badge">${g.status === 'drawn' ? 'Picked' : 'Waiting'}</div>
        </div>
        <div class="gw-spacer"></div>
        ${winnerId ? `<a class="gw-btn gw-linkbtn" href="https://www.torn.com/profiles.php?XID=${winnerId}" target="_blank" rel="noopener noreferrer">Open Winner Profile</a>` : ''}
      </div>
    `;
  }

  function winnersTab() {
    const g = state.current?.giveaway || {};
    const winnerName = g.winner_name || 'Not drawn yet';
    const winnerId = g.winner_user_id || 0;
    const drawnAt = g.drawn_ts ? fmtTs(g.drawn_ts) : '-';
    return `
      <div class="gw-card gw-hero">
        <div class="gw-winner-top">
          <div>
            <div class="gw-label">Current Winner</div>
            <div class="gw-countdown-big">${esc(winnerName)}</div>
            <div class="gw-mini">${winnerId ? `Torn ID: ${winnerId}` : 'No winner selected yet'}</div>
          </div>
          <div class="gw-winner-badge">${g.status === 'drawn' ? 'Drawn' : 'Pending'}</div>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-stat">
            <div class="gw-stat-num">${esc(g.reward || '-')}</div>
            <div class="gw-stat-label">Reward</div>
          </div>
          <div class="gw-stat">
            <div class="gw-stat-num">${esc(drawnAt)}</div>
            <div class="gw-stat-label">Draw Time</div>
          </div>
        </div>
      </div>
      <div class="gw-card">
        <div class="gw-label">Winner History</div>
        <div class="gw-spacer"></div>
        <div class="gw-list">
          ${state.history.length ? state.history.map(h => `
            <div class="gw-history-row">
              <div class="gw-history-main">
                <div class="gw-history-name">${esc(h.user_name || 'Unknown')}</div>
                <div class="gw-mini">${esc(h.title || 'Giveaway')}</div>
                <div class="gw-mini">${esc(h.drawn_ts ? fmtTs(h.drawn_ts) : '-')}</div>
              </div>
              <div class="gw-history-reward">${esc(h.reward || '-')}</div>
            </div>
          `).join('') : '<div class="gw-empty">No winners yet</div>'}
        </div>
      </div>
    `;
  }

  function settingsTab() {
    const apiKeySaved = String(getVal(K_API_KEY, '') || '').trim();
    return `
      <div class="gw-card">
        <div class="gw-label">Account</div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-info-box">
            <div class="gw-label">Logged In As</div>
            <div class="gw-value">${state.user ? esc(state.user.user_name || '-') : 'Not logged in'}</div>
          </div>
          <div class="gw-info-box">
            <div class="gw-label">Role</div>
            <div class="gw-value">${state.user ? esc(state.user.role || 'user') : '-'}</div>
          </div>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-btn" id="gw-login-btn">${state.user ? 'Re-Login' : 'Login'}</div>
          <div class="gw-btn" id="gw-logout-btn">Logout</div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-label">Storage</div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-info-box">
            <div class="gw-label">API Key Saved</div>
            <div class="gw-value">${apiKeySaved ? 'Yes' : 'No'}</div>
          </div>
          <div class="gw-info-box">
            <div class="gw-label">Session Saved</div>
            <div class="gw-value">${getVal(K_SESSION, '') ? 'Yes' : 'No'}</div>
          </div>
        </div>
        <div class="gw-spacer"></div>
        <div class="gw-grid">
          <div class="gw-btn" id="gw-clear-session-btn">Clear Session</div>
          <div class="gw-btn" id="gw-clear-apikey-btn">Clear API Key</div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-label">ToS</div>
        <div class="gw-spacer"></div>
        <div class="gw-tos">
          This overlay should be used in line with Torn's rules and API terms. Use your own API key only. Do not share your API key with other players. The script stores your API key and session locally in your userscript storage on your device so it can log you in and keep the overlay working. This script should only use your key for giveaway login and related giveaway data requests.
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-label">API Key Storage & Use</div>
        <div class="gw-spacer"></div>
        <div class="gw-tos">
          Your API key is saved locally in userscript storage on your device, not shown openly in the overlay, and reused for login when needed. Your saved session token is also stored locally to reduce repeated logins. Clear either one anytime using the storage buttons above.
        </div>
      </div>
    `;
  }

  function toggleOverlay() {
    const overlay = document.getElementById('giveaway-overlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden');
    setVal(K_OVERLAY_OPEN, !overlay.classList.contains('hidden'));
  }

  window.__FRIES_GIVEAWAY_BRIDGE__ = {
    open: async function () {
      ensureDom();
      const overlay = document.getElementById('giveaway-overlay');
      if (!overlay) return;
      overlay.classList.remove('hidden');
      setVal(K_OVERLAY_OPEN, true);
      await refreshForTab(getVal(K_ACTIVE_TAB, 'overview'));
    },
    close: function () {
      const overlay = document.getElementById('giveaway-overlay');
      if (!overlay) return;
      overlay.classList.add('hidden');
      setVal(K_OVERLAY_OPEN, false);
    },
    toggle: async function () {
      const overlay = document.getElementById('giveaway-overlay');
      if (!overlay || overlay.classList.contains('hidden')) {
        await this.open();
      } else {
        this.close();
      }
    }
  };

  function bindEvents() {
    document.querySelectorAll('.gw-tab').forEach(el => {
      el.onclick = async () => {
        const tab = el.dataset.tab || 'overview';
        setVal(K_ACTIVE_TAB, tab);
        render();
        await refreshForTab(tab);
      };
    });
    document.getElementById('gw-enter-btn')?.addEventListener('click', () => state.user ? enterGiveaway() : login());
    document.getElementById('gw-overview-enter-btn')?.addEventListener('click', () => {
      const g = state.current?.giveaway;
      if (!g || g.status !== 'open') return showMsg('Giveaway is not open', true);
      return state.user ? enterGiveaway() : login();
    });
    document.getElementById('gw-login-btn')?.addEventListener('click', login);
    document.getElementById('gw-logout-btn')?.addEventListener('click', logout);
    document.getElementById('gw-clear-session-btn')?.addEventListener('click', () => {
      setVal(K_SESSION, '');
      state.user = null;
      showMsg('Saved session cleared');
      refreshAll();
    });
    document.getElementById('gw-clear-apikey-btn')?.addEventListener('click', () => {
      setVal(K_API_KEY, '');
      showMsg('Saved API key cleared');
      render();
    });
    document.getElementById('gw-entrant-search')?.addEventListener('input', (e) => {
      state.entrantSearch = e.target.value || '';
      render();
    });
    document.getElementById('gw-entrant-sort')?.addEventListener('change', (e) => {
      state.entrantSort = e.target.value || 'az';
      render();
    });
    document.getElementById('gw-wheel-preview-btn')?.addEventListener('click', () => {
      if (!getWheelSlices().length) return showMsg('No entrants to place on the wheel yet', true);
      spinPreviewWheel();
    });
    document.getElementById('gw-wheel-refresh-btn')?.addEventListener('click', () => {
      const giveawayId = getGiveawayId();
      const store = getStoredObject(K_WHEEL_LAYOUTS);
      delete store[giveawayId];
      setStoredObject(K_WHEEL_LAYOUTS, store);
      wheelState.rotation = 0;
      wheelState.lastSpinKey = '';
      drawWheel();
      render();
    });
    document.getElementById('gw-admin-save')?.addEventListener('click', async () => {
      if (!state.user || state.user.role !== 'admin') return showMsg('Admin access required', true);
      const current = state.current?.giveaway || {};
      const title = document.getElementById('gw-admin-title')?.value || '';
      const entry_requirement = document.getElementById('gw-admin-entry')?.value || '';
      const reward = document.getElementById('gw-admin-reward')?.value || '';
      const maxEntries = document.getElementById('gw-admin-max')?.value || '1';
      const startRaw = document.getElementById('gw-admin-start')?.value || '';
      const endRaw = document.getElementById('gw-admin-end')?.value || '';

      function parseLocal(value) {
        if (!String(value).trim()) return 0;
        const dt = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(dt.getTime()) ? 0 : Math.floor(dt.getTime() / 1000);
      }

      try {
        const data = await req('/api/giveaway/admin/save', 'POST', {
          id: current.id || 0,
          title,
          entry_requirement,
          reward,
          rules: current.rules || '',
          start_ts: parseLocal(startRaw),
          end_ts: parseLocal(endRaw),
          max_entries_per_user: Number(maxEntries) || 1,
          status: current.status || 'closed',
        });
        if (!data.ok) throw data;
        showMsg('Giveaway saved');
        await refreshAll();
      } catch (e) {
        showMsg(e.error || 'Save failed', true);
      }
    });
    document.getElementById('gw-admin-open')?.addEventListener('click', () => adminStatus('open'));
    document.getElementById('gw-admin-close')?.addEventListener('click', () => adminStatus('closed'));
    document.getElementById('gw-admin-pick')?.addEventListener('click', adminDraw);
  }

  function render() {
    const overlay = document.getElementById('giveaway-overlay');
    if (!overlay) return;
    let tab = getVal(K_ACTIVE_TAB, 'overview');
    if (tab === 'enter') {
      tab = 'overview';
      setVal(K_ACTIVE_TAB, 'overview');
    }
    if (tab === 'entrants' && (!state.user || state.user.role !== 'admin')) {
      tab = 'overview';
      setVal(K_ACTIVE_TAB, 'overview');
    }
    const body = {
      overview: overviewTab,
      wheel: wheelTab,
      entrants: entrantsTab,
      winners: winnersTab,
      admin: adminTab,
      settings: settingsTab,
    }[tab] || overviewTab;

    overlay.innerHTML = `
      <div class="gw-head">
        <div class="gw-title">Torn Giveaway</div>
        <div class="gw-btn" id="gw-close">Close</div>
      </div>
      <div class="gw-body">
        ${state.message ? `<div class="gw-note ok">${esc(state.message)}</div>` : ''}
        ${state.error ? `<div class="gw-note err">${esc(state.error)}</div>` : ''}
        <div class="gw-tabs">
          ${tabBtn('overview', 'Overview')}
          ${tabBtn('wheel', 'Wheel')}
          ${state.user && state.user.role === 'admin' ? tabBtn('entrants', 'Entrants') : ''}
          ${tabBtn('winners', 'Winners')}
          ${tabBtn('admin', 'Admin')}
          ${tabBtn('settings', 'Settings')}
        </div>
        ${state.loading ? '<div class="gw-card"><div class="gw-value">Loading...</div></div>' : body()}
      </div>
    `;
    document.getElementById('gw-close')?.addEventListener('click', toggleOverlay);
    bindEvents();
    initWheelTab();
  }

  function startWatch() {
    if (watchStarted) return;
    watchStarted = true;

    ensureTimer = setInterval(() => {
      ensureDom();
      const g = state.current?.giveaway;
      const overlay = document.getElementById('giveaway-overlay');
      if (!overlay || overlay.classList.contains('hidden')) return;

      const activeTab = getVal(K_ACTIVE_TAB, 'overview');

      if (g && activeTab === 'overview') {
        const countdownEl = document.getElementById('gw-live-countdown');
        if (countdownEl) countdownEl.textContent = countdownText(g.end_ts);
      }

      if (activeTab === 'wheel') {
        drawWheel();
        maybeSpinWinningWheel();
      }
    }, 1000);
  }

  async function boot() {
    if (document.body?.dataset?.giveawayBooted === '1') return;
    if (document.body) document.body.dataset.giveawayBooted = '1';

    ensureDom();
    await tryAutoLogin();
    await refreshAll();
    startWatch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* ===== Fries Hub final cleanup: hidden standalone launchers + header-level hub button ===== */
try {
  GM_addStyle(`
    #warhub-shield,
    #warhub-badge,
    #si-pda-launcher,
    #giveaway-shield,
    #warhub-shield button,
    #warhub-badge * {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    #fries-torn-hub-status-slot,
    #fries-torn-hub-shield {
      z-index: 2 !important;
    }
    #fries-torn-hub-overlay,
    .thub-window,
    #warhub-overlay,
    #si-pda-overlay,
    #giveaway-overlay {
      z-index: 2147483646 !important;
    }
  `);
} catch (_) {}
