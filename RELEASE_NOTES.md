# Clawback 0.3.1

## Highlights

- Fixes `npm run suite:pre` so the target container is compared against a same-harness container baseline for the currently installed OpenClaw version.
- Makes regressions like lost gateway identity or new `missing scope: operator.read` errors hard failures instead of standalone container warnings.
- Keeps the local live baseline for host context while using the container baseline for target-vs-current upgrade decisions.

## Validation

- `npm run ci`
- `npm pack --dry-run`
- `npm run suite:pre -- --target 2026.4.29 --private-fixture` now fails as expected with `baseline.gateway.self` and `baseline.gateway.error`.
