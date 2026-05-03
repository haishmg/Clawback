# Clawback 0.3.0

## Highlights

- Adds `npm run suite:pre -- --target <version> --private-fixture` for higher-fidelity private rehearsals.
- Allows fixture exports to include generated plugin runtime deps with `--include-plugin-runtime-deps`.
- Removes built rehearsal images after verification by default to reduce Podman/Docker storage growth.
- Adds `--keep-image` for debugging cases where the built rehearsal image should be preserved.
- Narrows `npm test` to project tests so generated private fixture files are not accidentally executed.

## Validation

- `npm run ci`
- `npm pack --dry-run`
