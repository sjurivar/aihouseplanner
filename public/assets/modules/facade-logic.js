/**
 * Fasade-beregninger med eksplisitt logging.
 * Samme tenkemåte som render2d elevasjon, men returnerer også logglinjer for visning i eget vindu.
 * Støtter både én etasje og full bygning (alle etasjer + tak).
 */

import { getFloorList } from './parse.js';
import { computeRoofGeometry, getRiseMmFromGeometry } from './roof-geometry.js';

const ELEVATION_TO_WALL = { nord: 'front', sor: 'back', ost: 'right', vest: 'left' };
const WALL_LABELS = { nord: 'Nord (sørfasade)', sor: 'Sør (nordfasade)', ost: 'Øst (vestfasade)', vest: 'Vest (østfasade)' };

function getFacadeDimensions(fp, wallName) {
    const w = Number(fp?.width) ?? 8000;
    const d = Number(fp?.depth) ?? 8000;
    if (wallName === 'front' || wallName === 'back') return { width: w, depth: d };
    return { width: d, depth: w };
}

/**
 * Beregn én fasade (enkeltbygning) og returner SVG + logglinjer.
 * @param {object} activeRoot - getActivePlanRoot(plan, floorId)
 * @param {string} direction - 'nord' | 'sor' | 'ost' | 'vest'
 * @param {object} plan - hele plan-objektet
 * @param {{ scale?: number, pad?: number }} options
 * @returns {{ svgHtml: string, logLines: string[] }}
 */
export function computeFacadeWithLog(activeRoot, direction, plan, options = {}) {
    const scale = options.scale ?? 0.12;
    const pad = options.pad ?? 40;
    const logLines = [];

    const mode = String(direction || '').toLowerCase().trim();
    const wallName = ELEVATION_TO_WALL[mode];
    if (!wallName) {
        logLines.push(`Ugyldig retning: "${direction}"`);
        return { svgHtml: '', logLines };
    }

    logLines.push('——— Fasadeberegning ———');
    logLines.push(`Retning: ${mode} → vegg: ${wallName}`);
    logLines.push(`Visningsnavn: ${WALL_LABELS[mode] || mode}`);
    logLines.push('');

    const fp = activeRoot.footprint ?? {};
    const dims = getFacadeDimensions(fp, wallName);
    const facadeW = dims.width;
    const facadeD = dims.depth;
    logLines.push('Footprint (fra plan):');
    logLines.push(`  width = ${fp?.width ?? '—'} mm, depth = ${fp?.depth ?? '—'} mm`);
    logLines.push(`Fasade for "${wallName}": bredde = ${facadeW} mm (${wallName === 'front' || wallName === 'back' ? 'footprint.width' : 'footprint.depth'})`);
    logLines.push('');

    const defWall = activeRoot.defaults?.wall ?? plan?.defaults?.wall;
    const wallH = Number(
        activeRoot.wall?.height_mm ?? activeRoot.wall?.height
        ?? defWall?.height_mm ?? defWall?.height ?? 2700
    ) || 2700;
    logLines.push('Vegghøyde:');
    logLines.push(`  activeRoot.wall: height_mm=${activeRoot.wall?.height_mm ?? '—'}, height=${activeRoot.wall?.height ?? '—'}`);
    logLines.push(`  defaults.wall:  height_mm=${defWall?.height_mm ?? '—'}, height=${defWall?.height ?? '—'}`);
    logLines.push(`  → bruker: ${wallH} mm`);
    logLines.push('');

    const openings = (activeRoot.openings ?? []).filter(o => o.wall === wallName);
    logLines.push(`Åpninger på vegg "${wallName}": ${openings.length} stk`);
    openings.forEach((o, i) => {
        logLines.push(`  [${i + 1}] ${o.type ?? 'åpning'}: offset=${o.offset ?? 0} mm, width=${o.width ?? '—'}, height=${o.height ?? '—'} mm, sill=${o.sill ?? 0} mm`);
    });
    logLines.push('');

    const vw = Math.max(facadeW * scale + pad * 2, 100);
    const vh = Math.max(wallH * scale + pad * 2, 80);
    const ox = pad;
    const oy = pad;
    const rectW = Math.max(1, facadeW * scale);
    const rectH = Math.max(1, wallH * scale);

    logLines.push('SVG-parametre:');
    logLines.push(`  scale = ${scale}, pad = ${pad} px`);
    logLines.push(`  viewBox: 0 0 ${vw} ${vh}`);
    logLines.push(`  Veggrektangel (px): x=${ox}, y=${oy}, width=${rectW.toFixed(1)}, height=${rectH.toFixed(1)}`);
    logLines.push('');

    const parts = [];
    parts.push(`<rect x="${ox}" y="${oy}" width="${rectW}" height="${rectH}" fill="#c4b8a8" stroke="#333" stroke-width="1"/>`);
    openings.forEach((o, i) => {
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
        logLines.push(`  Åpning [${i + 1}] → SVG rect: x=${rx.toFixed(1)}, y=${ry.toFixed(1)}, w=${rw.toFixed(1)}, h=${rh.toFixed(1)} (yFromTop=${yFromTop} mm → ${ry.toFixed(1)} px)`);
    });
    logLines.push('');

    const label = WALL_LABELS[mode] || mode;
    parts.push(`<text x="${ox + rectW / 2}" y="${oy - 8}" text-anchor="middle" font-size="11" fill="#666">${label}</text>`);
    parts.push(`<text x="${ox + rectW / 2}" y="${oy + rectH + 20}" text-anchor="middle" font-size="10" fill="#666">${Math.round(facadeW)} × ${Math.round(wallH)} mm</text>`);

    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"><defs></defs>${parts.join('')}</svg>`;
    logLines.push('Ferdig. SVG generert.');
    return { svgHtml, logLines };
}

/**
 * Beregn roof rise (mm) for langside-fasade. Bruker felles roof-geometry (samme som 3D).
 */
export function getRoofRiseMm(roof, direction, widthMm, depthMm) {
    const geom = computeRoofGeometry(roof, widthMm, depthMm);
    return getRiseMmFromGeometry(geom, direction);
}

/** True når vi ser takflaten (langsiden), false når vi ser gavl (tverr på mønet). */
export function isViewingSlope(ridgeDir, direction) {
    const r = (ridgeDir ?? 'x').toLowerCase();
    const d = (direction ?? '').toLowerCase();
    return (r === 'x' && (d === 'nord' || d === 'sor')) || (r === 'y' && (d === 'ost' || d === 'vest'));
}

/**
 * Rise (mm) for gavlvisning slik at den synlige takvinkelen = pitch_degrees.
 * Trekantens halvbredde i tegningen = (fasadebredde + 2*utstikk)/2 → rise = halvbredde * tan(pitch).
 */
export function getRoofRiseGableMm(roof, facadeWidthMm) {
    if (!roof || roof.type !== 'gable') return 0;
    const pitchRad = ((roof.pitch_degrees ?? 35) * Math.PI) / 180;
    const overhang = Number(roof.overhang_mm ?? 500) || 500;
    const halfRunMm = (Number(facadeWidthMm) || 8000) / 2 + overhang;
    return Math.max(0, halfRunMm * Math.tan(pitchRad));
}

/**
 * Full fasade: alle etasjer stables vertikalt + tak på toppen.
 * Kun for enkeltbygning (plan.floors), ikke blocks.
 * @param {object} plan - normalisert 1.x plan med floors[] og valgfritt roof
 * @param {string} direction - 'nord' | 'sor' | 'ost' | 'vest'
 * @param {{ scale?: number, pad?: number }} options
 * @returns {{ svgHtml: string, logLines: string[] }}
 */
export function computeFullFacadeWithLog(plan, direction, options = {}) {
    const scale = options.scale ?? 0.12;
    const pad = options.pad ?? 40;
    const logLines = [];

    const mode = String(direction || '').toLowerCase().trim();
    const wallName = ELEVATION_TO_WALL[mode];
    if (!wallName) {
        logLines.push(`Ugyldig retning: "${direction}"`);
        return { svgHtml: '', logLines };
    }

    const floors = getFloorList(plan);
    if (!floors?.length) {
        logLines.push('Ingen etasjer i planen.');
        return { svgHtml: '', logLines };
    }
    if (plan.blocks?.length) {
        logLines.push('Full fasade med alle etasjer støttes kun for enkeltbygning. Bruk hovedvinduets 2×2-fasader for vinkelhus.');
        return { svgHtml: '', logLines };
    }

    const sortedFloors = [...floors].sort((a, b) => (Number(a.elevation_mm) ?? 0) - (Number(b.elevation_mm) ?? 0));
    const defWall = plan?.defaults?.wall ?? {};
    const fp = sortedFloors[0].footprint ?? {};
    const dims = getFacadeDimensions(fp, wallName);
    const facadeW = dims.width;
    const facadeD = dims.depth;

    logLines.push('——— Full fasade (alle etasjer + tak) ———');
    logLines.push(`Retning: ${mode} → vegg: ${wallName}`);
    logLines.push(`Footprint: bredde ${facadeW} mm, dybde ${facadeD} mm`);
    logLines.push(`Antall etasjer: ${sortedFloors.length}`);
    logLines.push('');

    let totalHeightMm = 0;
    const floorData = sortedFloors.map((f) => {
        const wallH = Number(
            f.wall?.height_mm ?? f.wall?.height ?? defWall?.height_mm ?? defWall?.height ?? 2700
        ) || 2700;
        const elev = Number(f.elevation_mm) ?? 0;
        const topY = elev + wallH;
        totalHeightMm = Math.max(totalHeightMm, topY);
        return {
            floor: f,
            wallH,
            elev,
            topY,
            openings: (f.openings ?? []).filter((o) => o.wall === wallName),
        };
    });

    logLines.push('Etasjer (sortert etter elevation_mm):');
    floorData.forEach((fd, i) => {
        logLines.push(`  [${i + 1}] ${fd.floor.name ?? fd.floor.id}: elevation=${fd.elev} mm, vegghøyde=${fd.wallH} mm, topp=${fd.topY} mm, åpninger=${fd.openings.length}`);
    });
    logLines.push(`  → Bygningens topp (uten tak): ${totalHeightMm} mm`);
    logLines.push('');

    const roof = plan.roof;
    const ridgeDir = roof?.type === 'gable' ? (roof.ridge_direction ?? 'x').toLowerCase() : 'x';
    const viewingSlope = roof?.type === 'gable' && isViewingSlope(ridgeDir, mode);
    let roofRiseMm = 0;
    if (roof?.type === 'gable') {
        roofRiseMm = viewingSlope
            ? getRoofRiseMm(roof, mode, facadeW, facadeD)
            : getRoofRiseGableMm(roof, facadeW);
        logLines.push('Tak (gable):');
        logLines.push(`  pitch_degrees=${roof.pitch_degrees ?? 35}, ridge_direction=${roof.ridge_direction ?? 'x'}, ridge_offset_mm=${roof.ridge_offset_mm ?? 0}`);
        logLines.push(`  ${viewingSlope ? 'Langside' : 'Gavl'} → rise ${Math.round(roofRiseMm)} mm (${viewingSlope ? '3D-rise' : 'takvinkel korrekt i tegning'})`);
        logLines.push('');
    }

    const totalHeightWithRoof = totalHeightMm + roofRiseMm;
    const overhangMm = Number(roof?.overhang_mm ?? 500) || 500;
    const roofWidthMm = facadeW + 2 * overhangMm;

    const vw = Math.max(facadeW * scale + pad * 2, 100);
    const vh = Math.max(totalHeightWithRoof * scale + pad * 2, 80);
    const ox = pad;
    let currentY = pad;

    const parts = [];
    const rectW = Math.max(1, facadeW * scale);

    if (roofRiseMm > 0) {
        const roofH = roofRiseMm * scale;
        const roofW = Math.max(1, roofWidthMm * scale);
        const roofX = ox - overhangMm * scale;

        if (viewingSlope) {
            parts.push(
                `<rect x="${roofX}" y="${currentY}" width="${roofW}" height="${roofH}" fill="#6b4423" stroke="#333" stroke-width="1"/>`
            );
        } else {
            const ridgeOffset = Number(roof?.ridge_offset_mm ?? 0) || 0;
            const ridgeCenterX = ridgeOffset === 0
                ? ox + rectW / 2
                : ox + (facadeW / 2 + (mode === 'vest' || mode === 'sor' ? -ridgeOffset : ridgeOffset)) * scale;
            parts.push(
                `<polygon points="${roofX},${currentY + roofH} ${roofX + roofW},${currentY + roofH} ${ridgeCenterX},${currentY}" fill="#6b4423" stroke="#333" stroke-width="1"/>`
            );
        }
        logLines.push(`Tak: ${viewingSlope ? 'langside (rektangel)' : 'gavl (trekant)'}, SVG y=${currentY.toFixed(1)}–${(currentY + roofH).toFixed(1)}, høyde ${Math.round(roofRiseMm)} mm`);
        currentY += roofH;
    }

    for (let i = floorData.length - 1; i >= 0; i--) {
        const fd = floorData[i];
        const rectH = Math.max(1, fd.wallH * scale);
        parts.push(
            `<rect x="${ox}" y="${currentY}" width="${rectW}" height="${rectH}" fill="#c4b8a8" stroke="#333" stroke-width="1"/>`
        );
        fd.openings.forEach((o) => {
            const offset = Number(o.offset) ?? 0;
            const ow = Number(o.width) ?? 900;
            const oh = Number(o.height) ?? 2100;
            const sill = Number(o.sill ?? 0);
            const yFromTop = fd.wallH - sill - oh;
            const rx = ox + offset * scale;
            const ry = currentY + Math.max(0, yFromTop * scale);
            const rw = ow * scale;
            const rh = Math.min(oh * scale, fd.wallH * scale - ry + currentY);
            const fill = o.type === 'window' ? '#87ceeb' : '#f5f5dc';
            parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="#555"/>`);
        });
        logLines.push(`Etasje ${fd.floor.name ?? fd.floor.id}: y=${currentY.toFixed(1)}, h=${rectH.toFixed(1)} px (${fd.wallH} mm)`);
        currentY += rectH;
    }

    const label = WALL_LABELS[mode] || mode;
    parts.push(`<text x="${ox + rectW / 2}" y="${pad - 8}" text-anchor="middle" font-size="11" fill="#666">${label}</text>`);
    parts.push(
        `<text x="${ox + rectW / 2}" y="${currentY + 20}" text-anchor="middle" font-size="10" fill="#666">${Math.round(facadeW)} × ${Math.round(totalHeightWithRoof)} mm</text>`
    );

    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"><defs></defs>${parts.join('')}</svg>`;
    logLines.push('');
    logLines.push('Ferdig. Full fasade (alle etasjer + tak) generert.');
    return { svgHtml, logLines };
}

/**
 * Sjekk om activeRoot har gyldig data for fasade (enkeltbygning).
 */
export function canShowFacade(activeRoot) {
    if (!activeRoot) return false;
    if (activeRoot.isBlocks && activeRoot.blocks?.length) return true;
    const fp = activeRoot.footprint ?? {};
    return !!(Number(fp?.width) || Number(fp?.depth));
}
