# panopticode-ts

The TypeScript package in the [Panopticode NG monorepo](../README.md). Run the
commands below from this `ts/` directory.

Visual explanations of TypeScript codebase health, inspired by
[Panopticode](https://sourceforge.net/projects/panopticode/).

Generate a self-contained HTML report and a versioned JSON snapshot. Rectangle
area shows code size; color shows complexity, test coverage, lint findings,
control nesting, or duplicated lines. Explore directories and files, inspect functions, and search
for code that deserves a closer look. Reports work offline, including when
opened directly from the filesystem.

## Try it

Requires Node.js 22 or later and npm.

```sh
npm ci
npm test
npm run demo
```

Open `reports/demo/report.html` in a browser. The demo's code, coverage, and
lint findings are **synthetic fixtures**, intended to demonstrate how the views
work. Desktop and mobile layouts are supported.
Reports follow your system's light/dark theme automatically, including changes
while the report is open. Printing uses the light palette.

Analyze this repository:

```sh
npm run self
```

The self command runs the Node tests with c8 coverage, the bundled lint
baseline, and jscpd, then writes `reports/self/report.html`.

Analyze another codebase with all analysis passes enabled:

```sh
node dist/cli.js /path/to/project --out reports/my-project
```

Or select a specific configuration:

```sh
node dist/cli.js --project /path/to/project/tsconfig.app.json \
  --name "Payments service" --out reports/payments
```

Each invocation writes `report.html` and `report.json` to the selected output
directory, replacing earlier reports there. The default is
`reports/panopticode` relative to the working directory.

## Explore a report

- Select a treemap region to inspect its metrics and source location. Select
  **Open this group** to zoom into a directory or file; use the breadcrumbs to
  move back out.
- Use **Color by** to switch between complexity, line coverage, and file lint
  findings, nesting, and duplication. Unknown data has a separate neutral color.
- Inspect the evidence panels for tool versions, pass status, grouped rule
  messages, and duplication matching blocks. Measurements are independent of
  rule thresholds and are never combined into a quality penalty.
- Search by function name or file path. Search changes rectangle area to reflect
  matching regions; group colors retain the full group's metrics.
- Use the sortable function list to reach regions too small to label on the map.
  Keyboard users can select table buttons or focus treemap regions and press Enter.

## Run lint and coverage

ESLint/typescript-eslint (including typed rules), selected SonarJS rules, test
coverage, jscpd, Knip, and dependency-cruiser run by default. The lint baseline
uses the versioned `panopticode-baseline` profile. The baseline uses recommended
correctness rules and selected maintainability checks, with no formatting
preset or autofixes. It does not load the project's lint configuration or honor
inline rule overrides. Use project mode to apply the project's own policy:

```sh
node dist/cli.js /path/to/project --lint project
node dist/cli.js /path/to/project --no-typed-lint
node dist/cli.js /path/to/project --no-coverage --no-knip --no-dep-cruiser
node dist/cli.js /path/to/project --no-lint --no-duplication
```

Typed baseline linting uses typescript-eslint's own project service. Project
mode respects the project's ESLint policy; `--no-typed-lint` disables its
typescript-eslint type-checked rules. `--no-lint` skips linting altogether.

Coverage runs tests automatically. Panopticode uses a configured coverage
command first, then a `test:coverage` or `coverage` package script. If only a
`test` script is available, bundled c8 wraps it and writes Istanbul JSON in the
report's analyzer directory. `tsconfig` defines the source/test scope; package
scripts define how tests execute. Override the coverage script when needed:

```sh
node dist/cli.js /path/to/project --coverage-script test:coverage \
  --coverage /path/to/project/coverage/coverage-final.json
```

For another runner or package manager, configure an argument-array command in
`panopticode.config.json`; it runs automatically. Commands use no shell, have
timeouts, and must write a fresh JSON report. Failed passes are shown in the
report, remaining passes continue, and the CLI exits nonzero. Missing test setup
is a failure with setup guidance, not a successful or silently skipped pass.
Panopticode does not install tools in the analyzed project.
See [analyzer configuration](docs/analyzers.md) for profiles, commands, custom
metrics, and Knip/dependency-cruiser configuration. Use `--no-coverage`,
`--no-knip`, or `--no-dep-cruiser` to disable those passes, including their JSON
imports. `--no-dependency-cruiser` is an alias for `--no-dep-cruiser`.
`--no-typed-lint` controls native lint configuration; it does not filter findings
in an imported ESLint report.

## Import existing results

Imports remain available for CI and separate analysis pipelines. Supplying
`--eslint` bypasses the bundled lint runner:

```sh
node dist/cli.js /path/to/project \
  --coverage /path/to/project/coverage/coverage-final.json \
  --eslint /path/to/project/eslint-results.json \
  --out reports/project
```

**Coverage:** accepts Istanbul `coverage-final.json` with `statementMap` and `s`
execution counts, as produced by compatible coverage reporters. Supply a report
mapped to the original TypeScript source from the same checkout. Raw V8 coverage,
LCOV, and `coverage-summary.json` are not accepted. Source-map conversion belongs
to the coverage producer; Panopticode consumes its source-mapped output.

File coverage counts distinct mapped statement-start lines. A line is covered
when any statement starting on it ran. Region coverage intersects these lines
with the region's owned statement-start lines. Multiple functions on one line
can therefore share coverage. This is a line-based approximation; it is not
branch coverage or function invocation coverage. Missing lines do not become
uncovered lines, and missing files remain unknown. Group totals combine known
file coverage and show how many files supplied data.

**ESLint:** accepts the array from the existing project's `eslint --format json`
output. Use the project's installed runner and configuration to produce it.
Panopticode displays warning/error messages, rule names, and locations at file
scope. A function's lint color and detail panel reflect its **whole file**.
Files absent from the report remain unknown; files present with an empty message
array have no reported findings. Suppressed messages are not counted in imported/project results. The bundled
lint baseline uses its own versioned policy and ignores inline overrides.

Absolute report paths must match the analyzed checkout. Relative paths resolve
from the analyzed project directory (or the selected tsconfig's directory).
Unmatched entries produce visible warnings. Reports from a different source
revision can contain stale locations; regenerate them before analysis.

## Metric definitions

The measurements preserve the original size, cyclomatic complexity, and coverage
ideas, and add the requested nesting, class structure, and duplication evidence. It does not introduce a combined health
score. Full definitions are embedded in every report and its JSON.

**Size:** counts executable syntax-tree statements, excluding blocks, empty
statements, imports, and type/function/class declarations. An expression-bodied
arrow or field initializer adds one statement. A nested function owns its own
body; its enclosing function does not count that body. Empty functions and
declaration-only files receive a minimum display weight of one so they remain
inspectable. Directory label gutters also consume display space, so visible
areas are approximate across hierarchy levels. This is a TypeScript adaptation,
not a claim of numerical equivalence to JavaNCSS.

**Cyclomatic complexity:** starts at one for each executable function or
module-level region, then adds one for each `if`, loop, non-default `case`,
`catch`, ternary, `&&`, `||`, `??`, their assignment forms, or default parameter.
Nested functions are independent. Optional chaining does not add complexity.
Type-level conditional expressions do not count. Constructors, accessors,
methods, callbacks, arrow functions, and module-level code are represented.
Declaration-only regions have unknown complexity.

The original bands are preserved: **1–5**, **6–9**, **10–24**, **25+**. Configure
the three lower boundaries with `--thresholds 6,10,25`. A group's color uses its
**maximum** region complexity. These bands are prompts for inspection, not
universal pass/fail judgments. This is syntax-based analysis: it does not resolve
types, prove reachability, or model runtime execution paths.

**Additional measurements:** every executable function retains physical size,
parameter count, and maximum control nesting, even if lint reports no violation.
Nested functions reset nesting depth. Classes expose declared methods,
properties, constructors, accessors, base class, and implemented interfaces.
Custom metric modules are explicitly selected and versioned.

**Duplication:** jscpd's core detector and tokenizer run on the selected source
files, using mild mode (whitespace skipped; comments retained), with defaults of
50 tokens and 5 jscpd lines. Matching source ranges are shown in pairs. Overlap
is counted once per file; the map divides these unique duplicated lines by
physical file lines. Duplication is separate from similar lint findings.

## Project discovery

The selected tsconfig's `include`, `exclude`, `files`, `extends`, and project
references drive discovery. Without a local tsconfig, the CLI scans the supplied
directory. It supports `.ts`, `.tsx`, `.mts`, and `.cts` and skips `.d.ts`,
`.d.mts`, and `.d.cts` files. Tests are included when the tsconfig includes them.
Projects with `allowJs` also include configured `.js`, `.jsx`, `.mjs`, and `.cjs`
files under the same metric definitions. This lets the self report inspect the
browser runtime as well as the TypeScript CLI. Directory fallback scanning
remains TypeScript-only. Framework single-file components are not supported.

Directories named `node_modules`, `.git`, `dist`, `build`, `coverage`, or `reports`
are always excluded, as is the chosen output directory. Referenced files outside
the selected project root are skipped with warnings; choose a common root for a
monorepo. Invalid TypeScript syntax or malformed imports stop generation with an
error. Type errors do not prevent syntax analysis.

The runtime uses ts-morph 27 and its TypeScript 5.9 parser, plus bundled lint
duplication, coverage, hygiene, and architecture libraries. Analyzer dependencies
are pinned, and actual tool
versions and rule-configuration hashes are recorded in each report. The
TypeScript compiler is a development dependency for building Panopticode itself. Projects using
syntax newer than this parser may need a future parser update.

## Development

```sh
npm run check     # Type-check the implementation
npm test          # Build and run the Node test suite
npm run demo      # Generate the example report
npm run self      # Run every analysis pass and render the self-report
npm run lint      # Check the source with the bundled lint profile
npm run test:coverage  # Collect source-mapped coverage (build first)
```

An optional browser smoke check uses an installed Chrome through its DevTools
pipe, without a browser automation dependency:

```sh
node scripts/browser-check.mjs
```

Run `npm run demo` first. On systems without Chrome at the default macOS path,
set `PANOPTICODE_CHROME` to a Chromium executable. The check exercises offline
loading, metrics, search, navigation, live system-theme changes, print styles,
and desktop/mobile rendering. It writes screenshots under `reports/demo`, and
also checks and captures `reports/self` when that report exists.

Analysis and import APIs are exported from `src/index.ts` (built to `dist`), and
`report.json` carries `schemaVersion: 2`. The synchronous `analyze()` API collects
measurements; the asynchronous `runProject()` API orchestrates the full pipeline. See [the design notes](docs/design.md)
for the original project's relevant implementation and the port's scope.
The [refinement notes](docs/refinements.md) explain the ts-morph evaluation and
the before/after self-report results. A regression test requires every runtime
region to stay below complexity 10 with the original thresholds.

MIT licensed. The original Panopticode was created by Julias R. Shaw; this port
preserves its visual approach with a new TypeScript implementation.
