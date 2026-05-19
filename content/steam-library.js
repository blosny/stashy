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

async function waitAndExtract() {
  let attempts = 0;
  const maxAttempts = 15;
  let lastGamesCount = 0;
  let noChangeCount = 0;

  // Show dynamic glassmorphism screen overlay blocker
  showScanningOverlay("Steam");

  // Auto-scroll loop to force lazy loading
  const scrollInterval = setInterval(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, 400);

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      attempts++;
      const games = extractSteamGames();

      console.log(`[Stashy] Scraped ${games.length} games...`);
      updateScanningOverlayText(`Scanning: ${games.length} games found... Please do not touch your mouse.`);

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
  showToast(`Steam: ${games.length} games synchronized successfully ✓`);
}

function showToast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 99999;
    background: #1a9f4e; color: #fff;
    padding: 12px 20px; border-radius: 10px;
    font: 600 13px/1.4 system-ui, -apple-system, sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,.35);
    border: 1px solid rgba(255,255,255,.1);
    animation: gk-slide-in .25s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  
  if (!document.getElementById("gk-toast-style")) {
    document.head.insertAdjacentHTML("beforeend", `
      <style id="gk-toast-style">
        @keyframes gk-slide-in {
          from { transform: translateY(20px); opacity:0 }
          to   { transform: translateY(0);    opacity:1 }
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

function showScanningOverlay(platform) {
  const overlay = document.createElement("div");
  overlay.id = "stashy-scanning-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(11, 14, 20, 0.9);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    z-index: 10000000; display: flex; flex-direction: column;
    align-items: center; justify-content: center; color: #fff;
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: all; /* Block mouse interactions completely */
    transition: opacity 0.5s ease;
  `;
  overlay.innerHTML = `
    <div style="font-size: 64px; margin-bottom: 24px; animation: pulse-stashy 2s infinite;">🛡️</div>
    <h2 style="font-size: 28px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em;">Stashy Library Sync</h2>
    <p style="font-size: 14px; color: #9ca3af; margin-bottom: 20px; font-weight: 500;" id="stashy-overlay-sub">Please wait while your games are scanned... Do not touch your mouse.</p>
    <div style="width: 240px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
      <div style="width: 30%; height: 100%; background: #4f46e5; border-radius: 3px; animation: progress-stashy 1.5s infinite ease-in-out;" id="stashy-overlay-progress"></div>
    </div>
    <style>
      @keyframes pulse-stashy {
        0%, 100% { transform: scale(1); opacity: 0.8; }
        50% { transform: scale(1.1); opacity: 1; }
      }
      @keyframes progress-stashy {
        0% { margin-left: -30%; width: 30%; }
        50% { width: 40%; }
        100% { margin-left: 100%; width: 30%; }
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


