# ADR-001: We will use ADRs

## Status

Accepted. Recorded 2026-11-05.

## Context

Panopticode NG has accumulated decisions about its historical inspiration,
measurements, dependencies, execution defaults, and language boundaries.
Conversation history alone will not reliably explain these choices to future
contributors or agents, especially across a repository rename.

## Decision

We will use architecture decision records (ADRs) for architecturally significant
choices. We will follow Michael Nygard's
[Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
each short Markdown record has a title and the sections Status, Context,
Decision, and Consequences. Context describes the forces behind the choice;
Decision states what we will do; Consequences describes benefits, costs, and
limitations.

We will store records in `docs/ADR/`, name them
`ADR-NNN-short-description.md`, and assign increasing numbers without reuse.
We will maintain an index. Status will distinguish proposed, accepted,
deprecated, and superseded decisions. Reversals will receive a new record;
the old record will remain with a link to its replacement. Corrections may
clarify a record without rewriting its original rationale.

We will keep operating instructions and session handoffs in `docs/AGENTS/`.
Those notes describe current implementation details; ADRs explain durable
decisions. We will discuss and agree on new metrics and third-party analysis
tools before implementation.

## Consequences

Future contributors can recover both the decision and its rationale without
the original conversation. Small records require ongoing care, and current
guidance must point to replacements when decisions change. Routine code edits
do not each need an ADR.
