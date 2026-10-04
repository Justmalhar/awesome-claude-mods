#!/usr/bin/env bash
# Validates every mod and checks its README states the exact hooks/calls the
# validator reports, so what a user reads is what the mod does.
set -euo pipefail
for d in mods/*/; do
  out=$(claude plugin validate "$d")
  echo "$out" | grep -q "Validation passed"
  for kind in hooks calls; do
    line=$(echo "$out" | grep -E "^\s*❯ .* $kind:" | sed -E "s/.*$kind: //")
    grep -qF "$line" "$d/README.md" || { echo "✖ $d README is missing the $kind line: $line"; exit 1; }
  done
  echo "✔ $d"
done
