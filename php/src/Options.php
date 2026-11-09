<?php
declare(strict_types=1);

namespace Panopticode;

use InvalidArgumentException;

final class Options
{
    public static function parse(array $args): array
    {
        $options = ['root' => '.', 'out' => 'reports/php', 'exclude' => [], 'timeout' => 300, 'level' => 5];
        $values = ['out', 'name', 'exclude', 'timeout', 'level', 'pdepend', 'phpstan', 'dead-code', 'coverage', 'duplication', 'config'];
        $flags = ['help', 'no-pdepend', 'no-phpstan', 'no-dead-code', 'no-coverage', 'no-duplication'];
        $rootSet = false;
        for ($i = 0; $i < count($args); $i++) {
            $arg = $args[$i];
            if (str_starts_with($arg, '--')) {
                $parts = explode('=', substr($arg, 2), 2);
                $key = $parts[0];
                if (in_array($key, $flags, true) && count($parts) === 1) {
                    $options[$key] = true;
                } elseif (in_array($key, $values, true)) {
                    $value = $parts[1] ?? $args[++$i] ?? null;
                    if ($value === null || $value === '' || str_starts_with($value, '--')) {
                        throw new InvalidArgumentException("--$key requires a value");
                    }
                    if ($key === 'exclude') {
                        if (str_starts_with($value, '/') || in_array('..', explode('/', $value), true)) {
                            throw new InvalidArgumentException('Exclusions must be project-relative directory paths');
                        }
                        $options[$key][] = trim($value, '/');
                    } else {
                        $options[$key] = $value;
                    }
                } else {
                    throw new InvalidArgumentException("Unknown option $arg");
                }
            } elseif (!$rootSet && !str_starts_with($arg, '-')) {
                $options['root'] = $arg;
                $rootSet = true;
            } else {
                throw new InvalidArgumentException("Unexpected argument $arg");
            }
        }
        foreach (['timeout' => [1, 86400], 'level' => [0, 10]] as $key => [$min, $max]) {
            if (filter_var($options[$key], FILTER_VALIDATE_INT) === false || $options[$key] < $min || $options[$key] > $max) {
                throw new InvalidArgumentException("Invalid --$key");
            }
            $options[$key] = (int) $options[$key];
        }
        return $options;
    }
}
