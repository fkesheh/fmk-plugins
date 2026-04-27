#!/usr/bin/env python3
"""Find existing research doc matching a slug or topic.

Usage:
    python3 find_existing.py --slug auth-flow
    python3 find_existing.py --topic "auth flow"
    python3 find_existing.py --slug auth-flow --root docs/research

Output: matching doc path on stdout, or empty stdout if no match.
Exit 0 always (empty stdout means no match).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write(
        "ERROR: PyYAML required. Install with: pip install pyyaml\n"
    )
    sys.exit(2)


def split_frontmatter(text: str) -> dict:
    if not text.startswith("---\n"):
        return {}
    rest = text[4:]
    end = rest.find("\n---")
    if end == -1:
        return {}
    try:
        return yaml.safe_load(rest[:end]) or {}
    except yaml.YAMLError:
        return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug")
    parser.add_argument("--topic")
    parser.add_argument("--root", default="docs/research")
    args = parser.parse_args()

    if not args.slug and not args.topic:
        sys.stderr.write("provide --slug or --topic\n")
        return 2

    root = Path(args.root)
    if not root.exists():
        return 0

    slug_target = args.slug.lower().strip() if args.slug else None
    topic_target = args.topic.lower().strip() if args.topic else None

    for doc in sorted(root.glob("*.md")):
        fm = split_frontmatter(doc.read_text(encoding="utf-8"))
        if slug_target and str(fm.get("slug", "")).lower().strip() == slug_target:
            print(doc)
            return 0
        if topic_target:
            t = str(fm.get("topic", "")).lower().strip()
            if t and (t == topic_target or topic_target in t or t in topic_target):
                print(doc)
                return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
