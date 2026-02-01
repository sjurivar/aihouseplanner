<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

$basePath = dirname(__DIR__);

// Last .env (valgfritt — bruk vlucas/phpdotenv eller egen leser)
$envFile = $basePath . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        if (strpos($line, '=') !== false) {
            [$name, $value] = explode('=', $line, 2);
            $_ENV[trim($name)] = trim($value, " \t\n\r\0\x0B\"'");
        }
    }
}

$router = require $basePath . '/routes/web.php';
$requestUri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$basePathEnv = $_ENV['BASE_PATH'] ?? '';
if ($basePathEnv !== '' && str_starts_with($requestUri, $basePathEnv)) {
    $requestUri = substr($requestUri, strlen($basePathEnv)) ?: '/';
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$response = $router->dispatch($method, $requestUri);

http_response_code($response['status']);
foreach ($response['headers'] as $name => $val) {
    header("$name: $val");
}
echo $response['body'];
