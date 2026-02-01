<?php

declare(strict_types=1);

namespace App\Support;

class Response
{
    /**
     * @param array<mixed> $data
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    public static function json(array $data, int $status = 200): array
    {
        return [
            'status' => $status,
            'headers' => ['Content-Type' => 'application/json; charset=utf-8'],
            'body' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    public static function view(string $name, array $data = [], int $status = 200): array
    {
        $path = dirname(__DIR__) . '/Views/' . $name . '.php';
        if (!file_exists($path)) {
            return self::json(['error' => 'View not found'], 500);
        }
        ob_start();
        extract($data, EXTR_SKIP);
        include $path;
        $body = ob_get_clean() ?: '';
        return [
            'status' => $status,
            'headers' => ['Content-Type' => 'text/html; charset=utf-8'],
            'body' => $body,
        ];
    }

    /**
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    public static function redirect(string $url, int $status = 302): array
    {
        return [
            'status' => $status,
            'headers' => ['Location' => $url],
            'body' => '',
        ];
    }

    /**
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    public static function html(string $body, int $status = 200): array
    {
        return [
            'status' => $status,
            'headers' => ['Content-Type' => 'text/html; charset=utf-8'],
            'body' => $body,
        ];
    }
}
