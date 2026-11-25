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

## Data (`data.js`)

`data.js` is generated - do not edit it by hand. One command does the whole
quarterly refresh (unlock the new workbook, export the data sheet, rebuild
`data.js`):

```
python refresh.py
```

It picks the newest release folder under `Source/` and prints what it changed.
Requires Python 3.9+ and `openpyxl` (`pip install openpyxl`); reading the
workbook itself uses the standard library only.

### Quarterly checklist

1. Create `Source/<MM.YYYY>/` (e.g. `Source/07.2026/`) and drop the new
   `Panasonic ... .xlsm` in it. Nothing else has to be renamed - the release
   label comes from the folder name (`Source/04.2026/` → 04.2026).
2. Run `python refresh.py --dry-run` first. It writes nothing and reports the
   picked file and release, the columns that were added/removed/renamed, the
   part numbers that came or went, the per-column differences against the
   current `data.js`, and the vibration coverage.
3. Run `python refresh.py`. It writes:

   | File | Content |
   | --- | --- |
   | `Source/<MM.YYYY>/PCC_unlocked.xlsm` | VBA password flag bypassed, `All Data`, `Utility`, `計算sheet`, `Wav` unhidden - see that folder's `unlock_instructions.md`. |
   | `Inductor all data.xlsx` | Values-only snapshot of the `All Data` sheet (header row 10, columns A...CC). Formulas, the `IMAGE()` helpers (`#NAME?`), the table and the external link are dropped; engineer comments are re-anchored by part number **and** header label; formatting and widths are copied by header label, so a column inserted by Panasonic cannot shift every number format by one. |
   | `data.js` | Built from that snapshot, with the vibration ratings merged in and the Series/Feature pair normalised onto the UI schema (see [Column semantics](#column-semantics)). |
   | `source_meta.json` | Release, SHA-256 of every generated file, record count, header labels and the number of fields in `data.js` - used by the drift checks. |

   Numbers stay numbers (so Excel can sort and filter them). A cached formula
   result whose full 17-digit precision would not survive a numeric cell is
   kept as text instead, so the snapshot never rounds a value; Excel marks those
   few cells as "number stored as text".

4. Read the build log. `WARNING:` lines flag a changed layout (missing required
   column, added/removed column, suspicious record-count jump), a comment that
   could not be re-anchored, or a series missing from `vibration.json` (a
   paste-ready stub is printed). `Cleaned:` lines list cells that were dropped
   because they cannot be data (a temperature range pasted into a voltage or
   current column). The `Records:` line shows the part-number delta.
5. Review `git diff --stat data.js`, add the part numbers the dry run reported to
   [Part numbers by release](#part-numbers-by-release), and commit.

Options:

```
python refresh.py --dry-run       # report what would change, write nothing
python refresh.py --list          # releases found under Source/, newest first
python refresh.py --xlsm <file>   # import one specific workbook
python refresh.py --build-only    # rebuild data.js from Inductor all data.xlsx
python refresh.py --verify        # fail if a generated file changed since the build
```

`build_data.py` was replaced by `refresh.py` - same parsing code, one entry
point - so a workbook that used to be imported with `python build_data.py` is
now imported with `python refresh.py`.

### Column semantics

The selector reads two fields whose meaning comes from the *app*, not from
Panasonic's header text:

| `data.js` field | Meaning | 04.2026 column | 11.2026 column |
| --- | --- | --- | --- |
| `Series` | series code, e.g. `5M-YLC` | `Series` | `Series (Util)` |
| `Feature` | family text, e.g. `M (High Isat)` | `Feature` | `Series` |

In 11.2026 Panasonic moved the family text into `Series`, emptied `Feature` and
added `Series (Util)` for the code. `refresh.py` folds both spellings back into
the original pair with `normalize_records()`, so `app.js` needs no change and the
selector's fields keep their meaning from release to release. The family *names*
themselves are Panasonic's wording and are shown as published
(`High Isat (Standard)` → `M (High Isat)`, `LP (Low Profile)` →
`LP (Low Cost Low Profile)`, `High Frequency` → `H (High Freq Low Loss)`, ...).
The xlsx export keeps the workbook's own columns; only `data.js` is normalised,
and `source_meta.json` records the workbook headers plus the resulting
`app_columns` count.


### Vibration rating

The workbook has a `Vibration` column, but it holds no usable ratings (mostly
empty, and in 11.2026 a temperature range was pasted into the neighbouring
`Max Voltage (V)` / `L1 (uH)` cells of 15 rows). The build drops such impossible
values, and the **Vibration** column in the results table (after *Temp Range*,
unit `G`) is filled from the datasheets instead:

- Values live in [`datasheet/vibration.json`](datasheet/vibration.json), keyed by
  `Series (Size)`, and are read from the `Vibration resistance (G)` column of the
  tables in `datasheet/markdown-export/*.md` (the PDFs are the original source).
- `"g": null` means no published rating yet (shown as `—`): `PCC-D1413H` has no
  datasheet, the C67-HF datasheet (`PCC-M0530M-H`, `PCC-M0630M-H`) has no
  vibration column, and the 15 *High Performance* rows have no `Series (Size)`
  and stay empty.
- `"source"` names the markdown export the value came from. The build checks that
  every rated part number is listed in that file and warns on drift, so the map
  cannot silently disagree with the datasheets.
- `"alias_of"` documents workbook typos: `PCC-M078M-LE` is `PCC-M0748M-LE`
  (3 rows), so those parts get the same 5 G rating.
- Ratings are per PCC-M type, not per part number - every part of a type shares
  the value printed in its datasheet.

To add or correct a rating, edit `vibration.json` and rerun
`python refresh.py --build-only` (or just `python refresh.py`). The values are
embedded into `data.js`, so the app still works when opened directly from disk
(`file://`) - no runtime fetch of the JSON.

Current coverage (release 11.2026): **152 / 171 records rated** (5-50 G), 19
unrated - 4 rows of unrated series plus the 15 *High Performance* rows without a
`Series (Size)`. One known gap: `ETQP4MR19KLC` (`PCC-M1040ML`) is rated from the
`AGL0000C59-M.md` table but the part number itself is not listed in that markdown
export, so the build prints it as `not listed in its source markdown`.

### Part numbers by release

`python refresh.py --dry-run` prints `PN added (N): ...` / `PN removed (N): ...`
followed by the per-column differences, so the table below can be updated before
the workbook is committed.

| Release | Records | Added | Removed / renamed |
| --- | --- | --- | --- |
| 11.2026 | 171 | `ETQP4M5R6KFN`, `ETQP3M5R6KVP`, `ETQP5M4R7TTM`, `ETQP4MR19KLC` | none |

The four parts added in 11.2026:

| Part number | Series (Size) | Note |
| --- | --- | --- |
| `ETQP4M5R6KFN` | `PCC-M0648M-LE` | new row |
| `ETQP3M5R6KVP` | `PCC-M0530M-LP` | new row |
| `ETQP5M4R7TTM` | `PCC-M0754MS` | the `PCC-M0754MS` datasheet type already existed, the workbook had no row for it |
| `ETQP4MR19KLC` | `PCC-M1040ML` | new row; the part number is missing from `AGL0000C59-M.md` (see above) |

No part number was removed or renamed between 04.2026 and 11.2026, and the 167
parts present in both releases keep identical L, tolerance, DCR, size, temperature
range, Isat, Irms, AEC-Q200 and datasheet URL values - the only value change is
the `Image URL` of 6 parts, which was empty and is now filled. The `data.js` diff
for 11.2026 is therefore those 4 added records, the column renames and relabelled
family names described in [Column semantics](#column-semantics), and the helper
columns Panasonic recalculated.

### Stock check

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

### Simple Mode (main results table)
- **Sidebar toggle**: The **Simple mode** switch next to the Filters header hides the Tol, Method A, Isat ΔL -20% and DCR Max columns
- **Matching filters**: The Tolerance, Method A and ΔL -20% filter widgets are hidden too; inside the DCR combo only the DCR Max block is hidden (DCR Typ stays available)
- **Filter state**: Turning Simple mode on clears any active values for those hidden filters, so the table is never constrained by an invisible filter
- **Method B header**: The column sub-header changes from `Method B A` to `A` while Simple mode is on
- **Method B filter caption**: The filter label and its active-filter chip shorten from `I (⊿T=40℃) Method B (A)` to `I (⊿T=40℃) (A)`
- **Persistence**: The setting is stored in `localStorage` (`pcc_simpleMode`) and restored on reload
- **Scope**: Only the main results table and filter sidebar are affected; the export window keeps all columns

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
