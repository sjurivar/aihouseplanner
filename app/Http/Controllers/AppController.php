<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\Response;

class AppController
{
    /**
     * GET / — hovedside
     */
    public function __invoke(): array
    {
        $baseUrl = $_ENV['BASE_URL'] ?? 'http://localhost';
        return Response::view('app', ['baseUrl' => rtrim($baseUrl, '/')]);
    }
}
