/**
 * Deterministic wall generation from rooms (rooms-first).
 * Inner walls are derived from room polygon edges; only shared edges become interior walls.
 */

import { ensureDerivedStructure } from './material-defaults.js';

const EPS_MM = 5;

function snap(v) {
    return Math.round(v / EPS_MM) * EPS_MM;
}

/**
 * Normalize segment so key is direction-independent: [x1,y1,x2,y2] with (x1,y1) <= (x2,y2) lexicographically.
 */
function segmentKey(x1, y1, x2, y2) {
    const ax = snap(x1);
    const ay = snap(y1);
    const bx = snap(x2);
    const by = snap(y2);
    if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay},${bx},${by}`;
    return `${bx},${by},${ax},${ay}`;
}

/**
 * Polygon (rect) to 4 segments: [[x1,y1,x2,y2], ...] in mm.
 */
function polygonToSegments(polygon) {
    if (!polygon || polygon.length < 3) return [];
    const pts = polygon.map(p => [Number(p[0]) || 0, Number(p[1]) || 0]);
    const segs = [];
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        segs.push([pts[i][0], pts[i][1], pts[j][0], pts[j][1]]);
    }
    return segs;
}

/**
 * Stable id for a wall from levelId + key + thickness + wallType.
 */
function wallId(levelKey, segKey, thicknessMm, wallType) {
    const h = simpleHash(levelKey + '|' + segKey + '|' + thicknessMm + '|' + wallType);
    return 'W_' + levelKey.replace(/[^a-z0-9]/gi, '_') + '_' + h;
}

function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return (h >>> 0).toString(36);
}

/**
 * Generate interior walls from room polygons for one block and one level.
 * Rooms are assumed axis-aligned rectangles (4 segments each).
 * Only segments shared by exactly two rooms become interior walls.
 * @param {object} plan - full plan (for defaults)
 * @param {string} blockId - block id
 * @param {string} levelId - floor/level id (e.g. f1)
 * @returns {object[]} Wall[] with id, levelId, a, b, thicknessMm, wallType, roomIds, materialId, heightMm
 */
export function generateWallsFromRooms(plan, blockId, levelId) {
    const block = plan?.blocks?.find(b => b.id === blockId);
    if (!block) return [];
    const floor = (block.floors ?? []).find(f => f.id === levelId);
    if (!floor) return [];
    const rooms = floor.rooms ?? [];
    if (rooms.length === 0) return [];

    const levelKey = `${blockId}:${levelId}`;
    const def = plan.defaults ?? {};
    const wallRules = def.wallRules ?? { interior: { thicknessMm: 98 }, betweenUnits: { thicknessMm: 200 } };
    const defaultWallThickness = def.wall?.thickness_mm ?? 200;
    const defaultHeightMm = def.wall?.height_mm ?? 2700;
    const floorHeightMm = floor.heightMm ?? defaultHeightMm;

    const segmentToRooms = new Map();
    const segmentToCoords = new Map();

    for (const room of rooms) {
        const segs = polygonToSegments(room.polygon);
        const roomId = room.id ?? '';
        for (const [x1, y1, x2, y2] of segs) {
            const key = segmentKey(x1, y1, x2, y2);
            if (!segmentToRooms.has(key)) {
                segmentToRooms.set(key, []);
                segmentToCoords.set(key, { x1, y1, x2, y2 });
            }
            if (!segmentToRooms.get(key).includes(roomId)) segmentToRooms.get(key).push(roomId);
        }
    }

    const walls = [];
    for (const [key, roomIds] of segmentToRooms) {
        if (roomIds.length !== 2) continue;
        const { x1, y1, x2, y2 } = segmentToCoords.get(key);
        const roomA = rooms.find(r => (r.id ?? '') === roomIds[0]);
        const roomB = rooms.find(r => (r.id ?? '') === roomIds[1]);
        const wallType = (roomA?.unitId != null && roomB?.unitId != null && roomA.unitId !== roomB.unitId)
            ? 'betweenUnits'
            : 'interior';
        const rule = wallRules[wallType];
        let thicknessMm = rule?.thicknessMm ?? defaultWallThickness;
        if (roomA?.wall_thickness_mm != null) thicknessMm = roomA.wall_thickness_mm;
        else if (roomB?.wall_thickness_mm != null) thicknessMm = roomB.wall_thickness_mm;

        let materialId = def.materials?.wall ?? 'default_wall';
        if (block.materials?.wall) materialId = block.materials.wall;
        if (roomA?.materials?.wall) materialId = roomA.materials.wall;
        if (wallType === 'betweenUnits' && block.materials?.wall) materialId = block.materials.wall;

        const id = wallId(levelKey, key, thicknessMm, wallType);
        walls.push({
            id,
            levelId: levelKey,
            a: { x: snap(x1), y: snap(y1) },
            b: { x: snap(x2), y: snap(y2) },
            thicknessMm,
            wallType,
            roomIds: [...roomIds].sort(),
            materialId,
            heightMm: floorHeightMm,
        });
    }
    return walls;
}

/**
 * Regenerate derived walls for one block and one level, and write to plan.derived.wallsByLevel.
 * Uses composite key blockId:levelId for blocks.
 * @param {object} plan - plan (mutated)
 * @param {string} blockId - block id (for blocks) or null for single-building
 * @param {string} levelId - floor id (e.g. f1, F1)
 */
export function regenerateDerivedForLevel(plan, blockId, levelId) {
    if (!plan) return;
    ensureDerivedStructure(plan);
    const key = blockId ? `${blockId}:${levelId}` : levelId;
    if (blockId && plan.blocks?.some(b => b.id === blockId)) {
        plan.derived.wallsByLevel[key] = generateWallsFromRooms(plan, blockId, levelId);
    } else if (!blockId && plan.floors) {
        const floor = plan.floors.find(f => f.id === levelId);
        if (floor?.rooms?.length) {
            const walls = [];
            const segmentToRooms = new Map();
            const segmentToCoords = new Map();
            const def = plan.defaults ?? {};
            const wallRules = def.wallRules ?? { interior: { thicknessMm: 98 } };
            const defaultWallThickness = def.wall?.thickness_mm ?? 200;
            const defaultHeightMm = def.wall?.height_mm ?? 2700;
            for (const room of floor.rooms) {
                const segs = polygonToSegments(room.polygon);
                const roomId = room.id ?? '';
                for (const [x1, y1, x2, y2] of segs) {
                    const segKey = segmentKey(x1, y1, x2, y2);
                    if (!segmentToRooms.has(segKey)) {
                        segmentToRooms.set(segKey, []);
                        segmentToCoords.set(segKey, { x1, y1, x2, y2 });
                    }
                    if (!segmentToRooms.get(segKey).includes(roomId)) segmentToRooms.get(segKey).push(roomId);
                }
            }
            for (const [segKey, roomIds] of segmentToRooms) {
                if (roomIds.length !== 2) continue;
                const { x1, y1, x2, y2 } = segmentToCoords.get(segKey);
                const roomA = floor.rooms.find(r => (r.id ?? '') === roomIds[0]);
                let thicknessMm = wallRules.interior?.thicknessMm ?? defaultWallThickness;
                if (roomA?.wall_thickness_mm != null) thicknessMm = roomA.wall_thickness_mm;
                let materialId = def.materials?.wall ?? 'default_wall';
                if (roomA?.materials?.wall) materialId = roomA.materials.wall;
                const id = wallId(levelId, segKey, thicknessMm, 'interior');
                walls.push({
                    id,
                    levelId: key,
                    a: { x: snap(x1), y: snap(y1) },
                    b: { x: snap(x2), y: snap(y2) },
                    thicknessMm,
                    wallType: 'interior',
                    roomIds: [...roomIds].sort(),
                    materialId,
                    heightMm: floor.heightMm ?? defaultHeightMm,
                });
            }
            plan.derived.wallsByLevel[key] = walls;
        } else {
            plan.derived.wallsByLevel[key] = [];
        }
    }
}

/**
 * Regenerate all derived walls for the plan (all blocks and levels with rooms).
 */
export function regenerateAllDerivedWalls(plan) {
    if (!plan) return;
    ensureDerivedStructure(plan);
    if (plan.blocks) {
        for (const block of plan.blocks) {
            for (const floor of block.floors ?? []) {
                regenerateDerivedForLevel(plan, block.id, floor.id);
            }
        }
    }
    if (plan.floors) {
        for (const floor of plan.floors) {
            regenerateDerivedForLevel(plan, null, floor.id);
        }
    }
}
