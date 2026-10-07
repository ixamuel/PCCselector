# Inductor Selection Tool v2.6a

This is the standalone version of the Inductor Selection Tool.

## Deployment

### GitHub
1. Create a new repository on GitHub.
2. Push the contents of this folder to the repository.

### Vercel
1. Connect your GitHub repository to Vercel.
2. Vercel will automatically detect the `index.html` and deploy it as a static site.
3. No build command is required.
4. The `api/` folder is deployed as Serverless Functions. `api/stock.js` powers the
export window's distributor stock check (see below). It is optional - the app
works without it, but the stock check needs it to be deployed.

## Distributor Stock Check

Stock check is available in two places, both served by the same `/api/stock`
proxy:

1. **Main page** - a **Stock Check** button in the selection bar (right after
   *Farnell*). It checks the **currently selected** part numbers and opens a
   results dialog (with a region selector and Refresh).
2. **Export window** - a **Distributor stock** control in the toolbar. It checks
   every part number in the exported table (competitor rows included).

Both show a **matrix table**: one row per part number, one column per distributor
(Farnell, Arrow, Avnet, Future, TTI, Rutronik, Gudeco, Schukat, TME, RS, Mouser,
DigiKey, then any others), a **Total &lt;region&gt; Stock** column, and a small
"EU stock checked: DD.MM.YYYY" line above it. Clicking a quantity opens that
distributor's purchase page.

Duplicate listings from the same distributor are merged (the largest quantity is
kept), so each seller appears once per part, and the Total is the sum of those
per-distributor figures.

> **Reusing this in another selection tool?** See
> [`STOCK-CHECK-PLAYBOOK.md`](STOCK-CHECK-PLAYBOOK.md) - it documents how Panasonic's
> stock check works, every gotcha we hit, and a single copy-paste prompt. The API proxy
> is product-agnostic, so only the part-number source changes.

**Why a proxy is needed:** Panasonic's stock search
(`industrial.panasonic.com/ww/stock-search`) is a Drupal form whose results load
from an AJAX endpoint that sends **no CORS headers**, so the browser cannot call
it directly, and the page cannot be embedded in an iframe. The app therefore
ships a small same-origin serverless proxy:

- `api/stock.js` - a Vercel Function implementing the two-step flow (GET the page
  for a `form_build_id` token, then POST the AJAX endpoint) and returning
  normalised JSON.

Call it directly:

```
GET /api/stock?location=Europe&type=1&pn=ETQP3MR47KVP&pn=ETQP5MR33YLC
```

`location`: `Asia` | `Europe` | `North America`.
`type`: `1` = Exact, `2` = Begins With, `3` = Contains.

Requirements & caveats:
- **Deployment:** the stock check only works on the deployed site (Vercel), where
  `/api/stock` exists. Opened locally via `file://` it shows a friendly
  "unavailable here" message instead.
- **Coverage:** Panasonic's tool does not list every series - many automotive
  inductors (e.g. `ETQP...`) report "Inventory is not found".
- **Bot protection:** Panasonic sits behind Akamai, which rejects requests that
  carry **no** `User-Agent` (Vercel's `fetch` sends none by default) and also
  blocks unknown agent names such as `node`/`undici`. Allow-listed identifiers
  (curl, Wget, python-requests, axios) pass, so the proxy sends a plain
  curl-style `User-Agent` on both upstream requests. Do **not** switch it to a
  browser UA - Akamai blocks browser UAs whose TLS fingerprint does not match.
- Please respect Panasonic's Terms of Use when using this feature.

## Recent Updates (v2.7)

### Export Table Enhancement
- **Added summary table**: When exporting selected inductors, a second summary table now appears below the main table
- **Condensed format**: Each part number shows a concise description with key specifications
- **Format example**: `PCC, SMD, 0.33µH, ±20%, Irms 39.7A, Isat 56.7A, R: 1.1mΩ, 10.9 x 10 x 5mm, -40~150°C, High Isat (Standard), AECQ-200`

### Formatting Improvements
1. **Temperature display**: `-40~150°C` (clean format without `+` sign)
2. **Tolerance positioning**: `±20%` directly after inductance value
3. **Dimension formatting**: Decimal period instead of comma (`10.9 x 10 x 5mm`)
4. **Logical ordering**: Dimensions appear before temperature range, AECQ-200 at the end
5. **Symbol cleaning**: Removed square symbol `□` from "High Current (≥12)" feature display

### Toggle Controls (v2.8)
- **Basic info toggle**: Show/hide PCC, SMD, ±20%, AECQ-200 in descriptions (default: OFF)
- **Remarks column toggle**: Show/hide the entire Remarks column (default: OFF)
- **Independent operation**: Both toggles work independently without affecting each other
- **Data preservation**: Remarks are preserved when toggling between states

### Editable Remarks Cells
- **Contenteditable cells**: Remarks column uses `contenteditable="true"` cells instead of input fields
- **Easy copying**: Users can select and copy text directly from cells (compatible with Outlook)
- **Visual feedback**: Cells have focus styling and placeholder text when empty
- **Data persistence**: Remarks are saved when toggling basic info or hiding/showing the column

### Technical Changes
- Modified `openExportTable()` function in [`app.js`](app.js:1500-1700) to generate summary data with toggle controls
- Added helper functions: `formatTemperature()`, `formatDimensions()`, `formatSummaryDesc()`
- Updated `displayCategoryValue()` to clean square symbols from categorical displays
- Enhanced CSS styling for summary table, toggle switches, and editable cells
- JavaScript handles toggle state changes and data preservation

### Usage
1. Select one or more part numbers using the checkboxes
2. Click "Export Table" button in the selection panel
3. A new tab opens with:
   - Main detailed table (unchanged)
   - Part Number Summary table with condensed descriptions
   - Two toggle controls above the summary table
4. Use toggles to:
   - Show/hide basic info (PCC, SMD, ±20%, AECQ-200)
   - Show/hide the Remarks column
5. Enter remarks directly in the editable cells (click to edit, select to copy)

All existing functionality remains unchanged, including the "Copy to Clipboard" feature for TSV data.
