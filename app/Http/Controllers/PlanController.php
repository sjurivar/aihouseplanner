<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\PlanGenerator;
use App\Domain\PlanValidator;
use App\Support\Response;

class PlanController
{
    private const SAMPLES = [
        'v0' => 'plan.v0.single.json',
        'v0.3' => 'plan.v0.3.two_floors_roof.json',
        'v0.3-asym-pitch' => 'plan.v0.3.asymmetric_roof.json',
        'v0.3-asym-eave' => 'plan.v0.3.asymmetric_equal_eave.json',
        'v0.4-L' => 'plan.v0.4.L-house.json',
        'v0.4-T' => 'plan.v0.4.T-house.json',
        'v0.4-H' => 'plan.v0.4.H-house.json',
        'v0.5' => 'plan.v0.5.rooms_first_sloped.json',
        'v1' => 'plan.v1.two_floors_rooms_walls_stairs.json',
    ];

    /**
     * GET /api/sample — returnerer sample plan
     * Query: ?v=0 eller ?v=0.3 (standard: v0.3)
     */
    public function sample(): array
    {
        $v = $_GET['v'] ?? 'v0.3';
        $file = self::SAMPLES[$v] ?? self::SAMPLES['v0.3'];
        $path = dirname(__DIR__, 3) . '/examples/' . $file;
        $json = file_get_contents($path);
        if ($json === false) {
            return Response::json(['error' => 'Sample ikke funnet'], 500);
        }
        $plan = json_decode($json, true);
        return Response::json(is_array($plan) ? $plan : ['error' => 'Ugyldig sample'], 200);
    }

    /**
     * POST /api/plan — genererer plan via OpenAI
     */
    public function create(): array
    {
        $apiKey = $_ENV['OPENAI_API_KEY'] ?? '';
        if ($apiKey === '') {
            return Response::json([
                'error' => 'OPENAI_API_KEY mangler. Legg den i .env for å generere planer.',
            ], 503);
        }

        $body = file_get_contents('php://input') ?: '{}';
        $input = json_decode($body, true);
        $prompt = isset($input['prompt']) && is_string($input['prompt'])
            ? trim($input['prompt'])
            : '';

        if ($prompt === '') {
            return Response::json(['error' => 'prompt mangler'], 400);
        }

        $generator = new PlanGenerator($apiKey);
        $result = $generator->generate($prompt);

        if (isset($result['error'])) {
            $status = 503;
            if (str_contains($result['error'], 'Validering feilet')) {
                $status = 422;
            }
            return Response::json([
                'error' => $result['error'],
                'meta' => $result['meta'] ?? [],
            ], $status);
        }

        return Response::json([
            'plan' => $result['plan'],
            'meta' => $result['meta'],
        ], 200);
    }

    /**
     * POST /api/validate — validerer plan JSON (uten OpenAI)
     */
    public function validate(): array
    {
        $body = file_get_contents('php://input') ?: '{}';
        $input = json_decode($body, true);

        if (!is_array($input)) {
            return Response::json(['error' => 'Ugyldig JSON', 'errors' => []], 400);
        }

        $validator = new PlanValidator();
        $errors = $validator->validate($input);

        if ($errors !== []) {
            return Response::json(['valid' => false, 'errors' => $errors], 422);
        }

        return Response::json(['valid' => true, 'errors' => []], 200);
    }
}
