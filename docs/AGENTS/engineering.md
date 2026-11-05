# TypeScript engineering notes

## Entry points and ownership

All paths in this section are relative to `ts/`.

| Area | Files |
| --- | --- |
| CLI and public exports | `src/cli.ts`, `src/index.ts` |
| Measurement-only API | `src/analyze.ts`, `src/discovery.ts` |
| Traversal and measurements | `src/source-analysis.ts`, `src/syntax.ts`, `src/measurements.ts`, `src/custom-metrics.ts` |
| Full async pipeline and defaults | `src/pipeline.ts`, `src/config.ts`, `src/default-tasks.ts`, `src/passes.ts` |
| Subprocesses and artifacts | `src/command.ts`, `src/process-task.ts` |
| Evidence | `src/lint.ts`, `src/lint-profile.ts`, `src/duplication.ts`, `src/coverage.ts`, `src/eslint.ts`, `src/imports.ts`, `src/supplements.ts`, `src/evidence.ts` |
| Data contract and provenance | `src/model.ts`, `src/definitions.ts`, `src/provenance.ts` |
| Offline rendering | `src/render.ts`, `src/web/`, `scripts/copy-web.mjs` |
| Verification | `test/*.test.mjs`, `test/fixtures/demo-analysis.json`, `scripts/browser-check.mjs` |

The package is version 0.3.0 at this handoff. Report `schemaVersion` is 2;
analyzer configuration `version` is 1. Runtime analyzers are pinned in
`package.json` and the lockfile. Use these as the dependency source of truth.
SonarJS is deliberately pinned to 1.0.4: inspect
[ADR-008](../ADR/ADR-008-sonarjs-license-pin.md) before upgrading.

## Details worth preserving

`analyze()` is synchronous and only measures source. `runProject()` runs the
full sequential pipeline. ts-morph does syntax analysis without resolving all
dependencies; typescript-eslint owns its separate project service. Discovery
uses ts-morph's exported TypeScript API, not nodes from the build compiler.

Source scope includes TS/TSX/MTS/CTS and configured JavaScript when `allowJs`
is set. Declaration files, ambient/type-only syntax, generated output, and
dependencies do not contribute executable measurements. Files outside the
selected root produce a warning; select a common root for a multi-package
project. Syntax parse errors abort measurement, while semantic errors do not
block the syntax metrics. The self tsconfig includes browser JS so it cannot
silently disappear from self-analysis.

Coverage consumes source-mapped Istanbul `coverage-final.json` statement maps
and hit counts. It measures distinct statement-start lines, not branches or
function invocation. Raw V8, LCOV, and coverage-summary JSON are not supported
imports. `tsconfig` scopes files; package scripts/config define test execution.
Node tests do not supply browser interaction coverage. The separate Chrome
check verifies behavior without adding coverage hits. Missing coverage remains
unknown, distinct from a measured zero.

Baseline ESLint uses recommended correctness rules, selected SonarJS warnings,
and typed promise rules. Project mode uses the target's compatible flat config
and plugins. Baseline ignores inline overrides; project mode honors project
policy. No autofix runs. See [analyzer docs](../../ts/docs/analyzers.md) for the
exact profile and command/import precedence.

jscpd is integrated through core/tokenizer libraries because importing its CLI
package had execution side effects. The tokenizer's CJS build is loaded through
`createRequire` to avoid its broken ESM extension imports. Mild mode ignores
whitespace but retains comments. Overlapping duplicate lines count once.

Subprocesses use argv arrays without a shell, target-project cwd, timeouts, and
freshness checks. Stdout artifacts are written atomically after success; errors
must not import old results. Strip `NODE_TEST_CONTEXT` from child environments:
inherited Node test-harness state previously suppressed nested target tests.
Canonicalize paths for macOS `/var` versus `/private/var` coverage imports.

Browser source files are genuine ESM for Node tests. `scripts/copy-web.mjs`
bundles an explicitly ordered list into an offline IIFE by stripping its simple
imports/exports; it is not a general bundler. Update the list if adding browser
modules, and validate offline reports. Rendering uses escaped embedded JSON,
text DOM APIs for external strings, and a restrictive CSP.

## Refactoring workflow

Generate the self-report, inspect the actual hotspots/findings, refactor, then
run relevant tests and regenerate evidence. Preserve counting semantics using
the demo golden fixture; legacy metric comparisons intentionally project out
new fields. Keep tests meaningful rather than mirroring implementation details.
Run browser checks when changing rendering or themes. Documentation-only work
usually needs link and whitespace checks rather than the full analyzer suite.

Never hide missing/failed passes to manufacture a healthy report. Findings and
unmeasured browser coverage can remain visible while the code improves.
