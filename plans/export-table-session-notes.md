# Export Table Session Notes

## Scope

The original export table's columns, headers, values, cell styling, and manual Outlook copy/paste behavior were kept intact. Changes are limited to controls around the table and export-row interactions.

## Implemented

- Replaced the native HTML drag/drop behavior with pointer-based reordering from a dedicated left-side rail.
- Kept table cells selectable with the mouse; dragging starts only from the external reorder handle.
- Added a visible drop indicator during reordering.
- Added an external remove action for every export row, including Panasonic and competitor rows.
  - Removal applies only to the open export window and does not delete source data or alter the main selector's selected products.
  - The remove control sits in a dedicated right-side rail, outside the table and its Remarks column.
- Preserved competitor-cell and Remarks edits in the row model when export rows are reordered or redrawn.
- Kept the summary aligned with the main export table after the added control rails.
- Added touch-sized drag and remove controls for small screens and coarse pointers.
- Added `Copy Table for Outlook`, which copies the visible comparison table as clean HTML plus a plain-text fallback. Control rails are excluded from the copied table.

## Explicitly Excluded

The proposed competitor-PN autocomplete/type-ahead was removed. It is not part of this change set and should be implemented separately with direct export-window testing.

## Validation

- `git diff --check` passes.
- A clean local load shows 150 selector results and all 3 filter groups.
