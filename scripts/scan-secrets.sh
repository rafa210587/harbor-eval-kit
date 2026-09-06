#!/usr/bin/env bash
# Scans for credentials that must never enter this repository.
#
# Two modes:
#   scan-secrets.sh --staged    what `git commit` is about to record (used by the pre-commit hook)
#   scan-secrets.sh [path...]   files on disk (default: everything git tracks) -- for CI / manual runs
#
# Exit codes: 0 = clean, 1 = something that looks like a credential, 2 = usage error.
#
# Design notes:
# - Only ADDED lines are scanned in --staged mode: rewriting history is not this hook's job, and
#   scanning removals would block the very commit that deletes a leaked key.
# - Patterns are deliberately shaped to match real key MATERIAL, not the mere mention of a key's
#   NAME. This repo's docs legitimately say ANTHROPIC_API_KEY a hundred times; blocking that
#   would train everyone to pass --no-verify, which is worse than no hook at all.
# - Bash (not PowerShell) so one implementation covers macOS, Linux and Git Bash on Windows,
#   which is what git runs hooks under there.
set -uo pipefail

MODE="files"
PATHS=()
if [ "${1:-}" = "--staged" ]; then
  MODE="staged"
  shift
fi
PATHS=("$@")

# --- what counts as a credential -------------------------------------------------------------
# Vendor-specific formats first (very low false-positive rate), then a generic assignment rule.
PATTERNS=(
  'sk-ant-[A-Za-z0-9_-]{20,}'
  'sk-[A-Za-z0-9]{32,}'
  'sk-proj-[A-Za-z0-9_-]{20,}'
  'AIza[0-9A-Za-z_-]{35}'
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'gh[pousr]_[A-Za-z0-9]{36,}'
  'github_pat_[A-Za-z0-9_]{40,}'
  'xox[baprs]-[A-Za-z0-9-]{12,}'
  'gsk_[A-Za-z0-9]{40,}'
  'r8_[A-Za-z0-9]{35,}'
  'AC[a-f0-9]{32}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

# Same idea, but matched case-insensitively: config files write `password:` and `api_key=` in
# lower case at least as often as upper. Kept in a separate list so the vendor formats above
# stay case-sensitive (an uppercase-only prefix like AKIA should not match "akia" in prose).
PATTERNS_I=(
  # A secret-ish NAME assigned a long opaque VALUE on the same line. Requires >=20 chars of key
  # material, so `ANTHROPIC_API_KEY` alone, `KEY=` alone, or a masked `****1532` never trips it.
  '(api_?key|secret|token|password|passwd|credential)[a-z0-9_]*["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+_-]{20,}'
)

# Lines that look like a credential but provably are not: documentation placeholders, masked
# values, and the env-var *plumbing* this kit is made of (`extraEnv: { [envKey]: apiKey }`).
ALLOW='(\*{3,}|<[^>]*>|\$\{|\$[A-Za-z_]|%[A-Za-z_]+%|YOUR_|EXAMPLE|PLACEHOLDER|xxx+|XXX+|\.\.\.|process\.env|os\.environ|envKey|apiKey|secretsEnv|\bname\b|placeholder)'

# Files that must never be committed at all, whatever their contents.
FORBIDDEN_NAMES='(^|/)(secrets\.env|\.env(\..*)?|id_rsa|id_ed25519|.*\.pem|.*\.pfx|.*\.p12|credentials\.json)$'

fail=0

report() {
  # $1 = location, $2 = offending line (already trimmed). Only prints -- it must NOT try to set
  # `fail`, because scan_text runs as the last stage of a pipeline and bash runs pipeline
  # stages in subshells, so an assignment here would be discarded when that subshell exits.
  # Failure travels back through scan_text's EXIT STATUS instead; callers set `fail`.
  # (Caught by test: an earlier version assigned fail=1 here, printed the warning, and let the
  # commit through anyway.)
  echo "  ✗ $1"
  echo "      ${2:0:120}"
}

check_name() {
  local path="$1"
  if echo "$path" | grep -Eq "$FORBIDDEN_NAMES"; then
    # .env.example is a template of NAMES, not values -- explicitly fine.
    case "$path" in
      *.env.example|*.env.sample) return 0 ;;
    esac
    echo "  ✗ $path"
    echo "      arquivo de credencial — nunca deve ser versionado (veja .gitignore)"
    fail=1
  fi
}

scan_text() {
  # $1 = label for messages, stdin = text to scan.
  # Returns 1 if anything was reported, 0 if clean -- see the note in report().
  local label="$1"
  local found=0
  local content
  content="$(cat)"
  local pattern hits
  # `grep -E -- "$pattern"`: without the `--`, a pattern starting with "-" (every PEM header,
  # `-----BEGIN ... PRIVATE KEY-----`) is parsed as command-line options and silently never
  # matches. That bug made private keys invisible to this scanner until it was caught by test.
  #
  # Vendor-format patterns are NOT run through the allowlist: a string shaped like a real
  # sk-ant-/AKIA/ghp_/AIza key has no business being in this repo even inside an example. The
  # allowlist applies only to the generic name=value rule, which is the one that would
  # otherwise fire on documentation. Failing toward "blocks a doc sample" beats failing toward
  # "misses a live key".
  for pattern in "${PATTERNS[@]}"; do
    hits="$(printf '%s' "$content" | grep -nE -- "$pattern" 2>/dev/null || true)"
    if [ -n "$hits" ]; then
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        report "$label" "$line"
        found=1
      done <<< "$hits"
    fi
  done
  for pattern in "${PATTERNS_I[@]}"; do
    hits="$(printf '%s' "$content" | grep -niE -- "$pattern" 2>/dev/null | grep -Ev "$ALLOW" || true)"
    if [ -n "$hits" ]; then
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        report "$label" "$line"
        found=1
      done <<< "$hits"
    fi
  done
  return "$found"
}

if [ "$MODE" = "staged" ]; then
  # Names first: catches `git add secrets.env` even if its contents look innocuous.
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    check_name "$path"
  done < <(git diff --cached --name-only --diff-filter=ACMR)

  # Then the added lines themselves, per file, so the message names the file.
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    if ! git diff --cached -U0 -- "$path" \
      | grep '^+' | grep -v '^+++' | sed 's/^+//' \
      | scan_text "$path (linha adicionada)"; then
      fail=1
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR)
else
  if [ ${#PATHS[@]} -eq 0 ]; then
    mapfile -t PATHS < <(git ls-files)
  fi
  for path in "${PATHS[@]}"; do
    [ -f "$path" ] || continue
    check_name "$path"
    # Skip binaries: `grep -I` reports no match for them, which is also how we detect one.
    # A key pasted into a PNG is out of scope; scanning them only produces null-byte warnings.
    grep -qI . "$path" 2>/dev/null || continue
    scan_text "$path" < "$path" || fail=1
  done
fi

if [ "$fail" -ne 0 ]; then
  cat >&2 <<'MSG'

CREDENCIAL DETECTADA — commit bloqueado.

As chaves deste kit vivem em ~/.harbor-eval-kit/secrets.env, FORA do repositório, e são
injetadas só no ambiente do processo filho na hora da run. Nada de credencial entra aqui.

O que fazer:
  1. Tire o valor do arquivo (use o nome da variável, nunca o valor).
  2. Se a chave já foi exposta em algum lugar, REVOGUE ela no painel do provider — tirar do
     arquivo não desfaz a exposição.
  3. Rode de novo o commit.

Se for comprovadamente um falso positivo (ex.: um exemplo de documentação), ajuste o padrão
ou a allowlist em scripts/scan-secrets.sh em vez de usar --no-verify: o hook só protege
enquanto ninguém tiver o hábito de contorná-lo.
MSG
  exit 1
fi

exit 0
