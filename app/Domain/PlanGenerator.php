<?php

declare(strict_types=1);

namespace App\Domain;

class PlanGenerator
{
    public function __construct(
        private readonly string $apiKey,
        private readonly PlanValidator $validator = new PlanValidator()
    ) {
    }

    /**
     * @return array{plan: array<string, mixed>, meta: array<string, mixed>}|array{error: string, meta: array<string, mixed>}
     */
    public function generate(string $prompt): array
    {
        $meta = ['prompt_length' => strlen($prompt)];

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        if ($ch === false) {
            return ['error' => 'Kunne ikke opprette forespørsel', 'meta' => $meta];
        }

        $body = [
            'model' => 'gpt-4o-mini',
            'messages' => [
                [
                    'role' => 'system',
                    'content' => $this->getSystemPrompt(),
                ],
                [
                    'role' => 'user',
                    'content' => $prompt,
                ],
            ],
            'temperature' => 0.3,
        ];

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiKey,
            ],
            CURLOPT_RETURNTRANSFER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $meta['http_code'] = $httpCode;

        if ($response === false) {
            return ['error' => 'OpenAI-svar feilet', 'meta' => $meta];
        }

        $data = json_decode($response, true);
        if (!is_array($data)) {
            return ['error' => 'Ugyldig OpenAI-svar', 'meta' => $meta];
        }

        if (isset($data['error']['message'])) {
            $msg = $data['error']['message'];
            if (str_contains($msg, 'quota') || str_contains($msg, 'rate')) {
                return ['error' => 'API-kvote oppbrukt. Bruk "Load sample" i stedet.', 'meta' => $meta];
            }
            return ['error' => $msg, 'meta' => $meta];
        }

        $content = $data['choices'][0]['message']['content'] ?? '';
        if ($content === '') {
            return ['error' => 'Tomt svar fra OpenAI', 'meta' => $meta];
        }

        $plan = $this->extractJson($content);
        if ($plan === null) {
            return ['error' => 'Kunne ikke parse JSON fra svar', 'meta' => $meta];
        }

        $errors = $this->validator->validate($plan);
        if ($errors !== []) {
            return [
                'error' => 'Validering feilet: ' . implode('; ', $errors),
                'meta' => $meta,
            ];
        }

        return ['plan' => $plan, 'meta' => $meta];
    }

    private function getSystemPrompt(): string
    {
        return <<<'TEXT'
Du genererer JSON-byggeplaner for AI House Planner.
Returner KUN gyldig JSON, ingen forklaring før eller etter.
Format: units="mm", footprint (type rect, width, depth i mm), floors[] med id, name, level, elevation_mm, footprint, wall (thickness, height), openings[].
Åpninger: id, wall (front|right|back|left), type (door|window), offset, width, height. For window: sill (>=0). For door: swing (valgfritt).
 roofs (v0.3): type gable, pitch_degrees 5-60, overhang_mm, thickness_mm, ridge_direction x|y, eave_height_mode top_walls.
Se docs/json-building-format.md for full spesifikasjon.
TEXT;
    }

    private function extractJson(string $content): ?array
    {
        $content = trim($content);
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $content, $m)) {
            $content = trim($m[1]);
        }
        $decoded = json_decode($content, true);
        return is_array($decoded) ? $decoded : null;
    }
}
