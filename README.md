# panopticode-ts

Visual explanations of TypeScript codebase health, inspired by
[Panopticode](https://sourceforge.net/projects/panopticode/).

Generate a self-contained HTML report and a versioned JSON snapshot. Rectangle
area shows code size; color shows complexity, imported test coverage, or imported
ESLint findings. Explore directories and files, inspect functions, and search
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

Analyze this repository:

```sh
npm run build
node dist/cli.js . --out reports/self
```

Analyze another codebase:

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
  findings. Unknown data has a separate neutral color.
- Search by function name or file path. Search changes rectangle area to reflect
  matching regions; group colors retain the full group's metrics.
- Use the sortable function list to reach regions too small to label on the map.
  Keyboard users can select table buttons or focus treemap regions and press Enter.

## Import coverage and lint results

Panopticode reads existing report files. It does not run tests, execute the
analyzed project's code or lint configuration, install tools in that project,
or choose lint rules.

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
to the coverage producer; Panopticode does not infer or execute it.

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
array have no reported findings. Suppressed messages are not counted. No ESLint
or typescript-eslint package is bundled.

Absolute report paths must match the analyzed checkout. Relative paths resolve
from the analyzed project directory (or the selected tsconfig's directory).
Unmatched entries produce visible warnings. Reports from a different source
revision can contain stale locations; regenerate them before analysis.

## Metric definitions

The first version ports the original size, cyclomatic complexity, and coverage
ideas. It adds the agreed ESLint import. It does not introduce a combined health
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

## Project discovery

The selected tsconfig's `include`, `exclude`, `files`, `extends`, and project
references drive discovery. Without a local tsconfig, the CLI scans the supplied
directory. It supports `.ts`, `.tsx`, `.mts`, and `.cts` and skips `.d.ts`,
`.d.mts`, and `.d.cts` files. Tests are included when the tsconfig includes them.
Do not expect JavaScript or framework single-file components to be analyzed.

Directories named `node_modules`, `.git`, `dist`, `build`, `coverage`, or `reports`
are always excluded, as is the chosen output directory. Referenced files outside
the selected project root are skipped with warnings; choose a common root for a
monorepo. Invalid TypeScript syntax or malformed imports stop generation with an
error. Type errors do not prevent syntax analysis.

The only runtime dependency is the TypeScript compiler API, pinned to the 5.9
minor series for reproducibility. Projects using syntax newer than this parser
may need a future parser update.

## Development

```sh
npm run check     # Type-check the implementation
npm test          # Build and run the Node test suite
npm run demo      # Generate the example report
```

An optional browser smoke check uses an installed Chrome through its DevTools
pipe, without a browser automation dependency:

```sh
node scripts/browser-check.mjs
```

Run `npm run demo` first. On systems without Chrome at the default macOS path,
set `PANOPTICODE_CHROME` to a Chromium executable. The check exercises offline
loading, metrics, search, navigation, and desktop/mobile rendering, and writes
screenshots under `reports/demo`.

Analysis and import APIs are exported from `src/index.ts` (built to `dist`), and
`report.json` carries `schemaVersion: 1`. See [the design notes](docs/design.md)
for the original project's relevant implementation and the port's scope.

MIT licensed. The original Panopticode was created by Julias R. Shaw; this port
preserves its visual approach with a new TypeScript implementation.
