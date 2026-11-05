# ADR-009: Organize language packages in a monorepo

## Status

Accepted. Recorded 2026-11-05.

## Context

We need static analysis and health checks for C# and PHP as well as
TypeScript. These languages benefit from common reporting principles while
requiring different native analysis and build tools. The repository was named
`panopticode-ts` before this expansion.

## Decision

We will organize the project as the `panopticode-ng` monorepo. TypeScript's
implementation, manifest, lockfile, tests, examples, scripts, and language docs
will live under `ts/`. Shared documentation, the overview README, and the
project license will remain at the root. The TypeScript package and CLI will
retain the name `panopticode-ts`.

We will reserve `csharp/` and `php/` as the planned language package locations.
Each package will own its native toolchain; no root npm workspace is needed.
Concrete C# and PHP analyzers, metrics, and third-party tools remain to be
discussed and implemented.

We will evolve a shared report contract and extract reusable rendering code
when a second implementation supplies a real consumer. Until then the working
model and renderer remain in `ts/`. Language-specific metric definitions and
versions will remain explicit rather than imply numerical equivalence.

## Consequences

Language work can share decisions and visual conventions without one language's
build system controlling all others. Cross-language contracts will eventually
need coordinated validation. No C# or PHP support is implied by the new project
name.
