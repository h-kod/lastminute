const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...headers
  });
  res.end(body);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found");
      return;
    }

    send(res, 200, data, { "Content-Type": type });
  });
}

const TREND_GEO_ALIASES = {
  CN: "HK"
};

async function proxyGoogleFeed(url, allowedPrefix, res) {
  if (!url || !url.startsWith(allowedPrefix)) {
    send(res, 400, JSON.stringify({ error: "Invalid feed url" }), {
      "Content-Type": "application/json; charset=utf-8"
    });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      send(res, response.status, JSON.stringify({ error: `Upstream ${response.status}` }), {
        "Content-Type": "application/json; charset=utf-8"
      });
      return;
    }

    const xml = await response.text();
    send(res, 200, xml, { "Content-Type": "application/xml; charset=utf-8" });
  } catch (err) {
    send(res, 502, JSON.stringify({ error: err.message }), {
      "Content-Type": "application/json; charset=utf-8"
    });
  }
}

async function proxyNewsFeed(url, res) {
  return proxyGoogleFeed(url, "https://news.google.com/rss/", res);
}

async function proxyTrendsFeed(geo, res) {
  const normalizedGeo = String(geo || "US").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedGeo)) {
    send(res, 400, JSON.stringify({ error: "Invalid geo" }), {
      "Content-Type": "application/json; charset=utf-8"
    });
    return;
  }

  const requestGeo = TREND_GEO_ALIASES[normalizedGeo] || normalizedGeo;
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(requestGeo)}`;
  return proxyGoogleFeed(url, "https://trends.google.com/trending/rss?", res);
}

http
  .createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }

    if (requestUrl.pathname === "/api/feed") {
      proxyNewsFeed(requestUrl.searchParams.get("url"), res);
      return;
    }

    if (requestUrl.pathname === "/api/trends") {
      proxyTrendsFeed(requestUrl.searchParams.get("geo"), res);
      return;
    }

    let filePath = path.join(ROOT, requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname);
    filePath = path.normalize(filePath);

    if (!filePath.startsWith(ROOT)) {
      send(res, 403, "Forbidden");
      return;
    }

    const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(ROOT, "index.html");
    serveFile(res, finalPath);
  })
  .listen(PORT, () => {
    console.log(`Lastminute running at http://localhost:${PORT}`);
  });
