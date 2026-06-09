// library/library.js

const chromeAPI = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

let allGames = [];
let activeFilter = 'all'; // 'all', 'steam', 'epic'
let currentLang = 'en';

const STEAM_SVG = `
<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
  <path d="M12 .007c-5.59 0-10.25 3.903-11.53 9.17l5.96 2.47a3.54 3.54 0 0 1 3.5-1.57l3.19-4.57a3.53 3.53 0 0 1 3.53-2.94 3.55 3.55 0 0 1 3.55 3.55 3.55 3.55 0 0 1-3.55 3.55c-.71 0-1.37-.21-1.92-.57l-4.52 3.23c.04.22.06.44.06.67a3.55 3.55 0 0 1-3.55 3.55c-1.3 0-2.45-.71-3.08-1.78l-5.69-2.36A12 12 0 0 0 12 24c6.63 0 12-5.37 12-12S18.63.007 12 .007zm-2.92 13.91a1.64 1.64 0 0 0 1.64-1.64c0-.9-.73-1.64-1.64-1.64a1.64 1.64 0 0 0-1.64 1.64c0 .91.74 1.64 1.64 1.64z"/>
</svg>`;

const EPIC_SVG = `
<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
  <path d="M12 0L1.75 3v13.5L12 24l10.25-7.5V3L12 0zm7.64 15.54L12 21.05l-7.64-5.51v-9.6L12 8.78l7.64-2.84v9.6zM12 9.92c-.67 0-1.2-.53-1.2-1.2s.53-1.2 1.2-1.2 1.2.53 1.2 1.2-.53 1.2-1.2 1.2z"/>
</svg>`;

const TRANSLATIONS = {
  en: {
    pageTitle: "Stashy — Games Library",
    subtitle: "Unified Games Library",
    totalUnique: "Total Unique Games",
    steamGames: "Steam Games",
    epicGames: "Epic Games",
    placeholder: "Search your library (e.g. Witcher)...",
    all: "All",
    steam: "Steam",
    epic: "Epic Games",
    thTitle: "Game Title",
    thPlatform: "Platform",
    noResults: "No games found matching your search."
  },
  tr: {
    pageTitle: "Stashy — Kütüphane Paneli",
    subtitle: "Tümleşik Kütüphane Paneli",
    totalUnique: "Toplam Benzersiz Oyun",
    steamGames: "Steam Oyunları",
    epicGames: "Epic Games Oyunları",
    placeholder: "Kütüphanenizde ara (örn. Witcher)...",
    all: "Tümü",
    steam: "Steam",
    epic: "Epic Games",
    thTitle: "Oyun Adı",
    thPlatform: "Platform",
    noResults: "Aradığınız kriterlere uygun oyun bulunamadı."
  }
};

async function init() {
  if (!chromeAPI) return;

  // Retrieve Language
  const langStore = await chromeAPI.storage.local.get("glc_language");
  currentLang = langStore.glc_language || "en";

  translateUI();

  const data = await chromeAPI.storage.local.get(['glc_steam_library', 'glc_epic_library']);
  const steamGames = data.glc_steam_library || [];
  const epicGames  = data.glc_epic_library  || [];

  // Update Stats Cards
  document.getElementById('stat-steam').textContent = steamGames.length;
  document.getElementById('stat-epic').textContent  = epicGames.length;

  // Merge unique games list
  const merged = {};
  steamGames.forEach(g => {
    merged[g.slug] = {
      title: g.title,
      platforms: ['steam']
    };
  });

  epicGames.forEach(g => {
    if (merged[g.slug]) {
      if (!merged[g.slug].platforms.includes('epic')) {
        merged[g.slug].platforms.push('epic');
      }
    } else {
      merged[g.slug] = {
        title: g.title,
        platforms: ['epic']
      };
    }
  });

  allGames = Object.values(merged).sort((a, b) => a.title.localeCompare(b.title, currentLang === "tr" ? "tr-TR" : "en-US"));
  document.getElementById('stat-total').textContent = allGames.length;

  renderTable();

  // Search input listener
  document.getElementById('search-box').addEventListener('input', renderTable);

  // Filter button listeners
  document.getElementById('btn-filter-all').addEventListener('click', (e) => setFilter('all', e.target));
  document.getElementById('btn-filter-steam').addEventListener('click', (e) => setFilter('steam', e.target));
  document.getElementById('btn-filter-epic').addEventListener('click', (e) => setFilter('epic', e.target));
}

function translateUI() {
  const t = TRANSLATIONS[currentLang];
  
  document.getElementById("page-title").textContent = t.pageTitle;
  document.getElementById("lib-subtitle").textContent = t.subtitle;
  document.getElementById("lib-total-label").textContent = t.totalUnique;
  document.getElementById("lib-steam-label").textContent = t.steamGames;
  document.getElementById("lib-epic-label").textContent = t.epicGames;
  
  document.getElementById("search-box").placeholder = t.placeholder;
  
  document.getElementById("btn-filter-all").textContent = t.all;
  document.getElementById("btn-filter-steam").textContent = t.steam;
  document.getElementById("btn-filter-epic").textContent = t.epic;
  
  document.getElementById("th-title").textContent = t.thTitle;
  document.getElementById("th-platform").textContent = t.thPlatform;
  
  document.getElementById("no-results-msg").textContent = t.noResults;
}

function setFilter(filter, buttonEl) {
  activeFilter = filter;
  
  // Update button active classes
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  buttonEl.classList.add('active');

  renderTable();
}

function renderTable() {
  const query = document.getElementById('search-box').value.toLowerCase().trim();
  const tbody = document.getElementById('library-body');
  tbody.innerHTML = '';

  let filtered = allGames.filter(game => {
    // Platform Filter
    if (activeFilter === 'steam' && !game.platforms.includes('steam')) return false;
    if (activeFilter === 'epic' && !game.platforms.includes('epic')) return false;

    // Search query filter
    if (query.length > 0) {
      return game.title.toLowerCase().includes(query);
    }
    return true;
  });

  if (filtered.length === 0) {
    document.getElementById('no-results-msg').style.display = 'block';
    return;
  }

  document.getElementById('no-results-msg').style.display = 'none';

  filtered.forEach(game => {
    const tr = document.createElement('tr');
    tr.className = 'game-row';

    const tdTitle = document.createElement('td');
    tdTitle.className = 'game-title';
    tdTitle.textContent = game.title;

    const tdPlatform = document.createElement('td');
    game.platforms.forEach(plat => {
      const badge = document.createElement('span');
      badge.className = `platform-badge ${plat}`;
      
      const parser = new DOMParser();
      const svgString = plat === 'steam' ? STEAM_SVG : EPIC_SVG;
      const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
      
      badge.appendChild(svgDoc.documentElement);
      badge.appendChild(document.createTextNode(plat === 'steam' ? ' Steam' : ' Epic Games'));
      
      tdPlatform.appendChild(badge);
      tdPlatform.appendChild(document.createTextNode(' '));
    });

    tr.appendChild(tdTitle);
    tr.appendChild(tdPlatform);
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', init);
