<?php
declare(strict_types=1);

namespace Panopticode;

use RecursiveCallbackFilterIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

final class Project
{
    public array $files = [];
    public array $excludes;
    public array $ignoredLinks = [];

    public function __construct(public readonly string $root, string $out, array $excludes = [])
    {
        $this->excludes = array_merge(['vendor', 'node_modules', '.git', 'reports'], $excludes);
        if (str_starts_with($out, $root . '/')) {
            $this->excludes[] = substr($out, strlen($root) + 1);
        }
        $iterator = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS),
            function ($entry): bool {
                if ($entry->isLink()) {
                    $this->ignoredLinks[] = $entry->getPathname();
                    if ($entry->getRealPath() !== false) {
                        $this->ignoredLinks[] = $entry->getRealPath();
                    }
                    return false;
                }
                return !$this->excluded($entry->getPathname());
            }
        ));
        foreach ($iterator as $entry) {
            if (!$entry->isFile() || strtolower($entry->getExtension()) !== 'php') {
                continue;
            }
            $path = substr($entry->getPathname(), strlen($root) + 1);
            $source = file_get_contents($entry->getPathname());
            if ($source === false) {
                throw new RuntimeException("Cannot read $path");
            }
            $this->files[$path] = [
                'path' => $path, 'physicalLines' => $source === '' ? 0 : substr_count($source, "\n") + (str_ends_with($source, "\n") ? 0 : 1),
                'metrics' => null, 'entities' => [], 'coverage' => null, 'duplicatedLines' => null,
            ];
        }
        ksort($this->files);
    }

    public function excluded(string $path): bool
    {
        $relative = substr($path, strlen($this->root) + 1);
        foreach ($this->excludes as $exclude) {
            if (str_contains('/' . $relative . '/', '/' . trim($exclude, '/') . '/')) {
                return true;
            }
        }
        return false;
    }

    public function relative(string $path): ?string
    {
        $absolute = realpath(str_starts_with($path, '/') ? $path : $this->root . '/' . $path);
        if ($absolute === false || !str_starts_with($absolute, $this->root . '/')) {
            return null;
        }
        $relative = substr($absolute, strlen($this->root) + 1);
        return isset($this->files[$relative]) ? $relative : null;
    }
}
