const MAX_TABS = 10;

const defaultTabs = [
  { id: crypto.randomUUID(), title: "Global", region: "GLOBAL", lang: "en", query: "" },
  { id: crypto.randomUUID(), title: "Türkiye", region: "TR", lang: "tr", query: "" },
  { id: crypto.randomUUID(), title: "ABD", region: "US", lang: "en", query: "" },
  { id: crypto.randomUUID(), title: "Trend 50", region: "GLOBAL", lang: "en", query: "top 50 trends" }
];

let state = {
  tabs: loadTabs(),
  sortMode: "time_desc",
  hideRead: false,
  readSet: new Set(JSON.parse(localStorage.getItem("newsdeck_read") || "[]"))
};

const tabsGrid = document.getElementById("tabsGrid");
const tabTemplate = document.getElementById("tabTemplate");

const tabDialog = document.getElementById("tabDialog");
const tabForm = document.getElementById("tabForm");

const manageDialog = document.getElementById("manageDialog");
const manageList = document.getElementById("manageList");
const sortModeSelect = document.getElementById("sortMode");
const hideReadCheckbox = document.getElementById("hideRead");

document.getElementById("addTabBtn").addEventListener("click", () => {
  if (state.tabs.length >= MAX_TABS) {
    alert("Maksimum 10 tab eklenebilir.");
    return;
  }
  tabDialog.showModal();
});

document.getElementById("cancelTabBtn").addEventListener("click", () => tabDialog.close());

document.getElementById("manageBtn").addEventListener("click", () => {
  renderManageList();
  manageDialog.showModal();
});

document.getElementById("closeManageBtn").addEventListener("click", () => manageDialog.close());

sortModeSelect.addEventListener("change", (e) => {
  state.sortMode = e.target.value;
  renderAll();
});

hideReadCheckbox.addEventListener("change", (e) => {
  state.hideRead = e.target.checked;
  renderAll();
});

tabForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("tabTitle").value.trim();
  const region = document.getElementById("tabRegion").value;
  const lang = document.getElementById("tabLanguage").value;
  const query = document.getElementById("tabQuery").value.trim();

  state.tabs.push({ id: crypto.randomUUID(), title, region, lang, query });
  persistTabs();
  renderAll();

  tabDialog.close();
  tabForm.reset();
});

function loadTabs() {
  const raw = localStorage.getItem("newsdeck_tabs");
  if (!raw) return defaultTabs;
  try {
    const parsed = JSON.parse(raw);
    return parsed.length ? parsed.slice(0, MAX_TABS) : defaultTabs;
  } catch {
    return defaultTabs;
  }
}

function persistTabs() {
  localStorage.setItem("newsdeck_tabs", JSON.stringify(state.tabs));
}

function persistReadSet() {
  localStorage.setItem("newsdeck_read", JSON.stringify([...state.readSet]));
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
  const url = rssToJsonUrl(getFeedUrl(tab));
  const res = await fetch(url);
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

function sortItems(items) {
  const sorted = [...items];
  switch (state.sortMode) {
    case "time_asc":
      sorted.sort((a, b) => a.date - b.date);
      break;
    case "title_asc":
      sorted.sort((a, b) => a.title.localeCompare(b.title, "tr"));
      break;
    case "source_asc":
      sorted.sort((a, b) => a.source.localeCompare(b.source, "tr"));
      break;
    default:
      sorted.sort((a, b) => b.date - a.date);
  }
  return sorted;
}

async function renderTab(tab) {
  const node = tabTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.tabId = tab.id;

  node.querySelector(".tab-title").textContent = tab.title;
  node.querySelector(".tab-meta").textContent = `${tab.region} • ${tab.query || "Genel"}`;

  const list = node.querySelector(".news-list");
  list.innerHTML = '<li class="news-item"><p>Yükleniyor...</p></li>';

  node.querySelector(".refresh-btn").addEventListener("click", () => renderAll());

  tabsGrid.appendChild(node);

  try {
    const items = sortItems(await fetchNews(tab));
    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML = '<li class="news-item"><p>Haber bulunamadı.</p></li>';
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "news-item";
      const isRead = state.readSet.has(item.id);
      if (isRead && state.hideRead) li.classList.add("hidden");

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
    info.innerHTML = `<strong>${tab.title}</strong><br/><small>${tab.region} • ${tab.query || "Genel"}</small>`;

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
    remove.style.borderColor = "var(--danger)";
    remove.textContent = "Sil";
    remove.addEventListener("click", () => {
      state.tabs = state.tabs.filter((t) => t.id !== tab.id);
      persistTabs();
      renderManageList();
      renderAll();
    });

    row.append(info, up, down, remove);
    manageList.appendChild(row);
  });
}

function moveTab(from, to) {
  const [item] = state.tabs.splice(from, 1);
  state.tabs.splice(to, 0, item);
  persistTabs();
  renderManageList();
  renderAll();
}

async function renderAll() {
  tabsGrid.innerHTML = "";
  for (const tab of state.tabs) {
    await renderTab(tab);
  }
}

renderAll();
