# ADR-007: Run all analysis passes by default

## Status

Accepted. Recorded 2026-11-05.

## Context

Earlier CLI behavior required opt-ins for typed lint, coverage execution, Knip,
and dependency-cruiser. We want a normal invocation to evaluate the project
with all available tools.

## Decision

We will run measurements, coverage generation/import, type-aware lint,
duplication, Knip, and dependency-cruiser by default. Explicit imports will
replace the corresponding execution step. We will offer `--no-typed-lint`,
`--no-coverage`, `--no-lint`, `--no-duplication`, `--no-knip`, and
`--no-dep-cruiser` (`--no-dependency-cruiser` alias). Whole-pass disable flags
will take precedence over configuration and imports.

Coverage discovery will prefer an explicitly configured command, then a
`test:coverage` or `coverage` package script, then the project's `test` script
wrapped in c8. Project package-manager declarations will be respected. Missing
setup will be reported as failure rather than a successful empty result.

After measurement succeeds, failed evidence passes will not prevent remaining
passes or report generation. The CLI will exit unsuccessfully if a pass failed.
Commands will use argument arrays, timeouts, and fresh output checks; failed
commands will not cause stale evidence to be imported. The synchronous
`analyze()` API will remain measurements-only; `runProject()` is the full pipeline.

## Consequences

A plain invocation yields the fullest available report and exposes incomplete
setup. It can take longer, execute project tests/configuration, and fail on a
project without those prerequisites. Users retain explicit controls for lighter
analysis, and CI imports can avoid repeating work.
