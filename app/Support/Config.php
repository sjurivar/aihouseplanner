<?php

declare(strict_types=1);

namespace App\Support;

class Config
{
    /** @var array<string, mixed> */
    private static array $items = [];

    public static function get(string $key, mixed $default = null): mixed
    {
        $keys = explode('.', $key);
        $value = self::$items;
        foreach ($keys as $k) {
            if (!is_array($value) || !array_key_exists($k, $value)) {
                return $default;
            }
            $value = $value[$k];
        }
        return $value;
    }

    /**
     * @param array<string, mixed> $items
     */
    public static function set(array $items): void
    {
        self::$items = array_merge(self::$items, $items);
    }
}
