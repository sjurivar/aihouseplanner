<?php

declare(strict_types=1);

namespace App\Support;

class Router
{
    /** @var array<string, array<string, callable>> */
    private array $routes = [];

    public function get(string $path, callable $handler): self
    {
        return $this->add('GET', $path, $handler);
    }

    public function post(string $path, callable $handler): self
    {
        return $this->add('POST', $path, $handler);
    }

    private function add(string $method, string $path, callable $handler): self
    {
        $this->routes[$method][$path] = $handler;
        return $this;
    }

    /**
     * @return array{status: int, headers: array<string, string>, body: string}
     */
    public function dispatch(string $method, string $path): array
    {
        $handler = $this->routes[$method][$path] ?? null;
        if ($handler === null) {
            return Response::json(['error' => 'Not Found'], 404);
        }

        $result = $handler();
        if (is_array($result) && isset($result['status'], $result['headers'], $result['body'])) {
            return $result;
        }
        if (is_array($result)) {
            return Response::json($result);
        }
        return Response::html((string) $result);
    }
}
