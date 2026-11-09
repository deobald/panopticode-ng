# Current state and next-session entry points

Recorded 2026-11-05. Consult source and current reports before treating snapshot
details as current measurements.

## Repository state

The root is branded `panopticode-ng`; all TypeScript package files now live in
`ts/`, including ignored `node_modules/`, `dist/`, and `reports/` artifacts from
the working checkout. Root docs and MIT license remain shared. A matching
`ts/LICENSE` is retained for npm distribution. There is no root `package.json`.
The root folder and remote name are for the user to rename separately.

PHP now has a native CLI under `php/`; see its README and ADR-010. It runs
PDepend, PHPStan, ShipMonk unused-member analysis, project coverage execution or
Clover import, and jscpd. It writes its own version-1 PHP JSON and simple offline
HTML, without changing TypeScript's schema or renderer. The target PHP codebases
are being hardened for eventual replacement with TypeScript; no style checks
or architectural-rule setup are required. C# remains planned.

Install with `composer install --working-dir=php --no-plugins --no-scripts` and
`npm --prefix php ci --ignore-scripts`. Run
`mise exec node@24 -- php php/bin/panopticode-php /path/to/app --out php/reports/app`.
Validate with `mise exec node@24 -- php php/tests/run.php`; PHPStan needs a local
worker socket. Coverage requires the target's PHPUnit/driver or a configured
command; unavailable setup fails visibly. See `php/README.md` for imports and
`--no-*` opt-outs. Do not silently skip coverage or equate unused members with
safe deletion. User questions about target PHP versions/frameworks and local
checkout paths are still pending.

PHP validation for this implementation: 37 fixture/integration checks passed.
The PHP self-report, excluding deliberate demo errors with `--exclude examples`
and explicitly skipping unavailable runtime coverage with `--no-coverage`, had
no PHPStan correctness or ShipMonk findings. This is not a claim of measured
test coverage, absence of duplication, or analysis of the user's applications.

The historical Java checkout was a sibling named `panopticode`: from the root,
look in `../panopticode`; from `ts/`, `../../panopticode`. Useful original
references include `website/trunk/documentation/index.html`,
`panopticode-java/trunk/prod/src/org/panopticode/report/treemap/ComplexityTreemap.java`,
the adjacent coverage implementation, and `sample/sample_graphs/`. The existing
[port design](../../ts/docs/design.md) records the comparison.

## Commands

Node.js 22+ is required. Prior validation used Node 24 through mise; bare
`node`/`npm` were not on that session's shell PATH. From the repository root:

```sh
mise exec node@24 -- npm --prefix ts test
mise exec node@24 -- npm --prefix ts run lint
mise exec node@24 -- npm --prefix ts run self
mise exec node@24 -- npm --prefix ts run demo
```

With a suitable Node/npm already on PATH, omit `mise exec node@24 --`.
Fresh installs use `npm --prefix ts ci`. Do not reinstall solely because the
checkout was renamed if dependencies are still present and valid.

Self-report artifacts are `ts/reports/self/report.html` and adjacent JSON;
the demo is under `ts/reports/demo/`. To analyze a target after building:

```sh
node ts/dist/cli.js /path/to/project --out ts/reports/my-project
```

For browser validation, run from **inside `ts/`**:

```sh
mise exec node@24 -- node scripts/browser-check.mjs
mise exec node@24 -- npm pack --dry-run
```

The browser script uses installed Google Chrome on macOS, overridable through
`PANOPTICODE_CHROME`. It checks interaction, themes, print, and mobile layout
without an extra browser-automation dependency.

## Latest validation before the documentation handoff

Following relocation, all 39 Node tests passed. Root-delegated lint, self-report,
and demo generation passed. The Chrome check passed, and npm's pack dry-run
included runtime assets, README, docs, and LICENSE. This is a historical check,
not a claim that tests were rerun after every documentation edit.

Earlier self-report-driven refactoring removed all runtime regions with
cyclomatic complexity 10+, including browser JavaScript previously absent from
discovery. Tests guard that scope and threshold. Other evidence can still
contain coverage gaps, lint warnings, unused exports, or dependency findings;
do not equate that complexity guard with a completely clean report. Generate
and inspect fresh evidence before the next cleanup.
