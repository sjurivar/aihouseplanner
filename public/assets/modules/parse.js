/**
 * JSON parsing and format detection.
 * All loaded plans are normalized to 1.x in memory (see normalizeToV1).
 */

export function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function isV1(plan) {
    return plan?.version && String(plan.version).startsWith('1');
}

export function isV05(plan) {
    return plan?.version && String(plan.version).startsWith('0.5');
}

export function isV04(plan) {
    return plan?.blocks && Array.isArray(plan.blocks) && plan.blocks.length > 0;
}

export function detectFormat(plan) {
    if (!plan || typeof plan !== 'object') return null;
    if (isV1(plan)) return 'v1';
    if (isV05(plan)) return 'v0.5';
    if (isV04(plan)) return 'v0.4';
    if (plan.floors && Array.isArray(plan.floors)) {
        return plan.roof ? 'v0.3' : 'v0.2';
    }
    return plan.footprint ? 'v0' : null;
}

/** Normalize defaults.wall to thickness_mm / height_mm for 1.x */
function normalizeDefaults(plan) {
    const def = plan?.defaults;
    if (!def || typeof def !== 'object') return plan?.defaults ?? null;
    const w = def.wall;
    if (!w || typeof w !== 'object') return def;
    const t = w.thickness_mm ?? w.thickness ?? 200;
    const h = w.height_mm ?? w.height ?? 2700;
    return {
        ...def,
        wall: { thickness_mm: Number(t) || 200, height_mm: Number(h) || 2700 },
    };
}

/**
 * Normalize any supported plan to canonical 1.x format (version "1.0", defaults.wall with thickness_mm/height_mm).
 * Structure is preserved: floors stay floors, blocks stay blocks.
 */
export function normalizeToV1(plan) {
    if (!plan || typeof plan !== 'object') return null;
    const defaults = normalizeDefaults(plan);
    const normalized = { ...plan, defaults: defaults ?? plan.defaults };

    if (isV1(plan) && (plan.floors?.length > 0 || plan.blocks?.length > 0)) {
        normalized.version = String(plan.version).startsWith('1') ? plan.version : '1.0';
        return normalized;
    }
    if (isV04(plan)) {
        normalized.version = '1.0';
        return normalized;
    }
    if (plan.floors && Array.isArray(plan.floors)) {
        normalized.version = '1.0';
        return normalized;
    }
    if (plan.footprint && !plan.floors) {
        normalized.version = '1.0';
        normalized.floors = [{
            id: 'f0',
            name: 'Etasje',
            level: 0,
            elevation_mm: 0,
            footprint: plan.footprint,
            wall: plan.wall,
            openings: plan.openings ?? [],
        }];
        delete normalized.footprint;
        delete normalized.wall;
        delete normalized.openings;
        return normalized;
    }
    if (isV05(plan)) {
        normalized.version = '1.0';
        return normalized;
    }
    return normalized;
}

export function getBlocks(plan) {
    if (!isV04(plan)) return [];
    return plan.blocks.map(block => ({
        id: block.id,
        name: block.name,
        position: block.position ?? { x: 0, z: 0 },
        footprint: block.footprint ?? {},
        floors: block.floors ?? [],
        roof: block.roof ?? null,
        defaults: plan.defaults,
    }));
}

export function getFloorList(plan) {
    if (!plan) return [];
    if (plan.levels && Array.isArray(plan.levels)) return plan.levels;
    if (isV04(plan)) {
        // For v0.4 blocks, return unique floors from all blocks (usually f1)
        const allFloors = [];
        const seen = new Set();
        for (const block of plan.blocks) {
            for (const floor of (block.floors ?? [])) {
                if (!seen.has(floor.id)) {
                    seen.add(floor.id);
                    allFloors.push(floor);
                }
            }
        }
        return allFloors.length ? allFloors : [{ id: 'f1', name: '1. etasje' }];
    }
    if (plan.floors) return plan.floors;
    if (plan.footprint) return [{ id: 'f0', name: 'Etasje', ...plan }];
    return [];
}

export function getDefaults(plan) {
    return plan?.defaults?.wall ?? { thickness: 200, height: 2700 };
}

export function getActivePlanRoot(plan, selectedFloorId) {
    const floors = getFloorList(plan);
    if (!floors.length) return null;
    const def = getDefaults(plan);
    const normWall = (w) => {
        const t = w?.thickness ?? w?.thickness_mm ?? def?.thickness ?? def?.thickness_mm ?? 200;
        const h = w?.height ?? w?.height_mm ?? def?.height ?? def?.height_mm ?? 2700;
        return { thickness: Number(t) || 200, thickness_mm: Number(t) || 200, height: Number(h) || 2700, height_mm: Number(h) || 2700 };
    };
    if (isV05(plan) && plan.buildings?.length) {
        const b = plan.buildings[0];
        const level = floors.find(ff => ff.id === selectedFloorId) ?? floors[0];
        const levelId = level.id;
        const fpEl = (b.footprints ?? []).find(fp => fp.levelId === levelId);
        const rooms = (b.rooms ?? []).filter(r => r.levelId === levelId);
        const walls = b.derived?.[`walls_${levelId}`] ?? [];
        const stairs = (b.stairs ?? []).filter(s => s.fromLevelId === levelId || s.toLevelId === levelId);
        const voids = (b.voids ?? []).filter(v => v.levelId === levelId);
        return {
            footprint: fpEl ? { polygon: fpEl.polygon } : {},
            wall: normWall(fpEl?.outerWall ?? def),
            floorId: levelId,
            floorName: level.name,
            rooms,
            walls,
            stairs,
            voids,
            openings: (b.openings ?? []).filter(o => o.levelId === levelId),
            defaults: plan.defaults,
        };
    }
    // v0.4 blocks - return combined view of all blocks for this floor (with derived walls)
    if (isV04(plan)) {
        const blocksData = [];
        for (const block of plan.blocks) {
            const floors = block.floors ?? [];
            const floorIndex = floors.findIndex(f => f.id === selectedFloorId);
            const floor = floorIndex >= 0 ? floors[floorIndex] : floors[0];
            if (!floor) continue;
            const levelKey = `${block.id}:${floor.id}`;
            const walls = plan.derived?.wallsByLevel?.[levelKey] ?? [];
            blocksData.push({
                blockId: block.id,
                blockName: block.name,
                position: block.position ?? { x: 0, z: 0 },
                footprint: block.footprint ?? {},
                wall: normWall(floor.wall ?? def),
                openings: floor.openings ?? [],
                rooms: floor.rooms ?? [],
                walls,
                elevation_mm: floor.elevation_mm ?? 0,
                roof: block.roof,
                floorIndexInBlock: floorIndex >= 0 ? floorIndex : 0,
            });
        }
        return {
            isBlocks: true,
            blocks: blocksData,
            floorId: selectedFloorId,
            floorName: floors.find(f => f.id === selectedFloorId)?.name ?? '1. etasje',
            defaults: plan.defaults,
        };
    }
    if (plan.floors) {
        const f = floors.find(ff => ff.id === selectedFloorId) ?? floors[0];
        const fp = f.footprint ?? {};
        const wall = normWall(f.wall ?? def);
        const openings = f.openings ?? [];
        return {
            footprint: fp,
            wall,
            openings,
            floorId: f.id,
            floorName: f.name,
            rooms: f.rooms,
            walls: f.walls,
            stairs: f.stairs,
            defaults: plan.defaults,
        };
    }
    return {
        footprint: plan.footprint,
        wall: normWall(plan.wall ?? def),
        openings: plan.openings ?? [],
        floorId: 'f0',
        floorName: 'Etasje',
        defaults: plan.defaults,
    };
}

export function getAllFloorRoots(plan) {
    const floors = getFloorList(plan);
    const def = getDefaults(plan);
    const defWall = { thickness: def?.thickness_mm ?? def?.thickness ?? 200, height: def?.height_mm ?? def?.height ?? 2700 };
    if (isV05(plan) && plan.buildings?.length) {
        const b = plan.buildings[0];
        return floors.map(level => {
            const levelId = level.id;
            const fpEl = (b.footprints ?? []).find(fp => fp.levelId === levelId);
            return {
                footprint: fpEl ? { polygon: fpEl.polygon } : {},
                wall: { thickness: fpEl?.outerWall?.thickness ?? 250, height: fpEl?.outerWall?.height ?? 2500 },
                openings: (b.openings ?? []).filter(o => o.levelId === levelId),
                elevation_mm: level.elevation ?? 0,
                floorId: levelId,
                floorName: level.name,
                rooms: (b.rooms ?? []).filter(r => r.levelId === levelId),
                walls: b.derived?.[`walls_${levelId}`] ?? [],
                stairs: (b.stairs ?? []).filter(s => s.fromLevelId === levelId || s.toLevelId === levelId),
                voids: (b.voids ?? []).filter(v => v.levelId === levelId),
            };
        });
    }
    // v0.4 blocks - return all blocks with all their floors (incl. derived walls for 3D)
    if (isV04(plan)) {
        const results = [];
        for (const block of plan.blocks) {
            for (const floor of (block.floors ?? [])) {
                const wall = floor.wall ?? def;
                const w = wall?.thickness_mm ?? wall?.thickness ?? defWall.thickness;
                const h = wall?.height_mm ?? wall?.height ?? defWall.height;
                const levelKey = `${block.id}:${floor.id}`;
                const walls = plan.derived?.wallsByLevel?.[levelKey] ?? [];
                results.push({
                    isBlock: true,
                    blockId: block.id,
                    blockName: block.name,
                    position: block.position ?? { x: 0, z: 0 },
                    footprint: block.footprint ?? {},
                    wall: { thickness: w, height: h },
                    openings: floor.openings ?? [],
                    rooms: floor.rooms ?? [],
                    walls,
                    elevation_mm: floor.elevation_mm ?? 0,
                    floorId: floor.id,
                    floorName: floor.name,
                    roof: block.roof,
                });
            }
        }
        return results;
    }
    return floors.map(f => {
        if (plan.floors) {
            const wall = f.wall ?? def;
            const w = wall?.thickness_mm ?? wall?.thickness ?? defWall.thickness;
            const h = wall?.height_mm ?? wall?.height ?? defWall.height;
            return {
                footprint: f.footprint ?? {},
                wall: { thickness: w, height: h },
                openings: f.openings ?? [],
                elevation_mm: f.elevation_mm ?? 0,
                floorId: f.id,
                floorName: f.name,
                rooms: f.rooms,
                walls: f.walls,
                stairs: f.stairs,
            };
        }
        return {
            footprint: plan.footprint,
            wall: plan.wall ?? defWall,
            openings: plan.openings ?? [],
            elevation_mm: 0,
            floorId: 'f0',
            floorName: 'Etasje',
        };
    });
}
