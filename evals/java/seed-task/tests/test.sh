#!/usr/bin/env bash
set -euo pipefail
if [ -x ./mvnw ]; then ./mvnw -q test; elif command -v mvn >/dev/null; then mvn -q test; else echo 'No Maven wrapper/tool configured'; exit 2; fi
