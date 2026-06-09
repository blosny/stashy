// content/steam-library.js
// Triggered: steamcommunity.com/id/.../games or /profiles/.../games

const chromeAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

(async () => {
  // Automatically redirect to ?tab=all if not already present, to load the full games list instead of Recently Played
  if (window.location.href.includes("/games") && !window.location.search.includes("tab=all")) {
    console.log("[Stashy] Redirecting to ?tab=all to load full library...");
    window.location.href = window.location.origin + window.location.pathname + "?tab=all";
    return;
  }

  console.log("[Stashy] Steam games page detected, waiting for games to load...");
  await waitAndExtract();
})();

let currentLang = "en";

async function waitAndExtract() {
  const langStore = chromeAPI ? await chromeAPI.storage.local.get("glc_language") : {};
  currentLang = langStore.glc_language || "en";

  let attempts = 0;
  const maxAttempts = 60; // Increased to allow large libraries to load
  let lastGamesCount = 0;
  let noChangeCount = 0;

  showScanningOverlay(currentLang);

  // Auto-scroll loop to force lazy loading
  const scrollInterval = setInterval(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, 400);

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      attempts++;
      const games = extractSteamGames();

      console.log(`[Stashy] Scraped ${games.length} games...`);
      const scanText = currentLang === "tr"
        ? `Taranıyor: ${games.length} oyun bulundu... Lütfen farenize dokunmayın.`
        : `Scanning: ${games.length} games found... Please do not touch your mouse.`;
      updateScanningOverlayText(scanText);

      if (games.length > 0) {
        if (games.length === lastGamesCount) {
          noChangeCount++;
        } else {
          noChangeCount = 0;
          lastGamesCount = games.length;
        }

        // If the number of scraped games hasn't changed in 3 seconds, we've loaded all of them
        if (noChangeCount >= 3 || attempts >= maxAttempts) {
          clearInterval(scrollInterval);
          clearInterval(interval);
          console.log(`[Stashy] Finished scrolling. Scraped total of ${games.length} games.`);
          removeScanningOverlay();
          await sendLibrary(games);
          resolve();
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(scrollInterval);
        clearInterval(interval);
        console.warn("[Stashy] Steam: games list could not be loaded or is empty.");
        removeScanningOverlay();
        const errText = currentLang === "tr"
          ? "Steam: Oyun bulunamadı. Profilinizin ve oyun detaylarınızın Herkese Açık olduğundan emin olun."
          : "Steam: No games found. Make sure your profile & game details are set to Public.";
        showToast(errText, "#ef4444");
        resolve();
      }
    }, 1000);
  });
}

function isValidGameTitle(title) {
  if (!title) return false;
  const t = title.toLowerCase().trim();
  const invalidKeywords = [
    "mağaza sayfası",
    "store page",
    "topluluk merkezi",
    "community hub",
    "incelemeler",
    "reviews",
    "dlc",
    "eklentiler",
    "destek",
    "support",
    "oyna",
    "play",
    "kütüphane",
    "library",
    "haberler",
    "news"
  ];
  return !invalidKeywords.some(kw => t === kw || t.includes("mağaza sayfası") || t.includes("store page") || t.includes("topluluk merkezi"));
}

function extractSteamGames() {
  const games = [];
  const seen = new Set();

  // Try legacy and modern game row selectors
  const rowSelectors = [
    ".gameListRow",
    "[class*='gameListRow']",
    "[class*='GameRow']",
    "[class*='game_row']",
    ".game_list_row"
  ];

  let rows = [];
  for (const sel of rowSelectors) {
    rows = document.querySelectorAll(sel);
    if (rows.length > 0) break;
  }

  if (rows.length > 0) {
    rows.forEach(row => {
      // Look for title element inside row
      const titleSelectors = [
        ".gameListRowItemName",
        "[class*='gameListRowItemName']",
        "[class*='game_name']",
        "[class*='GameName']",
        "[class*='gameTitle']",
        "h4",
        "span",
        "a"
      ];
      
      let title = "";
      for (const sel of titleSelectors) {
        const el = row.querySelector(sel);
        if (el && el.textContent.trim().length > 1) {
          title = el.textContent.trim();
          break;
        }
      }

      const linkEl = row.querySelector("a[href*='/app/']");
      const href = linkEl ? linkEl.href : "";
      const match = href.match(/\/app\/(\d+)/);
      const id = match ? match[1] : null;

      if (title && isValidGameTitle(title) && !seen.has(title)) {
        seen.add(title);
        games.push({ id, title });
      }
    });
  }

  // Fallback: If no rows found, search for any links containing /app/ and extract their texts
  if (games.length === 0) {
    document.querySelectorAll("a[href*='/app/']").forEach(link => {
      const title = link.textContent.trim();
      const match = link.href.match(/\/app\/(\d+)/);
      const id = match ? match[1] : null;
      if (title.length > 2 && isValidGameTitle(title) && !seen.has(title) && !/^\d+$/.test(title)) {
        seen.add(title);
        games.push({ id, title });
      }
    });
  }

  // Try parsing from window.rgGames if DOM scraping failed
  if (games.length === 0) {
    try {
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        if (s.textContent.includes("rgGames")) {
          const match = s.textContent.match(/var rgGames\s*=\s*(\[[\s\S]*?\]);/);
          if (match) {
            const parsed = JSON.parse(match[1]);
            parsed.forEach(g => {
              if (g.name && isValidGameTitle(g.name) && !seen.has(g.name)) {
                seen.add(g.name);
                games.push({ id: String(g.appid), title: g.name });
              }
            });
            break;
          }
        }
      }
    } catch (e) {
      console.warn("[Stashy] Steam script parse error:", e);
    }
  }

  return games;
}

async function sendLibrary(games) {
  if (!chromeAPI) return;

  const response = await chromeAPI.runtime.sendMessage({
    type: "SAVE_STEAM_LIBRARY",
    games
  });
  console.log(`[Stashy] Steam library saved: ${response.count} games`);

  // Toast notification for user
  const successText = currentLang === "tr"
    ? `Steam: ${games.length} oyun başarıyla eşitlendi ✓`
    : `Steam: ${games.length} games synchronized successfully ✓`;
  showToast(successText, "#10b981");
}

function showToast(msg, color = "#10b981") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; bottom: 32px; right: 32px; z-index: 99999;
    background: #121212; color: #f4f4f5;
    padding: 12px 16px; border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px; font-weight: 500;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    border: 1px solid #27272a;
    border-left: 4px solid ${color};
    animation: gk-toast-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  `;
  
  if (!document.getElementById("gk-toast-style")) {
    document.head.insertAdjacentHTML("beforeend", `
      <style id="gk-toast-style">
        @keyframes gk-toast-in {
          from { transform: translateX(100%); opacity:0 }
          to   { transform: translateX(0);    opacity:1 }
        }
      </style>
    `);
  }
  
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.25s, transform 0.25s";
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => el.remove(), 250);
  }, 3500);
}

function showScanningOverlay(lang) {
  const isTr = lang === "tr";
  const title = isTr ? "Stashy Kütüphane Eşitleme" : "Stashy Library Sync";
  const sub = isTr ? "Oyunlarınız taranırken lütfen farenize dokunmayın." : "Please do not touch your mouse while games are scanned.";

  const overlay = document.createElement("div");
  overlay.id = "stashy-scanning-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(18, 18, 18, 0.95);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    z-index: 10000000; display: flex; flex-direction: column;
    align-items: center; justify-content: center; color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    pointer-events: all;
    transition: opacity 0.5s ease;
  `;
  overlay.innerHTML = `
    <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.01em;">${title}</h2>
    <p style="font-size: 13px; color: #a1a1aa; margin-bottom: 24px; font-weight: 500;" id="stashy-overlay-sub">${sub}</p>
    <div style="width: 200px; height: 4px; background: #27272a; border-radius: 2px; overflow: hidden;">
      <div style="width: 30%; height: 100%; background: #10b981; border-radius: 2px; animation: progress-stashy 1.5s infinite ease-in-out;" id="stashy-overlay-progress"></div>
    </div>
    <style>
      @keyframes progress-stashy {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }
    </style>
  `;
  document.body.appendChild(overlay);
}

function updateScanningOverlayText(msg) {
  const el = document.getElementById("stashy-overlay-sub");
  if (el) el.textContent = msg;
}

function removeScanningOverlay() {
  const el = document.getElementById("stashy-scanning-overlay");
  if (el) {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 500);
  }
}


