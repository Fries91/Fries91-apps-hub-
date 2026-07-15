// ==UserScript==
// @name         🍟 Fries91's Faction Apps
// @namespace    torn.hub.fries91
// @version      0.8.0
// @description  One PDA/PC launcher for Fries91 Torn apps with live-source updates, cached fallbacks, alerts, and duplicate-icon control.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @include      https://www.torn.com/*
// @include      https://torn.com/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @connect      raw.githubusercontent.com
// @connect      torn-war-bot.onrender.com
// @connect      xanax-insurance.onrender.com
// @connect      sinner-s-lottery.onrender.com
// @connect      trains-selling-enterprise.onrender.com
// @connect      faction-bankers-request.onrender.com
// @connect      torn-banking-push.onrender.com
// @connect      fries91-torn-profit-brain.onrender.com
// @connect      torn-100k-chain-command.onrender.com
// @connect      ffscouter.com
// @connect      api.torn.com
// @connect      *
// ==/UserScript==

(function () {
  "use strict";

  if (window.__FRIES91_FACTION_APPS_V080__) return;
  window.__FRIES91_FACTION_APPS_V080__ = true;

  const BUILD = "0.8.0";
  const SOURCE_MAX_AGE = 6 * 60 * 60 * 1000;
  const IDS = {
    slot: "fries91-hub-slot-v080",
    button: "fries91-hub-button-v080",
    buttonBadge: "fries91-hub-button-badge-v080",
    chainLight: "fries91-hub-chain-light-v080",
    overlay: "fries91-hub-overlay-v080",
    panel: "fries91-hub-panel-v080",
    cards: "fries91-hub-cards-v080",
    status: "fries91-hub-status-v080",
    toast: "fries91-hub-toast-v080",
    style: "fries91-hub-style-v080"
  };

  const KEY = {
    open: "fries91_hub_v080_open",
    cachePrefix: "fries91_hub_v080_source_",
    cacheTsPrefix: "fries91_hub_v080_source_ts_",
    versionPrefix: "fries91_hub_v080_source_version_",
    backgroundPrefix: "fries91_hub_v080_background_"
  };

  const state = {
    mounted: false,
    open: false,
    loading: new Map(),
    running: new Set(),
    status: new Map(),
    versions: new Map(),
    sourceMode: new Map(),
    updateBusy: false,
    lastHeaderTarget: null,
    mountTimer: null,
    backgroundTimers: [],
    toastTimer: null
  };

  const APPS = [
    {
      id: "war",
      icon: "⚔️",
      name: "War & Chain",
      known: "3.7.2+",
      description: "War overview, enemies, hospital, chain, members, terms and admin.",
      url: "https://torn-war-bot.onrender.com/static/war-bot.user.js",
      bridge: "__FRIES_WARHUB_BRIDGE__",
      readySelectors: ["#warhub-overlay", "#warhub-shield"],
      openSelectors: ["#warhub-shield", "#warhub-badge"],
      backgroundDefault: false
    },
    {
      id: "insurance",
      icon: "💊",
      name: "Sinner's Insurance",
      known: "4.0.x",
      description: "Faction insurance plans, claims, coverage and administration.",
      url: "https://raw.githubusercontent.com/Fries91/xanax-insurance/main/static/xanax-insurance.user.js",
      bridge: "__FRIES_INSURANCE_BRIDGE__",
      readySelectors: ["#si-pda-overlay", "#si-pda-launcher"],
      openSelectors: ["#si-pda-launcher button", "#si-pda-launcher"],
      backgroundDefault: false
    },
    {
      id: "giveaway",
      icon: "🎁",
      name: "Faction Giveaway",
      known: "1.4.4+",
      description: "Free faction giveaway rounds, entrants, winners and wheel.",
      url: "https://sinner-s-lottery.onrender.com/static/giveaway.user.js",
      bridge: "__FRIES_GIVEAWAY_BRIDGE__",
      readySelectors: ["#giveaway-overlay", "#giveaway-shield"],
      openSelectors: ["#giveaway-shield"],
      backgroundDefault: false
    },
    {
      id: "tse",
      icon: "🚆",
      name: "T.S.E Headquarters",
      known: "8.7.0+",
      description: "Companies, trains, Hall of Fame search, notes and company keys.",
      url: "https://raw.githubusercontent.com/Fries91/Trains-Selling-Enterprise-/main/static/tse-headquarters.user.js",
      bridge: "__FRIES_COMPANY_HUB_BRIDGE__",
      readySelectors: ["#tse-hq-overlay", "#tse-overlay", "#tse-hq-badge", "#tse-badge"],
      openSelectors: ["#tse-hq-badge", "#tse-badge", "[id^='tse-'][id*='badge']"],
      backgroundDefault: false
    },
    {
      id: "bankers",
      icon: "🪙",
      name: "Faction Bankers",
      known: "1.6.4+",
      description: "Bank requests, banker alerts, balances and completion history.",
      url: "https://faction-bankers-request.onrender.com/static/faction-bankers.user.js",
      readySelectors: ["#fb-overlay", "#fb-bank-coin-clean", "#fb-setup-button"],
      openSelectors: ["#fb-bank-coin-clean", "#fb-setup-button"],
      backgroundDefault: true
    },
    {
      id: "assist",
      icon: "🆘",
      name: "Assist Button",
      known: "3.7.0",
      description: "One-tap faction assist call on Torn attack pages with single-send lock.",
      url: "https://raw.githubusercontent.com/Fries91/Assist-alert-button/main/static/assist-alert-button.user.js",
      readySelectors: ["#fries91-assist-lite-bar", "#fries91-assist-lite-toast"],
      openSelectors: ["#fries91-assist-lite-bar"],
      backgroundDefault: true,
      assistMode: true
    },
    {
      id: "brain",
      icon: "🧠",
      name: "AI Brain",
      known: "1.10.16+",
      description: "Stock, item, travel-profit and smart market learning tools.",
      url: "https://fries91-torn-profit-brain.onrender.com/static/torn-brain.user.js",
      readySelectors: ["#tb-panel", "#tb-icon"],
      openSelectors: ["#tb-icon"],
      backgroundDefault: true
    },
    {
      id: "chain100k",
      icon: "⛓️",
      name: "100K Chain Command",
      known: "2.1.4+",
      description: "Live chain timer, members, watcher scheduling and milestones.",
      url: "https://torn-100k-chain-command.onrender.com/chain-command.user.js",
      alternateUrls: [
        "https://torn-100k-chain-command.onrender.com/static/chain-command.user.js",
        "https://torn-100k-chain-command.onrender.com/public/chain-command.user.js"
      ],
      readySelectors: ["#tcc-native-overlay", "#tcc-native-button"],
      openSelectors: ["#tcc-native-button"],
      backgroundDefault: true
    }
  ];

  function gv(key, fallback) {
    try { return GM_getValue(key, fallback); } catch (_) { return fallback; }
  }

  function sv(key, value) {
    try { GM_setValue(key, value); } catch (_) {}
  }

  function dv(key) {
    try { GM_deleteValue(key); } catch (_) {}
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function appById(id) {
    return APPS.find((app) => app.id === id);
  }

  function backgroundEnabled(app) {
    return Boolean(gv(KEY.backgroundPrefix + app.id, app.backgroundDefault));
  }

  function setBackgroundEnabled(app, enabled) {
    sv(KEY.backgroundPrefix + app.id, Boolean(enabled));
  }

  function anySelector(selectors) {
    for (const selector of selectors || []) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch (_) {}
    }
    return null;
  }

  function appReady(app) {
    if (!app) return false;
    try {
      if (app.bridge && window[app.bridge] && typeof window[app.bridge].open === "function") return true;
    } catch (_) {}
    return Boolean(anySelector(app.readySelectors));
  }

  function setStatus(appId, text, kind = "normal") {
    state.status.set(appId, { text, kind });
    renderCards();
  }

  function showHubStatus(text, kind = "normal") {
    const element = document.getElementById(IDS.status);
    if (!element) return;
    element.textContent = text || "";
    element.dataset.kind = kind;
  }

  function showToast(text, kind = "normal") {
    let toast = document.getElementById(IDS.toast);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = IDS.toast;
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.dataset.kind = kind;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout: 30000,
          headers: { Accept: "text/javascript,text/plain,*/*" },
          onload: (response) => {
            const text = String(response.responseText || "");
            if (response.status >= 200 && response.status < 300 && text.length > 200) {
              finish(resolve, { text, url });
            } else {
              finish(reject, new Error(`HTTP ${response.status || 0}`));
            }
          },
          onerror: () => finish(reject, new Error("Network error")),
          ontimeout: () => finish(reject, new Error("Request timed out"))
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function fetchAppSource(app) {
    const urls = [app.url, ...(app.alternateUrls || [])];
    let lastError = null;

    for (const url of urls) {
      try {
        const result = await requestText(url);
        if (!/==UserScript==|^\s*\(function|^\s*["']use strict/m.test(result.text)) {
          throw new Error("The downloaded file was not a userscript.");
        }
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("No working source URL.");
  }

  function extractVersion(source) {
    const match = String(source || "").match(/^\s*\/\/\s*@version\s+([^\r\n]+)/m);
    return match ? match[1].trim() : "live";
  }

  function stripMetadata(source) {
    return String(source || "")
      .replace(/^\uFEFF/, "")
      .replace(/^\s*\/\/\s*==UserScript==[\s\S]*?^\s*\/\/\s*==\/UserScript==\s*/m, "");
  }

  function cacheSource(app, source) {
    sv(KEY.cachePrefix + app.id, source);
    sv(KEY.cacheTsPrefix + app.id, Date.now());
    const version = extractVersion(source);
    sv(KEY.versionPrefix + app.id, version);
    state.versions.set(app.id, version);
  }

  function cachedSource(app) {
    return String(gv(KEY.cachePrefix + app.id, "") || "");
  }

  function cachedTimestamp(app) {
    return Number(gv(KEY.cacheTsPrefix + app.id, 0)) || 0;
  }

  function executeSource(app, source) {
    const body = stripMetadata(source);
    if (!body || body.length < 100) throw new Error("The app source was empty.");

    const tagged = `${body}\n//# sourceURL=fries91-hub-${app.id}.user.js`;
    try {
      eval(tagged);
      return;
    } catch (firstError) {
      try {
        const runner = new Function(
          "GM_addStyle",
          "GM_getValue",
          "GM_setValue",
          "GM_deleteValue",
          "GM_xmlhttpRequest",
          "GM_registerMenuCommand",
          "GM_info",
          tagged
        );
        runner(
          typeof GM_addStyle === "function" ? GM_addStyle : undefined,
          typeof GM_getValue === "function" ? GM_getValue : undefined,
          typeof GM_setValue === "function" ? GM_setValue : undefined,
          typeof GM_deleteValue === "function" ? GM_deleteValue : undefined,
          typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : undefined,
          typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : undefined,
          typeof GM_info !== "undefined" ? GM_info : undefined
        );
      } catch (secondError) {
        console.error(`Fries91 Hub could not execute ${app.id}:`, firstError, secondError);
        throw secondError;
      }
    }
  }

  function waitForReady(app, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (appReady(app)) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeout) {
          reject(new Error("App started but its launcher did not appear."));
          return;
        }
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  async function loadApp(app, options = {}) {
    if (!app) throw new Error("Unknown app.");
    if (appReady(app) || state.running.has(app.id)) {
      state.running.add(app.id);
      setStatus(app.id, "Ready", "good");
      return { cached: false, already: true };
    }

    if (state.loading.has(app.id)) return state.loading.get(app.id);

    const promise = (async () => {
      setStatus(app.id, "Loading…", "loading");

      let source = "";
      let sourceMode = "live";
      const cache = cachedSource(app);
      const cacheFresh = cache && Date.now() - cachedTimestamp(app) < SOURCE_MAX_AGE;

      if (!options.forceNetwork && cacheFresh) {
        source = cache;
        sourceMode = "cached";
      } else {
        try {
          const result = await fetchAppSource(app);
          source = result.text;
          sourceMode = "live";
          cacheSource(app, source);
        } catch (networkError) {
          if (!cache) throw networkError;
          source = cache;
          sourceMode = "cached fallback";
        }
      }

      state.versions.set(app.id, extractVersion(source));
      state.sourceMode.set(app.id, sourceMode);
      executeSource(app, source);

      try {
        await waitForReady(app, app.assistMode ? 5500 : 16000);
      } catch (readyError) {
        if (!app.assistMode) throw readyError;
      }

      state.running.add(app.id);
      setStatus(app.id, sourceMode === "live" ? "Ready • live" : `Ready • ${sourceMode}`, "good");
      suppressStandaloneLaunchers();
      syncBadges();
      return { cached: sourceMode !== "live", already: false };
    })()
      .catch((error) => {
        setStatus(app.id, `Error: ${error.message || error}`, "bad");
        throw error;
      })
      .finally(() => {
        state.loading.delete(app.id);
      });

    state.loading.set(app.id, promise);
    return promise;
  }

  function clickOpenSelector(app) {
    const element = anySelector(app.openSelectors);
    if (!element) return false;
    try {
      element.click();
      return true;
    } catch (_) {
      try {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  function bridgeOpen(app) {
    try {
      const bridge = app.bridge ? window[app.bridge] : null;
      if (bridge && typeof bridge.open === "function") {
        bridge.open();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function isAttackPage() {
    const value = `${location.pathname}${location.search}${location.hash}`.toLowerCase();
    return value.includes("sid=attack") || value.includes("loader.php?sid=attack");
  }

  async function openApp(appId) {
    const app = appById(appId);
    if (!app) return;

    closeHub();
    try {
      await loadApp(app);

      if (app.assistMode) {
        if (!isAttackPage()) {
          showToast("Assist is active. It appears automatically on Torn attack pages; faction chat must be open.", "good");
          return;
        }
        const bar = document.getElementById("fries91-assist-lite-bar");
        if (bar) {
          bar.scrollIntoView({ block: "center", behavior: "smooth" });
          bar.classList.add("fries91-hub-highlight");
          setTimeout(() => bar.classList.remove("fries91-hub-highlight"), 1600);
          showToast("Assist button is ready on this attack page.", "good");
        } else {
          showToast("Assist loaded. Reopen this attack page if the button has not mounted yet.", "warn");
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
      const opened = bridgeOpen(app) || clickOpenSelector(app);
      if (!opened) {
        throw new Error("The app loaded, but the Hub could not find its open button.");
      }
    } catch (error) {
      console.error(`Fries91 Hub open failed for ${app.id}:`, error);
      showToast(`${app.name}: ${error.message || error}`, "bad");
      openHub();
    }
  }

  async function updateOneSource(app, silent = false) {
    try {
      if (!silent) setStatus(app.id, "Checking update…", "loading");
      const result = await fetchAppSource(app);
      cacheSource(app, result.text);
      state.sourceMode.set(app.id, "updated cache");
      const version = extractVersion(result.text);

      if (appReady(app)) {
        setStatus(app.id, `v${version} saved • reload Torn to apply`, "warn");
      } else {
        setStatus(app.id, `v${version} saved`, "good");
      }
      return { ok: true, version };
    } catch (error) {
      const hasCache = Boolean(cachedSource(app));
      setStatus(
        app.id,
        hasCache ? "Live check failed • cached copy kept" : `Update error: ${error.message || error}`,
        hasCache ? "warn" : "bad"
      );
      return { ok: false, error };
    }
  }

  async function updateAllSources() {
    if (state.updateBusy) return;
    state.updateBusy = true;
    showHubStatus("Checking all eight app sources…", "loading");
    renderCards();

    let success = 0;
    for (const app of APPS) {
      const result = await updateOneSource(app, false);
      if (result.ok) success += 1;
    }

    state.updateBusy = false;
    showHubStatus(
      success === APPS.length
        ? "All app sources are updated. Reload Torn once to apply updates to apps already running."
        : `${success}/${APPS.length} sources updated. Cached copies were kept for any sleeping service.`,
      success === APPS.length ? "good" : "warn"
    );
    renderCards();
  }

  function sourceVersion(app) {
    return state.versions.get(app.id)
      || String(gv(KEY.versionPrefix + app.id, "") || "")
      || app.known;
  }

  function cardStatus(app) {
    if (state.loading.has(app.id)) return { text: "Loading…", kind: "loading" };
    const current = state.status.get(app.id);
    if (current) return current;
    if (appReady(app)) return { text: "Ready", kind: "good" };
    if (cachedSource(app)) return { text: "Update cached", kind: "normal" };
    return { text: "Not loaded", kind: "normal" };
  }

  function renderCards() {
    const cards = document.getElementById(IDS.cards);
    if (!cards) return;

    cards.innerHTML = APPS.map((app) => {
      const status = cardStatus(app);
      const isBackground = backgroundEnabled(app);
      const badge = app.id === "bankers"
        ? `<span class="fries91-card-alert" id="fries91-card-bank-badge" hidden>0</span>`
        : app.id === "brain"
          ? `<span class="fries91-card-alert brain" id="fries91-card-brain-badge" hidden>0</span>`
          : app.id === "chain100k"
            ? `<span class="fries91-chain-card-state" id="fries91-chain-card-state">•</span>`
            : "";

      return `
        <article class="fries91-app-card" data-app="${esc(app.id)}">
          <div class="fries91-card-main">
            <div class="fries91-card-icon">${app.icon}${badge}</div>
            <div class="fries91-card-copy">
              <strong>${esc(app.name)}</strong>
              <span>${esc(app.description)}</span>
              <small>Known/live version: ${esc(sourceVersion(app))}</small>
            </div>
          </div>
          <div class="fries91-card-bottom">
            <span class="fries91-card-status" data-kind="${esc(status.kind)}">${esc(status.text)}</span>
            <div class="fries91-card-actions">
              ${app.backgroundDefault ? `
                <label class="fries91-background-toggle" title="Run this app in the background for alerts">
                  <input type="checkbox" data-background="${esc(app.id)}" ${isBackground ? "checked" : ""}>
                  <span>Alerts</span>
                </label>
              ` : ""}
              <button type="button" class="fries91-open-app" data-open="${esc(app.id)}">Open</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    cards.querySelectorAll("[data-open]").forEach((button) => {
      button.addEventListener("click", () => openApp(button.dataset.open));
    });

    cards.querySelectorAll("[data-background]").forEach((input) => {
      input.addEventListener("change", async () => {
        const app = appById(input.dataset.background);
        if (!app) return;
        setBackgroundEnabled(app, input.checked);
        if (input.checked) {
          try {
            await loadApp(app);
            showToast(`${app.name} background alerts are active.`, "good");
          } catch (error) {
            showToast(`${app.name}: ${error.message || error}`, "bad");
          }
        } else {
          showToast(`${app.name} will stop background-starting after the next Torn reload.`, "warn");
        }
      });
    });

    syncBadges();
  }

  function getHeaderTarget() {
    const candidates = Array.from(document.querySelectorAll("div,section,header,nav,ul"));
    let best = null;
    let bestScore = Infinity;

    for (const element of candidates) {
      if (!element || element.id === IDS.slot || element.closest(`#${IDS.overlay}`)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 240 || rect.height < 18 || rect.height > 230) continue;
      if (rect.bottom < 0 || rect.top > 420) continue;

      const text = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      const hasMoney = text.includes("$") || /\bMoney\b/i.test(text);
      const hasPoints = /\bPoints?\b/i.test(text) || /\bP\s*[\d,]+/i.test(text);
      const hasMerits = /\bMerits?\b/i.test(text) || /\bM\s*[\d,]+/i.test(text);
      if (!hasMoney && !hasPoints && !hasMerits) continue;

      let score = text.length + Math.abs(rect.top);
      if (hasMoney) score -= 220;
      if (hasPoints) score -= 90;
      if (hasMerits) score -= 90;
      if (score < bestScore) {
        best = element;
        bestScore = score;
      }
    }
    return best;
  }

  function ensureHeaderButton() {
    if (!document.body) return false;

    let slot = document.getElementById(IDS.slot);
    let button = document.getElementById(IDS.button);

    if (!slot) {
      slot = document.createElement("div");
      slot.id = IDS.slot;
    }

    if (!button) {
      button = document.createElement("button");
      button.id = IDS.button;
      button.type = "button";
      button.innerHTML = `
        <span id="${IDS.chainLight}" class="fries91-chain-light" title="100K chain condition"></span>
        <span class="fries91-hub-label">🍟 Fries91's Faction Apps</span>
        <span id="${IDS.buttonBadge}" class="fries91-hub-badge" hidden>0</span>
      `;
      button.addEventListener("click", openHub);
    }

    const target = getHeaderTarget();
    if (!target) {
      button.style.display = "none";
      if (!slot.isConnected) document.body.appendChild(slot);
      if (!button.isConnected) slot.appendChild(button);
      return false;
    }

    button.style.removeProperty("display");
    if (slot.parentElement !== target) target.appendChild(slot);
    if (button.parentElement !== slot) slot.appendChild(button);
    state.lastHeaderTarget = target;
    return true;
  }

  function mountOverlay() {
    if (document.getElementById(IDS.overlay)) return;

    const overlay = document.createElement("div");
    overlay.id = IDS.overlay;
    overlay.innerHTML = `
      <section id="${IDS.panel}" role="dialog" aria-modal="true" aria-label="Fries91 Faction Apps">
        <header class="fries91-hub-head">
          <div>
            <strong>🍟 Fries91's Faction Apps</strong>
            <small>Hub v${BUILD} • PDA and PC</small>
          </div>
          <div class="fries91-hub-head-actions">
            <button id="fries91-hub-update-all" type="button">↻ Update Apps</button>
            <button id="fries91-hub-close" class="fries91-hub-close" type="button">×</button>
          </div>
        </header>
        <div id="${IDS.status}" class="fries91-hub-status">Apps load from their official live files and keep a cached fallback.</div>
        <main id="${IDS.cards}" class="fries91-hub-cards"></main>
        <footer class="fries91-hub-footer">
          Duplicate standalone icons are hidden. Assist still appears on attack pages.
        </footer>
      </section>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeHub();
    });
    document.getElementById("fries91-hub-close").addEventListener("click", closeHub);
    document.getElementById("fries91-hub-update-all").addEventListener("click", updateAllSources);
    renderCards();
  }

  function openHub() {
    mountOverlay();
    state.open = true;
    sv(KEY.open, true);
    document.getElementById(IDS.overlay)?.classList.add("show");
    renderCards();
    syncBadges();
  }

  function closeHub() {
    state.open = false;
    sv(KEY.open, false);
    document.getElementById(IDS.overlay)?.classList.remove("show");
  }

  function suppressStandaloneLaunchers() {
    const selectors = [
      "#warhub-shield",
      "#warhub-badge",
      "#si-pda-launcher",
      "#giveaway-shield",
      "#tse-hq-badge",
      "#tse-badge",
      "[id^='tse-'][id*='badge']",
      "#fb-bank-coin-clean",
      "#fb-setup-button",
      "#tb-icon",
      "#tcc-native-button"
    ];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((element) => {
        if (element.closest(`#${IDS.overlay}`)) return;
        element.classList.add("fries91-hub-hidden-launcher");
      });
    }
  }

  function bankerCount() {
    const coin = document.getElementById("fb-bank-coin-clean");
    if (!coin) return 0;
    const candidates = [
      coin.getAttribute("data-count"),
      coin.dataset?.count,
      coin.getAttribute("aria-label"),
      coin.title
    ];
    for (const candidate of candidates) {
      const match = String(candidate || "").match(/\b(\d{1,4})\b/);
      if (match) return Number(match[1]) || 0;
    }
    return 0;
  }

  function brainCount() {
    const badge = document.getElementById("tb-badge");
    const match = String(badge?.textContent || "").match(/\d+/);
    return match ? Number(match[0]) || 0 : 0;
  }

  function chainCondition() {
    const button = document.getElementById("tcc-native-button");
    if (!button) return { level: "off", text: "" };

    const classText = String(button.className || "").toLowerCase();
    if (classText.includes("danger") || classText.includes("red")) return { level: "red", text: "Critical" };
    if (classText.includes("warning") || classText.includes("yellow") || classText.includes("warn")) return { level: "yellow", text: "Warning" };

    const badge = button.querySelector(".tcc-n-badge");
    const text = String(badge?.textContent || "").trim();
    return { level: "green", text };
  }

  function syncBadges() {
    const bank = bankerCount();
    const brain = brainCount();
    const total = bank + brain;

    const topBadge = document.getElementById(IDS.buttonBadge);
    if (topBadge) {
      topBadge.textContent = String(total);
      topBadge.hidden = total <= 0;
    }

    const bankBadge = document.getElementById("fries91-card-bank-badge");
    if (bankBadge) {
      bankBadge.textContent = String(bank);
      bankBadge.hidden = bank <= 0;
    }

    const brainBadge = document.getElementById("fries91-card-brain-badge");
    if (brainBadge) {
      brainBadge.textContent = String(brain);
      brainBadge.hidden = brain <= 0;
    }

    const chain = chainCondition();
    const chainLight = document.getElementById(IDS.chainLight);
    if (chainLight) {
      chainLight.dataset.level = chain.level;
      chainLight.title = chain.text ? `100K Chain: ${chain.text}` : "100K Chain not loaded";
    }

    const chainCard = document.getElementById("fries91-chain-card-state");
    if (chainCard) {
      chainCard.dataset.level = chain.level;
      chainCard.textContent = chain.text || "•";
    }
  }

  function addStyles() {
    if (document.getElementById(IDS.style)) return;

    const css = `
      #${IDS.slot} {
        width:100% !important;
        box-sizing:border-box !important;
        padding:2px 4px 3px !important;
        order:9999 !important;
      }
      #${IDS.button} {
        position:relative !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:7px !important;
        width:100% !important;
        min-height:22px !important;
        padding:2px 34px !important;
        border:1px solid rgba(245,191,73,.58) !important;
        border-radius:7px !important;
        background:linear-gradient(180deg,#8f171c,#4c080b) !important;
        color:#fff5d8 !important;
        font:800 12px/1.25 Arial,sans-serif !important;
        letter-spacing:.1px !important;
        text-align:center !important;
        box-shadow:0 2px 8px rgba(0,0,0,.32) !important;
        cursor:pointer !important;
        z-index:3 !important;
      }
      #${IDS.button}:active { transform:scale(.99) !important; }
      .fries91-hub-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .fries91-hub-badge,.fries91-card-alert {
        display:flex;
        align-items:center;
        justify-content:center;
        min-width:17px;
        height:17px;
        padding:0 4px;
        border-radius:999px;
        background:#ef3340;
        color:white;
        font:900 10px/1 Arial,sans-serif;
        box-shadow:0 0 0 2px #360608;
      }
      .fries91-hub-badge { position:absolute; right:8px; top:2px; }
      .fries91-hub-badge[hidden],.fries91-card-alert[hidden] { display:none !important; }
      .fries91-chain-light {
        position:absolute;
        left:9px;
        width:10px;
        height:10px;
        border-radius:50%;
        background:#526170;
        box-shadow:0 0 0 2px rgba(0,0,0,.38);
      }
      .fries91-chain-light[data-level="green"] { background:#22c55e; box-shadow:0 0 8px #22c55e; }
      .fries91-chain-light[data-level="yellow"] { background:#facc15; box-shadow:0 0 8px #facc15; }
      .fries91-chain-light[data-level="red"] { background:#ef4444; box-shadow:0 0 10px #ef4444; animation:fries91-pulse .9s infinite; }

      #${IDS.overlay} {
        position:fixed !important;
        inset:0 !important;
        display:none !important;
        align-items:flex-start !important;
        justify-content:center !important;
        padding:max(10px,env(safe-area-inset-top,0px)) 8px 10px !important;
        background:rgba(0,0,0,.72) !important;
        backdrop-filter:blur(3px) !important;
        z-index:2147483200 !important;
        box-sizing:border-box !important;
      }
      #${IDS.overlay}.show { display:flex !important; }
      #${IDS.panel} {
        width:min(560px,100%) !important;
        max-height:calc(100vh - 20px) !important;
        overflow:hidden !important;
        display:flex !important;
        flex-direction:column !important;
        border:1px solid rgba(232,190,95,.52) !important;
        border-radius:15px !important;
        background:linear-gradient(180deg,#15181d,#08090b) !important;
        color:#f5ead0 !important;
        box-shadow:0 18px 70px rgba(0,0,0,.72) !important;
        font-family:Arial,sans-serif !important;
      }
      .fries91-hub-head {
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:8px !important;
        padding:11px !important;
        border-bottom:1px solid rgba(232,190,95,.27) !important;
        background:linear-gradient(180deg,#691116,#27070a) !important;
      }
      .fries91-hub-head > div:first-child { min-width:0 !important; }
      .fries91-hub-head strong { display:block !important; color:#fff4d2 !important; font-size:15px !important; }
      .fries91-hub-head small { display:block !important; margin-top:2px !important; color:#d5bd82 !important; font-size:10px !important; }
      .fries91-hub-head-actions { display:flex !important; align-items:center !important; gap:6px !important; }
      .fries91-hub-head-actions button {
        min-height:31px !important;
        padding:0 9px !important;
        border:1px solid rgba(244,211,126,.43) !important;
        border-radius:8px !important;
        background:#17191e !important;
        color:#f5e4b7 !important;
        font-weight:800 !important;
        cursor:pointer !important;
      }
      .fries91-hub-head-actions .fries91-hub-close {
        width:34px !important;
        padding:0 !important;
        font-size:22px !important;
        color:white !important;
      }
      .fries91-hub-status {
        min-height:18px !important;
        padding:8px 11px !important;
        border-bottom:1px solid rgba(255,255,255,.07) !important;
        color:#b9c2cd !important;
        background:#0e1115 !important;
        font-size:10px !important;
      }
      .fries91-hub-status[data-kind="good"] { color:#91edb5 !important; }
      .fries91-hub-status[data-kind="warn"] { color:#ffe17b !important; }
      .fries91-hub-status[data-kind="bad"] { color:#ff9ca4 !important; }
      .fries91-hub-cards {
        overflow:auto !important;
        overscroll-behavior:contain !important;
        padding:9px !important;
        display:grid !important;
        grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        gap:8px !important;
      }
      .fries91-app-card {
        min-width:0 !important;
        display:flex !important;
        flex-direction:column !important;
        justify-content:space-between !important;
        gap:9px !important;
        padding:10px !important;
        border:1px solid rgba(255,255,255,.11) !important;
        border-radius:12px !important;
        background:linear-gradient(180deg,#171b21,#101318) !important;
        box-shadow:0 4px 14px rgba(0,0,0,.2) !important;
      }
      .fries91-card-main { display:flex !important; align-items:flex-start !important; gap:9px !important; min-width:0 !important; }
      .fries91-card-icon {
        position:relative !important;
        flex:0 0 38px !important;
        width:38px !important;
        height:38px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        border-radius:10px !important;
        background:#080a0d !important;
        border:1px solid rgba(232,190,95,.24) !important;
        font-size:21px !important;
      }
      .fries91-card-alert { position:absolute !important; right:-6px !important; top:-6px !important; }
      .fries91-card-alert.brain { background:#7c3aed !important; }
      .fries91-chain-card-state {
        position:absolute !important;
        right:-6px !important;
        top:-6px !important;
        max-width:34px !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        padding:2px 5px !important;
        border-radius:999px !important;
        background:#526170 !important;
        color:white !important;
        font:900 8px/1.2 Arial,sans-serif !important;
      }
      .fries91-chain-card-state[data-level="green"] { background:#138a42 !important; }
      .fries91-chain-card-state[data-level="yellow"] { background:#c39500 !important; color:#151000 !important; }
      .fries91-chain-card-state[data-level="red"] { background:#d72635 !important; animation:fries91-pulse .9s infinite; }
      .fries91-card-copy { min-width:0 !important; }
      .fries91-card-copy strong {
        display:block !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        color:#fff3ce !important;
        font-size:12px !important;
      }
      .fries91-card-copy span {
        display:block !important;
        margin-top:3px !important;
        color:#aeb8c5 !important;
        font-size:9.5px !important;
        line-height:1.3 !important;
      }
      .fries91-card-copy small {
        display:block !important;
        margin-top:4px !important;
        color:#d1a94d !important;
        font-size:8.5px !important;
      }
      .fries91-card-bottom {
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:7px !important;
      }
      .fries91-card-status {
        min-width:0 !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        color:#91a0af !important;
        font-size:8.5px !important;
      }
      .fries91-card-status[data-kind="good"] { color:#7de5a5 !important; }
      .fries91-card-status[data-kind="warn"] { color:#ffe27a !important; }
      .fries91-card-status[data-kind="bad"] { color:#ff8c96 !important; }
      .fries91-card-status[data-kind="loading"] { color:#7ec8ff !important; }
      .fries91-card-actions { display:flex !important; align-items:center !important; gap:5px !important; flex:0 0 auto !important; }
      .fries91-open-app {
        min-height:29px !important;
        padding:0 10px !important;
        border:1px solid rgba(233,190,83,.48) !important;
        border-radius:8px !important;
        background:linear-gradient(180deg,#991a20,#581014) !important;
        color:white !important;
        font-size:10px !important;
        font-weight:900 !important;
        cursor:pointer !important;
      }
      .fries91-background-toggle {
        display:flex !important;
        align-items:center !important;
        gap:3px !important;
        color:#aab4c0 !important;
        font-size:8px !important;
        cursor:pointer !important;
      }
      .fries91-background-toggle input { width:13px !important; height:13px !important; margin:0 !important; accent-color:#d8a72f !important; }
      .fries91-hub-footer {
        padding:7px 10px !important;
        border-top:1px solid rgba(255,255,255,.07) !important;
        background:#090b0e !important;
        color:#788493 !important;
        text-align:center !important;
        font-size:8.5px !important;
      }
      #${IDS.toast} {
        position:fixed !important;
        left:50% !important;
        bottom:max(16px,env(safe-area-inset-bottom,0px)) !important;
        transform:translate(-50%,20px) !important;
        width:min(430px,calc(100% - 24px)) !important;
        box-sizing:border-box !important;
        padding:11px 13px !important;
        border:1px solid rgba(232,190,95,.43) !important;
        border-radius:11px !important;
        background:#11151a !important;
        color:#ecf1f5 !important;
        opacity:0 !important;
        pointer-events:none !important;
        transition:.18s ease !important;
        text-align:center !important;
        font:800 11px/1.35 Arial,sans-serif !important;
        z-index:2147483646 !important;
      }
      #${IDS.toast}.show { opacity:1 !important; transform:translate(-50%,0) !important; }
      #${IDS.toast}[data-kind="good"] { border-color:#34c978 !important; color:#b9f7d1 !important; }
      #${IDS.toast}[data-kind="warn"] { border-color:#e0b62f !important; color:#ffe89b !important; }
      #${IDS.toast}[data-kind="bad"] { border-color:#ef4652 !important; color:#ffc0c5 !important; }
      .fries91-hub-hidden-launcher {
        position:fixed !important;
        left:-10000px !important;
        top:-10000px !important;
        opacity:0 !important;
        visibility:hidden !important;
        pointer-events:none !important;
      }
      #fries91-assist-lite-bar.fries91-hub-highlight { animation:fries91-assist-highlight .5s 3 !important; }
      @keyframes fries91-pulse { 50% { opacity:.42; transform:scale(.82); } }
      @keyframes fries91-assist-highlight { 50% { filter:brightness(1.8); transform:scale(1.02); } }

      @media (max-width:620px) {
        #${IDS.overlay} { padding:0 !important; }
        #${IDS.panel} { width:100% !important; max-height:100vh !important; height:100% !important; border:0 !important; border-radius:0 !important; }
        .fries91-hub-head { padding-top:max(9px,env(safe-area-inset-top,0px)) !important; }
        .fries91-hub-cards { grid-template-columns:1fr !important; }
        .fries91-card-copy span { font-size:10px !important; }
      }
    `;

    try {
      GM_addStyle(css);
    } catch (_) {
      const style = document.createElement("style");
      style.id = IDS.style;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function backgroundStartDelay(app) {
    if (app.id === "bankers") return 2500;
    if (app.id === "chain100k") return 4500;
    if (app.id === "brain") return 7000;
    if (app.id === "assist") return isAttackPage() ? 1200 : 9500;
    return 11000;
  }

  function startBackgroundApps() {
    for (const app of APPS) {
      if (!app.backgroundDefault || !backgroundEnabled(app)) continue;
      const timer = setTimeout(async () => {
        try {
          await loadApp(app);
        } catch (error) {
          console.warn(`Fries91 Hub background load failed for ${app.id}:`, error);
        }
      }, backgroundStartDelay(app));
      state.backgroundTimers.push(timer);
    }
  }

  function refreshMountedState() {
    ensureHeaderButton();
    suppressStandaloneLaunchers();
    syncBadges();

    for (const app of APPS) {
      if (appReady(app)) {
        state.running.add(app.id);
        if (!state.status.has(app.id)) state.status.set(app.id, { text: "Ready", kind: "good" });
      }
    }
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") return;
    try {
      GM_registerMenuCommand("Open Fries91 Faction Apps", openHub);
      GM_registerMenuCommand("Update all Hub apps", updateAllSources);
      GM_registerMenuCommand("Clear Hub source cache", () => {
        for (const app of APPS) {
          dv(KEY.cachePrefix + app.id);
          dv(KEY.cacheTsPrefix + app.id);
          dv(KEY.versionPrefix + app.id);
        }
        state.versions.clear();
        state.sourceMode.clear();
        renderCards();
        showToast("Hub source cache cleared. App settings and API keys were not removed.", "good");
      });
    } catch (_) {}
  }

  function boot() {
    if (!document.body) {
      setTimeout(boot, 400);
      return;
    }

    addStyles();
    mountOverlay();
    ensureHeaderButton();
    registerMenuCommands();

    APPS.forEach((app) => {
      const savedVersion = String(gv(KEY.versionPrefix + app.id, "") || "");
      if (savedVersion) state.versions.set(app.id, savedVersion);
    });

    state.mountTimer = setInterval(refreshMountedState, 1500);
    startBackgroundApps();

    if (Boolean(gv(KEY.open, false))) openHub();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
