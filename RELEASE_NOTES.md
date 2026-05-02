# Clawback 0.2.0

## Highlights

- Default validation output is quieter and focused on important checkpoints.
- Use `--debug` to restore exhaustive per-probe progress output.
- `npm run suite:pre` runs the local baseline and container rehearsal in parallel, but prints both captured results only after both checks finish.
- README now explains why baseline and container checks intentionally overlap.
- Container builds now print the actual OpenClaw package being installed instead of showing a misleading `openclaw@latest` Dockerfile default.

## Validation

- `npm run ci`
- `npm pack --dry-run`
