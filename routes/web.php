<?php

declare(strict_types=1);

use App\Http\Controllers\AppController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\PlanController;
use App\Support\Router;

$router = new Router();

$router->get('/', fn () => (new AppController())());
$router->get('/health', fn () => (new HealthController())());
$router->get('/api/sample', fn () => (new PlanController())->sample());
$router->post('/api/plan', fn () => (new PlanController())->create());
$router->post('/api/validate', fn () => (new PlanController())->validate());

return $router;
