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

let currentLang = "en";

async function fetchAllEpicGames() {
  console.log("[Stashy] Initiating direct API-based Epic Games library sync...");
  const langStore = chromeAPI ? await chromeAPI.storage.local.get("glc_language") : {};
  currentLang = langStore.glc_language || "en";

  let games = [];
  let seen = new Set();
  let nextPageToken = "";
  let page = 1;
  const maxPages = 20;

  try {
    showScanningOverlay(currentLang);

    while (page <= maxPages) {
      const scanText = currentLang === "tr" 
        ? `Taranıyor: Sayfa ${page} istekleniyor... Lütfen bekleyin.`
        : `Scanning: Requesting page ${page}... Please wait.`;
      updateScanningOverlayText(scanText);
      
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
  const successMsg = currentLang === "tr" 
    ? `Epic: ${response.count} oyun başarıyla eşitlendi ✓`
    : `Epic: ${response.count} games synchronized successfully ✓`;
  showToast(successMsg, "#3b82f6");
}

function showToast(msg, color = "#3b82f6") {
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
      <div style="width: 30%; height: 100%; background: #3b82f6; border-radius: 2px; animation: progress-stashy 1.5s infinite ease-in-out;" id="stashy-overlay-progress"></div>
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
