/**
 * Panasonic distributor stock check — Vercel serverless proxy.
 *
 * Panasonic's stock search (https://industrial.panasonic.com/ww/stock-search)
 * is a Drupal form whose results are fetched from an AJAX endpoint that sends
 * no CORS headers, so the static export window cannot call it directly.
 * This function performs the two-step flow server-side and returns JSON.
 *
 *   1. GET  /ww/stock-search                -> scrape `form_build_id`
 *   2. POST /ww/stock-search/ajax?_wrapper_format=drupal_ajax
 *
 * Notes:
 *  - No session cookie is required; a token from a fresh GET is enough.
 *  - Panasonic sits behind Akamai, which blocks requests that spoof a browser
 *    User-Agent from a non-browser client. We therefore send NO browser-style
 *    User-Agent (plain requests are accepted).
 *
 * Usage: GET /api/stock?location=Europe&type=1&pn=ETQP3MR47KVP&pn=ETQP5MR33YLC
 *   location: Asia | Europe | North America   (default Europe)
 *   type:     1 = Exact | 2 = Begins With | 3 = Contains   (default 1)
 */

const ORIGIN = "https://industrial.panasonic.com";
const SEARCH_PAGE = ORIGIN + "/ww/stock-search";
const AJAX_URL = ORIGIN + "/ww/stock-search/ajax?_wrapper_format=drupal_ajax";

const MAX_PARTS = 25;
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 7000;

// Panasonic sits behind Akamai, which rejects requests that arrive with no
// User-Agent (Vercel's fetch/undici sends none by default) and also rejects
// non-allow-listed agent names such as "node"/"undici". Verified allow-listed
// identifiers include curl, Wget and python-requests, so we send a plain
// curl-style UA. Do NOT spoof a browser UA: Akamai blocks those when the TLS
// fingerprint does not match the claimed browser.
const REQUEST_HEADERS = {
  "User-Agent": "curl/8.4.0",
  "Accept-Language": "en-US,en;q=0.9"
};

const ALLOWED_LOCATIONS = ["Asia", "Europe", "North America"];
const ALLOWED_TYPES = ["1", "2", "3"];

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'");
}

function toText(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// Prefer the value inside .tablesaw-cell-content (the cell also contains a
// duplicate mobile label such as "Stock").
function cellText(html) {
  const match = /class="tablesaw-cell-content"[^>]*>([\s\S]*?)<\/span>/i.exec(html);
  return toText(match ? match[1] : html);
}

function firstHref(html) {
  const match = /href="([^"]+)"/i.exec(html);
  return match ? decodeEntities(match[1]) : null;
}

function parseResults(dataHtml) {
  const noStock = /inv-search-no-stock/.test(dataHtml);
  const rows = [];
  const tbody = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(dataHtml);

  if (tbody) {
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(tbody[1])) !== null) {
      const cells = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let td;
      while ((td = tdRe.exec(tr[1])) !== null) cells.push(td[1]);
      if (cells.length < 5) continue;

      rows.push({
        partNumber: cellText(cells[0]),
        stock: cellText(cells[1]),
        buyUrl: firstHref(cells[2]),
        distributor: cellText(cells[3]),
        location: cellText(cells[4]),
        date: cells[5] ? cellText(cells[5]) : "",
        detailsUrl: cells[6] ? firstHref(cells[6]) : null
      });
    }
  }

  return {
    status: noStock ? "Inventory is not found." : "Search completed.",
    found: rows.length > 0,
    rows
  };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function getFormBuildId() {
  const response = await fetchWithTimeout(SEARCH_PAGE, {
    headers: Object.assign({ Accept: "text/html" }, REQUEST_HEADERS)
  });
  if (!response.ok) throw new Error("Stock page returned HTTP " + response.status);

  const html = await response.text();
  const match = /name="form_build_id" value="([^"]+)"/.exec(html);
  if (!match) throw new Error("Could not read the stock-search form token.");
  return match[1];
}

async function queryPart(partNumber, buildId, location, type) {
  const body = new URLSearchParams({
    model: partNumber,
    type: type,
    location: location,
    form_build_id: buildId,
    form_id: "stock_search_conditions_form",
    _triggering_element_name: "btn_stock_search",
    _triggering_element_value: "Stock Check"
  });

  const response = await fetchWithTimeout(AJAX_URL, {
    method: "POST",
    headers: Object.assign({
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json"
    }, REQUEST_HEADERS),
    body: body.toString()
  });

  if (!response.ok) {
    return { partNumber, found: false, error: "HTTP " + response.status, rows: [] };
  }

  const text = await response.text();
  let commands;
  try {
    commands = JSON.parse(text);
  } catch (err) {
    return { partNumber, found: false, error: "Unexpected response from Panasonic.", rows: [] };
  }

  const command = Array.isArray(commands)
    ? commands.find((entry) => entry && entry.selector === "#stock-search-results")
    : null;

  if (!command || typeof command.data !== "string") {
    return { partNumber, found: false, error: "No stock results returned.", rows: [] };
  }

  const parsed = parseResults(command.data);
  return { partNumber, found: parsed.found, status: parsed.status, rows: parsed.rows };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const rawPns = req.query.pn;
  const requested = (Array.isArray(rawPns) ? rawPns : rawPns ? [rawPns] : [])
    .map((value) => String(value).trim())
    .filter(Boolean);

  const parts = Array.from(new Set(requested)).slice(0, MAX_PARTS);

  if (parts.length === 0) {
    res.status(400).json({ error: "Provide at least one part number via ?pn=." });
    return;
  }

  const location = ALLOWED_LOCATIONS.includes(req.query.location) ? req.query.location : "Europe";
  const type = ALLOWED_TYPES.includes(String(req.query.type)) ? String(req.query.type) : "1";

  try {
    const buildId = await getFormBuildId();
    const results = {};
    const queue = parts.slice();

    const worker = async () => {
      while (queue.length > 0) {
        const partNumber = queue.shift();
        try {
          results[partNumber] = await queryPart(partNumber, buildId, location, type);
        } catch (err) {
          results[partNumber] = {
            partNumber,
            found: false,
            error: err && err.name === "AbortError" ? "Request timed out." : (err && err.message) || "Request failed.",
            rows: []
          };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, parts.length) }, () => worker())
    );

    // Cache at the edge so repeated checks stay light on Panasonic.
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ location, type, results });
  } catch (err) {
    const code = (err && err.cause && err.cause.code) || (err && err.code) || null;
    res.status(502).json({
      error: (err && err.message) || "Stock check failed.",
      code,
      step: "upstream",
      hint:
        "The proxy could not reach Panasonic's stock page. " +
        "A 403/timeout usually means the request was blocked upstream."
    });
  }
};
