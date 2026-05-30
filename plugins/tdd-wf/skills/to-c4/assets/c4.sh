#!/usr/bin/env bash
# c4.sh — drive Structurizr (validate / view / export) for a C4 workspace.dsl via Docker.
# Usage: ./c4.sh <validate|view|export|stop>   (run from the folder holding workspace.dsl)
set -euo pipefail

cli_image="structurizr/cli:${STRUCTURIZR_CLI_VERSION:-2025.11.09}"
ui_image="${STRUCTURIZR_UI_IMAGE:-structurizr/structurizr}"   # structurizr/lite is deprecated
ui_name="${C4_CONTAINER:-c4-structurizr}"
port="${C4_PORT:-9010}"
dsl="${C4_DSL:-workspace.dsl}"
mount="$(pwd):/usr/local/structurizr"

need_docker() { command -v docker >/dev/null 2>&1 || { echo "docker is required but not found on PATH." >&2; exit 127; }; }

case "${1:-}" in
  validate)
    need_docker
    docker run --rm -v "$mount" "$cli_image" validate -w "$dsl"
    echo "DSL ok: $dsl"
    ;;

  view)
    need_docker
    docker rm -f "$ui_name" >/dev/null 2>&1 || true
    docker run -d --name "$ui_name" -p "${port}:8080" -v "$mount" "$ui_image" local >/dev/null
    url="http://localhost:${port}"
    printf 'starting Structurizr UI at %s ' "$url"
    for _ in $(seq 1 "${C4_WAIT:-60}"); do
      if curl -sf "$url/" >/dev/null 2>&1; then echo "— ready"; break; fi
      if [ "$(docker inspect -f '{{.State.Status}}' "$ui_name" 2>/dev/null || echo gone)" != "running" ]; then
        echo "— container exited; logs:" >&2; docker logs "$ui_name" 2>&1 || true; exit 1
      fi
      printf '.'; sleep 1
    done
    command -v open >/dev/null 2>&1 && open "$url" 2>/dev/null || echo "open $url"
    ;;

  export)
    need_docker
    fmt="${2:-${C4_FORMAT:-mermaid}}"
    out="${C4_OUT:-exports}"
    mkdir -p "$out"
    docker run --rm -v "$mount" "$cli_image" export -workspace "$dsl" -format "$fmt" -output "$out"
    echo "exported $fmt diagrams to ./$out  (formats: mermaid, plantuml, dot, json, ilograph, websequencediagrams)"
    ;;

  stop)
    docker rm -f "$ui_name" >/dev/null 2>&1 || true
    echo "stopped $ui_name"
    ;;

  *)
    echo "usage: $0 <validate|view|export [format]|stop>" >&2
    exit 2
    ;;
esac
