const VALID_PREFIX = "https://trends.google.com/trending/rss?";
const TREND_GEO_ALIASES = {
  CN: "HK"
};

exports.handler = async (event) => {
  const geo = String(event.queryStringParameters?.geo || "US").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(geo)) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ error: "Invalid geo" })
    };
  }

  const requestGeo = TREND_GEO_ALIASES[geo] || geo;
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(requestGeo)}`;

  if (!url.startsWith(VALID_PREFIX)) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ error: "Invalid feed url" })
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        },
        body: JSON.stringify({ error: `Upstream ${response.status}` })
      };
    }

    const xml = await response.text();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: xml
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
