#!/usr/bin/env python3
"""One command to refresh the selector data from a new Panasonic workbook.

    python refresh.py                # newest Source/<MM.YYYY>/*.xls[mx] -> xlsx -> data.js
    python refresh.py --dry-run      # show what would change, write nothing
    python refresh.py --list         # show the discovered workbooks
    python refresh.py --xlsm FILE    # pin one workbook
    python refresh.py --build-only   # rebuild data.js from "Inductor all data.xlsx"
    python refresh.py --verify       # fail if data.js / source_meta.json are stale

Each quarter: drop the new workbook into ``Source/<MM.YYYY>/`` and run the first
command.  The pipeline

1. discovers the newest release folder (``MM.YYYY``, legacy ``Feb2026`` names are
   still understood),
2. unlocks it into ``Source/<MM.YYYY>/PCC_unlocked.xlsm`` (VBA password flag and
   the ``veryHidden`` sheet states; every other zip part is copied untouched),
3. exports the ``All Data`` sheet into ``Inductor all data.xlsx`` (values
   snapshot: header/labels/widths/formats from the previous file, engineer
   comments re-anchored by part number, cached formula errors blanked),
4. writes ``data.js`` with the datasheet vibration ratings and
   ``source_meta.json`` describing exactly what was built.

The xlsx export keeps Panasonic's own column names; ``data.js`` is normalised
onto the UI schema (``Series`` = series code, ``Feature`` = family text) so a
renamed column cannot change the selector's fields behind our back.

Stdlib plus openpyxl (only needed for the xlsx export).
"""
import argparse
import hashlib
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from copy import copy
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import vibration

ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "Source"
WORKBOOK_PATH = ROOT / "Inductor all data.xlsx"
DATA_JS_PATH = ROOT / "data.js"
META_PATH = ROOT / "source_meta.json"
SHEET_NAME = "All Data"
UNLOCKED_NAME = "PCC_unlocked.xlsm"

NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"

# Columns the UI (and the vibration merge) depend on.  A release that drops one
# of these is a layout change we must look at, not something to paper over.
REQUIRED_HEADERS = [
    "Part Number",
    "Series",
    "Series (Size)",
    "Feature",
    "Lo (uH)",
    "Lo Tol. (%)",
    "DCR Typ (mOhm)",
    "DCR Max (mOhm)",
    "Method B (A typ at 40℃)",
    "Method A (A typ at 40℃)",
    "⊿L=-30% typ (A)",
    "⊿L=-20% typ (A)",
    "Ir (A)",
    "L (mm)",
    "W (mm)",
    "Max Height (mm)",
    "Min Temp (deg.C)",
    "Max Temp (deg.C)",
    "Temp Range (deg.C)",
    "Status",
    "MPQ",
    "URL",
]

# Formula results Excel caches in the sheet; they are not data.
ERROR_TEXTS = {"#NAME?", "#VALUE!", "#N/A", "#REF!", "#DIV/0!", "#NUM!", "#NULL!"}

# The hand-maintained "High Performance" rows leak a temperature range into the
# neighbouring columns (MPQ, L1, Max Voltage ...) - "-40 to +130" is not a
# voltage.  Columns that are allowed to hold a range are listed below; the
# Vibration column is left alone because vibration.py replaces its raw values.
MISPLACED_RANGE = re.compile(r"[+-]?\d+\s*(?:to|~|～)\s*[+-]?\d+\s*°?C?", re.IGNORECASE)
RANGE_COLUMNS = {"Temp Range (deg.C)", "Vibration"}

# 11.2026 split the old Series / Feature pair: the family text moved into
# "Series", the code into a new "Series (Util)" column, and "Feature" was left
# empty.  The UI schema is kept stable by normalising it back (see
# normalize_records); the workbook export keeps Panasonic's own columns.
SERIES_CODE_HEADER = "Series (Util)"

MONTH_NAMES = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Matched against the end of the folder/file stem, most specific first:
# 04.2026, Apr2026 / Feb2026, 2026-04, 2026_04, 202604
RELEASE_PATTERNS = [
    re.compile(r"(?<![0-9])(?P<month>\d{1,2})\.(?P<year>\d{4})$"),
    re.compile(r"(?P<mon>[A-Za-z]{3})[ _.-]?(?P<year>\d{4})$"),
    re.compile(r"(?P<year>\d{4})[-_](?P<month>\d{1,2})$"),
    re.compile(r"(?P<year>\d{4})(?P<month>\d{2})$"),
]


class RefreshError(SystemExit):
    """A problem the operator has to fix before the data can be rebuilt."""


# --------------------------------------------------------------------------- #
# release discovery
# --------------------------------------------------------------------------- #
def parse_release(text: str) -> Optional[Tuple[int, int]]:
    """Returns (year, month) for a release label such as ``04.2026``."""
    label = text.strip()
    for pattern in RELEASE_PATTERNS:
        match = pattern.search(label)
        if not match:
            continue
        groups = match.groupdict()
        if groups.get("mon"):
            month = MONTH_NAMES.get(groups["mon"].lower())
        else:
            month = int(groups["month"])
        year = int(groups["year"])
        if month and 1 <= month <= 12 and 1990 <= year <= 2100:
            return year, month
    return None


def release_label(year: int, month: int) -> str:
    return f"{month:02d}.{year}"


def discover_sources() -> List[Dict[str, Any]]:
    """Lists every candidate workbook under Source/, newest release first."""
    found: List[Dict[str, Any]] = []
    if not SOURCE_DIR.is_dir():
        return found
    for path in SOURCE_DIR.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in (".xlsm", ".xlsx"):
            continue
        if path.name.startswith("~$") or "unlocked" in path.name.lower():
            continue
        release = parse_release(path.parent.name) or parse_release(path.stem)
        found.append(
            {
                "path": path,
                "release": release,
                "label": release_label(*release) if release else None,
                "mtime": path.stat().st_mtime,
                "size": path.stat().st_size,
            }
        )
    found.sort(key=lambda item: (item["release"] or (0, 0), item["mtime"]), reverse=True)
    return found


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)



# --------------------------------------------------------------------------- #
# unlocking
# --------------------------------------------------------------------------- #
def sheet_states(workbook_xml: bytes) -> List[Tuple[str, str]]:
    root = ET.fromstring(workbook_xml)
    return [
        (sheet.attrib.get("name", "?"), sheet.attrib.get("state", ""))
        for sheet in root.findall("main:sheets/main:sheet", NS)
    ]


def unlock_workbook(src: Path, dst: Path) -> Dict[str, Any]:
    """Patches the VBA project flag and the hidden sheet states into a copy."""
    vba_patched = False
    with zipfile.ZipFile(src) as zin:
        infos = zin.infolist()
        contents: Dict[str, bytes] = {info.filename: zin.read(info.filename) for info in infos}

    vba = contents.get("xl/vbaProject.bin")
    if vba and b"DPB=" in vba:
        contents["xl/vbaProject.bin"] = vba.replace(b"DPB=", b"DPx=")
        vba_patched = True

    workbook_xml = contents.get("xl/workbook.xml")
    if workbook_xml is None:
        raise RefreshError(f"{src.name}: no xl/workbook.xml - not an Excel workbook?")
    unhidden = [name for name, state in sheet_states(workbook_xml) if state]
    if unhidden:
        # Attribute-only rewrite keeps the rest of the part byte-identical.
        contents["xl/workbook.xml"] = re.sub(rb'\s+state="[^"]*"', b"", workbook_xml)

    dst.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in infos:
            new_info = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            new_info.compress_type = zipfile.ZIP_DEFLATED
            new_info.external_attr = info.external_attr
            zout.writestr(new_info, contents[info.filename])

    return {
        "vba_patched": vba_patched,
        "unhidden": unhidden,
        "already_unlocked": not vba_patched and not unhidden,
    }


# --------------------------------------------------------------------------- #
# reading the workbook (stdlib, no openpyxl)
# --------------------------------------------------------------------------- #
def get_shared_strings(z: zipfile.ZipFile) -> List[str]:
    """Cell text only - phonetic runs (<rPh>, the furigana guides) are skipped.

    Reading them would glue the guide text onto the value ("カタログ追加ツイカ").
    """
    try:
        data = z.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(data)
    tag = "{" + NS["main"] + "}"
    strings: List[str] = []
    for si in root.findall("main:si", NS):
        texts: List[str] = []
        for child in si:
            if child.tag == tag + "t":
                texts.append(child.text or "")
            elif child.tag == tag + "r":
                texts.extend(node.text or "" for node in child.findall("main:t", NS))
        strings.append("".join(texts))
    return strings


def get_sheet_paths(z: zipfile.ZipFile) -> List[Tuple[str, str]]:
    root = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall(PKG_REL)}
    sheets: List[Tuple[str, str]] = []
    for sheet in root.findall("main:sheets/main:sheet", NS):
        target = rid_to_target.get(sheet.attrib.get(REL_ID))
        if not target:
            continue
        if target.startswith("/"):
            target = target.lstrip("/")
        elif not target.startswith("xl/"):
            target = "xl/" + target
        sheets.append((sheet.attrib.get("name", ""), target))
    return sheets


def col_index(col: str) -> int:
    idx = 0
    for ch in col:
        if not ch.isalpha():
            break
        idx = idx * 26 + (ord(ch.upper()) - 64)
    return idx - 1


def parse_sheet(
    z: zipfile.ZipFile, sheet_path: str, shared: List[str]
) -> List[Dict[int, Tuple[str, str]]]:
    """Rows by 0-based index, cells as (kind, text) with kind = n/s/str/b/e."""
    root = ET.fromstring(z.read(sheet_path))
    rows: Dict[int, Dict[int, Tuple[str, str]]] = {}
    for row in root.findall("main:sheetData/main:row", NS):
        row_no = int(row.attrib.get("r", len(rows) + 1)) - 1
        cells: Dict[int, Tuple[str, str]] = {}
        for cell in row.findall("main:c", NS):
            ref = cell.attrib.get("r")
            if not ref:
                continue
            idx = col_index("".join(ch for ch in ref if ch.isalpha()))
            kind = cell.attrib.get("t", "n")
            value_el = cell.find("main:v", NS)
            text = value_el.text if value_el is not None and value_el.text is not None else ""
            if kind == "s":
                try:
                    text = shared[int(text)]
                except (ValueError, IndexError):
                    text = ""
            elif kind == "inlineStr":
                texts = [node.text or "" for node in cell.findall("main:is/main:t", NS)]
                texts += [node.text or "" for node in cell.findall("main:is/main:r/main:t", NS)]
                text = "".join(texts)
            cells[idx] = (kind, text)
        rows[row_no] = cells
    if not rows:
        return []
    return [rows.get(i, {}) for i in range(max(rows) + 1)]


def clean_cell(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).replace("\n", " ").split())


def find_header_row(rows: List[Dict[int, Tuple[str, str]]]) -> Optional[int]:
    header_index = None
    best = -1
    for index, row in enumerate(rows):
        cleaned = [clean_cell(cell[1]) for cell in row.values()]
        if "Part Number" not in cleaned:
            continue
        non_empty = sum(1 for name in cleaned if name)
        if non_empty > best:
            best, header_index = non_empty, index
    return header_index


def read_all_data(path: Path) -> Dict[str, Any]:
    """Returns sheet name, header row, header labels and the raw cell rows."""
    with zipfile.ZipFile(path) as z:
        sheets = get_sheet_paths(z)
        if not sheets:
            raise RefreshError(f"{path.name}: no worksheets found")
        shared = get_shared_strings(z)
        target = next((item for item in sheets if item[0] == SHEET_NAME), None)
        rows: List[Dict[int, Tuple[str, str]]] = []
        if target is not None:
            rows = parse_sheet(z, target[1], shared)
        else:
            # Layout fallback: the sheet whose top rows mention Part Number.
            for name, sheet_path in sheets:
                candidate = parse_sheet(z, sheet_path, shared)
                if find_header_row(candidate[:40]) is not None:
                    print(f"WARNING: sheet {SHEET_NAME!r} not found, using {name!r}")
                    target, rows = (name, sheet_path), candidate
                    break
        if target is None:
            raise RefreshError(f"{path.name}: no sheet with a 'Part Number' header")

    header_index = find_header_row(rows)
    if header_index is None:
        raise RefreshError(f"{path.name}: header row with 'Part Number' not found")
    header_row = rows[header_index]
    # Data can extend past the last labelled header (the workbook keeps helper
    # columns to the right), so the width comes from every row.
    last_col = max(header_row) if header_row else -1
    for row in rows[header_index + 1 :]:
        if row:
            last_col = max(last_col, max(row))
    columns = last_col + 1
    headers = [clean_cell(header_row.get(col, ("", ""))[1]) for col in range(columns)]
    return {
        "sheet": target[0],
        "header_index": header_index,
        "header_row_no": header_index + 1,
        "headers": headers,
        "rows": rows,
        "columns": columns,
    }


# --------------------------------------------------------------------------- #
# records + layout checks
# --------------------------------------------------------------------------- #
def is_misplaced_range(header: str, text: str) -> bool:
    """True when ``text`` is a temperature range in a column that cannot hold one."""
    if not text or header in RANGE_COLUMNS:
        return False
    return bool(MISPLACED_RANGE.fullmatch(text))


def build_records(
    data: Dict[str, Any], report: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """Turns the raw sheet rows into the objects written to data.js.

    ``report`` collects a note for every cell that had to be dropped; pass a
    list to have them printed by the caller.
    """
    headers: List[str] = data["headers"]
    records: List[Dict[str, Any]] = []
    for row in data["rows"][data["header_index"] + 1 :]:
        record: Dict[str, Any] = {}
        cleaned_away: List[str] = []
        for idx, header in enumerate(headers):
            if not header:
                continue
            cell = row.get(idx)
            if cell is None:
                record[header] = None
                continue
            kind, text = cell
            if kind == "e" or text.strip() in ERROR_TEXTS:
                record[header] = None
                continue
            cleaned = text.strip()
            if is_misplaced_range(header, cleaned):
                # Junk pasted one column off in the workbook - better blank than
                # showing "-40 to +130" as a voltage or a current.
                record[header] = None
                cleaned_away.append(f"{header} = {cleaned!r}")
                continue
            record[header] = cleaned or None
        part = record.get("Part Number")
        if part and part != "Part Number":
            records.append(record)
            if report is not None:
                report.extend(f"{part} / {note}" for note in cleaned_away)
    return records


def normalize_records(
    records: List[Dict[str, Any]], report: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """Puts a release's columns back onto the schema the UI expects.

    ``Series`` has always been the series code ("5M-YLC") and ``Feature`` the
    family text ("High Isat (Standard)").  11.2026 moved the text into
    ``Series``, emptied ``Feature`` and added ``Series (Util)`` for the code, so
    both spellings fold back into the original pair.  Only data.js is
    normalised - the xlsx export stays a faithful copy of the workbook.
    """
    rewritten = 0
    for record in records:
        previous_series = record.get("Series")
        if record.get(SERIES_CODE_HEADER):
            rewritten += 1
        record["Series"] = record.get(SERIES_CODE_HEADER) or previous_series
        record["Feature"] = record.get("Feature") or previous_series
        record.pop(SERIES_CODE_HEADER, None)

    if report is not None and rewritten:
        report.append(
            f"{SERIES_CODE_HEADER!r} carries the series code and 'Series' the feature "
            f"text - data.js normalised for {rewritten} records"
        )
    return records


def duplicate_headers(headers: List[str]) -> List[str]:
    seen = set()
    dupes: List[str] = []
    for header in headers:
        if not header:
            continue
        if header in seen:
            dupes.append(header)
        seen.add(header)
    return dupes


def compare_headers(headers: List[str], previous: Optional[List[str]]) -> Dict[str, List[str]]:
    if not previous:
        return {"added": [], "removed": []}
    current_set = {name for name in headers if name}
    previous_set = {name for name in previous if name}
    return {
        "added": sorted(current_set - previous_set),
        "removed": sorted(previous_set - current_set),
    }


def check_layout(data: Dict[str, Any], records: List[Dict[str, Any]], meta: Dict[str, Any]) -> None:
    """Fails on an unusable layout and reports what the new release changed."""
    headers: List[str] = data["headers"]
    missing = [name for name in REQUIRED_HEADERS if name not in headers]
    if missing:
        raise RefreshError(
            "workbook layout changed - required column(s) missing: " + ", ".join(missing)
        )

    dupes = duplicate_headers(headers)
    if dupes:
        print(
            "WARNING: duplicate header names (the last column wins in data.js): "
            + ", ".join(sorted(set(dupes)))
        )

    diff = compare_headers(headers, meta.get("headers"))
    for label, names in (("added", diff["added"]), ("removed", diff["removed"])):
        if names:
            print(f"WARNING: columns {label} since {meta.get('release') or 'last build'}: {', '.join(names)}")

    # Series / Feature carry UI meaning, so a rename there is a schema change,
    # not cosmetics: normalize_records() folds the known variants back.
    if SERIES_CODE_HEADER in headers:
        codes = sum(1 for record in records if record.get(SERIES_CODE_HEADER))
        families = sum(1 for record in records if "(" in str(record.get("Series") or ""))
        print(
            f"Layout note: {SERIES_CODE_HEADER!r} carries the series code, 'Series' the "
            f"family text ({families} of {len(records)} rows)"
        )
        if not codes:
            print(f"WARNING: {SERIES_CODE_HEADER!r} is empty - series codes would be lost")
    elif any("(" in str(record.get("Series") or "") for record in records):
        print(
            "WARNING: 'Series' looks like a description but no "
            f"{SERIES_CODE_HEADER!r} column was found - check normalize_records()"
        )

    previous_count = meta.get("records")
    if isinstance(previous_count, int) and previous_count:
        delta = len(records) - previous_count
        if previous_count and abs(delta) > max(5, previous_count // 10):
            print(
                f"WARNING: record count changed by {delta:+d} "
                f"({previous_count} -> {len(records)}) - check the export"
            )


def load_meta() -> Dict[str, Any]:
    if not META_PATH.is_file():
        return {}
    try:
        return json.loads(META_PATH.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


# --------------------------------------------------------------------------- #
# workbook export (openpyxl)
# --------------------------------------------------------------------------- #
def _openpyxl():
    try:
        import openpyxl
        import openpyxl.styles
        from openpyxl.comments import Comment
        from openpyxl.utils import get_column_letter
    except ImportError as exc:  # pragma: no cover
        raise RefreshError(
            "openpyxl is required for the xlsx export: pip install openpyxl"
        ) from exc
    return openpyxl, Comment, get_column_letter


def apply_style(target, source) -> None:
    """Copies the look of a template cell.

    The ``_style`` array cannot be reused across workbooks (its font/fill/...
    ids point at the template's tables), so the parts are copied one by one.
    """
    target.font = copy(source.font)
    target.fill = copy(source.fill)
    target.border = copy(source.border)
    target.alignment = copy(source.alignment)
    target.protection = copy(source.protection)
    target.number_format = source.number_format


def cell_value(kind: str, text: str, header: str = "") -> Any:
    """Converts a source cell, keeping the text identical where possible.

    Formula errors are dropped (the sheet caches #NAME? for IMAGE() helpers),
    a temperature range pasted into a numeric column is dropped as well,
    numbers stay numbers so Excel can sort/filter them, and anything whose
    round trip would change the stored text stays a string.
    """
    raw = text
    stripped = raw.strip()
    if kind == "e" or stripped in ERROR_TEXTS:
        return None
    if is_misplaced_range(header, stripped):
        return None

    if kind == "b":
        return stripped not in ("0", "", "FALSE", "false")
    if kind == "n":
        if not stripped:
            return None
        if re.fullmatch(r"-?\d+", stripped):
            number: Any = int(stripped)
            written = str(number)
        else:
            try:
                number = float(stripped)
            except ValueError:
                return raw
            # openpyxl writes floats with 16 significant digits ("%.16g"), so
            # anything longer would come back rounded - keep it as text.
            written = "%.16g" % number
        return number if written == stripped else raw
    return raw if raw else None


def template_header_row(tpl_ws) -> Optional[int]:
    """Row number of the real header inside the previous export (None if absent)."""
    best = -1
    found = None
    for row_no in range(1, min(tpl_ws.max_row, 40) + 1):
        values = [clean_cell(cell.value) for cell in tpl_ws[row_no]]
        if "Part Number" not in values:
            continue
        # Row 9 carries a lone "Part Number " caption; the real header has all 77.
        non_empty = sum(1 for name in values if name)
        if non_empty > best:
            best, found = non_empty, row_no
    return found


def export_workbook(data: Dict[str, Any], template_path: Path, out_path: Path) -> Dict[str, Any]:
    """Writes the All Data snapshot, reusing the previous file as a style template."""
    openpyxl, Comment, get_column_letter = _openpyxl()

    headers: List[str] = data["headers"]
    columns: int = data["columns"]
    header_row: int = data["header_row_no"]

    tpl_ws = None
    if template_path.is_file():
        template = openpyxl.load_workbook(template_path)
        tpl_ws = template[template.sheetnames[0]]

    workbook = openpyxl.Workbook()
    ws = workbook.active
    ws.title = data["sheet"]

    # Styles and widths follow the header *label*, not the column number: a
    # release that inserts or renames a column would otherwise shift every
    # number format (Lo Tol. (%) "0%" became "0.2") and every width by one.
    tpl_label_row = template_header_row(tpl_ws) if tpl_ws is not None else None
    tpl_col_by_label: Dict[str, int] = {}
    if tpl_ws is not None and tpl_label_row is not None:
        for col in range(1, tpl_ws.max_column + 1):
            label = clean_cell(tpl_ws.cell(row=tpl_label_row, column=col).value)
            if label and label not in tpl_col_by_label:
                tpl_col_by_label[label] = col

    def style_source(label: str, col: int) -> Optional[int]:
        """Template column to copy the look from (by label, else by position)."""
        if tpl_ws is None or tpl_label_row is None:
            return None
        if label and label in tpl_col_by_label:
            return tpl_col_by_label[label]
        return col if col <= tpl_ws.max_column else None

    # Rows above the header keep the labels/notes that give the sheet its
    # layout; formulas are dropped (they reference the other sheets of the
    # Panasonic tool, which are not part of the snapshot).
    if tpl_ws is not None:
        for cell_range in list(tpl_ws.merged_cells.ranges):
            if cell_range.max_row <= header_row:
                ws.merge_cells(str(cell_range))
        for row_no in range(1, header_row):
            height = tpl_ws.row_dimensions[row_no].height if row_no in tpl_ws.row_dimensions else None
            if height:
                ws.row_dimensions[row_no].height = height
            for col in range(1, tpl_ws.max_column + 1):
                source = tpl_ws.cell(row=row_no, column=col)
                value = source.value
                if isinstance(value, str) and value.startswith("="):
                    value = None
                apply_style(ws.cell(row=row_no, column=col, value=value), source)

    for col in range(1, columns + 1):
        label = headers[col - 1]
        target = ws.cell(row=header_row, column=col, value=label or None)
        source_col = style_source(label, col)
        if source_col is not None:
            apply_style(target, tpl_ws.cell(row=tpl_label_row, column=source_col))
        else:
            target.font = openpyxl.styles.Font(bold=True)
            target.alignment = openpyxl.styles.Alignment(wrap_text=True, vertical="center")


    part_col = headers.index("Part Number")
    first_row = header_row + 1
    style_row = first_row if tpl_ws is not None and tpl_ws.max_row >= first_row else None
    written = 0
    for row in data["rows"][data["header_index"] + 1 :]:
        part = row.get(part_col)
        if not part or not part[1].strip() or part[1].strip() == "Part Number":
            continue
        written += 1
        row_no = first_row + written - 1
        for col in range(1, columns + 1):
            label = headers[col - 1]
            cell = row.get(col - 1)
            value = None if cell is None else cell_value(cell[0], cell[1], label)
            target = ws.cell(row=row_no, column=col, value=value)
            source_col = style_source(label, col) if style_row is not None else None
            if source_col is not None:
                apply_style(target, tpl_ws.cell(row=style_row, column=source_col))

    if tpl_ws is not None:
        for col in range(1, columns + 1):
            label = headers[col - 1]
            source_col = tpl_col_by_label.get(label) or (col if col <= tpl_ws.max_column else None)
            if not source_col:
                continue
            width = tpl_ws.column_dimensions[get_column_letter(source_col)].width
            if not width and col <= tpl_ws.max_column:
                # Duplicate headers ("%_Diff_I", "NegaDown") share the label, so the
                # first one is unnamed-width; keep the column's old width instead.
                width = tpl_ws.column_dimensions[get_column_letter(col)].width
            if width:
                ws.column_dimensions[get_column_letter(col)].width = width

        header_height = (
            tpl_ws.row_dimensions[header_row].height if header_row in tpl_ws.row_dimensions else None
        )
        if header_height:
            ws.row_dimensions[header_row].height = header_height


    comments = migrate_comments(tpl_ws, ws, data, Comment)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(out_path)
    return {"rows": written, "columns": columns, **comments}


def migrate_comments(tpl_ws, ws, data: Dict[str, Any], Comment) -> Dict[str, Any]:
    """Re-anchors the engineer comments by part number, not by row position.

    New parts are inserted in the middle of the sheet, so copying row numbers
    would move notes onto the wrong inductors.
    """
    if tpl_ws is None:
        return {"comments": 0, "orphan_comments": []}

    headers: List[str] = data["headers"]
    header_row: int = data["header_row_no"]
    part_col = headers.index("Part Number") + 1

    tpl_header_row = template_header_row(tpl_ws)
    if tpl_header_row is None:
        return {"comments": 0, "orphan_comments": []}

    tpl_header = [
        clean_cell(tpl_ws.cell(row=tpl_header_row, column=col).value)
        for col in range(1, tpl_ws.max_column + 1)
    ]
    tpl_part_col = tpl_header.index("Part Number") + 1 if "Part Number" in tpl_header else None
    if tpl_part_col is None:
        return {"comments": 0, "orphan_comments": []}

    new_rows: Dict[str, int] = {}
    for row_no in range(header_row + 1, ws.max_row + 1):
        part = ws.cell(row=row_no, column=part_col).value
        if part:
            new_rows[str(part).strip()] = row_no

    migrated = 0
    orphans: List[str] = []
    for row in tpl_ws.iter_rows():
        for cell in row:
            if cell.comment is None:
                continue
            if cell.row == tpl_header_row:
                target_row = header_row
            else:
                part = tpl_ws.cell(row=cell.row, column=tpl_part_col).value
                part = str(part).strip() if part is not None else ""
                target_row = new_rows.get(part)
                if target_row is None:
                    orphans.append(f"{cell.coordinate} ({part or 'no part number'})")
                    continue
            # Columns move too (11.2026 inserted "Series (Util)"), so the note
            # follows its header label instead of its column number.
            tpl_label = tpl_header[cell.column - 1] if cell.column - 1 < len(tpl_header) else ""
            target_col = headers.index(tpl_label) + 1 if tpl_label in headers else cell.column
            if target_col > len(headers) or not headers[target_col - 1]:
                orphans.append(f"{cell.coordinate} (column not in export)")
                continue
            comment = Comment(cell.comment.text, cell.comment.author or "PCCselector")
            if cell.comment.width:
                comment.width = cell.comment.width
            if cell.comment.height:
                comment.height = cell.comment.height
            ws.cell(row=target_row, column=target_col).comment = comment
            migrated += 1


    return {"comments": migrated, "orphan_comments": orphans}


# --------------------------------------------------------------------------- #
# data.js + manifest
# --------------------------------------------------------------------------- #
def strip_errors(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            key: (None if isinstance(value, str) and value.strip() in ERROR_TEXTS else value)
            for key, value in record.items()
        }
        for record in records
    ]


def diff_records(
    expected: List[Dict[str, Any]], actual: List[Dict[str, Any]], limit: int = 10
) -> List[str]:
    """Field-level difference between the workbook and the exported snapshot."""
    actual_by_part = {str(row.get("Part Number")): row for row in actual}
    problems: List[str] = []
    for record in expected:
        part = str(record.get("Part Number"))
        other = actual_by_part.get(part)
        if other is None:
            problems.append(f"missing record: {part}")
        else:
            for key, value in record.items():
                if other.get(key) != value:
                    problems.append(f"{part} / {key}: {value!r} != {other.get(key)!r}")
        if len(problems) >= limit:
            return problems
    for part in actual_by_part:
        if part not in {str(row.get("Part Number")) for row in expected}:
            problems.append(f"unexpected record: {part}")
    return problems[:limit]


def load_data_js() -> List[Dict[str, Any]]:
    """Reads the records back out of data.js (empty list when it is unusable)."""
    if not DATA_JS_PATH.is_file():
        return []
    text = DATA_JS_PATH.read_text(encoding="utf-8")
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        payload = json.loads(text[start : end + 1])
    except ValueError:
        return []
    return payload if isinstance(payload, list) else []


def summarize_changes(
    previous: List[Dict[str, Any]], current: List[Dict[str, Any]], samples: int = 3
) -> List[str]:
    """Human-readable add/remove/column-change summary between two data.js builds."""
    old = {str(row.get("Part Number")): row for row in previous}
    new = {str(row.get("Part Number")): row for row in current}
    lines: List[str] = []

    added = [part for part in new if part not in old]
    removed = [part for part in old if part not in new]
    if added:
        lines.append(f"PN added ({len(added)}): {', '.join(added)}")
    if removed:
        lines.append(f"PN removed ({len(removed)}): {', '.join(removed)}")

    counts: Dict[str, int] = {}
    examples: Dict[str, List[str]] = {}
    for part, row in new.items():
        before = old.get(part)
        if before is None:
            continue
        for key, value in row.items():
            if before.get(key) != value:
                counts[key] = counts.get(key, 0) + 1
                examples.setdefault(key, []).append(f"{part}: {before.get(key)!r} -> {value!r}")
        for key in before:
            if key not in row:
                counts[key] = counts.get(key, 0) + 1
                examples.setdefault(key, []).append(f"{part}: {before.get(key)!r} -> (gone)")

    for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"column {key!r} changed on {count} record(s)")
        for example in examples[key][:samples]:
            lines.append(f"    {example}")
        if len(examples[key]) > samples:
            lines.append(f"    ... {len(examples[key]) - samples} more")

    if not lines:
        lines.append("no differences")
    return lines


def write_data_js(records: List[Dict[str, Any]], meta: Dict[str, Any]) -> Dict[str, Any]:
    report = vibration.apply(records)
    vibration.print_report(report)

    missing = sorted(report["unknown_series"])
    if missing:
        print('Series missing from datasheet/vibration.json - paste into "ratings":')
        for series in missing:
            print(f'    {json.dumps(series, ensure_ascii=False)}: {{"g": null, "source": null}},')

    release = meta.get("release") or "unknown release"
    source_name = meta.get("source_name") or WORKBOOK_PATH.name
    digest = (meta.get("source_sha256") or "")[:12]
    header = (
        f"// Source: Panasonic Inductor Selection Tool - {release} "
        f"({source_name}, sha256 {digest or 'n/a'}) - {len(records)} records"
        f" - built {meta.get('generated_at', '')}\n"
    )
    payload = header + "window.INDUCTOR_DATA = " + json.dumps(records, ensure_ascii=False) + ";\n"
    DATA_JS_PATH.write_text(payload, encoding="utf-8")
    print(f"Wrote {rel(DATA_JS_PATH)} with {len(records)} records")
    return report


def write_meta(meta: Dict[str, Any]) -> None:
    # ensure_ascii keeps the header labels readable in any editor/viewer; the
    # file is only consumed by json.loads.
    META_PATH.write_text(
        json.dumps(meta, ensure_ascii=True, indent=2) + "\n", encoding="utf-8"
    )


def verify() -> int:
    meta = load_meta()
    if not meta:
        print(f"No {rel(META_PATH)} - run python refresh.py first")
        return 1

    problems = 0
    for label, key, hash_key in (
        ("source", "source", "source_sha256"),
        ("unlocked", "unlocked", "unlocked_sha256"),
        ("workbook", "workbook", "workbook_sha256"),
        ("data.js", "data_js", "data_js_sha256"),
    ):
        recorded = meta.get(key)
        if not recorded:
            print(f"MISSING  {label}: not recorded in {rel(META_PATH)}")
            problems += 1
            continue
        path = ROOT / recorded
        if not path.is_file():
            print(f"FAIL     {label}: {recorded} is gone")
            problems += 1
            continue
        expected = meta.get(hash_key)
        actual = sha256(path)
        if expected and actual != expected:
            print(f"FAIL     {label}: {recorded} changed since the build")
            problems += 1
        else:
            print(f"ok       {label}: {recorded}")

    if problems:
        print(f"{problems} problem(s) - run python refresh.py to rebuild")
        return 1
    print(f"In sync: release {meta.get('release')}, {meta.get('records')} records")
    return 0


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #
def cmd_list() -> int:
    sources = discover_sources()
    if not sources:
        print(f"No .xlsm/.xlsx files under {rel(SOURCE_DIR)}")
        return 0
    for index, item in enumerate(sources):
        marker = "*" if index == 0 else " "
        label = item["label"] or "(no release date)"
        print(f"{marker} {label:<12} {rel(item['path'])}  {item['size']:,} B")
    print("* = picked by default")
    return 0


def pick_source(explicit: Optional[str]) -> Dict[str, Any]:
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            path = ROOT / path
        if not path.is_file():
            raise RefreshError(f"Workbook not found: {explicit}")
        release = parse_release(path.parent.name) or parse_release(path.stem)
        return {
            "path": path,
            "release": release,
            "label": release_label(*release) if release else None,
        }
    sources = discover_sources()
    if not sources:
        raise RefreshError(
            f"No workbook found under {rel(SOURCE_DIR)} - put it in Source/<MM.YYYY>/ "
            "or pass --xlsm"
        )
    return sources[0]


def dry_run(source: Dict[str, Any]) -> int:
    """Prints what a refresh would change and writes nothing.

    This is the check to run first after dropping in a new workbook: it shows
    the picked file, the release, the column changes, the part numbers that came
    or went and the per-column differences against the current data.js.
    """
    path: Path = source["path"]
    label = source["label"]
    stat = path.stat()
    print(f"Source:    {rel(path)}" + (f"  (release {label})" if label else ""))
    print(
        f"File:      {stat.st_size:,} B, modified "
        f"{datetime.fromtimestamp(stat.st_mtime).isoformat(timespec='seconds')}"
    )
    print("Dry run:   nothing will be written")

    meta = load_meta()
    if meta.get("release") and label and meta["release"] != label:
        print(f"Release:   {meta['release']} -> {label}")

    notes: List[str] = []
    data = read_all_data(path)
    records = build_records(data, notes)
    print(
        f"Sheet:     {data['sheet']!r} header row {data['header_row_no']}, "
        f"{data['columns']} columns, {len(records)} records"
    )
    for note in notes:
        print(f"Cleaned:   {note}")
    check_layout(data, records, meta)

    shape: List[str] = []
    app_records = normalize_records([dict(record) for record in records], shape)
    for note in shape:
        print(f"Note:      {note}")

    # Merge the datasheet ratings before diffing, so the comparison shows what
    # data.js would actually contain (the workbook's Vibration column is ignored).
    report = vibration.apply(app_records)

    print("--- changes against the current data.js ---")
    previous = load_data_js()
    if not previous:
        print(f"Change:    {rel(DATA_JS_PATH)} is missing - every record would be new")
    for line in summarize_changes(previous, app_records):
        print(f"Change:    {line}" if not line.startswith("    ") else line)

    print("--- what the build would report ---")
    vibration.print_report(report)

    print(
        f"Export:    {rel(WORKBOOK_PATH)} - {len(app_records)} rows x "
        f"{data['columns']} columns, comments re-anchored by part number and header label"
    )
    return 0


def refresh(source: Dict[str, Any]) -> int:
    import os

    path: Path = source["path"]
    label = source["label"]
    print(f"Source:    {rel(path)}" + (f"  (release {label})" if label else ""))

    unlocked_path = path.with_name(UNLOCKED_NAME)
    unlock = unlock_workbook(path, unlocked_path)
    if unlock["already_unlocked"]:
        print(f"Unlocked:  {rel(unlocked_path)} (already unlocked)")
    else:
        notes = []
        if unlock["vba_patched"]:
            notes.append("VBA password flag patched")
        if unlock["unhidden"]:
            notes.append("unhidden: " + ", ".join(unlock["unhidden"]))
        print(f"Unlocked:  {rel(unlocked_path)} ({'; '.join(notes)})")

    meta = load_meta()
    data = read_all_data(unlocked_path)
    notes: List[str] = []
    records = build_records(data, notes)
    print(
        f"Sheet:     {data['sheet']!r} header row {data['header_row_no']}, "
        f"{data['columns']} columns, {len(records)} records"
    )
    if notes:
        print(
            f"Cleaned:   {len(notes)} impossible value(s) dropped "
            "(temperature range in a numeric column)"
        )

        for note in notes[:6]:
            print(f"           {note}")
        if len(notes) > 6:
            print(f"           ... {len(notes) - 6} more")
    check_layout(data, records, meta)


    temp_path = WORKBOOK_PATH.with_name(WORKBOOK_PATH.stem + ".tmp.xlsx")
    export = export_workbook(data, WORKBOOK_PATH, temp_path)
    os.replace(temp_path, WORKBOOK_PATH)
    print(
        f"Workbook:  {rel(WORKBOOK_PATH)} - {export['rows']} rows x {export['columns']} columns, "
        f"{export['comments']} comment(s) migrated"
    )
    for orphan in export["orphan_comments"]:
        print(f"  WARNING: comment not migrated: {orphan}")

    # data.js is built from the exported file, so the two cannot disagree; the
    # comparison below only has to ignore the formula errors we blanked.
    exported = read_all_data(WORKBOOK_PATH)
    exported_records = build_records(exported)
    problems = diff_records(strip_errors(records), exported_records)
    if problems:
        raise RefreshError(
            "export does not match the source workbook:\n  " + "\n  ".join(problems)
        )

    previous = meta.get("records")
    if isinstance(previous, int) and previous:
        print(
            f"Records:   {previous} -> {len(exported_records)} "
            f"({len(exported_records) - previous:+d})"
        )

    # data.js keeps the UI's field names even when the workbook renames a column;
    # the xlsx above stays a verbatim copy of Panasonic's sheet.
    shape: List[str] = []
    app_records = normalize_records(exported_records, shape)
    for note in shape:
        print(f"Note:      {note}")

    meta_out: Dict[str, Any] = {
        "release": label,
        "source": rel(path),
        "source_name": path.name,
        "source_sha256": sha256(path),
        "unlocked": rel(unlocked_path),
        "unlocked_sha256": sha256(unlocked_path),
        "sheet": exported["sheet"],
        "header_row": exported["header_row_no"],
        "columns": exported["columns"],
        "records": len(exported_records),
        "headers": exported["headers"],
        "app_columns": len(app_records[0]) if app_records else 0,
        "workbook": rel(WORKBOOK_PATH),
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    write_data_js(app_records, meta_out)
    meta_out["workbook_sha256"] = sha256(WORKBOOK_PATH)
    meta_out["data_js"] = rel(DATA_JS_PATH)
    meta_out["data_js_sha256"] = sha256(DATA_JS_PATH)
    write_meta(meta_out)
    print(f"Manifest:  {rel(META_PATH)}")
    return 0


def build_only() -> int:
    if not WORKBOOK_PATH.is_file():
        raise RefreshError(f"{rel(WORKBOOK_PATH)} is missing - run python refresh.py first")
    meta = load_meta()
    data = read_all_data(WORKBOOK_PATH)
    notes: List[str] = []
    records = build_records(data, notes)
    print(
        f"Sheet:     {data['sheet']!r} header row {data['header_row_no']}, "
        f"{data['columns']} columns, {len(records)} records"
    )
    if notes:
        print(f"Cleaned:   {len(notes)} impossible value(s) dropped")
    check_layout(data, records, meta)

    shape: List[str] = []
    app_records = normalize_records(records, shape)
    for note in shape:
        print(f"Note:      {note}")

    meta["generated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    meta["sheet"] = data["sheet"]
    meta["header_row"] = data["header_row_no"]
    meta["columns"] = data["columns"]
    meta["records"] = len(records)
    meta["headers"] = data["headers"]
    meta["app_columns"] = len(app_records[0]) if app_records else 0
    meta["workbook"] = rel(WORKBOOK_PATH)
    write_data_js(app_records, meta)

    meta["workbook_sha256"] = sha256(WORKBOOK_PATH)
    meta["data_js"] = rel(DATA_JS_PATH)
    meta["data_js_sha256"] = sha256(DATA_JS_PATH)
    write_meta(meta)
    return 0


def _configure_console() -> None:
    """Stops a Japanese header label from killing the build.

    Windows consoles default to cp1252, and the layout warning lists the
    workbook's own column names (``カタログ品`` ...), so a plain ``print`` can
    raise UnicodeEncodeError halfway through the run.  Log lines must never be
    able to abort a refresh, so undecodable characters are replaced instead.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(errors="replace")
        except (ValueError, OSError):  # pragma: no cover - exotic streams
            continue


def main(argv: Optional[List[str]] = None) -> int:
    _configure_console()
    parser = argparse.ArgumentParser(
        description="Refresh Inductor all data.xlsx and data.js from a Panasonic workbook."
    )
    parser.add_argument("--xlsm", help="workbook to import (default: newest under Source/)")
    parser.add_argument("--list", action="store_true", help="list the discovered workbooks")
    parser.add_argument(
        "--build-only", action="store_true", help="rebuild data.js from Inductor all data.xlsx"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would change without writing anything",
    )
    parser.add_argument("--verify", action="store_true", help="check the generated files are current")
    args = parser.parse_args(argv)

    if args.list:
        return cmd_list()
    if args.verify:
        return verify()
    if args.build_only:
        return build_only()
    source = pick_source(args.xlsm)
    if args.dry_run:
        return dry_run(source)
    return refresh(source)


if __name__ == "__main__":
    sys.exit(main())

