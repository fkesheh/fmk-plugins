"""Walk the docs/ tree and parse every doc into typed objects."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .frontmatter import FrontmatterError, parse


@dataclass
class Reference:
    path: str
    sha: str
    kind: str  # "source" | "child"
    role: str | None = None  # only for kind == "source"


@dataclass
class Doc:
    file: Path                      # absolute path on disk
    repo_relative: str              # repo-relative POSIX path
    type: str                       # "leaf" | "aggregator"
    id: str
    title: str
    level: int                      # 1..4
    parent: str | None
    status: str
    last_synced: str | None
    sha_method: str
    references: list[Reference] = field(default_factory=list)
    body: str = ""

    @property
    def is_leaf(self) -> bool:
        return self.type == "leaf"

    @property
    def is_aggregator(self) -> bool:
        return self.type == "aggregator"


class DocParseError(ValueError):
    """Raised when a doc is malformed (missing required fields, wrong types)."""


_REQUIRED = ("type", "id", "title", "level", "status", "sha_method")


def _coerce_reference(raw: Any, doc_path: Path) -> Reference:
    if not isinstance(raw, dict):
        raise DocParseError(f"{doc_path}: each reference must be a mapping; got {type(raw).__name__}")
    for f in ("path", "sha", "kind"):
        if f not in raw:
            raise DocParseError(f"{doc_path}: reference missing '{f}' field")
    if raw["kind"] not in ("source", "child"):
        raise DocParseError(f"{doc_path}: reference 'kind' must be 'source' or 'child'")
    sha = str(raw["sha"]).strip()
    if sha and not (len(sha) == 40 and all(c in "0123456789abcdef" for c in sha)):
        raise DocParseError(f"{doc_path}: reference 'sha' must be 40-hex SHA-1; got '{sha}'")
    return Reference(
        path=str(raw["path"]),
        sha=sha,
        kind=raw["kind"],
        role=str(raw["role"]) if raw.get("role") is not None else None,
    )


def parse_doc(file: Path, repo_root: Path) -> Doc:
    """Parse one .md file into a Doc. Raises DocParseError on schema violation."""
    fm, body = parse(file)
    for f in _REQUIRED:
        if f not in fm:
            raise DocParseError(f"{file}: missing required frontmatter field '{f}'")
    if fm["type"] not in ("leaf", "aggregator"):
        raise DocParseError(f"{file}: 'type' must be 'leaf' or 'aggregator'")
    level = fm["level"]
    if not isinstance(level, int) or level < 1 or level > 4:
        raise DocParseError(f"{file}: 'level' must be int 1..4; got {level!r}")
    refs_raw = fm.get("references") or []
    if not isinstance(refs_raw, list):
        raise DocParseError(f"{file}: 'references' must be a list")
    refs = [_coerce_reference(r, file) for r in refs_raw]
    return Doc(
        file=file,
        repo_relative=str(file.resolve().relative_to(repo_root.resolve())).replace("\\", "/"),
        type=fm["type"],
        id=str(fm["id"]),
        title=str(fm["title"]),
        level=level,
        parent=str(fm["parent"]) if fm.get("parent") else None,
        status=str(fm["status"]),
        last_synced=str(fm["last_synced"]) if fm.get("last_synced") else None,
        sha_method=str(fm["sha_method"]),
        references=refs,
        body=body,
    )


def walk_docs(docs_root: Path, repo_root: Path) -> list[Doc]:
    """Find every .md in docs_root with valid frontmatter; return sorted list."""
    if not docs_root.is_dir():
        return []
    docs: list[Doc] = []
    errors: list[tuple[Path, str]] = []
    for md in sorted(docs_root.rglob("*.md")):
        try:
            docs.append(parse_doc(md, repo_root))
        except (FrontmatterError, DocParseError) as exc:
            errors.append((md, str(exc)))
    if errors:
        msg = "\n".join(f"  - {p}: {e}" for p, e in errors)
        raise DocParseError(f"failed to parse {len(errors)} doc(s):\n{msg}")
    return docs


def topo_by_depth(docs: list[Doc], deepest_first: bool = True) -> list[Doc]:
    return sorted(docs, key=lambda d: d.level, reverse=deepest_first)
