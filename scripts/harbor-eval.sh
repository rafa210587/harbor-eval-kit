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
  have node || { say "BLOCKED: Node.js 24+ is required to snapshot installation ownership."; return 2; }
  node "$ROOT/scripts/installation.ts" snapshot "$MANIFEST"
}

doctor_podman() {
  ensure_state
  have podman || { say "BLOCKED: podman not found"; return 1; }
  node "$ROOT/scripts/installation.ts" gate "$MANIFEST"
  node "$ROOT/scripts/installation.ts" smoke "$MANIFEST"
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
  have uv || { say "uv install did not produce an executable"; return 2; }
  mark_installed uv
}

mark_installed() {
  node "$ROOT/scripts/installation.ts" mark "$MANIFEST" "$1"
}
install() {

  ensure_state
  doctor_podman
  install_uv
  if ! have harbor; then
    # Pinned, not "latest": this kit parses `harbor analyze` stdout, mirrors `harbor run --help`'s
    # adapter list, and reads result.json field names -- all of which are one release's behaviour
    # and all of which fail silently when it changes. Keep in lockstep with
    # TESTED_HARBOR_VERSION in scripts/lib/catalog.ts (a test enforces that they match).
    uv tool install "harbor==0.22.0"
    export PATH="$HOME/.local/bin:$PATH"
    mark_installed harbor
  fi
  harbor --help >/dev/null
  say "Harbor installed."
  say "NEXT GATE: run a minimal Harbor task to validate the installed Harbor version against Podman compatibility."
}

status() {
  node "$ROOT/scripts/harbor-cli.ts" status
  [ -f "$MANIFEST" ] && say "Manifest: $MANIFEST" || say "Manifest: absent"
}

init_evals() {
  say "Eval templates already exist under $ROOT/evals"
}

eval_cmd() {
  if [ "$#" -eq 0 ]; then
    say "This wrapper intentionally requires explicit experiment parameters."
    say "Example:"
    say "./scripts/harbor-eval.sh eval --dataset <dataset> --agent claude-code --model <model> --skill <skill> --env docker"
    return 0
  fi
  node "$ROOT/scripts/harbor-cli.ts" eval -- "$@"
}

uninstall() {
  have node || { say "BLOCKED: Node.js 24+ is required for manifest-verified cleanup."; return 2; }
  node "$ROOT/scripts/cleanup.ts" "--manifest=$MANIFEST" "$@"
}
cmd="${1:-help}"
shift || true
case "$cmd" in
  doctor) doctor ;;
  install) install ;;
  status) status ;;
  init-evals) init_evals ;;
  eval) eval_cmd "$@" ;;
  uninstall|cleanup) uninstall "$@" ;;
  *)
    cat <<EOF
Usage: $0 {doctor|install|status|init-evals|eval|uninstall [--dry-run]}
EOF
    ;;
esac
