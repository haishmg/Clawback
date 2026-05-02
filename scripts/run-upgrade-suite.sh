#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
fixture="${OPENCLAW_FIXTURE_DIR:-fixtures/openclaw-sanitized}"
before_dir="${OPENCLAW_BEFORE_DIR:-reports/before-upgrade}"
after_dir="${OPENCLAW_AFTER_DIR:-reports/after-upgrade}"
baseline_file="${OPENCLAW_BASELINE_FILE:-$before_dir/report.json}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/run-upgrade-suite.sh pre
  scripts/run-upgrade-suite.sh post

Modes:
  pre   Export a sanitized fixture, then run local baseline and container rehearsal in parallel.
  post  Run local post-upgrade comparison using reports/before-upgrade/report.json.

Environment:
  OPENCLAW_PACKAGE       Package/version for container rehearsal (default: openclaw@latest).
  OPENCLAW_FIXTURE_DIR   Sanitized fixture directory (default: fixtures/openclaw-sanitized).
  OPENCLAW_BEFORE_DIR    Local baseline output directory (default: reports/before-upgrade).
  OPENCLAW_AFTER_DIR     Post-upgrade output directory (default: reports/after-upgrade).
  OPENCLAW_BASELINE_FILE Baseline JSON for post mode (default: reports/before-upgrade/report.json).
USAGE
}

case "$mode" in
  pre)
    echo "[suite] Exporting sanitized OpenClaw fixture from ~/.openclaw to $fixture"
    npm run container:export -- ~/.openclaw "$fixture"

    mkdir -p "$before_dir" reports/container-rehearsal
    baseline_log="$before_dir/run.log"

    echo "[suite] Starting local baseline in background"
    echo "[suite] Local baseline reports: $before_dir"
    node bin/clawback.js \
      --mode baseline \
      --out "$before_dir" \
      > "$baseline_log" 2>&1 &
    baseline_pid="$!"

    echo "[suite] Starting container rehearsal in background"
    echo "[suite] Container target: ${OPENCLAW_PACKAGE:-openclaw@latest}"
    OPENCLAW_PACKAGE="${OPENCLAW_PACKAGE:-openclaw@latest}" \
      npm run container:rehearse -- "$fixture" &
    container_pid="$!"

    baseline_status=0
    container_status=0
    wait "$baseline_pid" || baseline_status="$?"
    wait "$container_pid" || container_status="$?"

    if [ "$baseline_status" -ne 0 ] || [ "$container_status" -ne 0 ]; then
      echo "pre suite failed: baseline=$baseline_status container=$container_status" >&2
      if [ "$baseline_status" -ne 0 ]; then
        echo "[suite] Local baseline output:" >&2
        cat "$baseline_log" >&2
      fi
      exit 1
    fi
    echo "[suite] Pre-upgrade suite complete"
    echo "[suite] Local HTML: $before_dir/report.html"
    echo "[suite] Container HTML: reports/container-rehearsal/run/report.html"
    echo ""
    echo "[suite] Local baseline output:"
    cat "$baseline_log"
    ;;
  post)
    if [ ! -f "$baseline_file" ]; then
      echo "Baseline not found: $baseline_file" >&2
      echo "Run scripts/run-upgrade-suite.sh pre before upgrading, or set OPENCLAW_BASELINE_FILE." >&2
      exit 1
    fi

    echo "[suite] Running post-upgrade comparison"
    echo "[suite] Baseline: $baseline_file"
    echo "[suite] Output: $after_dir"
    node bin/clawback.js \
      --mode post-upgrade \
      --baseline "$baseline_file" \
      --out "$after_dir"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "Unknown mode: $mode" >&2
    usage >&2
    exit 2
    ;;
esac
