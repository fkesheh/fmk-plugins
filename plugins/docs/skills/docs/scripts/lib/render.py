"""Format reports as text or JSON. Text output is ANSI-colored when allowed."""
from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict
from typing import Iterable

from .orphans import OrphanReport
from .stale import StaleEntry


_RED = "\033[31m"
_YELLOW = "\033[33m"
_DIM = "\033[2m"
_BOLD = "\033[1m"
_RESET = "\033[0m"


def _color_enabled(no_color: bool) -> bool:
    if no_color:
        return False
    if os.environ.get("NO_COLOR"):
        return False
    return sys.stdout.isatty()


def _c(s: str, code: str, on: bool) -> str:
    return f"{code}{s}{_RESET}" if on else s


def stale_text(entries: list[StaleEntry], no_color: bool = False) -> str:
    if not entries:
        return "All docs fresh.\n"
    on = _color_enabled(no_color)
    lines: list[str] = []
    lines.append(_c(f"STALE ({len(entries)} reference(s) across docs)", _BOLD, on))
    current_doc = None
    for e in entries:
        if e.doc_repo_path != current_doc:
            current_doc = e.doc_repo_path
            badge = _c(f"L{e.doc_level} {e.doc_type}", _DIM, on)
            lines.append(f"\n{badge}  {_c(e.doc_repo_path, _BOLD, on)}  ({e.doc_id})")
        if e.status == "missing":
            head = _c("missing", _RED, on)
            lines.append(f"  - [{e.ref_kind}] {head}: {e.ref_path}")
        else:
            head = _c("drift", _YELLOW, on)
            lines.append(
                f"  - [{e.ref_kind}] {head}: {e.ref_path}\n"
                f"      was {e.sha_recorded}  now {e.sha_current or ''}"
            )
    lines.append("")
    return "\n".join(lines)


def stale_json(entries: list[StaleEntry]) -> str:
    return json.dumps(
        {"count": len(entries), "entries": [asdict(e) for e in entries]},
        indent=2,
        ensure_ascii=False,
    ) + "\n"


def orphans_text(rep: OrphanReport, no_color: bool = False) -> str:
    if rep.total_files == 0:
        return "No orphans. Every tracked source file is referenced by a leaf or aggregator.\n"
    on = _color_enabled(no_color)
    lines = [
        _c(
            f"ORPHANS ({rep.total_files} files, {rep.total_groups} groups)",
            _BOLD,
            on,
        )
    ]
    for key, files in rep.grouped.items():
        lines.append(f"\n{_c(key, _BOLD, on)}  ({len(files)})")
        for p in files:
            lines.append(f"  - {p}")
    lines.append("")
    return "\n".join(lines)


def orphans_json(rep: OrphanReport) -> str:
    return json.dumps(
        {
            "total_files": rep.total_files,
            "total_groups": rep.total_groups,
            "grouped": rep.grouped,
        },
        indent=2,
        ensure_ascii=False,
    ) + "\n"


def write(stream, payload: str) -> None:
    stream.write(payload)
    stream.flush()


def join(parts: Iterable[str]) -> str:
    return "\n".join(parts)
