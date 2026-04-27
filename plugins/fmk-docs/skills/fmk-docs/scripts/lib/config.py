"""Load and validate `docs/.fmk-docs.yml`. Provides typed defaults."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class ShaConfig:
    method: str = "git-hash-object"
    algorithm: str = "sha1"


@dataclass
class LevelsConfig:
    context: str = "01-context"
    containers: str = "02-containers"
    components: str = "03-components"
    code: str = "04-code"


@dataclass
class StrictnessConfig:
    fail_on_missing_source: bool = True
    fail_on_orphan: bool = False


@dataclass
class Config:
    version: int = 1
    docs_root: str = "docs"
    levels: LevelsConfig = field(default_factory=LevelsConfig)
    sha: ShaConfig = field(default_factory=ShaConfig)
    include: list[str] = field(default_factory=list)
    ignore: list[str] = field(default_factory=list)
    coverage_roles: list[str] = field(default_factory=lambda: ["primary"])
    strictness: StrictnessConfig = field(default_factory=StrictnessConfig)
    group_by: str = "dir"
    recurse_submodules: bool = False

    @property
    def docs_root_path(self) -> Path:
        return Path(self.docs_root)


_DEFAULT_IGNORE = [
    "**/*.test.*",
    "**/*.spec.*",
    "**/__generated__/**",
    "**/__pycache__/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/target/**",
    "**/.next/**",
    "**/.turbo/**",
]


def load_config(repo_root: Path) -> Config:
    """Loads `<repo>/docs/.fmk-docs.yml` if present; otherwise returns defaults."""
    cfg_path = repo_root / "docs" / ".fmk-docs.yml"
    raw: dict = {}
    if cfg_path.is_file():
        with cfg_path.open("r", encoding="utf-8") as fh:
            raw = yaml.safe_load(fh) or {}

    levels_raw = raw.get("levels") or {}
    sha_raw = raw.get("sha") or {}
    strict_raw = raw.get("strictness") or {}

    cfg = Config(
        version=int(raw.get("version", 1)),
        docs_root=raw.get("docs_root", "docs"),
        levels=LevelsConfig(
            context=levels_raw.get("context", "01-context"),
            containers=levels_raw.get("containers", "02-containers"),
            components=levels_raw.get("components", "03-components"),
            code=levels_raw.get("code", "04-code"),
        ),
        sha=ShaConfig(
            method=sha_raw.get("method", "git-hash-object"),
            algorithm=sha_raw.get("algorithm", "sha1"),
        ),
        include=list(raw.get("include") or []),
        ignore=list(raw.get("ignore") or _DEFAULT_IGNORE),
        coverage_roles=list(raw.get("coverage_roles") or ["primary"]),
        strictness=StrictnessConfig(
            fail_on_missing_source=bool(strict_raw.get("fail_on_missing_source", True)),
            fail_on_orphan=bool(strict_raw.get("fail_on_orphan", False)),
        ),
        group_by=raw.get("group_by", "dir"),
        recurse_submodules=bool(raw.get("recurse_submodules", False)),
    )
    return cfg
