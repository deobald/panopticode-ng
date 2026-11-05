# ADR-002: Preserve Panopticode's visual approach

## Status

Accepted. Recorded 2026-11-05.

## Context

The original [Panopticode](https://sourceforge.net/projects/panopticode/), circa
2006, explained the health of Java codebases through navigable visualizations.
Its local source and screenshots informed this reconstruction. Its multiple
repositories and Java-era build infrastructure are not requirements for the new
implementation. TypeScript also has entities and analysis tools that differ
from Java's.

## Decision

We will reconstruct the visual idea for TypeScript first: hierarchical treemaps
use executable statement size for area and selected health evidence for color.
Users can navigate directories, files, and function regions, search, and inspect
details with source locations. Coverage and complexity remain central views.

We will retain the original complexity bands as configurable defaults:
1–5, 6–9, 10–24, and 25+. We will define TypeScript counting rules explicitly
rather than claim equivalence with JavaNCSS. Functions, methods, accessors,
constructors, arrows, callbacks, and module-level code need useful representation.

We will add suitable modern health evidence using the agreed TypeScript
ecosystem integrations. We will discuss the rationale for further metrics and
third-party tools before adding them.

## Consequences

The primary success criterion is a clear visual explanation of codebase health.
Implementation structure can evolve independently of the original project.
Language-specific definitions prevent misleading numerical comparisons, but
require explanations and legends alongside the pictures.
