// ==UserScript==
// @name         🍟 Fries91's Faction Apps Installer Bar
// @namespace    torn.installer.fries91
// @version      1.0.0
// @description  Compact TornPDA/PC top bar that lets faction members install only the Fries91 app they choose.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @include      https://www.torn.com/*
// @include      https://torn.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  if (window.__FRIES91_APP_INSTALLER_BAR_V100__) return;
  window.__FRIES91_APP_INSTALLER_BAR_V100__ = true;

  const VERSION = "1.0.0";

  const IDS = {
    slot: "fries91-installer-slot-v100",
    bar: "fries91-installer-bar-v100",
    overlay: "fries91-installer-overlay-v100",
    panel: "fries91-installer-panel-v100",
    catalog: "fries91-installer-catalog-v100",
    style: "fries91-installer-style-v100",
    toast: "fries91-installer-toast-v100"
  };

  const APPS = [
    {
      id: "war",
      icon: "⚔️",
      name: "War & Chain",
      version: "Latest live build",
      description: "War overview, members, enemies, hospital, chain, targets, terms and administration.",
      url: "https://torn-war-bot.onrender.com/static/war-bot.user.js"
    },
    {
      id: "insurance",
      icon: "💊",
      name: "Sinner's Insurance",
      version: "Latest live build",
      description: "Faction insurance plans, coverage, claims and administration.",
      url: "https://raw.githubusercontent.com/Fries91/xanax-insurance/main/static/xanax-insurance.user.js"
    },
    {
      id: "giveaway",
      icon: "🎁",
      name: "Faction Giveaway",
      version: "Latest live build",
      description: "Faction giveaway rounds, entrants, winners and wheel.",
      url: "https://sinner-s-lottery.onrender.com/static/giveaway.user.js"
    },
    {
      id: "tse",
      icon: "🚆",
      name: "T.S.E Headquarters",
      version: "Latest live build",
      description: "Companies, trains, Hall of Fame search, notes and company keys.",
      url: "https://raw.githubusercontent.com/Fries91/Trains-Selling-Enterprise-/main/static/tse-headquarters.user.js"
    },
    {
      id: "bankers",
      icon: "🪙",
      name: "Faction Bankers",
      version: "Latest live build",
      description: "Bank requests, banker alerts, balances and completed-request history.",
      url: "https://faction-bankers-request.onrender.com/static/faction-bankers.user.js"
    },
    {
      id: "assist",
      icon: "🆘",
      name: "Assist Button",
      version: "Latest live build",
      description: "One-tap faction assist message on Torn attack pages.",
      url: "https://raw.githubusercontent.com/Fries91/Assist-alert-button/main/static/assist-alert-button.user.js"
    },
    {
      id: "brain",
      icon: "🧠",
      name: "AI Brain",
      version: "Latest live build",
      description: "Stock, item, travel-profit and smart market learning tools.",
      url: "https://fries91-torn-profit-brain.onrender.com/static/torn-brain.user.js"
    },
    {
      id: "chain100k",
      icon: "⛓️",
      name: "100K Chain Command",
      version: "Latest live build",
      description: "Live chain timer, members, watcher scheduling and milestones.",
      url: "https://torn-100k-chain-command.onrender.com/chain-command.user.js"
    }
  ];

  const state = {
    locked: false,
    lastAnchor: null,
    toastTimer: null,
    interval: null,
    observer: null
  };

  function appById(id) {
    return APPS.find((app) => app.id === id);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function visible(element) {
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

  function findTopAnchor() {
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const elements = Array.from(document.querySelectorAll("div,section,header,nav,ul,li"));
    const scored = [];

    for (const element of elements) {
      if (!visible(element)) continue;
      if (element.closest(`#${IDS.overlay}`) || element.id === IDS.slot || element.id === IDS.bar) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width < Math.min(260, width * 0.72)) continue;
      if (rect.top < 120 || rect.top > 620) continue;
      if (rect.height < 20 || rect.height > 115) continue;

      const text = String(element.innerText || element.textContent || "")
        .replace(/\s+/g, " ")
        .trim();

      if (!text || text.length > 320) continue;

      const hasMoney = /\$\s*[\d,.]+[kmbt]?/i.test(text);
      const hasGender = /[♂♀]/.test(text);
      const iconCount = element.querySelectorAll("img,svg").length;
      const hasIcons = iconCount >= 2;

      if (!hasMoney && !(hasGender && hasIcons)) continue;

      let score = 0;
      if (hasMoney) score += 100;
      if (hasGender) score += 45;
      if (hasIcons) score += 25;
      if (rect.width > width * 0.9) score += 50;
      if (rect.height <= 65) score += 25;
      score -= Math.abs(rect.top - 400) * 0.08;
      score -= text.length * 0.04;

      scored.push({ element, score });
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored[0]) return scored[0].element;

    const fallback = elements
      .filter(visible)
      .filter((element) => {
        if (element.closest(`#${IDS.overlay}`) || element.id === IDS.slot || element.id === IDS.bar) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.width >= Math.min(280, width * 0.78) &&
          rect.top >= 160 &&
          rect.top <= 560 &&
          rect.height >= 24 &&
          rect.height <= 100
        );
      })
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);

    return fallback[0] || null;
  }

  function placeAfter(anchor, slot) {
    if (!anchor || !anchor.parentElement) return false;

    let mountAnchor = anchor;

    for (let index = 0; index < 4 && mountAnchor.parentElement; index += 1) {
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

  function makeIconButton(item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fries91-installer-icon-button";
    button.dataset.app = item.id;
    button.title = `Install ${item.name}`;
    button.setAttribute("aria-label", `Install ${item.name}`);
    button.innerHTML = `<span>${item.icon}</span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openInstallCard(item.id);
    });
    return button;
  }

  function buildBar(bar) {
    bar.innerHTML = "";

    for (const app of APPS) {
      bar.appendChild(makeIconButton(app));
    }

    const catalogButton = document.createElement("button");
    catalogButton.type = "button";
    catalogButton.className = "fries91-installer-icon-button fries91-installer-catalog-button";
    catalogButton.title = "Show all Fries91 apps";
    catalogButton.setAttribute("aria-label", "Show all Fries91 apps");
    catalogButton.innerHTML = "<span>🍟</span>";
    catalogButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCatalog();
    });
    bar.appendChild(catalogButton);
  }

  function ensureBar() {
    if (!document.body) return false;

    let slot = document.getElementById(IDS.slot);
    let bar = document.getElementById(IDS.bar);

    if (!slot) {
      slot = document.createElement("div");
      slot.id = IDS.slot;
      state.locked = false;
    }

    if (!bar) {
      bar = document.createElement("nav");
      bar.id = IDS.bar;
      bar.setAttribute("aria-label", "Fries91 app installer bar");
      buildBar(bar);
    }

    if (bar.parentElement !== slot) slot.appendChild(bar);

    if (state.locked && slot.isConnected) return true;
    if (!slot.isConnected) state.locked = false;

    const anchor = findTopAnchor();

    if (anchor && placeAfter(anchor, slot)) {
      state.lastAnchor = anchor;
      state.locked = true;
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

    const content = contentCandidates.find((element) => !element.closest?.(`#${IDS.overlay}`)) || document.body;
    if (slot.parentElement !== content) content.insertBefore(slot, content.firstChild);
    state.locked = true;
    return true;
  }

  function mountOverlay() {
    if (document.getElementById(IDS.overlay)) return;

    const overlay = document.createElement("div");
    overlay.id = IDS.overlay;
    overlay.innerHTML = `
      <section id="${IDS.panel}" role="dialog" aria-modal="true" aria-label="Fries91 app installer">
        <header class="fries91-installer-header">
          <div>
            <strong>🍟 Fries91's Faction Apps</strong>
            <small>Installer Bar v${VERSION}</small>
          </div>
          <button type="button" id="fries91-installer-close" aria-label="Close">×</button>
        </header>
        <main id="${IDS.catalog}"></main>
      </section>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeOverlay();
    });

    document.getElementById("fries91-installer-close").addEventListener("click", closeOverlay);
  }

  function openOverlay() {
    mountOverlay();
    document.getElementById(IDS.overlay)?.classList.add("show");
  }

  function closeOverlay() {
    document.getElementById(IDS.overlay)?.classList.remove("show");
  }

  function openInstallUrl(url) {
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");

    if (!newWindow) {
      location.href = url;
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Install link copied.", "good");
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-10000px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("Install link copied.", "good");
    }
  }

  function installCardHtml(app) {
    return `
      <article class="fries91-install-card single">
        <div class="fries91-install-card-top">
          <div class="fries91-install-icon">${app.icon}</div>
          <div>
            <strong>${escapeHtml(app.name)}</strong>
            <span>${escapeHtml(app.description)}</span>
            <small>${escapeHtml(app.version)}</small>
          </div>
        </div>

        <div class="fries91-install-instructions">
          This installs <b>only ${escapeHtml(app.name)}</b>. It does not install the other apps.
        </div>

        <label class="fries91-install-link-label" for="fries91-current-install-link">
          Individual userscript link
        </label>
        <input
          id="fries91-current-install-link"
          class="fries91-install-link"
          type="text"
          readonly
          value="${escapeHtml(app.url)}"
        >

        <div class="fries91-install-actions">
          <button type="button" class="fries91-install-primary" data-install="${escapeHtml(app.id)}">
            Install This App Only
          </button>
          <button type="button" class="fries91-install-copy" data-copy="${escapeHtml(app.id)}">
            Copy Link
          </button>
        </div>

        <p class="fries91-install-note">
          Your userscript manager or TornPDA should show an installation screen after the install button opens the link.
        </p>
      </article>
    `;
  }

  function bindInstallActions(container) {
    container.querySelectorAll("[data-install]").forEach((button) => {
      button.addEventListener("click", () => {
        const app = appById(button.dataset.install);
        if (app) openInstallUrl(app.url);
      });
    });

    container.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", () => {
        const app = appById(button.dataset.copy);
        if (app) copyText(app.url);
      });
    });
  }

  function openInstallCard(appId) {
    const app = appById(appId);
    if (!app) return;

    openOverlay();

    const catalog = document.getElementById(IDS.catalog);
    catalog.innerHTML = `
      <button type="button" class="fries91-back-to-catalog">← All Apps</button>
      ${installCardHtml(app)}
    `;

    catalog.querySelector(".fries91-back-to-catalog").addEventListener("click", openCatalog);
    bindInstallActions(catalog);
  }

  function openCatalog() {
    openOverlay();

    const catalog = document.getElementById(IDS.catalog);
    catalog.innerHTML = `
      <div class="fries91-catalog-intro">
        Choose one app. Each install button installs only that individual userscript.
      </div>
      <div class="fries91-catalog-grid">
        ${APPS.map((app) => `
          <article class="fries91-catalog-card">
            <button type="button" data-view="${escapeHtml(app.id)}">
              <span class="fries91-catalog-icon">${app.icon}</span>
              <strong>${escapeHtml(app.name)}</strong>
              <small>View install link</small>
            </button>
          </article>
        `).join("")}
      </div>
    `;

    catalog.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => openInstallCard(button.dataset.view));
    });
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
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function addStyles() {
    if (document.getElementById(IDS.style)) return;

    const style = document.createElement("style");
    style.id = IDS.style;
    style.textContent = `
      #${IDS.slot} {
        position:relative !important;
        display:block !important;
        width:100% !important;
        max-width:none !important;
        clear:both !important;
        box-sizing:border-box !important;
        padding:3px 5px 4px !important;
        margin:0 !important;
        z-index:2147482000 !important;
        background:rgba(11,12,14,.98) !important;
        border-top:1px solid rgba(236,190,83,.18) !important;
        border-bottom:1px solid rgba(236,190,83,.28) !important;
      }

      #${IDS.bar} {
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
      }

      .fries91-installer-icon-button {
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
      }

      .fries91-installer-icon-button:active {
        transform:scale(.92) !important;
        filter:brightness(1.25) !important;
      }

      .fries91-installer-catalog-button {
        border-color:rgba(255,213,102,.58) !important;
        background:linear-gradient(180deg,#a11d23,#570d11) !important;
      }

      .fries91-installer-icon-button span {
        display:block !important;
        font-size:20px !important;
        line-height:1 !important;
        pointer-events:none !important;
      }

      #${IDS.overlay} {
        position:fixed !important;
        inset:0 !important;
        display:none !important;
        align-items:flex-start !important;
        justify-content:center !important;
        padding:max(10px,env(safe-area-inset-top,0px)) 8px 10px !important;
        box-sizing:border-box !important;
        background:rgba(0,0,0,.76) !important;
        backdrop-filter:blur(3px) !important;
        z-index:2147483600 !important;
      }

      #${IDS.overlay}.show {
        display:flex !important;
      }

      #${IDS.panel} {
        width:min(560px,100%) !important;
        max-height:calc(100vh - 20px) !important;
        overflow:hidden !important;
        display:flex !important;
        flex-direction:column !important;
        border:1px solid rgba(232,190,95,.56) !important;
        border-radius:15px !important;
        background:linear-gradient(180deg,#15181d,#08090b) !important;
        color:#f5ead0 !important;
        box-shadow:0 18px 70px rgba(0,0,0,.74) !important;
        font-family:Arial,sans-serif !important;
      }

      .fries91-installer-header {
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:8px !important;
        padding:11px !important;
        border-bottom:1px solid rgba(232,190,95,.27) !important;
        background:linear-gradient(180deg,#691116,#27070a) !important;
      }

      .fries91-installer-header strong {
        display:block !important;
        color:#fff4d2 !important;
        font-size:15px !important;
      }

      .fries91-installer-header small {
        display:block !important;
        margin-top:2px !important;
        color:#d5bd82 !important;
        font-size:10px !important;
      }

      #fries91-installer-close {
        width:38px !important;
        height:38px !important;
        min-width:38px !important;
        padding:0 !important;
        border:1px solid rgba(244,211,126,.43) !important;
        border-radius:10px !important;
        background:#17191e !important;
        color:white !important;
        font:900 24px/1 Arial,sans-serif !important;
        cursor:pointer !important;
      }

      #${IDS.catalog} {
        overflow:auto !important;
        overscroll-behavior:contain !important;
        padding:10px !important;
      }

      .fries91-catalog-intro,
      .fries91-install-instructions {
        margin-bottom:10px !important;
        padding:10px !important;
        border:1px solid rgba(94,160,212,.38) !important;
        border-radius:10px !important;
        background:#101923 !important;
        color:#c8dff2 !important;
        font-size:11px !important;
        line-height:1.45 !important;
      }

      .fries91-catalog-grid {
        display:grid !important;
        grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        gap:8px !important;
      }

      .fries91-catalog-card {
        border:1px solid rgba(255,255,255,.11) !important;
        border-radius:12px !important;
        background:linear-gradient(180deg,#171b21,#101318) !important;
        overflow:hidden !important;
      }

      .fries91-catalog-card button {
        width:100% !important;
        min-height:100px !important;
        padding:10px !important;
        display:flex !important;
        flex-direction:column !important;
        align-items:center !important;
        justify-content:center !important;
        gap:6px !important;
        border:0 !important;
        background:transparent !important;
        color:white !important;
        cursor:pointer !important;
      }

      .fries91-catalog-icon {
        font-size:27px !important;
      }

      .fries91-catalog-card strong {
        color:#fff0c5 !important;
        font-size:12px !important;
        text-align:center !important;
      }

      .fries91-catalog-card small {
        color:#aeb8c5 !important;
        font-size:9px !important;
      }

      .fries91-back-to-catalog {
        min-height:32px !important;
        margin-bottom:9px !important;
        padding:0 10px !important;
        border:1px solid rgba(255,225,150,.3) !important;
        border-radius:8px !important;
        background:#15191f !important;
        color:#f6df9e !important;
        font-weight:800 !important;
        cursor:pointer !important;
      }

      .fries91-install-card {
        padding:12px !important;
        border:1px solid rgba(255,255,255,.11) !important;
        border-radius:13px !important;
        background:linear-gradient(180deg,#171b21,#0d1014) !important;
      }

      .fries91-install-card-top {
        display:flex !important;
        align-items:flex-start !important;
        gap:10px !important;
        margin-bottom:11px !important;
      }

      .fries91-install-icon {
        flex:0 0 48px !important;
        width:48px !important;
        height:48px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        border:1px solid rgba(232,190,95,.3) !important;
        border-radius:12px !important;
        background:#090b0e !important;
        font-size:27px !important;
      }

      .fries91-install-card-top strong {
        display:block !important;
        color:#fff1c9 !important;
        font-size:15px !important;
      }

      .fries91-install-card-top span {
        display:block !important;
        margin-top:4px !important;
        color:#b4bfcb !important;
        font-size:10.5px !important;
        line-height:1.35 !important;
      }

      .fries91-install-card-top small {
        display:block !important;
        margin-top:5px !important;
        color:#d3ae54 !important;
        font-size:9px !important;
      }

      .fries91-install-link-label {
        display:block !important;
        margin-bottom:4px !important;
        color:#d8bd7b !important;
        font-size:9px !important;
        font-weight:800 !important;
      }

      .fries91-install-link {
        width:100% !important;
        min-height:39px !important;
        box-sizing:border-box !important;
        padding:8px !important;
        border:1px solid rgba(255,255,255,.18) !important;
        border-radius:8px !important;
        background:#080a0d !important;
        color:#e7edf3 !important;
        font:10px/1.3 monospace !important;
      }

      .fries91-install-actions {
        display:grid !important;
        grid-template-columns:2fr 1fr !important;
        gap:7px !important;
        margin-top:10px !important;
      }

      .fries91-install-actions button {
        min-height:42px !important;
        border-radius:9px !important;
        font-size:11px !important;
        font-weight:900 !important;
        cursor:pointer !important;
      }

      .fries91-install-primary {
        border:1px solid #e3b543 !important;
        background:linear-gradient(180deg,#a51d24,#590d12) !important;
        color:white !important;
      }

      .fries91-install-copy {
        border:1px solid rgba(255,255,255,.22) !important;
        background:#181c22 !important;
        color:#e9edf2 !important;
      }

      .fries91-install-note {
        margin:9px 0 0 !important;
        color:#85919e !important;
        font-size:9px !important;
        line-height:1.4 !important;
      }

      #${IDS.toast} {
        position:fixed !important;
        left:50% !important;
        bottom:max(18px,env(safe-area-inset-bottom,0px)) !important;
        transform:translate(-50%,18px) !important;
        width:min(420px,calc(100% - 24px)) !important;
        box-sizing:border-box !important;
        padding:11px !important;
        border:1px solid rgba(232,190,95,.45) !important;
        border-radius:11px !important;
        background:#11151a !important;
        color:#ecf1f5 !important;
        opacity:0 !important;
        pointer-events:none !important;
        transition:.18s ease !important;
        text-align:center !important;
        font:800 11px/1.35 Arial,sans-serif !important;
        z-index:2147483647 !important;
      }

      #${IDS.toast}.show {
        opacity:1 !important;
        transform:translate(-50%,0) !important;
      }

      #${IDS.toast}[data-kind="good"] {
        border-color:#34c978 !important;
        color:#b9f7d1 !important;
      }

      @media (max-width:620px) {
        #${IDS.slot} {
          padding:3px 4px !important;
        }

        #${IDS.bar} {
          gap:2px !important;
          padding:3px !important;
          border-radius:7px !important;
        }

        .fries91-installer-icon-button {
          height:35px !important;
          min-height:35px !important;
          border-radius:6px !important;
        }

        .fries91-installer-icon-button span {
          font-size:19px !important;
        }

        #${IDS.overlay} {
          padding:0 !important;
        }

        #${IDS.panel} {
          width:100% !important;
          height:100% !important;
          max-height:100vh !important;
          border:0 !important;
          border-radius:0 !important;
        }

        .fries91-installer-header {
          padding-top:max(10px,env(safe-area-inset-top,0px)) !important;
        }

        .fries91-catalog-grid {
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function refreshMount() {
    const slot = document.getElementById(IDS.slot);
    if (!slot || !slot.isConnected) state.locked = false;
    ensureBar();
  }

  function boot() {
    if (!document.body) {
      setTimeout(boot, 350);
      return;
    }

    addStyles();
    mountOverlay();
    ensureBar();

    state.interval = setInterval(refreshMount, 1600);

    state.observer = new MutationObserver(() => {
      if (!document.getElementById(IDS.slot)) state.locked = false;
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
