<?php
declare(strict_types=1);

namespace Panopticode;

final class Html
{
    private static function escape(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public static function render(array $report): string
    {
        $escape = self::escape(...);
        $title = $escape($report['name']);
        $html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'
            . "<title>$title · Panopticode PHP</title><style>"
            . ':root{color-scheme:light dark;font:16px/1.5 system-ui}body{max-width:1200px;margin:2rem auto;padding:0 1rem}h1{margin-bottom:0}p{max-width:85ch}a{color:inherit}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;padding:.6rem;border-bottom:1px solid #8886;vertical-align:top}th{white-space:nowrap}code{overflow-wrap:anywhere}.scroll{overflow:auto}.map{display:flex;flex-wrap:wrap;gap:4px}.region{flex:var(--size) 1 100px;padding:1rem;background:#82b5a1;color:#17221e;overflow-wrap:anywhere;border-radius:4px}.warm{background:#e1bd68}.hot{background:#ce795e}.unknown{background:#c6cec9}.failed{border-left:4px solid #ce795e;padding-left:.7rem}.muted{opacity:.8}summary{cursor:pointer}section{margin:2rem 0}small{display:block}.passes{display:flex;flex-wrap:wrap;gap:1rem}.pass{border:1px solid #8886;padding:1rem;flex:1 1 170px}td:first-child{overflow-wrap:anywhere} @media print{details{display:block}body{max-width:none}}'
            . "</style><body><header><p>PANOPTICODE PHP · CODE HEALTH &amp; RETIREMENT</p><h1>$title</h1><p>"
            . count($report['files']) . ' PHP files · Generated ' . $escape($report['generatedAt']) . '</p></header>';
        foreach ($report['warnings'] as $warning) {
            $html .= '<p class="muted">' . $escape($warning) . '</p>';
        }
        $html .= '<section><h2>Analyzer evidence</h2><div class="passes">';
        foreach ($report['analyzers'] as $pass) {
            $html .= '<div class="pass ' . ($pass['status'] === 'failed' ? 'failed' : '') . '"><strong>' . $escape($pass['id']) . ' · ' . $escape($pass['status'])
                . '</strong><small>' . $escape($pass['version']) . ' · ' . $pass['durationMs'] . ' ms</small>';
            if (isset($pass['detail'])) {
                $html .= '<p>' . $escape($pass['detail']) . '</p>';
            }
            $html .= '</div>';
        }
        $html .= '</div></section><section><h2>Where does the complexity live?</h2><p>File area follows PDepend executable lines. Color shows maximum method/function CCN2: green below 10, amber 10–19, red 20+. Gray means unknown. These are navigation bands, not grades.</p><div class="map">';
        foreach ($report['files'] as $index => $file) {
            $complexities = array_filter(array_map(fn ($entity) => $entity['metrics']['ccn2'] ?? null, $file['entities']), fn ($value) => $value !== null);
            $ccn = $complexities === [] ? null : max($complexities);
            $band = $ccn === null ? 'unknown' : ($ccn >= 20 ? 'hot' : ($ccn >= 10 ? 'warm' : ''));
            $size = max(1, $file['metrics']['eloc'] ?? 1);
            $html .= '<a class="region ' . $band . '" style="--size:' . $size . '" href="#file-' . $index . '">' . $escape($file['path']) . '<small>Max CCN2: ' . ($ccn ?? 'unknown') . '</small></a>';
        }
        $html .= '</div></section>';
        $html .= self::findings($report, 'correctness', 'Correctness findings');
        $html .= self::findings($report, 'deletion-candidate', 'Unused-member review candidates');
        $html .= '<section><h2>Files and structural hotspots</h2><p>Open a file for source locations and class coupling. Unknown evidence is shown as “unknown”.</p>';
        foreach ($report['files'] as $index => $file) {
            $coverage = $file['coverage'];
            $percent = $coverage === null || $coverage['total'] === 0 ? 'unknown' : round(100 * $coverage['covered'] / $coverage['total'], 1) . '% (' . $coverage['covered'] . '/' . $coverage['total'] . ')';
            $html .= '<details id="file-' . $index . '"><summary><code>' . $escape($file['path']) . '</code> · ' . ($file['metrics']['eloc'] ?? 'unknown')
                . ' executable lines · coverage ' . $percent . ' · duplicated lines ' . ($file['duplicatedLines'] ?? 'unknown') . '</summary><div class="scroll"><table><thead><tr><th>Entity / source line</th><th>CCN2</th><th>NPath</th><th>Logical lines</th><th>Incoming / outgoing coupling</th></tr></thead><tbody>';
            $entities = $file['entities'];
            usort($entities, fn ($a, $b) => ($b['metrics']['ccn2'] ?? -1) <=> ($a['metrics']['ccn2'] ?? -1));
            foreach ($entities as $entity) {
                $metrics = $entity['metrics'];
                $html .= '<tr><td><code>' . $escape($entity['name']) . '</code><small>' . $escape($entity['kind']) . ' · lines ' . $entity['line'] . '–' . $entity['endLine'] . '</small></td>';
                foreach (['ccn2', 'npath', 'lloc'] as $metric) {
                    $html .= '<td>' . ($metrics[$metric] ?? '—') . '</td>';
                }
                $html .= '<td>' . ($metrics['ca'] ?? '—') . ' / ' . ($metrics['ce'] ?? '—') . '</td></tr>';
            }
            $html .= '</tbody></table></div></details>';
        }
        $html .= '</section><section><h2>Duplicate block pairs</h2>';
        if ($report['duplicates'] === null) {
            $html .= '<p>Duplication evidence is unavailable. Check its analyzer status.</p>';
        } elseif ($report['duplicates'] === []) {
            $html .= '<p>No matching blocks above the configured minimums.</p>';
        } else {
            foreach ($report['duplicates'] as $pair) {
                $ranges = array_map(fn ($range) => $escape($range['file']) . ':' . $range['line'] . '–' . $range['endLine'], $pair);
                $html .= '<p><code>' . implode(' ↔ ', $ranges) . '</code></p>';
            }
        }
        $html .= '</section><section><h2>Measurement definitions</h2>';
        foreach ($report['definitions'] as $key => $definition) {
            $html .= '<p><strong>' . $escape(ucfirst($key)) . '.</strong> ' . $escape($definition) . '</p>';
        }
        return $html . '</section><footer>Generated locally. Works offline. Full evidence is in report.json.</footer></body></html>';
    }

    private static function findings(array $report, string $category, string $title): string
    {
        $html = '<section><h2>' . self::escape($title) . '</h2>';
        $findings = array_filter($report['findings'], fn ($finding) => $finding['category'] === $category);
        $passId = $category === 'correctness' ? 'phpstan' : 'dead-code';
        $pass = array_values(array_filter($report['analyzers'], fn ($pass) => $pass['id'] === $passId))[0] ?? null;
        if ($findings === []) {
            $html .= '<p>' . (in_array($pass['status'] ?? '', ['complete', 'imported'], true) ? 'No findings reported in this analysis scope.' : 'Evidence unavailable. Check the analyzer status.') . '</p>';
        }
        foreach ($findings as $finding) {
            $html .= '<p><code>' . self::escape($finding['file']) . ':' . self::escape($finding['line'] ?? '?') . '</code> · ' . self::escape($finding['rule']) . '<br>' . self::escape($finding['message']) . '</p>';
        }
        return $html . '</section>';
    }
}
