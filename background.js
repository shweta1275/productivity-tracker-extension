// DayCheck Background Service Worker
// All data stored locally via chrome.storage.local — nothing sent anywhere.

// ─── Default site categories ───────────────────────────────────────────────
const DEFAULT_CATEGORIES = {
  productive: [
    "leetcode.com", "github.com", "stackoverflow.com", "docs.google.com",
    "notion.so", "figma.com", "codepen.io", "replit.com", "developer.mozilla.org",
    "w3schools.com", "geeksforgeeks.org", "kaggle.com", "colab.research.google.com",
    "coursera.org", "udemy.com", "edx.org", "nptel.ac.in", "brilliant.org",
    "medium.com", "towardsdatascience.com", "arxiv.org", "researchgate.net",
    "claude.ai", "chatgpt.com", "huggingface.co", "paperswithcode.com",
    "linkedin.com", "glassdoor.com", "internshala.com", "unstop.com",
    "hackerrank.com", "codeforces.com", "atcoder.jp", "codechef.com",
    "overleaf.com", "zotero.org", "sciencedirect.com", "jstor.org",
    "anthropic.com", "openai.com", "deepmind.com"
  ],
  youtube_productive: [
    // YouTube is special — tracked separately based on video title keywords
    // Keywords that mark a YT video as productive
  ],
  timepass: [
    "youtube.com", // default; overridden if title suggests learning
    "instagram.com", "twitter.com", "x.com", "facebook.com", "snapchat.com",
    "reddit.com", "9gag.com", "buzzfeed.com", "pinterest.com", "tumblr.com",
    "netflix.com", "primevideo.com", "hotstar.com", "jiocinema.com",
    "spotify.com", "discord.com", "twitch.tv", "tiktok.com", "moj.in",
    "cricbuzz.com", "espncricinfo.com", "sportskeeda.com"
  ],
  neutral: [
    "google.com", "bing.com", "duckduckgo.com",
    "gmail.com", "mail.google.com", "outlook.com",
    "maps.google.com", "translate.google.com",
    "whatsapp.com", "web.whatsapp.com",
    "amazon.in", "amazon.com", "flipkart.com", "swiggy.com", "zomato.com",
    "paytm.com", "phonepe.com", "hdfcbank.com", "sbi.co.in"
  ]
};

// Keywords in YouTube titles that make it count as productive
const YT_PRODUCTIVE_KEYWORDS = [
  "tutorial", "course", "learn", "lecture", "explained", "how to",
  "programming", "coding", "python", "javascript", "machine learning",
  "deep learning", "data science", "ai ", "algorithm", "data structure",
  "system design", "interview", "placement", "project", "build",
  "react", "node", "fastapi", "docker", "kubernetes", "aws", "cloud",
  "math", "physics", "chemistry", "engineering", "gate", "exam",
  "study", "revision", "concepts", "full stack", "backend", "frontend",
  "database", "sql", "nosql", "neural", "nlp", "cv ", "research",
  "paper", "thesis", "statistics", "probability", "calculus",
  "competitive programming", "dsa", "leetcode", "codeforces"
];

// ─── State ──────────────────────────────────────────────────────────────────
let activeTabId = null;
let activeUrl = null;
let activeTitle = null;
let sessionStart = null;
let isIdle = false;

// ─── Helpers ────────────────────────────────────────────────────────────────
function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function classifyDomain(domain, title) {
  if (!domain) return "other";

  // YouTube special handling
  if (domain === "youtube.com" || domain === "youtu.be") {
    if (title) {
      const t = title.toLowerCase();
      const isLearn = YT_PRODUCTIVE_KEYWORDS.some(kw => t.includes(kw));
      return isLearn ? "productive" : "timepass";
    }
    return "timepass";
  }

  // Check custom categories first (user-defined)
  // Will be checked after loading from storage in classify()
  const cats = DEFAULT_CATEGORIES;
  if (cats.productive.some(d => domain === d || domain.endsWith("." + d))) return "productive";
  if (cats.timepass.some(d => domain === d || domain.endsWith("." + d))) return "timepass";
  if (cats.neutral.some(d => domain === d || domain.endsWith("." + d))) return "neutral";
  return "other";
}

async function classifyWithCustom(domain, title) {
  const data = await chrome.storage.local.get("customCategories");
  const custom = data.customCategories || { productive: [], timepass: [], neutral: [] };

  // User custom overrides first
  if (custom.productive.some(d => domain === d || domain.endsWith("." + d))) return "productive";
  if (custom.timepass.some(d => domain === d || domain.endsWith("." + d))) return "timepass";
  if (custom.neutral.some(d => domain === d || domain.endsWith("." + d))) return "neutral";

  // YouTube special
  if (domain === "youtube.com" || domain === "youtu.be") {
    if (title) {
      const t = title.toLowerCase();
      const isLearn = YT_PRODUCTIVE_KEYWORDS.some(kw => t.includes(kw));
      return isLearn ? "productive" : "timepass";
    }
    return "timepass";
  }

  const cats = DEFAULT_CATEGORIES;
  if (cats.productive.some(d => domain === d || domain.endsWith("." + d))) return "productive";
  if (cats.timepass.some(d => domain === d || domain.endsWith("." + d))) return "timepass";
  if (cats.neutral.some(d => domain === d || domain.endsWith("." + d))) return "neutral";
  return "other";
}

// ─── Core: save a time chunk ─────────────────────────────────────────────────
async function saveChunk(url, title, seconds) {
  if (!url || seconds < 2) return; // ignore blinks
  const domain = getDomain(url);
  if (!domain) return;

  const category = await classifyWithCustom(domain, title);
  const today = getTodayKey();

  const key = `day_${today}`;
  const stored = await chrome.storage.local.get(key);
  const dayData = stored[key] || { sessions: [], summary: {} };

  // Add to sessions log
  dayData.sessions.push({
    url,
    domain,
    title: title || domain,
    category,
    seconds,
    ts: Date.now()
  });

  // Update summary
  if (!dayData.summary[domain]) {
    dayData.summary[domain] = { seconds: 0, category, title: title || domain, visits: 0 };
  }
  dayData.summary[domain].seconds += seconds;
  dayData.summary[domain].visits += 1;
  dayData.summary[domain].category = category; // re-classify each time (title may update)
  if (title) dayData.summary[domain].title = title;

  await chrome.storage.local.set({ [key]: dayData });
}

// ─── Track tab switches ───────────────────────────────────────────────────────
async function flushCurrent() {
  if (activeUrl && sessionStart && !isIdle) {
    const seconds = Math.floor((Date.now() - sessionStart) / 1000);
    await saveChunk(activeUrl, activeTitle, seconds);
  }
  sessionStart = Date.now();
}

chrome.tabs.onActivated.addListener(async (info) => {
  await flushCurrent();
  activeTabId = info.tabId;
  try {
    const tab = await chrome.tabs.get(info.tabId);
    activeUrl = tab.url;
    activeTitle = tab.title;
  } catch {
    activeUrl = null;
    activeTitle = null;
  }
  sessionStart = Date.now();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) return;
  if (changeInfo.status === "complete" || changeInfo.url || changeInfo.title) {
    await flushCurrent();
    activeUrl = tab.url;
    activeTitle = tab.title;
    sessionStart = Date.now();
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus — flush but don't track
    await flushCurrent();
    sessionStart = null;
  } else {
    sessionStart = Date.now();
    // Re-detect active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      activeTabId = tab.id;
      activeUrl = tab.url;
      activeTitle = tab.title;
    }
  }
});

// ─── Idle detection ───────────────────────────────────────────────────────────
chrome.idle.setDetectionInterval(60); // 60s of no input = idle

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "idle" || state === "locked") {
    await flushCurrent();
    isIdle = true;
    sessionStart = null;
  } else if (state === "active") {
    isIdle = false;
    sessionStart = Date.now();
  }
});

// ─── Periodic flush every 30s (safety net) ───────────────────────────────────
chrome.alarms.create("periodicFlush", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicFlush" && !isIdle && sessionStart) {
    await flushCurrent();
    sessionStart = Date.now(); // reset so we don't double count
  }
});

// ─── Message handler (from popup) ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TODAY") {
    const today = getTodayKey();
    chrome.storage.local.get(`day_${today}`).then(data => {
      sendResponse({ data: data[`day_${today}`] || null, today });
    });
    return true;
  }
  if (msg.type === "GET_HISTORY") {
    // Return last N days
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    chrome.storage.local.get(days.map(d => `day_${d}`)).then(data => {
      sendResponse({ data, days });
    });
    return true;
  }
  if (msg.type === "FLUSH_NOW") {
    flushCurrent().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ─── Init: detect current active tab on extension load ────────────────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    activeTabId = tab.id;
    activeUrl = tab.url;
    activeTitle = tab.title;
    sessionStart = Date.now();
  }
})();
