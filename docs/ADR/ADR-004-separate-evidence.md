# ADR-004: Keep measurements and findings separate

## Status

Accepted. Recorded 2026-11-05.

## Context

A function has measurable size and complexity even when it violates no lint
rule. Several rules can describe the same underlying issue. Coverage,
duplication, unused-code checks, and dependency rules have different meanings
and scopes. Missing or failed evidence must not look like a clean result.

## Decision

We will store descriptive measurements independently of actionable findings.
Findings retain rule IDs, severity, messages, and source locations. Coverage,
duplicate blocks, project hygiene, and dependency evidence remain identifiable
sources. We will not combine these into an aggregate quality score or treat
each overlapping rule message as an independent quality penalty.

We will include metric definitions, analyzer versions, versioned configuration,
scope, and execution status in report provenance. Unknown, zero, skipped,
imported, and failed evidence will remain distinguishable. Navigation bands
will be explained as aids rather than universal grades.

Group complexity will show the maximum region complexity. Group coverage will
weight known mapped lines and disclose missing evidence. Duplication will count
overlapping physical lines once per file. Lint counts will describe messages,
not an inferred count of independent problems.

## Consequences

Readers can understand the evidence and trace findings to source. They must
interpret several views rather than rely on one score. Aggregation definitions
and missing-data presentation become part of the reporting contract.
