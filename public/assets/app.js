/**
 * AI House Planner — frontend
 * Vanilla JS, ingen bundler, Three.js lokalt
 */

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

const scriptEl = document.querySelector('script[src$="app.js"]');
const BASE = scriptEl?.src
    ? (() => { const u = new URL(scriptEl.src); return u.origin + u.pathname.replace(/\/assets\/app\.js.*$/, ''); })()
    : (() => { const p = window.location.pathname.replace(/\/$/, '') || '/'; return window.location.origin + p; })();

// --- State ---
let plan = null;
let selectedFloorId = null;
let scene3d = null;
let renderer3d = null;
let camera3d = null;
let controls3d = null;

// --- Parse & format ---
function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function isV1(plan) {
    return plan?.version && String(plan.version).startsWith('1');
}

function isV05(plan) {
    return plan?.version && String(plan.version).startsWith('0.5');
}

function detectFormat(plan) {
    if (!plan || typeof plan !== 'object') return null;
    if (isV1(plan)) return 'v1';
    if (isV05(plan)) return 'v0.5';
    if (plan.floors && Array.isArray(plan.floors)) {
        return plan.roof ? 'v0.3' : 'v0.2';
    }
    return plan.footprint ? 'v0' : null;
}

function getFloorList(plan) {
    if (!plan) return [];
    if (plan.levels && Array.isArray(plan.levels)) return plan.levels;
    if (plan.floors) return plan.floors;
    if (plan.footprint) return [{ id: 'f0', name: 'Etasje', ...plan }];
    return [];
}

function getDefaults(plan) {
    return plan?.defaults?.wall ?? { thickness: 200, height: 2700 };
}

function getActivePlanRoot(plan, selectedFloorId) {
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
        const wallThickness = fpEl?.outerWall?.thickness ?? 250;
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

function getAllFloorRoots(plan) {
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

// --- Validation (basic client-side) ---
function validatePlan(plan) {
    const err = [];
    if (!plan?.units) err.push('units mangler');
    if (plan?.units !== 'mm') err.push('units må være "mm"');
    const roots = getAllFloorRoots(plan);
    for (const r of roots) {
        const w = r.footprint?.width ?? 0;
        const d = r.footprint?.depth ?? 0;
        if (w <= 0 || d <= 0) err.push(`${r.floorName}: ugyldig footprint`);
        const t = r.wall?.thickness ?? r.wall?.thickness_mm ?? 0;
        if (t > 0 && w > 0 && d > 0 && t * 2 >= Math.min(w, d)) err.push(`${r.floorName}: veggtykkelse for stor`);
    }
    // v1: basic structure validation (utvidbar)
    if (isV1(plan)) {
        for (const f of plan.floors ?? []) {
            for (const room of f.rooms ?? []) {
                if (!room.polygon?.length || room.polygon.length < 3) err.push(`Rom ${room.id}: polygon trenger min 3 punkter`);
            }
            for (const wall of f.walls ?? []) {
                if (!wall.path?.length || wall.path.length < 2) err.push(`Vegg ${wall.id}: path trenger min 2 punkter`);
            }
        }
    }
    return err;
}

// --- 2D SVG ---

/** Normalize polygon point: {x,y} or [x,y] -> [x,y] */
function toCoords(p) {
    if (p == null) return [0, 0];
    if (Array.isArray(p)) return [Number(p[0]) ?? 0, Number(p[1]) ?? 0];
    return [Number(p.x) ?? 0, Number(p.y) ?? 0];
}

/** Normalize polygon to [[x,y],...] for v0.5 {x,y} or v1 [x,y] */
function polygonToCoords(polygon) {
    if (!polygon?.length) return [];
    return polygon.map(p => toCoords(p));
}

/** v1 MVP: beregn centroid for polygon (lukket) */
function polygonCentroid(polygon) {
    const pts = polygonToCoords(polygon);
    if (!pts.length) return [0, 0];
    let sumX = 0, sumY = 0;
    for (const [x, y] of pts) {
        sumX += x;
        sumY += y;
    }
    return [sumX / pts.length, sumY / pts.length];
}

/** Point on path at distance d from start; path = array of [x,y], returns [x,y] */
function pointOnPath(path, d) {
    if (!path?.length || d <= 0) return path[0] ? [Number(path[0][0]), Number(path[0][1])] : [0, 0];
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const [x1, y1] = path[i].map(Number);
        const [x2, y2] = path[i + 1].map(Number);
        const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) || 1;
        if (acc + len >= d) {
            const t = (d - acc) / len;
            return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
        }
        acc += len;
    }
    const last = path[path.length - 1];
    return last ? [Number(last[0]), Number(last[1])] : [0, 0];
}

/** Total path length in mm */
function pathLengthMm(path) {
    if (!path || path.length < 2) return 0;
    let len = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const [x1, y1] = path[i].map(Number);
        const [x2, y2] = path[i + 1].map(Number);
        len += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    return len;
}

/** Wall segment to SVG path: segment [x1,y1]->[x2,y2] with thickness t, returns path d string */
function wallSegmentToPath(x1, y1, x2, y2, t, scale, pad) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const h = t / 2;
    const x1a = pad + (x1 + nx * h) * scale;
    const y1a = pad + (y1 + ny * h) * scale;
    const x1b = pad + (x1 - nx * h) * scale;
    const y1b = pad + (y1 - ny * h) * scale;
    const x2b = pad + (x2 - nx * h) * scale;
    const y2b = pad + (y2 - ny * h) * scale;
    const x2a = pad + (x2 + nx * h) * scale;
    const y2a = pad + (y2 + ny * h) * scale;
    return `M ${x1a} ${y1a} L ${x2a} ${y2a} L ${x2b} ${y2b} L ${x1b} ${y1b} Z`;
}

const FLOOR_FINISH_STYLES = {
    wood: { fill: '#d4a574', pattern: 'url(#pat-wood)' },
    tile: { fill: '#b8c4cc', pattern: 'url(#pat-tile)' },
    carpet: { fill: '#c9b896', pattern: 'url(#pat-carpet)' },
};
function getFloorFinishStyle(finish) {
    const key = String(finish || '').toLowerCase();
    return FLOOR_FINISH_STYLES[key] ?? { fill: '#e8e8e8' };
}

/** v1: 2D rooms + walls with correct thickness */
function render2Dv1(svgEl, activeRoot, plan, floorIndex = 0, scale = 0.05, pad = 40) {
    const fp = activeRoot.footprint ?? {};
    const w = Number(fp.width) ?? 9000;
    const d = Number(fp.depth) ?? 7000;
    const extTw = Number(activeRoot.wall?.thickness ?? activeRoot.wall?.thickness_mm ?? 200) || 200;
    const def = activeRoot.defaults?.wall ?? {};
    const extTwFallback = Number(def.thickness_mm ?? def.thickness ?? 200) || 200;
    const tw = extTw || extTwFallback;
    const vw = w * scale + pad * 2;
    const vh = d * scale + pad * 2;
    const toSvg = (x, y) => [pad + x * scale, pad + y * scale];

    const parts = [];
    const outer = `M ${pad} ${pad} L ${pad + w * scale} ${pad} L ${pad + w * scale} ${pad + d * scale} L ${pad} ${pad + d * scale} Z`;
    const inner = `M ${pad + tw * scale} ${pad + tw * scale} L ${pad + (w - tw) * scale} ${pad + tw * scale} L ${pad + (w - tw) * scale} ${pad + (d - tw) * scale} L ${pad + tw * scale} ${pad + (d - tw) * scale} Z`;

    const pathPrefix = `floors.${floorIndex}`;
    // Room polygons first (background) — floor_finish vises som farge/mønster
    let ri = 0;
    for (const room of activeRoot.rooms ?? []) {
        const poly = room.polygon ?? [];
        if (poly.length < 3) { ri++; continue; }
        const pathD = 'M ' + poly.map(([x, y]) => `${pad + x * scale} ${pad + y * scale}`).join(' L ') + ' Z';
        const hl = `${pathPrefix}.rooms.${ri}`;
        const style = getFloorFinishStyle(room.floor_finish);
        const fill = style.pattern ?? style.fill;
        parts.push(`<path class="svg-highlightable" data-highlight="${hl}" fill="${fill}" stroke="#999" stroke-width="0.5" d="${pathD}"/>`);
        ri++;
    }

    // Exterior wall band on top (frame: outer minus inner, fill-rule evenodd)
    parts.push(`<path class="svg-highlightable" data-highlight="${pathPrefix}" fill="#a0a0a0" stroke="#333" stroke-width="1" fill-rule="evenodd" d="${outer} ${inner}"/>`);

    // Interior walls on top (path-based, thickness + openings at at_mm)
    let wi = 0;
    for (const wall of activeRoot.walls ?? []) {
        const path = wall.path ?? [];
        const t = Number(wall.thickness_mm ?? def.thickness_mm ?? def.thickness ?? 200) || 200;
        const wallHl = `${pathPrefix}.walls.${wi}`;
        const openings = (wall.openings ?? []).map(o => ({
            start: Number(o.at_mm ?? 0) || 0,
            end: (Number(o.at_mm ?? 0) || 0) + (Number(o.width_mm ?? 900) || 900),
        })).sort((a, b) => a.start - b.start);
        const totalLen = pathLengthMm(path);
        const solidRanges = [];
        let last = 0;
        for (const o of openings) {
            if (o.start > last) solidRanges.push([last, Math.min(o.start, totalLen)]);
            last = Math.max(last, o.end);
        }
        if (last < totalLen) solidRanges.push([last, totalLen]);
        for (const [a, b] of solidRanges) {
            if (a >= b) continue;
            const pA = pointOnPath(path, a);
            const pB = pointOnPath(path, b);
            const dPath = wallSegmentToPath(pA[0], pA[1], pB[0], pB[1], t, scale, pad);
            parts.push(`<path class="svg-highlightable" data-highlight="${wallHl}" fill="#a0a0a0" stroke="#444" stroke-width="1" d="${dPath}"/>`);
        }
        wi++;
    }

    // Room labels on top
    for (const room of activeRoot.rooms ?? []) {
        const poly = room.polygon ?? [];
        if (poly.length < 3) continue;
        const [cx, cy] = polygonCentroid(poly);
        const [sx, sy] = toSvg(cx, cy);
        parts.push(`<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#333">${room.name ?? room.id ?? ''}</text>`);
    }

    // v1: stairs — total lengde fra rise_mm og run_mm, vis i alle koblede etasjer
    const floorId = activeRoot.floorId;
    const floors = plan?.floors ?? [];
    for (let fi = 0; fi < floors.length; fi++) {
        const f = floors[fi];
        for (let si = 0; si < (f.stairs ?? []).length; si++) {
            const stair = f.stairs[si];
            const connects = stair.from_floor_id === floorId || stair.to_floor_id === floorId;
            if (!connects) continue;
            const stairHl = `floors.${fi}.stairs.${si}`;
            const rise = Number(stair.rise_mm ?? 175) || 175;
            const run = Number(stair.run_mm ?? 250) || 250;
            const fromFloor = floors.find(ff => ff.id === stair.from_floor_id);
            const toFloor = floors.find(ff => ff.id === stair.to_floor_id);
            const elevFrom = Number(fromFloor?.elevation_mm ?? 0) || 0;
            const elevTo = Number(toFloor?.elevation_mm ?? 0) || 0;
            const totalRise = Math.abs(elevTo - elevFrom);
            const numSteps = Math.max(1, Math.round(totalRise / rise));
            const totalRunMm = numSteps * run;
            const dir = (stair.direction_degrees ?? 0) * Math.PI / 180;
            const [sx, sy] = stair.start ?? [0, 0];
            const dx = Math.cos(dir);
            const dy = Math.sin(dir);
            const perpX = -dy;
            const perpY = dx;
            const hw = (stair.width_mm ?? 900) / 2;
            const p0 = [sx - perpX * hw, sy - perpY * hw];
            const p1 = [sx + perpX * hw, sy + perpY * hw];
            const p2 = [sx + dx * totalRunMm + perpX * hw, sy + dy * totalRunMm + perpY * hw];
            const p3 = [sx + dx * totalRunMm - perpX * hw, sy + dy * totalRunMm - perpY * hw];
            const pathD = `M ${pad + p0[0] * scale} ${pad + p0[1] * scale} L ${pad + p1[0] * scale} ${pad + p1[1] * scale} L ${pad + p2[0] * scale} ${pad + p2[1] * scale} L ${pad + p3[0] * scale} ${pad + p3[1] * scale} Z`;
            const ex = (sx + dx * totalRunMm) * scale + pad;
            const ey = (sy + dy * totalRunMm) * scale + pad;
            parts.push(`<g class="svg-highlightable" data-highlight="${stairHl}"><path d="${pathD}" fill="#b0c4de" stroke="#4682b4"/><line x1="${pad + sx * scale}" y1="${pad + sy * scale}" x2="${ex}" y2="${ey}" stroke="#4682b4" stroke-width="2" marker-end="url(#arrow)"/></g>`);
        }
    }

    const dims = [
        `<line x1="${pad}" y1="${pad - 15}" x2="${pad + w * scale}" y2="${pad - 15}" stroke="#666"/>`,
        `<text x="${pad + w * scale / 2}" y="${pad - 5}" text-anchor="middle" font-size="10" fill="#666">${w}mm</text>`,
        `<line x1="${pad - 15}" y1="${pad}" x2="${pad - 15}" y2="${pad + d * scale}" stroke="#666"/>`,
        `<text x="${pad - 8}" y="${pad + d * scale / 2}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90 ${pad - 8} ${pad + d * scale / 2})">${d}mm</text>`,
    ];

    const defs = `<defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="#4682b4"/></marker>
        <pattern id="pat-wood" width="8" height="4" patternUnits="userSpaceOnUse">
            <rect width="8" height="4" fill="#d4a574"/>
            <line x1="0" y1="2" x2="8" y2="2" stroke="#c4956a" stroke-width="0.5"/>
        </pattern>
        <pattern id="pat-tile" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#b8c4cc"/>
            <rect width="12" height="12" fill="none" stroke="#a0acb4" stroke-width="0.6"/>
        </pattern>
        <pattern id="pat-carpet" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#c9b896"/>
            <circle cx="3" cy="3" r="0.8" fill="#b8a886"/>
        </pattern>
    </defs>`;
    svgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${defs}${dims.join('')}${parts.join('')}</svg>`;
}

/** v0.5: 2D rooms + derived walls + voids + stairs (polygon {x,y} format) */
function render2Dv05(svgEl, activeRoot, plan, floorIndex = 0, scale = 0.05, pad = 40) {
    const fp = activeRoot.footprint ?? {};
    const fpPoly = polygonToCoords(fp.polygon ?? []);
    let minX = 0, minY = 0, maxX = 14000, maxY = 10000;
    if (fpPoly.length >= 2) {
        minX = Math.min(...fpPoly.map(([x]) => x));
        minY = Math.min(...fpPoly.map(([, y]) => y));
        maxX = Math.max(...fpPoly.map(([x]) => x));
        maxY = Math.max(...fpPoly.map(([, y]) => y));
    }
    const w = maxX - minX || 14000;
    const d = maxY - minY || 10000;
    const vw = w * scale + pad * 2;
    const vh = d * scale + pad * 2;
    const toSvg = (x, y) => [pad + (x - minX) * scale, pad + (y - minY) * scale];

    const def = activeRoot.defaults?.wallRules?.interior ?? {};
    const defWall = activeRoot.defaults?.openingDefaults ?? {};
    const tw = Number(activeRoot.wall?.thickness ?? def?.thickness ?? 98) || 98;

    const parts = [];
    const pathPrefix = `levels.${floorIndex}`;

    // Voids (stair openings) first — dashed fill
    for (const v of activeRoot.voids ?? []) {
        const poly = polygonToCoords(v.polygon ?? []);
        if (poly.length < 3) continue;
        const pathD = 'M ' + poly.map(([x, y]) => `${pad + (x - minX) * scale} ${pad + (y - minY) * scale}`).join(' L ') + ' Z';
        parts.push(`<path fill="#e0e8f0" stroke="#7090b0" stroke-width="1" stroke-dasharray="4 2" d="${pathD}"/>`);
    }

    // Room polygons (background) — floor_finish
    let ri = 0;
    for (const room of activeRoot.rooms ?? []) {
        const poly = polygonToCoords(room.polygon ?? []);
        if (poly.length < 3) { ri++; continue; }
        const pathD = 'M ' + poly.map(([x, y]) => `${pad + (x - minX) * scale} ${pad + (y - minY) * scale}`).join(' L ') + ' Z';
        const hl = `${pathPrefix}.rooms.${ri}`;
        const style = getFloorFinishStyle(room.floor_finish);
        const fill = style.pattern ?? style.fill;
        parts.push(`<path class="svg-highlightable" data-highlight="${hl}" fill="${fill}" stroke="#999" stroke-width="0.5" d="${pathD}"/>`);
        ri++;
    }

    // Exterior footprint outline
    if (fpPoly.length >= 3) {
        const outerD = 'M ' + fpPoly.map(([x, y]) => `${pad + (x - minX) * scale} ${pad + (y - minY) * scale}`).join(' L ') + ' Z';
        parts.push(`<path fill="none" stroke="#333" stroke-width="2" d="${outerD}"/>`);
    }

    // Interior walls from derived
    let wi = 0;
    for (const wall of activeRoot.walls ?? []) {
        const a = wall.a ?? {};
        const b = wall.b ?? {};
        const x1 = Number(a.x ?? 0) - minX;
        const y1 = Number(a.y ?? 0) - minY;
        const x2 = Number(b.x ?? 0) - minX;
        const y2 = Number(b.y ?? 0) - minY;
        const t = Number(wall.thickness ?? tw) || tw;
        const wallHl = `${pathPrefix}.walls.${wi}`;
        const dPath = wallSegmentToPath(x1, y1, x2, y2, t, scale, pad);
        parts.push(`<path class="svg-highlightable" data-highlight="${wallHl}" fill="#a0a0a0" stroke="#444" stroke-width="1" d="${dPath}"/>`);
        wi++;
    }

    // Room labels
    for (const room of activeRoot.rooms ?? []) {
        const poly = polygonToCoords(room.polygon ?? []);
        if (poly.length < 3) continue;
        const [cx, cy] = polygonCentroid(poly);
        const [sx, sy] = toSvg(cx, cy);
        parts.push(`<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#333">${room.name ?? room.id ?? ''}</text>`);
    }

    // Stairs — v0.5: origin, direction (deg), runWidth, risers, tread
    const levels = plan?.levels ?? [];
    for (let si = 0; si < (activeRoot.stairs ?? []).length; si++) {
        const stair = activeRoot.stairs[si];
        const origin = stair.origin ?? {};
        const sx = Number(origin.x ?? 0);
        const sy = Number(origin.y ?? 0);
        const dirDeg = Number(stair.direction ?? 0) || 0;
        const dir = dirDeg * Math.PI / 180;
        const risers = Number(stair.risers ?? 14) || 14;
        const tread = Number(stair.tread ?? 260) || 260;
        const totalRunMm = risers * tread;
        const runWidth = Number(stair.runWidth ?? 1000) || 1000;
        const dx = Math.cos(dir);
        const dy = Math.sin(dir);
        const perpX = -dy;
        const perpY = dx;
        const hw = runWidth / 2;
        const p0 = [sx - perpX * hw, sy - perpY * hw];
        const p1 = [sx + perpX * hw, sy + perpY * hw];
        const p2 = [sx + dx * totalRunMm + perpX * hw, sy + dy * totalRunMm + perpY * hw];
        const p3 = [sx + dx * totalRunMm - perpX * hw, sy + dy * totalRunMm - perpY * hw];
        const pathD = `M ${pad + (p0[0] - minX) * scale} ${pad + (p0[1] - minY) * scale} L ${pad + (p1[0] - minX) * scale} ${pad + (p1[1] - minY) * scale} L ${pad + (p2[0] - minX) * scale} ${pad + (p2[1] - minY) * scale} L ${pad + (p3[0] - minX) * scale} ${pad + (p3[1] - minY) * scale} Z`;
        const ex = pad + (sx + dx * totalRunMm - minX) * scale;
        const ey = pad + (sy + dy * totalRunMm - minY) * scale;
        const stairHl = `${pathPrefix}.stairs.${si}`;
        parts.push(`<g class="svg-highlightable" data-highlight="${stairHl}"><path d="${pathD}" fill="#b0c4de" stroke="#4682b4"/><line x1="${pad + (sx - minX) * scale}" y1="${pad + (sy - minY) * scale}" x2="${ex}" y2="${ey}" stroke="#4682b4" stroke-width="2" marker-end="url(#arrow)"/></g>`);
    }

    const dims = [
        `<line x1="${pad}" y1="${pad - 15}" x2="${pad + w * scale}" y2="${pad - 15}" stroke="#666"/>`,
        `<text x="${pad + w * scale / 2}" y="${pad - 5}" text-anchor="middle" font-size="10" fill="#666">${w}mm</text>`,
        `<line x1="${pad - 15}" y1="${pad}" x2="${pad - 15}" y2="${pad + d * scale}" stroke="#666"/>`,
        `<text x="${pad - 8}" y="${pad + d * scale / 2}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90 ${pad - 8} ${pad + d * scale / 2})">${d}mm</text>`,
    ];

    const defs = `<defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="#4682b4"/></marker>
        <pattern id="pat-wood" width="8" height="4" patternUnits="userSpaceOnUse">
            <rect width="8" height="4" fill="#d4a574"/>
            <line x1="0" y1="2" x2="8" y2="2" stroke="#c4956a" stroke-width="0.5"/>
        </pattern>
        <pattern id="pat-tile" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#b8c4cc"/>
            <rect width="12" height="12" fill="none" stroke="#a0acb4" stroke-width="0.6"/>
        </pattern>
        <pattern id="pat-carpet" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#c9b896"/>
            <circle cx="3" cy="3" r="0.8" fill="#b8a886"/>
        </pattern>
    </defs>`;
    svgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${defs}${dims.join('')}${parts.join('')}</svg>`;
}

function render2D(svgEl, activeRoot, plan, floorIndex = 0) {
    if (!activeRoot) return;
    const hasV05 = isV05(plan) && (activeRoot.rooms?.length ?? 0) > 0;
    const hasV1 = isV1(plan) && (activeRoot.rooms?.length ?? 0) > 0;
    const hasFootprint = activeRoot.footprint && (activeRoot.footprint.width || activeRoot.footprint.polygon);
    if (!hasV05 && !hasV1 && !hasFootprint) return;
    // v0.5: rooms-first med footprint.polygon, derived walls, voids
    if (isV05(plan) && (activeRoot?.rooms?.length ?? 0) > 0) {
        render2Dv05(svgEl, activeRoot, plan, floorIndex);
        return;
    }
    // v1 MVP: rom-basert visualisering
    if (isV1(plan) && (activeRoot?.rooms?.length ?? 0) > 0) {
        render2Dv1(svgEl, activeRoot, plan, floorIndex);
        return;
    }
    if (!activeRoot?.footprint) return;
    // v0/v0.3: footprint + vegger + åpninger
    const fp = activeRoot.footprint;
    const w = Number(fp.width) ?? 8000;
    const d = Number(fp.depth) ?? 8000;
    const tw = Number(activeRoot.wall?.thickness ?? activeRoot.wall?.thickness_mm ?? 200) || 200;
    const scale = 0.05;
    const pad = 40;
    const vw = w * scale + pad * 2;
    const vh = d * scale + pad * 2;

    const wallsLen = { front: w, back: w, left: d, right: d };
    const paths = [];

    const outer = `M ${pad} ${pad} L ${pad + w * scale} ${pad} L ${pad + w * scale} ${pad + d * scale} L ${pad} ${pad + d * scale} Z`;
    const inner = `M ${pad + tw * scale} ${pad + tw * scale} L ${pad + (w - tw) * scale} ${pad + tw * scale} L ${pad + (w - tw) * scale} ${pad + (d - tw) * scale} L ${pad + tw * scale} ${pad + (d - tw) * scale} Z`;

    const pathPrefix = plan.floors ? `floors.${floorIndex}` : '';
    paths.push(`<path class="svg-highlightable" data-highlight="${pathPrefix || 'f0'}" fill="none" stroke="#333" stroke-width="2" d="${outer}"/>`);
    paths.push(`<path class="svg-highlightable" data-highlight="${pathPrefix || 'f0'}" fill="#f5f5f5" stroke="#666" stroke-width="1" d="${inner}"/>`);

    for (const o of activeRoot.openings ?? []) {
        const len = wallsLen[o.wall] ?? w;
        const ox = Number(o.offset) ?? 0;
        const ow = Number(o.width) ?? 900;
        const x = pad;
        const y = pad;
        let rect;
        if (o.wall === 'front') rect = { x: x + ox * scale, y: y, w: ow * scale, h: tw * scale };
        else if (o.wall === 'back') rect = { x: x + ox * scale, y: y + (d - tw) * scale, w: ow * scale, h: tw * scale };
        else if (o.wall === 'left') rect = { x: x, y: y + ox * scale, w: tw * scale, h: ow * scale };
        else rect = { x: x + (w - tw) * scale, y: y + ox * scale, w: tw * scale, h: ow * scale };
        paths.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="white" stroke="#999"/>`);
    }

    const dims = [
        `<line x1="${pad}" y1="${pad - 15}" x2="${pad + w * scale}" y2="${pad - 15}" stroke="#666"/>`,
        `<text x="${pad + w * scale / 2}" y="${pad - 5}" text-anchor="middle" font-size="10" fill="#666">${w}mm</text>`,
        `<line x1="${pad - 15}" y1="${pad}" x2="${pad - 15}" y2="${pad + d * scale}" stroke="#666"/>`,
        `<text x="${pad - 8}" y="${pad + d * scale / 2}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90 ${pad - 8} ${pad + d * scale / 2})">${d}mm</text>`,
    ];

    svgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${dims.join('')}${paths.join('')}</svg>`;
}

function exportSvg(svgEl) {
    const svg = svgEl.querySelector('svg');
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([s], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plan-2d.svg';
    a.click();
    URL.revokeObjectURL(a.href);
}

// --- 3D ---
function init3D() {
    const canvas = document.getElementById('canvas3d');
    if (!canvas) return;
    const w = Math.max(canvas.clientWidth || 400, 1);
    const h = Math.max(canvas.clientHeight || 280, 1);
    scene3d = new THREE.Scene();
    scene3d.background = new THREE.Color(0xb8d4e8);
    camera3d = new THREE.PerspectiveCamera(50, w / h, 1, 100000);
    camera3d.position.set(15, 10, 15);
    camera3d.lookAt(0, 0, 0);
    renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer3d.setSize(w, h);
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    controls3d = new OrbitControls(camera3d, canvas);
    controls3d.enableDamping = true;
    scene3d.add(new THREE.AmbientLight(0x404060));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10000, 20000, 10000);
    scene3d.add(dirLight);
    function resize3D() {
        if (!canvas || !renderer3d || !camera3d) return;
        const w = Math.max(canvas.clientWidth || 400, 1);
        const h = Math.max(canvas.clientHeight || 280, 1);
        renderer3d.setSize(w, h);
        camera3d.aspect = w / h;
        camera3d.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize3D);
    const canvasWrap = document.getElementById('canvas3dWrap');
    if (canvasWrap && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(resize3D).observe(canvasWrap);
    }
    animate3d();
}

function animate3d() {
    requestAnimationFrame(animate3d);
    if (controls3d) controls3d.update();
    if (renderer3d && scene3d && camera3d) renderer3d.render(scene3d, camera3d);
}

function clearScene() {
    if (!scene3d) return;
    while (scene3d.children.length > 0) {
        const c = scene3d.children[0];
        scene3d.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
            else c.material.dispose();
        }
    }
    scene3d.add(new THREE.AmbientLight(0x404060));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10000, 20000, 10000);
    scene3d.add(dirLight);
}

function addGroundAndHorizon() {
    if (!scene3d) return;
    const groundMat = new THREE.MeshBasicMaterial({ color: 0xd4c4a8, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    scene3d.add(ground);
    const horizonLineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-200, 0, -150),
        new THREE.Vector3(200, 0, -150),
    ]);
    const horizonMat = new THREE.LineBasicMaterial({ color: 0x6b7b8c });
    const horizonLine = new THREE.Line(horizonLineGeo, horizonMat);
    scene3d.add(horizonLine);
}

function buildRoofMeshes(roofSpec, topElevation, width, depth) {
    const meshes = [];
    if (!roofSpec || roofSpec.type !== 'gable') return meshes;
    const scale = 0.001;
    const pitch = (roofSpec.pitch_degrees ?? 35) * Math.PI / 180;
    const overhang = (roofSpec.overhang_mm ?? 500) * scale;
    const thick = (roofSpec.thickness_mm ?? 200) * scale;
    const ridgeDir = roofSpec.ridge_direction ?? 'x';
    const w = width * scale + overhang * 2;
    const d = depth * scale + overhang * 2;
    const halfRidgeH = Math.tan(pitch) * (ridgeDir === 'x' ? d / 2 : w / 2);

    const mat = new THREE.MeshLambertMaterial({
        color: 0x8b4513,
        side: THREE.DoubleSide,
    });

    const ridgeLen = ridgeDir === 'x' ? w : d;
    const slopeLen = ridgeDir === 'x' ? d / 2 : w / 2;
    const slopeW = Math.sqrt(slopeLen * slopeLen + halfRidgeH * halfRidgeH);
    const geom = new THREE.BoxGeometry(ridgeDir === 'x' ? ridgeLen : slopeW * 2, thick, ridgeDir === 'x' ? slopeW * 2 : ridgeLen);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, topElevation + halfRidgeH, 0);
    mesh.rotation.x = ridgeDir === 'x' ? -pitch : 0;
    mesh.rotation.z = ridgeDir === 'y' ? -pitch : 0;
    meshes.push(mesh);
    return meshes;
}

function rebuild3D(allFloors, roofSpec, plan) {
    clearScene();
    if (!allFloors?.length) return;
    // v0.5/v1: 3D not implemented for polygon footprint / rooms-only
    if ((isV05(plan) || (isV1(plan) && !allFloors[0]?.footprint?.width))) {
        const msg = document.createElement('div');
        msg.textContent = '3D not implemented for v0.5/v1 yet';
        msg.style.cssText = 'color:#999;padding:2rem;text-align:center;';
        const canvas = document.getElementById('canvas3d');
        if (canvas?.parentNode) {
            canvas.style.display = 'none';
            const wrap = canvas.parentNode;
            if (!wrap.querySelector('[data-v1-msg]')) {
                const d = document.createElement('div');
                d.setAttribute('data-v1-msg', '1');
                d.appendChild(msg);
                wrap.appendChild(d);
            }
        }
        return;
    }
    const canvas = document.getElementById('canvas3d');
    if (canvas) canvas.style.display = 'block';
    const v1Msg = document.querySelector('[data-v1-msg]');
    if (v1Msg) v1Msg.remove();

    const scale = 0.001;
    const matWall = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const matFloor = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    let topY = 0;
    let lastW = 8000, lastD = 8000;

    const meshByPath = {};
    let fi = 0;
    for (const root of allFloors) {
        const fp = root.footprint;
        const w = (fp?.width ?? 8000) * scale;
        const d = (fp?.depth ?? 8000) * scale;
        const tw = (root.wall?.thickness ?? 200) * scale;
        const th = (root.wall?.height ?? 2700) * scale;
        const elev = (root.elevation_mm ?? 0) * scale;
        topY = elev + th;
        lastW = (fp?.width ?? 8000);
        lastD = (fp?.depth ?? 8000);
        const path = `floors.${fi}`;

        const floorMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            matFloor.clone()
        );
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, elev, 0);
        scene3d.add(floorMesh);
        if (!meshByPath[path]) meshByPath[path] = [];
        meshByPath[path].push(floorMesh);

        const wallsLen = { front: w, back: w, left: d, right: d };
        const wallPos = [
            [0, elev + th / 2, -d / 2 + tw / 2],
            [w / 2 - tw / 2, elev + th / 2, 0],
            [0, elev + th / 2, d / 2 - tw / 2],
            [-w / 2 + tw / 2, elev + th / 2, 0],
        ];
        const wallSize = [
            [w, th, tw],
            [tw, th, d],
            [w, th, tw],
            [tw, th, d],
        ];
        const wallNames = ['front', 'right', 'back', 'left'];

        for (let i = 0; i < 4; i++) {
            const len = wallsLen[wallNames[i]];
            const openings = (root.openings ?? []).filter(o => o.wall === wallNames[i]);
            openings.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
            let pos = 0;
            const segs = [];
            for (const o of openings) {
                const oo = (o.offset ?? 0) * scale;
                const ow = (o.width ?? 900) * scale;
                if (oo > pos) segs.push({ start: pos, end: oo });
                pos = oo + ow;
            }
            if (pos < len) segs.push({ start: pos, end: len });

            const isX = wallNames[i] === 'front' || wallNames[i] === 'back';
            const [pw, ph, pd] = wallSize[i];
            for (const seg of segs) {
                const sw = (seg.end - seg.start);
                const segW = isX ? sw : pw;
                const segD = isX ? pd : sw;
                const geom = new THREE.BoxGeometry(segW, ph, segD);
                const mesh = new THREE.Mesh(geom, matWall.clone());
                const cx = (seg.start + seg.end) / 2;
                if (wallNames[i] === 'front') mesh.position.set(-w / 2 + cx, elev + th / 2, -d / 2 + tw / 2);
                else if (wallNames[i] === 'back') mesh.position.set(-w / 2 + cx, elev + th / 2, d / 2 - tw / 2);
                else if (wallNames[i] === 'left') mesh.position.set(-w / 2 + tw / 2, elev + th / 2, -d / 2 + cx);
                else mesh.position.set(w / 2 - tw / 2, elev + th / 2, -d / 2 + cx);
                scene3d.add(mesh);
                if (!meshByPath[path]) meshByPath[path] = [];
                meshByPath[path].push(mesh);
            }
        }
        fi++;
    }

    scene3d.userData.meshesByPath = meshByPath;

    if (roofSpec) {
        buildRoofMeshes(roofSpec, topY, lastW, lastD).forEach(m => scene3d.add(m));
    }

    // Oppdater canvas-størrelse ved render
    addGroundAndHorizon();
    const canvasEl = document.getElementById('canvas3d');
    if (canvasEl && renderer3d) {
        const cw = Math.max(canvasEl.clientWidth || 400, 1);
        const ch = Math.max(canvasEl.clientHeight || 280, 1);
        renderer3d.setSize(cw, ch);
        camera3d.aspect = cw / ch;
        camera3d.updateProjectionMatrix();
    }
}

// --- JSON Tree (plan hierarchy) ---
function buildPlanHierarchy(plan) {
    if (!plan || typeof plan !== 'object') return null;
    if (isV05(plan) && plan.buildings?.length) {
        const b = plan.buildings[0];
        const rootLabel = b.name ?? 'Plan';
        const root = { label: rootLabel, children: [], data: b, path: ['buildings', 0] };
        const levels = plan.levels ?? [];
        for (let li = 0; li < levels.length; li++) {
            const level = levels[li];
            const levelId = level.id;
            const levelNode = { label: level.name ?? levelId, children: [], data: level, path: ['levels', li] };
            const rooms = (b.rooms ?? []).filter(r => r.levelId === levelId);
            for (let ri = 0; ri < rooms.length; ri++) {
                const r = rooms[ri];
                levelNode.children.push({ label: r.name ?? r.id ?? 'Rom', children: [], data: r, path: ['levels', li, 'rooms', ri] });
            }
            const walls = b.derived?.[`walls_${levelId}`] ?? [];
            for (let wi = 0; wi < walls.length; wi++) {
                const w = walls[wi];
                levelNode.children.push({ label: w.id ?? 'Vegg', children: [], data: w, path: ['levels', li, 'walls', wi] });
            }
            const stairs = (b.stairs ?? []).filter(s => s.fromLevelId === levelId || s.toLevelId === levelId);
            for (let si = 0; si < stairs.length; si++) {
                const s = stairs[si];
                levelNode.children.push({ label: s.name ?? s.id ?? 'Trapp', children: [], data: s, path: ['levels', li, 'stairs', si] });
            }
            const voids = (b.voids ?? []).filter(v => v.levelId === levelId);
            for (let vi = 0; vi < voids.length; vi++) {
                levelNode.children.push({ label: voids[vi].name ?? 'Void', children: [], data: voids[vi], path: ['levels', li, 'voids', vi] });
            }
            root.children.push(levelNode);
        }
        return root;
    }
    const rootLabel = plan.building?.name ?? plan.defaults ? 'Plan' : 'Plan';
    const root = { label: rootLabel, children: [], data: plan.building ?? plan, path: plan.building ? ['building'] : [] };

    const floors = plan.floors ?? (plan.footprint ? [{ id: 'f0', name: 'Etasje', ...plan }] : []);
    for (let fi = 0; fi < floors.length; fi++) {
        const f = floors[fi];
        const floorLabel = f.name ?? f.id ?? 'Etasje';
        const floorNode = { label: floorLabel, children: [], data: f, path: ['floors', fi] };

        for (let ri = 0; ri < (f.rooms ?? []).length; ri++) {
            const r = f.rooms[ri];
            const roomLabel = r.name ?? r.id ?? 'Rom';
            floorNode.children.push({ label: roomLabel, children: [], data: r, path: ['floors', fi, 'rooms', ri] });
        }
        if ((f.walls ?? []).length > 0) {
            const wallsNode = { label: 'Vegger', children: [], data: f.walls, path: ['floors', fi, 'walls'] };
            for (let wi = 0; wi < f.walls.length; wi++) {
                const w = f.walls[wi];
                wallsNode.children.push({ label: w.id ?? 'Vegg', children: [], data: w, path: ['floors', fi, 'walls', wi] });
            }
            floorNode.children.push(wallsNode);
        }
        for (let si = 0; si < (f.stairs ?? []).length; si++) {
            const s = f.stairs[si];
            const stairLabel = s.name ?? s.id ?? 'Trapp';
            floorNode.children.push({ label: stairLabel, children: [], data: s, path: ['floors', fi, 'stairs', si] });
        }
        if (floorNode.children.length === 0 && (f.openings ?? []).length > 0) {
            floorNode.children.push({ label: 'Åpninger', children: [], data: f.openings, path: ['floors', fi, 'openings'] });
        }
        root.children.push(floorNode);
    }
    if (root.children.length === 0 && plan.footprint) {
        root.children.push({ label: 'Etasje', children: [], data: plan, path: [] });
    }
    return root;
}

function formatDataForPopup(data) {
    if (data === null || data === undefined) return '';
    if (typeof data === 'string') return data;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);
    if (Array.isArray(data)) {
        if (data.length > 0 && Array.isArray(data[0])) return `${data.length} punkter`;
        return data.length + ' elementer';
    }
    const pairs = [];
    for (const k of Object.keys(data)) {
        const v = data[k];
        if (v === null || v === undefined) pairs.push(`${k}: —`);
        else if (typeof v === 'string') pairs.push(`${k}: ${v}`);
        else if (typeof v === 'number' || typeof v === 'boolean') pairs.push(`${k}: ${v}`);
        else if (Array.isArray(v)) pairs.push(`${k}: ${v.length} ${v.length === 1 ? 'element' : 'elementer'}`);
        else if (typeof v === 'object') pairs.push(`${k}: {…}`);
        else pairs.push(`${k}: ${String(v)}`);
    }
    return pairs.join('\n');
}

function renderJsonTree(el, data) {
    if (!el) return;
    if (!data) {
        el.innerHTML = '<span class="tree-empty">Ingen data</span>';
        return;
    }
    const root = buildPlanHierarchy(data);
    if (!root || !root.children?.length) {
        el.innerHTML = '<span class="tree-empty">Tom struktur</span>';
        return;
    }
    el.innerHTML = '<div class="tree-root">' + buildHierarchyHtml(root, 0, false, false) + '</div>';
    el.querySelectorAll('.tree-item[data-hasdata]').forEach(domNode => {
        const popup = domNode.getAttribute('data-popup');
        const pathStr = domNode.getAttribute('data-path');
        if (!popup) return;
        domNode.addEventListener('mouseenter', (e) => {
            clearTimeout(treePopupTimeout);
            setTreeHighlight(pathStr || null);
            showTreePopup(e.currentTarget, popup, pathStr);
        });
        domNode.addEventListener('mouseleave', () => {
            treePopupTimeout = setTimeout(() => {
                setTreeHighlight(null);
                hideTreePopup();
            }, 250);
        });
        domNode.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideTreePopup();
            const label = domNode.querySelector('.tree-label')?.textContent?.trim() ?? '';
            showTreeEditModal(pathStr ?? '', label);
        });
    });
}

let highlightedPath = null;
function setTreeHighlight(pathStr) {
    if (highlightedPath === pathStr) return;
    highlightedPath = pathStr;
    // 2D: add/remove highlight class
    document.querySelectorAll('.svg-highlightable').forEach(el => {
        const hl = el.getAttribute('data-highlight');
        const match = pathStr && (hl === pathStr || hl.startsWith(pathStr + '.'));
        el.classList.toggle('svg-highlighted', !!match);
    });
    // 3D: update mesh materials
    if (scene3d && scene3d.userData?.meshesByPath) {
        const map = scene3d.userData.meshesByPath;
        for (const [path, meshes] of Object.entries(map)) {
            const match = pathStr && (path === pathStr || path.startsWith(pathStr + '.'));
            const emissive = match ? 0x444444 : 0;
            for (const m of meshes) {
                if (m.material?.emissive) m.material.emissive.setHex(emissive);
            }
        }
    }
}

function buildHierarchyHtml(node, depth, isLast, parentHasMore) {
    const hasData = node.data && (typeof node.data === 'object' ? Object.keys(node.data).length > 0 : true);
    const popupData = hasData ? formatDataForPopup(node.data) : '';
    const pathStr = (node.path ?? []).join('.');
    const dataAttr = popupData
        ? ` data-hasdata="1" data-popup="${escapeHtml(popupData).replace(/"/g, '&quot;')}" data-path="${escapeHtml(pathStr)}"`
        : '';
    const typeClass = depth === 0 ? 'tree-root-item' : (node.children?.length ? 'tree-branch' : 'tree-leaf');
    const iconSvg = depth === 0
        ? '<svg viewBox="0 0 16 16" class="tree-icon-svg"><path fill="currentColor" d="M8 2L2 6v6h4v-4h4v4h4V6L8 2z"/></svg>'
        : (node.children?.length
            ? '<svg viewBox="0 0 16 16" class="tree-icon-svg"><rect x="2" y="3" width="12" height="3" rx="0.5" fill="currentColor"/><rect x="2" y="7" width="12" height="3" rx="0.5" fill="currentColor"/><rect x="2" y="11" width="8" height="2" rx="0.5" fill="currentColor"/></svg>'
            : '<svg viewBox="0 0 16 16" class="tree-icon-svg"><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg>');
    let html = `<div class="tree-item ${typeClass}"${dataAttr}>
        <div class="tree-row">
            <div class="tree-connectors">${parentHasMore ? '<span class="tree-vline"></span>' : ''}<span class="tree-hline"></span></div>
            <span class="tree-icon" aria-hidden="true">${iconSvg}</span>
            <span class="tree-label">${escapeHtml(node.label)}</span>
        </div>`;
    const kids = node.children ?? [];
    if (kids.length) {
        html += '<div class="tree-children">';
        kids.forEach((c, i) => {
            const hasMoreBelow = i < kids.length - 1;
            html += buildHierarchyHtml(c, depth + 1, !hasMoreBelow, hasMoreBelow);
        });
        html += '</div>';
    }
    return html + '</div>';
}

let treePopupEl = null;
function showTreePopup(node, content, pathStr) {
    hideTreePopup();
    treePopupEl = document.createElement('div');
    treePopupEl.className = 'tree-popup';
    treePopupEl.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
    const rect = node.getBoundingClientRect();
    document.body.appendChild(treePopupEl);
    treePopupEl.style.left = `${Math.min(rect.right + 8, window.innerWidth - 320)}px`;
    treePopupEl.style.top = `${rect.top}px`;
    treePopupEl.addEventListener('mouseenter', () => clearTimeout(treePopupTimeout));
    treePopupEl.addEventListener('mouseleave', () => {
        treePopupTimeout = setTimeout(() => { setTreeHighlight(null); hideTreePopup(); }, 300);
    });
}

function showTreeEditModal(pathStr, label = '') {
    if (!plan) return;
    const data = pathStr ? getDataByPath(plan, pathStr) : plan;
    if (data === undefined) return;
    const jsonStr = JSON.stringify(data, null, 2);
    let modal = document.getElementById('editModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3 id="editModalTitle">Endre element</h3>
                <textarea id="editModalTextarea" rows="12" class="tree-popup-textarea"></textarea>
                <div class="modal-actions">
                    <button type="button" id="editModalSave">Lagre</button>
                    <button type="button" id="editModalCancel">Avbryt</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('editModalSave').onclick = () => {
            const currentPath = modal.getAttribute('data-edit-path') ?? '';
            try {
                const parsed = JSON.parse(document.getElementById('editModalTextarea').value);
                applyTreeEdit(plan, parsed, currentPath);
                updateUI();
            } catch (_) {}
            modal.hidden = true;
        };
        document.getElementById('editModalCancel').onclick = () => { modal.hidden = true; };
    }
    modal.setAttribute('data-edit-path', pathStr ?? '');
    document.getElementById('editModalTitle').textContent = label ? `Endre: ${label}` : 'Endre element';
    document.getElementById('editModalTextarea').value = jsonStr;
    modal.hidden = false;
}
let treePopupTimeout = 0;

function getDataByPath(plan, pathStr) {
    if (!plan) return null;
    if (!pathStr) return plan;
    let cur = plan;
    for (const p of pathStr.split('.')) {
        cur = cur?.[p];
    }
    return cur;
}

function applyTreeEdit(plan, newData, pathStr) {
    if (!pathStr) {
        if (newData && typeof newData === 'object') {
            for (const k of Object.keys(plan)) delete plan[k];
            Object.assign(plan, newData);
        }
        return;
    }
    const parts = pathStr.split('.');
    let cur = plan;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        cur = cur[key];
        if (!cur) return;
    }
    const last = parts[parts.length - 1];
    const num = Number(last);
    if (!isNaN(num) && Array.isArray(cur)) {
        cur[num] = newData;
    } else if (cur && typeof cur === 'object') {
        cur[last] = newData;
    }
}

function hideTreePopup() {
    if (treePopupEl?.parentNode) treePopupEl.parentNode.removeChild(treePopupEl);
    treePopupEl = null;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Export ---
function downloadJson(plan) {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'building-plan.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

// --- UI ---
function updateUI() {
    const jsonTree = document.getElementById('jsonTree');
    const errList = document.getElementById('validationErrors');
    const floorSelect = document.getElementById('floorDropdown');
    const svgContainer = document.getElementById('svgContainer');
    const render3dBtn = document.getElementById('render3dBtn');
    if (!jsonTree || !svgContainer) return;

    if (!plan) {
        renderJsonTree(jsonTree, null);
        errList.innerHTML = '';
        floorSelect.innerHTML = '';
        svgContainer.innerHTML = '';
        clearScene();
        const canvas = document.getElementById('canvas3d');
        if (canvas) canvas.style.display = 'block';
        const v1Msg = document.querySelector('[data-v1-msg]');
        if (v1Msg) v1Msg.remove();
        if (render3dBtn) render3dBtn.disabled = true;
        return;
    }

    renderJsonTree(jsonTree, plan);
    const errs = validatePlan(plan);
    errList.innerHTML = errs.map(e => `<li>${e}</li>`).join('');

    const floors = getFloorList(plan);
    floorSelect.innerHTML = floors.map(f => `<option value="${f.id}">${f.name ?? f.id}</option>`).join('');
    if (!selectedFloorId && floors.length) selectedFloorId = floors[0].id;
    floorSelect.value = selectedFloorId ?? '';

    const active = getActivePlanRoot(plan, selectedFloorId);
    const floorIndex = getFloorList(plan).findIndex(f => f.id === selectedFloorId);
    render2D(svgContainer, active, plan, floorIndex >= 0 ? floorIndex : 0);

    if (render3dBtn) render3dBtn.disabled = false;
    clearScene();
    const canvas = document.getElementById('canvas3d');
    if (canvas) canvas.style.display = 'block';
    const v1Msg = document.querySelector('[data-v1-msg]');
    if (v1Msg) v1Msg.remove();
    // 3D rendres kun ved knappetrykk (Render 3D)
}

async function loadSample(v = 'v0.3') {
    if (!v) return;
    try {
        const url = `${BASE}/api/sample?v=${encodeURIComponent(v)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.error) {
            alert(data.error);
            return;
        }
        if (Array.isArray(data) || (data && typeof data === 'object')) {
            plan = data;
            selectedFloorId = plan?.floors?.[0]?.id ?? null;
            if (!selectedFloorId) {
                const floors = getFloorList(plan);
                if (floors.length) selectedFloorId = floors[0].id ?? floors[0].name ?? 'f0';
            }
            updateUI();
        } else {
            alert('Kunne ikke laste sample');
        }
    } catch (err) {
        console.error('loadSample:', err);
        alert('Kunne ikke laste sample: ' + (err?.message || 'nettverksfeil'));
    }
}

async function generatePlan() {
    const modal = document.getElementById('generateModal');
    const textarea = document.getElementById('promptInput');
    modal.hidden = false;
    textarea.value = '';
    textarea.focus();

    document.getElementById('generateSubmit').onclick = async () => {
        const prompt = textarea.value.trim();
        if (!prompt) return;
        modal.hidden = true;
        const res = await fetch(`${BASE}/api/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });
        const data = await res.json();
        if (data.plan) {
            plan = data.plan;
            selectedFloorId = plan?.floors?.[0]?.id ?? null;
            updateUI();
        } else {
            alert(data?.error ?? 'Generering feilet');
        }
    };
    document.getElementById('generateCancel').onclick = () => { modal.hidden = true; };
}

function setup() {
    const fileInput = document.getElementById('fileInput');
    const loadSampleDropdown = document.getElementById('loadSampleDropdown');
    const generateBtn = document.getElementById('generatePlan');
    const downloadBtn = document.getElementById('downloadJson');
    const exportSvgBtn = document.getElementById('exportSvg');
    const floorSelect = document.getElementById('floorDropdown');
    const svgContainer = document.getElementById('svgContainer');

    fileInput?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            plan = parseJson(r.result);
            selectedFloorId = plan?.floors?.[0]?.id ?? null;
            updateUI();
        };
        r.readAsText(f);
    });

    document.body.addEventListener('dragover', e => { e.preventDefault(); });
    document.body.addEventListener('drop', e => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (!f?.name?.endsWith('.json')) return;
        const r = new FileReader();
        r.onload = () => {
            plan = parseJson(r.result);
            selectedFloorId = plan?.floors?.[0]?.id ?? null;
            updateUI();
        };
        r.readAsText(f);
    });

    loadSampleDropdown?.addEventListener('change', async (e) => {
        const v = e.target.value;
        if (v) {
            await loadSample(v);
            e.target.value = '';
        }
    });
    generateBtn?.addEventListener('click', generatePlan);
    document.getElementById('render3dBtn')?.addEventListener('click', () => {
        if (!plan) return;
        const allRoots = getAllFloorRoots(plan);
        rebuild3D(allRoots, plan.roof ?? null, plan);
    });
    downloadBtn?.addEventListener('click', () => downloadJson(plan));
    exportSvgBtn?.addEventListener('click', () => exportSvg(svgContainer));
    floorSelect?.addEventListener('change', () => {
        selectedFloorId = floorSelect.value;
        updateUI();
    });

    init3D();
    updateUI();
}

setup();
