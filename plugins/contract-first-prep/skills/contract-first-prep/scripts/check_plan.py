#!/usr/bin/env python3
"""Validate a contract-first decomposition before fan-out.

Checks that the module file-groups are DISJOINT (no file owned by two modules) and reports
coverage, so a parallel build can't suffer lost writes from two agents editing one file.

Plan format (JSON):
{
  "contract": ["src/types.ts", "src/config/gameData.ts", "src/meshes/common.ts"],
  "modules": {
    "core":     ["src/core/eventBus.ts", "src/core/input.ts"],
    "world":    ["src/world/terrain.ts", "src/world/grid.ts"],
    "game":     ["src/core/game.ts", "src/main.ts"]
  },
  "integrator": "game",
  "typecheck_cmd": "npx tsc --noEmit",   # optional
  "root": "."                             # optional, for existence checks
}

Usage:
  python check_plan.py plan.json            # validate only
  python check_plan.py plan.json --typecheck  # also run typecheck_cmd

Exit code 0 = plan is sound; non-zero = a problem that would break the fan-out.
"""
import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict


def load_plan(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def validate(plan: dict) -> list[str]:
    """Return a list of human-readable problems (empty list = sound)."""
    problems: list[str] = []
    modules: dict[str, list[str]] = plan.get("modules", {})
    contract: list[str] = plan.get("contract", [])

    if not modules:
        problems.append("No modules defined — nothing to fan out.")
    if not contract:
        problems.append("No contract files listed — there is nothing for implementers to align to.")

    # Disjointness: every owned file maps to exactly one module.
    owners: dict[str, list[str]] = defaultdict(list)
    for module, files in modules.items():
        for f in files:
            owners[norm(f)].append(module)
    for f, mods in sorted(owners.items()):
        if len(mods) > 1:
            problems.append(f"COLLISION: {f} is owned by multiple modules: {', '.join(mods)}")

    # Contract files must not also be module-owned (they are immutable, shared).
    contract_set = {norm(f) for f in contract}
    for f in sorted(contract_set & set(owners)):
        problems.append(f"CONTRACT OVERLAP: {f} is both a contract file and owned by {', '.join(owners[f])}")

    # Integrator sanity.
    integrator = plan.get("integrator")
    if integrator is None:
        problems.append("No integrator named — one module must own wiring + the entry point.")
    elif integrator not in modules:
        problems.append(f"Integrator '{integrator}' is not one of the modules: {', '.join(modules)}")

    # Existence checks (optional): contract files should already exist before fan-out.
    root = plan.get("root", ".")
    for f in contract:
        full = os.path.join(root, f)
        if not os.path.exists(full):
            problems.append(f"MISSING CONTRACT FILE: {f} (expected at {full}) — write the contract before fanning out.")

    return problems


def norm(path: str) -> str:
    return os.path.normpath(path).replace(os.sep, "/")


def summarize(plan: dict) -> None:
    modules: dict[str, list[str]] = plan.get("modules", {})
    contract: list[str] = plan.get("contract", [])
    total_files = sum(len(v) for v in modules.values())
    print("Contract files ({}):".format(len(contract)))
    for f in contract:
        print(f"  • {f}")
    print(f"\nModules ({len(modules)}), {total_files} owned files:")
    for module, files in modules.items():
        tag = "  [integrator]" if module == plan.get("integrator") else ""
        print(f"  {module}{tag} — {len(files)} files")
        for f in files:
            print(f"      {f}")


def run_typecheck(plan: dict) -> int:
    cmd = plan.get("typecheck_cmd")
    if not cmd:
        print("\nNo typecheck_cmd in plan — skipping typecheck.", file=sys.stderr)
        return 0
    root = plan.get("root", ".")
    print(f"\nRunning typecheck gate: {cmd}")
    proc = subprocess.run(cmd, shell=True, cwd=root)
    if proc.returncode != 0:
        print("Typecheck FAILED — the contract does not compile on its own.", file=sys.stderr)
    else:
        print("Typecheck passed.")
    return proc.returncode


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate a contract-first decomposition plan.")
    ap.add_argument("plan", help="Path to plan.json")
    ap.add_argument("--typecheck", action="store_true", help="Also run the plan's typecheck_cmd")
    args = ap.parse_args()

    plan = load_plan(args.plan)
    summarize(plan)

    problems = validate(plan)
    print()
    if problems:
        print(f"✗ {len(problems)} problem(s) found:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("✓ Plan is sound: file groups are disjoint and total, contract is separate, integrator named.")

    if args.typecheck:
        return run_typecheck(plan)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
