#!/usr/bin/env bash
set -euo pipefail

runtime="${CONTAINER_RUNTIME:-}"
if [ -z "$runtime" ]; then
  if command -v docker >/dev/null 2>&1; then
    runtime=docker
  elif command -v podman >/dev/null 2>&1; then
    runtime=podman
  else
    echo "[container] Neither docker nor podman is installed. Install one to run the OpenClaw latest-version rehearsal." >&2
    exit 127
  fi
fi

fixture="${1:-fixtures/openclaw-sanitized}"
package="${OPENCLAW_PACKAGE:-openclaw@latest}"
image="${OPENCLAW_GUARD_IMAGE:-openclaw-upgrade-guard:local}"

if [ ! -d "$fixture" ]; then
  echo "[container] Fixture directory not found: $fixture" >&2
  echo "[container] Create one with: node scripts/export-fixture.js ~/.openclaw $fixture" >&2
  exit 1
fi

echo "[container] Runtime: $runtime"
echo "[container] Fixture: $fixture"
echo "[container] Target OpenClaw package: $package"
echo "[container] Building image: $image"
"$runtime" build \
  --build-arg "OPENCLAW_PACKAGE=$package" \
  -t "$image" \
  -f docker/Dockerfile .

mkdir -p reports/container-rehearsal

echo "[container] Running latest-version rehearsal in isolated container"
echo "[container] Reports: reports/container-rehearsal/run"
"$runtime" run --rm \
  -e GUARD_MODE="${GUARD_MODE:-baseline}" \
  -v "$PWD/$fixture:/fixture:ro" \
  -v "$PWD/reports/container-rehearsal:/reports" \
  "$image"
