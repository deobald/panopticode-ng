# ADR-011: Present language CLIs through a common usage pattern

## Status

Accepted. Recorded 2026-11-05.

## Context

TypeScript and PHP now have working command-line analyzers, and C# is next.
The root README previously mixed TypeScript testing and self-analysis with
PHP installation under project documentation. Examples also depended on local
runtime management, making it difficult to distinguish tool requirements from
one developer's environment.

## Decision

Document every implemented language using the same sequence: requirements,
install/build, analyze a target project, and open the report. Root README
commands run from the repository root and use explicit `--out reports/<language>`
paths. Keep validation commands separate from the first analysis workflow.

Retain native entrypoints: Node for TypeScript and PHP for PHP. Packages own
their dependency managers and build steps, as established by ADR-009. A .NET
entrypoint will follow this usage pattern when C# is implemented. Do not add a
root wrapper or invent executable C# commands ahead of that implementation.

Document required runtimes directly and assume they are on PATH. Runtime
managers such as mise are optional environment setup. PHP's Node requirement
belongs to jscpd duplication analysis and disappears when that pass is disabled.

Preserve common analysis behavior: a target project argument, explicit output
selection, default execution of integrated passes, report imports and explicit
opt-outs, and offline HTML plus versioned JSON. Exact options, metrics, test
setup and schemas remain package-specific. This documentation convention does
not change existing default output paths or establish a shared report schema.

## Consequences

Readers can compare language packages and run their first analysis without
learning repository development commands or adopting mise. Native installation
and entrypoint syntax still differ, including PHP's additional duplication
runtime. Future language packages have a clear documentation pattern while
keeping their native toolchains and analysis definitions.
