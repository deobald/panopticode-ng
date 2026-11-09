<?php
declare(strict_types=1);

namespace Panopticode;

use RuntimeException;
use Symfony\Component\Process\Process;

final class Runner
{
    public static function run(array $command, string $cwd, int $timeout, array $success = [0]): string
    {
        if ($command === [] || array_filter($command, fn ($arg) => !is_string($arg)) !== []) {
            throw new RuntimeException('Commands must be nonempty arrays of strings');
        }
        $process = new Process($command, $cwd, null, null, $timeout);
        $process->run();
        if (!in_array($process->getExitCode(), $success, true)) {
            throw new RuntimeException('Command exited ' . $process->getExitCode() . ': ' . substr(trim($process->getErrorOutput() . "\n" . $process->getOutput()), 0, 3000));
        }
        if ($process->getExitCode() !== 0 && trim($process->getOutput()) === '') {
            throw new RuntimeException('Command produced no report: ' . substr(trim($process->getErrorOutput()), 0, 3000));
        }
        return $process->getOutput();
    }

    public static function write(string $file, string $content): void
    {
        $temporary = $file . '.' . bin2hex(random_bytes(5)) . '.tmp';
        if (file_put_contents($temporary, $content) === false || !rename($temporary, $file)) {
            throw new RuntimeException("Cannot write $file");
        }
    }

    public static function fingerprint(string $file): ?string
    {
        clearstatcache(true, $file);
        if (!is_file($file)) {
            return null;
        }
        $stat = stat($file);
        // Reading the hash can update atime; that is not evidence of a new report.
        return json_encode([$stat['mtime'], $stat['ctime'], $stat['ino'], $stat['size']], JSON_THROW_ON_ERROR)
            . hash_file('sha256', $file);
    }
}
