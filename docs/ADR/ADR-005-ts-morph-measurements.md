# ADR-005: Use ts-morph for TypeScript measurements

## Status

Accepted. Recorded 2026-11-05.

## Context

The first implementation used the TypeScript compiler API directly. Evaluating
ts-morph showed that its public traversal, body, naming, location, and diagnostic
APIs simplified the implementation and removed reliance on an internal
diagnostic property.

## Decision

We will use ts-morph for complete syntax-based measurements on relevant
entities. Discovery will use the TypeScript API exported by ts-morph so parser
nodes and compiler utilities use the same compiler version. The measurement
pass will avoid library loading, dependency resolution, and target execution.

We will preserve executable statement size and cyclomatic complexity and also
measure function spans, parameter counts, nesting, and class
structure. Explicitly supplied custom metric definitions will carry IDs,
versions, and descriptions; none will be silently enabled by default.

We will honor tsconfig scope and references, include configured JavaScript when
`allowJs` applies, and exclude declarations and generated/dependency directories.
Without a local config, directory discovery will default to TypeScript files.
Typed linting will own a separate program/service (see
[ADR-006](ADR-006-integrated-analyzers.md)).

## Consequences

Measurement code is clearer and independent of lint thresholds. ts-morph adds a
dependency and its own compiler version, so upgrades require compatibility
checks. Syntax metrics do not establish runtime behavior or semantic correctness.
Golden fixtures and self-analysis guard the counting rules through refactoring.
