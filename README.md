# panopticode-ng

Clear visual explanations of codebase health, inspired by the original
[Panopticode](https://sourceforge.net/projects/panopticode/).

Panopticode NG is a monorepo for language-specific static analysis and health
checks, with a common approach to reporting: show the shape of a codebase,
explain its measurements, and connect findings to source locations.

| Language | Package | Status |
| --- | --- | --- |
| TypeScript and configured JavaScript | [ts/](ts/README.md) | Implemented |
| C# | Planned `csharp/` package | Analyzer and tool choices to be designed |
| PHP | Planned `php/` package | Analyzer and tool choices to be designed |

Each package owns its dependencies, lockfile, configuration, tests, and build
commands. The repository root does not require npm; future .NET and Composer
toolchains can coexist with the TypeScript package. A common report format and
visualizations can be extracted when another language package needs them.

## Use the TypeScript package

From the repository root, with Node.js 22 or later and npm:

```sh
npm --prefix ts ci
npm --prefix ts test
npm --prefix ts run self
```

Open [ts/reports/self/report.html](ts/reports/self/report.html) after generating
the self-report. To analyze another TypeScript codebase:

```sh
node ts/dist/cli.js /path/to/project --out ts/reports/my-project
```

All analysis passes run by default. See the [TypeScript package README](ts/README.md)
for the available tools, `--no-*` controls, coverage discovery, and JSON imports.

## Project documentation

- [Architecture decision records](docs/ADR/README.md)
- [Architecture and language boundaries](docs/design.md)
- [TypeScript analyzer configuration](ts/docs/analyzers.md)
- [TypeScript port design](ts/docs/design.md)
- [TypeScript refinement history](ts/docs/refinements.md)

Measurements and findings remain separate. Reports explain their definitions,
tool versions, scope, and missing or failed evidence. New metrics and third-party
analysis tools should be discussed before implementation in any language package.

Agents should read the [guidance and handoff notes in `docs/AGENTS/`](docs/AGENTS/README.md)
for project decisions, current implementation details, validation commands, and
next-session context.

MIT licensed; see [LICENSE](LICENSE). Dependencies retain their own licenses.
