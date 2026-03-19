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
