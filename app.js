const MAX_TABS = 10;
const DEFAULT_INTERVAL = 15;
const DEFAULT_FRESHNESS = "1h";
const API_BASE_CANDIDATES = ["http://127.0.0.1:8080", "http://localhost:8080", window.location.origin];

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
let deleteTargetTabId = null;

const newsCache = new Map();
const refreshTokens = new Map();
const autoSearchTimers = new Map();
const lastAutoSearchLengths = new Map();

const tabsGrid = document.getElementById("tabsGrid");
const tabTemplate = document.getElementById("tabTemplate");
const tabDialog = document.getElementById("tabDialog");
const tabForm = document.getElementById("tabForm");
const tabDialogTitle = document.getElementById("tabDialogTitle");
const deleteConfirmDialog = document.getElementById("deleteConfirmDialog");
const deleteConfirmText = document.getElementById("deleteConfirmText");
const intervalSelect = document.getElementById("intervalSelect");

document.getElementById("addTabBtn").addEventListener("click", () => {
  if (state.tabs.length >= MAX_TABS) {
    alert("Maksimum 10 sekme eklenebilir.");
    return;
  }
  openTabDialog();
});

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

document.addEventListener("click", (event) => {
  if (event.target.closest(".freshness-group")) return;
  document.querySelectorAll(".freshness-group.open").forEach((group) => group.classList.remove("open"));
});

tabForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const previousTab = state.editTabId ? getTab(state.editTabId) : null;
  const payload = {
    title: document.getElementById("tabTitle").value.trim(),
    lang: document.getElementById("tabLanguage").value,
    query: document.getElementById("tabTitle").value.trim(),
    freshness: document.getElementById("tabFreshness").value,
    region: previousTab?.region || null
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
  if (!raw) return defaultTabs;

  try {
    const parsed = JSON.parse(raw);
    return parsed.length
      ? parsed.slice(0, MAX_TABS).map((tab) => ({
          ...tab,
          freshness: tab.freshness || DEFAULT_FRESHNESS,
          sortMode: tab.sortMode || "time_desc"
        }))
      : defaultTabs;
  } catch {
    return defaultTabs;
  }
}

function persistTabs() {
  localStorage.setItem("lastminute_tabs", JSON.stringify(state.tabs));
}

function persistReadSet() {
  localStorage.setItem("lastminute_read", JSON.stringify([...state.readSet]));
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

  const queryPill = node.querySelector(".state-query");
  const langBtn = node.querySelector(".lang-btn");
  const freshnessBtn = node.querySelector(".freshness-btn");
  const sortBtn = node.querySelector(".sort-btn");

  if (queryPill) queryPill.textContent = tab.query || "Genel";
  if (langBtn) {
    langBtn.textContent = tab.lang === "tr" ? "Türkçe" : "İngilizce";
    langBtn.classList.toggle("active", tab.lang === "tr");
    langBtn.setAttribute("aria-pressed", String(tab.lang === "tr"));
  }
  if (freshnessBtn) {
    freshnessBtn.textContent = formatFreshnessButtonLabel(tab.freshness || DEFAULT_FRESHNESS);
    freshnessBtn.classList.toggle("active", tab.freshness !== DEFAULT_FRESHNESS);
    freshnessBtn.setAttribute("aria-pressed", String(tab.freshness !== DEFAULT_FRESHNESS));
  }
  if (sortBtn) {
    sortBtn.textContent = tab.sortMode === "time_desc" ? "Yeni önce" : "Eski önce";
    sortBtn.classList.toggle("active", tab.sortMode === "time_desc");
    sortBtn.setAttribute("aria-pressed", String(tab.sortMode === "time_desc"));
  }
}

function openTabDialog(editTab = null) {
  state.editTabId = editTab?.id || null;
  tabDialogTitle.textContent = editTab ? "Sekme Düzenle" : "Yeni Sekme";

  document.getElementById("tabTitle").value = editTab?.title || "";
  document.getElementById("tabLanguage").value = editTab?.lang || "tr";
  document.getElementById("tabFreshness").value = editTab?.freshness || DEFAULT_FRESHNESS;

  tabDialog.showModal();
}

function formatFreshnessLabel(value) {
  const labels = {
    "1h": "Son 1 saat",
    "3h": "Son 3 saat",
    "5h": "Son 5 saat",
    "10h": "Son 10 saat",
    "1d": "Bugün"
  };
  return labels[value] || `Son ${value}`;
}

function formatFreshnessButtonLabel(value) {
  const labels = {
    "1h": "1 saat",
    "3h": "3 saat",
    "5h": "5 saat",
    "10h": "10 saat",
    "1d": "Bugün"
  };
  return labels[value] || formatFreshnessLabel(value);
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
  if (diffMs < -60_000) {
    return date.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  const absSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (absSeconds < 45) return "az önce";

  const absMinutes = Math.floor(absSeconds / 60);
  if (absMinutes < 60) return `${absMinutes} dk önce`;

  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) return `${absHours} saat önce`;

  const absDays = Math.floor(absHours / 24);
  if (absDays < 7) return `${absDays} gün önce`;

  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
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

function getFeedUrl(tab) {
  const langCode = tab.lang === "tr" ? "tr" : "en-US";
  const regionCode = resolveRegion(tab);
  const ceidLang = tab.lang === "tr" ? "tr" : "en";
  const query = [tab.query, `when:${tab.freshness || DEFAULT_FRESHNESS}`].filter(Boolean).join(" ");

  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${langCode}&gl=${regionCode}&ceid=${encodeURIComponent(`${regionCode}:${ceidLang}`)}`;
}

function parseFeedItems(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("RSS ayrıştırılamadı");

  return [...xml.querySelectorAll("item")]
    .map((item) => {
      const title = item.querySelector("title")?.textContent?.trim() || "Başlıksız";
      const link = item.querySelector("link")?.textContent?.trim() || "#";
      const source =
        item.querySelector("source")?.textContent?.trim() ||
        item.querySelector("source")?.getAttribute("url")?.trim() ||
        "Bilinmeyen kaynak";
      const dateText = item.querySelector("pubDate")?.textContent?.trim() || "";
      const descriptionRaw = item.querySelector("description")?.textContent || "";
      const image = extractImageUrl(item);
      const description = descriptionRaw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 280);

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

  for (const baseUrl of API_BASE_CANDIDATES) {
    const apiUrl = `${baseUrl}/api/feed?url=${encodeURIComponent(feedUrl)}`;
    try {
      const response = await fetch(apiUrl, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`Proxy erişilemedi: ${baseUrl} (${response.status})`);
        continue;
      }

      const xmlText = await response.text();
      if (!xmlText.trim()) {
        lastError = new Error(`RSS boş döndü: ${baseUrl}`);
        continue;
      }

      return parseFeedItems(xmlText).filter((item) => isWithinFreshness(item.date, tab.freshness || DEFAULT_FRESHNESS));
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Haberler alınamadı");
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
    empty.innerHTML = "<p>Haber bulunamadı.</p>";
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
    list.innerHTML = '<li class="news-item"><p>Yükleniyor...</p></li>';
  }

  try {
    const items = sortItems(await fetchNews(tab), tab.sortMode);
    if (refreshTokens.get(tabId) !== token) return;
    newsCache.set(tabId, { feedUrl, items, fetchedAt: Date.now() });
    statusBadge.textContent = `${items.length} haber`;
    signal.classList.toggle("active", items.length > 0);
    renderNewsList(list, items);
    setLoading(node, false);
  } catch (err) {
    if (refreshTokens.get(tabId) !== token) return;
    if (hasMatchingCache && cache?.items?.length) {
      statusBadge.textContent = `${cache.items.length} haber`;
      signal.classList.toggle("active", true);
      renderNewsList(list, sortItems(cache.items, tab.sortMode));
    } else {
      statusBadge.textContent = "hata";
      signal.classList.toggle("active", false);
      list.innerHTML = `<li class="news-item"><p>Hata: ${err.message}</p></li>`;
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
    if (wrap.dataset.icon === "plus") {
      wrap.innerHTML = '<svg aria-hidden="true"><use href="#icon-plus"></use></svg>';
      return;
    }
    if (wrap.dataset.icon === "arrow-left") {
      wrap.innerHTML = '<svg aria-hidden="true"><use href="#icon-arrow-left"></use></svg>';
      return;
    }
    if (wrap.dataset.icon === "arrow-right") {
      wrap.innerHTML = '<svg aria-hidden="true"><use href="#icon-arrow-right"></use></svg>';
      return;
    }
    if (wrap.dataset.icon === "close") {
      wrap.innerHTML = '<svg aria-hidden="true"><use href="#icon-close"></use></svg>';
    }
  });
}

function createEmptySlot(primary = false) {
  const node = document.createElement("article");
  node.className = `tab-column empty-slot${primary ? " primary" : ""}`;
  node.innerHTML = `
    <div class="empty-slot-inner">
      <div class="empty-slot-copy">
        <span class="empty-slot-kicker">Boş alan</span>
        <strong>${primary ? "Sekme ekle" : "Hazır alan"}</strong>
        <p>${primary ? "Yeni bir sekme eklemek için tıkla." : "Bu alan yeni sekmeler için ayrıldı."}</p>
      </div>
      ${primary ? `
        <button type="button" class="btn primary empty-add-btn">
          <span class="icon-wrap" data-icon="plus"></span>
          <span>Sekme Ekle</span>
        </button>
      ` : ""}
    </div>
  `;

  bindIcons(node);
  const addBtn = node.querySelector(".empty-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (state.tabs.length >= MAX_TABS) {
        alert("Maksimum 10 sekme eklenebilir.");
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
  const queryPill = node.querySelector(".state-query");
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

  titleInput.value = tab.title;
  titleInput.placeholder = "Anahtar kelime";
  queryPill.textContent = tab.query || "Genel";
  langBtn.textContent = tab.lang === "tr" ? "Türkçe" : "İngilizce";
  freshnessBtn.textContent = formatFreshnessButtonLabel(tab.freshness || DEFAULT_FRESHNESS);
  sortBtn.textContent = tab.sortMode === "time_desc" ? "Yeni önce" : "Eski önce";
  langBtn.classList.toggle("active", tab.lang === "tr");
  freshnessBtn.classList.toggle("active", tab.freshness !== DEFAULT_FRESHNESS);
  sortBtn.classList.toggle("active", tab.sortMode === "time_desc");
  langBtn.setAttribute("aria-pressed", String(tab.lang === "tr"));
  freshnessBtn.setAttribute("aria-pressed", String(tab.freshness !== DEFAULT_FRESHNESS));
  sortBtn.setAttribute("aria-pressed", String(tab.sortMode === "time_desc"));
  moveLeftBtn.disabled = state.tabs.findIndex((item) => item.id === tab.id) === 0;
  moveRightBtn.disabled = state.tabs.findIndex((item) => item.id === tab.id) === state.tabs.length - 1;

  titleInput.addEventListener("input", () => {
    const value = titleInput.value;
    updateTab(tab.id, { title: value, query: value });
    queryPill.textContent = value.trim() || "Genel";
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
    freshnessGroup.classList.toggle("open");
  });

  freshnessMenu.querySelectorAll(".freshness-option").forEach((optionBtn) => {
    optionBtn.addEventListener("click", () => {
      newsCache.delete(tab.id);
      updateTab(tab.id, { freshness: optionBtn.dataset.freshness });
      freshnessGroup.classList.remove("open");
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
    deleteConfirmText.textContent = `"${tab.title || "Sekme"}" silinsin mi?`;
    deleteConfirmDialog.showModal();
  });

  bindIcons(node);
  tabsGrid.appendChild(node);

  const cache = newsCache.get(tab.id);
  const itemCount = cache?.items?.length || 0;
  statusBadge.textContent = itemCount ? `${itemCount} haber` : "bekleniyor";
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
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    state.tabs.forEach((tab) => refreshTab(tab.id, { force: true }));
  }, state.intervalSec * 1000);
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

  const remainder = state.tabs.length % 5;
  const fillerCount = state.tabs.length === 0 ? 5 : remainder === 0 ? 0 : 5 - remainder;
  for (let i = 0; i < fillerCount; i += 1) {
    tabsGrid.appendChild(createEmptySlot(i === 0));
  }
}

setIntervalButtonState();
startAutoRefresh();
renderAll();
