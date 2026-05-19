// content/badge.js
// Triggered: Steam or Epic store app/product pages

const chromeAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

let lastUrl = "";
let checkInterval = null;
let lastCheckedTitle = "";
let lastCheckedUrl = "";

const TRANSLATIONS = {
  en: {
    brand: "STASHY",
    notSynced: "Library not synced",
    pleaseSync: "Please sync your libraries from the extension menu.",
    ownedBase: "Base Game Owned",
    dlcWarning: "You own the base game here, but this edition may contain extra DLCs.",
    ownedMoreComplete: "A more complete edition is already in your library.",
    ownedThis: "Owned on this platform",
    inLibrary: "Already in your library.",
    ownedOther: "Owned on {other}!",
    doublePurchase: "Already owned on your other account. Avoid double purchase.",
    notOwned: "Not in Your Library",
    notOwnedDesc: "Not owned on either platform. Safe to purchase.",
    close: "Close"
  },
  tr: {
    brand: "STASHY",
    notSynced: "Kütüphane senkronize edilmedi",
    pleaseSync: "Lütfen eklenti menüsünden eşitleme yapın.",
    ownedBase: "Ana Oyuna Sahipsin",
    dlcWarning: "Bu platformda ana oyun var, ancak bu sürüm ek paketler (DLC) içerebilir.",
    ownedMoreComplete: "Daha kapsamlı bir sürüme kütüphanende sahipsin.",
    ownedThis: "Bu platformda sahipsin",
    inLibrary: "Kütüphanende zaten mevcut.",
    ownedOther: "{other}'de Sahipsin!",
    doublePurchase: "Diğer hesabında var, boşuna satın alma.",
    notOwned: "Kütüphanende Yok",
    notOwnedDesc: "İki kütüphanede de bulunmuyor. Güvenle alabilirsin.",
    close: "Kapat"
  }
};

async function initBadgeCheck() {
  const platform = detectPlatform();
  if (!platform) return;

  const currentUrl = window.location.href;

  console.log(`[Stashy] Badge injector active on: ${platform}`);

  async function tryCheck() {
    const title = extractTitle(platform);
    if (title) {
      if (currentUrl !== lastCheckedUrl && title === lastCheckedTitle) {
        console.log(`[Stashy] Stale H1 title detected ("${title}"). Waiting for SPA transition...`);
        return false;
      }

      console.log(`[Stashy] Found fresh title: "${title}". Checking library...`);
      lastCheckedTitle = title;
      lastCheckedUrl = currentUrl;

      document.getElementById("gk-badge")?.remove();

      if (!chromeAPI) return true;
      const result = await chromeAPI.runtime.sendMessage({
        type: "CHECK_GAME",
        title,
        platform
      });
      
      const langStore = await chromeAPI.storage.local.get("glc_language");
      const currentLang = langStore.glc_language || "en";
      
      renderBadge(result, platform, currentLang);
      return true;
    }
    return false;
  }

  if (checkInterval) {
    clearInterval(checkInterval);
  }

  const success = await tryCheck();
  if (success) return;

  let attempts = 0;
  const maxAttempts = 40; 

  checkInterval = setInterval(async () => {
    attempts++;
    const found = await tryCheck();
    if (found || attempts >= maxAttempts) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }, 150);
}

// Watch for SPA URL changes
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    initBadgeCheck();
  }
}, 150);

function detectPlatform() {
  const host = location.hostname;
  if (host.includes("steampowered.com")) return "steam";
  if (host.includes("epicgames.com"))    return "epic";
  return null;
}

function extractTitle(platform) {
  if (platform === "steam") {
    const el = document.querySelector(".apphub_AppName, #appHubAppName");
    return el ? el.textContent.trim() : null;
  }

  if (platform === "epic") {
    const h1 = document.querySelector('h1[data-testid="offer-title"], [class*="title-"] h1, [data-testid="hero-title"], h1');
    if (h1 && h1.textContent.trim().length > 1) {
      return h1.textContent.trim();
    }
    return null;
  }

  return null;
}

function renderBadge(result, currentPlatform, lang) {
  const t = TRANSLATIONS[lang];

  if (result.steamCount === 0 && result.epicCount === 0) {
    createBadge({
      icon: "⚠️",
      label: t.notSynced,
      sub: t.pleaseSync,
      color: "#f59e0b",
      bg: "#27272a",
      borderColor: "rgba(245, 158, 11, 0.2)",
      lang
    });
    return;
  }

  const ownedHere  = currentPlatform === "steam" ? result.inSteam : result.inEpic;
  const ownedOther = currentPlatform === "steam" ? result.inEpic  : result.inSteam;
  const otherName  = currentPlatform === "steam" ? "Epic Games"   : "Steam";
  const detailsHere  = currentPlatform === "steam" ? result.steamDetails : result.epicDetails;
  const detailsOther = currentPlatform === "steam" ? result.epicDetails  : result.steamDetails;

  if (ownedHere) {
    if (detailsHere && !detailsHere.exact) {
      if (detailsHere.isStoreMoreComplete) {
        createBadge({
          icon: "⚠️",
          label: t.ownedBase,
          sub: t.dlcWarning,
          color: "#d97706",
          bg: "#1e1b4b",
          borderColor: "rgba(217, 119, 6, 0.2)",
          lang
        });
      } else {
        createBadge({
          icon: "✓",
          label: t.ownedThis,
          sub: `${t.ownedMoreComplete} (${detailsHere.game.title})`,
          color: "#10b981",
          bg: "#062f4f",
          borderColor: "rgba(16, 185, 129, 0.2)",
          lang
        });
      }
    } else {
      createBadge({
        icon: "✓",
        label: t.ownedThis,
        sub: t.inLibrary,
        color: "#10b981",
        bg: "#062f4f",
        borderColor: "rgba(16, 185, 129, 0.2)",
        lang
      });
    }
  } else if (ownedOther) {
    const otherLabel = t.ownedOther.replace("{other}", otherName);
    if (detailsOther && !detailsOther.exact) {
      if (detailsOther.isStoreMoreComplete) {
        createBadge({
          icon: "⚠️",
          label: `${otherName}: ${t.ownedBase}`,
          sub: t.dlcWarning,
          color: "#d97706",
          bg: "#1e1b4b",
          borderColor: "rgba(217, 119, 6, 0.2)",
          lang
        });
      } else {
        createBadge({
          icon: "📚",
          label: otherLabel,
          sub: `${t.ownedMoreComplete} (${detailsOther.game.title})`,
          color: "#3b82f6",
          bg: "#172554",
          borderColor: "rgba(59, 130, 246, 0.2)",
          lang
        });
      }
    } else {
      createBadge({
        icon: "📚",
        label: otherLabel,
        sub: t.doublePurchase,
        color: "#3b82f6",
        bg: "#172554",
        borderColor: "rgba(59, 130, 246, 0.2)",
        lang
      });
    }
  } else {
    createBadge({
      icon: "🛒",
      label: t.notOwned,
      sub: t.notOwnedDesc,
      color: "#9ca3af",
      bg: "#18181b",
      borderColor: "rgba(255, 255, 255, 0.08)",
      lang
    });
  }
}

function createBadge({ icon, label, sub, color, bg, borderColor, lang }) {
  document.getElementById("gk-badge")?.remove();

  const t = TRANSLATIONS[lang];

  const el = document.createElement("div");
  el.id = "gk-badge";
  el.innerHTML = `
    <div class="gk-icon-wrapper" style="color: ${color}">${icon}</div>
    <div class="gk-text-wrapper">
      <span class="gk-badge-brand">${t.brand}</span>
      <strong class="gk-badge-label">${label}</strong>
      <small class="gk-badge-sub">${sub}</small>
    </div>
    <button class="gk-close-btn" title="${t.close}">✕</button>
  `;
  el.style.cssText = `
    position: fixed;
    top: 80px;
    right: 24px;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #18181b;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f4f4f5;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid ${color};
    max-width: 320px;
    animation: gk-badge-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    transition: all 0.2s ease;
  `;

  if (!document.getElementById("gk-badge-styles")) {
    const style = document.createElement("style");
    style.id = "gk-badge-styles";
    style.textContent = `
      @keyframes gk-badge-in {
        from { transform: translateY(-10px) scale(0.98); opacity: 0; }
        to   { transform: translateY(0) scale(1); opacity: 1; }
      }
      #gk-badge .gk-icon-wrapper {
        font-size: 20px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 6px;
      }
      #gk-badge .gk-text-wrapper {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      #gk-badge .gk-badge-brand {
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.12em;
        color: #9ca3af;
      }
      #gk-badge .gk-badge-label {
        font-weight: 600;
        font-size: 13px;
        color: #ffffff;
        line-height: 1.3;
      }
      #gk-badge .gk-badge-sub {
        font-size: 11px;
        color: #a1a1aa;
        line-height: 1.3;
      }
      #gk-badge .gk-close-btn {
        background: none;
        border: none;
        color: #a1a1aa;
        cursor: pointer;
        opacity: 0.6;
        font-size: 11px;
        padding: 4px;
        margin-left: 6px;
        flex-shrink: 0;
        transition: opacity 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
      }
      #gk-badge .gk-close-btn:hover {
        opacity: 1;
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(el);

  el.querySelector(".gk-close-btn").addEventListener("click", () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px) scale(0.98)";
    setTimeout(() => el.remove(), 200);
  });

  setTimeout(() => {
    if (el && el.parentNode) {
      el.style.opacity = "0";
      el.style.transform = "translateY(-10px) scale(0.98)";
      setTimeout(() => el.remove(), 200);
    }
  }, 8000);
}
