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

# A missing filter must never turn this security check into a successful no-op.  Keep the
# preflight in bash 3.2 syntax: this script also runs under the /bin/bash shipped by macOS.
required_tools="grep git sed cat"
for tool in $required_tools; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "scanner de credenciais indisponível: ferramenta obrigatória ausente" >&2
    exit 2
  fi
done

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

# One grep per file keeps the Git Bash wrapper practical on Windows while preserving the
# vendor patterns as a single, equivalent alternation.
VENDOR_PATTERN="("
for pattern in "${PATTERNS[@]}"; do
  VENDOR_PATTERN="${VENDOR_PATTERN}${pattern}|"
done
VENDOR_PATTERN="${VENDOR_PATTERN%|})"

# Lines that look like a credential but provably are not: documentation placeholders, masked
# values, and the env-var *plumbing* this kit is made of (`extraEnv: { [envKey]: apiKey }`).
ALLOW='(\*{3,}|<[^>]*>|\$\{|\$[A-Za-z_]|%[A-Za-z_]+%|YOUR_|EXAMPLE|PLACEHOLDER|xxx+|XXX+|\.\.\.|process\.env|os\.environ|envKey|apiKey|secretsEnv|\bname\b|placeholder)'

# Files that must never be committed at all, whatever their contents.
FORBIDDEN_NAMES='(^|/)(secrets\.env|\.env(\..*)?|id_rsa|id_ed25519|.*\.pem|.*\.pfx|.*\.p12|credentials\.json)$'

fail=0
scanner_error=0

report() {
  # $1 = location, $2 = offending line (already trimmed). Only prints -- it must NOT try to set
  # `fail`, because scan_text runs as the last stage of a pipeline and bash runs pipeline
  # stages in subshells, so an assignment here would be discarded when that subshell exits.
  # Failure travels back through scan_text's EXIT STATUS instead; callers set `fail`.
  # (Caught by test: an earlier version assigned fail=1 here, printed the warning, and let the
  # commit through anyway.)
  echo "  ✗ $1"
  echo "      conteúdo omitido para não registrar a credencial"
}

check_name() {
  local path="$1"
  local matched
  matched="$(printf '%s\n' "$path" | grep -Eq "$FORBIDDEN_NAMES"; echo $?)"
  if [ "$matched" -gt 1 ]; then
    echo "scanner de credenciais falhou ao verificar nomes de arquivo" >&2
    return 2
  fi
  if [ "$matched" -eq 0 ]; then
    # .env.example is a template of NAMES, not values -- explicitly fine.
    case "$path" in
      *.env.example|*.env.sample) return 0 ;;
    esac
    echo "  ✗ $path"
    echo "      arquivo de credencial — nunca deve ser versionado (veja .gitignore)"
    fail=1
  fi
  return 0
}

scan_text() {
  # $1 = label for messages, stdin = text to scan.
  # Returns 1 if anything was reported, 0 if clean -- see the note in report().
  local label="$1"
  local found=0
  local content
  if ! content="$(cat 2>/dev/null)"; then
    echo "scanner de credenciais falhou ao ler uma entrada" >&2
    return 2
  fi
  local hits
  # `grep -E -- "$pattern"`: without the `--`, a pattern starting with "-" (every PEM header,
  # `-----BEGIN ... PRIVATE KEY-----`) is parsed as command-line options and silently never
  # matches. That bug made private keys invisible to this scanner until it was caught by test.
  #
  # Vendor-format patterns are NOT run through the allowlist: a string shaped like a real
  # sk-ant-/AKIA/ghp_/AIza key has no business being in this repo even inside an example. The
  # allowlist applies only to the generic name=value rule, which is the one that would
  # otherwise fire on documentation. Failing toward "blocks a doc sample" beats failing toward
  # "misses a live key".
  hits="$(printf '%s' "$content" | grep -nE -- "$VENDOR_PATTERN" 2>/dev/null)"
  local grep_status=$?
  if [ "$grep_status" -gt 1 ]; then
    echo "scanner de credenciais falhou ao analisar uma entrada" >&2
    return 2
  fi
  if [ -n "$hits" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      report "$label" "$line"
      found=1
    done <<< "$hits"
  fi
  for pattern in "${PATTERNS_I[@]}"; do
    hits="$(printf '%s' "$content" | grep -niE -- "$pattern" 2>/dev/null)"
    local grep_status=$?
    if [ "$grep_status" -gt 1 ]; then
      echo "scanner de credenciais falhou ao analisar uma entrada" >&2
      return 2
    fi
    if [ "$grep_status" -eq 0 ]; then
      hits="$(printf '%s' "$hits" | grep -Ev "$ALLOW" 2>/dev/null)"
      local allow_status=$?
      if [ "$allow_status" -gt 1 ]; then
        echo "scanner de credenciais falhou ao filtrar uma entrada" >&2
        return 2
      fi
    else
      hits=""
    fi
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
  staged_paths="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)"
  if [ "$?" -ne 0 ]; then
    echo "scanner de credenciais falhou ao consultar o índice Git" >&2
    exit 2
  fi
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    check_name "$path"
    [ "$?" -eq 2 ] && scanner_error=1
  done <<EOF
$staged_paths
EOF

  # Then the added lines themselves, per file, so the message names the file.
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    diff="$(git diff --cached -U0 -- "$path" 2>/dev/null)"
    if [ "$?" -ne 0 ]; then
      echo "scanner de credenciais falhou ao ler o diff Git" >&2
      scanner_error=1
      continue
    fi
    added="$(printf '%s\n' "$diff" | sed -n -e '/^+++ /d' -e '/^+/s/^+//p' 2>/dev/null)"
    if [ "$?" -ne 0 ]; then
      echo "scanner de credenciais falhou ao extrair linhas adicionadas" >&2
      scanner_error=1
      continue
    fi
    scan_text "$path (linha adicionada)" <<EOF
$added
EOF
    scan_status=$?
    if [ "$scan_status" -eq 2 ]; then
      scanner_error=1
    elif [ "$scan_status" -eq 1 ]; then
      fail=1
    fi
  done <<EOF
$staged_paths
EOF
else
  # `mapfile` would read this in one line, but it is a bash 4 builtin and macOS still ships
  # bash 3.2 (frozen in 2007 over GPLv3) as /bin/bash -- CI failed there with
  # "mapfile: command not found" while Linux and Git Bash passed. This read loop is
  # bash-3.2-compatible and does the same thing.
  if [ ${#PATHS[@]} -eq 0 ]; then
    tracked_paths="$(git ls-files --cached --others --exclude-standard 2>/dev/null)"
    if [ "$?" -ne 0 ]; then
      echo "scanner de credenciais falhou ao consultar os arquivos Git" >&2
      exit 2
    fi
    while IFS= read -r tracked; do
      [ -n "$tracked" ] && PATHS+=("$tracked")
    done <<EOF
$tracked_paths
EOF
  fi
  # Guarded because expanding an EMPTY array as "${arr[@]}" is an unbound-variable error under
  # `set -u` on bash 3.2 -- the second half of that same macOS failure.
  if [ ${#PATHS[@]} -gt 0 ]; then
    for path in "${PATHS[@]}"; do
      [ -f "$path" ] || continue
      check_name "$path"
      [ "$?" -eq 2 ] && scanner_error=1
      # Skip binaries: `grep -I` reports no match for them, which is also how we detect one.
      # A key pasted into a PNG is out of scope; scanning them only produces null-byte warnings.
      grep -qI . "$path" 2>/dev/null
      text_status=$?
      if [ "$text_status" -gt 1 ]; then
        echo "scanner de credenciais falhou ao classificar uma entrada" >&2
        scanner_error=1
        continue
      fi
      [ "$text_status" -eq 0 ] || continue
      scan_text "$path" < "$path"
      scan_status=$?
      if [ "$scan_status" -eq 2 ]; then
        scanner_error=1
      elif [ "$scan_status" -eq 1 ]; then
        fail=1
      fi
    done
  fi
fi

if [ "$scanner_error" -ne 0 ]; then
  echo "scanner de credenciais falhou; commit bloqueado" >&2
  exit 2
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
