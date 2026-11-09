<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

// Keep source paths in a manifest instead of one unbounded command argument.
// PDepend still runs in an isolated, timeout-controlled process.
try {
    $arguments = $_SERVER['argv'] ?? [];
    if (count($arguments) !== 4) {
        throw new RuntimeException('PDepend worker requires a source manifest, configuration and report path');
    }
    $paths = Panopticode\Evidence::json($arguments[1]);
    $application = new PDepend\Application();
    $application->setConfigurationFile($arguments[2]);
    $runner = $application->getRunner();
    $runner->setThreads(1);
    $runner->setSourceArguments($paths);
    $runner->addReportGenerator('summary-xml', $arguments[3]);
    $code = $runner->run();
    if ($runner->hasParseErrors()) {
        foreach ($runner->getParseErrors() as $error) {
            fwrite(STDERR, (string) $error . "\n");
        }
        exit(2);
    }
    exit($code);
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(2);
}
