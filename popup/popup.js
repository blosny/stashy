// popup/popup.js

const chromeAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

// Ultra-clean flat SVG Logos
const STEAM_SVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
  <path d="M12 .007c-5.59 0-10.25 3.903-11.53 9.17l5.96 2.47a3.54 3.54 0 0 1 3.5-1.57l3.19-4.57a3.53 3.53 0 0 1 3.53-2.94 3.55 3.55 0 0 1 3.55 3.55 3.55 3.55 0 0 1-3.55 3.55c-.71 0-1.37-.21-1.92-.57l-4.52 3.23c.04.22.06.44.06.67a3.55 3.55 0 0 1-3.55 3.55c-1.3 0-2.45-.71-3.08-1.78l-5.69-2.36A12 12 0 0 0 12 24c6.63 0 12-5.37 12-12S18.63.007 12 .007zm-2.92 13.91a1.64 1.64 0 0 0 1.64-1.64c0-.9-.73-1.64-1.64-1.64a1.64 1.64 0 0 0-1.64 1.64c0 .91.74 1.64 1.64 1.64z"/>
</svg>`;

const EPIC_SVG = `
<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
  <path d="M12 0L1.75 3v13.5L12 24l10.25-7.5V3L12 0zm7.64 15.54L12 21.05l-7.64-5.51v-9.6L12 8.78l7.64-2.84v9.6zM12 9.92c-.67 0-1.2-.53-1.2-1.2s.53-1.2 1.2-1.2 1.2.53 1.2 1.2-.53 1.2-1.2 1.2z"/>
</svg>`;

const TRANSLATIONS = {
  en: {
    steamGames: "games",
    epicGames: "games",
    notSynced: "Not synced yet",
    syncSteam: "Sync Steam",
    syncEpic: "Sync Epic",
    resetDb: "Reset Database 🗑️",
    viewLib: "View My Library 📚",
    secureSync: "🔒 Secure Auto-Sync",
    syncDesc: "The screen will lock during sync while games are securely scanned. Please do not touch your mouse until it completes.",
    confirmReset: "Are you sure you want to clear all local library data? The extension will be completely reset.",
    active: "Active",
    missing: "Missing",
    loading: "LOADING..."
  },
  tr: {
    steamGames: "oyun",
    epicGames: "oyun",
    notSynced: "Senkronizasyon yapılmadı",
    syncSteam: "Steam Eşitle",
    syncEpic: "Epic Eşitle",
    resetDb: "Veritabanını Sıfırla 🗑️",
    viewLib: "Kütüphanemi Gör 📚",
    secureSync: "🔒 Güvenli Otomatik Eşitleme",
    syncDesc: "Eşitleme sırasında ekran kilitlenip oyunlar güvenle taranacaktır. Lütfen tarama bitene kadar fareye dokunmayın.",
    confirmReset: "Yerel kütüphane verilerinizin tamamı silinsin mi? Eklenti sıfırlanacaktır.",
    active: "Aktif",
    missing: "Eksik",
    loading: "YÜKLENİYOR..."
  }
};

let currentLang = "en";

async function render() {
  if (!chromeAPI) return;

  // Retrieve language from storage
  const store = await chromeAPI.storage.local.get("glc_language");
  currentLang = store.glc_language || "en";

  // Render language toggle UI active states
  document.getElementById("lang-en").classList.toggle("active", currentLang === "en");
  document.getElementById("lang-tr").classList.toggle("active", currentLang === "tr");

  const t = TRANSLATIONS[currentLang];

  const status = await chromeAPI.runtime.sendMessage({ type: "GET_STATUS" });
  const content = document.getElementById("content");

  const steamSynced = status.steam.count > 0;
  const epicSynced  = status.epic.count  > 0;

  const fmt = ts => ts
    ? new Date(ts).toLocaleDateString(currentLang === "tr" ? "tr-TR" : "en-US", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })
    : null;

  content.innerHTML = `
    <div class="platform-card steam-card">
      <div class="platform-icon-wrapper steam">
        ${STEAM_SVG}
      </div>
      <div class="platform-info">
        <div class="platform-title-row">
          <span class="platform-name">Steam</span>
          <span class="status-indicator-dot ${steamSynced ? "active" : "inactive"}" title="${steamSynced ? t.active : t.missing}"></span>
        </div>
        <div class="platform-meta">
          ${steamSynced
            ? `<strong>${status.steam.count}</strong> ${t.steamGames} • ${fmt(status.steam.updated)}`
            : t.notSynced}
        </div>
      </div>
    </div>

    <div class="platform-card epic-card">
      <div class="platform-icon-wrapper epic">
        ${EPIC_SVG}
      </div>
      <div class="platform-info">
        <div class="platform-title-row">
          <span class="platform-name">Epic Games</span>
          <span class="status-indicator-dot ${epicSynced ? "active" : "inactive"}" title="${epicSynced ? t.active : t.missing}"></span>
        </div>
        <div class="platform-meta">
          ${epicSynced
            ? `<strong>${status.epic.count}</strong> ${t.epicGames} • ${fmt(status.epic.updated)}`
            : t.notSynced}
        </div>
      </div>
    </div>

    <div class="sync-banner">
      <div class="sync-banner-title">
        ${t.secureSync}
      </div>
      <div class="sync-banner-text">
        ${t.syncDesc}
      </div>
    </div>

    <div class="action-footer">
      <div class="btn-sync-row">
        <button class="btn btn-sync-steam" id="btn-sync-steam">
          ${t.syncSteam}
        </button>
        <button class="btn btn-sync-epic" id="btn-sync-epic">
          ${t.syncEpic}
        </button>
      </div>
      <button class="btn btn-library-show" id="btn-library">${t.viewLib}</button>
      <button class="btn btn-danger-reset" id="btn-clear">${t.resetDb}</button>
    </div>
  `;

  // Bind Actions
  document.getElementById("btn-clear").addEventListener("click", async () => {
    if (confirm(t.confirmReset)) {
      await chromeAPI.storage.local.clear();
      // Restore language selection after clear
      await chromeAPI.storage.local.set({ "glc_language": currentLang });
      render();
    }
  });

  document.getElementById("btn-library").addEventListener("click", () => {
    chromeAPI.tabs.create({ url: chromeAPI.runtime.getURL("library/library.html") });
    window.close();
  });

  document.getElementById("btn-sync-steam").addEventListener("click", () => {
    chromeAPI.tabs.create({ url: "https://steamcommunity.com/my/games/?tab=all" });
    window.close();
  });

  document.getElementById("btn-sync-epic").addEventListener("click", () => {
    chromeAPI.tabs.create({ url: "https://www.epicgames.com/account/transactions" });
    window.close();
  });
}

// Bind Language Toggles
document.getElementById("lang-en").addEventListener("click", async () => {
  if (chromeAPI) {
    await chromeAPI.storage.local.set({ "glc_language": "en" });
    render();
  }
});

document.getElementById("lang-tr").addEventListener("click", async () => {
  if (chromeAPI) {
    await chromeAPI.storage.local.set({ "glc_language": "tr" });
    render();
  }
});

render();
