// background.js — Stashy central message and data manager

const STORAGE_KEY_STEAM = "glc_steam_library";
const STORAGE_KEY_EPIC  = "glc_epic_library";
const STORAGE_META      = "glc_meta";

// Cross-browser extension API wrapper
const chromeAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

if (chromeAPI) {
  // Listen for messages from content scripts and popup
  chromeAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      // Save library (from steam-library.js and epic-library.js)
      case "SAVE_STEAM_LIBRARY":
        saveLibrary(STORAGE_KEY_STEAM, msg.games).then(() => {
          sendResponse({ ok: true, count: msg.games.length });
        });
        return true;

      case "SAVE_EPIC_LIBRARY":
        saveLibrary(STORAGE_KEY_EPIC, msg.games).then(() => {
          sendResponse({ ok: true, count: msg.games.length });
        });
        return true;

      // Badge check (from badge.js)
      case "CHECK_GAME":
        checkGame(msg.title, msg.platform).then(result => {
          sendResponse(result);
        });
        return true;

      // Status info for Popup
      case "GET_STATUS":
        getStatus().then(sendResponse);
        return true;
    }
  });
}

async function saveLibrary(key, games) {
  if (!chromeAPI) return;

  // Normalize: lower case + space and Turkish char translation -> fast exact/fuzzy match
  const normalizedNew = games.map(g => ({
    id:    g.id    || null,
    title: g.title || "",
    slug:  normalize(g.title)
  }));

  // Retrieve existing games from local storage to merge
  const existingData = await chromeAPI.storage.local.get(key);
  const existingGames = existingData[key] || [];

  // Merge unique games by slug
  const mergedGames = [...existingGames];
  const existingSlugs = new Set(existingGames.map(g => g.slug));

  normalizedNew.forEach(g => {
    if (!existingSlugs.has(g.slug)) {
      mergedGames.push(g);
      existingSlugs.add(g.slug);
    }
  });

  await chromeAPI.storage.local.set({ [key]: mergedGames });

  const meta = await getMeta();
  const platform = key === STORAGE_KEY_STEAM ? "steam" : "epic";
  meta[platform + "_updated"] = Date.now();
  meta[platform + "_count"]   = mergedGames.length;
  await chromeAPI.storage.local.set({ [STORAGE_META]: meta });

  console.log(`[Stashy] ${platform} library updated: total ${mergedGames.length} games (added ${normalizedNew.length} new)`);
}

async function checkGame(title, currentPlatform) {
  if (!chromeAPI) return { inSteam: false, inEpic: false, steamCount: 0, epicCount: 0 };

  const [steamLib, epicLib] = await Promise.all([
    chromeAPI.storage.local.get(STORAGE_KEY_STEAM),
    chromeAPI.storage.local.get(STORAGE_KEY_EPIC)
  ]);

  const steamGames = steamLib[STORAGE_KEY_STEAM] || [];
  const epicGames  = epicLib[STORAGE_KEY_EPIC]   || [];

  const storeSlug = normalize(title);

  function findOwnership(gamesList) {
    // 1. Strict exact match
    let exactMatch = gamesList.find(g => g.slug === storeSlug);
    if (exactMatch) {
      return { owned: true, exact: true, game: exactMatch };
    }

    // 2. Suffix / Edition / Partial match
    let partialMatch = gamesList.find(g => fuzzyMatch(g.slug, storeSlug));
    if (partialMatch) {
      const libSlug = partialMatch.slug;
      const isStoreMoreComplete = storeSlug.length > libSlug.length;
      return {
        owned: true,
        exact: false,
        isStoreMoreComplete,
        game: partialMatch
      };
    }

    return { owned: false };
  }

  const steamOwned = findOwnership(steamGames);
  const epicOwned  = findOwnership(epicGames);

  return {
    title,
    currentPlatform,
    inSteam: steamOwned.owned,
    inEpic: epicOwned.owned,
    steamDetails: steamOwned,
    epicDetails: epicOwned,
    steamCount: steamGames.length,
    epicCount:  epicGames.length
  };
}

async function getStatus() {
  if (!chromeAPI) return { steam: { count: 0, updated: null }, epic: { count: 0, updated: null } };

  const [meta, steam, epic] = await Promise.all([
    getMeta(),
    chromeAPI.storage.local.get(STORAGE_KEY_STEAM),
    chromeAPI.storage.local.get(STORAGE_KEY_EPIC)
  ]);

  return {
    steam: {
      count:   (steam[STORAGE_KEY_STEAM] || []).length,
      updated: meta.steam_updated || null
    },
    epic: {
      count:   (epic[STORAGE_KEY_EPIC] || []).length,
      updated: meta.epic_updated || null
    }
  };
}

async function getMeta() {
  if (!chromeAPI) return {};
  const data = await chromeAPI.storage.local.get(STORAGE_META);
  return data[STORAGE_META] || {};
}

// Robust transliterated normalizer: "Süper Kaleci: Wild Hunt" -> "superkaleciwildhunt"
function normalize(str) {
  if (!str) return "";
  let val = str.toLowerCase();
  
  // Transliterate Turkish characters to English equivalents
  const turkishMap = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'â': 'a', 'î': 'i', 'û': 'u'
  };
  
  for (const char in turkishMap) {
    val = val.replaceAll(char, turkishMap[char]);
  }
  
  return val.replace(/[^a-z0-9]/g, "");
}

// Fuzzy matching for game title suffixes (DLCs, Special Editions etc.)
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const shorter = a.length < b.length ? a : b;
  const longer  = a.length < b.length ? b : a;
  if (shorter.length < 5) return false;
  return longer.startsWith(shorter) || longer.includes(shorter);
}

