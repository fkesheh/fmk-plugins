"""Thin subprocess wrappers around git for fmk-docs.

Only uses commands that are read-only: rev-parse, hash-object, ls-files.
All paths returned are POSIX-style, repo-relative.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Iterable


class GitError(RuntimeError):
    """Raised when a git invocation fails or the cwd is not a git repo."""


def _run(args: list[str], cwd: Path | None = None, stdin: str | None = None) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        input=stdin,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise GitError(
            f"git {' '.join(args)} failed (exit {proc.returncode}): {proc.stderr.strip()}"
        )
    return proc.stdout


def is_git_repo(path: Path | None = None) -> bool:
    try:
        _run(["rev-parse", "--git-dir"], cwd=path)
        return True
    except GitError:
        return False


def repo_root(path: Path | None = None) -> Path:
    out = _run(["rev-parse", "--show-toplevel"], cwd=path).strip()
    if not out:
        raise GitError("not in a git repo")
    return Path(out)


def hash_object(path: Path) -> str:
    """Returns the git blob SHA-1 for the file's current content (40 hex)."""
    return _run(["hash-object", str(path)]).strip()


def hash_object_batch(paths: Iterable[Path], cwd: Path | None = None) -> dict[Path, str]:
    """Batch-hash files via stdin-paths. Returns dict path -> sha."""
    paths = list(paths)
    if not paths:
        return {}
    stdin = "\n".join(str(p) for p in paths) + "\n"
    out = _run(["hash-object", "--stdin-paths"], cwd=cwd, stdin=stdin)
    shas = [line.strip() for line in out.splitlines() if line.strip()]
    if len(shas) != len(paths):
        raise GitError(
            f"hash-object batch returned {len(shas)} shas for {len(paths)} paths"
        )
    return dict(zip(paths, shas))


def ls_files(
    cwd: Path | None = None,
    recurse_submodules: bool = False,
) -> list[str]:
    """List all tracked files (repo-relative POSIX paths)."""
    args = ["ls-files"]
    if recurse_submodules:
        args.append("--recurse-submodules")
    out = _run(args, cwd=cwd)
    return [line for line in out.splitlines() if line]
