<?php
declare(strict_types=1);

namespace Panopticode;

use RuntimeException;
use SimpleXMLElement;

final class Evidence
{
    private const METRICS = ['ccn', 'ccn2', 'npath', 'loc', 'eloc', 'lloc', 'cloc', 'ncloc',
        'ca', 'ce', 'cbo', 'dit', 'nocc', 'nom', 'npm', 'vars', 'cis', 'csz', 'wmc'];

    public static function xml(string $file, string $root): SimpleXMLElement
    {
        $content = self::read($file);
        if (stripos($content, '<!DOCTYPE') !== false || stripos($content, '<!ENTITY') !== false) {
            throw new RuntimeException('XML document types and entities are not supported');
        }
        $previous = libxml_use_internal_errors(true);
        try {
            $xml = simplexml_load_string($content, SimpleXMLElement::class, LIBXML_NONET);
            if ($xml === false || $xml->getName() !== $root) {
                throw new RuntimeException("Expected a valid $root XML report: $file");
            }
            return $xml;
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    public static function read(string $file): string
    {
        $content = @file_get_contents($file);
        if ($content === false) {
            throw new RuntimeException("Cannot read report: $file");
        }
        return $content;
    }

    public static function json(string $file): array
    {
        $value = json_decode(self::read($file), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($value)) {
            throw new RuntimeException("Expected a JSON object: $file");
        }
        return $value;
    }

    private static function metrics(SimpleXMLElement $node): array
    {
        $metrics = [];
        foreach (self::METRICS as $key) {
            if (isset($node[$key])) {
                if (!is_numeric((string) $node[$key]) || !is_finite((float) $node[$key]) || (float) $node[$key] < 0) {
                    throw new RuntimeException("Invalid PDepend metric $key");
                }
                $metrics[$key] = 0 + (string) $node[$key];
            }
        }
        return $metrics;
    }

    public static function pdepend(string $file, Project $project): array
    {
        $xml = self::xml($file, 'metrics');
        if (!isset($xml->files)) {
            throw new RuntimeException('PDepend report has no file inventory');
        }
        $files = $project->files;
        $matched = 0;
        foreach ($xml->files->file as $node) {
            $path = $project->relative((string) $node['name']);
            if ($path !== null) {
                $files[$path]['metrics'] = self::metrics($node);
                $matched++;
            }
        }
        if ($matched === 0 && $files !== []) {
            throw new RuntimeException('PDepend report contains no files matching this checkout');
        }
        foreach ($xml->package as $package) {
            foreach (['class', 'trait', 'function'] as $kind) {
                foreach ($package->{$kind} as $node) {
                    $path = $project->relative((string) $node->file['name']);
                    if ($path === null) {
                        continue;
                    }
                    $name = (string) ($node['fqname'] ?? $node['name']);
                    if ($kind === 'function' && (string) $package['name'] !== '+global') {
                        $name = (string) $package['name'] . '\\' . $name;
                    }
                    $files[$path]['entities'][] = self::entity($node, $name, $kind);
                    if ($kind !== 'function') {
                        foreach ($node->method as $method) {
                            $files[$path]['entities'][] = self::entity($method, $name . '::' . (string) $method['name'], 'method');
                        }
                    }
                }
            }
        }
        return $files;
    }

    private static function entity(SimpleXMLElement $node, string $name, string $kind): array
    {
        $start = (int) $node['start'];
        $end = (int) $node['end'];
        if ($start < 1 || $end < $start || $name === '') {
            throw new RuntimeException('Invalid PDepend entity location');
        }
        return ['name' => $name, 'kind' => $kind, 'line' => $start, 'endLine' => $end, 'metrics' => self::metrics($node)];
    }

    public static function phpstan(string $file, Project $project, bool $dead): array
    {
        $json = self::json($file);
        if (!isset($json['files'], $json['errors'], $json['totals']) || !is_array($json['files']) || !is_array($json['errors'])) {
            throw new RuntimeException('Invalid PHPStan JSON report');
        }
        if ($json['errors'] !== [] || ($json['totals']['errors'] ?? 0) > 0) {
            throw new RuntimeException('PHPStan analysis errors: ' . implode('; ', $json['errors']));
        }
        $findings = [];
        foreach ($json['files'] as $path => $record) {
            if (!isset($record['messages']) || !is_array($record['messages'])) {
                throw new RuntimeException('Invalid PHPStan messages');
            }
            foreach ($record['messages'] as $message) {
                if (!is_string($message['message'] ?? null)) {
                    throw new RuntimeException('Invalid PHPStan message');
                }
                $rule = $message['identifier'] ?? 'phpstan.unspecified';
                if (str_starts_with($rule, 'shipmonk.') !== $dead) {
                    continue;
                }
                $relative = $project->relative($path);
                $findings[] = ['file' => $relative ?? $path, 'inScope' => $relative !== null,
                    'line' => $message['line'] ?? null, 'rule' => $rule, 'message' => $message['message'],
                    'category' => $dead ? 'deletion-candidate' : 'correctness'];
            }
        }
        return $findings;
    }

    public static function coverage(string $file, Project $project): array
    {
        $xml = self::xml($file, 'coverage');
        if (!isset($xml->project)) {
            throw new RuntimeException('Clover report has no project');
        }
        $coverage = [];
        foreach ($xml->xpath('//file') as $node) {
            $path = $project->relative((string) $node['name']);
            if ($path === null) {
                continue;
            }
            $lines = $coverage[$path]['lines'] ?? [];
            foreach ($node->line as $line) {
                if ((string) $line['type'] !== 'stmt') {
                    continue;
                }
                $number = filter_var((string) $line['num'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                $hits = filter_var((string) $line['count'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
                if ($number === false || $hits === false) {
                    throw new RuntimeException('Invalid Clover line');
                }
                $lines[$number] = max($lines[$number] ?? 0, $hits);
            }
            $coverage[$path] = ['covered' => count(array_filter($lines, fn ($hits) => $hits > 0)), 'total' => count($lines), 'lines' => $lines];
        }
        if ($coverage === [] && $project->files !== []) {
            throw new RuntimeException('Clover report contains no files matching this checkout');
        }
        return $coverage;
    }

    public static function duplication(string $file, Project $project): array
    {
        $json = self::json($file);
        if (!isset($json['duplicates'], $json['statistics']['total']) || !is_array($json['duplicates'])) {
            throw new RuntimeException('Invalid jscpd JSON report');
        }
        $sources = $json['statistics']['formats']['php']['sources'] ?? null;
        if (!is_array($sources)) {
            throw new RuntimeException('jscpd report has no PHP source inventory');
        }
        $measured = [];
        foreach (array_keys($sources) as $path) {
            $relative = $project->relative($path);
            if ($relative !== null) {
                $measured[] = $relative;
            }
        }
        if ($measured === [] && $project->files !== []) {
            throw new RuntimeException('jscpd report contains no files matching this checkout');
        }
        $ranges = [];
        $pairs = [];
        foreach ($json['duplicates'] as $pair) {
            $normalized = [];
            foreach (['firstFile', 'secondFile'] as $key) {
                $node = $pair[$key] ?? [];
                $path = $project->relative($node['name'] ?? '');
                $start = $node['start'] ?? 0;
                $end = $node['end'] ?? 0;
                if (!is_int($start) || !is_int($end) || $start < 1 || $end < $start) {
                    throw new RuntimeException('Invalid jscpd source range');
                }
                if ($path === null) {
                    continue 2;
                }
                if ($end > $project->files[$path]['physicalLines']) {
                    throw new RuntimeException('jscpd range exceeds source file');
                }
                $normalized[$key] = ['file' => $path, 'line' => $start, 'endLine' => $end];
            }
            foreach ($normalized as $range) {
                for ($line = $range['line']; $line <= $range['endLine']; $line++) {
                    $ranges[$range['file']][$line] = true;
                }
            }
            $pairs[] = $normalized;
        }
        return ['pairs' => $pairs, 'lines' => array_map('count', $ranges), 'measured' => $measured];
    }
}
