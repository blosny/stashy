# Stashy

A secure, offline-first browser extension that compares Steam and Epic Games libraries, displaying matte ownership HUD cards directly on product store pages to prevent accidental double purchases.

[![Install on Firefox](https://img.shields.io/badge/Firefox_Add--ons-Install_Stashy-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/tr/firefox/addon/stashy/)

Technology Stack: Vanilla JavaScript · Vanilla CSS · HTML5 · Chrome Storage API

---

## Architecture Overview

Stashy operates entirely in the user space inside the local browser sandbox. It utilizes content scripts to read game catalog tables and inject reactive CSS overlays, a central service worker to coordinate normalization/matching, and native storage to maintain game databases without requesting account credentials.

```
       +--------------------------------------------------------+
       |                  Active Browser Tabs                   |
       +──────────────────────────┬─────────────────────────────+
                                  │
         (DOM Scraping)           │ (DOM Hydration / Injection)
         Scrape Game Lists        │ Matte HUD Badges
                                  ▼
                    +───────────────────────────+
                    |      Content Scripts      |
                    |   * content/badge.js      |
                    |   * steam-library.js      |
                    |   * epic-library.js       |
                    +─────────────┬─────────────+
                                  │
                                  │ Runtime Messages (chrome.runtime)
                                  ▼
                    +───────────────────────────+
                    | Background Service Worker |
                    |      * background.js      |
                    +─────────────┬─────────────+
                                  │
                                  │ Local Read/Write Operations
                                  ▼
                    +───────────────────────────+
                    |      Browser Sandbox      |
                    |   * chrome.storage.local  |
                    +───────────────────────────+
```

---

## Security Pillars

Unlike legacy alternatives, Stashy prioritizes zero-knowledge privacy and system-level security:

* **Zero Cloud Connections:** The extension executes 100% offline. No telemetry, analytical beacons, or platform endpoints are ever pinged.
* **No Authentication Tokens:** The system does not request Steam API Keys, cookies, or Epic Games account credentials. It relies on passive scanning of locally loaded web structures.
* **Sandbox Isolation:** Game database lists are strictly stored in local sandboxed key-value tables (`chrome.storage.local`), ensuring no other browser extensions can inspect your inventory.

---

## Matching Logic & Edition Verification

The matching engine inside `background.js` utilizes dynamic slug transliteration to clean special characters and Turkish-specific letters (e.g., `ç` -> `c`, `ğ` -> `g`) to guarantee high-accuracy matching.

### Edition Comparison Matrix

| Target Store Page Title | Synced Library Matches | Rendered HUD Badge | Alert Action |
| :--- | :--- | :--- | :--- |
| The Witcher 3: Wild Hunt | The Witcher 3: Wild Hunt | Owned | Clean dark slate indicator |
| The Witcher 3: Wild Hunt - Complete Edition | The Witcher 3: Wild Hunt | Base Game Owned | Amber warning card advising expanded bundle already contains base game |
| Assassin's Creed Odyssey | Assassin's Creed Odyssey - Gold Edition | More Complete Edition Owned | Green matte badge indicating owned version is superior to store page |
| Anomaly Agent (DLC Package) | Anomaly Agent | Base Game Owned | Amber notification informing the user that the base game is already owned |

---

## Project Structure

```
stashy/
├── content/
│   ├── badge.js             # High-frequency location observer & store page HUD injector
│   ├── epic-library.js      # Scrapers and transaction scanners for Epic Games
│   └── steam-library.js     # Dom block reader and lock-screener for Steam Games
├── icons/
│   ├── icon-48.png          # Scaled 48x48 pixel matte desktop brand logo
│   ├── icon-128.png         # Scaled 128x128 pixel store catalog brand logo
│   └── icon.png             # Raw original brand resource
├── library/
│   ├── library.html         # Unified offline catalog list HTML
│   └── library.js           # Dynamic bilingual database renderer & local sorter
├── popup/
│   ├── popup.html           # Matte dashboard popup frame
│   └── popup.js             # Language toggle listener & active platform sync router
├── background.js            # Core matching engine, slug tokenizer, and sync port router
├── manifest.json            # Configuration metadata and Gecko permission sets
└── .gitignore               # Strict path filters to avoid committing private system tokens
```

---

## Developer API & Message Reference

All extension routines interact asynchronously via `chrome.runtime.sendMessage`.

### 1. GET_STATUS
Triggered by the popup UI to fetch sync status, game counts, and update timestamps.

* **Payload:** `{ type: "GET_STATUS" }`
* **Response format:**
```json
{
  "steam": {
    "count": 98,
    "updated": 1779182619619
  },
  "epic": {
    "count": 24,
    "updated": 1779182626675
  }
}
```

### 2. SAVE_STEAM_LIBRARY
Dispatched by the Steam scraper once parsing finishes.

* **Payload:** 
```json
{
  "type": "SAVE_STEAM_LIBRARY",
  "games": [
    "Assassin's Creed Valhalla",
    "Counter-Strike 2"
  ]
}
```

### 3. CHECK_GAME
Pushed by content/badge.js to cross-reference page headings against local databases.

* **Payload:** `{ type: "CHECK_GAME", title: "Assassin's Creed Odyssey" }`
* **Response format:**
```json
{
  "owned": true,
  "platform": "Steam",
  "isStoreMoreComplete": false,
  "isLibraryMoreComplete": true
}
```

---

## Local Development & Setup

### Prerequisites

* Google Chrome, Brave, Edge, or Zen Browser (Firefox-based).

### Manual Load Steps (Developer Mode)

#### For Google Chrome & Chromium Browsers:
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle the "Developer mode" switch in the top right.
3. Click "Load unpacked" in the top left.
4. Select the `stashy` project root folder (`c:\projects\game-library-checker`).

#### For Firefox & Zen Browser:
1. Open the browser and navigate to `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on...".
3. Navigate to the `stashy` project root folder and select the `manifest.json` file.

---

## Design Decisions

* **No-Telemetry Guarantee:** We explicitly set `browser_specific_settings.gecko.data_collection_permissions.required` to `["none"]` to declare a zero-data telemetry footprint.
* **Apple/Notion Matte UI:** Avoided typical glowing or grid-heavy gaming overlays. The interface leverages charcoal matte blocks (`#18181b`), thin subtle borders, and smooth transitions to match premium productivity interfaces.
* **Passive Sync Framework:** Instantly saves new purchases without requiring manual manual clicks. If you naturally browse your personal inventory pages, Stashy records and syncs additions quietly in the background.
