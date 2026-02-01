<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\Response;

class HealthController
{
    public function __invoke(): array
    {
        return Response::json([
            'status' => 'ok',
            'timestamp' => date('c'),
        ]);
    }
}
