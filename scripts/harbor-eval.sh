#!/usr/bin/env bash
set -euo pipefail

PREFIX="${HARBOR_EVAL_PREFIX:-harbor-eval-kit-}"
LABEL="${HARBOR_EVAL_LABEL:-io.harbor-eval-kit.managed=true}"
STATE_DIR="${HARBOR_EVAL_STATE_DIR:-$HOME/.harbor-eval-kit}"
MANIFEST="${HARBOR_EVAL_MANIFEST:-$STATE_DIR/installation-manifest.json}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say(){ printf '%s\n' "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }
ver(){ if have "$1"; then "$1" --version 2>&1 | head -n1 || true; else echo "missing"; fi; }

ensure_state() {
  mkdir -p "$STATE_DIR"
  if [ ! -f "$MANIFEST" ]; then
    python3 - "$MANIFEST" <<'PY'
import json,sys,datetime,platform,shutil
p=sys.argv[1]
tools=["podman","python3","uv","java","javac","mvn","gradle","node","npm","npx","harbor"]
data={
 "schema_version":1,
 "created_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "host":{"platform":platform.platform(),"machine":platform.machine()},
 "preexisting":{},
 "installed_by_kit":{},
 "managed_resources":{"containers":[],"images":[],"volumes":[],"networks":[]},
 "notes":[]
}
for t in tools:
    data["preexisting"][t]={"present":bool(shutil.which(t)),"path":shutil.which(t)}
with open(p,"w") as f: json.dump(data,f,indent=2)
PY
  fi
}

doctor_podman() {
  have podman || { say "BLOCKED: podman not found"; return 1; }
  podman info >/dev/null
  local img="${PREFIX}doctor-image"
  local ctr="${PREFIX}doctor-container"
  local vol="${PREFIX}doctor-volume"
  local net="${PREFIX}doctor-network"

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  cat >"$tmp/Containerfile" <<EOF
FROM docker.io/library/alpine:3.20
RUN echo ok >/image-ok
CMD ["sh","-lc","sleep 60"]
LABEL io.harbor-eval-kit.managed="true"
EOF
  podman build -t "$img" "$tmp" >/dev/null
  podman volume create --label "$LABEL" "$vol" >/dev/null
  podman network create --label "$LABEL" "$net" >/dev/null
  podman run -d --name "$ctr" --label "$LABEL" --network "$net" -v "$vol:/managed" "$img" >/dev/null
  podman exec "$ctr" test -f /image-ok
  podman exec "$ctr" sh -lc 'echo ok >/managed/volume-ok'
  podman exec "$ctr" test -f /managed/volume-ok
  podman rm -f "$ctr" >/dev/null
  podman volume rm "$vol" >/dev/null
  podman network rm "$net" >/dev/null
  podman rmi "$img" >/dev/null
}

doctor() {
  say "== Harbor Eval Kit doctor =="
  say "OS: $(uname -a 2>/dev/null || true)"
  for t in podman python3 uv java javac mvn gradle node npm npx harbor; do
    printf '%-10s %s\n' "$t" "$(ver "$t")"
  done
  doctor_podman
  say "Podman primitive smoke tests: PASS"

  if have docker; then
    say "docker command detected. The kit will not install or require Docker."
  else
    say "docker command not detected: OK"
  fi

  if have harbor; then
    harbor --help >/dev/null
    say "Harbor CLI: PASS"
  else
    say "Harbor CLI: not installed"
  fi

  say "NOTE: Harbor<->Podman compatibility is only READY after a real Harbor task runs."
}

install_uv() {
  if have uv; then return 0; fi
  say "Installing uv at user level..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
}

mark_installed() {
  local tool="$1"
  python3 - "$MANIFEST" "$tool" <<'PY'
import json,sys,shutil
p,t=sys.argv[1:]
d=json.load(open(p))
d.setdefault("installed_by_kit",{})[t]={"installed":True,"path":shutil.which(t)}
json.dump(d,open(p,"w"),indent=2)
PY
}

install() {
  if ! have python3; then
    say "BLOCKED: python3 missing. Install an isolated/user-level Python appropriate to this OS, then rerun."
    exit 2
  fi
  ensure_state
  doctor_podman
  install_uv
  if ! have harbor; then
    uv tool install harbor
    export PATH="$HOME/.local/bin:$PATH"
    mark_installed harbor
  fi
  harbor --help >/dev/null
  say "Harbor installed."
  say "NEXT GATE: run a minimal Harbor task to validate the installed Harbor version against Podman compatibility."
}

status() {
  doctor
  if [ -f "$MANIFEST" ]; then
    say "Manifest: $MANIFEST"
  else
    say "Manifest: absent"
  fi
}

init_evals() {
  say "Eval templates already exist under $ROOT/evals"
}

eval_cmd() {
  have harbor || { say "Harbor missing. Run install first."; exit 2; }
  say "This wrapper intentionally requires explicit experiment parameters."
  say "Example:"
  say "harbor run --dataset <dataset> --agent claude-code --model <model> --skill <skill>"
}

managed_ids() {
  local kind="$1"
  case "$kind" in
    container) podman ps -a --filter "label=$LABEL" --format '{{.ID}} {{.Names}}' ;;
    image) podman images --filter "label=$LABEL" --format '{{.ID}} {{.Repository}}:{{.Tag}}' ;;
    volume) podman volume ls --filter "label=$LABEL" --format '{{.Name}}' ;;
    network) podman network ls --filter "label=$LABEL" --format '{{.ID}} {{.Name}}' ;;
  esac
}

uninstall() {
  local dry="${1:-}"
  say "Managed containers:"; managed_ids container || true
  say "Managed images:"; managed_ids image || true
  say "Managed volumes:"; managed_ids volume || true
  say "Managed networks:"; managed_ids network || true

  if [ "$dry" = "--dry-run" ]; then
    say "DRY RUN: nothing removed."
    return 0
  fi

  ids="$(podman ps -aq --filter "label=$LABEL" || true)"
  [ -z "$ids" ] || podman rm -f $ids

  vols="$(podman volume ls -q --filter "label=$LABEL" || true)"
  [ -z "$vols" ] || podman volume rm $vols

  nets="$(podman network ls -q --filter "label=$LABEL" || true)"
  [ -z "$nets" ] || podman network rm $nets

  imgs="$(podman images -q --filter "label=$LABEL" || true)"
  [ -z "$imgs" ] || podman rmi $imgs

  if [ -f "$MANIFEST" ] && have python3; then
    should_remove="$(python3 - "$MANIFEST" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
print("yes" if d.get("installed_by_kit",{}).get("harbor",{}).get("installed") else "no")
PY
)"
    if [ "$should_remove" = "yes" ] && have uv; then
      uv tool uninstall harbor || true
    fi
  fi
  say "Cleanup complete. Podman and preexisting toolchains preserved."
}

cmd="${1:-help}"
shift || true
case "$cmd" in
  doctor) doctor ;;
  install) install ;;
  status) status ;;
  init-evals) init_evals ;;
  eval) eval_cmd "$@" ;;
  uninstall|cleanup) uninstall "${1:-}" ;;
  *)
    cat <<EOF
Usage: $0 {doctor|install|status|init-evals|eval|uninstall [--dry-run]}
EOF
    ;;
esac
