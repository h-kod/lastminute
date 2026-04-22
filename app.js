const MAX_TABS = 10;
const DEFAULT_INTERVAL = 15;
const DEFAULT_FRESHNESS = "1h";
const FEED_PROXY_PATH = "/api/feed";
const LOCALE_STORAGE_KEY = "lastminute_locale";
const SUPPORTED_LOCALES = ["tr", "en"];

function normalizeLocale(value) {
  return String(value || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

function detectLocale() {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored) return normalizeLocale(stored);
  return normalizeLocale(navigator.language || navigator.userLanguage || "en");
}

let locale = detectLocale();

const defaultTabs = [
  { id: crypto.randomUUID(), title: "Global", region: "GLOBAL", lang: "en", query: "", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: "Türkiye", region: "TR", lang: "tr", query: "", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: "ABD", region: "US", lang: "en", query: "", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: "Trend 50", region: "GLOBAL", lang: "en", query: "top 50 trends", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc" }
];

let state = {
  tabs: loadTabs(),
  readSet: new Set(JSON.parse(localStorage.getItem("lastminute_read") || "[]")),
  intervalSec: Number(localStorage.getItem("lastminute_interval") || DEFAULT_INTERVAL),
  editTabId: null
};

let refreshTimer = null;
let refreshVisualFrameId = null;
let refreshResumeTimer = null;
let refreshCycleEndsAt = 0;
let refreshMeterPhase = "countdown";
let deleteTargetTabId = null;

const newsCache = new Map();
const refreshTokens = new Map();
const autoSearchTimers = new Map();
const lastAutoSearchLengths = new Map();

const ICON_URLS = {
  plus: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/plus-lg.svg",
  arrowLeft: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/arrow-left.svg",
  arrowRight: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/arrow-right.svg",
  close: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/x-lg.svg",
  sortNewest: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/sort-down-alt.svg",
  sortOldest: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/sort-up-alt.svg"
};

const I18N = {
  tr: {
    appTitle: "Lastminute - Haber Takip Panosu",
    appSubtitle: "Google News RSS ile TweetDeck tarzı çoklu haber takip uygulaması",
    localeGroupLabel: "Dil seçimi",
    languageTurkish: "Türkçe",
    languageEnglish: "İngilizce",
    dialogNewTab: "Yeni Sekme",
    dialogEditTab: "Sekme Düzenle",
    tabTitleLabel: "Sekme başlığı",
    tabTitlePlaceholder: "Anahtar kelime",
    tabLanguageLabel: "Dil",
    tabFreshnessLabel: "Haber tazeliği",
    cancel: "Vazgeç",
    save: "Kaydet",
    deleteNo: "Hayır",
    deleteYes: "Sil",
    deleteQuestion: "Silinsin mi?",
    deleteTabQuestion: '"{title}" silinsin mi?',
    emptySlotTitle: "Sekme ekle",
    emptySlotDescription: "Yeni bir sekme eklemek için tıkla.",
    addTab: "Sekme Ekle",
    moveLeft: "Sola taşı",
    moveRight: "Sağa taşı",
    delete: "Sil",
    general: "Genel",
    sortNewest: "Yeni önce",
    sortOldest: "Eski önce",
    loading: "Yükleniyor...",
    noNews: "Haber bulunamadı.",
    errorPrefix: "Hata:",
    pending: "bekleniyor",
    newsCount: "{count} haber",
    fetchedAt: "Sonraki yenileme: {value} içinde",
    refreshed: "Yenilendi",
    noFeed: "RSS ayrıştırılamadı",
    invalidFeedUrl: "Geçersiz RSS adresi",
    proxyUnavailable: "Proxy erişilemedi: {base} ({status})",
    rssEmpty: "RSS boş döndü: {base}",
    newsUnavailable: "Haberler alınamadı",
    intervalOptions: {
      5: "5 sn",
      15: "15 sn",
      30: "30 sn",
      60: "1 dk",
      300: "5 dk",
      900: "15 dk",
      1800: "30 dk",
      3600: "1 sa"
    },
    freshness: {
      "1h": "Son 1 saat",
      "3h": "Son 3 saat",
      "5h": "Son 5 saat",
      "10h": "Son 10 saat",
      "1d": "Bugün"
    },
    freshnessShort: {
      "1h": "1 saat",
      "3h": "3 saat",
      "5h": "5 saat",
      "10h": "10 saat",
      "1d": "Bugün"
    },
    relativeUnits: {
      second: "saniye",
      minute: "dakika",
      hour: "saat",
      day: "gün"
    }
  },
  en: {
    appTitle: "Lastminute - News Dashboard",
    appSubtitle: "A TweetDeck-style multi-news tracker powered by Google News RSS",
    localeGroupLabel: "Language selection",
    languageTurkish: "Turkish",
    languageEnglish: "English",
    dialogNewTab: "New Tab",
    dialogEditTab: "Edit Tab",
    tabTitleLabel: "Tab title",
    tabTitlePlaceholder: "Keyword",
    tabLanguageLabel: "Language",
    tabFreshnessLabel: "News freshness",
    cancel: "Cancel",
    save: "Save",
    deleteNo: "No",
    deleteYes: "Delete",
    deleteQuestion: "Delete it?",
    deleteTabQuestion: 'Delete "{title}"?',
    emptySlotTitle: "Add tab",
    emptySlotDescription: "Click to add a new tab.",
    addTab: "Add Tab",
    moveLeft: "Move left",
    moveRight: "Move right",
    delete: "Delete",
    general: "General",
    sortNewest: "Newest first",
    sortOldest: "Oldest first",
    loading: "Loading...",
    noNews: "No news found.",
    errorPrefix: "Error:",
    pending: "pending",
    newsCount: "{count} items",
    fetchedAt: "Next refresh in {value}",
    refreshed: "Updated",
    noFeed: "RSS could not be parsed",
    invalidFeedUrl: "Invalid RSS URL",
    proxyUnavailable: "Proxy unavailable: {base} ({status})",
    rssEmpty: "RSS returned empty: {base}",
    newsUnavailable: "News could not be loaded",
    intervalOptions: {
      5: "5 sec",
      15: "15 sec",
      30: "30 sec",
      60: "1 min",
      300: "5 min",
      900: "15 min",
      1800: "30 min",
      3600: "1 h"
    },
    freshness: {
      "1h": "Last 1 hour",
      "3h": "Last 3 hours",
      "5h": "Last 5 hours",
      "10h": "Last 10 hours",
      "1d": "Today"
    },
    freshnessShort: {
      "1h": "1 hour",
      "3h": "3 hours",
      "5h": "5 hours",
      "10h": "10 hours",
      "1d": "Today"
    },
    relativeUnits: {
      second: "second",
      minute: "minute",
      hour: "hour",
      day: "day"
    }
  }
};

function t(key, vars = {}, targetLocale = locale) {
  const dictionary = I18N[targetLocale] || I18N.en;
  const fallback = I18N.en[key] ?? key;
  const raw = dictionary[key] ?? fallback;

  return String(raw).replace(/\{(\w+)\}/g, (_, token) => {
    const value = vars[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

function getFlagEmoji(lang) {
  return lang === "tr" ? "🇹🇷" : "EN";
}

function getLanguageCode(lang) {
  return lang === "tr" ? "TR" : "EN";
}

function getDefaultTabTitle(key, targetLocale = locale) {
  const titles = {
    tab_global: targetLocale === "tr" ? "Global" : "Global",
    tab_turkiye: targetLocale === "tr" ? "Türkiye" : "Turkey",
    tab_usa: targetLocale === "tr" ? "ABD" : "USA",
    tab_trends: targetLocale === "tr" ? "Trend 50" : "Top 50 Trends"
  };
  return titles[key] || (targetLocale === "tr" ? "Genel" : "General");
}

function createDefaultTabs(targetLocale = locale) {
  return [
    { id: crypto.randomUUID(), defaultTitleKey: "tab_global", title: getDefaultTabTitle("tab_global", targetLocale), region: "GLOBAL", lang: "en", query: "", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc", customTitle: false },
    { id: crypto.randomUUID(), defaultTitleKey: "tab_turkiye", title: targetLocale === "tr" ? "Türkiye" : "Turkey", region: "TR", lang: "tr", query: "", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc", customTitle: false },
    { id: crypto.randomUUID(), defaultTitleKey: "tab_usa", title: getDefaultTabTitle("tab_usa", targetLocale), region: "US", lang: "en", query: "", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc", customTitle: false },
    { id: crypto.randomUUID(), defaultTitleKey: "tab_trends", title: getDefaultTabTitle("tab_trends", targetLocale), region: "GLOBAL", lang: "en", query: "top 50 trends", freshness: DEFAULT_FRESHNESS, sortMode: "time_desc", customTitle: false }
  ];
}

const tabsGrid = document.getElementById("tabsGrid");
const tabTemplate = document.getElementById("tabTemplate");
const tabDialog = document.getElementById("tabDialog");
const tabForm = document.getElementById("tabForm");
const tabDialogTitle = document.getElementById("tabDialogTitle");
const deleteConfirmDialog = document.getElementById("deleteConfirmDialog");
const deleteConfirmText = document.getElementById("deleteConfirmText");
const intervalSelect = document.getElementById("intervalSelect");
const refreshMeter = document.getElementById("refreshMeter");

document.getElementById("cancelTabBtn").addEventListener("click", () => tabDialog.close());
document.getElementById("deleteNoBtn").addEventListener("click", () => {
  deleteTargetTabId = null;
  deleteConfirmDialog.close();
});
document.getElementById("deleteCheckBtn").addEventListener("click", () => {
  if (!deleteTargetTabId) return;
  state.tabs = state.tabs.filter((tab) => tab.id !== deleteTargetTabId);
  newsCache.delete(deleteTargetTabId);
  persistTabs();
  deleteTargetTabId = null;
  deleteConfirmDialog.close();
  renderAll();
});

intervalSelect.addEventListener("change", () => {
  state.intervalSec = Number(intervalSelect.value);
  localStorage.setItem("lastminute_interval", String(state.intervalSec));
  setIntervalButtonState();
  startAutoRefresh();
});

document.querySelectorAll(".locale-btn").forEach((button) => {
  button.addEventListener("click", () => {
    setLocale(button.dataset.locale || "en");
  });
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".freshness-group")) return;
  document.querySelectorAll(".freshness-group.open").forEach((group) => group.classList.remove("open"));
});

tabForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const previousTab = state.editTabId ? getTab(state.editTabId) : null;
  const titleValue = document.getElementById("tabTitle").value.trim();
  const payload = {
    title: titleValue,
    lang: document.getElementById("tabLanguage").value,
    query: titleValue,
    freshness: document.getElementById("tabFreshness").value,
    region: previousTab?.region || null,
    customTitle: true
  };

  if (state.editTabId) {
    if (previousTab?.freshness && previousTab.freshness !== payload.freshness) {
      newsCache.delete(state.editTabId);
    }
    payload.region = previousTab?.region === "GLOBAL" ? "GLOBAL" : payload.lang === "tr" ? "TR" : "US";
    state.tabs = state.tabs.map((tab) => (tab.id === state.editTabId ? { ...tab, ...payload } : tab));
  } else {
    payload.region = payload.lang === "tr" ? "TR" : "US";
    state.tabs.push({ id: crypto.randomUUID(), ...payload, sortMode: "time_desc" });
  }

  persistTabs();
  state.editTabId = null;
  tabDialog.close();
  renderAll();
});

function loadTabs() {
  const raw = localStorage.getItem("lastminute_tabs");
  if (!raw) return createDefaultTabs(locale);

  try {
    const parsed = JSON.parse(raw);
    return parsed.length
      ? parsed.slice(0, MAX_TABS).map((tab) => ({
          ...tab,
          freshness: tab.freshness || DEFAULT_FRESHNESS,
          sortMode: tab.sortMode || "time_desc",
          customTitle: Boolean(tab.customTitle)
        }))
      : createDefaultTabs(locale);
  } catch {
    return createDefaultTabs(locale);
  }
}

function persistTabs() {
  localStorage.setItem("lastminute_tabs", JSON.stringify(state.tabs));
}

function persistReadSet() {
  localStorage.setItem("lastminute_read", JSON.stringify([...state.readSet]));
}

function buildIntervalLabel(seconds, targetLocale = locale) {
  return I18N[targetLocale]?.intervalOptions?.[seconds] || I18N.en.intervalOptions?.[seconds] || `${seconds}`;
}

function formatFreshnessLabel(value, targetLocale = locale) {
  return I18N[targetLocale]?.freshness?.[value] || I18N.en.freshness?.[value] || value;
}

function formatFreshnessButtonLabel(value, targetLocale = locale) {
  return I18N[targetLocale]?.freshnessShort?.[value] || formatFreshnessLabel(value, targetLocale);
}

function formatRelativeTime(date, targetLocale = locale) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const absSeconds = Math.max(0, Math.floor(Math.abs(diffMs) / 1000));

  if (absSeconds < 45) {
    return targetLocale === "tr" ? "az önce" : "just now";
  }

  const absMinutes = Math.floor(absSeconds / 60);
  if (absMinutes < 60) {
    if (targetLocale === "tr") return `${absMinutes} dk önce`;
    const unit = absMinutes === 1 ? "minute" : "minutes";
    return `${absMinutes} ${unit} ago`;
  }

  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) {
    if (targetLocale === "tr") return `${absHours} saat önce`;
    const unit = absHours === 1 ? "hour" : "hours";
    return `${absHours} ${unit} ago`;
  }

  const absDays = Math.floor(absHours / 24);
  if (absDays < 7) {
    if (targetLocale === "tr") return `${absDays} gün önce`;
    const unit = absDays === 1 ? "day" : "days";
    return `${absDays} ${unit} ago`;
  }

  return date.toLocaleDateString(targetLocale === "tr" ? "tr-TR" : "en-US", { day: "2-digit", month: "short" });
}

function setLocale(nextLocale) {
  locale = normalizeLocale(nextLocale);
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  state.tabs = state.tabs.map((tab) =>
    tab.defaultTitleKey && !tab.customTitle ? { ...tab, title: getDefaultTabTitle(tab.defaultTitleKey, locale) } : tab
  );
  persistTabs();
  renderLocalizedStaticTexts();
  setIntervalButtonState();
  renderAll();
}

function renderLocalizedStaticTexts() {
  document.title = t("appTitle");

  const subtitle = document.getElementById("appSubtitle");
  if (subtitle) subtitle.textContent = t("appSubtitle");

  const localeGroup = document.querySelector(".locale-switch");
  const localeButtons = document.querySelectorAll(".locale-btn");
  if (localeGroup) localeGroup.setAttribute("aria-label", t("localeGroupLabel"));
  localeButtons.forEach((button) => {
    const buttonLocale = normalizeLocale(button.dataset.locale);
    button.classList.toggle("active", buttonLocale === locale);
    button.setAttribute("aria-pressed", String(buttonLocale === locale));
    button.setAttribute("aria-label", buttonLocale === "tr" ? t("languageTurkish") : t("languageEnglish"));
    button.setAttribute("title", buttonLocale === "tr" ? t("languageTurkish") : t("languageEnglish"));
  });

  const tabDialogTitle = document.getElementById("tabDialogTitle");
  const tabTitleLabel = document.getElementById("tabTitleLabel");
  const tabLanguageLabel = document.getElementById("tabLanguageLabel");
  const tabFreshnessLabel = document.getElementById("tabFreshnessLabel");
  const tabTitleInput = document.getElementById("tabTitle");
  const tabLanguageSelect = document.getElementById("tabLanguage");
  const tabFreshnessSelect = document.getElementById("tabFreshness");
  const cancelBtn = document.getElementById("cancelTabBtn");
  const saveBtn = tabForm.querySelector('button[type="submit"]');
  const deleteConfirmText = document.getElementById("deleteConfirmText");
  const deleteNoBtn = document.getElementById("deleteNoBtn");
  const deleteCheckBtn = document.getElementById("deleteCheckBtn");

  if (tabDialogTitle) tabDialogTitle.textContent = state.editTabId ? t("dialogEditTab") : t("dialogNewTab");
  if (tabTitleLabel) tabTitleLabel.textContent = t("tabTitleLabel");
  if (tabLanguageLabel) tabLanguageLabel.textContent = t("tabLanguageLabel");
  if (tabFreshnessLabel) tabFreshnessLabel.textContent = t("tabFreshnessLabel");
  if (tabTitleInput) tabTitleInput.placeholder = locale === "tr" ? "Anahtar kelime" : "Keyword";
  if (cancelBtn) cancelBtn.textContent = t("cancel");
  if (saveBtn) saveBtn.textContent = t("save");
  if (deleteConfirmText) deleteConfirmText.textContent = t("deleteQuestion");
  if (deleteNoBtn) deleteNoBtn.textContent = t("deleteNo");
  if (deleteCheckBtn) deleteCheckBtn.textContent = t("deleteYes");

  if (tabLanguageSelect) {
    const trOption = tabLanguageSelect.querySelector('option[value="tr"]');
    const enOption = tabLanguageSelect.querySelector('option[value="en"]');
    if (trOption) trOption.textContent = getLanguageCode("tr");
    if (enOption) enOption.textContent = getLanguageCode("en");
  }

  if (tabFreshnessSelect) {
    ["1h", "3h", "5h", "10h", "1d"].forEach((value) => {
      const option = tabFreshnessSelect.querySelector(`option[value="${value}"]`);
      if (option) option.textContent = formatFreshnessLabel(value);
    });
  }

  intervalSelect.querySelectorAll("option").forEach((option) => {
    option.textContent = buildIntervalLabel(Number(option.value), locale);
  });

  document.querySelectorAll(".empty-slot.primary strong").forEach((node) => {
    node.textContent = t("emptySlotTitle");
  });
  document.querySelectorAll(".empty-add-btn span:last-child").forEach((node) => {
    node.textContent = t("addTab");
  });
}

function getTab(tabId) {
  return state.tabs.find((tab) => tab.id === tabId);
}

function updateTab(tabId, patch) {
  state.tabs = state.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab));
  persistTabs();
}

function syncTabNode(tabId) {
  const tab = getTab(tabId);
  const node = tabsGrid.querySelector(`[data-tab-id="${tabId}"]`);
  if (!tab || !node) return;

  const langBtn = node.querySelector(".lang-btn");
  const freshnessBtn = node.querySelector(".freshness-btn");
  const sortBtn = node.querySelector(".sort-btn");

  if (langBtn) {
    langBtn.textContent = getLanguageCode(tab.lang);
    langBtn.classList.remove("active");
    langBtn.setAttribute("aria-pressed", "false");
    langBtn.setAttribute("aria-label", tab.lang === "tr" ? t("languageTurkish") : t("languageEnglish"));
    langBtn.setAttribute("title", tab.lang === "tr" ? t("languageTurkish") : t("languageEnglish"));
  }
  if (freshnessBtn) {
    freshnessBtn.textContent = formatFreshnessButtonLabel(tab.freshness || DEFAULT_FRESHNESS);
    freshnessBtn.classList.toggle("active", tab.freshness !== DEFAULT_FRESHNESS);
    freshnessBtn.setAttribute("aria-pressed", String(tab.freshness !== DEFAULT_FRESHNESS));
  }
  if (sortBtn) {
    sortBtn.innerHTML = `<span class="icon-wrap" data-icon="${tab.sortMode === "time_desc" ? "sort-newest" : "sort-oldest"}"></span>`;
    bindIcons(sortBtn);
    sortBtn.classList.toggle("active", tab.sortMode === "time_desc");
    sortBtn.setAttribute("aria-pressed", String(tab.sortMode === "time_desc"));
    sortBtn.setAttribute("aria-label", tab.sortMode === "time_desc" ? t("sortNewest") : t("sortOldest"));
    sortBtn.setAttribute("title", tab.sortMode === "time_desc" ? t("sortNewest") : t("sortOldest"));
  }
}

function openTabDialog(editTab = null) {
  state.editTabId = editTab?.id || null;
  tabDialogTitle.textContent = editTab ? t("dialogEditTab") : t("dialogNewTab");

  document.getElementById("tabTitle").value = editTab?.title || "";
  document.getElementById("tabLanguage").value = editTab?.lang || locale;
  document.getElementById("tabFreshness").value = editTab?.freshness || DEFAULT_FRESHNESS;

  tabDialog.showModal();
}

function formatFreshnessLabel(value) {
  return I18N[locale]?.freshness?.[value] || I18N.en.freshness[value] || value;
}

function formatFreshnessButtonLabel(value) {
  return I18N[locale]?.freshnessShort?.[value] || formatFreshnessLabel(value);
}

function resolveRegion(tab) {
  if (tab.region === "TR") return "TR";
  if (tab.region === "US") return "US";
  return tab.lang === "tr" ? "TR" : "US";
}

function getFreshnessCutoff(freshness, now = Date.now()) {
  if (freshness === "1d") {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay.getTime();
  }

  const hours = Number.parseInt(freshness, 10);
  if (!Number.isFinite(hours) || hours <= 0) return now - 60 * 60 * 1000;
  return now - hours * 60 * 60 * 1000;
}

function isWithinFreshness(date, freshness) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return date.getTime() >= getFreshnessCutoff(freshness);
}

function formatRelativeTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const absSeconds = Math.max(0, Math.floor(Math.abs(diffMs) / 1000));

  if (absSeconds < 45) return locale === "tr" ? "az önce" : "just now";

  const absMinutes = Math.floor(absSeconds / 60);
  if (absMinutes < 60) {
    if (locale === "tr") return `${absMinutes} dk önce`;
    const unit = absMinutes === 1 ? "minute" : "minutes";
    return `${absMinutes} ${unit} ago`;
  }

  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) {
    if (locale === "tr") return `${absHours} saat önce`;
    const unit = absHours === 1 ? "hour" : "hours";
    return `${absHours} ${unit} ago`;
  }

  const absDays = Math.floor(absHours / 24);
  if (absDays < 7) {
    if (locale === "tr") return `${absDays} gün önce`;
    const unit = absDays === 1 ? "day" : "days";
    return `${absDays} ${unit} ago`;
  }

  return date.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { day: "2-digit", month: "short" });
}

function extractImageUrl(item) {
  const candidates = [];

  const enqueue = (value) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  const mediaNodes = [
    ...item.getElementsByTagName("media:thumbnail"),
    ...item.getElementsByTagName("media:content"),
    ...item.getElementsByTagNameNS("*", "thumbnail"),
    ...item.getElementsByTagNameNS("*", "content")
  ];

  mediaNodes.forEach((node) => {
    enqueue(node.getAttribute("url"));
    enqueue(node.getAttribute("href"));
  });

  const enclosure = item.querySelector("enclosure");
  if (enclosure) {
    enqueue(enclosure.getAttribute("url"));
  }

  const description = item.querySelector("description")?.textContent || "";
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) enqueue(imgMatch[1]);
  const urlMatch = description.match(/https:\/\/lh3\.googleusercontent\.com\/[^\s"'<>]+/i);
  if (urlMatch?.[0]) enqueue(urlMatch[0]);

  return candidates.find((url) => /^https?:\/\//i.test(url)) || "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeFeedText(value, limit = 280) {
  const raw = String(value || "");
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const textarea = document.createElement("textarea");
  textarea.innerHTML = withoutTags;
  return textarea.value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function getFeedUrl(tab) {
  const langCode = tab.lang === "tr" ? "tr" : "en-US";
  const regionCode = resolveRegion(tab);
  const ceidLang = tab.lang === "tr" ? "tr" : "en";
  const localeCode = tab.lang === "tr" ? "tr-TR" : "en-US";
  const normalizedQuery = String(tab.query || "").trim().toLocaleLowerCase(localeCode);
  const queryParts = [normalizedQuery, `when:${tab.freshness || DEFAULT_FRESHNESS}`].filter(Boolean);
  const query = queryParts.join(" ") || (tab.lang === "tr" ? "haber" : "news");

  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${langCode}&gl=${regionCode}&ceid=${encodeURIComponent(`${regionCode}:${ceidLang}`)}`;
}

function parseFeedItems(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error(t("noFeed"));

  return [...xml.querySelectorAll("item")]
    .map((item) => {
      const title = item.querySelector("title")?.textContent?.trim() || (locale === "tr" ? "Başlıksız" : "Untitled");
      const link = item.querySelector("link")?.textContent?.trim() || "#";
      const source =
        item.querySelector("source")?.textContent?.trim() ||
        item.querySelector("source")?.getAttribute("url")?.trim() ||
        (locale === "tr" ? "Bilinmeyen kaynak" : "Unknown source");
      const dateText = item.querySelector("pubDate")?.textContent?.trim() || "";
      const descriptionRaw = item.querySelector("description")?.textContent || "";
      const image = extractImageUrl(item);
      const description = normalizeFeedText(descriptionRaw);

      return {
        id: item.querySelector("guid")?.textContent?.trim() || link || `${title}-${dateText}`,
        title,
        link,
        source,
        date: new Date(dateText),
        image,
        description
      };
    })
    .filter((item) => item.title && item.link);
}

async function fetchNews(tab) {
  const feedUrl = getFeedUrl(tab);
  let lastError = null;

  try {
    const apiUrl = `${FEED_PROXY_PATH}?url=${encodeURIComponent(feedUrl)}`;
    const response = await fetch(apiUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(t("proxyUnavailable", { base: FEED_PROXY_PATH, status: response.status }));
    }

    const xmlText = await response.text();
    if (!xmlText.trim()) {
      throw new Error(t("rssEmpty", { base: FEED_PROXY_PATH }));
    }

    return parseFeedItems(xmlText).filter((item) => isWithinFreshness(item.date, tab.freshness || DEFAULT_FRESHNESS));
  } catch (err) {
    lastError = err;
  }

  throw lastError || new Error(t("newsUnavailable"));
}

function sortItems(items, mode) {
  const sorted = [...items];
  sorted.sort((a, b) => (mode === "time_asc" ? a.date - b.date : b.date - a.date));
  return sorted;
}

function setLoading(node, loading) {
  node.classList.toggle("loading", loading);
}

function renderNewsList(list, items) {
  if (!items.length) {
    list.replaceChildren();
    const empty = document.createElement("li");
    empty.className = "news-item";
    empty.innerHTML = `<p>${t("noNews")}</p>`;
    list.appendChild(empty);
    return;
  }

  const existingNodes = new Map(
    [...list.querySelectorAll(".news-item[data-item-id]")].map((node) => [node.dataset.itemId, node])
  );
  const nextNodes = [];

  items.forEach((item) => {
    let li = existingNodes.get(item.id);
    const isNew = !li;

    if (!li) {
      li = document.createElement("li");
      li.className = "news-item";
      li.dataset.itemId = item.id;
      if (state.readSet.has(item.id)) li.classList.add("read");
    }

    const imageHtml = item.image
      ? `<div class="news-image"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" decoding="async" /></div>`
      : "";

    li.innerHTML = `
      ${imageHtml}
      <div class="news-body">
        <div class="news-topline">
          <span class="tag">${escapeHtml(item.source)}</span>
          <span class="news-time">${escapeHtml(formatRelativeTime(item.date))}</span>
        </div>
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
        <p>${escapeHtml(item.description)}</p>
      </div>
    `;

    if (isNew) {
      li.addEventListener("click", () => {
        state.readSet.add(item.id);
        persistReadSet();
        li.classList.add("read");
      });
    }

    nextNodes.push(li);
  });

  list.replaceChildren(...nextNodes);
}

async function refreshTab(tabId, { force = false } = {}) {
  const tab = getTab(tabId);
  const node = tabsGrid.querySelector(`[data-tab-id="${tabId}"]`);
  if (!tab || !node) return;

  const feedUrl = getFeedUrl(tab);
  const list = node.querySelector(".news-list");
  const statusBadge = node.querySelector(".tab-status");
  const signal = node.querySelector(".tab-signal");
  const token = (refreshTokens.get(tabId) || 0) + 1;
  refreshTokens.set(tabId, token);
  setLoading(node, true);

  const cache = newsCache.get(tabId);
  const hasMatchingCache = cache?.feedUrl === feedUrl;
  if (hasMatchingCache && cache?.items?.length && !force) {
    renderNewsList(list, sortItems(cache.items, tab.sortMode));
  } else if (!hasMatchingCache || !cache?.items?.length) {
    list.innerHTML = `<li class="news-item"><p>${t("loading")}</p></li>`;
  }

  try {
    const items = sortItems(await fetchNews(tab), tab.sortMode);
    if (refreshTokens.get(tabId) !== token) return;
    newsCache.set(tabId, { feedUrl, items, fetchedAt: Date.now() });
    statusBadge.textContent = String(items.length);
    statusBadge.title = t("newsCount", { count: items.length });
    signal.classList.toggle("active", items.length > 0);
    renderNewsList(list, items);
    setLoading(node, false);
  } catch (err) {
    if (refreshTokens.get(tabId) !== token) return;
    if (hasMatchingCache && cache?.items?.length) {
      statusBadge.textContent = String(cache.items.length);
      statusBadge.title = t("newsCount", { count: cache.items.length });
      signal.classList.toggle("active", true);
      renderNewsList(list, sortItems(cache.items, tab.sortMode));
    } else {
      statusBadge.textContent = locale === "tr" ? "hata" : "error";
      signal.classList.toggle("active", false);
      list.innerHTML = `<li class="news-item"><p>${t("errorPrefix")} ${escapeHtml(err.message)}</p></li>`;
    }
    setLoading(node, false);
  }
}

function scheduleTitleSearch(tabId, value) {
  const trimmed = value.trim();
  const currentLen = trimmed.length;
  const lastLen = lastAutoSearchLengths.get(tabId) || 0;

  if (autoSearchTimers.has(tabId)) clearTimeout(autoSearchTimers.get(tabId));

  if (currentLen === 0) {
    const timer = setTimeout(() => {
      lastAutoSearchLengths.set(tabId, 0);
      refreshTab(tabId, { force: true });
    }, 250);
    autoSearchTimers.set(tabId, timer);
    return;
  }

  if (currentLen < 3) {
    if (currentLen < lastLen) lastAutoSearchLengths.set(tabId, currentLen);
    return;
  }

  if (currentLen < lastLen) {
    lastAutoSearchLengths.set(tabId, currentLen);
    return;
  }

  if (currentLen - lastLen < 3) return;

  const timer = setTimeout(() => {
    lastAutoSearchLengths.set(tabId, currentLen);
    refreshTab(tabId, { force: true });
  }, 350);
  autoSearchTimers.set(tabId, timer);
}

function bindIcons(node) {
  node.querySelectorAll(".icon-wrap").forEach((wrap) => {
    const setIcon = (url) => {
      wrap.innerHTML = '<span class="icon-glyph" aria-hidden="true"></span>';
      wrap.style.setProperty("--icon-url", `url("${url}")`);
    };

    if (wrap.dataset.icon === "plus") {
      setIcon(ICON_URLS.plus);
      return;
    }
    if (wrap.dataset.icon === "arrow-left") {
      setIcon(ICON_URLS.arrowLeft);
      return;
    }
    if (wrap.dataset.icon === "arrow-right") {
      setIcon(ICON_URLS.arrowRight);
      return;
    }
    if (wrap.dataset.icon === "close") {
      setIcon(ICON_URLS.close);
      return;
    }
    if (wrap.dataset.icon === "sort-newest") {
      setIcon(ICON_URLS.sortNewest);
      return;
    }
    if (wrap.dataset.icon === "sort-oldest") {
      setIcon(ICON_URLS.sortOldest);
    }
  });
}

function createEmptySlot(primary = false) {
  const node = document.createElement("article");
  node.className = `tab-column empty-slot${primary ? " primary" : ""}`;
  node.innerHTML = primary
    ? `
    <div class="empty-slot-inner">
      <div class="empty-slot-copy">
        <strong>${t("emptySlotTitle")}</strong>
      </div>
      <button type="button" class="btn primary empty-add-btn">
        <span class="icon-wrap" data-icon="plus"></span>
        <span>${t("addTab")}</span>
      </button>
    </div>
  `
    : `<div class="empty-slot-inner" aria-hidden="true"></div>`;

  bindIcons(node);
  const addBtn = node.querySelector(".empty-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (state.tabs.length >= MAX_TABS) {
        alert(locale === "tr" ? "Maksimum 10 sekme eklenebilir." : "A maximum of 10 tabs can be added.");
        return;
      }
      openTabDialog();
    });
  }

  return node;
}

function renderTab(tab) {
  const node = tabTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.tabId = tab.id;

  const titleInput = node.querySelector(".tab-title-input");
  const statusBadge = node.querySelector(".tab-status");
  const signal = node.querySelector(".tab-signal");
  const langBtn = node.querySelector(".lang-btn");
  const freshnessBtn = node.querySelector(".freshness-btn");
  const sortBtn = node.querySelector(".sort-btn");
  const moveLeftBtn = node.querySelector(".move-left-btn");
  const moveRightBtn = node.querySelector(".move-right-btn");
  const deleteBtn = node.querySelector(".delete-btn");
  const freshnessGroup = node.querySelector(".freshness-group");
  const freshnessMenu = node.querySelector(".freshness-menu");
  let freshnessCloseTimer = null;

  const openFreshnessMenu = () => {
    if (freshnessCloseTimer) {
      clearTimeout(freshnessCloseTimer);
      freshnessCloseTimer = null;
    }
    freshnessGroup.classList.add("open");
  };

  const closeFreshnessMenu = (delay = 0) => {
    if (freshnessCloseTimer) clearTimeout(freshnessCloseTimer);
    if (delay <= 0) {
      freshnessGroup.classList.remove("open");
      return;
    }
    freshnessCloseTimer = setTimeout(() => {
      freshnessGroup.classList.remove("open");
      freshnessCloseTimer = null;
    }, delay);
  };

  freshnessMenu.querySelectorAll(".freshness-option").forEach((optionBtn) => {
    optionBtn.textContent = formatFreshnessLabel(optionBtn.dataset.freshness);
  });

  titleInput.value = tab.title;
  titleInput.placeholder = locale === "tr" ? "Anahtar kelime" : "Keyword";
  langBtn.textContent = getLanguageCode(tab.lang);
  freshnessBtn.textContent = formatFreshnessButtonLabel(tab.freshness || DEFAULT_FRESHNESS);
  sortBtn.innerHTML = `<span class="icon-wrap" data-icon="${tab.sortMode === "time_desc" ? "sort-newest" : "sort-oldest"}"></span>`;
  bindIcons(sortBtn);
  langBtn.classList.remove("active");
  freshnessBtn.classList.toggle("active", tab.freshness !== DEFAULT_FRESHNESS);
  sortBtn.classList.toggle("active", tab.sortMode === "time_desc");
  langBtn.setAttribute("aria-pressed", "false");
  langBtn.setAttribute("aria-label", tab.lang === "tr" ? t("languageTurkish") : t("languageEnglish"));
  langBtn.setAttribute("title", tab.lang === "tr" ? t("languageTurkish") : t("languageEnglish"));
  freshnessBtn.setAttribute("aria-pressed", String(tab.freshness !== DEFAULT_FRESHNESS));
  sortBtn.setAttribute("aria-pressed", String(tab.sortMode === "time_desc"));
  sortBtn.setAttribute("aria-label", tab.sortMode === "time_desc" ? t("sortNewest") : t("sortOldest"));
  sortBtn.setAttribute("title", tab.sortMode === "time_desc" ? t("sortNewest") : t("sortOldest"));
  moveLeftBtn.disabled = state.tabs.findIndex((item) => item.id === tab.id) === 0;
  moveRightBtn.disabled = state.tabs.findIndex((item) => item.id === tab.id) === state.tabs.length - 1;
  moveLeftBtn.title = t("moveLeft");
  moveRightBtn.title = t("moveRight");
  deleteBtn.title = t("delete");

  titleInput.addEventListener("input", () => {
    const value = titleInput.value;
    updateTab(tab.id, { title: value, query: value, customTitle: true });
    scheduleTitleSearch(tab.id, value);
  });

  langBtn.addEventListener("click", () => {
    const currentTab = getTab(tab.id);
    if (!currentTab) return;
    newsCache.delete(tab.id);
    updateTab(tab.id, {
      lang: currentTab.lang === "tr" ? "en" : "tr",
      region: currentTab.lang === "tr" ? "US" : "TR"
    });
    syncTabNode(tab.id);
    refreshTab(tab.id, { force: true });
  });

  freshnessBtn.addEventListener("click", () => {
    if (freshnessGroup.classList.contains("open")) {
      closeFreshnessMenu();
    } else {
      openFreshnessMenu();
    }
  });

  freshnessGroup.addEventListener("mouseenter", openFreshnessMenu);
  freshnessGroup.addEventListener("mouseleave", () => closeFreshnessMenu(260));
  freshnessMenu.addEventListener("mouseenter", openFreshnessMenu);
  freshnessMenu.addEventListener("mouseleave", () => closeFreshnessMenu(260));
  freshnessGroup.addEventListener("focusin", openFreshnessMenu);
  freshnessGroup.addEventListener("focusout", () => closeFreshnessMenu(160));

  freshnessGroup.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFreshnessMenu();
      freshnessBtn.focus();
    }
  });

  freshnessMenu.querySelectorAll(".freshness-option").forEach((optionBtn) => {
    optionBtn.addEventListener("click", () => {
      newsCache.delete(tab.id);
      updateTab(tab.id, { freshness: optionBtn.dataset.freshness });
      closeFreshnessMenu();
      syncTabNode(tab.id);
      refreshTab(tab.id, { force: true });
    });
  });

  sortBtn.addEventListener("click", () => {
    const currentTab = getTab(tab.id);
    if (!currentTab) return;
    updateTab(tab.id, { sortMode: currentTab.sortMode === "time_desc" ? "time_asc" : "time_desc" });
    syncTabNode(tab.id);
    const cache = newsCache.get(tab.id);
    if (cache?.items?.length) {
      const list = node.querySelector(".news-list");
      renderNewsList(list, sortItems(cache.items, getTab(tab.id).sortMode));
      return;
    }
    refreshTab(tab.id, { force: true });
  });

  moveLeftBtn.addEventListener("click", () => {
    const idx = state.tabs.findIndex((item) => item.id === tab.id);
    if (idx > 0) moveTab(idx, idx - 1);
  });

  moveRightBtn.addEventListener("click", () => {
    const idx = state.tabs.findIndex((item) => item.id === tab.id);
    if (idx >= 0 && idx < state.tabs.length - 1) moveTab(idx, idx + 1);
  });

  deleteBtn.addEventListener("click", () => {
    deleteTargetTabId = tab.id;
    deleteConfirmText.textContent = t("deleteTabQuestion", { title: tab.title || t("dialogNewTab") });
    deleteConfirmDialog.showModal();
  });

  bindIcons(node);
  tabsGrid.appendChild(node);

  const cache = newsCache.get(tab.id);
  const itemCount = cache?.items?.length || 0;
  statusBadge.textContent = itemCount ? String(itemCount) : t("pending");
  statusBadge.title = itemCount ? t("newsCount", { count: itemCount }) : t("pending");
  signal.classList.toggle("active", itemCount > 0);
  if (cache?.items?.length) renderNewsList(node.querySelector(".news-list"), sortItems(cache.items, tab.sortMode));

  refreshTab(tab.id);
}

function moveTab(from, to) {
  const [tab] = state.tabs.splice(from, 1);
  state.tabs.splice(to, 0, tab);
  persistTabs();
  renderAll();
}

function setIntervalButtonState() {
  intervalSelect.value = String(state.intervalSec);
  buildRefreshMeter();
  updateRefreshMeter();
}

function buildRefreshMeter() {
  if (!refreshMeter) return;
  refreshMeter.replaceChildren();
}

function updateRefreshMeter() {
  if (!refreshMeter) return;

  const totalMs = state.intervalSec * 1000;
  const remainingMs = refreshCycleEndsAt ? Math.max(0, refreshCycleEndsAt - Date.now()) : totalMs;
  const progress = totalMs > 0 ? remainingMs / totalMs : 0;
  refreshMeter.style.setProperty("--progress", String(progress));
  refreshMeter.dataset.phase = refreshMeterPhase;

  if (refreshMeterPhase === "updated") {
    refreshMeter.title = locale === "tr" ? t("refreshed") : t("refreshed");
    return;
  }

  const value = buildIntervalLabel(state.intervalSec, locale);
  refreshMeter.title = t("fetchedAt", { value });
}

function startAutoRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (refreshResumeTimer) clearTimeout(refreshResumeTimer);
  if (refreshVisualFrameId) cancelAnimationFrame(refreshVisualFrameId);

  const intervalMs = state.intervalSec * 1000;
  const pulseMs = Math.min(900, Math.max(450, Math.round(intervalMs * 0.18)));

  const beginCycle = () => {
    refreshMeterPhase = "countdown";
    refreshCycleEndsAt = Date.now() + intervalMs;
    updateRefreshMeter();

    refreshTimer = setTimeout(async () => {
      await Promise.all(state.tabs.map((tab) => refreshTab(tab.id, { force: true })));
      refreshMeterPhase = "updated";
      refreshCycleEndsAt = Date.now();
      updateRefreshMeter();
      refreshResumeTimer = setTimeout(beginCycle, pulseMs);
    }, intervalMs);
  };

  const tick = () => {
    updateRefreshMeter();
    refreshVisualFrameId = requestAnimationFrame(tick);
  };

  buildRefreshMeter();
  beginCycle();
  tick();
}

function renderAll() {
  const desiredIds = new Set(state.tabs.map((tab) => tab.id));

  tabsGrid.querySelectorAll(".tab-column[data-tab-id]").forEach((node) => {
    if (!desiredIds.has(node.dataset.tabId)) {
      node.remove();
    }
  });

  state.tabs.forEach((tab) => {
    const existingNode = tabsGrid.querySelector(`[data-tab-id="${tab.id}"]`);
    if (existingNode) {
      tabsGrid.appendChild(existingNode);
      syncTabNode(tab.id);
      const cache = newsCache.get(tab.id);
      const list = existingNode.querySelector(".news-list");
      if (cache?.items?.length) {
        renderNewsList(list, sortItems(cache.items, tab.sortMode));
      }
      return;
    }

    renderTab(tab);
  });

  tabsGrid.querySelectorAll(".empty-slot").forEach((node) => node.remove());

  tabsGrid.appendChild(createEmptySlot(true));
}

document.documentElement.lang = locale;
renderLocalizedStaticTexts();
setIntervalButtonState();
startAutoRefresh();
renderAll();
