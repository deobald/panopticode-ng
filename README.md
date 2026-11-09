# panopticode-ng

Clear visual explanations of codebase health, inspired by the original
[Panopticode](https://sourceforge.net/projects/panopticode/).

Analyze a codebase, inspect its complexity and hygiene, and follow findings to
source locations. Each language package produces an offline `report.html` and
a versioned `report.json`. Measurements and findings remain separate, with
missing or failed evidence shown explicitly and no aggregate health score.

| Language | Status | Package guide |
| --- | --- | --- |
| TypeScript and configured JavaScript | Implemented | [ts/](ts/README.md) |
| PHP | Implemented; focused on hardening and eventual retirement | [php/](php/README.md) |
| C# | Next; tools and entrypoint to be designed | Planned `csharp/` package |

## Run an analysis

Run all commands below from the repository root. Install each package once,
then run its entrypoint against your project. Choose separate output directories
for reports you want to keep.

### TypeScript / JavaScript

Requires Node.js 22+ and npm. Install and build:

```sh
npm --prefix ts ci
npm --prefix ts run build
```

Analyze:

```sh
node ts/dist/cli.js /path/to/project --out reports/ts
```

Open `reports/ts/report.html`. See the [TypeScript guide](ts/README.md) for
project selection, analyzer configuration, and report controls.

### PHP

Requires PHP 8.2+, Composer, DOM/SimpleXML, and Node.js 22+ with npm for
duplication analysis. Install:

```sh
composer install --working-dir=php --no-plugins --no-scripts
npm --prefix php ci --ignore-scripts
```

Analyze:

```sh
php php/bin/panopticode-php /path/to/project --out reports/php
```

Open `reports/php/report.html`. See the [PHP guide](php/README.md) for coverage
setup, framework considerations, and report controls.

### Common behavior

All integrated analysis passes run by default. Each package provides report
imports and `--no-*` opt-outs; use `--help` on its entrypoint for details.
Coverage needs the target project's test setup. An unavailable or failed pass
remains visible while other passes continue and reports are written.

The examples assume the required runtimes are on your PATH. mise is optional.
PHP uses Node only for duplication; `--no-duplication` removes that runtime
requirement when analyzing PHP.

## Develop a language package

Each package owns its dependencies, lockfiles, configuration, and tests. Use
its native toolchain; no root build system is required. After installation:

| Package | Validate |
| --- | --- |
| TypeScript | `npm --prefix ts test` |
| PHP | `php php/tests/run.php` |

C# will follow the same install, analyze, and inspect flow using its .NET
toolchain. Its implementation and analyzer choices remain future work.

## Project documentation

- [Architecture decision records](docs/ADR/README.md)
- [Architecture and language boundaries](docs/design.md)
- [TypeScript analyzer configuration](ts/docs/analyzers.md)
- [TypeScript port design](ts/docs/design.md)
- [PHP CLI, tools, and configuration](php/README.md)
- [Agent guidance and handoff notes](docs/AGENTS/README.md)

New metrics and third-party analyzers should be discussed before implementation.
Language-specific definitions and tool versions travel with each report;
similarly named measurements need not be numerically equivalent across languages.

MIT licensed; see [LICENSE](LICENSE). Dependencies retain their own licenses.
