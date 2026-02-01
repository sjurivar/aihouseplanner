/**
 * JSON parsing and format detection
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

export function detectFormat(plan) {
    if (!plan || typeof plan !== 'object') return null;
    if (isV1(plan)) return 'v1';
    if (isV05(plan)) return 'v0.5';
    if (plan.floors && Array.isArray(plan.floors)) {
        return plan.roof ? 'v0.3' : 'v0.2';
    }
    return plan.footprint ? 'v0' : null;
}

export function getFloorList(plan) {
    if (!plan) return [];
    if (plan.levels && Array.isArray(plan.levels)) return plan.levels;
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
