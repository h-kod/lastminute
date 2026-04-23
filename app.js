const MAX_TABS = 10;
const DEFAULT_INTERVAL = 15;
const DEFAULT_FRESHNESS = "1h";
const FEED_PROXY_PATH = "/api/feed";
const TRENDS_PROXY_PATH = "/api/trends";
const LOCALE_STORAGE_KEY = "lastminute_locale";
const TREND_GEO_STORAGE_KEY = "lastminute_trends_geo";
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

const G20_TRENDS = [
  { code: "AR", en: "Argentina", tr: "Arjantin" },
  { code: "AU", en: "Australia", tr: "Avustralya" },
  { code: "BR", en: "Brazil", tr: "Brezilya" },
  { code: "CA", en: "Canada", tr: "Kanada" },
  { code: "CN", en: "China", tr: "Çin" },
  { code: "FR", en: "France", tr: "Fransa" },
  { code: "DE", en: "Germany", tr: "Almanya" },
  { code: "IN", en: "India", tr: "Hindistan" },
  { code: "ID", en: "Indonesia", tr: "Endonezya" },
  { code: "IT", en: "Italy", tr: "İtalya" },
  { code: "JP", en: "Japan", tr: "Japonya" },
  { code: "MX", en: "Mexico", tr: "Meksika" },
  { code: "RU", en: "Russia", tr: "Rusya" },
  { code: "SA", en: "Saudi Arabia", tr: "Suudi Arabistan" },
  { code: "ZA", en: "South Africa", tr: "Güney Afrika" },
  { code: "KR", en: "South Korea", tr: "Güney Kore" },
  { code: "TR", en: "Türkiye", tr: "Türkiye" },
  { code: "GB", en: "United Kingdom", tr: "Birleşik Krallık" },
  { code: "US", en: "United States", tr: "ABD" }
];
const G20_TREND_GEO_CODES = new Set(G20_TRENDS.map((item) => item.code));
const TREND_GEO_ALIASES = {
  CN: "HK"
};
const TREND_NEWS_HL_BY_GEO = {
  AR: "es-AR",
  AU: "en-AU",
  BR: "pt-BR",
  CA: "en-CA",
  CN: "zh-CN",
  FR: "fr-FR",
  DE: "de-DE",
  IN: "en-IN",
  ID: "id-ID",
  IT: "it-IT",
  JP: "ja-JP",
  MX: "es-MX",
  RU: "ru-RU",
  SA: "ar-SA",
  ZA: "en-ZA",
  KR: "ko-KR",
  TR: "tr-TR",
  GB: "en-GB",
  US: "en-US",
  HK: "zh-HK"
};

function normalizeTrendGeo(value) {
  const code = String(value || "").trim().toUpperCase();
  return G20_TREND_GEO_CODES.has(code) ? code : "US";
}

function resolveTrendGeoRequest(geo) {
  const normalized = normalizeTrendGeo(geo);
  return TREND_GEO_ALIASES[normalized] || normalized;
}

function loadTrendGeo() {
  return normalizeTrendGeo(localStorage.getItem(TREND_GEO_STORAGE_KEY) || "US");
}

function getTrendCountryMeta(code) {
  return G20_TRENDS.find((item) => item.code === normalizeTrendGeo(code)) || G20_TRENDS[G20_TRENDS.length - 1];
}

function getTrendCountryLabel(code, targetLocale = locale) {
  const meta = getTrendCountryMeta(code);
  return targetLocale === "tr" ? meta.tr : meta.en;
}

function getTrendNewsHl(code) {
  const normalized = resolveTrendGeoRequest(code);
  return TREND_NEWS_HL_BY_GEO[normalized] || "en-US";
}

const DEFAULT_TAB_KEYWORDS = {
  global: "world",
  economy: "economy",
  tech: "technology"
};

const defaultTabs = [
  { id: crypto.randomUUID(), title: DEFAULT_TAB_KEYWORDS.global, region: "GLOBAL", lang: "en", query: DEFAULT_TAB_KEYWORDS.global, freshness: DEFAULT_FRESHNESS, sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: DEFAULT_TAB_KEYWORDS.economy, region: "GLOBAL", lang: "en", query: DEFAULT_TAB_KEYWORDS.economy, freshness: DEFAULT_FRESHNESS, sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: DEFAULT_TAB_KEYWORDS.tech, region: "GLOBAL", lang: "en", query: DEFAULT_TAB_KEYWORDS.tech, freshness: DEFAULT_FRESHNESS, sortMode: "time_desc" }
];

let state = {
  tabs: loadTabs(),
  readSet: new Set(JSON.parse(localStorage.getItem("lastminute_read") || "[]")),
  intervalSec: Number(localStorage.getItem("lastminute_interval") || DEFAULT_INTERVAL),
  editTabId: null,
  trendsGeo: loadTrendGeo()
};

let refreshTimer = null;
let refreshVisualFrameId = null;
let refreshResumeTimer = null;
let refreshCycleEndsAt = 0;
let refreshMeterPhase = "countdown";
let pendingFocusTabId = null;
const TAB_COLUMN_CAP = 5;
const TAB_MIN_WIDTH = 390;
const TAB_COLUMN_GAP = 10;

const newsCache = new Map();
const refreshTokens = new Map();
const autoSearchTimers = new Map();
const lastAutoSearchLengths = new Map();
const trendsCache = new Map();
const trendsTokens = new Map();

const ICON_URLS = {
  plus: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/plus-lg.svg",
  arrowLeft: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/arrow-left.svg",
  arrowRight: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/arrow-right.svg",
  close: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/x-lg.svg",
  check: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/check-lg.svg",
  sortNewest: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/sort-down-alt.svg",
  sortOldest: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/sort-up-alt.svg"
};

const I18N = {
  tr: {
    appTitle: "Lastminute - Haber Takibi",
    appSubtitle: "Arama kelimelerine göre güncel haberleri yan yana takip et.",
    intervalLabel: "Yenileme aralığı",
    localeGroupLabel: "Dil seçimi",
    languageTurkish: "Türkçe",
    languageEnglish: "İngilizce",
    dialogNewTab: "Yeni arama",
    dialogEditTab: "Aramayı düzenle",
    tabTitleLabel: "Arama kelimesi",
    tabTitlePlaceholder: "Örn: ekonomi",
    searchInputPlaceholder: "Arama yaz",
    tabLanguageLabel: "Haber dili",
    tabFreshnessLabel: "Zaman aralığı",
    cancel: "Vazgeç",
    save: "Kaydet",
    deleteNo: "Hayır",
    deleteYes: "Sil",
    deleteConfirm: "Silmek için tekrar tıkla",
    deleteQuestion: "Silinsin mi?",
    deleteTabQuestion: '"{title}" silinsin mi?',
    emptySlotTitle: "Yeni arama",
    emptySlotDescription: "Yeni bir arama sütunu aç.",
    addTab: "Arama ekle",
    trendsSlotTitle: "Trend aramaları",
    trendsSlotDescription: "Google Trends'te öne çıkan aramalardan birini seç.",
    trendsGeoSwitch: "Trend ülkesini değiştir",
    trendsLoading: "Trendler yükleniyor...",
    trendsEmpty: "Trend bulunamadı.",
    moveLeft: "Sola taşı",
    moveRight: "Sağa taşı",
    delete: "Aramayı sil",
    general: "Genel",
    sortNewest: "En yeni üstte",
    sortOldest: "En eski üstte",
    loading: "Haberler yükleniyor...",
    noNews: "Bu arama için haber bulunamadı.",
    errorPrefix: "Yükleme sorunu:",
    statusError: "sorun",
    pending: "hazırlanıyor",
    shortQueryStatus: "3+",
    shortQueryHint: "Haberleri görmek için en az 3 harf yaz.",
    newsCount: "{count} haber",
    fetchedAt: "Otomatik yenileme: {value} sonra",
    refreshed: "Az önce yenilendi",
    noFeed: "Haber akışı okunamadı",
    invalidFeedUrl: "Haber akışı adresi geçersiz",
    proxyUnavailable: "Haber servisine ulaşılamadı: {base} ({status})",
    rssEmpty: "Haber akışı boş döndü: {base}",
    newsUnavailable: "Haberler şu anda yüklenemiyor",
    maxTabsReached: "En fazla {count} arama ekleyebilirsin.",
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
    appTitle: "Lastminute - News Tracker",
    appSubtitle: "Track current news side by side by search term.",
    intervalLabel: "Refresh interval",
    localeGroupLabel: "Language selection",
    languageTurkish: "Turkish",
    languageEnglish: "English",
    dialogNewTab: "New search",
    dialogEditTab: "Edit search",
    tabTitleLabel: "Search term",
    tabTitlePlaceholder: "Example: economy",
    searchInputPlaceholder: "Type a search",
    tabLanguageLabel: "News language",
    tabFreshnessLabel: "Time range",
    cancel: "Cancel",
    save: "Save",
    deleteNo: "No",
    deleteYes: "Delete",
    deleteConfirm: "Click again to delete",
    deleteQuestion: "Delete it?",
    deleteTabQuestion: 'Delete "{title}"?',
    emptySlotTitle: "New search",
    emptySlotDescription: "Open a new search column.",
    addTab: "Add search",
    trendsSlotTitle: "Trending searches",
    trendsSlotDescription: "Pick one of the Google Trends leaders.",
    trendsGeoSwitch: "Switch trend country",
    trendsLoading: "Loading trends...",
    trendsEmpty: "No trends found.",
    moveLeft: "Move left",
    moveRight: "Move right",
    delete: "Delete search",
    general: "General",
    sortNewest: "Newest on top",
    sortOldest: "Oldest on top",
    loading: "Loading news...",
    noNews: "No news found for this search.",
    errorPrefix: "Loading issue:",
    statusError: "issue",
    pending: "starting",
    shortQueryStatus: "3+",
    shortQueryHint: "Type at least 3 characters to load news.",
    newsCount: "{count} items",
    fetchedAt: "Auto refresh in {value}",
    refreshed: "Just updated",
    noFeed: "The news feed could not be read",
    invalidFeedUrl: "The news feed address is invalid",
    proxyUnavailable: "The news service is unavailable: {base} ({status})",
    rssEmpty: "The news feed returned empty: {base}",
    newsUnavailable: "News cannot be loaded right now",
    maxTabsReached: "You can add up to {count} searches.",
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
    tab_economy: targetLocale === "tr" ? "Ekonomi" : "Economy",
    tab_tech: targetLocale === "tr" ? "Teknoloji" : "Technology"
  };
  return titles[key] || (targetLocale === "tr" ? "Genel" : "General");
}

function createDefaultTabs(targetLocale = locale) {
  return [
    { id: crypto.randomUUID(), defaultTitleKey: "tab_global", title: DEFAULT_TAB_KEYWORDS.global, region: "GLOBAL", lang: "en", query: DEFAULT_TAB_KEYWORDS.global, freshness: DEFAULT_FRESHNESS, sortMode: "time_desc", customTitle: false },
    { id: crypto.randomUUID(), defaultTitleKey: "tab_economy", title: DEFAULT_TAB_KEYWORDS.economy, region: "GLOBAL", lang: "en", query: DEFAULT_TAB_KEYWORDS.economy, freshness: DEFAULT_FRESHNESS, sortMode: "time_desc", customTitle: false },
    { id: crypto.randomUUID(), defaultTitleKey: "tab_tech", title: DEFAULT_TAB_KEYWORDS.tech, region: "GLOBAL", lang: "en", query: DEFAULT_TAB_KEYWORDS.tech, freshness: DEFAULT_FRESHNESS, sortMode: "time_desc", customTitle: false }
  ];
}

const tabsGrid = document.getElementById("tabsGrid");
const tabTemplate = document.getElementById("tabTemplate");
const tabDialog = document.getElementById("tabDialog");
const tabForm = document.getElementById("tabForm");
const tabDialogTitle = document.getElementById("tabDialogTitle");
const intervalSelect = document.getElementById("intervalSelect");
const refreshMeter = document.getElementById("refreshMeter");

document.getElementById("cancelTabBtn").addEventListener("click", () => tabDialog.close());

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
    customTitle: true,
    allowShortQueryFetch: false
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
      ? parsed.slice(0, MAX_TABS).map((tab) => {
          const fallbackTitle =
            tab.defaultTitleKey === "tab_global"
              ? DEFAULT_TAB_KEYWORDS.global
              : tab.defaultTitleKey === "tab_economy"
                ? DEFAULT_TAB_KEYWORDS.economy
                : tab.defaultTitleKey === "tab_tech"
                  ? DEFAULT_TAB_KEYWORDS.tech
                  : String(tab.title ?? tab.query ?? "").trim();
          const unifiedText = String(fallbackTitle).trim();
          const normalizedRegion = normalizeTrendGeo(tab.region || "US");
          const isTrendTab = Boolean(tab.allowShortQueryFetch && tab.customTitle && G20_TREND_GEO_CODES.has(normalizedRegion));
          const newsHl = isTrendTab ? getTrendNewsHl(normalizedRegion) : null;

          return {
            ...tab,
            title: unifiedText,
            query: unifiedText,
            region: tab.region || (tab.lang === "tr" ? "TR" : "US"),
            freshness: tab.freshness || DEFAULT_FRESHNESS,
            sortMode: tab.sortMode || "time_desc",
            customTitle: Boolean(tab.customTitle),
            allowShortQueryFetch: Boolean(tab.allowShortQueryFetch),
            feedMode: isTrendTab ? "trend" : tab.feedMode || null,
            newsHl: newsHl || tab.newsHl || null,
            lang: isTrendTab ? (newsHl && newsHl.startsWith("tr") ? "tr" : "en") : tab.lang || "en"
          };
        })
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
  persistTabs();
  renderLocalizedStaticTexts();
  setIntervalButtonState();
  renderAll();
}

function renderLocalizedStaticTexts() {
  document.title = t("appTitle");

  const subtitle = document.getElementById("appSubtitle");
  const intervalLabel = document.getElementById("intervalLabel");
  if (subtitle) subtitle.textContent = t("appSubtitle");
  if (intervalLabel) intervalLabel.textContent = t("intervalLabel");

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

  if (tabDialogTitle) tabDialogTitle.textContent = state.editTabId ? t("dialogEditTab") : t("dialogNewTab");
  if (tabTitleLabel) tabTitleLabel.textContent = t("tabTitleLabel");
  if (tabLanguageLabel) tabLanguageLabel.textContent = t("tabLanguageLabel");
  if (tabFreshnessLabel) tabFreshnessLabel.textContent = t("tabFreshnessLabel");
  if (tabTitleInput) tabTitleInput.placeholder = t("tabTitlePlaceholder");
  if (cancelBtn) cancelBtn.textContent = t("cancel");
  if (saveBtn) saveBtn.textContent = t("save");

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

  document.querySelectorAll(".trends-slot-title").forEach((node) => {
    node.textContent = t("trendsSlotTitle");
  });
  document.querySelectorAll(".trends-slot-description").forEach((node) => {
    node.textContent = t("trendsSlotDescription");
  });
  document.querySelectorAll(".trends-country-label").forEach((node) => {
    node.textContent = locale === "tr" ? "G20 Ülkeleri" : "G20 Countries";
  });
  document.querySelectorAll(".trends-country-bar").forEach((node) => {
    node.setAttribute("aria-label", locale === "tr" ? "G20 ülke seçimi" : "G20 country selection");
  });
  document.querySelectorAll(".empty-slot-description").forEach((node) => {
    node.textContent = t("emptySlotDescription");
  });
  document.querySelectorAll(".trends-status").forEach((node) => {
    if (node.dataset.loading === "true") node.textContent = t("trendsLoading");
  });
  document.querySelectorAll(".empty-add-btn span:last-child").forEach((node) => {
    node.textContent = t("addTab");
  });
}

function getTab(tabId) {
  return state.tabs.find((tab) => tab.id === tabId);
}

function updateTab(tabId, patch) {
  state.tabs = state.tabs.map((tab) => {
    if (tab.id !== tabId) return tab;

    const next = { ...tab, ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, "title") || Object.prototype.hasOwnProperty.call(patch, "query")) {
      const unifiedValue = String(patch.title ?? patch.query ?? "").trim();
      next.title = unifiedValue;
      next.query = unifiedValue;
    }

    return next;
  });
  persistTabs();
}

function createBlankTab() {
  const lang = locale === "tr" ? "tr" : "en";
  return {
    id: crypto.randomUUID(),
    title: "",
    region: lang === "tr" ? "TR" : "US",
    lang,
    query: "",
    freshness: DEFAULT_FRESHNESS,
    sortMode: "time_desc",
    customTitle: true,
    allowShortQueryFetch: false
  };
}

function getTrendGeo(targetGeo = state.trendsGeo) {
  return normalizeTrendGeo(targetGeo);
}

function getTrendsFeedUrl(geo) {
  return `${TRENDS_PROXY_PATH}?geo=${encodeURIComponent(resolveTrendGeoRequest(geo))}`;
}

function getTrendsCacheKey(geo) {
  return `${normalizeTrendGeo(geo)}`;
}

function parseTrafficValue(raw) {
  const numeric = Number(String(raw || "").replace(/[^\d]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function textFromTags(node, tagNames) {
  for (const tagName of tagNames) {
    const el = node.getElementsByTagName(tagName)[0];
    const value = el?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function parseFlattenedTrendsFeed(rawText, geo = "US") {
  const normalized = String(rawText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const feedUrl = `https://trends.google.com/trending/rss?geo=${normalizeTrendGeo(geo)}`;
  const datePattern = /^([A-Z][a-z]{2},\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\b/;
  const isTitleToken = (token) => /^[a-z0-9][a-z0-9.'-]*$/.test(token) || token === "-";
  const extractTailTitle = (chunk) => {
    const tail = String(chunk || "").split("https://").pop().trim();
    if (!tail) return "";

    const withoutTraffic = tail.replace(/\s+\d[\d,]*\+\s*$/, "").trim();
    if (!withoutTraffic) return "";

    const tokens = withoutTraffic.split(/\s+/);
    let start = tokens.length - 1;
    while (start >= 0 && isTitleToken(tokens[start])) start -= 1;

    const title = tokens.slice(start + 1).join(" ").trim();
    return normalizeFeedText(title, 120);
  };

  const trends = [];
  const parts = normalized.split(feedUrl);
  for (let index = 1; index < parts.length - 1; index += 1) {
    const titleChunk = String(parts[index] || "").trim();
    const metaChunk = String(parts[index + 1] || "").trim();

    const dateMatch = metaChunk.match(datePattern);
    const title = extractTailTitle(titleChunk);
    if (!title || !dateMatch) continue;

    const trafficMatch = titleChunk.match(/\b(\d[\d,]*\+)\s*$/);
    const trafficLabel = String(trafficMatch?.[1] || "").trim();
    const started = new Date(dateMatch[1]);
    const startedAt = Number.isFinite(started.getTime()) ? started.getTime() : 0;
    if (!trafficLabel) continue;

    trends.push({
      title,
      traffic: parseTrafficValue(trafficLabel),
      trafficLabel,
      started,
      startedAt,
      startedLabel: formatRelativeTime(started),
      image: "",
      source: "",
      link: feedUrl,
      description: ""
    });
  }

  return trends;
}

function parseTrendsFeed(xmlText, geo = "US") {
  const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const extractTagValue = (block, tagNames) => {
    for (const tagName of tagNames) {
      const pattern = new RegExp(`<${escapeRegExp(tagName)}[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, "i");
      const match = block.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  };

  const xml = String(xmlText || "");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  if (items.length) {
    return items
      .map((match) => {
        const block = match[1];
        const title = normalizeFeedText(extractTagValue(block, ["title"]), 120);
        const trafficLabel = extractTagValue(block, ["ht:approx_traffic", "approx_traffic"]);
        const traffic = parseTrafficValue(trafficLabel);
        const started = new Date(extractTagValue(block, ["pubDate"]));
        const startedAt = Number.isFinite(started.getTime()) ? started.getTime() : 0;
        const image =
          extractTagValue(block, ["ht:picture", "picture"]) ||
          extractTagValue(block, ["ht:news_item_picture", "news_item_picture"]) ||
          extractTagValue(block, ["media:content", "content"]) ||
          extractTagValue(block, ["enclosure"]);
        const source =
          normalizeFeedText(
            extractTagValue(block, ["ht:picture_source", "picture_source"]) ||
              extractTagValue(block, ["ht:news_item_source", "news_item_source"]),
            80
          );
        const link = extractTagValue(block, ["link"]);
        const description = normalizeFeedText(extractTagValue(block, ["description"]), 280);
        return {
          title,
          traffic,
          trafficLabel: trafficLabel || "",
          started,
          startedAt,
          startedLabel: formatRelativeTime(started),
          image,
          source,
          link,
          description
        };
      })
      .filter((trend) => trend.title);
  }

  const flattened = parseFlattenedTrendsFeed(xml, geo);
  if (flattened.length) return flattened;

  throw new Error(t("noFeed"));
}

async function fetchTrends(geo) {
  const normalizedGeo = getTrendGeo(geo);
  const requestGeo = resolveTrendGeoRequest(normalizedGeo);
  const feedUrl = getTrendsFeedUrl(requestGeo);

  try {
    const apiUrl = `${TRENDS_PROXY_PATH}?geo=${encodeURIComponent(requestGeo)}`;
    const response = await fetch(apiUrl, { cache: "no-store" });
    const xmlText = await response.text();
    const looksLikeHtml = /<!doctype html>|<html[\s>]/i.test(xmlText);

    if (!response.ok || looksLikeHtml || !xmlText.trim()) {
      throw new Error(t("trendsEmpty"));
    }

    return { feedUrl, trends: parseTrendsFeed(xmlText, requestGeo) };
  } catch (error) {
    throw error || new Error(t("trendsEmpty"));
  }
}

function createTrendTab(trend, geo) {
  const normalizedGeo = getTrendGeo(geo);
  const newsHl = getTrendNewsHl(normalizedGeo);
  return {
    id: crypto.randomUUID(),
    title: String(trend?.title || "").trim(),
    region: normalizedGeo,
    lang: newsHl.startsWith("tr") ? "tr" : "en",
    query: String(trend?.title || "").trim(),
    freshness: "1d",
    sortMode: "time_desc",
    feedMode: "trend",
    newsHl,
    customTitle: true,
    allowShortQueryFetch: true
  };
}

function renderTrendCountryBar(node, selectedGeo) {
  const bar = node.querySelector(".trends-country-bar");
  if (!bar) return;

  bar.replaceChildren(
    ...G20_TRENDS.map((country) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `trends-country-btn${country.code === normalizeTrendGeo(selectedGeo) ? " active" : ""}`;
      button.dataset.geo = country.code;
      button.textContent = getTrendCountryLabel(country.code);
      button.title = getTrendCountryLabel(country.code);
      button.setAttribute("aria-pressed", String(country.code === normalizeTrendGeo(selectedGeo)));
      return button;
    })
  );
}

function renderTrendsState(node, trends, geo, loading = false) {
  const list = node.querySelector(".trends-list");
  const status = node.querySelector(".trends-status");
  const countryBar = node.querySelector(".trends-country-bar");
  const addBtn = node.querySelector(".empty-add-btn");

  if (countryBar) {
    renderTrendCountryBar(node, geo);
  }
  if (status) {
    status.dataset.loading = loading ? "true" : "false";
    status.textContent = loading ? t("trendsLoading") : trends.length ? "" : t("trendsEmpty");
  }
  if (addBtn) {
    addBtn.querySelector("span:last-child").textContent = t("addTab");
  }

  if (!list) return;

  if (loading) {
    list.replaceChildren();
    const empty = document.createElement("li");
    empty.className = "trend-item trend-empty";
    empty.textContent = t("trendsLoading");
    list.appendChild(empty);
    return;
  }

  if (!trends.length) {
    list.replaceChildren();
    const empty = document.createElement("li");
    empty.className = "trend-item trend-empty";
    empty.textContent = t("trendsEmpty");
    list.appendChild(empty);
    return;
  }

  list.replaceChildren(
    ...trends.map((trend, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `trend-item${trend.image ? "" : " trend-item--no-image"}`;
      button.dataset.trendTitle = trend.title;
      button.dataset.trendGeo = geo;
      button.dataset.trendTraffic = String(trend.traffic ?? "");
      button.dataset.trendTrafficLabel = String(trend.trafficLabel ?? "");
      button.dataset.trendStartedAt = String(trend.startedAt ?? "");
      button.dataset.trendStartedLabel = String(trend.startedLabel ?? "");
      button.dataset.trendPubDate = trend.started instanceof Date && !Number.isNaN(trend.started.getTime()) ? trend.started.toISOString() : "";
      button.dataset.trendImage = String(trend.image ?? "");
      button.dataset.trendSource = String(trend.source ?? "");
      button.dataset.trendLink = String(trend.link ?? "");
      button.dataset.trendDescription = String(trend.description ?? "");
      const imageHtml = trend.image
        ? `<div class="trend-image"><img src="${escapeHtml(trend.image)}" alt="" loading="lazy" decoding="async" /></div>`
        : "";
      button.innerHTML = `
        ${imageHtml}
        <div class="trend-body">
          <div class="trend-topline">
            <span class="trend-rank">#${index + 1}</span>
            <span class="trend-time">${escapeHtml(trend.startedLabel || "")}</span>
          </div>
          <span class="trend-title">${escapeHtml(trend.title)}</span>
          <div class="trend-meta">
            <span class="trend-chip trend-chip-traffic">${escapeHtml(trend.trafficLabel || String(trend.traffic || ""))}</span>
            ${trend.source ? `<span class="trend-chip trend-chip-source">${escapeHtml(trend.source)}</span>` : ""}
          </div>
          ${trend.description ? `<p class="trend-description">${escapeHtml(trend.description)}</p>` : ""}
        </div>
      `;
      li.appendChild(button);
      return li;
    })
  );
}

async function refreshTrendsSlot(node, geo) {
  if (!node) return;
  const normalizedGeo = getTrendGeo(geo);
  const cacheKey = getTrendsCacheKey(normalizedGeo);
  const token = (trendsTokens.get(cacheKey) || 0) + 1;
  trendsTokens.set(cacheKey, token);

  const cached = trendsCache.get(cacheKey);
  if (cached?.trends?.length) {
    renderTrendsState(node, cached.trends, normalizedGeo, false);
  } else {
    renderTrendsState(node, [], normalizedGeo, true);
  }

  try {
    const result = await fetchTrends(normalizedGeo);
    if (trendsTokens.get(cacheKey) !== token) return;
    trendsCache.set(cacheKey, { ...result, fetchedAt: Date.now() });
    renderTrendsState(node, result.trends, normalizedGeo, false);
  } catch (error) {
    if (trendsTokens.get(cacheKey) !== token) return;
    const status = node.querySelector(".trends-status");
    const cached = trendsCache.get(cacheKey);
    if (cached?.trends?.length) {
      renderTrendsState(node, cached.trends, normalizedGeo, false);
    } else {
      renderTrendsState(node, [], normalizedGeo, false);
    }
    if (status) status.textContent = error?.message || t("newsUnavailable");
  }
}

function canFetchTab(tab) {
  return Boolean(tab?.allowShortQueryFetch) || String(tab?.query ?? tab?.title ?? "").trim().length >= 3;
}

function renderShortQueryState(tabId) {
  const node = tabsGrid.querySelector(`[data-tab-id="${tabId}"]`);
  if (!node) return;

  const list = node.querySelector(".news-list");
  const statusBadge = node.querySelector(".tab-status");
  const signal = node.querySelector(".tab-signal");

  if (statusBadge) {
    statusBadge.textContent = t("shortQueryStatus");
    statusBadge.title = t("shortQueryHint");
  }
  if (signal) signal.classList.toggle("active", false);
  if (list) {
    list.innerHTML = `<li class="news-item"><p>${t("shortQueryHint")}</p></li>`;
  }
  setLoading(node, false);
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
  if (tab?.feedMode === "trend") {
    const hl = String(tab.newsHl || getTrendNewsHl(tab.region || "US")).trim() || "en-US";
    const query = String(tab.query || "").trim() || (tab.lang === "tr" ? "haber" : "news");
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${encodeURIComponent(hl)}`;
  }

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

  if (!canFetchTab(tab)) {
    renderShortQueryState(tabId);
    return;
  }

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
      statusBadge.textContent = t("statusError");
      statusBadge.title = t("errorPrefix");
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
    lastAutoSearchLengths.set(tabId, 0);
    renderShortQueryState(tabId);
    return;
  }

  if (currentLen < 3) {
    if (currentLen < lastLen) lastAutoSearchLengths.set(tabId, currentLen);
    renderShortQueryState(tabId);
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
    if (wrap.dataset.icon === "check") {
      setIcon(ICON_URLS.check);
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

function updateTabsGridLayout() {
  if (!tabsGrid) return;

  const styles = getComputedStyle(tabsGrid);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const gap = Number.parseFloat(styles.columnGap || styles.gap) || TAB_COLUMN_GAP;
  const contentWidth = Math.max(0, tabsGrid.clientWidth - paddingLeft - paddingRight);
  const maxColumnsAtThisWidth = Math.max(1, Math.floor((contentWidth + gap) / (TAB_MIN_WIDTH + gap)));
  const columnCount = Math.max(1, Math.min(TAB_COLUMN_CAP, maxColumnsAtThisWidth));
  const columnWidth = Math.max(0, Math.floor((contentWidth - gap * (columnCount - 1)) / columnCount));

  tabsGrid.style.setProperty("--tab-column-width", `${columnWidth}px`);
}

function createEmptySlot(primary = false) {
  const node = document.createElement("article");
  node.className = `tab-column empty-slot${primary ? " primary" : ""}`;
  node.innerHTML = primary
    ? `
    <div class="empty-slot-inner">
      <button type="button" class="btn primary empty-add-btn">
        <span class="icon-wrap" data-icon="plus"></span>
        <span>${t("addTab")}</span>
      </button>
      <div class="empty-slot-copy">
        <strong class="trends-slot-title">${t("trendsSlotTitle")}</strong>
        <span class="trends-slot-description">${t("trendsSlotDescription")}</span>
      </div>
      <div class="trends-panel">
        <div class="trends-panel-head">
          <span class="trends-country-label">${locale === "tr" ? "G20 Ülkeleri" : "G20 Countries"}</span>
          <span class="trends-status" data-loading="true">${t("trendsLoading")}</span>
        </div>
        <div class="trends-country-bar" aria-label="${locale === "tr" ? "G20 ülke seçimi" : "G20 country selection"}"></div>
        <ul class="trends-list" aria-live="polite"></ul>
      </div>
    </div>
  `
    : `<div class="empty-slot-inner" aria-hidden="true"></div>`;

  bindIcons(node);
  const countryBar = node.querySelector(".trends-country-bar");
  if (countryBar) {
    countryBar.addEventListener("click", (event) => {
      const button = event.target.closest(".trends-country-btn");
      if (!button) return;
      const nextGeo = normalizeTrendGeo(button.dataset.geo);
      if (nextGeo === state.trendsGeo) return;
      state.trendsGeo = nextGeo;
      localStorage.setItem(TREND_GEO_STORAGE_KEY, state.trendsGeo);
      renderTrendCountryBar(node, state.trendsGeo);
      refreshTrendsSlot(node, state.trendsGeo);
    });
  }
  renderTrendCountryBar(node, state.trendsGeo);
  const addBtn = node.querySelector(".empty-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (state.tabs.length >= MAX_TABS) {
        alert(t("maxTabsReached", { count: MAX_TABS }));
        return;
      }
      const newTab = createBlankTab();
      state.tabs.push(newTab);
      persistTabs();
      pendingFocusTabId = newTab.id;
      renderAll();
    });
  }

  if (primary) {
    const geo = getTrendGeo();
    const trendsList = node.querySelector(".trends-list");
    node.addEventListener("click", (event) => {
      const trendBtn = event.target.closest(".trend-item[data-trend-title]");
      if (!trendBtn || !node.contains(trendBtn)) return;
      const title = String(trendBtn.dataset.trendTitle || "").trim();
      const region = String(trendBtn.dataset.trendGeo || geo).toUpperCase();
      if (!title) return;
      if (state.tabs.length >= MAX_TABS) {
        alert(t("maxTabsReached", { count: MAX_TABS }));
        return;
      }

      const newTab = createTrendTab({ title }, region);
      state.tabs.push(newTab);
      persistTabs();
      pendingFocusTabId = newTab.id;
      renderAll();
    });

    if (trendsList) {
      const cache = trendsCache.get(getTrendsCacheKey(geo));
      if (cache?.trends?.length) {
        renderTrendsState(node, cache.trends, geo, false);
      } else {
        renderTrendsState(node, [], geo, true);
      }
      refreshTrendsSlot(node, geo);
    }
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
  let deleteArmed = false;

  const setDeleteState = (armed) => {
    deleteArmed = armed;
    deleteBtn.classList.toggle("armed", armed);
    deleteBtn.classList.toggle("danger", !armed);
    deleteBtn.innerHTML = `<span class="icon-wrap" data-icon="${armed ? "check" : "close"}"></span>`;
    bindIcons(deleteBtn);
    deleteBtn.setAttribute("aria-pressed", String(armed));
    deleteBtn.setAttribute("aria-label", armed ? t("deleteConfirm") : t("delete"));
    deleteBtn.setAttribute("title", armed ? t("deleteConfirm") : t("delete"));
  };

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
  titleInput.placeholder = t("searchInputPlaceholder");
  langBtn.textContent = getLanguageCode(tab.lang);
  freshnessBtn.textContent = formatFreshnessButtonLabel(tab.freshness || DEFAULT_FRESHNESS);
  sortBtn.innerHTML = `<span class="icon-wrap" data-icon="${tab.sortMode === "time_desc" ? "sort-newest" : "sort-oldest"}"></span>`;
  bindIcons(sortBtn);
  langBtn.classList.remove("active");
  freshnessBtn.classList.toggle("active", tab.freshness !== DEFAULT_FRESHNESS);
  sortBtn.classList.toggle("active", tab.sortMode === "time_desc");
  setDeleteState(false);
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
    updateTab(tab.id, { title: value, customTitle: true, allowShortQueryFetch: false });
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
    if (!deleteArmed) {
      setDeleteState(true);
      return;
    }

    state.tabs = state.tabs.filter((item) => item.id !== tab.id);
    newsCache.delete(tab.id);
    persistTabs();
    renderAll();
  });

  deleteBtn.addEventListener("mouseleave", () => {
    if (deleteArmed) setDeleteState(false);
  });
  deleteBtn.addEventListener("focusout", () => {
    if (deleteArmed) setDeleteState(false);
  });

  bindIcons(node);
  tabsGrid.appendChild(node);

  const cache = newsCache.get(tab.id);
  const itemCount = cache?.items?.length || 0;
  if (!canFetchTab(tab)) {
    renderShortQueryState(tab.id);
  } else {
    statusBadge.textContent = itemCount ? String(itemCount) : t("pending");
    statusBadge.title = itemCount ? t("newsCount", { count: itemCount }) : t("pending");
    signal.classList.toggle("active", itemCount > 0);
    if (cache?.items?.length) renderNewsList(node.querySelector(".news-list"), sortItems(cache.items, tab.sortMode));
  }

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
  updateTabsGridLayout();

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

  if (pendingFocusTabId) {
    const focusId = pendingFocusTabId;
    pendingFocusTabId = null;
    requestAnimationFrame(() => {
      const input = tabsGrid.querySelector(`[data-tab-id="${focusId}"] .tab-title-input`);
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }

  requestAnimationFrame(updateTabsGridLayout);
}

async function registerApiServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("Service worker registration skipped:", error);
  }
}

document.documentElement.lang = locale;
renderLocalizedStaticTexts();
setIntervalButtonState();
registerApiServiceWorker();
startAutoRefresh();
renderAll();

window.addEventListener("resize", () => {
  updateTabsGridLayout();
});
