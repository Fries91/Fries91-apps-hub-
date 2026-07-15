// ==UserScript==
// @name         🍟 Fries91's Faction Apps
// @namespace    torn.hub.fries91
// @version      0.9.0
// @description  Compact top icon bar for direct Torn app launching, with hidden standalone icons, alerts, updates, and close controls.
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

  if (window.__FRIES91_FACTION_APPS_V090__) return;
  window.__FRIES91_FACTION_APPS_V090__ = true;

  const BUILD = "0.9.0";
  const SOURCE_MAX_AGE = 6 * 60 * 60 * 1000;
  const IDS = {
    slot: "fries91-hub-slot-v080",
    button: "fries91-hub-button-v080",
    buttonBadge: "fries91-hub-button-badge-v080",
    chainLight: "fries91-hub-chain-light-v080",
    directBankBadge: "fries91-direct-bank-badge-v090",
    directBrainBadge: "fries91-direct-brain-badge-v090",
    fallback: "fries91-hub-mobile-launcher-v081",
    fallbackBadge: "fries91-hub-mobile-badge-v081",
    fallbackChainLight: "fries91-hub-mobile-chain-light-v081",
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
    headerLocked: false,
    activeAppId: null,
    mountTimer: null,
    suppressTimer: null,
    suppressObserver: null,
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
      readySelectors: ["#warhub-overlay", "#warhub-shield", "#warhub-badge"],
      openSelectors: ["#warhub-shield", "#warhub-badge"],
      overlaySelectors: ["#warhub-overlay"],
      closeSelectors: ["#warhub-close", "#warhub-overlay [data-close]", "#warhub-overlay [aria-label*='close' i]", "#warhub-overlay .close"],
      openDelay: 900,
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
      overlaySelectors: ["#si-pda-overlay"],
      closeSelectors: ["#si-pda-close", "#si-pda-overlay [data-close]", "#si-pda-overlay [aria-label*='close' i]", "#si-pda-overlay .close"],
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
      overlaySelectors: ["#giveaway-overlay"],
      closeSelectors: ["#giveaway-close", "#giveaway-overlay .gw-close", "#giveaway-overlay [data-close]", "#giveaway-overlay [aria-label*='close' i]"],
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
      readySelectors: ["#tse_hq_panel", "#tse_hq_badge", "#tse-hq-overlay", "#tse-overlay"],
      openSelectors: ["#tse_hq_badge", "#tse-hq-badge", "#tse-badge"],
      overlaySelectors: ["#tse_hq_panel", "#tse-hq-overlay", "#tse-overlay"],
      closeSelectors: ["#tse_hq_close", "#tse-hq-close", "#tse_hq_panel [aria-label*='close' i]"],
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
      overlaySelectors: ["#fb-overlay"],
      closeSelectors: ["#fb-close", "#fb-overlay [data-close]", "#fb-overlay [aria-label*='close' i]"],
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
      overlaySelectors: ["#fries91-assist-lite-bar"],
      closeSelectors: [],
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
      overlaySelectors: ["#tb-panel"],
      closeSelectors: ["#tb-close", "#tb-panel [data-close]", "#tb-panel [aria-label*='close' i]", "#tb-panel .close"],
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
      overlaySelectors: ["#tcc-native-overlay"],
      closeSelectors: ["#tcc-native-close", "#tcc-native-overlay [data-close]", "#tcc-native-overlay [aria-label*='close' i]", "#tcc-native-overlay .close"],
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
      if (!options.openAfter) {
        suppressStandaloneLaunchers();
        setTimeout(() => closeAppSilently(app), 40);
      }
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

      // Apps that start in the background are kept closed and hidden. When the
      // user presses Open, suppression waits until the internal launcher has
      // opened the app panel.
      if (!options.openAfter) {
        suppressStandaloneLaunchers();
        setTimeout(() => closeAppSilently(app), 80);
        setTimeout(() => closeAppSilently(app), 700);
      }

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

  function prepareLauncherForInternalClick(element) {
    if (!element) return;

    element.dataset.fries91HubOpenExempt = "1";
    delete element.dataset.fries91HubHiddenLauncher;
    element.classList.remove("fries91-hub-hidden-launcher");
    element.removeAttribute("aria-hidden");

    // Restore only long enough for the app's own event handler to initialize
    // and receive the internal click. It remains visually transparent.
    element.style.setProperty("display", "block", "important");
    element.style.setProperty("visibility", "visible", "important");
    element.style.setProperty("opacity", "0", "important");
    element.style.setProperty("pointer-events", "none", "important");
    element.style.setProperty("position", "fixed", "important");
    element.style.setProperty("left", "-10000px", "important");
    element.style.setProperty("top", "-10000px", "important");
  }

  function finishInternalLauncherClick(element) {
    if (!element) return;
    delete element.dataset.fries91HubOpenExempt;
    forceHideLauncher(element);
  }

  async function clickOpenSelector(app) {
    const delay = Number(app?.openDelay || 220);
    let element = anySelector(app.openSelectors);

    if (!element) {
      // Some apps create the launcher one animation frame after reporting ready.
      await new Promise((resolve) => setTimeout(resolve, delay));
      element = anySelector(app.openSelectors);
    }

    if (!element) return false;

    prepareLauncherForInternalClick(element);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Re-read it in case the app replaced its launcher while initializing.
    const newest = anySelector(app.openSelectors) || element;
    if (newest !== element) {
      finishInternalLauncherClick(element);
      element = newest;
      prepareLauncherForInternalClick(element);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    let clicked = false;
    try {
      element.click();
      clicked = true;
    } catch (_) {
      try {
        element.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        clicked = true;
      } catch (_) {}
    }

    // Give the app enough time to create/open its panel before hiding the
    // standalone launcher again.
    setTimeout(() => {
      finishInternalLauncherClick(element);
      suppressStandaloneLaunchers();
    }, app?.id === "war" ? 1600 : 700);

    return clicked;
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

  function appOverlay(app) {
    if (!app) return null;
    return anySelector(app.overlaySelectors || []);
  }

  function elementLooksOpen(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    if (element.classList.contains("hidden")) return false;
    return rect.width > 10 && rect.height > 10;
  }

  function genericCloseButton(overlay) {
    if (!overlay) return null;

    const buttons = Array.from(overlay.querySelectorAll("button,[role='button'],a"))
      .filter((element) => !element.classList.contains("fries91-app-fallback-close"));

    for (const element of buttons) {
      const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
      const aria = String(element.getAttribute("aria-label") || "").trim();
      const title = String(element.getAttribute("title") || "").trim();

      if (/^(×|✕|x|close|close app)$/i.test(text)) return element;
      if (/close/i.test(aria) || /close/i.test(title)) return element;
    }

    return null;
  }

  function nativeCloseButton(app, overlay) {
    for (const selector of app?.closeSelectors || []) {
      try {
        const found = document.querySelector(selector);
        if (found) return found;
      } catch (_) {}
    }
    return genericCloseButton(overlay);
  }

  function clearForcedHidden(app) {
    const overlay = appOverlay(app);
    if (!overlay) return;
    if (overlay.dataset.fries91ForceHidden === "1") {
      delete overlay.dataset.fries91ForceHidden;
      overlay.style.removeProperty("display");
      overlay.style.removeProperty("visibility");
      overlay.style.removeProperty("opacity");
      overlay.style.removeProperty("pointer-events");
    }
  }

  function bridgeClose(app) {
    try {
      const bridge = app?.bridge ? window[app.bridge] : null;
      if (bridge && typeof bridge.close === "function") {
        bridge.close();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function fallbackHideOverlay(app, overlay) {
    if (!overlay) return false;

    if (app?.assistMode) {
      overlay.dataset.fries91ForceHidden = "1";
      overlay.style.setProperty("display", "none", "important");
      return true;
    }

    overlay.classList.remove("show", "open", "tse_open", "fb-show", "active", "visible");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.fries91ForceHidden = "1";
    overlay.style.setProperty("display", "none", "important");
    overlay.style.setProperty("visibility", "hidden", "important");
    overlay.style.setProperty("opacity", "0", "important");
    overlay.style.setProperty("pointer-events", "none", "important");
    return true;
  }

  function closeAppSilently(app) {
    if (!app) return false;
    const overlay = appOverlay(app);
    if (!overlay || !elementLooksOpen(overlay)) return false;

    if (bridgeClose(app)) return true;

    const close = nativeCloseButton(app, overlay);
    if (close) {
      try {
        close.click();
        return true;
      } catch (_) {}
    }

    return fallbackHideOverlay(app, overlay);
  }

  function closeApp(appId) {
    const app = appById(appId || state.activeAppId);
    if (!app) return;

    const overlay = appOverlay(app);
    let closed = bridgeClose(app);

    if (!closed) {
      const close = nativeCloseButton(app, overlay);
      if (close) {
        try {
          close.click();
          closed = true;
        } catch (_) {}
      }
    }

    if (!closed) closed = fallbackHideOverlay(app, overlay);

    state.activeAppId = null;
    suppressStandaloneLaunchers();
    showToast(`${app.name} closed.`, "good");
  }

  function ensureAppCloseControl(app, attempt = 0) {
    if (!app || attempt > 30) return;

    const overlay = appOverlay(app);
    if (!overlay) {
      setTimeout(() => ensureAppCloseControl(app, attempt + 1), 120);
      return;
    }

    // Keep the app's own working close button. Add a Hub close only when
    // the app does not already provide one.
    if (nativeCloseButton(app, overlay)) return;

    let button = overlay.querySelector(`.fries91-app-fallback-close[data-app="${app.id}"]`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "fries91-app-fallback-close";
      button.dataset.app = app.id;
      button.textContent = "×";
      button.title = `Close ${app.name}`;
      button.setAttribute("aria-label", `Close ${app.name}`);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeApp(app.id);
      });
      overlay.appendChild(button);
    }
  }

  function waitForAppOpen(app, attempt = 0) {
    if (!app) return;

    const overlay = appOverlay(app);
    if (overlay && elementLooksOpen(overlay)) {
      state.activeAppId = app.id;
      ensureAppCloseControl(app);
      suppressStandaloneLaunchers();
      return;
    }

    if (attempt === 18 && app.id === "war") {
      // One controlled retry for War & Chain after the script has fully mounted.
      clickOpenSelector(app).catch(() => {});
    }

    if (attempt > 45) {
      suppressStandaloneLaunchers();
      showToast(`${app.name} did not open. Close and reopen the Hub, then try once more.`, "bad");
      return;
    }

    setTimeout(() => waitForAppOpen(app, attempt + 1), 140);
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
      await loadApp(app, { openAfter: true });
      clearForcedHidden(app);

      if (app.assistMode) {
        if (!isAttackPage()) {
          showToast("Assist is active. Open a Torn attack page and faction chat, then open Assist from this Hub.", "good");
          return;
        }

        const bar = document.getElementById("fries91-assist-lite-bar");
        if (bar) {
          bar.style.removeProperty("display");
          bar.style.removeProperty("visibility");
          bar.style.removeProperty("opacity");
          bar.scrollIntoView({ block: "center", behavior: "smooth" });
          bar.classList.add("fries91-hub-highlight");
          setTimeout(() => bar.classList.remove("fries91-hub-highlight"), 1600);
          state.activeAppId = app.id;
          ensureAppCloseControl(app);
          showToast("Assist is open on this attack page.", "good");
        } else {
          showToast("Assist loaded. Reopen the attack page once if its bar has not mounted yet.", "warn");
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 160));

      let opened = bridgeOpen(app);
      if (!opened) opened = await clickOpenSelector(app);

      if (!opened) {
        throw new Error("The app loaded, but the Hub could not activate its internal open control.");
      }

      state.activeAppId = app.id;
      waitForAppOpen(app);
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

  function visibleForMount(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 120 &&
      rect.height > 10 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function findMobileTopAnchor() {
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

    // First choice: Torn's money / points / merits row.
    const all = Array.from(document.querySelectorAll("div,section,header,nav,ul,li"));
    const scored = [];

    for (const element of all) {
      if (!visibleForMount(element)) continue;
      if (element.closest(`#${IDS.overlay}`) || element.id === IDS.slot || element.id === IDS.button) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width < Math.min(260, viewportWidth * 0.72)) continue;
      if (rect.top < 120 || rect.top > 620) continue;
      if (rect.height < 20 || rect.height > 115) continue;

      const text = String(element.innerText || element.textContent || "")
        .replace(/\s+/g, " ")
        .trim();

      if (!text || text.length > 320) continue;

      const hasMoney = /\$\s*[\d,.]+[kmbt]?/i.test(text);
      const hasPointsNumber = /(?:^|\s)P?\s*\d{1,6}(?:\s|$)/i.test(text);
      const hasGender = /[♂♀]/.test(text);
      const hasIcons = element.querySelectorAll("img,svg").length >= 2;
      const likelyStatusRow =
        hasMoney ||
        (hasPointsNumber && hasGender) ||
        (hasGender && hasIcons);

      if (!likelyStatusRow) continue;

      let score = 0;
      if (hasMoney) score += 100;
      if (hasGender) score += 45;
      if (hasIcons) score += 25;
      if (rect.width > viewportWidth * 0.9) score += 50;
      if (rect.height <= 65) score += 25;
      score -= Math.abs(rect.top - 400) * 0.08;
      score -= text.length * 0.04;

      scored.push({ element, score, rect });
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored[0]) return scored[0].element;

    // Second choice: the lowest wide Torn navigation/status row near the top.
    const fallbackCandidates = all
      .filter(visibleForMount)
      .filter((element) => {
        if (element.closest(`#${IDS.overlay}`) || element.id === IDS.slot || element.id === IDS.button) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.width >= Math.min(280, viewportWidth * 0.78) &&
          rect.top >= 160 &&
          rect.top <= 560 &&
          rect.height >= 24 &&
          rect.height <= 100
        );
      })
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);

    return fallbackCandidates[0] || null;
  }

  function placeTopBarAfter(anchor, slot) {
    if (!anchor || !anchor.parentElement) return false;

    let mountAnchor = anchor;

    // Walk upward until the element is close to full page width, but avoid huge page containers.
    for (let i = 0; i < 4 && mountAnchor.parentElement; i += 1) {
      const currentRect = mountAnchor.getBoundingClientRect();
      const parent = mountAnchor.parentElement;
      const parentRect = parent.getBoundingClientRect();

      if (
        parentRect.width >= currentRect.width &&
        parentRect.width >= window.innerWidth * 0.86 &&
        parentRect.height <= 150
      ) {
        mountAnchor = parent;
      } else {
        break;
      }
    }

    const parent = mountAnchor.parentElement;
    if (!parent) return false;

    if (slot.parentElement !== parent || slot.previousElementSibling !== mountAnchor) {
      parent.insertBefore(slot, mountAnchor.nextSibling);
    }
    return true;
  }

  function directBarItems() {
    return [
      { appId: "war", icon: "⚔️", label: "War & Chain" },
      { appId: "insurance", icon: "💊", label: "Sinner's Insurance" },
      { appId: "giveaway", icon: "🎁", label: "Faction Giveaway" },
      { appId: "tse", icon: "🚆", label: "T.S.E Headquarters" },
      { appId: "bankers", icon: "🪙", label: "Faction Bankers", badgeId: IDS.directBankBadge },
      { appId: "assist", icon: "🆘", label: "Assist Button" },
      { appId: "brain", icon: "🧠", label: "AI Brain", badgeId: IDS.directBrainBadge },
      { appId: "chain100k", icon: "⛓️", label: "100K Chain Command", chainLight: true }
    ];
  }

  function buildDirectIconBar(bar) {
    bar.innerHTML = "";

    for (const item of directBarItems()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fries91-direct-app-button";
      button.dataset.app = item.appId;
      button.title = item.label;
      button.setAttribute("aria-label", `Open ${item.label}`);
      button.innerHTML = `
        ${item.chainLight ? `<span id="${IDS.chainLight}" class="fries91-direct-chain-light"></span>` : ""}
        <span class="fries91-direct-icon">${item.icon}</span>
        ${item.badgeId ? `<span id="${item.badgeId}" class="fries91-direct-badge" hidden>0</span>` : ""}
      `;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openApp(item.appId);
      });
      bar.appendChild(button);
    }

    const hubButton = document.createElement("button");
    hubButton.type = "button";
    hubButton.className = "fries91-direct-app-button fries91-direct-hub-button";
    hubButton.title = "Open full Fries91 App Hub";
    hubButton.setAttribute("aria-label", "Open full Fries91 App Hub");
    hubButton.innerHTML = `
      <span class="fries91-direct-icon">🍟</span>
      <span id="${IDS.buttonBadge}" class="fries91-direct-badge fries91-direct-total-badge" hidden>0</span>
    `;
    hubButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openHub();
    });
    bar.appendChild(hubButton);
  }

  function ensureHeaderButton() {
    if (!document.body) return false;

    let slot = document.getElementById(IDS.slot);
    let bar = document.getElementById(IDS.button);

    if (!slot) {
      slot = document.createElement("div");
      slot.id = IDS.slot;
      state.headerLocked = false;
    }

    if (!bar || bar.tagName === "BUTTON") {
      if (bar) bar.remove();
      bar = document.createElement("nav");
      bar.id = IDS.button;
      bar.setAttribute("aria-label", "Fries91 Torn app launcher");
      buildDirectIconBar(bar);
    } else if (!bar.querySelector(".fries91-direct-app-button")) {
      buildDirectIconBar(bar);
    }

    if (bar.parentElement !== slot) slot.appendChild(bar);

    const oldFloating = document.getElementById(IDS.fallback);
    if (oldFloating) oldFloating.remove();

    if (state.headerLocked && slot.isConnected) {
      bar.style.removeProperty("display");
      slot.style.removeProperty("display");
      return true;
    }

    if (!slot.isConnected) state.headerLocked = false;
    const anchor = findMobileTopAnchor() || getHeaderTarget();

    if (anchor && placeTopBarAfter(anchor, slot)) {
      bar.style.removeProperty("display");
      slot.style.removeProperty("display");
      slot.dataset.fries91TopLocked = "1";
      state.lastHeaderTarget = anchor;
      state.headerLocked = true;
      return true;
    }

    const contentCandidates = [
      document.querySelector("#mainContainer"),
      document.querySelector("#mainContainer > div"),
      document.querySelector("[class*='content-wrapper']"),
      document.querySelector("[class*='contentWrapper']"),
      document.querySelector("main"),
      document.body
    ].filter(Boolean);

    const content = contentCandidates.find((element) => element && !element.closest?.(`#${IDS.overlay}`)) || document.body;
    if (slot.parentElement !== content) content.insertBefore(slot, content.firstChild);
    bar.style.removeProperty("display");
    slot.style.removeProperty("display");
    slot.dataset.fries91TopLocked = "1";
    state.headerLocked = true;
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
            <small>Hub v${BUILD} • Direct icon bar</small>
          </div>
          <div class="fries91-hub-head-actions">
            <button id="fries91-hub-update-all" type="button">↻ Update Apps</button>
            <button id="fries91-hub-close" class="fries91-hub-close" type="button">×</button>
          </div>
        </header>
        <div id="${IDS.status}" class="fries91-hub-status">Apps load from their official live files and keep a cached fallback.</div>
        <main id="${IDS.cards}" class="fries91-hub-cards"></main>
        <footer class="fries91-hub-footer">
          Tap an icon in the top bar to open its app. Tap 🍟 for updates and full Hub settings.
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

  function forceHideLauncher(element) {
    if (!element || !element.isConnected) return;
    if (element.closest(`#${IDS.overlay}`)) return;
    if (element.dataset.fries91HubOpenExempt === "1") return;

    element.dataset.fries91HubHiddenLauncher = "1";
    element.classList.add("fries91-hub-hidden-launcher");
    element.setAttribute("aria-hidden", "true");
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("visibility", "hidden", "important");
    element.style.setProperty("opacity", "0", "important");
    element.style.setProperty("pointer-events", "none", "important");
    element.style.setProperty("left", "-10000px", "important");
    element.style.setProperty("top", "-10000px", "important");
  }

  function suppressStandaloneLaunchers() {
    const selectors = [
      "#warhub-shield",
      "#warhub-badge",
      "#si-pda-launcher",
      "#giveaway-shield",
      "#tse_hq_badge",
      "#tse-hq-badge",
      "#tse-badge",
      "[id^='tse_'][id*='badge']",
      "[id^='tse-'][id*='badge']",
      "#fb-bank-coin-clean",
      "#fb-setup-button",
      "#fb-built-in-box",
      "#tb-icon",
      "#tcc-native-button"
    ];

    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach(forceHideLauncher);
      } catch (_) {}
    }

    // Some older helper builds use a small green fixed “FF” launcher with no
    // stable ID. Hide only tiny fixed elements whose complete label is FF.
    document.querySelectorAll("button,div,a,span").forEach((element) => {
      if (element.closest(`#${IDS.overlay}`)) return;
      if (String(element.textContent || "").trim() !== "FF") return;

      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        (style.position === "fixed" || style.position === "absolute") &&
        rect.width > 15 && rect.width <= 90 &&
        rect.height > 15 && rect.height <= 90
      ) {
        forceHideLauncher(element);
      }
    });
  }

  function startLauncherSuppression() {
    suppressStandaloneLaunchers();

    if (!state.suppressTimer) {
      state.suppressTimer = setInterval(suppressStandaloneLaunchers, 450);
    }

    if (!state.suppressObserver && document.documentElement) {
      state.suppressObserver = new MutationObserver(() => suppressStandaloneLaunchers());
      state.suppressObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
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

    for (const badgeId of [IDS.buttonBadge, IDS.fallbackBadge]) {
      const topBadge = document.getElementById(badgeId);
      if (topBadge) {
        topBadge.textContent = String(total);
        topBadge.hidden = total <= 0;
      }
    }

    for (const badgeId of ["fries91-card-bank-badge", IDS.directBankBadge]) {
      const bankBadge = document.getElementById(badgeId);
      if (bankBadge) {
        bankBadge.textContent = String(bank);
        bankBadge.hidden = bank <= 0;
      }
    }

    for (const badgeId of ["fries91-card-brain-badge", IDS.directBrainBadge]) {
      const brainBadge = document.getElementById(badgeId);
      if (brainBadge) {
        brainBadge.textContent = String(brain);
        brainBadge.hidden = brain <= 0;
      }
    }

    const chain = chainCondition();
    for (const lightId of [IDS.chainLight, IDS.fallbackChainLight]) {
      const chainLight = document.getElementById(lightId);
      if (chainLight) {
        chainLight.dataset.level = chain.level;
        chainLight.title = chain.text ? `100K Chain: ${chain.text}` : "100K Chain not loaded";
      }
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
        position:relative !important;
        display:block !important;
        width:100% !important;
        max-width:none !important;
        clear:both !important;
        box-sizing:border-box !important;
        padding:3px 5px 4px !important;
        margin:0 !important;
        order:0 !important;
        z-index:2147482000 !important;
        background:rgba(11,12,14,.98) !important;
        border-top:1px solid rgba(236,190,83,.18) !important;
        border-bottom:1px solid rgba(236,190,83,.28) !important;
      }
      #${IDS.button} {
        position:relative !important;
        display:grid !important;
        grid-template-columns:repeat(9,minmax(0,1fr)) !important;
        align-items:center !important;
        gap:3px !important;
        width:100% !important;
        min-height:44px !important;
        box-sizing:border-box !important;
        padding:3px !important;
        border:1px solid rgba(245,191,73,.58) !important;
        border-radius:9px !important;
        background:linear-gradient(180deg,#7d1419,#41080b) !important;
        box-shadow:0 2px 9px rgba(0,0,0,.38) !important;
        overflow:visible !important;
      }
      .fries91-direct-app-button {
        position:relative !important;
        min-width:0 !important;
        width:100% !important;
        height:36px !important;
        min-height:36px !important;
        padding:0 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        border:1px solid rgba(255,225,150,.22) !important;
        border-radius:7px !important;
        background:linear-gradient(180deg,rgba(28,31,37,.96),rgba(8,10,13,.96)) !important;
        color:white !important;
        box-shadow:0 1px 4px rgba(0,0,0,.42) !important;
        cursor:pointer !important;
        touch-action:manipulation !important;
        overflow:visible !important;
      }
      .fries91-direct-app-button:active {
        transform:scale(.92) !important;
        filter:brightness(1.25) !important;
      }
      .fries91-direct-hub-button {
        border-color:rgba(255,213,102,.58) !important;
        background:linear-gradient(180deg,#a11d23,#570d11) !important;
      }
      .fries91-direct-icon {
        display:block !important;
        font-size:20px !important;
        line-height:1 !important;
        filter:drop-shadow(0 1px 2px rgba(0,0,0,.65)) !important;
        pointer-events:none !important;
      }
      .fries91-direct-badge {
        position:absolute !important;
        right:-3px !important;
        top:-6px !important;
        min-width:17px !important;
        height:17px !important;
        padding:0 4px !important;
        box-sizing:border-box !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        border-radius:999px !important;
        background:#ef3340 !important;
        color:white !important;
        font:900 9px/1 Arial,sans-serif !important;
        box-shadow:0 0 0 2px #360608 !important;
        z-index:3 !important;
        pointer-events:none !important;
      }
      .fries91-direct-badge[hidden] { display:none !important; }
      .fries91-direct-chain-light {
        position:absolute !important;
        left:2px !important;
        top:2px !important;
        width:8px !important;
        height:8px !important;
        border-radius:50% !important;
        background:#526170 !important;
        box-shadow:0 0 0 1px rgba(0,0,0,.48) !important;
        pointer-events:none !important;
      }
      .fries91-direct-chain-light[data-level="green"] { background:#22c55e !important; box-shadow:0 0 6px #22c55e !important; }
      .fries91-direct-chain-light[data-level="yellow"] { background:#facc15 !important; box-shadow:0 0 7px #facc15 !important; }
      .fries91-direct-chain-light[data-level="red"] {
        background:#ef4444 !important;
        box-shadow:0 0 8px #ef4444 !important;
        animation:fries91-pulse .9s infinite !important;
      }

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
      .fries91-hub-hidden-launcher,
      [data-fries91-hub-hidden-launcher="1"],
      [data-fries91-hub-hidden-launcher="true"] {
        display:none !important;
        position:fixed !important;
        left:-10000px !important;
        top:-10000px !important;
        opacity:0 !important;
        visibility:hidden !important;
        pointer-events:none !important;
      }
      .fries91-app-fallback-close {
        position:absolute !important;
        right:8px !important;
        top:8px !important;
        z-index:2147483647 !important;
        width:38px !important;
        height:38px !important;
        min-width:38px !important;
        min-height:38px !important;
        padding:0 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        border:1px solid rgba(255,210,117,.65) !important;
        border-radius:11px !important;
        background:linear-gradient(180deg,#8f171c,#4b080b) !important;
        color:white !important;
        box-shadow:0 5px 18px rgba(0,0,0,.55) !important;
        font:900 24px/1 Arial,sans-serif !important;
        cursor:pointer !important;
      }
      #fries91-assist-lite-bar.fries91-hub-highlight { animation:fries91-assist-highlight .5s 3 !important; }
      @keyframes fries91-pulse { 50% { opacity:.42; transform:scale(.82); } }
      @keyframes fries91-assist-highlight { 50% { filter:brightness(1.8); transform:scale(1.02); } }

      @media (max-width:620px) {
        #${IDS.slot} {
          width:100% !important;
          padding:3px 4px !important;
        }
        #${IDS.button} {
          width:100% !important;
          min-height:43px !important;
          gap:2px !important;
          padding:3px !important;
          border-radius:7px !important;
        }
        .fries91-direct-app-button {
          height:35px !important;
          min-height:35px !important;
          border-radius:6px !important;
        }
        .fries91-direct-icon { font-size:19px !important; }
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
    const slot = document.getElementById(IDS.slot);
    if (!slot || !slot.isConnected) state.headerLocked = false;

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
    startLauncherSuppression();
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
