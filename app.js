const MAX_TABS = 10;

const defaultTabs = [
  { id: crypto.randomUUID(), title: "Global", region: "GLOBAL", lang: "en", query: "", sort: "desc" },
  { id: crypto.randomUUID(), title: "Türkiye", region: "TR", lang: "tr", query: "", sort: "desc" },
  { id: crypto.randomUUID(), title: "ABD", region: "US", lang: "en", query: "", sort: "desc" },
  { id: crypto.randomUUID(), title: "Trend 50", region: "GLOBAL", lang: "en", query: "top 50 trends", sort: "desc" }
];

let state = {
  tabs: loadTabs(),
  readSet: new Set(JSON.parse(localStorage.getItem("lastminute_read") || "[]")),
  refreshSeconds: 30,
  intervalId: null,
  lastUpdatedAt: null
};

const tabsGrid = document.getElementById("tabsGrid");
const tabTemplate = document.getElementById("tabTemplate");

const tabDialog = document.getElementById("tabDialog");
const tabForm = document.getElementById("tabForm");
const tabDialogTitle = document.getElementById("tabDialogTitle");
const editingTabId = document.getElementById("editingTabId");

const manageDialog = document.getElementById("manageDialog");
const manageList = document.getElementById("manageList");
const timerStatus = document.getElementById("timerStatus");

function openAddDialog() {
  if (state.tabs.length >= MAX_TABS) {
    alert("Maksimum 10 sekme eklenebilir.");
    return;
  }
  tabDialogTitle.textContent = "Yeni Sekme";
  editingTabId.value = "";
  tabForm.reset();
  tabDialog.showModal();
}

function openEditDialog(tab) {
  tabDialogTitle.textContent = "Sekmeyi Düzenle";
  editingTabId.value = tab.id;
  document.getElementById("tabTitle").value = tab.title;
  document.getElementById("tabRegion").value = tab.region;
  document.getElementById("tabLanguage").value = tab.lang;
  document.getElementById("tabQuery").value = tab.query;
  tabDialog.showModal();
}

document.getElementById("addTabBtn").addEventListener("click", openAddDialog);
document.getElementById("closeTabDialog").addEventListener("click", () => tabDialog.close());
document.getElementById("cancelTabBtn").addEventListener("click", () => tabDialog.close());

document.getElementById("manageBtn").addEventListener("click", () => {
  renderManageList();
  manageDialog.showModal();
});

document.getElementById("closeManageBtn").addEventListener("click", () => manageDialog.close());

Array.from(document.querySelectorAll(".refresh-interval")).forEach((btn) => {
  btn.addEventListener("click", () => {
    state.refreshSeconds = Number(btn.dataset.seconds);
    Array.from(document.querySelectorAll(".refresh-interval")).forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    startAutoRefresh();
  });
});

tabForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = editingTabId.value;
  const payload = {
    title: document.getElementById("tabTitle").value.trim(),
    region: document.getElementById("tabRegion").value,
    lang: document.getElementById("tabLanguage").value,
    query: document.getElementById("tabQuery").value.trim()
  };

  if (id) {
    const tab = state.tabs.find((item) => item.id === id);
    if (tab) Object.assign(tab, payload);
  } else {
    state.tabs.push({ id: crypto.randomUUID(), ...payload, sort: "desc" });
  }

  persistTabs();
  renderManageList();
  renderAll();
  tabDialog.close();
});

function loadTabs() {
  const raw = localStorage.getItem("lastminute_tabs");
  if (!raw) return defaultTabs;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.length) return defaultTabs;
    return parsed.slice(0, MAX_TABS).map((tab) => ({ ...tab, sort: tab.sort || "desc" }));
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
  const res = await fetch(rssToJsonUrl(getFeedUrl(tab)));
  if (!res.ok) throw new Error("Haberler alınamadı");
  const data = await res.json();
  return (data.items || []).map((item) => ({
    id: item.guid || item.link,
    title: item.title,
    link: item.link,
    source: item.author || "Bilinmeyen Kaynak",
    date: new Date(item.pubDate),
    description: (item.description || "").replace(/<[^>]+>/g, "").slice(0, 140)
  }));
}

function sortItems(items, tab) {
  const sorted = [...items];
  sorted.sort((a, b) => (tab.sort === "asc" ? a.date - b.date : b.date - a.date));
  return sorted;
}

async function renderTab(tab) {
  const node = tabTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.tabId = tab.id;

  node.querySelector(".tab-title").textContent = tab.title;
  node.querySelector(".tab-meta").textContent = `${tab.region} • ${tab.query || "Genel"}`;

  const sortBtn = node.querySelector(".sort-btn");
  if (tab.sort === "asc") sortBtn.classList.add("active");
  sortBtn.addEventListener("click", () => {
    tab.sort = tab.sort === "asc" ? "desc" : "asc";
    persistTabs();
    renderAll();
  });

  node.querySelector(".refresh-btn").addEventListener("click", () => renderAll());

  const list = node.querySelector(".news-list");
  list.innerHTML = '<li class="news-item"><p>Yükleniyor...</p></li>';
  tabsGrid.appendChild(node);

  try {
    const items = sortItems(await fetchNews(tab), tab);
    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML = '<li class="news-item"><p>Haber bulunamadı.</p></li>';
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "news-item";
      li.innerHTML = `
        <a href="${item.link}" target="_blank" rel="noreferrer">${item.title}</a>
        <span class="tag">${item.source} • ${item.date.toLocaleString("tr-TR")}</span>
        <p>${item.description}</p>
      `;

      if (state.readSet.has(item.id)) li.classList.add("hidden");

      li.addEventListener("click", () => {
        state.readSet.add(item.id);
        persistReadSet();
        li.classList.add("hidden");
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
    info.innerHTML = `<strong>${tab.title}</strong><br/><small>${tab.region} • ${tab.query || "Genel"}</small>`;

    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.textContent = "Düzenle";
    editBtn.addEventListener("click", () => openEditDialog(tab));

    const upBtn = document.createElement("button");
    upBtn.className = "btn";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => moveTab(idx, idx - 1));

    const downBtn = document.createElement("button");
    downBtn.className = "btn";
    downBtn.textContent = "↓";
    downBtn.disabled = idx === state.tabs.length - 1;
    downBtn.addEventListener("click", () => moveTab(idx, idx + 1));

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-danger";
    removeBtn.textContent = "Sil";
    removeBtn.addEventListener("click", () => {
      state.tabs = state.tabs.filter((item) => item.id !== tab.id);
      persistTabs();
      renderManageList();
      renderAll();
    });

    row.append(info, editBtn, upBtn, downBtn, removeBtn);
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

function startAutoRefresh() {
  if (state.intervalId) clearInterval(state.intervalId);

  timerStatus.textContent = `${state.refreshSeconds} sn seçildi`;
  state.intervalId = setInterval(() => renderAll(), state.refreshSeconds * 1000);
}

async function renderAll() {
  tabsGrid.innerHTML = "";
  for (const tab of state.tabs) {
    await renderTab(tab);
  }
  state.lastUpdatedAt = new Date();
  timerStatus.textContent = `${state.refreshSeconds} sn • Son güncelleme: ${state.lastUpdatedAt.toLocaleTimeString("tr-TR")}`;
}

startAutoRefresh();
renderAll();
