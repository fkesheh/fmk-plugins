---
name: statusline
description: Install an opinionated Claude Code statusLine into ~/.claude/settings.json. Layout — `<folder>  <model>  effort: <level>  ctx: <human-tokens> / <pct>%`. Each segment after model is conditionally rendered (clean omit if its source JSON field is missing — no double-spaces, no literal "null"). Falls back to 1M / 200K context window size by inspecting the model display name. Reads existing settings.json non-destructively (preserves permissions, hooks, enabledPlugins, etc.), creates a .bak before write, validates JSON parses, and dry-runs the rendered command against synthetic payloads before declaring done. Supports two install modes — Mode A (inline shell embedded in settings.json) and Mode B (copy scripts/statusline.sh to ~/.claude/statusline.sh and point settings.json at it). TRIGGER on phrases like "set up my status line", "install my statusline", "configure statusline the opinionated way", "give me the FMK status line", "use the opinionated status line", "I want this status line layout", "/statusline-fmk". SKIP if the user wants a different layout (defer to their layout instead) or asks how status lines work in general (point at https://docs.claude.com/en/docs/claude-code/statusline).
---

# statusline — opinionated Claude Code status line

Installs an opinionated `statusLine` into the user's Claude Code settings. The rendered layout is one line:

```
<folder>  <model>  effort: <level>  ctx: <human-tokens> / <pct>%
```

Every segment after `<model>` is conditionally rendered. If the underlying JSON field is absent in the status-line stdin payload, that segment is omitted cleanly — no double-spaces, no trailing whitespace, no literal `null`.

Source of truth for the shell logic: `${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh`. Source of truth for the JSON fields consumed: https://docs.claude.com/en/docs/claude-code/statusline.

## Why this layout

- **Folder** — basename of `workspace.current_dir`. Quick context for which repo you are in.
- **Model** — `model.display_name`. Always shown — the most reliable field.
- **Effort** — `effort.level`. The value toggled via `/effort`. Useful when switching between max / high / default during a session.
- **Context** — `<human-readable token count> / <percentage used>`. Derived from `context_window.remaining_percentage` and `context_window.context_window_size` (with a model-name-based 1M / 200K fallback if the size field is absent).

The opinionated choices:

- No emojis — terminal noise; visual jitter when values change.
- No git branch — your IDE / shell prompt already shows that.
- No cost / duration — less actionable per-prompt; available in Claude Code's own UI.
- No timestamps — status line should be diff-able across renders without churn.
- One line — easy to scan in peripheral vision.

## JSON fields consumed (authoritative)

From the official Claude Code statusline payload:

| Field | Use |
|---|---|
| `.model.display_name` | Render the model column. |
| `.workspace.current_dir` | basename → folder column. |
| `.effort.level` | `effort: <level>` segment. Omitted if absent. |
| `.context_window.remaining_percentage` | Drives `pct` — `100 - remaining_percentage`. |
| `.context_window.context_window_size` | Total tokens. Falls back to 1M if `display_name` contains `1M`, else 200K. |

The script also reads a few non-canonical aliases (`.context_window.used`, `.context_window.total`, `.context_window.total_tokens`) defensively in case the schema evolves; all reduce to `// empty` if absent.

## Workflow

When the user asks for this status line, follow these steps in order.

### 1. Confirm intent

If the user invoked the skill explicitly ("install your statusline", "give me the opinionated layout"), proceed. If the request is ambiguous ("set up the status line"), confirm in one short sentence whether they want the FMK opinionated layout or the built-in `/statusline` flow.

### 2. Locate the settings file

- User-scope: `~/.claude/settings.json` (default — personal layout).
- Project-scope: `<project>/.claude/settings.json` (only if user explicitly wants the layout enforced for one repo).

If the file does not exist, create it with `{}` first.

### 3. Choose the install mode

Default to Mode A (inline) unless the user prefers Mode B.

- **Mode A — inline.** Embed the full escaped shell command directly in `settings.json`. Self-contained, one file, easy to share. What the FMK author currently uses.
- **Mode B — script reference.** Copy `${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh` to `~/.claude/statusline.sh`, `chmod +x`, and point `statusLine.command` at that path. Easier to tweak later — edit the script directly without re-running the skill. Note: `${CLAUDE_PLUGIN_ROOT}` is NOT resolved inside `~/.claude/settings.json` (only inside plugin-defined assets), so the script must be copied out to a stable user-scope path.

### 4. Read existing settings.json

Use the `Read` tool (so `Edit` will work afterward). Confirm it parses as JSON. If parse fails, stop and report the parse error to the user — do NOT overwrite a malformed file blindly.

### 5. Back up before writing

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak
```

Always back up. Status-line logic is harmless to misconfigure — the line just renders blank — but the surrounding settings file holds permissions, hooks, and plugin registrations that must not be lost.

### 6. Compose the new statusLine block

#### Mode A — inline

The exact JSON block to write. Replace the existing `statusLine` value (or insert if absent) with:

```json
"statusLine": {
  "type": "command",
  "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name // empty'); cwd=$(echo \"$input\" | jq -r '.workspace.current_dir // empty'); folder=$(basename \"$cwd\"); used=$(echo \"$input\" | jq -r '.context_window.used // .context_window.used_tokens // empty'); total=$(echo \"$input\" | jq -r '.context_window.context_window_size // .context_window.total // .context_window.total_tokens // empty'); rem_pct=$(echo \"$input\" | jq -r '.context_window.remaining_percentage // empty'); rem=$(echo \"$input\" | jq -r '.context_window.remaining // empty'); eff=$(echo \"$input\" | jq -r '.effort.level // empty'); if [ -z \"$total\" ]; then case \"$model\" in *1M*) total=1000000 ;; *) total=200000 ;; esac; fi; if [ -z \"$used\" ] && [ -n \"$rem\" ]; then used=$((total - rem)); fi; if [ -z \"$used\" ] && [ -n \"$rem_pct\" ]; then used=$(( total * (100 - rem_pct) / 100 )); fi; pct=\"\"; if [ -n \"$rem_pct\" ]; then pct=$((100 - rem_pct)); elif [ -n \"$used\" ] && [ \"$total\" -gt 0 ]; then pct=$(( used * 100 / total )); fi; hum=\"\"; if [ -n \"$used\" ]; then hum=$(awk -v n=\"$used\" 'BEGIN{ if(n>=1000000) printf \"%.1fM\",n/1000000; else if(n>=1000) printf \"%dK\",n/1000; else printf \"%d\",n }'); fi; ctx=\"\"; if [ -n \"$hum\" ] && [ -n \"$pct\" ]; then ctx=\"ctx: $hum / ${pct}%\"; elif [ -n \"$pct\" ]; then ctx=\"ctx: ${pct}%\"; elif [ -n \"$hum\" ]; then ctx=\"ctx: $hum\"; fi; out=\"$folder  $model\"; [ -n \"$eff\" ] && out=\"$out  effort: $eff\"; [ -n \"$ctx\" ] && out=\"$out  $ctx\"; printf \"%s\" \"$out\""
}
```

If you ever modify `scripts/statusline.sh`, regenerate the JSON-escaped form with:

```bash
python3 -c 'import json, sys; print(json.dumps(open(sys.argv[1]).read()))' \
  ${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh
```

— then update both this skill and the user's `settings.json`.

Use a non-destructive merge. Two cases:

- `statusLine` already exists → use `Edit` to replace just the `statusLine` block, leaving every other top-level key untouched.
- `statusLine` does not exist → use a Python load → modify → dump pass via `ctx_execute` to insert it cleanly:

  ```python
  import json
  with open('/Users/<user>/.claude/settings.json') as f:
      d = json.load(f)
  d['statusLine'] = {
      'type': 'command',
      'command': '<the long shell command>'
  }
  with open('/Users/<user>/.claude/settings.json', 'w') as f:
      json.dump(d, f, indent=2)
  ```

JSON-aware merging is safer than text-based edits when the file has unusual formatting, comments, or a missing/extra trailing newline.

#### Mode B — script reference

```bash
cp "${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh" ~/.claude/statusline.sh
chmod +x ~/.claude/statusline.sh
```

Then set `settings.json` to:

```json
"statusLine": {
  "type": "command",
  "command": "~/.claude/statusline.sh"
}
```

Same non-destructive merge rules as Mode A.

### 7. Validate the resulting settings.json

```python
import json
with open('/Users/<user>/.claude/settings.json') as f:
    d = json.load(f)
assert d['statusLine']['type'] == 'command'
assert d['statusLine']['command']
print('OK — top-level keys preserved:', sorted(d.keys()))
```

If parse fails, restore from `.bak` and surface the failure to the user.

### 8. Dry-run against synthetic payloads

Run the rendered command against at least these four cases before reporting done:

```bash
cmd=$(python3 -c "import json; print(json.load(open('/Users/<user>/.claude/settings.json'))['statusLine']['command'])")

# Case 1 — typical: effort + context
echo '{"model":{"display_name":"Claude Opus 4.7 (1M context)"},"workspace":{"current_dir":"/tmp/repo"},"context_window":{"remaining_percentage":78},"effort":{"level":"max"}}' | bash -c "$cmd"
# expect: repo  Claude Opus 4.7 (1M context)  effort: max  ctx: 220K / 22%

# Case 2 — no effort field
echo '{"model":{"display_name":"Claude Opus 4.7 (1M context)"},"workspace":{"current_dir":"/tmp/repo"},"context_window":{"remaining_percentage":78}}' | bash -c "$cmd"
# expect: repo  Claude Opus 4.7 (1M context)  ctx: 220K / 22%   (no double-spaces)

# Case 3 — no context_window
echo '{"model":{"display_name":"Claude Opus 4.7 (1M context)"},"workspace":{"current_dir":"/tmp/repo"},"effort":{"level":"high"}}' | bash -c "$cmd"
# expect: repo  Claude Opus 4.7 (1M context)  effort: high

# Case 4 — non-1M model: total falls back to 200K
echo '{"model":{"display_name":"Claude Sonnet 4.6"},"workspace":{"current_dir":"/tmp/repo"},"context_window":{"remaining_percentage":50},"effort":{"level":"high"}}' | bash -c "$cmd"
# expect: repo  Claude Sonnet 4.6  effort: high  ctx: 100K / 50%
```

If any case prints unexpected output (extra spaces, literal `null`, malformed segments), stop and surface the exact stdout.

### 9. Report

Tell the user:

- Path that was edited and the path of the `.bak` backup.
- One-line summary of the layout.
- Sample rendered output from Case 1 of the dry-run.
- The new layout takes effect on the next status-line render — typically the next assistant turn.

## Optional extensions

Offer these as follow-ups; do NOT auto-apply.

- **Output style** — render `style: <name>` from `.output_style.name`. Useful when switching between `default`, `explanatory`, etc.
- **Thinking mode indicator** — render `thinking` or `t` when `.thinking.enabled` is true.
- **Subagent name** — render `[<agent.name>]` when `.agent.name` is set.
- **Rate limits** — show `5h: <pct>%` from `.rate_limits.five_hour.used_percentage`.
- **Worktree name** — show `@<worktree.name>` when `.worktree.name` is set.

For each, the canonical field path is in https://docs.claude.com/en/docs/claude-code/statusline.

## Discipline (forbidden patterns)

- **Do not overwrite settings.json blindly.** Always Read first, parse JSON, back up before write.
- **Do not use shell heredocs to overwrite the entire file.** `cat <<EOF > settings.json` will drop unrelated keys. Use `Edit` for targeted replacement, or a Python `json.load → json.dump` pass for structural changes.
- **Do not invent JSON paths.** Every field used here is in the official docs. If you want to add a segment, look up the exact path first.
- **Do not skip the dry-run.** A status-line command with a typo will silently render nothing on every prompt — the user may not notice for a session, then complain later.
- **Do not assume `jq` is installed.** It usually is on macOS / Linux dev machines, but if absent the command renders blank. If the dry-run output is empty / wrong, suggest `brew install jq` (macOS) or `apt-get install jq` (Linux).
- **Do not modify the script in `${CLAUDE_PLUGIN_ROOT}` to "customize for the current user".** That file is the source of truth for the plugin. If a user wants a custom layout, install Mode B and edit `~/.claude/statusline.sh` instead.

## When to skip this skill

- The user wants a different layout (e.g., emojis, git branch, progress bar). Defer to their layout.
- The user only wants to know how status lines work in general — point at https://docs.claude.com/en/docs/claude-code/statusline.
- The user already has a status-line script under their own version control (dotfiles repo). Defer to their existing approach.
