/**
 * Drag and drop for 2D plan: blocks and rooms, with snap to grid and other elements.
 */

import { getDataByPath, applyTreeEdit } from './tree.js';
import { regenerateDerivedForLevel } from './derived-walls.js';

const SNAP_GRID_MM = 100;
const SNAP_DISTANCE_MM = 120;

function pathToBlockIndex(path) {
    const m = path && path.match(/^blocks\.(\d+)/);
    return m ? m[1] : '';
}

function svgPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function snapToGrid(mm) {
    return Math.round(mm / SNAP_GRID_MM) * SNAP_GRID_MM;
}

function snapValue(value, targets, maxDist = SNAP_DISTANCE_MM) {
    for (const t of targets) {
        if (Math.abs(value - t) <= maxDist) return t;
    }
    return value;
}

/**
 * Setup drag and drop on the 2D plan SVG container.
 * Call once (e.g. from setupEventHandlers). Uses current SVG in container on each mousedown.
 */
export function setupPlanDragDrop(container, getPlan, updateUI) {
    if (!container) return;

    let drag = null;

    const onMouseDown = (e) => {
        const el = e.target.closest('.svg-draggable');
        if (!el) return;
        const svg = container.querySelector('svg[data-plan-view]');
        if (!svg) return;
        const plan = getPlan();
        if (!plan) return;

        const scale = Number(svg.getAttribute('data-scale')) || 0.05;
        const pad = Number(svg.getAttribute('data-pad')) || 40;
        const minX = Number(svg.getAttribute('data-min-x')) || 0;
        const minY = Number(svg.getAttribute('data-min-y')) || 0;
        const clientToMm = (clientX, clientY) => {
            const pt = svgPoint(svg, clientX, clientY);
            return { x: (pt.x - pad) / scale + minX, y: (pt.y - pad) / scale + minY };
        };

        const type = el.getAttribute('data-drag-type');
        const path = el.getAttribute('data-highlight');
        if (!type || !path) return;
        e.preventDefault();
        const pt = clientToMm(e.clientX, e.clientY);
        if (type === 'block') {
            const block = getDataByPath(plan, path);
            if (!block?.position) return;
            drag = {
                clientToMm,
                scale,
                draggedEl: el,
                type: 'block',
                path,
                startMouse: pt,
                startPos: { x: block.position.x ?? 0, z: block.position.z ?? 0 },
            };
        } else if (type === 'room') {
            const room = getDataByPath(plan, path);
            if (!room?.polygon?.length) return;
            drag = {
                clientToMm,
                scale,
                draggedEl: el,
                type: 'room',
                path,
                startMouse: pt,
                startPolygon: room.polygon.map(p => [Number(p[0]) || 0, Number(p[1]) || 0]),
            };
        }
        if (drag) {
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            el.style.cursor = 'grabbing';
        }
    };

    const onMouseMove = (e) => {
        if (!drag?.clientToMm) return;
        const pt = drag.clientToMm(e.clientX, e.clientY);
        const dx = pt.x - drag.startMouse.x;
        const dy = pt.y - drag.startMouse.y;
        if (drag.type === 'block') {
            const currentPlan = getPlan();
            let newX = drag.startPos.x + dx;
            let newZ = drag.startPos.z + dy;
            const blocks = (currentPlan?.blocks ?? []);
            const bi = parseInt(pathToBlockIndex(drag.path), 10);
            if (!isNaN(bi) && blocks.length > 1) {
                const otherEdgesX = [];
                const otherEdgesZ = [];
                for (let i = 0; i < blocks.length; i++) {
                    if (i === bi) continue;
                    const b = blocks[i];
                    const pos = b.position ?? { x: 0, z: 0 };
                    const w = b.footprint?.width ?? 8000;
                    const d = b.footprint?.depth ?? 8000;
                    const tw = b.wall?.thickness_mm ?? b.wall?.thickness ?? 200;
                    otherEdgesX.push(pos.x, pos.x + w);
                    otherEdgesZ.push(pos.z, pos.z + d);
                }
                const bw = blocks[bi]?.footprint?.width ?? 8000;
                const bd = blocks[bi]?.footprint?.depth ?? 8000;
                newX = snapToGrid(snapValue(newX, otherEdgesX));
                newZ = snapToGrid(snapValue(newZ, otherEdgesZ));
            } else {
                newX = snapToGrid(newX);
                newZ = snapToGrid(newZ);
            }
            drag.pendingPos = { x: newX, z: newZ };
        } else if (drag.type === 'room') {
            const snappedDx = snapToGrid(dx);
            const snappedDy = snapToGrid(dy);
            drag.pendingPolygon = drag.startPolygon.map(([px, py]) => [px + snappedDx, py + snappedDy]);
            if (drag.draggedEl && drag.scale != null) {
                const tx = snappedDx * drag.scale;
                const ty = snappedDy * drag.scale;
                drag.draggedEl.setAttribute('transform', `translate(${tx}, ${ty})`);
            }
        }
    };

    const onMouseUp = () => {
        if (!drag) return;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        container.querySelectorAll('.svg-draggable').forEach(el => { el.style.cursor = ''; });
        const currentPlan = getPlan();
        if (!currentPlan) { drag = null; return; }
        if (drag.type === 'block' && drag.pendingPos) {
            const block = getDataByPath(currentPlan, drag.path);
            if (block) {
                const updated = { ...block, position: drag.pendingPos };
                applyTreeEdit(currentPlan, updated, drag.path);
                updateUI();
            }
        } else if (drag.type === 'room' && drag.pendingPolygon?.length) {
            const room = getDataByPath(currentPlan, drag.path);
            if (room) {
                let poly = drag.pendingPolygon;
                const blockMatch = drag.path.match(/^blocks\.(\d+)\.floors\.(\d+)/);
                if (blockMatch) {
                    const bi = parseInt(blockMatch[1], 10);
                    const fi = parseInt(blockMatch[2], 10);
                    const block = currentPlan.blocks?.[bi];
                    const floor = block?.floors?.[fi];
                    const w = block?.footprint?.width ?? 8000;
                    const d = block?.footprint?.depth ?? 8000;
                    poly = poly.map(([px, py]) => [
                        Math.max(0, Math.min(w, px)),
                        Math.max(0, Math.min(d, py)),
                    ]);
                    applyTreeEdit(currentPlan, { ...room, polygon: poly }, drag.path);
                    if (block?.id && floor?.id) regenerateDerivedForLevel(currentPlan, block.id, floor.id);
                } else {
                    applyTreeEdit(currentPlan, { ...room, polygon: poly }, drag.path);
                }
                updateUI();
            }
        }
        drag = null;
    };

    container.removeEventListener('mousedown', onMouseDown);
    container.addEventListener('mousedown', onMouseDown);
}
