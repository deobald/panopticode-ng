# Panopticode PHP

Code health and hygiene evidence for applications being hardened and eventually
replaced with TypeScript. The CLI produces a terminal summary, versioned JSON,
and standalone offline HTML. No style rules, autofix, or automatic deletion runs.

## Install and run

Requires PHP 8.2+, Composer, DOM/SimpleXML, and Node.js 22+ for duplication.
The analyzer runtime is independent of the application's test runtime.
From the repository root:

```sh
composer install --working-dir=php --no-plugins --no-scripts
npm --prefix php ci --ignore-scripts
php php/bin/panopticode-php /path/to/legacy-app --out php/reports/legacy-app
```

Open `php/reports/legacy-app/report.html`. `report.json` retains full evidence;
`runs/` holds raw tool output and generated configurations for each invocation.
If Node is already on PATH, the plain PHP command above is sufficient. If you
manage Node with mise, you can prefix it with `mise exec node@24 --` to make Node
available to jscpd. Use `--no-duplication` to analyze PHP without Node.

| Pass | Tool | Purpose |
| --- | --- | --- |
| Measurements | PDepend 3 | Complexity, size, coupling, inheritance and class structure help inspect replacement difficulty and boundaries. |
| Correctness | PHPStan 2 | Detect type errors and incorrect assumptions. Default level: 5. |
| Unused members | ShipMonk Dead Code Detector | Find methods, properties, constants and enum cases for deletion review. Separate PHPStan pass. |
| Coverage | Project PHPUnit or configured command; Clover | Identify code needing behavior characterization before replacement. |
| Duplication | jscpd 4 | Identify repeated implementations to inspect together. |

Resolved versions are locked and recorded in reports. There is no aggregate
health score. The normalized report excludes PDepend's maintainability index
and Halstead bug/time estimates. Deptrac and coding-standard tools are excluded;
PHPMD, PhpMetrics and Psalm are not integrated.

The initial HTML report includes a file complexity overview, source-located
entity tables, coupling, correctness findings, unused-member candidates,
coverage, duplicates, and analyzer statuses. Its JSON contract is PHP-specific,
version 1 with `language: "php"`. Executable/logical lines are not TypeScript
AST statement counts; the existing TypeScript renderer/schema is separate.

## Scope and limitations

The CLI discovers `.php` files including tests and entry scripts. It excludes
`vendor`, `node_modules`, `.git`, `reports`, the output directory, and symlinks.
Repeat `--exclude DIR` for project-relative directories at any depth. Other
extensions and non-PHP templates are not independently measured. Excluding
code can hide callers and affect confidence in unused-member findings.

PDepend receives the discovered file set. Its summary may omit interfaces,
closures, arrow functions and top-level regions as independent entities.
Discovered files remain visible even when metrics are missing. CCN and CCN2
remain separate; the report displays extended complexity (CCN2).

PHPStan loads the target's first available `phpstan.neon`, `phpstan.neon.dist`,
or `phpstan.dist.neon`, and `vendor/autoload.php` when present. The CLI supplies
level, scope, exclusions and cache location. Project rules, baselines, bootstrap
code and suppressions can influence results. Framework extensions referenced
there must be installed in the target project. The generated configurations
and raw evidence are retained for inspection.

ShipMonk uses a full directory scope and its built-in framework usage providers.
Dynamic calls, routes, reflection, templates and external consumers require
review before deleting candidates. It does not establish that whole files or
classes are unused. Test coverage does not prove behavior parity with a TS
replacement.

## Coverage and configuration

All passes run by default. Coverage runs the target's `vendor/bin/phpunit` with
`--coverage-clover`; the target must provide PCOV or Xdebug. To use another PHP
runtime, Pest, a container or a custom command, put `panopticode.config.json`
in the target root:

```json
{
  "version": 1,
  "phpstan": { "configuration": "phpstan-health.neon" },
  "coverage": {
    "command": ["php8.1", "vendor/bin/phpunit", "--coverage-clover", "coverage/clover.xml"],
    "report": "coverage/clover.xml"
  }
}
```

Both sections are optional. Configuration paths resolve against the target
root. Commands are argument arrays, run without a shell in that root, with a
per-command timeout. Coverage must exit zero and create or change its report;
a failed command never imports stale evidence.

Import existing reports instead of executing passes:

```sh
php php/bin/panopticode-php /path/to/app --out php/reports/app \
  --pdepend evidence/pdepend.xml --phpstan evidence/phpstan.json \
  --dead-code evidence/dead-code.json --coverage evidence/clover.xml \
  --duplication evidence/jscpd-report.json
```

Import paths and `--config FILE` resolve against the invoking working directory.
Paths inside evidence resolve against the target root; absolute paths must
match the checkout. Producer versions in imported reports are unspecified.
Formats are PDepend summary XML, PHPStan JSON, Clover XML, and jscpd JSON.
ShipMonk `shipmonk.*` identifiers appear only in the unused-member section.

Use `--no-pdepend`, `--no-phpstan`, `--no-dead-code`, `--no-coverage`, and
`--no-duplication` for opt-outs; these override imports. Other options are
`--level 0..10`, `--timeout SECONDS`, `--name NAME`, `--exclude DIR`, and `--help`.
Unavailable tools or missing coverage setup fail visibly. Other passes still
run and reports are written. Missing coverage/duplication files remain unknown.
Exit codes: 0 = successful passes (findings allowed), 1 = failed pass, 2 = CLI
or setup error. Skipped passes are distinct from successful empty results.

## Validation

```sh
mise exec node@24 -- php php/tests/run.php
mise exec node@24 -- php php/bin/panopticode-php php/examples/demo \
  --out php/reports/demo --no-coverage
```

Tests run real PDepend, PHPStan, ShipMonk and jscpd. They check metrics,
locations, findings, scope, duplication, Clover imports, fresh/stale coverage
commands, failure statuses, timeouts, malformed reports and HTML escaping.
PHPStan needs a local worker socket. Clover fixtures test importing, not
measured coverage of this package's tests.

References: [PDepend](https://github.com/pdepend/pdepend),
[PHPStan](https://phpstan.org/user-guide/command-line-usage),
[ShipMonk](https://github.com/shipmonk-rnd/dead-code-detector),
[PHPUnit coverage](https://docs.phpunit.de/en/12.5/code-coverage.html),
[jscpd](https://github.com/kucherenko/jscpd).
