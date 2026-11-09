# ADR-010: Analyze PHP for hardening and retirement

## Status

Accepted. Recorded 2026-11-05.

## Context

The two target PHP applications will eventually be eliminated in favor of
TypeScript alternatives. Analysis should help keep them reliable, identify
deletion candidates, and understand replacement difficulty. Coding standards
and style are outside the project's purpose. Architectural rules should not
be a prerequisite for useful evidence.

## Decision

Provide a Composer-native `php/` CLI with PDepend measurements, PHPStan
correctness analysis, ShipMonk unused-member detection, project PHPUnit or
configured test execution with Clover coverage, and an isolated npm-managed
jscpd runner. Run passes by default with `--no-*` controls and report imports.
Keep failed, skipped and successful evidence distinct. Generate offline HTML
and JSON with source locations and tool provenance.

Select descriptive complexity, size, coupling, inheritance and class-structure
metrics. Keep ordinary and extended cyclomatic complexity separate. Exclude
composite maintainability indices and Halstead bug/time estimates from the
normalized report. Do not compute an aggregate health score or run formatting,
autofix or deletion.

Exclude Deptrac because its main value requires architectural policy. Exclude
PHP_CodeSniffer and style checks. Defer overlapping PHPMD/PhpMetrics integrations
and additional Psalm security analysis.

The initial PHP JSON contract is version 1 with an explicit language field.
Its simple HTML report uses a file overview and entity tables. A shared
interactive renderer and contract remain future work: do not force PDepend's
different measurements into TypeScript's statement-count schema.

## Consequences

Duplication requires Node in addition to the PHP toolchain. The analyzer runs
on PHP 8.2+ independently of the target's test runtime. Missing coverage setup
fails visibly. Full-project unused-member findings need review of dynamic
entrypoints and consumers before deletion. PDepend may omit constructs as
independent entities, so file inventory and missing metrics remain explicit.
Coverage does not establish behavioral equivalence of a TS replacement.
