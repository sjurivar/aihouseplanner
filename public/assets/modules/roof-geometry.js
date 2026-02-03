/**
 * Felles takgeometri for gable-tak. Brukes av 2D (fasade) og 3D (render3d).
 * Alle lineære mål i mm, vinkler i radianer.
 */

/**
 * Beregn alle takgeometri-verdier for gable-tak. Én kilde til sannhet for 2D og 3D.
 * @param {object} roof - roof-spec med type, pitch_degrees, ridge_direction, ridge_offset_mm, ridge_mode, overhang_mm
 * @param {number} widthMm - byggets bredde (X) i mm
 * @param {number} depthMm - byggets dybde (Z) i mm
 * @returns {object|null} Geometri-objekt eller null ved ugyldig tak
 */
export function computeRoofGeometry(roof, widthMm, depthMm) {
    if (!roof || roof.type !== 'gable') return null;
    const pitchRad = ((roof.pitch_degrees ?? 35) * Math.PI) / 180;
    const overhangMm = Number(roof.overhang_mm ?? 500) || 500;
    const ridgeOffsetMm = Number(roof.ridge_offset_mm ?? 0) || 0;
    const ridgeMode = (roof.ridge_mode ?? 'equal_pitch').toLowerCase();
    const ridgeDir = (roof.ridge_direction ?? 'x').toLowerCase();
    const w = Number(widthMm) || 8000;
    const d = Number(depthMm) || 8000;

    const out = {
        ridgeDir,
        ridgeMode,
        pitchRad,
        overhangMm,
        ridgeOffsetMm,
        wMm: w,
        dMm: d,
    };

    if (ridgeDir === 'x') {
        const ridgeZMm = ridgeOffsetMm;
        const distNorthMm = d / 2 + ridgeZMm;
        const distSouthMm = d / 2 - ridgeZMm;

        let ridgeHeightMm, riseNorthMm, riseSouthMm, pitchNorthRad, pitchSouthRad;
        if (ridgeMode === 'equal_pitch') {
            pitchNorthRad = pitchRad;
            pitchSouthRad = pitchRad;
            const maxDist = Math.max(distNorthMm, distSouthMm);
            ridgeHeightMm = Math.tan(pitchRad) * maxDist;
            riseNorthMm = Math.tan(pitchRad) * distNorthMm;
            riseSouthMm = Math.tan(pitchRad) * distSouthMm;
        } else {
            const ridgeHeightNorth = Math.tan(pitchRad) * distNorthMm;
            const ridgeHeightSouth = Math.tan(pitchRad) * distSouthMm;
            ridgeHeightMm = Math.max(ridgeHeightNorth, ridgeHeightSouth);
            pitchNorthRad = Math.atan(ridgeHeightMm / distNorthMm);
            pitchSouthRad = Math.atan(ridgeHeightMm / distSouthMm);
            riseNorthMm = Math.tan(pitchNorthRad) * distNorthMm;
            riseSouthMm = Math.tan(pitchSouthRad) * distSouthMm;
        }

        Object.assign(out, {
            ridgeHeightMm,
            ridgeZMm,
            distNorthMm,
            distSouthMm,
            riseNorthMm,
            riseSouthMm,
            pitchNorthRad,
            pitchSouthRad,
        });
    } else {
        const ridgeXMm = ridgeOffsetMm;
        const distWestMm = w / 2 + ridgeXMm;
        const distEastMm = w / 2 - ridgeXMm;

        let ridgeHeightMm, riseWestMm, riseEastMm, pitchWestRad, pitchEastRad;
        if (ridgeMode === 'equal_pitch') {
            pitchWestRad = pitchRad;
            pitchEastRad = pitchRad;
            const maxDist = Math.max(distWestMm, distEastMm);
            ridgeHeightMm = Math.tan(pitchRad) * maxDist;
            riseWestMm = Math.tan(pitchRad) * distWestMm;
            riseEastMm = Math.tan(pitchRad) * distEastMm;
        } else {
            const ridgeHeightWest = Math.tan(pitchRad) * distWestMm;
            const ridgeHeightEast = Math.tan(pitchRad) * distEastMm;
            ridgeHeightMm = Math.max(ridgeHeightWest, ridgeHeightEast);
            pitchWestRad = Math.atan(ridgeHeightMm / distWestMm);
            pitchEastRad = Math.atan(ridgeHeightMm / distEastMm);
            riseWestMm = Math.tan(pitchWestRad) * distWestMm;
            riseEastMm = Math.tan(pitchEastRad) * distEastMm;
        }

        Object.assign(out, {
            ridgeHeightMm,
            ridgeXMm,
            distWestMm,
            distEastMm,
            riseWestMm,
            riseEastMm,
            pitchWestRad,
            pitchEastRad,
        });
    }

    return out;
}

/**
 * Rise (mm) for langside-fasade fra felles geometri.
 * Kun for retninger der vi ser takflaten: ridge x → nord/sor, ridge y → ost/vest.
 */
export function getRiseMmFromGeometry(geom, direction) {
    if (!geom) return 0;
    const d = (direction ?? '').toLowerCase();
    if (geom.ridgeDir === 'x') {
        if (d === 'nord') return geom.riseSouthMm ?? 0;
        if (d === 'sor') return geom.riseNorthMm ?? 0;
    } else {
        if (d === 'ost') return geom.riseWestMm ?? 0;
        if (d === 'vest') return geom.riseEastMm ?? 0;
    }
    return 0;
}
