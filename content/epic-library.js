// content/epic-library.js
// Triggered: epicgames.com/account*

const chromeAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

(async () => {
  console.log("[Stashy] Epic Account observer active.");

  let lastUrl = "";
  setInterval(async () => {
    const currentUrl = window.location.href.toLowerCase();
    
    // Watch for billing/transactions subpages
    const isTargetPage = currentUrl.includes("/transactions") || 
                         currentUrl.includes("/billing") || 
                         currentUrl.includes("/payment") || 
                         currentUrl.includes("/history");

    if (isTargetPage && currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log(`[Stashy] Epic transactions/billing page detected: ${currentUrl}. Starting automated sync...`);
      await fetchAllEpicGames();
    }
  }, 1000);
})();

async function fetchAllEpicGames() {
  console.log("[Stashy] Initiating direct API-based Epic Games library sync...");
  let games = [];
  let seen = new Set();
  let nextPageToken = "";
  let page = 1;
  const maxPages = 20; // Safeguard against endless loop

  try {
    // Show glassmorphic screen overlay blocker
    showScanningOverlay("Epic Games");

    while (page <= maxPages) {
      updateScanningOverlayText(`Scanning: Requesting page ${page}... Please wait.`);
      
      const url = `/account/v2/payment/ajaxGetOrderHistory?nextPageToken=${encodeURIComponent(nextPageToken)}`;
      const res = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!res.ok) {
        throw new Error(`HTTP Status ${res.status}`);
      }

      const data = await res.json();
      if (!data || !data.orders || data.orders.length === 0) {
        break;
      }

      data.orders.forEach(order => {
        if (order.orderStatus === "COMPLETED" || order.orderStatus === "SUCCESSFUL" || !order.orderStatus) {
          if (order.items) {
            order.items.forEach(item => {
              const title = item.description || item.title;
              if (title) {
                // Clean the title from versions/DLCs
                const cleanTitle = title
                  .replace(/\s*-\s*(Digital Edition|Standard Edition|Complete Edition|Edition|DLC|Eklenti)\s*/i, "")
                  .trim();
                if (cleanTitle && !seen.has(cleanTitle)) {
                  seen.add(cleanTitle);
                  games.push({ id: null, title: cleanTitle });
                }
              }
            });
          }
        }
      });

      console.log(`[Stashy] Scraped page ${page}, total game entries so far: ${games.length}`);

      if (data.nextPageToken) {
        nextPageToken = data.nextPageToken;
        page++;
      } else {
        break;
      }
    }

    removeScanningOverlay();

    if (games.length > 0) {
      await sendLibrary(games);
    } else {
      console.warn("[Stashy] Epic: No games extracted from order history JSON.");
      runDOMFallback();
    }
  } catch (e) {
    console.error("[Stashy] Epic API Sync failed:", e);
    removeScanningOverlay();
    runDOMFallback();
  }
}

async function runDOMFallback() {
  console.log("[Stashy] Falling back to DOM-based table cell scraping...");
  const domGames = extractEpicGames();
  if (domGames.length > 0) {
    await sendLibrary(domGames);
  } else {
    showToast("Epic Games: No games found. Please scroll down.", "#e4a000");
  }
}

function extractEpicGames() {
  const games = [];
  const seen = new Set();

  const rows = document.querySelectorAll("tr, [class*='TableRow'], [class*='row']");
  if (rows.length === 0) return games;

  rows.forEach(row => {
    if (row.querySelector("th")) return;

    const cells = row.querySelectorAll("td, div[class*='TableCell'], div[class*='cell']");
    if (cells.length >= 3) {
      let title = "";
      const text0 = cells[0].textContent.trim();
      const text1 = cells[1].textContent.trim();

      const isDate = str => /\d{2}[\.\/-]\d{2}[\.\/-]\d{4}/.test(str) || /\w+ \d+, \d{4}/.test(str);
      const isPrice = str => /[TL$€₼]/.test(str) || /[\d\.,]+\s*TL/i.test(str) || /^(Free|Ücretsiz|[\d\.,\s]+)$/i.test(str);
      const isOrderId = str => /^[a-fA-F0-9-]{12,}$/.test(str) || str.startsWith("A") && /^\d+$/.test(str.substring(1));

      if (text1 && !isDate(text1) && !isPrice(text1) && !isOrderId(text1) && text1.length > 2) {
        title = text1;
      } else if (text0 && !isDate(text0) && !isPrice(text0) && !isOrderId(text0) && text0.length > 2) {
        title = text0;
      }

      if (title) {
        const cleanTitle = title
          .replace(/\s*-\s*(Digital Edition|Standard Edition|Complete Edition|Edition|DLC|Eklenti)\s*/i, "")
          .trim();
        if (cleanTitle && !seen.has(cleanTitle)) {
          seen.add(cleanTitle);
          games.push({ id: null, title: cleanTitle });
        }
      }
    }
  });

  return games;
}

async function sendLibrary(games) {
  if (!chromeAPI) return;

  const response = await chromeAPI.runtime.sendMessage({
    type: "SAVE_EPIC_LIBRARY",
    games
  });
  console.log(`[Stashy] Epic library saved: ${response.count} games`);
  showToast(`Epic: ${response.count} games synchronized successfully ✓`, "#0074e4");
}

function showToast(msg, bg = "#1a9f4e") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 99999;
    background: ${bg}; color: #fff;
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
