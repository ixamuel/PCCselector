#!/usr/bin/env python3
"""Builds data.js from the Excel workbook using only stdlib."""
import json
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Tuple, Dict, Any

WORKBOOK_PATH = "Inductor all data.xlsx"
OUTPUT_PATH = "data.js"

NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def get_shared_strings(z: zipfile.ZipFile) -> List[str]:
    try:
        data = z.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(data)
    strings: List[str] = []
    for si in root.findall("main:si", NS):
        texts: List[str] = []
        for t in si.findall(".//main:t", NS):
            texts.append(t.text or "")
        strings.append("".join(texts))
    return strings


def get_sheet_names(z: zipfile.ZipFile) -> List[Tuple[str, str]]:
    data = z.read("xl/workbook.xml")
    root = ET.fromstring(data)
    sheets = []
    for sheet in root.findall("main:sheets/main:sheet", NS):
        sheets.append(
            (
                sheet.attrib.get("name"),
                sheet.attrib.get(
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ),
            )
        )
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target: Dict[str, str] = {}
    for rel in rels.findall(
        "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
    ):
        rid_to_target[rel.attrib["Id"]] = rel.attrib["Target"]
    result: List[Tuple[str, str]] = []
    for name, rid in sheets:
        target = rid_to_target.get(rid)
        if target:
            if not target.startswith("xl/"):
                target = "xl/" + target
            result.append((name, target))
    return result


def col_to_index(col: str) -> int:
    idx = 0
    for ch in col:
        if not ch.isalpha():
            break
        idx = idx * 26 + (ord(ch.upper()) - 64)
    return idx - 1


def parse_sheet(z: zipfile.ZipFile, sheet_path: str, shared_strings: List[str]) -> List[List[Any]]:
    data = z.read(sheet_path)
    root = ET.fromstring(data)
    rows: List[List[Any]] = []
    for row in root.findall("main:sheetData/main:row", NS):
        cells: Dict[int, Any] = {}
        for c in row.findall("main:c", NS):
            r = c.attrib.get("r")
            if not r:
                continue
            col = "".join([ch for ch in r if ch.isalpha()])
            col_idx = col_to_index(col)
            t = c.attrib.get("t")
            v = None
            if t == "s":
                v_el = c.find("main:v", NS)
                if v_el is not None and v_el.text is not None:
                    try:
                        v = shared_strings[int(v_el.text)]
                    except Exception:
                        v = v_el.text
            elif t == "inlineStr":
                t_el = c.find("main:is/main:t", NS)
                v = t_el.text if t_el is not None else ""
            else:
                v_el = c.find("main:v", NS)
                if v_el is not None:
                    v = v_el.text
            cells[col_idx] = v
        if cells:
            max_idx = max(cells.keys())
            row_vals = [cells.get(i) for i in range(max_idx + 1)]
            rows.append(row_vals)
        else:
            rows.append([])
    return rows


def clean_cell(value: Any) -> str:
    if value is None:
        return ""
    s = str(value).replace("\n", " ").strip()
    return " ".join(s.split())


def main() -> None:
    with zipfile.ZipFile(WORKBOOK_PATH) as z:
        sheets = get_sheet_names(z)
        if not sheets:
            raise SystemExit("No sheets found in workbook")
        shared = get_shared_strings(z)
        _, sheet_path = sheets[0]
        rows = parse_sheet(z, sheet_path, shared)

    # Find header row with Part Number and the most non-empty cells
    header_row_index = None
    max_non_empty = -1
    for i, row in enumerate(rows):
        if not row:
            continue
        cleaned = [clean_cell(cell) for cell in row]
        if "Part Number" in cleaned:
            non_empty = sum(1 for c in cleaned if c)
            if non_empty > max_non_empty:
                max_non_empty = non_empty
                header_row_index = i

    if header_row_index is None:
        raise SystemExit("Header row not found")

    headers_raw = rows[header_row_index]
    headers: List[str] = []
    for h in headers_raw:
        h_clean = clean_cell(h)
        headers.append(h_clean if h_clean else "")

    records: List[Dict[str, Any]] = []
    for row in rows[header_row_index + 1 :]:
        if not row:
            continue
        if len(row) < len(headers):
            row = row + [None] * (len(headers) - len(row))
        record: Dict[str, Any] = {}
        for idx, h in enumerate(headers):
            if not h:
                continue
            v = row[idx] if idx < len(row) else None
            if isinstance(v, str):
                v = v.strip()
                if v == "":
                    v = None
            record[h] = v
        pn = record.get("Part Number")
        if pn and pn != "Part Number":
            records.append(record)

    payload = "window.INDUCTOR_DATA = " + json.dumps(records, ensure_ascii=False) + ";\n"
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(payload)

    print(f"Wrote {OUTPUT_PATH} with {len(records)} records")


if __name__ == "__main__":
    main()
