# Panopticode NG architecture

## Purpose

Provide clear visual explanations of codebase health across TypeScript, C#, and
PHP. Preserve the original Panopticode idea: a codebase has a navigable hierarchy,
measurements determine the shape and color of its visualization, and findings
lead to precise source locations.

The TypeScript implementation provides the interactive analyzer and report.
PHP provides a native CLI with PDepend, PHPStan, unused-member analysis,
coverage and duplication, plus a simple offline report. C# provides a native
.NET CLI with syntax measurements, semantic correctness/security analysis,
Microsoft metrics, native token duplication and coverage imports, plus an
interactive offline report.

## Repository structure

```text
README.md       Project overview and package entry points
LICENSE         Project-wide license
docs/           Cross-language design and documentation
ts/             TypeScript package and its language-specific documentation
csharp/         Native .NET code health and security analysis CLI
php/            PHP health and retirement analysis CLI
```

Language packages own their manifests, lockfiles, source, tests, examples, tool
configuration, and generated reports. The `ts` package remains `panopticode-ts`,
including its CLI name. Commands can run inside that package or be delegated
from the root with `npm --prefix ts ...`.

Build and dependency management stay native to each language. The monorepo does
not impose npm on the C# or PHP packages or require one package's toolchain to
build another. Changes affecting a shared contract should run validation for
every implemented consumer.

## Language boundaries

Each language analyzer is responsible for project discovery, entity hierarchy,
source locations, statically inspected measurements, lint integration, coverage
collection/import, duplication, and relevant project or architecture checks.
Concrete metrics and third-party tools need discussion before implementation.
PHP's selected tools and retirement focus are recorded in ADR-010; C# choices
and legacy project limitations are recorded in ADR-012.

Language-specific configuration and metric definitions belong with the analyzer.
Identically named metrics can use different counting rules across languages;
their definitions and analyzer versions must travel with the data. The report
must expose these differences before encouraging cross-language comparisons.

## Shared reporting direction

The existing TypeScript report model is versioned JSON. It keeps entity
measurements, actionable findings, coverage evidence, duplicate ranges, and
analyzer provenance distinct. Missing evidence and failed passes are explicit;
reports do not turn overlapping findings into a combined quality penalty.

As the PHP report evolves, develop that model into a shared contract
with language metadata and room for language-specific structures. Extract the
browser renderer and shared fixtures at that point, using actual consumers to
define the boundary. Until then, their working implementations stay in `ts/`.
C# has its own version-1 JSON contract and interactive renderer. It embeds
TypeScript's pure treemap partition function as a build resource without
requiring Node. Shared rendering beyond that function remains future work.

Offline reports should continue to provide directory/file/entity navigation,
search, accessible detail views, legends, and system light/dark themes. C# and
PHP analyzers should be able to produce report data through their own toolchains
without embedding TypeScript source analysis.

## TypeScript implementation

See the [TypeScript port design](../ts/docs/design.md),
[analyzer configuration](../ts/docs/analyzers.md), and
[refinement history](../ts/docs/refinements.md) for the implemented behavior and
its relationship to the original Java project.
