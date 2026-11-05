# Current state and next-session entry points

Recorded 2026-11-05. Consult source and current reports before treating snapshot
details as current measurements.

## Repository state

The root is branded `panopticode-ng`; all TypeScript package files now live in
`ts/`, including ignored `node_modules/`, `dist/`, and `reports/` artifacts from
the working checkout. Root docs and MIT license remain shared. A matching
`ts/LICENSE` is retained for npm distribution. There is no root `package.json`.
The root folder and remote name are for the user to rename separately.

C# and PHP are planned, not implemented. No empty packages were scaffolded.
Discuss native analyzers and metrics before implementing them, then use the
second real consumer to define the shared JSON/rendering boundary. Do not begin
this work merely because a new session starts; the next concrete task is the
user's choice.

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
