"""Find tracked source files that no leaf or aggregator references."""
from __future__ import annotations

import fnmatch
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .config import Config
from .git import ls_files
from .graph import walk_docs


@dataclass
class OrphanReport:
    files: list[str]                      # repo-relative POSIX paths
    grouped: dict[str, list[str]]         # group_key -> sorted paths
    total_files: int
    total_groups: int


def _segment_match(path_segs: list[str], pat_segs: list[str]) -> bool:
    """Match path against a glob with `**` = zero+ segments, `*` = one segment minus `/`."""
    if not pat_segs:
        return not path_segs
    head, *rest = pat_segs
    if head == "**":
        if not rest:
            return True  # `**` at end matches everything below
        for i in range(len(path_segs) + 1):
            if _segment_match(path_segs[i:], rest):
                return True
        return False
    if not path_segs:
        return all(p == "**" for p in pat_segs)
    if fnmatch.fnmatchcase(path_segs[0], head):
        return _segment_match(path_segs[1:], rest)
    return False


def _matches_any(path: str, globs: list[str]) -> bool:
    """Gitignore-ish glob match: `**` spans path segments; `*` is single segment."""
    path_segs = path.split("/")
    for g in globs:
        if not g:
            continue
        # Bare basename pattern (no slashes) should match the basename in any dir.
        if "/" not in g:
            if fnmatch.fnmatchcase(path_segs[-1], g):
                return True
        if _segment_match(path_segs, g.split("/")):
            return True
    return False


def _ignore_globs_from_file(repo_root: Path, cfg: Config) -> list[str]:
    extra: list[str] = []
    p = repo_root / cfg.docs_root_path / ".fmk-docs-ignore"
    if p.is_file():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                extra.append(line)
    return extra


def _group_key(path: str, group_by: str) -> str:
    if group_by == "ext":
        suf = PurePosixPath(path).suffix or "(no ext)"
        return suf
    parent = str(PurePosixPath(path).parent)
    return parent if parent else "."


def find_orphans(repo_root: Path, cfg: Config) -> OrphanReport:
    include_globs = cfg.include or ["**/*"]
    ignore_globs = list(cfg.ignore) + _ignore_globs_from_file(repo_root, cfg)

    tracked_all = ls_files(cwd=repo_root, recurse_submodules=cfg.recurse_submodules)

    tracked: list[str] = []
    for p in tracked_all:
        if not _matches_any(p, include_globs):
            continue
        if _matches_any(p, ignore_globs):
            continue
        tracked.append(p)

    docs = walk_docs(repo_root / cfg.docs_root_path, repo_root)
    covered: set[str] = set()
    for doc in docs:
        for ref in doc.references:
            if ref.kind != "source":
                continue
            if ref.role and ref.role not in cfg.coverage_roles:
                continue
            raw = ref.path
            try:
                if raw.startswith(("./", "../")):
                    resolved = (doc.file.parent / raw).resolve()
                else:
                    resolved = (repo_root / raw).resolve()
                rel = str(resolved.relative_to(repo_root.resolve())).replace("\\", "/")
            except (ValueError, OSError):
                rel = raw
            covered.add(rel)

    uncovered = sorted(set(tracked) - covered)

    grouped: dict[str, list[str]] = defaultdict(list)
    for p in uncovered:
        grouped[_group_key(p, cfg.group_by)].append(p)
    grouped_sorted = {k: grouped[k] for k in sorted(grouped)}

    return OrphanReport(
        files=uncovered,
        grouped=grouped_sorted,
        total_files=len(uncovered),
        total_groups=len(grouped_sorted),
    )
