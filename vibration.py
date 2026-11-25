#!/usr/bin/env python3
"""Adds datasheet vibration ratings (G) to the workbook records.

The workbook's `Vibration` column holds no usable ratings (mostly empty, and a
few temperature ranges pasted in by mistake).  The ratings are published per
PCC-M type in `datasheet/*.pdf`; `datasheet/vibration.json` mirrors those
tables and is the single place to edit when a value is added or corrected.
This module merges the values into the records (keyed by `Series (Size)`) and
audits the result against the markdown exports, so the map cannot silently
drift from the datasheets: every rated part number must be listed in the
markdown file named as its `source`.  Stdlib only, like refresh.py.
"""
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

DATASHEET_DIR = Path(__file__).with_name("datasheet")
VIBRATION_PATH = DATASHEET_DIR / "vibration.json"
MARKDOWN_DIR = DATASHEET_DIR / "markdown-export"

PART_RE = re.compile(r"ETQP[0-9A-Z]{6,}")


def load_ratings(path: Path = VIBRATION_PATH) -> Dict[str, Dict[str, Any]]:
    """Returns the type -> {g, source, ...} map from vibration.json."""
    if not path.is_file():
        raise SystemExit(f"Missing vibration map: {path}")
    with path.open(encoding="utf-8") as f:
        payload = json.load(f)
    ratings = payload.get("ratings")
    if not isinstance(ratings, dict) or not ratings:
        raise SystemExit(f"No 'ratings' entries in {path.name}")
    return ratings


def scan_markdown(md_dir: Path = MARKDOWN_DIR) -> Dict[str, set]:
    """Maps each datasheet part number to the markdown exports listing it."""
    index: Dict[str, set] = {}
    if not md_dir.is_dir():
        return index
    for md_path in sorted(md_dir.glob("*.md")):
        text = md_path.read_text(encoding="utf-8", errors="ignore")
        for part in PART_RE.findall(text):
            index.setdefault(part, set()).add(md_path.name)
    return index


def format_g(value: Any) -> str:
    """10 -> '10', 33.3 -> '33.3' (ratings are displayed without decimals)."""
    if isinstance(value, (int, float)) and float(value).is_integer():
        return str(int(value))
    return str(value).strip()


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def apply(
    records: List[Dict[str, Any]],
    ratings: Optional[Dict[str, Dict[str, Any]]] = None,
    md_index: Optional[Dict[str, set]] = None,
) -> Dict[str, Any]:
    """Sets record["Vibration"] from the map and returns coverage stats.

    Unrated records become None (rendered as an em dash by the table),
    replacing any raw workbook value.  Nothing is guessed: a missing datasheet
    or a datasheet without a vibration column stays empty.
    """
    ratings = load_ratings() if ratings is None else ratings
    md_index = scan_markdown() if md_index is None else md_index
    md_files = {name for names in md_index.values() for name in names}

    rated = 0
    unrated: Dict[str, int] = {}
    blank_series = 0
    unknown_series: Dict[str, int] = {}
    aliases: Dict[str, Dict[str, Any]] = {}
    raw_values: Dict[str, int] = {}
    unused = set(ratings)
    not_in_markdown = set()
    missing_sources = set()
    alias_mismatch = set()

    for record in records:
        series = _text(record.get("Series (Size)"))
        raw = _text(record.get("Vibration"))
        if raw:
            raw_values[raw] = raw_values.get(raw, 0) + 1

        entry = ratings.get(series) if series else None
        if entry is None:
            record["Vibration"] = None
            if series:
                unknown_series[series] = unknown_series.get(series, 0) + 1
            else:
                blank_series += 1
            continue

        unused.discard(series)
        rating = entry.get("g")
        if rating is None:
            record["Vibration"] = None
            unrated[series] = unrated.get(series, 0) + 1
            continue

        record["Vibration"] = format_g(rating)
        rated += 1

        alias = entry.get("alias_of")
        if alias:
            info = aliases.setdefault(series, {"target": alias, "count": 0})
            info["count"] += 1
            target = ratings.get(alias)
            if target is None or target.get("g") != rating:
                alias_mismatch.add(series)

        source = entry.get("source")
        if not source:
            continue
        if source not in md_files:
            missing_sources.add(source)
            continue
        part = _text(record.get("Part Number"))
        if part and source not in md_index.get(part, set()):
            not_in_markdown.add(f"{part} ({series})")

    return {
        "total": len(records),
        "rated": rated,
        "unrated": unrated,
        "blank_series": blank_series,
        "unknown_series": unknown_series,
        "aliases": aliases,
        "raw_values": raw_values,
        "unused": sorted(unused),
        "not_in_markdown": sorted(not_in_markdown),
        "missing_sources": sorted(missing_sources),
        "alias_mismatch": sorted(alias_mismatch),
    }


def print_report(report: Dict[str, Any]) -> None:
    """Prints the coverage summary plus any drift warnings for the build log."""
    total = report["total"]
    rated = report["rated"]
    unrated = total - rated
    print(
        f"Vibration: {rated}/{total} records rated, {unrated} unrated "
        f"({len(report['unrated'])} series without G rating, "
        f"{report['blank_series']} without Series (Size))"
    )

    for series, count in sorted(report["unrated"].items()):
        print(f"  no G rating: {series} ({count} record(s))")

    if report["raw_values"]:
        detail = ", ".join(f'{count} x "{value}"' for value, count in report["raw_values"].items())
        print(f"Replaced raw workbook values: {detail}")

    for series, info in sorted(report["aliases"].items()):
        print(f"  alias: {series} -> {info['target']} ({info['count']} record(s))")

    if report["unused"]:
        print(f"Ratings without workbook rows: {', '.join(report['unused'])}")

    if report["unknown_series"]:
        detail = ", ".join(
            f"{series} ({count})" for series, count in sorted(report["unknown_series"].items())
        )
        print(f"WARNING: series missing from vibration.json: {detail}")

    if report["missing_sources"]:
        print(f"WARNING: source markdown not found: {', '.join(report['missing_sources'])}")

    if report["not_in_markdown"]:
        shown = report["not_in_markdown"][:10]
        more = " ..." if len(report["not_in_markdown"]) > len(shown) else ""
        print(f"WARNING: part number not listed in its source markdown: {', '.join(shown)}{more}")

    if report["alias_mismatch"]:
        print(f"WARNING: alias rating differs from its target: {', '.join(report['alias_mismatch'])}")
