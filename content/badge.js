// content/badge.js
// Triggered: Steam or Epic store app/product pages

const chromeAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

let lastUrl = "";
let checkInterval = null;
let lastCheckedTitle = "";
let lastCheckedUrl = "";
let platformWatcher = null;

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
    ownedOther: "Owned on {other}",
    doublePurchase: "Already owned on your other account.",
    notOwned: "Not in Your Library",
    notOwnedDesc: "Not owned on either platform.",
    close: "Close"
  },
  tr: {
    brand: "STASHY",
    notSynced: "Eşitleme Yapılmadı",
    pleaseSync: "Lütfen eklentiden kütüphanenizi eşitleyin.",
    ownedBase: "Ana Oyuna Sahipsin",
    dlcWarning: "Ana oyun sende var, fakat bu sürüm ek paketler içerebilir.",
    ownedMoreComplete: "Daha kapsamlı bir sürüm kütüphanende var.",
    ownedThis: "Bu Platformda Sahipsin",
    inLibrary: "Kütüphanende zaten mevcut.",
    ownedOther: "{other}'de Sahipsin",
    doublePurchase: "Diğer hesabında var, tekrar satın alma.",
    notOwned: "Kütüphanende Yok",
    notOwnedDesc: "İki kütüphanede de bulunmuyor.",
    close: "Kapat"
  }
};

function startPlatformWatcher() {
  if (platformWatcher) clearInterval(platformWatcher);
  
  platformWatcher = setInterval(async () => {
    const platform = detectPlatform();
    if (!platform) return;

    const currentUrl = window.location.href;
    const title = extractTitle(platform);

    if (title && (title !== lastCheckedTitle || currentUrl !== lastCheckedUrl)) {
      console.log(`[Stashy] Detected new game: "${title}". Checking library...`);
      lastCheckedTitle = title;
      lastCheckedUrl = currentUrl;
      
      document.getElementById("stashy-hud")?.remove();
      
      if (!chromeAPI) return;
      
      const result = await chromeAPI.runtime.sendMessage({
        type: "CHECK_GAME",
        title,
        platform
      });
      
      const langStore = await chromeAPI.storage.local.get("glc_language");
      const currentLang = langStore.glc_language || "en";
      
      renderBadge(result, platform, currentLang);
    }
  }, 500);
}

startPlatformWatcher();

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
      accent: "#f59e0b",
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
          accent: "#d97706",
          lang
        });
      } else {
        createBadge({
          icon: "✓",
          label: t.ownedThis,
          sub: `${t.ownedMoreComplete} (${detailsHere.game.title})`,
          accent: "#10b981",
          lang
        });
      }
    } else {
      createBadge({
        icon: "✓",
        label: t.ownedThis,
        sub: t.inLibrary,
        accent: "#10b981",
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
          accent: "#d97706",
          lang
        });
      } else {
        createBadge({
          icon: "🕹️",
          label: otherLabel,
          sub: `${t.ownedMoreComplete} (${detailsOther.game.title})`,
          accent: "#3b82f6",
          lang
        });
      }
    } else {
      createBadge({
        icon: "🕹️",
        label: otherLabel,
        sub: t.doublePurchase,
        accent: "#3b82f6",
        lang
      });
    }
  } else {
    createBadge({
      icon: "🛒",
      label: t.notOwned,
      sub: t.notOwnedDesc,
      accent: "#71717a",
      lang
    });
  }
}

function createBadge({ icon, label, sub, accent, lang }) {
  document.getElementById("stashy-hud")?.remove();

  const t = TRANSLATIONS[lang];
  const el = document.createElement("div");
  el.id = "stashy-hud";
  
  const htmlString = `
    <div class="stashy-indicator" style="background-color: ${accent}"></div>
    <div class="stashy-hud-content">
      <div class="stashy-hud-header">
        <span class="stashy-hud-brand">${t.brand}</span>
        <button class="stashy-close" title="${t.close}">✕</button>
      </div>
      <div class="stashy-hud-body">
        <div class="stashy-icon">${icon}</div>
        <div class="stashy-text">
          <strong>${label}</strong>
          <span>${sub}</span>
        </div>
      </div>
    </div>
  `;

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  while (doc.body.firstChild) {
    el.appendChild(doc.body.firstChild);
  }

  el.style.cssText = `
    position: fixed;
    top: 32px;
    right: 32px;
    z-index: 2147483647;
    display: flex;
    background: #121212;
    border: 1px solid #27272a;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #e4e4e7;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0,0,0,0.2);
    min-width: 280px;
    max-width: 320px;
    overflow: hidden;
    animation: stashy-slide-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  `;

  if (!document.getElementById("stashy-hud-styles")) {
    const style = document.createElement("style");
    style.id = "stashy-hud-styles";
    style.textContent = `
      @keyframes stashy-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }
      #stashy-hud .stashy-indicator {
        width: 4px;
        flex-shrink: 0;
      }
      #stashy-hud .stashy-hud-content {
        padding: 12px 16px;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #stashy-hud .stashy-hud-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #stashy-hud .stashy-hud-brand {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        color: #71717a;
      }
      #stashy-hud .stashy-close {
        background: transparent;
        border: none;
        color: #71717a;
        cursor: pointer;
        font-size: 12px;
        padding: 2px;
        line-height: 1;
      }
      #stashy-hud .stashy-close:hover {
        color: #f4f4f5;
      }
      #stashy-hud .stashy-hud-body {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      #stashy-hud .stashy-icon {
        font-size: 18px;
        line-height: 1;
        margin-top: 2px;
      }
      #stashy-hud .stashy-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      #stashy-hud .stashy-text strong {
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        line-height: 1.2;
      }
      #stashy-hud .stashy-text span {
        font-size: 12px;
        color: #a1a1aa;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(el);

  el.querySelector(".stashy-close").addEventListener("click", () => {
    el.style.animation = "none";
    el.style.transform = "translateX(100%)";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  });

  setTimeout(() => {
    if (el && el.parentNode) {
      el.style.animation = "none";
      el.style.transform = "translateX(100%)";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }
  }, 8000);
}
