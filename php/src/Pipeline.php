<?php
declare(strict_types=1);

namespace Panopticode;

use Composer\InstalledVersions;
use RuntimeException;
use Throwable;

final class Pipeline
{
    private array $report;
    private string $runDir;
    private array $config;

    public function __construct(private Project $project, private array $options, private string $out)
    {
        $this->config = self::configuration($project->root, $options);
        $this->runDir = $out . '/runs/' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4));
        if (!mkdir($this->runDir, 0777, true)) {
            throw new RuntimeException('Cannot create report directory');
        }
        $this->report = [
            'schemaVersion' => 1, 'language' => 'php', 'name' => $options['name'] ?? basename($project->root),
            'generatedAt' => gmdate('c'), 'files' => [], 'findings' => [], 'duplicates' => null,
            'analyzers' => [], 'warnings' => [
                'Unused members are deletion candidates, not proof of safe removal. Dynamic calls, routes, templates and external consumers require review.',
                'Coverage measures executed statement lines, not behavior parity with a TypeScript replacement.',
                'PDepend may omit interfaces, closures, arrow functions and top-level regions as separate entities. File metrics and the discovered file inventory remain distinct.',
            ],
            'definitions' => [
                'size' => 'PDepend executable lines (eloc), logical lines (lloc) and physical lines are distinct measurements; none is TypeScript AST statement count.',
                'complexity' => 'PDepend extended cyclomatic complexity (ccn2) includes boolean decision paths. NPath counts acyclic execution paths. Values are not interchangeable with TypeScript complexity.',
                'coupling' => 'PDepend ca counts incoming dependencies; ce counts outgoing dependencies; cbo measures coupling between objects. These describe static references, not production traffic.',
                'coverage' => 'Clover stmt lines, counted once per source line; covered if any hit count is positive. Missing files remain unknown. Zero executable lines have no coverage percentage.',
                'duplication' => 'jscpd mild token matching: minimum 50 tokens and 5 lines. Overlapping physical source ranges count once per file. Similarity does not prove interchangeable behavior.',
                'findings' => 'PHPStan correctness and ShipMonk unused-member findings are separate evidence. There is no aggregate score, automatic deletion, formatting or autofix.',
            ],
        ];
    }

    public static function configuration(string $root, array $options): array
    {
        $path = $options['config'] ?? $root . '/panopticode.config.json';
        if (!isset($options['config']) && !is_file($path)) {
            return [];
        }
        $config = Evidence::json($path);
        if (($config['version'] ?? null) !== 1) {
            throw new RuntimeException('Configuration version must be 1');
        }
        if (isset($config['coverage']) && !is_array($config['coverage'])) {
            throw new RuntimeException('coverage configuration must be an object');
        }
        if (isset($config['phpstan']) && !is_array($config['phpstan'])) {
            throw new RuntimeException('phpstan configuration must be an object');
        }
        return $config;
    }

    public function run(): array
    {
        foreach (['pdepend', 'phpstan', 'dead-code', 'coverage', 'duplication'] as $pass) {
            $this->pass($pass);
        }
        $this->report['files'] = array_values($this->project->files);
        $missing = count(array_filter($this->project->files, fn ($file) => $file['metrics'] === null));
        if ($missing > 0) {
            $this->report['warnings'][] = "$missing discovered files have no PDepend file metrics; inspect measurement scope before comparing totals.";
        }
        Runner::write($this->out . '/report.json', json_encode($this->report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR) . "\n");
        Runner::write($this->out . '/report.html', Html::render($this->report));
        return $this->report;
    }

    private function pass(string $pass): void
    {
        $start = microtime(true);
        $packages = ['pdepend' => 'pdepend/pdepend', 'phpstan' => 'phpstan/phpstan', 'dead-code' => 'shipmonk/dead-code-detector'];
        $version = isset($packages[$pass]) ? InstalledVersions::getPrettyVersion($packages[$pass]) : 'unknown';
        if ($pass === 'duplication' && is_file(__DIR__ . '/../node_modules/jscpd/package.json')) {
            $version = Evidence::json(__DIR__ . '/../node_modules/jscpd/package.json')['version'];
        }
        $entry = ['id' => $pass, 'version' => isset($this->options[$pass]) ? 'external/unspecified' : $version,
            'status' => 'complete', 'files' => null,
            'configuration' => ['id' => 'php-retirement', 'version' => 1, 'level' => $this->options['level'],
                'excludes' => $this->project->excludes], 'durationMs' => 0];
        try {
            if (isset($this->options['no-' . $pass])) {
                $entry['status'] = 'skipped';
                $entry['files'] = 0;
            } else {
                $path = $this->options[$pass] ?? $this->execute($pass);
                $this->import($pass, $path);
                $entry['status'] = isset($this->options[$pass]) ? 'imported' : 'complete';
                $entry['report'] = $path;
                $entry['files'] = match ($pass) {
                    'pdepend' => count(array_filter($this->project->files, fn ($file) => $file['metrics'] !== null)),
                    'coverage' => count(array_filter($this->project->files, fn ($file) => $file['coverage'] !== null)),
                    'duplication' => count(array_filter($this->project->files, fn ($file) => $file['duplicatedLines'] !== null)),
                    default => null, // PHPStan JSON does not supply an analyzed-file inventory.
                };
                $entry['configuration']['requestedFiles'] = count($this->project->files);
                $entry['configuration']['evidenceSha256'] = hash_file('sha256', $path);
                $entry['configuration']['generatedFiles'] = [];
                $configurationFiles = match ($pass) {
                    'pdepend' => ['pdepend.yml', 'sources.json'],
                    'phpstan', 'dead-code' => [$pass . '.neon'],
                    'duplication' => ['jscpd.json'],
                    default => [],
                };
                foreach ($configurationFiles as $generated) {
                    $generated = $this->runDir . '/' . $generated;
                    if (is_file($generated)) {
                        $entry['configuration']['generatedFiles'][$generated] = hash_file('sha256', $generated);
                    }
                }
                if ($pass === 'coverage' && !isset($this->options[$pass])) {
                    $entry['version'] = 'project PHPUnit/command; version not captured';
                }
            }
        } catch (Throwable $error) {
            $entry['status'] = 'failed';
            $entry['detail'] = $error->getMessage();
            $this->report['warnings'][] = "$pass failed: " . $error->getMessage();
        }
        $entry['durationMs'] = (int) round((microtime(true) - $start) * 1000);
        $this->report['analyzers'][] = $entry;
        fwrite(STDERR, $pass . ': ' . $entry['status'] . "\n");
    }

    private function execute(string $pass): string
    {
        if ($this->project->files === []) {
            throw new RuntimeException('No PHP source files found');
        }
        return match ($pass) {
            'pdepend' => $this->measure(),
            'phpstan', 'dead-code' => $this->phpstan($pass === 'dead-code'),
            'coverage' => $this->coverage(),
            'duplication' => $this->duplication(),
            default => throw new RuntimeException("Unknown pass: $pass"),
        };
    }

    private function measure(): string
    {
        $config = $this->runDir . '/pdepend.yml';
        Runner::write($config, "pdepend:\n  cache:\n    driver: memory\n");
        $file = $this->runDir . '/pdepend.xml';
        // The explicit file set prevents analyzer defaults from expanding source scope.
        $paths = array_map(fn ($path) => $this->project->root . '/' . $path, array_keys($this->project->files));
        $manifest = $this->runDir . '/sources.json';
        Runner::write($manifest, json_encode($paths, JSON_THROW_ON_ERROR));
        $command = [PHP_BINARY, __DIR__ . '/measure.php', $manifest, $config, $file];
        $output = Runner::run($command, $this->project->root, $this->options['timeout']);
        Runner::write($this->runDir . '/pdepend.log', $output);
        return $file;
    }

    private function phpstan(bool $dead): string
    {
        $name = $dead ? 'dead-code' : 'phpstan';
        $includes = [];
        $configured = $this->config['phpstan']['configuration'] ?? null;
        if ($configured !== null) {
            if (!is_string($configured)) {
                throw new RuntimeException('phpstan.configuration must be a path');
            }
            $includes[] = $this->projectPath($configured);
        } else {
            foreach (['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon'] as $candidate) {
                if (is_file($this->project->root . '/' . $candidate)) {
                    $includes[] = $this->project->root . '/' . $candidate;
                    break;
                }
            }
        }
        if ($dead) {
            $includes[] = realpath(__DIR__ . '/../vendor/shipmonk/dead-code-detector/rules.neon');
        }
        $config = $this->runDir . '/' . $name . '.neon';
        $quote = fn ($value) => json_encode($value, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $text = $includes === [] ? '' : "includes:\n" . implode('', array_map(fn ($path) => '    - ' . $quote($path) . "\n", $includes));
        // ShipMonk intentionally disables itself for file-only analysis, even
        // when those files enumerate the whole checkout. Use a directory scope.
        $text .= "parameters:\n    level: " . $this->options['level'] . "\n    fileExtensions: [php]\n    paths:\n        - " . $quote($this->project->root) . "\n";
        $text .= "    tmpDir: " . $quote($this->runDir . '/' . $name . '-cache') . "\n";
        $text .= "    parallel:\n        maximumNumberOfProcesses: 1\n    excludePaths:\n        analyseAndScan:\n";
        foreach ($this->project->excludes as $exclude) {
            // Exclusion at any depth matches the discovered inventory's directory policy.
            $text .= '            - ' . $quote($this->project->root . '/*/' . $exclude . '/*') . "\n";
            $text .= '            - ' . $quote($this->project->root . '/' . $exclude . '/*') . "\n";
        }
        foreach (array_unique($this->project->ignoredLinks) as $link) {
            $text .= '            - ' . $quote($link) . "\n";
        }
        Runner::write($config, $text);
        $file = $this->runDir . '/' . $name . '.json';
        $command = [PHP_BINARY, __DIR__ . '/../vendor/bin/phpstan', 'analyse', '--configuration=' . $config,
            '--no-progress', '--error-format=json', '--memory-limit=1G'];
        $autoload = $this->project->root . '/vendor/autoload.php';
        if (is_file($autoload)) {
            $command[] = '--autoload-file=' . $autoload;
        }
        $output = Runner::run($command, $this->project->root, $this->options['timeout'], [0, 1]);
        Runner::write($file, $output);
        return $file;
    }

    private function coverage(): string
    {
        $task = $this->config['coverage'] ?? null;
        if ($task !== null) {
            if (!is_array($task['command'] ?? null) || !is_string($task['report'] ?? null)) {
                throw new RuntimeException('coverage requires command (argument array) and report (project-relative path)');
            }
            $command = $task['command'];
            $file = $this->projectPath($task['report']);
        } else {
            $phpunit = $this->project->root . '/vendor/bin/phpunit';
            if (!is_file($phpunit)) {
                throw new RuntimeException('No project PHPUnit. Configure coverage.command/report, import --coverage FILE, or use --no-coverage');
            }
            $file = $this->runDir . '/clover.xml';
            $command = [PHP_BINARY, $phpunit, '--coverage-clover', $file];
        }
        $before = Runner::fingerprint($file);
        $output = Runner::run($command, $this->project->root, $this->options['timeout']);
        Runner::write($this->runDir . '/coverage.log', $output);
        if (Runner::fingerprint($file) === $before) {
            throw new RuntimeException('Coverage command did not create or change its report');
        }
        return $file;
    }

    private function duplication(): string
    {
        $binary = __DIR__ . '/../node_modules/jscpd/bin/jscpd';
        if (!is_file($binary)) {
            throw new RuntimeException('jscpd is unavailable; run npm --prefix php ci');
        }
        $config = $this->runDir . '/jscpd.json';
        // A generated configuration keeps target .jscpd.json from silently changing scope.
        $ignore = [];
        foreach ($this->project->excludes as $path) {
            $ignore[] = $this->project->root . '/' . $path . '/**';
            $ignore[] = $this->project->root . '/**/' . $path . '/**';
        }
        Runner::write($config, json_encode(['path' => [$this->project->root], 'format' => ['php'],
            'ignore' => $ignore, 'noSymlinks' => true,
            'reporters' => ['json'], 'output' => $this->runDir, 'mode' => 'mild', 'minLines' => 5,
            'minTokens' => 50, 'absolute' => true, 'silent' => true], JSON_THROW_ON_ERROR));
        Runner::run(['node', $binary, '--config', $config], $this->project->root, $this->options['timeout']);
        return $this->runDir . '/jscpd-report.json';
    }

    private function projectPath(string $path): string
    {
        return str_starts_with($path, '/') ? $path : $this->project->root . '/' . $path;
    }

    private function import(string $pass, string $path): void
    {
        if ($pass === 'pdepend') {
            $this->project->files = Evidence::pdepend($path, $this->project);
        } elseif ($pass === 'phpstan' || $pass === 'dead-code') {
            $findings = Evidence::phpstan($path, $this->project, $pass === 'dead-code');
            array_push($this->report['findings'], ...$findings);
        } elseif ($pass === 'coverage') {
            $coverage = Evidence::coverage($path, $this->project);
            foreach ($coverage as $file => $value) {
                $this->project->files[$file]['coverage'] = $value;
            }
        } else {
            $duplication = Evidence::duplication($path, $this->project);
            foreach ($this->project->files as $file => &$record) {
                $record['duplicatedLines'] = in_array($file, $duplication['measured'], true) ? ($duplication['lines'][$file] ?? 0) : null;
            }
            unset($record);
            $this->report['duplicates'] = $duplication['pairs'];
        }
    }
}
