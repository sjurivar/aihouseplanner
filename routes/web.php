<?php

declare(strict_types=1);

use App\Http\Controllers\HealthController;
use App\Support\Router;

$router = new Router();

$router->get('/', fn () => (new HealthController())());
$router->get('/health', fn () => (new HealthController())());

return $router;
