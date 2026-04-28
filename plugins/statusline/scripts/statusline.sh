#!/usr/bin/env bash
# Opinionated Claude Code status line.
#
# Reads the JSON status payload Claude Code writes to stdin (see
# https://docs.claude.com/en/docs/claude-code/statusline for the full
# schema) and renders one line:
#
#   <folder>  <model>  [effort: <level>]  [ctx: <human-tokens> / <pct>%]
#
# Each segment after <model> is conditionally rendered: when the
# corresponding JSON field is missing, the segment is omitted with no
# double-spaces and no trailing whitespace.
#
# JSON fields consumed:
#   .model.display_name               (always shown)
#   .workspace.current_dir            (basename -> folder)
#   .effort.level                     (omit if absent)
#   .context_window.remaining_percentage  (used to derive pct + token count)
#   .context_window.context_window_size   (preferred for total; falls back
#                                          to 1M if the model name contains
#                                          "1M", else 200K)
#
# Dependencies: jq, awk, basename, printf — all standard on macOS / Linux.

input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // empty')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // empty')
folder=$(basename "$cwd")
used=$(echo "$input" | jq -r '.context_window.used // .context_window.used_tokens // empty')
total=$(echo "$input" | jq -r '.context_window.context_window_size // .context_window.total // .context_window.total_tokens // empty')
rem_pct=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')
rem=$(echo "$input" | jq -r '.context_window.remaining // empty')
eff=$(echo "$input" | jq -r '.effort.level // empty')

if [ -z "$total" ]; then
  case "$model" in
    *1M*) total=1000000 ;;
    *)    total=200000 ;;
  esac
fi

if [ -z "$used" ] && [ -n "$rem" ]; then
  used=$((total - rem))
fi
if [ -z "$used" ] && [ -n "$rem_pct" ]; then
  used=$(( total * (100 - rem_pct) / 100 ))
fi

pct=""
if [ -n "$rem_pct" ]; then
  pct=$((100 - rem_pct))
elif [ -n "$used" ] && [ "$total" -gt 0 ]; then
  pct=$(( used * 100 / total ))
fi

hum=""
if [ -n "$used" ]; then
  hum=$(awk -v n="$used" 'BEGIN{
    if      (n >= 1000000) printf "%.1fM", n/1000000
    else if (n >= 1000)    printf "%dK",   n/1000
    else                   printf "%d",    n
  }')
fi

ctx=""
if   [ -n "$hum" ] && [ -n "$pct" ]; then ctx="ctx: $hum / ${pct}%"
elif [ -n "$pct" ];                  then ctx="ctx: ${pct}%"
elif [ -n "$hum" ];                  then ctx="ctx: $hum"
fi

out="$folder  $model"
[ -n "$eff" ] && out="$out  effort: $eff"
[ -n "$ctx" ] && out="$out  $ctx"
printf "%s" "$out"
