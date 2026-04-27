#!/usr/bin/env python3
"""Staleness checker for research docs.

Reads YAML frontmatter from research markdown files, recomputes
git hash-object SHAs for every entry under `references:`, and reports
which files have changed (stale), are missing, or remain fresh.

Usage:
    python3 stale.py                           # scans docs/research/*.md
    python3 stale.py path/to/doc.md [...]      # specific files
    python3 stale.py --root <dir>              # custom research dir

Output: JSON list, one entry per doc.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write(
        "ERROR: PyYAML required. Install with: pip install pyyaml\n"
    )
    sys.exit(2)


def split_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    rest = text[4:]
    end = rest.find("\n---")
    if end == -1:
        return {}, text
    fm_text = rest[:end]
    body = rest[end + 4:].lstrip("\n")
    try:
        fm = yaml.safe_load(fm_text) or {}
    except yaml.YAMLError as exc:
        sys.stderr.write(f"YAML parse error: {exc}\n")
        return {}, body
    return fm, body


def hash_object(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    try:
        out = subprocess.run(
            ["git", "hash-object", str(path)],
            check=True, capture_output=True, text=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def check_doc(doc_path: Path) -> dict:
    text = doc_path.read_text(encoding="utf-8")
    fm, _ = split_frontmatter(text)
    refs = fm.get("references") or []
    stale, missing, fresh = [], [], []
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        path_str = ref.get("path", "")
        stored = ref.get("sha")
        ref_path = Path(path_str)
        current = hash_object(ref_path)
        entry = {
            "path": path_str,
            "stored_sha": stored,
            "current_sha": current,
            "lines": ref.get("lines"),
            "note": ref.get("note"),
        }
        if current is None:
            entry["status"] = "missing"
            missing.append(entry)
        elif stored == current:
            entry["status"] = "fresh"
            fresh.append(entry)
        else:
            entry["status"] = "stale"
            stale.append(entry)
    return {
        "doc": str(doc_path),
        "topic": fm.get("topic"),
        "slug": fm.get("slug"),
        "git_commit": fm.get("git_commit"),
        "stale": stale,
        "missing": missing,
        "fresh": fresh,
        "is_stale": bool(stale or missing),
    }


def collect_docs(argv: list[str]) -> list[Path]:
    root = Path("docs/research")
    paths: list[Path] = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--root":
            i += 1
            root = Path(argv[i])
        elif a.startswith("--"):
            sys.stderr.write(f"unknown flag: {a}\n")
            sys.exit(2)
        else:
            paths.append(Path(a))
        i += 1
    if paths:
        return paths
    if not root.exists():
        return []
    return sorted(root.glob("*.md"))


def main() -> int:
    docs = collect_docs(sys.argv[1:])
    results = [
        check_doc(d) for d in docs
        if d.exists() and d.suffix == ".md"
    ]
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
