<?php

declare(strict_types=1);

namespace App\Domain;

class PlanValidator
{
    private const MAX_MM = 100000;
    private const WALL_PITCH_MIN = 5;
    private const WALL_PITCH_MAX = 60;
    private const ROOF_OVERHANG_MAX = 2000;
    private const ROOF_THICKNESS_MIN = 10;
    private const ROOF_THICKNESS_MAX = 500;

    /**
     * @param array<string, mixed> $plan
     * @return array<int, string> Liste med feilmeldinger
     */
    public function validate(array $plan): array
    {
        $errors = [];

        if (($plan['units'] ?? '') !== 'mm') {
            $errors[] = 'units må være "mm"';
        }

        $floors = $plan['floors'] ?? null;
        $blocks = $plan['blocks'] ?? null;
        $footprint = $plan['footprint'] ?? null;
        $wall = $plan['wall'] ?? $plan['defaults']['wall'] ?? null;
        $defaultWall = $plan['defaults']['wall'] ?? null;

        if ($blocks !== null && is_array($blocks)) {
            foreach ($blocks as $block) {
                $blockFloors = $block['floors'] ?? [];
                foreach ($blockFloors as $floor) {
                    $errors = array_merge(
                        $errors,
                        $this->validateFloor($floor, $defaultWall)
                    );
                }
                if (isset($block['roof']) && is_array($block['roof'])) {
                    $errors = array_merge($errors, $this->validateRoof($block['roof']));
                }
            }
        } elseif ($floors !== null && is_array($floors)) {
            foreach ($floors as $floor) {
                $errors = array_merge(
                    $errors,
                    $this->validateFloor($floor, $defaultWall)
                );
            }
        } else {
            if (!$footprint || !is_array($footprint)) {
                $errors[] = 'footprint mangler (v0) eller floors[] (v0.2+)';
                return $errors;
            }
            $fpErrors = $this->validateFootprint($footprint);
            $errors = array_merge($errors, $fpErrors);
            if ($wall && is_array($wall)) {
                $w = $footprint['width'] ?? 0;
                $d = $footprint['depth'] ?? 0;
                $errors = array_merge(
                    $errors,
                    $this->validateWall($wall, $w, $d)
                );
                $openings = $plan['openings'] ?? [];
                if (is_array($openings)) {
                    $errors = array_merge(
                        $errors,
                        $this->validateOpenings($openings, $footprint)
                    );
                }
            }
        }

        if (isset($plan['roof']) && is_array($plan['roof'])) {
            $errors = array_merge($errors, $this->validateRoof($plan['roof']));
        }

        return $errors;
    }

    /**
     * @param array<string, mixed> $footprint
     * @return array<int, string>
     */
    private function validateFootprint(array $footprint): array
    {
        $errors = [];
        $w = $footprint['width'] ?? 0;
        $d = $footprint['depth'] ?? 0;
        if (!is_numeric($w) || $w <= 0 || $w > self::MAX_MM) {
            $errors[] = 'footprint.width må være 1–' . self::MAX_MM . ' mm';
        }
        if (!is_numeric($d) || $d <= 0 || $d > self::MAX_MM) {
            $errors[] = 'footprint.depth må være 1–' . self::MAX_MM . ' mm';
        }
        return $errors;
    }

    /**
     * @param array<string, mixed> $wall
     * @return array<int, string>
     */
    private function validateWall(array $wall, float $width, float $depth): array
    {
        $errors = [];
        $t = $wall['thickness_mm'] ?? $wall['thickness'] ?? 0;
        $h = $wall['height_mm'] ?? $wall['height'] ?? 0;
        if (!is_numeric($t) || $t <= 0) {
            $errors[] = 'wall.thickness må være > 0';
        }
        if (!is_numeric($h) || $h <= 0) {
            $errors[] = 'wall.height må være > 0';
        }
        if ($t > 0 && $width > 0 && $depth > 0 && $t * 2 >= min($width, $depth)) {
            $errors[] = 'wall.thickness*2 < min(width,depth)';
        }
        return $errors;
    }

    /**
     * @param array<int, mixed> $openings
     * @param array<string, mixed> $footprint
     * @return array<int, string>
     */
    private function validateOpenings(array $openings, array $footprint): array
    {
        $errors = [];
        $w = (float) ($footprint['width'] ?? 0);
        $d = (float) ($footprint['depth'] ?? 0);
        $wallsLen = ['front' => $w, 'back' => $w, 'left' => $d, 'right' => $d];

        foreach ($openings as $o) {
            if (!is_array($o)) continue;
            $wall = $o['wall'] ?? '';
            $len = $wallsLen[$wall] ?? 0;
            $offset = (float) ($o['offset'] ?? 0);
            $ow = (float) ($o['width'] ?? 0);
            if ($offset + $ow > $len) {
                $errors[] = "åpning {$o['id']}: offset+width overstiger vegglengde";
            }
            if (($o['type'] ?? '') === 'window') {
                $sill = $o['sill'] ?? null;
                if ($sill === null || (is_numeric($sill) && $sill < 0)) {
                    $errors[] = "vindu {$o['id']}: sill må være >= 0";
                }
            }
        }
        return $errors;
    }

    /**
     * @param array<string, mixed> $floor
     * @param array<string, mixed>|null $defaultWall
     * @return array<int, string>
     */
    private function validateFloor(array $floor, ?array $defaultWall): array
    {
        $errors = [];
        $footprint = $floor['footprint'] ?? null;
        if (!$footprint || !is_array($footprint)) {
            $errors[] = "etasje {$floor['id']}: footprint mangler";
            return $errors;
        }
        $errors = array_merge($errors, $this->validateFootprint($footprint));
        $wall = $floor['wall'] ?? $defaultWall;
        if ($wall && is_array($wall)) {
            $w = (float) ($footprint['width'] ?? 0);
            $d = (float) ($footprint['depth'] ?? 0);
            $errors = array_merge($errors, $this->validateWall($wall, $w, $d));
        }
        $openings = $floor['openings'] ?? [];
        if (is_array($openings)) {
            $errors = array_merge(
                $errors,
                $this->validateOpenings($openings, $footprint)
            );
        }
        return $errors;
    }

    /**
     * @param array<string, mixed> $roof
     * @return array<int, string>
     */
    private function validateRoof(array $roof): array
    {
        $errors = [];
        if (($roof['type'] ?? '') !== 'gable') {
            $errors[] = 'roof.type må være "gable"';
        }
        $pitch = $roof['pitch_degrees'] ?? null;
        if (!is_numeric($pitch) || $pitch < self::WALL_PITCH_MIN || $pitch > self::WALL_PITCH_MAX) {
            $errors[] = 'roof.pitch_degrees må være ' . self::WALL_PITCH_MIN . '–' . self::WALL_PITCH_MAX;
        }
        $overhang = $roof['overhang_mm'] ?? null;
        if (is_numeric($overhang) && ($overhang < 0 || $overhang > self::ROOF_OVERHANG_MAX)) {
            $errors[] = 'roof.overhang_mm må være 0–' . self::ROOF_OVERHANG_MAX;
        }
        $thick = $roof['thickness_mm'] ?? null;
        if (is_numeric($thick) && ($thick < self::ROOF_THICKNESS_MIN || $thick > self::ROOF_THICKNESS_MAX)) {
            $errors[] = 'roof.thickness_mm må være ' . self::ROOF_THICKNESS_MIN . '–' . self::ROOF_THICKNESS_MAX;
        }
        return $errors;
    }
}
