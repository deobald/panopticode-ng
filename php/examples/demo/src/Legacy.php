<?php
namespace Demo;

final class Legacy
{
    public function total(array $prices): int
    {
        $total = 0;
        foreach ($prices as $price) {
            if ($price > 0 && $price < 100) {
                $total += $price;
            }
        }
        return $total;
    }

    public function obsolete(): string
    {
        return 'retirement candidate';
    }
}

function broken(): int
{
    return 'incorrect return type';
}

echo (new Legacy())->total([10, 20]);
