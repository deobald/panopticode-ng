# Analyzer configuration and evidence

## Pipeline

The CLI runs separate sequential passes: ts-morph measurements, requested
coverage execution/import, typed ESLint, jscpd, Knip, and dependency-cruiser.
All passes run by default. ESLint does not
reuse the ts-morph program. Typed linting uses typescript-eslint's independent
project service and can cost substantially more than the syntax-only baseline.

Every report has `schemaVersion: 2`, an `analyzers` array with actual versions,
configuration IDs/versions, per-file rule-configuration hashes for ESLint, scope,
duration, and status. Imported results have an unspecified external tool version
unless the producing tool supplies it; Panopticode does not invent one.
Skipped passes remain distinguishable from successful analyses with zero results.

`analyze()` remains a synchronous measurements-only API. `runProject()` runs the
integrated pipeline. Both are exported from the package. Neither API computes an
aggregate quality score.

## Versioned configuration

Panopticode reads `panopticode.config.json` from the project root when present.
Use `--config FILE` to select another JSON file, relative to that root.

```json
{
  "version": 1,
  "lint": { "mode": "baseline", "typed": true },
  "duplication": { "enabled": true, "minLines": 5, "minTokens": 50 },
  "coverage": {
    "command": ["npm", "run", "test:coverage"],
    "report": "coverage/coverage-final.json",
    "timeoutMs": 300000
  }
}
```

The ordinary CLI command runs every pass. Opt out explicitly:

```sh
node dist/cli.js . --no-typed-lint --no-coverage --no-knip --no-dep-cruiser
```

Other controls are `--no-lint` (all lint) and `--no-duplication`. The alias
`--no-dependency-cruiser` is also accepted. Whole-pass disable flags take
precedence over configuration and imports. `--no-typed-lint` controls native
linting and does not filter an imported report. The old positive `--run-*` and `--typed-lint` options
remain accepted for compatibility; they are no longer necessary.

Coverage uses the configured command, otherwise the first available
`test:coverage` or `coverage` package script and its default
`coverage/coverage-final.json` output. With only a `test` script, bundled c8 runs
it with the selected source scope and writes JSON under the report directory.
The declared npm/pnpm/yarn/bun package manager is respected. A custom script is
selected with `--coverage-script NAME`; `--coverage FILE` can identify its output.
Without a script override, `--coverage FILE` imports that report instead of
executing tests. A tsconfig scopes tests but does not itself define a test command.

Paths written in command configuration are relative to the analyzed project
root. CLI import paths are relative to the invoking working directory, as in
the original import interface. Paths inside coverage/lint JSON resolve relative
to the analyzed project root, and absolute paths must match the checkout.

Commands are argument arrays, with no shell interpretation. They run with the
project as working directory. Panopticode checks exit status, enforces the
timeout, and requires the report to have been created or changed. It never
imports an unchanged report following a command. Failed or unavailable passes
are recorded as failures with warnings; other passes still run and the HTML/JSON
report is written. The CLI exits 1 if any pass failed. Only explicit opt-outs or
disabled configuration are recorded as skipped. Coverage commands
must exit zero. Optional tools can configure `successCodes` when they use a
nonzero code to signal findings rather than execution failure. Set `stdout: true`
to capture a command's JSON stdout as its report; successful stdout reports are
written atomically and failed commands preserve the previous report.

## Lint profiles

Analyzer dependencies are pinned for reproducibility. SonarJS 1.0.4 is selected
because its shipped license is LGPL-3.0-only; newer 3.x packages ship a
source-available license despite their package metadata. The selected rules are
available in 1.0.4 and tested with ESLint 9, which its peer dependencies support.
Panopticode remains MIT licensed; dependency licenses apply to those libraries.

`--lint baseline` is the default. `panopticode-baseline` v1 combines ESLint's
recommended rules, typescript-eslint's recommended rules, and these selected
SonarJS warnings:

- `sonarjs/no-identical-expressions`
- `sonarjs/no-duplicated-branches`
- `sonarjs/no-identical-functions`
- `sonarjs/no-collection-size-mischeck`
- `sonarjs/cognitive-complexity` with a threshold of 15

No formatting preset or autofix runs. The baseline deliberately ignores inline
rule configuration; use project mode for the project's complete policy,
including suppressions. The profile contains browser and Node globals for mixed
TypeScript projects. More specific runtime-environment rules belong in project
configuration.

Typed baseline linting is enabled by default and adds `@typescript-eslint/no-floating-promises` and
`@typescript-eslint/no-misused-promises` for configured TypeScript files, using
`projectService: true`. The selected tsconfig must cover those files. Typed
baseline rules do not apply to JavaScript files. `--no-typed-lint` disables these
rules and the project service. Project mode uses the project's policy; opting
out of typed lint applies typescript-eslint's disable-type-checked preset.

`--lint project` loads the project's ESLint configuration through the bundled
ESLint API. The project must provide a compatible flat config and its plugins.
This mode executes that configuration. `--eslint FILE` instead imports existing
ESLint JSON and bypasses native linting. `--no-lint` (or legacy `--lint off`) skips linting entirely.
Parser/configuration failures are shown as failed lint evidence, not a clean run.

Lint records preserve rule IDs, severity, messages, and start/end locations.
The report groups messages at the same source location for inspection without
claiming they are equivalent. Message counts are never an independent penalty
per rule. Measurements exist for functions below every rule threshold.

## Measurements

The original cyclomatic complexity and executable statement definitions remain
unchanged. Additions are descriptive measurements rather than new health scores:

- Each function records physical line span (signature/body/comments included),
  parameter count, and maximum syntactic control nesting.
- Nesting counts if, loops, switch, try, catch, and ternary nodes. Else-if and
  catch nodes increase depth as ordinary nested syntax. Nested functions reset
  depth. This is distinct from SonarJS cognitive complexity findings.
- Each class records its name/location, declared methods, properties,
  constructors, getters/setters, extends expression, and implements clauses.
- Class/function/file custom values are collected only from explicitly supplied
  metric definitions.

Nesting view bands are 0–2, 3–4, 5–6, and 7+. The bands help navigation; they are
not universal pass/fail thresholds. Full definitions travel with each report.

## Custom metrics

Use the programmatic `customMetrics` option or `--metrics-module FILE`. A selected
module executes locally and must default-export definitions like this:

```js
export default [{
  id: 'identifier-width',
  version: 1,
  description: 'Example: declared entity name width in characters',
  measure(node, context) {
    if (context.kind !== 'function') return null;
    const name = node.getNameNode?.();
    return name ? name.getText().length : null;
  }
}];
```

The node is a ts-morph node. Context includes `kind` (`function`, `class`, or
`file`) and project-relative `file`. Return a finite number or `null` when the
metric does not apply. IDs must be unique lowercase identifiers with digits,
dots, and hyphens allowed. Definitions and versions are recorded in provenance;
no custom metric is enabled by default.

## Duplication

jscpd core/tokenizer 4 are used directly, avoiding its CLI entry point's import
side effects. Only files selected by Panopticode are scanned, so generated code
and dependencies cannot silently expand the scope. TypeScript and JavaScript
are scanned in separate tokenizer namespaces. Whitespace is ignored in mild
mode; comments remain significant. Minimum lines and tokens are configurable.

Every matching pair retains both source paths and start/end locations. Physical
line spans include both boundaries. The original jscpd token span is retained.
For each file, overlapping ranges count once. The treemap denominator is total
physical file lines, including blank/comment lines. Duplication bands are 0%,
above 0% to below 10%, 10% to below 25%, and 25%+, for navigation rather than
grading. Similar lint findings do not add a second duplication penalty.

Use `--no-duplication` or `duplication.enabled: false` to skip this pass.

## Knip and dependency-cruiser

Both tools are bundled and run by default. Knip uses the selected tsconfig's
project files and the project's own Knip configuration/entry-point discovery.
It requires a package manifest. Dependency-cruiser starts from the selected
source files, does not follow `node_modules`, and uses the project's
`.dependency-cruiser.*` configuration when present. Otherwise it uses the bundled
tool's recommended warning rules. No autofixes run.

Use `--no-knip` or `--no-dep-cruiser` to skip them. Import existing reports instead
of running a tool with:

```sh
node dist/cli.js . --knip reports/knip.json \
  --dependency-cruiser reports/dependencies.json
```

The Knip adapter handles the current `issues` JSON format and the earlier
top-level unused `files` array. The dependency-cruiser adapter handles module
edges and summary rule violations. Both remain separate supplemental evidence,
including findings in files outside the executable TypeScript scope.

Override either default command with versioned configuration. Configured tasks
also run automatically:

```json
{
  "version": 1,
  "knip": {
    "command": ["npm", "run", "analyze:hygiene"],
    "report": "reports/knip.json",
    "timeoutMs": 300000,
    "successCodes": [0, 1]
  },
  "dependencyCruiser": {
    "command": ["npm", "run", "analyze:architecture"],
    "report": "reports/dependencies.json",
    "timeoutMs": 300000,
    "successCodes": [0, 1]
  }
}
```

Those scripts should produce Knip's JSON reporter output and dependency-cruiser's
JSON output respectively. Only configure exit code 1 as acceptable when that
specific tool uses it for findings. Invalid or missing reports still fail.

## Self-report

`npm run self` builds source maps, runs the existing Node test suite with c8,
imports the source-mapped Istanbul report, runs lint and duplication, and writes
`reports/self/report.html` plus JSON. Coverage includes zero-hit runtime files;
generated browser copies are excluded while the original browser sources remain
in scope. The default self-report also runs Knip and dependency-cruiser.
Node tests do not measure browser interaction coverage. The separate
Chrome check verifies report behavior and themes but does not add coverage hits.

References: [ESLint API](https://eslint.org/docs/latest/integrate/nodejs-api),
[typescript-eslint project service](https://typescript-eslint.io/getting-started/typed-linting/),
[jscpd](https://github.com/kucherenko/jscpd), [c8](https://github.com/bcoe/c8),
[Knip JSON](https://knip.dev/features/reporters),
[dependency-cruiser JSON](https://github.com/sverweij/dependency-cruiser/blob/main/doc/output-format.md).
