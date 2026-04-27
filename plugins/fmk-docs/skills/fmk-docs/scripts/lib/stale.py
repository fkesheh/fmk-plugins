"""Compute the staleness report for a docs/ tree."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Config
from .git import GitError, hash_object
from .graph import Doc, Reference, walk_docs


@dataclass
class StaleEntry:
    doc_repo_path: str          # repo-relative path to the doc
    doc_id: str
    doc_level: int
    doc_type: str
    ref_path: str               # the reference's path field, as written in the doc
    ref_resolved: str | None    # repo-relative resolved path (None if missing)
    ref_kind: str               # "source" | "child"
    status: str                 # "drift" | "missing"
    sha_recorded: str
    sha_current: str | None     # None if missing


def _resolve(ref: Reference, doc_file: Path, repo_root: Path) -> Path:
    """Resolve a reference's path; returns absolute path.

    Convention:
      - kind == 'source': path is repo-relative POSIX (e.g., `src/foo.ts`).
        Leading `./` or `../` are still honored relative to the doc dir
        (escape hatch for assets sitting next to the doc).
      - kind == 'child': path is relative to the doc's directory
        (e.g., `./04-code/foo.md`).
    """
    raw = ref.path
    p = Path(raw)
    if p.is_absolute():
        return p
    if ref.kind == "source" and not raw.startswith(("./", "../")):
        return (repo_root / raw).resolve()
    return (doc_file.parent / raw).resolve()


def check(repo_root: Path, cfg: Config) -> list[StaleEntry]:
    docs_root = repo_root / cfg.docs_root_path
    docs = walk_docs(docs_root, repo_root)
    entries: list[StaleEntry] = []
    sha_cache: dict[Path, str] = {}

    for doc in docs:
        for ref in doc.references:
            target_abs = _resolve(ref, doc.file, repo_root)
            if not target_abs.exists():
                entries.append(
                    StaleEntry(
                        doc_repo_path=doc.repo_relative,
                        doc_id=doc.id,
                        doc_level=doc.level,
                        doc_type=doc.type,
                        ref_path=ref.path,
                        ref_resolved=None,
                        ref_kind=ref.kind,
                        status="missing",
                        sha_recorded=ref.sha,
                        sha_current=None,
                    )
                )
                continue
            if target_abs in sha_cache:
                cur = sha_cache[target_abs]
            else:
                try:
                    cur = hash_object(target_abs)
                except GitError:
                    cur = ""
                sha_cache[target_abs] = cur
            if cur != ref.sha:
                try:
                    rel = str(target_abs.resolve().relative_to(repo_root.resolve())).replace("\\", "/")
                except ValueError:
                    rel = str(target_abs)
                entries.append(
                    StaleEntry(
                        doc_repo_path=doc.repo_relative,
                        doc_id=doc.id,
                        doc_level=doc.level,
                        doc_type=doc.type,
                        ref_path=ref.path,
                        ref_resolved=rel,
                        ref_kind=ref.kind,
                        status="drift",
                        sha_recorded=ref.sha,
                        sha_current=cur,
                    )
                )

    entries.sort(key=lambda e: (-e.doc_level, e.doc_repo_path, e.ref_path))
    return entries
