/**
 * 2D SVG rendering
 */

import { isV1, isV05 } from './parse.js';
import { getRoofRiseMm, getRoofRiseGableMm, isViewingSlope } from './facade-logic.js';

/** Normalize polygon point: {x,y} or [x,y] -> [x,y] */
function toCoords(p) {
    if (p == null) return [0, 0];
    if (Array.isArray(p)) return [Number(p[0]) ?? 0, Number(p[1]) ?? 0];
    return [Number(p.x) ?? 0, Number(p.y) ?? 0];
}

/** Normalize polygon to [[x,y],...] for v0.5 {x,y} or v1 [x,y] */
export function polygonToCoords(polygon) {
    if (!polygon?.length) return [];
    return polygon.map(p => toCoords(p));
}

/** Calculate polygon centroid */
export function polygonCentroid(polygon) {
    const pts = polygonToCoords(polygon);
    if (!pts.length) return [0, 0];
    let sumX = 0, sumY = 0;
    for (const [x, y] of pts) {
        sumX += x;
        sumY += y;
    }
    return [sumX / pts.length, sumY / pts.length];
}

/** Point on path at distance d from start */
export function pointOnPath(path, d) {
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
export function pathLengthMm(path) {
    if (!path || path.length < 2) return 0;
    let len = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const [x1, y1] = path[i].map(Number);
        const [x2, y2] = path[i + 1].map(Number);
        len += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    return len;
}

/** Wall segment to SVG path (x,y in mm; t in mm; scale and pad for SVG coords). */
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

/** Wall segment path when coordinates are already in SVG space (e.g. block-local + offset). */
function wallSegmentToPathSvg(x1Svg, y1Svg, x2Svg, y2Svg, tSvg) {
    const dx = x2Svg - x1Svg;
    const dy = y2Svg - y1Svg;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const h = tSvg / 2;
    return `M ${x1Svg + nx * h} ${y1Svg + ny * h} L ${x2Svg + nx * h} ${y2Svg + ny * h} L ${x2Svg - nx * h} ${y2Svg - ny * h} L ${x1Svg - nx * h} ${y1Svg - ny * h} Z`;
}

function getMaterialColor(plan, materialId) {
    const mat = plan?.materialLibrary?.find(m => m.id === materialId);
    return mat?.color ?? '#a0a0a0';
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

const SVG_DEFS = `<defs>
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

/** v1: 2D rooms + walls with correct thickness */
function render2Dv1(svgEl, activeRoot, plan, floorIndex = 0, scale = 0.05, pad = 40, showRidgeLine = false) {
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
    // Room polygons first (background) — floor_finish
    let ri = 0;
    for (const room of activeRoot.rooms ?? []) {
        const poly = room.polygon ?? [];
        if (poly.length < 3) { ri++; continue; }
        const pathD = 'M ' + poly.map(([x, y]) => `${pad + x * scale} ${pad + y * scale}`).join(' L ') + ' Z';
        const hl = `${pathPrefix}.rooms.${ri}`;
        const style = getFloorFinishStyle(room.floor_finish);
        const fill = style.pattern ?? style.fill;
        parts.push(`<path class="svg-highlightable svg-draggable" data-drag-type="room" data-highlight="${hl}" data-room-index="${ri}" fill="${fill}" stroke="#999" stroke-width="0.5" d="${pathD}"/>`);
        ri++;
    }

    // Exterior wall band on top
    parts.push(`<path class="svg-highlightable" data-highlight="${pathPrefix}" fill="#a0a0a0" stroke="#333" stroke-width="1" fill-rule="evenodd" d="${outer} ${inner}"/>`);

    // Interior walls on top (path-based, thickness + openings)
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

    // Room labels
    for (const room of activeRoot.rooms ?? []) {
        const poly = room.polygon ?? [];
        if (poly.length < 3) continue;
        const [cx, cy] = polygonCentroid(poly);
        const [sx, sy] = toSvg(cx, cy);
        parts.push(`<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#333">${room.name ?? room.id ?? ''}</text>`);
    }

    // Stairs
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

    if (showRidgeLine && plan.roof) parts.push(ridgeLineSvg(pad, pad, w, d, plan.roof, scale));

    const dims = [
        `<line x1="${pad}" y1="${pad - 15}" x2="${pad + w * scale}" y2="${pad - 15}" stroke="#666"/>`,
        `<text x="${pad + w * scale / 2}" y="${pad - 5}" text-anchor="middle" font-size="10" fill="#666">${w}mm</text>`,
        `<line x1="${pad - 15}" y1="${pad}" x2="${pad - 15}" y2="${pad + d * scale}" stroke="#666"/>`,
        `<text x="${pad - 8}" y="${pad + d * scale / 2}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90 ${pad - 8} ${pad + d * scale / 2})">${d}mm</text>`,
    ];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" data-plan-view="v1" data-scale="${scale}" data-pad="${pad}" data-min-x="0" data-min-y="0">${SVG_DEFS}${dims.join('')}${parts.join('')}</svg>`;
    svgEl.innerHTML = svg;
}

/** v0.5: 2D rooms + derived walls + voids + stairs */
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

    const def = activeRoot.defaults?.wallRules?.interior ?? {};
    const tw = Number(activeRoot.wall?.thickness ?? def?.thickness ?? 98) || 98;

    const parts = [];
    const pathPrefix = `levels.${floorIndex}`;

    // Voids (stair openings) first
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
        const sx = pad + (cx - minX) * scale;
        const sy = pad + (cy - minY) * scale;
        parts.push(`<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#333">${room.name ?? room.id ?? ''}</text>`);
    }

    // Stairs
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

    svgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${SVG_DEFS}${dims.join('')}${parts.join('')}</svg>`;
}

/** Direction (dropdown value) to wall name: elevasjon "nord" = vi ser fra nord = sørfasade = front */
const ELEVATION_TO_WALL = { nord: 'front', sor: 'back', ost: 'right', vest: 'left' };

/** SVG for mønelinje på plan (stiplet). ox,oy = topp-venstre i px; wMm, dMm = bredde/dybde i mm; ridge_offset_mm. */
function ridgeLineSvg(ox, oy, wMm, dMm, roof, scale) {
    if (!roof || roof.type !== 'gable') return '';
    const ridgeDir = (roof.ridge_direction ?? 'x').toLowerCase();
    const offset = Number(roof.ridge_offset_mm ?? 0) || 0;
    const w = Number(wMm) || 8000;
    const d = Number(dMm) || 8000;
    const dash = 'stroke-dasharray="6,4"';
    if (ridgeDir === 'x') {
        const y = oy + (d / 2 - offset) * scale;
        return `<line x1="${ox}" y1="${y}" x2="${ox + w * scale}" y2="${y}" stroke="#666" stroke-width="1.5" ${dash}/>`;
    }
    const x = ox + (w / 2 + offset) * scale;
    return `<line x1="${x}" y1="${oy}" x2="${x}" y2="${oy + d * scale}" stroke="#666" stroke-width="1.5" ${dash}/>`;
}

/** Wall name to facade width key: front/back use footprint.width, left/right use depth */
function getFacadeDimensions(fp, wallName) {
    const w = Number(fp?.width) ?? 8000;
    const d = Number(fp?.depth) ?? 8000;
    if (wallName === 'front' || wallName === 'back') return { width: w, depth: d };
    return { width: d, depth: w };
}

/** Single-building elevation: one wall with openings */
function render2DElevationSingle(svgEl, activeRoot, direction, plan, scale = 0.12, pad = 40) {
    const fp = activeRoot.footprint ?? {};
    const wallName = ELEVATION_TO_WALL[direction];
    if (!wallName) {
        svgEl.innerHTML = '<p class="svg-placeholder">—</p>';
        return;
    }
    const dims = getFacadeDimensions(fp, wallName);
    const facadeW = dims.width;
    const defWall = activeRoot.defaults?.wall ?? plan?.defaults?.wall;
    const wallH = Number(
        activeRoot.wall?.height_mm ?? activeRoot.wall?.height
        ?? defWall?.height_mm ?? defWall?.height ?? 2700
    ) || 2700;
    const openings = (activeRoot.openings ?? []).filter(o => o.wall === wallName);

    const vw = Math.max(facadeW * scale + pad * 2, 100);
    const vh = Math.max(wallH * scale + pad * 2, 80);
    const ox = pad;
    const oy = pad;
    const rectW = Math.max(1, facadeW * scale);
    const rectH = Math.max(1, wallH * scale);

    const parts = [];
    parts.push(`<rect x="${ox}" y="${oy}" width="${rectW}" height="${rectH}" fill="#c4b8a8" stroke="#333" stroke-width="1"/>`);
    for (const o of openings) {
        const offset = Number(o.offset) ?? 0;
        const ow = Number(o.width) ?? 900;
        const oh = Number(o.height) ?? 2100;
        const sill = Number(o.sill ?? 0);
        const yFromTop = wallH - sill - oh;
        const rx = ox + offset * scale;
        const ry = oy + Math.max(0, yFromTop * scale);
        const rw = ow * scale;
        const rh = Math.min(oh * scale, wallH * scale - ry + oy);
        const fill = (o.type === 'window') ? '#87ceeb' : '#f5f5dc';
        parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="#555"/>`);
    }
    const label = { nord: 'Nord (sørfasade)', sor: 'Sør (nordfasade)', ost: 'Øst (vestfasade)', vest: 'Vest (østfasade)' }[direction] || direction;
    parts.push(`<text x="${ox + rectW / 2}" y="${oy - 8}" text-anchor="middle" font-size="11" fill="#666">${label}</text>`);
    parts.push(`<text x="${ox + rectW / 2}" y="${oy + rectH + 20}" text-anchor="middle" font-size="10" fill="#666">${Math.round(facadeW)} × ${Math.round(wallH)} mm</text>`);
    svgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${SVG_DEFS}${parts.join('')}</svg>`;
}

/** Multi-block elevation: one or more facades with roof per block (L, T, H houses) */
function render2DElevationBlocks(svgEl, activeRoot, direction, scale = 0.12, pad = 40) {
    const blocks = activeRoot.blocks ?? [];
    if (!blocks.length) {
        svgEl.innerHTML = '<p class="svg-placeholder">Ingen blokker å vise.</p>';
        return;
    }
    const wallName = ELEVATION_TO_WALL[direction];
    if (!wallName) {
        svgEl.innerHTML = '<p class="svg-placeholder">—</p>';
        return;
    }
    let minX = Infinity, maxX = -Infinity, maxH = 0;
    const facades = [];
    for (const block of blocks) {
        const pos = block.position ?? { x: 0, z: 0 };
        const fp = block.footprint ?? {};
        const dims = getFacadeDimensions(fp, wallName);
        const wallH = Number(block.wall?.height_mm ?? block.wall?.height ?? 2700) || 2700;
        const openings = (block.openings ?? []).filter(o => o.wall === wallName);
        const x = (wallName === 'front' || wallName === 'back') ? pos.x : pos.z;
        const w = dims.width;
        const roof = block.roof?.type === 'gable' ? block.roof : null;
        const ridgeDir = roof ? (roof.ridge_direction ?? 'x').toLowerCase() : 'x';
        const viewingSlope = roof && isViewingSlope(ridgeDir, direction);
        const roofRiseMm = roof
            ? (viewingSlope ? getRoofRiseMm(roof, direction, Number(fp.width) || 8000, Number(fp.depth) || 8000) : getRoofRiseGableMm(roof, w))
            : 0;
        facades.push({ x, w, wallH, openings, roof, roofRiseMm, dims, fp });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + w);
        maxH = Math.max(maxH, wallH + roofRiseMm);
    }
    const totalW = Math.max(maxX - minX, 1);
    const vw = totalW * scale + pad * 2;
    const vh = Math.max(maxH * scale + pad * 2, 100);

    const groundY = pad + maxH * scale;

    const parts = [];
    for (const fa of facades) {
        const ox = pad + (fa.x - minX) * scale;
        const rectW = Math.max(1, fa.w * scale);
        const wallH = fa.wallH * scale;
        const wallTopY = groundY - wallH;

        parts.push(`<rect x="${ox}" y="${wallTopY}" width="${rectW}" height="${wallH}" fill="#c4b8a8" stroke="#333" stroke-width="1"/>`);
        for (const o of fa.openings) {
            const offset = Number(o.offset) ?? 0;
            const ow = Number(o.width) ?? 900;
            const oh = Number(o.height) ?? 2100;
            const sill = Number(o.sill ?? 0);
            const yFromTop = fa.wallH - sill - oh;
            const rx = ox + offset * scale;
            const ry = wallTopY + Math.max(0, yFromTop * scale);
            const rw = ow * scale;
            const rh = Math.min(oh * scale, wallH - ry + wallTopY);
            const fill = (o.type === 'window') ? '#87ceeb' : '#f5f5dc';
            parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="#555"/>`);
        }

        if (fa.roof && fa.roofRiseMm > 0) {
            const roofH = fa.roofRiseMm * scale;
            const roofTopY = wallTopY - roofH;
            const overhangMm = Number(fa.roof.overhang_mm ?? 500) || 500;
            const roofW = Math.max(1, (fa.w + 2 * overhangMm) * scale);
            const roofX = ox - overhangMm * scale;
            const ridgeDir = (fa.roof.ridge_direction ?? 'x').toLowerCase();
            const viewingSlope = isViewingSlope(ridgeDir, direction);

            if (viewingSlope) {
                parts.push(`<rect x="${roofX}" y="${roofTopY}" width="${roofW}" height="${roofH}" fill="#6b4423" stroke="#333" stroke-width="1"/>`);
            } else {
                const ridgeOffset = Number(fa.roof.ridge_offset_mm ?? 0) || 0;
                const ridgeCenterX = ridgeOffset === 0
                    ? ox + rectW / 2
                    : ox + (fa.w / 2 + (direction === 'vest' || direction === 'sor' ? -ridgeOffset : ridgeOffset)) * scale;
                parts.push(
                    `<polygon points="${roofX},${wallTopY} ${roofX + roofW},${wallTopY} ${ridgeCenterX},${roofTopY}" fill="#6b4423" stroke="#333" stroke-width="1"/>`
                );
            }
        }
    }
    const label = { nord: 'Nord (sørfasade)', sor: 'Sør (nordfasade)', ost: 'Øst (vestfasade)', vest: 'Vest (østfasade)' }[direction] || direction;
    parts.push(`<text x="${pad + totalW * scale / 2}" y="${pad - 8}" text-anchor="middle" font-size="11" fill="#666">${label}</text>`);
    parts.push(`<text x="${pad + totalW * scale / 2}" y="${groundY + 20}" text-anchor="middle" font-size="10" fill="#666">${Math.round(totalW)} × ${Math.round(maxH)} mm</text>`);
    svgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${SVG_DEFS}${parts.join('')}</svg>`;
}

/** v0/v0.3: footprint + walls + openings */
function render2Dv0(svgEl, activeRoot, plan, floorIndex, scale = 0.05, pad = 40, showRidgeLine = false) {
    const fp = activeRoot.footprint;
    const w = Number(fp.width) ?? 8000;
    const d = Number(fp.depth) ?? 8000;
    const tw = Number(activeRoot.wall?.thickness ?? activeRoot.wall?.thickness_mm ?? 200) || 200;
    const vw = w * scale + pad * 2;
    const vh = d * scale + pad * 2;

    const wallsLen = { front: w, back: w, left: d, right: d };
    const paths = [];

    const outer = `M ${pad} ${pad} L ${pad + w * scale} ${pad} L ${pad + w * scale} ${pad + d * scale} L ${pad} ${pad + d * scale} Z`;
    const inner = `M ${pad + tw * scale} ${pad + tw * scale} L ${pad + (w - tw) * scale} ${pad + tw * scale} L ${pad + (w - tw) * scale} ${pad + (d - tw) * scale} L ${pad + tw * scale} ${pad + (d - tw) * scale} Z`;

    const pathPrefix = plan.floors ? `floors.${floorIndex}` : '';
    paths.push(`<path class="svg-highlightable" data-highlight="${pathPrefix || 'f0'}" fill="none" stroke="#333" stroke-width="2" d="${outer}"/>`);
    paths.push(`<path class="svg-highlightable" data-highlight="${pathPrefix || 'f0'}" fill="#f5f5f5" stroke="#666" stroke-width="1" d="${inner}"/>`);

    if (showRidgeLine && plan.roof) paths.push(ridgeLineSvg(pad, pad, w, d, plan.roof, scale));

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

/** v0.4: Multi-block rendering (L, T, H houses) — rooms, derived walls, then exterior band */
function render2Dv04(svgEl, activeRoot, plan, floorIndex = 0, scale = 0.05, pad = 40, showRidgeLine = false) {
    const blocks = activeRoot.blocks ?? [];
    if (!blocks.length) return;

    // Find bounding box of all blocks
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const block of blocks) {
        const pos = block.position ?? { x: 0, z: 0 };
        const fp = block.footprint ?? {};
        const bw = fp.width ?? 8000;
        const bd = fp.depth ?? 8000;
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.z);
        maxX = Math.max(maxX, pos.x + bw);
        maxY = Math.max(maxY, pos.z + bd);
    }
    const totalW = maxX - minX;
    const totalD = maxY - minY;
    const vw = totalW * scale + pad * 2;
    const vh = totalD * scale + pad * 2;

    const parts = [];

    // Render each block
    for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        const pos = block.position ?? { x: 0, z: 0 };
        const fp = block.footprint ?? {};
        const bw = fp.width ?? 8000;
        const bd = fp.depth ?? 8000;
        const tw = block.wall?.thickness ?? 200;

        const bx = pad + (pos.x - minX) * scale;
        const by = pad + (pos.z - minY) * scale;
        const sw = bw * scale;
        const sd = bd * scale;
        const twScaled = tw * scale;

        const blockPath = `blocks.${bi}`;

        // Floor fill (background) — draggable block
        parts.push(`<rect class="svg-highlightable svg-draggable" data-drag-type="block" data-highlight="${blockPath}" data-block-index="${bi}" x="${bx}" y="${by}" width="${sw}" height="${sd}" fill="#f5f5dc" stroke="none"/>`);

        // Block outline (exterior wall band) first
        const outerPath = `M ${bx} ${by} h ${sw} v ${sd} h -${sw} Z`;
        const innerPath = `M ${bx + twScaled} ${by + twScaled} v ${sd - 2 * twScaled} h ${sw - 2 * twScaled} v -${sd - 2 * twScaled} Z`;
        parts.push(`<path d="${outerPath} ${innerPath}" fill="#666" fill-rule="evenodd" stroke="none"/>`);

        // Derived interior walls (rooms-first)
        const walls = block.walls ?? [];
        for (let wi = 0; wi < walls.length; wi++) {
            const wall = walls[wi];
            const a = wall.a ?? {};
            const b = wall.b ?? {};
            const x1Svg = bx + (Number(a.x ?? 0)) * scale;
            const y1Svg = by + (Number(a.y ?? 0)) * scale;
            const x2Svg = bx + (Number(b.x ?? 0)) * scale;
            const y2Svg = by + (Number(b.y ?? 0)) * scale;
            const tSvg = (Number(wall.thicknessMm ?? 98)) * scale;
            const fill = getMaterialColor(plan, wall.materialId);
            const dPath = wallSegmentToPathSvg(x1Svg, y1Svg, x2Svg, y2Svg, tSvg);
            parts.push(`<path d="${dPath}" fill="${fill}" stroke="#444" stroke-width="1"/>`);
        }

        // Room polygons and labels on top (tynn linje)
        const rooms = block.rooms ?? [];
        const floorIdx = block.floorIndexInBlock ?? 0;
        for (let ri = 0; ri < rooms.length; ri++) {
            const room = rooms[ri];
            const poly = polygonToCoords(room.polygon ?? []);
            if (poly.length < 3) continue;
            const pts = poly.map(([px, py]) => `${bx + px * scale},${by + py * scale}`).join(' ');
            const style = getFloorFinishStyle(room.floor_finish);
            const pathPrefix = `${blockPath}.floors.${floorIdx}.rooms.${ri}`;
            parts.push(`<polygon class="svg-highlightable svg-draggable" data-drag-type="room" data-highlight="${pathPrefix}" data-block-index="${bi}" data-room-index="${ri}" points="${pts}" fill="${style.fill}" stroke="#999" stroke-width="0.5"/>`);
        }
        for (let ri = 0; ri < rooms.length; ri++) {
            const room = rooms[ri];
            const poly = polygonToCoords(room.polygon ?? []);
            if (poly.length < 3) continue;
            const [cx, cy] = polygonCentroid(poly);
            const sx = bx + cx * scale;
            const sy = by + cy * scale;
            parts.push(`<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#333">${room.name ?? room.id ?? ''}</text>`);
        }

        // Openings
        for (const o of block.openings ?? []) {
            const ox = Number(o.offset) ?? 0;
            const ow = Number(o.width) ?? 900;
            let rect;
            if (o.wall === 'front') rect = { x: bx + ox * scale, y: by, w: ow * scale, h: twScaled };
            else if (o.wall === 'back') rect = { x: bx + ox * scale, y: by + sd - twScaled, w: ow * scale, h: twScaled };
            else if (o.wall === 'left') rect = { x: bx, y: by + ox * scale, w: twScaled, h: ow * scale };
            else rect = { x: bx + sw - twScaled, y: by + ox * scale, w: twScaled, h: ow * scale };
            parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="white" stroke="#999"/>`);
        }

        // Block label
        const cx = bx + sw / 2;
        const cy = by + sd / 2;
        parts.push(`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#333">${block.blockName ?? block.blockId}</text>`);

        if (showRidgeLine && block.roof) parts.push(ridgeLineSvg(bx, by, bw, bd, block.roof, scale));
    }

    // Dimensions
    const dims = [
        `<line x1="${pad}" y1="${pad - 15}" x2="${pad + totalW * scale}" y2="${pad - 15}" stroke="#666"/>`,
        `<text x="${pad + totalW * scale / 2}" y="${pad - 5}" text-anchor="middle" font-size="10" fill="#666">${totalW}mm</text>`,
        `<line x1="${pad - 15}" y1="${pad}" x2="${pad - 15}" y2="${pad + totalD * scale}" stroke="#666"/>`,
        `<text x="${pad - 8}" y="${pad + totalD * scale / 2}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90 ${pad - 8} ${pad + totalD * scale / 2})">${totalD}mm</text>`,
    ];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" data-plan-view="v04" data-scale="${scale}" data-pad="${pad}" data-min-x="${minX}" data-min-y="${minY}">${SVG_DEFS}${dims.join('')}${parts.join('')}</svg>`;
    svgEl.innerHTML = svg;
}

export const ELEVATION_VIEWS = ['nord', 'sor', 'ost', 'vest'];

/** Render only one elevation view (for use in 2×2 elevation panels) */
export function render2DElevationOnly(svgEl, activeRoot, direction, plan) {
    const placeholder = '<p class="svg-placeholder">Last en plan for å vise fasade</p>';
    if (!svgEl) return;
    if (!activeRoot) {
        svgEl.innerHTML = placeholder;
        return;
    }
    const mode = String(direction || '').toLowerCase().trim();
    if (!ELEVATION_VIEWS.includes(mode)) {
        svgEl.innerHTML = placeholder;
        return;
    }
    try {
        if (activeRoot.isBlocks && activeRoot.blocks?.length) {
            render2DElevationBlocks(svgEl, activeRoot, mode, 0.08, 24);
        } else if (activeRoot.footprint && (Number(activeRoot.footprint.width) || Number(activeRoot.footprint.depth))) {
            render2DElevationSingle(svgEl, activeRoot, mode, plan, 0.08, 24);
        } else {
            svgEl.innerHTML = '<p class="svg-placeholder">—</p>';
        }
    } catch (err) {
        console.warn('render2DElevationOnly', direction, err);
        svgEl.innerHTML = '<p class="svg-placeholder">Kunne ikke tegne</p>';
    }
}

export function render2D(svgEl, activeRoot, plan, floorIndex = 0, viewMode = 'plan', showRidgeLine = false) {
    if (!activeRoot) return;

    const mode = String(viewMode || 'plan').toLowerCase().trim();
    const isElevation = mode && ELEVATION_VIEWS.includes(mode);
    if (isElevation) {
        if (activeRoot.isBlocks && activeRoot.blocks?.length) {
            render2DElevationBlocks(svgEl, activeRoot, mode);
        } else if (activeRoot.footprint && (activeRoot.footprint.width || activeRoot.footprint.depth)) {
            render2DElevationSingle(svgEl, activeRoot, mode, plan);
        } else {
            svgEl.innerHTML = '<p class="svg-placeholder">Elevasjonsvisning krever footprint.</p>';
        }
        return;
    }

    // v0.4 blocks (plan)
    if (activeRoot.isBlocks && activeRoot.blocks?.length) {
        render2Dv04(svgEl, activeRoot, plan, floorIndex, 0.05, 40, showRidgeLine);
        return;
    }

    const hasV05 = isV05(plan) && (activeRoot.rooms?.length ?? 0) > 0;
    const hasV1 = isV1(plan) && (activeRoot.rooms?.length ?? 0) > 0;
    const hasFootprint = activeRoot.footprint && (activeRoot.footprint.width || activeRoot.footprint.polygon);
    if (!hasV05 && !hasV1 && !hasFootprint) return;

    if (hasV05) {
        render2Dv05(svgEl, activeRoot, plan, floorIndex);
    } else if (hasV1) {
        render2Dv1(svgEl, activeRoot, plan, floorIndex, 0.05, 40, showRidgeLine);
    } else if (activeRoot.footprint) {
        render2Dv0(svgEl, activeRoot, plan, floorIndex, 0.05, 40, showRidgeLine);
    }
}

export function exportSvg(svgEl) {
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
