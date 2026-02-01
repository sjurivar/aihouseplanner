/**
 * Client-side validation
 */

import { isV1, getAllFloorRoots } from './parse.js';

export function validatePlan(plan) {
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
    // v1: basic structure validation
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
