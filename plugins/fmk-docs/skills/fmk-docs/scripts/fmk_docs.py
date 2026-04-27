#!/usr/bin/env python3
"""fmk-docs — diagnostic CLI for C4-model documentation tracking.

All doc writes (re-syncing leaves, regenerating aggregators) are performed by
Claude through the fmk-docs skill body. This script only:
  - scaffolds a fresh docs/ tree (init),
  - reports drift between recorded SHAs and current git-blob SHAs (check),
  - reports tracked source files no leaf references (orphans),
  - renders the doc DAG (graph),
  - prints per-doc summaries (stat).

Run it from the target repo's root:

    python ~/.claude/skills/fmk-docs/scripts/fmk_docs.py <subcommand> [flags]

Exit codes:
  0  ok (or stale found without --strict)
  1  stale found (with --strict)
  2  `init` target already exists (use --force to overwrite)
  4  one or more sources missing (with strictness.fail_on_missing_source)
  6  orphans found (with strictness.fail_on_orphan)
  7  YAML parse error in a doc
  8  not in a git repo
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from datetime import date
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_THIS_DIR))
_SKILL_ROOT = _THIS_DIR.parent

from lib.config import load_config  # noqa: E402
from lib.git import GitError, is_git_repo, repo_root  # noqa: E402
from lib.graph import DocParseError, walk_docs  # noqa: E402
from lib.frontmatter import FrontmatterError  # noqa: E402
from lib.orphans import find_orphans  # noqa: E402
from lib.stale import check as run_check  # noqa: E402
from lib import render  # noqa: E402


# ---------------------------------------------------------------------------
# helpers


def _resolve_repo(args) -> Path:
    """Find the repo root, honoring --root and --config flags."""
    start = Path(getattr(args, "root", ".") or ".").resolve()
    if not is_git_repo(start):
        sys.stderr.write(f"error: '{start}' is not inside a git repo (exit 8)\n")
        sys.exit(8)
    return repo_root(start)


def _read_template(name: str) -> str:
    path = _SKILL_ROOT / "assets" / "templates" / name
    return path.read_text(encoding="utf-8")


def _render_template(text: str, **vars: str) -> str:
    out = text
    for k, v in vars.items():
        out = out.replace("{{" + k + "}}", v)
    return out


# ---------------------------------------------------------------------------
# init


def cmd_init(args) -> int:
    target_root = Path(args.root or ".").resolve()
    docs = target_root / "docs"
    today = date.today().isoformat()

    if docs.exists() and not args.force:
        sys.stderr.write(
            f"error: {docs} already exists; pass --force to overwrite (exit 2)\n"
        )
        return 2

    if docs.exists() and args.force:
        shutil.rmtree(docs)

    docs.mkdir(parents=True)

    starter = (_SKILL_ROOT / "assets" / "starter.fmk-docs.yml").read_text(encoding="utf-8")
    (docs / ".fmk-docs.yml").write_text(starter, encoding="utf-8")

    ignore_help = (
        "# Add gitignore-style globs (one per line) for source files that\n"
        "# should NOT be flagged as orphans even if they're not referenced\n"
        "# by any doc. Comments start with '#'.\n"
    )
    (docs / ".fmk-docs-ignore").write_text(ignore_help, encoding="utf-8")

    # Level 1 — context root
    ctx_dir = docs / "01-context"
    ctx_dir.mkdir()
    (ctx_dir / "README.md").write_text(
        _render_template(
            _read_template("01-context.README.md.tmpl"),
            id="context",
            title="System Context",
            date=today,
        ),
        encoding="utf-8",
    )

    if args.minimal:
        _summarize_init(docs)
        return 0

    # Level 2 — sample container
    cont_dir = docs / "02-containers" / "sample-container"
    cont_dir.mkdir(parents=True)
    (cont_dir / "README.md").write_text(
        _render_template(
            _read_template("02-container.README.md.tmpl"),
            id="sample-container",
            title="Sample Container",
            date=today,
        ),
        encoding="utf-8",
    )

    # Level 3 — sample component
    comp_dir = cont_dir / "03-components" / "sample-component"
    comp_dir.mkdir(parents=True)
    (comp_dir / "README.md").write_text(
        _render_template(
            _read_template("03-component.README.md.tmpl"),
            id="sample-container/sample-component",
            title="Sample Component",
            date=today,
        ),
        encoding="utf-8",
    )

    # Level 4 — sample leaf (no `references[]` populated; user fills after init)
    code_dir = comp_dir / "04-code"
    code_dir.mkdir()
    leaf_text = _render_template(
        _read_template("04-leaf.md.tmpl"),
        id="sample-container/sample-component/sample-leaf",
        title="Sample Leaf",
        date=today,
        source_path="src/sample.ts",
        source_sha="0000000000000000000000000000000000000000",
    )
    # Replace the templated source block with an empty list — placeholder SHA is invalid.
    leaf_text = leaf_text.replace(
        "references:\n  - path: src/sample.ts\n    sha: 0000000000000000000000000000000000000000\n    kind: source\n    role: primary",
        "references: []\n# After creating real source files, add references here:\n#  - path: src/foo.ts\n#    sha: <output of `git hash-object src/foo.ts`>\n#    kind: source\n#    role: primary",
    )
    (code_dir / "sample-leaf.md").write_text(leaf_text, encoding="utf-8")

    _summarize_init(docs)
    return 0


def _summarize_init(docs: Path) -> None:
    print(f"Initialized fmk-docs at {docs}")
    print("Tree:")
    for p in sorted(docs.rglob("*")):
        rel = p.relative_to(docs)
        if p.is_dir():
            print(f"  {rel}/")
        else:
            print(f"  {rel}")
    print()
    print("Next steps:")
    print(f"  1. Edit {docs}/.fmk-docs.yml — set include/ignore globs for your sources.")
    print("  2. Add real `references[]` entries to leaves with `git hash-object` SHAs.")
    print("  3. Run `python <skill>/scripts/fmk_docs.py check` to confirm freshness.")


# ---------------------------------------------------------------------------
# check


def cmd_check(args) -> int:
    repo = _resolve_repo(args)
    cfg = load_config(repo)
    try:
        entries = run_check(repo, cfg)
    except DocParseError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 7
    except FrontmatterError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 7

    if args.format == "json":
        sys.stdout.write(render.stale_json(entries))
    else:
        sys.stdout.write(render.stale_text(entries, no_color=args.no_color))

    has_missing = any(e.status == "missing" for e in entries)
    if has_missing and cfg.strictness.fail_on_missing_source:
        return 4
    if entries and args.strict:
        return 1
    return 0


# ---------------------------------------------------------------------------
# orphans


def cmd_orphans(args) -> int:
    repo = _resolve_repo(args)
    cfg = load_config(repo)
    try:
        rep = find_orphans(repo, cfg)
    except (DocParseError, FrontmatterError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 7
    except GitError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 8

    if args.format == "json":
        sys.stdout.write(render.orphans_json(rep))
    else:
        sys.stdout.write(render.orphans_text(rep, no_color=args.no_color))

    if rep.total_files > 0 and cfg.strictness.fail_on_orphan:
        return 6
    return 0


# ---------------------------------------------------------------------------
# graph


def cmd_graph(args) -> int:
    repo = _resolve_repo(args)
    cfg = load_config(repo)
    try:
        docs = walk_docs(repo / cfg.docs_root_path, repo)
    except (DocParseError, FrontmatterError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 7

    if args.format == "mermaid":
        print("graph TD")
        for d in docs:
            sid = d.id.replace("/", "_").replace("-", "_")
            print(f'  {sid}["L{d.level} {d.id}"]')
        for d in docs:
            sid = d.id.replace("/", "_").replace("-", "_")
            for ref in d.references:
                if ref.kind != "child":
                    continue
                target_path = (d.file.parent / ref.path).resolve()
                target_doc = next((x for x in docs if x.file.resolve() == target_path), None)
                if target_doc:
                    tid = target_doc.id.replace("/", "_").replace("-", "_")
                    print(f"  {sid} --> {tid}")
        return 0

    if args.format == "dot":
        print("digraph fmk_docs {")
        print("  rankdir=TB;")
        for d in docs:
            print(f'  "{d.id}" [label="L{d.level} {d.id}"];')
        for d in docs:
            for ref in d.references:
                if ref.kind != "child":
                    continue
                target_path = (d.file.parent / ref.path).resolve()
                target_doc = next((x for x in docs if x.file.resolve() == target_path), None)
                if target_doc:
                    print(f'  "{d.id}" -> "{target_doc.id}";')
        print("}")
        return 0

    # text
    docs_by_level: dict[int, list] = {}
    for d in docs:
        docs_by_level.setdefault(d.level, []).append(d)
    for lvl in sorted(docs_by_level):
        print(f"L{lvl}:")
        for d in docs_by_level[lvl]:
            print(f"  {d.id}  ({d.repo_relative})")
    return 0


# ---------------------------------------------------------------------------
# stat


def cmd_stat(args) -> int:
    repo = _resolve_repo(args)
    cfg = load_config(repo)
    try:
        docs = walk_docs(repo / cfg.docs_root_path, repo)
    except (DocParseError, FrontmatterError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 7

    if args.format == "json":
        import json as _json

        payload = [
            {
                "path": d.repo_relative,
                "id": d.id,
                "type": d.type,
                "level": d.level,
                "status": d.status,
                "last_synced": d.last_synced,
                "references": len(d.references),
                "sources": sum(1 for r in d.references if r.kind == "source"),
                "children": sum(1 for r in d.references if r.kind == "child"),
            }
            for d in docs
        ]
        sys.stdout.write(_json.dumps({"count": len(docs), "docs": payload}, indent=2) + "\n")
        return 0

    print(f"{'LV':>3}  {'TYPE':<10}  {'REFS':>4}  STATUS    ID")
    for d in sorted(docs, key=lambda x: (x.level, x.id)):
        print(
            f"{d.level:>3}  {d.type:<10}  {len(d.references):>4}  {d.status:<8}  {d.id}"
        )
    return 0


# ---------------------------------------------------------------------------
# parser


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="fmk-docs",
        description="Diagnostic CLI for C4-model documentation tracking.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    # init
    pi = sub.add_parser("init", help="Scaffold a fresh docs/ skeleton.")
    pi.add_argument("--root", default=".", help="Repo root (default: cwd)")
    pi.add_argument("--minimal", action="store_true", help="Only scaffold the level-1 context root.")
    pi.add_argument("--force", action="store_true", help="Overwrite existing docs/ (DESTRUCTIVE).")
    pi.set_defaults(func=cmd_init)

    # check
    pc = sub.add_parser("check", help="Report stale docs (deepest-first).")
    pc.add_argument("--root", default=".")
    pc.add_argument("--strict", action="store_true", help="Exit 1 if any drift is found.")
    pc.add_argument("--format", choices=["text", "json"], default="text")
    pc.add_argument("--no-color", action="store_true")
    pc.set_defaults(func=cmd_check)

    # orphans
    po = sub.add_parser("orphans", help="Report tracked source files no leaf references.")
    po.add_argument("--root", default=".")
    po.add_argument("--format", choices=["text", "json"], default="text")
    po.add_argument("--no-color", action="store_true")
    po.set_defaults(func=cmd_orphans)

    # graph
    pg = sub.add_parser("graph", help="Render the doc DAG.")
    pg.add_argument("--root", default=".")
    pg.add_argument("--format", choices=["mermaid", "dot", "text"], default="mermaid")
    pg.set_defaults(func=cmd_graph)

    # stat
    ps = sub.add_parser("stat", help="Per-doc summary.")
    ps.add_argument("--root", default=".")
    ps.add_argument("--format", choices=["text", "json"], default="text")
    ps.set_defaults(func=cmd_stat)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
