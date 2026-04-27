"""Read/write YAML frontmatter blocks in markdown files.

Format: file starts with `---\\n`, followed by YAML, then `---\\n`, then body.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


class FrontmatterError(ValueError):
    """Raised when a doc has malformed or missing frontmatter."""


_FENCE = "---"


def parse(path: Path) -> tuple[dict[str, Any], str]:
    """Returns (frontmatter_dict, body_str). Raises if no fence pair found."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith(_FENCE + "\n") and not text.startswith(_FENCE + "\r\n"):
        raise FrontmatterError(f"{path}: no opening '---' fence")
    rest = text[len(_FENCE) :].lstrip("\r\n")
    end = rest.find("\n" + _FENCE)
    if end < 0:
        raise FrontmatterError(f"{path}: no closing '---' fence")
    yaml_block = rest[:end]
    body_start = end + len("\n" + _FENCE)
    body = rest[body_start:].lstrip("\r\n")
    try:
        data = yaml.safe_load(yaml_block) or {}
    except yaml.YAMLError as exc:
        raise FrontmatterError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise FrontmatterError(f"{path}: frontmatter must be a YAML mapping")
    return data, body


def dump(path: Path, frontmatter: dict[str, Any], body: str) -> None:
    """Write frontmatter + body atomically."""
    yaml_block = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True).rstrip()
    body = body.lstrip("\r\n")
    payload = f"{_FENCE}\n{yaml_block}\n{_FENCE}\n\n{body}"
    if not payload.endswith("\n"):
        payload += "\n"
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)
