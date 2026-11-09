<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use Panopticode\Evidence;
use Panopticode\Html;
use Panopticode\Options;
use Panopticode\Project;
use Panopticode\Runner;
use Symfony\Component\Process\Process;

$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function rejects(callable $call, string $message): void
{
    try {
        $call();
    } catch (Throwable) {
        check(true, $message);
        return;
    }
    check(false, $message);
}

$base = realpath(__DIR__ . '/..');
$workspace = $base . '/reports/tests-' . bin2hex(random_bytes(4));
$root = $workspace . '/project with spaces';
mkdir($root . '/src', 0777, true);
mkdir($root . '/vendor', 0777, true);
mkdir($root . '/nested/vendor', 0777, true);
mkdir($root . '/generated', 0777, true);
$source = file_get_contents($base . '/examples/demo/src/Legacy.php');
file_put_contents($root . '/src/Legacy.php', $source);
file_put_contents($root . '/src/Copy.php', str_replace('namespace Demo;', 'namespace DemoCopy;', $source));
file_put_contents($root . '/vendor/Ignore.php', '<?php syntax error vendor');
file_put_contents($root . '/nested/vendor/Ignore.php', '<?php syntax error nested vendor');
file_put_contents($root . '/generated/Ignore.php', '<?php syntax error generated');
file_put_contents($workspace . '/outside.php', '<?php function external() {}');
symlink($workspace . '/outside.php', $root . '/src/External.php');
$coverage = $workspace . '/clover.xml';
$quotedPath = htmlspecialchars($root . '/src/Legacy.php', ENT_QUOTES | ENT_XML1);
file_put_contents($coverage, '<coverage><project><package name="Demo"><file name="' . $quotedPath . '">'
    . '<line num="8" type="stmt" count="0"/><line num="14" type="stmt" count="1"/>'
    . '<line num="14" type="stmt" count="0"/><line num="6" type="method" count="1"/>'
    . '</file></package></project></coverage>');

$cli = function (array $args, int $expected) use ($base, $root): Process {
    $process = new Process([PHP_BINARY, $base . '/bin/panopticode-php', $root, ...$args], $base, null, null, 180);
    $process->run();
    check($process->getExitCode() === $expected, 'CLI exit code: ' . $process->getErrorOutput() . $process->getOutput());
    return $process;
};

$out = $root . '/output';
$cli(['--out', $out, '--exclude', 'generated', '--coverage', $coverage, '--name', '<script>bad</script>'], 0);
$report = Evidence::json($out . '/report.json');
$statuses = array_column($report['analyzers'], 'status', 'id');
check($statuses === ['pdepend' => 'complete', 'phpstan' => 'complete', 'dead-code' => 'complete', 'coverage' => 'imported', 'duplication' => 'complete'], 'All native analyzers and Clover import complete');
check(count($report['files']) === 2, 'Dependency, generated, symlink and output files are excluded');
$files = array_column($report['files'], null, 'path');
$entities = array_column($files['src/Legacy.php']['entities'], null, 'name');
check($entities['Demo\\Legacy::total']['metrics']['ccn2'] === 4, 'Extended complexity counts boolean operators');
check($entities['Demo\\Legacy::total']['metrics']['ccn'] === 3, 'Ordinary complexity remains separately identified');
check($entities['Demo\\Legacy::total']['line'] === 6, 'PDepend source locations preserved');
check(!isset($entities['Demo\\Legacy::total']['metrics']['mi']), 'No maintainability score imported');
check($files['src/Legacy.php']['coverage']['covered'] === 1 && $files['src/Legacy.php']['coverage']['total'] === 2, 'Statement coverage merges duplicate source lines and preserves zero hits');
check($files['src/Copy.php']['coverage'] === null, 'Unreported coverage stays unknown');
check(count(array_filter($report['findings'], fn ($finding) => $finding['rule'] === 'return.type')) === 2, 'PHPStan detects incorrect return types');
check(count(array_filter($report['findings'], fn ($finding) => $finding['rule'] === 'shipmonk.deadMethod')) === 2, 'Unused members appear once as separate deletion candidates');
check(count($report['duplicates']) > 0, 'Native jscpd detects duplicate blocks');
check($files['src/Legacy.php']['duplicatedLines'] > 0, 'Duplicate line totals populated');
$html = file_get_contents($out . '/report.html');
check(!str_contains($html, '<script>bad</script>') && str_contains($html, '&lt;script&gt;bad&lt;/script&gt;'), 'HTML escapes imported/project text');
check(str_contains($html, 'Content-Security-Policy'), 'Offline report has restrictive CSP');

$project = new Project($root, $out, ['generated']);
$bad = $workspace . '/bad.xml';
file_put_contents($bad, '<metrics>broken');
rejects(fn () => Evidence::pdepend($bad, $project), 'Malformed XML is rejected');
file_put_contents($bad, '<!DOCTYPE coverage [<!ENTITY secret SYSTEM "file:///etc/passwd">]><coverage><project/></coverage>');
rejects(fn () => Evidence::coverage($bad, $project), 'XML external entity declarations rejected');
file_put_contents($bad, '<metrics><files><file name="/wrong/checkout.php" loc="12"/></files></metrics>');
rejects(fn () => Evidence::pdepend($bad, $project), 'Mismatched checkout is rejected');
$badJson = $workspace . '/bad.json';
file_put_contents($badJson, '{"files":{},"errors":["Internal error"],"totals":{}}');
rejects(fn () => Evidence::phpstan($badJson, $project, false), 'PHPStan internal errors fail the pass');
file_put_contents($badJson, '{"duplicates":[],"statistics":{}}');
rejects(fn () => Evidence::duplication($badJson, $project), 'Malformed duplication reports rejected');

$duplicateJson = $workspace . '/duplicates.json';
$pair = ['firstFile' => ['name' => $root . '/src/Legacy.php', 'start' => 6, 'end' => 15],
    'secondFile' => ['name' => $root . '/src/Copy.php', 'start' => 6, 'end' => 15]];
file_put_contents($duplicateJson, json_encode(['duplicates' => [$pair, $pair], 'statistics' => ['total' => [], 'formats' => ['php' => ['sources' => [$root . '/src/Legacy.php' => [], $root . '/src/Copy.php' => []]]]]]));
$duplicates = Evidence::duplication($duplicateJson, $project);
check($duplicates['lines']['src/Legacy.php'] === 10, 'Overlapping duplicate ranges count once');

$config = $workspace . '/panopticode.config.json';
file_put_contents($config, json_encode(['version' => 1, 'coverage' => ['command' => [PHP_BINARY, '-r', 'echo "No coverage generated";'], 'report' => $coverage]]));
$stale = $workspace . '/stale';
$skip = ['--no-pdepend', '--no-phpstan', '--no-dead-code', '--no-duplication'];
$cli(['--out', $stale, '--config', $config, ...$skip], 1);
$staleReport = Evidence::json($stale . '/report.json');
check($staleReport['analyzers'][3]['status'] === 'failed', 'Unchanged coverage artifact fails pass');
check($staleReport['files'][0]['coverage'] === null, 'Failed command never imports stale coverage');
check(str_contains(Html::render($staleReport), 'Evidence unavailable.'), 'Unavailable findings do not appear clean');

file_put_contents($config, json_encode(['version' => 1, 'coverage' => [
    'command' => [PHP_BINARY, '-r', 'copy($argv[1], $argv[2]);', $coverage, $workspace . '/fresh.xml'], 'report' => $workspace . '/fresh.xml',
]]));
$fresh = $workspace . '/fresh';
$cli(['--out', $fresh, '--config', $config, ...$skip], 0);
check(Evidence::json($fresh . '/report.json')['analyzers'][3]['status'] === 'complete', 'Configured coverage command executes and imports a fresh report');

$skipped = $workspace . '/skipped';
$cli(['--out', $skipped, '--pdepend', '/missing.xml', '--coverage', '/missing.xml', '--no-coverage', ...$skip], 0);
check(count(array_filter(Evidence::json($skipped . '/report.json')['analyzers'], fn ($pass) => $pass['status'] === 'skipped')) === 5, 'Disable flags override imports');
$cli(['--unknown'], 2);
$brokenOut = $workspace . '/parse-failure';
file_put_contents($root . '/src/Broken.php', '<?php function broken_syntax( {');
$cli(['--out', $brokenOut, '--exclude', 'generated', '--no-phpstan', '--no-dead-code', '--no-coverage', '--no-duplication'], 1);
$brokenReport = Evidence::json($brokenOut . '/report.json');
check($brokenReport['analyzers'][0]['status'] === 'failed', 'PDepend parse errors fail the entire measurement pass');
check(count(array_filter($brokenReport['files'], fn ($file) => $file['metrics'] !== null)) === 0, 'Partial measurement output is never presented as complete');
rejects(fn () => Options::parse(['--timeout', '0']), 'Invalid timeouts rejected');
rejects(fn () => Options::parse(['--exclude', '../src']), 'Escaping exclusion paths rejected');
rejects(fn () => Runner::run([PHP_BINARY, '-r', 'sleep(3);'], $root, 1), 'Process timeout enforced');
rejects(fn () => Runner::run([PHP_BINARY, '-r', 'fwrite(STDERR,"failure"); exit(2);'], $root, 3), 'Execution failure detected');
echo "$checks checks passed\n";
