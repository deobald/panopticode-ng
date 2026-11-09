<?php
declare(strict_types=1);

use Panopticode\Options;
use Panopticode\Pipeline;
use Panopticode\Project;

$autoload = __DIR__ . '/../vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "Install dependencies first: composer install --working-dir=php\n");
    exit(2);
}
require $autoload;

try {
    $options = Options::parse(array_slice($_SERVER['argv'] ?? [], 1));
    if (isset($options['help'])) {
        echo <<<'HELP'
Panopticode PHP — code health and retirement evidence

Usage: php php/bin/panopticode-php [PROJECT] [options]

  --out DIR             Output directory (default: reports/php, relative to cwd)
  --name NAME           Report title
  --exclude DIR         Exclude a project-relative directory at any depth; repeatable
  --level 0..10         PHPStan level (default: 5)
  --timeout SECONDS     Per-command timeout (default: 300)
  --config FILE         Version-1 panopticode JSON config (relative to cwd)
  --pdepend FILE        Import PDepend summary XML
  --phpstan FILE        Import PHPStan JSON correctness findings
  --dead-code FILE      Import PHPStan JSON with ShipMonk identifiers
  --coverage FILE       Import Clover XML instead of running project tests
  --duplication FILE    Import jscpd JSON
  --no-pdepend          Skip structural measurements
  --no-phpstan          Skip correctness analysis
  --no-dead-code        Skip unused-member analysis
  --no-coverage         Skip coverage execution/import
  --no-duplication      Skip duplication analysis
  --help                Show this help

All passes run by default. Disable flags override imports. Import paths are
relative to cwd. Output includes report.json, offline report.html and raw runs/.
Exit codes: 0 = passes succeeded (findings allowed), 1 = failed pass, 2 = CLI error.

HELP;
        exit(0);
    }
    $root = realpath($options['root']);
    if ($root === false || !is_dir($root)) {
        throw new RuntimeException('PROJECT must be an existing directory');
    }
    $out = $options['out'];
    if (!is_dir($out) && !mkdir($out, 0777, true)) {
        throw new RuntimeException('Cannot create output directory');
    }
    $out = realpath($out);
    if ($out === $root || str_starts_with($root, $out . '/')) {
        throw new RuntimeException('Output directory must not be the project root or its ancestor');
    }
    $project = new Project($root, $out, $options['exclude']);
    $report = (new Pipeline($project, $options, $out))->run();
    $failed = count(array_filter($report['analyzers'], fn ($pass) => $pass['status'] === 'failed'));
    echo count($report['files']) . ' PHP files · ' . count($report['findings']) . " findings · $failed failed passes\n";
    echo "$out/report.html\n$out/report.json\n";
    exit($failed > 0 ? 1 : 0);
} catch (Throwable $error) {
    fwrite(STDERR, 'panopticode-php: ' . $error->getMessage() . "\n");
    exit(2);
}
