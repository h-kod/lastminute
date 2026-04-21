const MAX_TABS = 10;
const DEFAULT_INTERVAL = 15;

const defaultTabs = [
  { id: crypto.randomUUID(), title: "Global", region: "GLOBAL", lang: "en", query: "", sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: "Türkiye", region: "TR", lang: "tr", query: "", sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: "ABD", region: "US", lang: "en", query: "", sortMode: "time_desc" },
  { id: crypto.randomUUID(), title: "Trend 50", region: "GLOBAL", lang: "en", query: "top 50 trends", sortMode: "time_desc" }
];

let state = {
  tabs: loadTabs(),
  hideRead: false,
  readSet: new Set(JSON.parse(localStorage.getItem("lastminute_read") || "[]")),
  intervalSec: Number(localStorage.getItem("lastminute_interval") || DEFAULT_INTERVAL),
  editTabId: null
};

let refreshTimer = null;

const tabsGrid = document.getElementById("tabsGrid");
const tabTemplate = document.getElementById("tabTemplate");

const tabDialog = document.getElementById("tabDialog");
const tabForm = document.getElementById("tabForm");
const tabDialogTitle = document.getElementById("tabDialogTitle");

const manageDialog = document.getElementById("manageDialog");
const manageList = document.getElementById("manageList");
const hideReadCheckbox = document.getElementById("hideRead");

const intervalButtons = [...document.querySelectorAll(".interval-btn")];

document.getElementById("addTabBtn").addEventListener("click", () => {
  if (state.tabs.length >= MAX_TABS) {
    alert("Maksimum 10 sekme eklenebilir.");
    return;
  }
  openTabDialog();
});

document.getElementById("manageBtn").addEventListener("click", () => {
  renderManageList();
  manageDialog.showModal();
});

document.getElementById("closeManageBtn").addEventListener("click", () => manageDialog.close());
document.getElementById("cancelTabBtn").addEventListener("click", () => tabDialog.close());
document.getElementById("refreshAllBtn").addEventListener("click", () => renderAll());

hideReadCheckbox.addEventListener("change", (e) => {
  state.hideRead = e.target.checked;
  renderAll();
});

intervalButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const sec = Number(btn.dataset.seconds);
    state.intervalSec = sec;
    localStorage.setItem("lastminute_interval", String(sec));
    setIntervalButtonState();
    startAutoRefresh();
  });
});

tabForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const payload = {
    title: document.getElementById("tabTitle").value.trim(),
    region: document.getElementById("tabRegion").value,
    lang: document.getElementById("tabLanguage").value,
    query: document.getElementById("tabQuery").value.trim()
  };

  if (state.editTabId) {
    state.tabs = state.tabs.map((tab) =>
      tab.id === state.editTabId ? { ...tab, ...payload } : tab
    );
  } else {
    state.tabs.push({ id: crypto.randomUUID(), ...payload, sortMode: "time_desc" });
  }

  persistTabs();
  renderAll();
  renderManageList();

  state.editTabId = null;
  tabDialog.close();
  tabForm.reset();
});

function loadTabs() {
  const raw = localStorage.getItem("lastminute_tabs");
  if (!raw) return defaultTabs;

  try {
    const parsed = JSON.parse(raw);
    return parsed.length
      ? parsed.slice(0, MAX_TABS).map((tab) => ({ ...tab, sortMode: tab.sortMode || "time_desc" }))
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

function openTabDialog(editTab = null) {
  state.editTabId = editTab?.id || null;
  tabDialogTitle.textContent = editTab ? "Sekme Düzenle" : "Yeni Sekme";

  document.getElementById("tabTitle").value = editTab?.title || "";
  document.getElementById("tabRegion").value = editTab?.region || "TR";
  document.getElementById("tabLanguage").value = editTab?.lang || "tr";
  document.getElementById("tabQuery").value = editTab?.query || "";

  tabDialog.showModal();
}

function getFeedUrl(tab) {
  const regionMap = {
    TR: { ceid: "TR:tr", gl: "TR", hl: "tr" },
    US: { ceid: "US:en", gl: "US", hl: "en-US" },
    GLOBAL: { ceid: "US:en", gl: "US", hl: tab.lang === "tr" ? "tr" : "en" }
  };

  const conf = regionMap[tab.region] || regionMap.GLOBAL;
  const q = tab.query ? `/search?q=${encodeURIComponent(tab.query)}` : "";
  return `https://news.google.com/rss${q}?hl=${conf.hl}&gl=${conf.gl}&ceid=${conf.ceid}`;
}

function rssToJsonUrl(feedUrl) {
  return `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
}

async function fetchNews(tab) {
  const response = await fetch(rssToJsonUrl(getFeedUrl(tab)));
  if (!response.ok) throw new Error("Haberler alınamadı");
  const data = await response.json();

  return (data.items || []).map((item) => ({
    id: item.guid || item.link,
    title: item.title,
    link: item.link,
    source: item.author || "Bilinmeyen Kaynak",
    date: new Date(item.pubDate),
    description: (item.description || "").replace(/<[^>]+>/g, "").slice(0, 140)
  }));
}

function sortItems(items, mode) {
  const sorted = [...items];
  if (mode === "time_asc") {
    sorted.sort((a, b) => a.date - b.date);
  } else {
    sorted.sort((a, b) => b.date - a.date);
  }
  return sorted;
}

async function renderTab(tab) {
  const node = tabTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.tabId = tab.id;

  node.querySelector(".tab-title").textContent = tab.title;
  node.querySelector(".tab-meta").textContent = `${tab.region} • ${tab.query || "Genel"}`;

  const sortBtn = node.querySelector(".sort-btn");
  sortBtn.classList.toggle("active", tab.sortMode === "time_asc");
  sortBtn.title = tab.sortMode === "time_desc" ? "Yeni → Eski" : "Eski → Yeni";

  sortBtn.addEventListener("click", () => {
    const nextMode = tab.sortMode === "time_desc" ? "time_asc" : "time_desc";
    state.tabs = state.tabs.map((t) => (t.id === tab.id ? { ...t, sortMode: nextMode } : t));
    persistTabs();
    renderAll();
  });

  node.querySelector(".edit-btn").addEventListener("click", () => openTabDialog(tab));
  node.querySelector(".refresh-btn").addEventListener("click", () => renderAll());

  const list = node.querySelector(".news-list");
  list.innerHTML = '<li class="news-item"><p>Yükleniyor...</p></li>';
  tabsGrid.appendChild(node);

  try {
    const items = sortItems(await fetchNews(tab), tab.sortMode);
    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML = '<li class="news-item"><p>Haber bulunamadı.</p></li>';
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "news-item";
      if (state.readSet.has(item.id) && state.hideRead) li.classList.add("hidden");

      li.innerHTML = `
        <a href="${item.link}" target="_blank" rel="noreferrer">${item.title}</a>
        <span class="tag">${item.source} • ${item.date.toLocaleString("tr-TR")}</span>
        <p>${item.description}</p>
      `;

      li.addEventListener("click", () => {
        state.readSet.add(item.id);
        persistReadSet();
        if (state.hideRead) li.classList.add("hidden");
      });

      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="news-item"><p>Hata: ${err.message}</p></li>`;
  }
}

function renderManageList() {
  manageList.innerHTML = "";

  state.tabs.forEach((tab, idx) => {
    const row = document.createElement("div");
    row.className = "manage-row";

    const info = document.createElement("div");
    info.innerHTML = `<strong>${tab.title}</strong><br><small>${tab.region} • ${tab.query || "Genel"}</small>`;

    const edit = document.createElement("button");
    edit.className = "btn";
    edit.textContent = "Düzenle";
    edit.addEventListener("click", () => openTabDialog(tab));

    const up = document.createElement("button");
    up.className = "btn";
    up.textContent = "↑";
    up.disabled = idx === 0;
    up.addEventListener("click", () => moveTab(idx, idx - 1));

    const down = document.createElement("button");
    down.className = "btn";
    down.textContent = "↓";
    down.disabled = idx === state.tabs.length - 1;
    down.addEventListener("click", () => moveTab(idx, idx + 1));

    const remove = document.createElement("button");
    remove.className = "btn";
    remove.style.borderColor = "#fecaca";
    remove.style.color = "#b91c1c";
    remove.textContent = "Sil";
    remove.addEventListener("click", () => {
      state.tabs = state.tabs.filter((t) => t.id !== tab.id);
      persistTabs();
      renderManageList();
      renderAll();
    });

    row.append(info, edit, up, down, remove);
    manageList.appendChild(row);
  });
}

function moveTab(from, to) {
  const [tab] = state.tabs.splice(from, 1);
  state.tabs.splice(to, 0, tab);
  persistTabs();
  renderManageList();
  renderAll();
}

function setIntervalButtonState() {
  intervalButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.seconds) === state.intervalSec);
  });
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    renderAll();
  }, state.intervalSec * 1000);
}

async function renderAll() {
  tabsGrid.innerHTML = "";
  await Promise.all(state.tabs.map((tab) => renderTab(tab)));
}

setIntervalButtonState();
startAutoRefresh();
renderAll();
