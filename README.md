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

### Technical Changes
- Modified `openExportTable()` function in [`app.js`](app.js:1500-1565) to generate summary data
- Added helper functions: `formatTemperature()`, `formatDimensions()`, `formatSummaryDesc()`
- Updated `displayCategoryValue()` to clean square symbols from categorical displays
- Enhanced CSS styling for summary table differentiation

### Usage
1. Select one or more part numbers using the checkboxes
2. Click "Export Table" button in the selection panel
3. A new tab opens with:
   - Main detailed table (unchanged)
   - Part Number Summary table with condensed descriptions

All existing functionality remains unchanged, including the "Copy to Clipboard" feature for TSV data.
