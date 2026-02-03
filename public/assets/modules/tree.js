/**
 * JSON tree hierarchy view with editing
 */

import { isV05, isV04 } from './parse.js';
import { scene3d, plan as statePlan } from './state.js';
import { regenerateDerivedForLevel } from './derived-walls.js';

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildPlanHierarchy(plan) {
    if (!plan || typeof plan !== 'object') return null;
    
    // v0.4 blocks format
    if (isV04(plan) && plan.blocks?.length) {
        const root = { label: 'Plan (vinkelhus)', children: [], data: plan, path: [] };
        for (let bi = 0; bi < plan.blocks.length; bi++) {
            const block = plan.blocks[bi];
            const blockLabel = block.name ?? block.id ?? `Blokk ${bi + 1}`;
            const blockNode = { label: blockLabel, children: [], data: block, path: ['blocks', bi] };
            
            // Floors in this block
            for (let fi = 0; fi < (block.floors ?? []).length; fi++) {
                const f = block.floors[fi];
                const floorLabel = f.name ?? f.id ?? 'Etasje';
                const floorNode = { label: floorLabel, children: [], data: f, path: ['blocks', bi, 'floors', fi] };
                // Rooms
                for (let ri = 0; ri < (f.rooms ?? []).length; ri++) {
                    const r = f.rooms[ri];
                    const roomLabel = r.name ?? r.id ?? 'Rom';
                    floorNode.children.push({ label: roomLabel, children: [], data: r, path: ['blocks', bi, 'floors', fi, 'rooms', ri] });
                }
                // Openings
                for (let oi = 0; oi < (f.openings ?? []).length; oi++) {
                    const o = f.openings[oi];
                    const oLabel = `${o.type === 'door' ? 'Dør' : 'Vindu'} (${o.wall})`;
                    floorNode.children.push({ label: oLabel, children: [], data: o, path: ['blocks', bi, 'floors', fi, 'openings', oi] });
                }
                blockNode.children.push(floorNode);
            }
            
            // Roof for this block
            if (block.roof) {
                const roofLabel = `Tak (${block.roof.type ?? 'gable'})`;
                blockNode.children.push({ label: roofLabel, children: [], data: block.roof, path: ['blocks', bi, 'roof'] });
            }
            
            root.children.push(blockNode);
        }
        return root;
    }
    
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
let treePopupTimeout = 0;

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

function hideTreePopup() {
    if (treePopupEl?.parentNode) treePopupEl.parentNode.removeChild(treePopupEl);
    treePopupEl = null;
}

export function getDataByPath(plan, pathStr) {
    if (!plan) return null;
    if (!pathStr) return plan;
    let cur = plan;
    for (const p of pathStr.split('.')) {
        cur = cur?.[p];
    }
    return cur;
}

/** Parse path for dedicated edit: block, floor, or room. */
export function parseEditPath(pathStr) {
    if (!pathStr) return null;
    const parts = pathStr.split('.');
    if (parts.length === 2 && parts[0] === 'blocks') {
        const i = parseInt(parts[1], 10);
        if (!isNaN(i)) return { type: 'block', blockIndex: i };
    }
    if (parts.length === 4 && parts[0] === 'blocks' && parts[2] === 'floors') {
        const bi = parseInt(parts[1], 10), fi = parseInt(parts[3], 10);
        if (!isNaN(bi) && !isNaN(fi)) return { type: 'floor', blockIndex: bi, floorIndex: fi, inBlocks: true };
    }
    if (parts.length === 2 && parts[0] === 'floors') {
        const fi = parseInt(parts[1], 10);
        if (!isNaN(fi)) return { type: 'floor', floorIndex: fi, inBlocks: false };
    }
    if (parts.length === 6 && parts[0] === 'blocks' && parts[2] === 'floors' && parts[4] === 'rooms') {
        const bi = parseInt(parts[1], 10), fi = parseInt(parts[3], 10), ri = parseInt(parts[5], 10);
        if (!isNaN(bi) && !isNaN(fi) && !isNaN(ri)) return { type: 'room', blockIndex: bi, floorIndex: fi, roomIndex: ri, inBlocks: true };
    }
    if (parts.length === 4 && parts[0] === 'floors' && parts[2] === 'rooms') {
        const fi = parseInt(parts[1], 10), ri = parseInt(parts[3], 10);
        if (!isNaN(fi) && !isNaN(ri)) return { type: 'room', floorIndex: fi, roomIndex: ri, inBlocks: false };
    }
    return null;
}

/** Bounding box of room polygon [[x,y], ...] in mm. */
export function getRoomRectFromPolygon(polygon) {
    if (!Array.isArray(polygon) || polygon.length === 0) return { x: 0, y: 0, width: 3000, depth: 3000 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
        const x = Number(p[0]) || 0, y = Number(p[1]) || 0;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, width: Math.max(0, maxX - minX) || 3000, depth: Math.max(0, maxY - minY) || 3000 };
}

function polygonFromRect(x, y, w, d) {
    return [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
}

/** Build HTML for a material dropdown (plan.materialLibrary). category: 'floor'|'wall'|'ceiling'|'roof'. */
function materialPickerHtml(plan, category, currentId, nameAttr) {
    const lib = plan?.materialLibrary ?? [];
    const options = lib
        .filter(m => !category || m.category === category)
        .map(m => `<option value="${escapeHtml(m.id)}" ${m.id === currentId ? 'selected' : ''}>${escapeHtml(m.name ?? m.id)}</option>`)
        .join('');
    const label = { floor: 'Gulv', wall: 'Vegg', ceiling: 'Tak (innvendig)', roof: 'Tak (utvendig)' }[category] ?? category;
    return `<label>${label} <select name="${nameAttr}">${options || '<option value="">—</option>'}</select></label>`;
}

export function applyTreeEdit(plan, newData, pathStr) {
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

let currentPropsEdit = null;

function wireEditPropsModal() {
    const modal = document.getElementById('editPropsModal');
    const saveBtn = document.getElementById('editPropsSave');
    const cancelBtn = document.getElementById('editPropsCancel');
    if (!modal || !saveBtn || saveBtn._editPropsWired) return;
    saveBtn._editPropsWired = true;
    saveBtn.addEventListener('click', () => {
        const plan = statePlan;
        if (!currentPropsEdit || !plan) return;
        const { pathStr, type, updateUICallback } = currentPropsEdit;
        const form = document.getElementById('editPropsForm');
        if (!form) return;
        if (type === 'block') {
            const nameVal = (form.querySelector('[name="blockName"]')?.value ?? '').trim();
            const x = Number(form.querySelector('[name="blockPosX"]')?.value) || 0;
            const z = Number(form.querySelector('[name="blockPosZ"]')?.value) || 0;
            const width = Number(form.querySelector('[name="blockWidth"]')?.value) || 8000;
            const depth = Number(form.querySelector('[name="blockDepth"]')?.value) || 8000;
            const matFloor = form.querySelector('[name="blockMaterialFloor"]')?.value?.trim();
            const matWall = form.querySelector('[name="blockMaterialWall"]')?.value?.trim();
            const matCeiling = form.querySelector('[name="blockMaterialCeiling"]')?.value?.trim();
            const matRoof = form.querySelector('[name="blockMaterialRoof"]')?.value?.trim();
            const block = getDataByPath(plan, pathStr);
            if (block) {
                const materials = { ...(block.materials || {}) };
                if (matFloor) materials.floor = matFloor;
                if (matWall) materials.wall = matWall;
                if (matCeiling) materials.ceiling = matCeiling;
                if (matRoof) materials.roof = matRoof;
                const updated = {
                    ...block,
                    name: nameVal || block.id || block.name,
                    position: { x, z },
                    footprint: { ...(block.footprint || {}), type: 'rect', width, depth },
                    materials: Object.keys(materials).length ? materials : undefined,
                };
                applyTreeEdit(plan, updated, pathStr);
                const editInfo = parseEditPath(pathStr);
                if (editInfo?.type === 'block' && plan.blocks?.[editInfo.blockIndex]) {
                    const b = plan.blocks[editInfo.blockIndex];
                    for (const floor of b.floors ?? []) {
                        regenerateDerivedForLevel(plan, b.id, floor.id);
                    }
                }
            }
        } else if (type === 'room') {
            const nameVal = (form.querySelector('[name="roomName"]')?.value ?? '').trim();
            const x = Number(form.querySelector('[name="roomX"]')?.value) || 0;
            const y = Number(form.querySelector('[name="roomY"]')?.value) || 0;
            const width = Number(form.querySelector('[name="roomWidth"]')?.value) || 3000;
            const depth = Number(form.querySelector('[name="roomDepth"]')?.value) || 3000;
            const wallThickness = Number(form.querySelector('[name="roomWallThickness"]')?.value);
            const matFloor = form.querySelector('[name="roomMaterialFloor"]')?.value?.trim();
            const matWall = form.querySelector('[name="roomMaterialWall"]')?.value?.trim();
            const matCeiling = form.querySelector('[name="roomMaterialCeiling"]')?.value?.trim();
            const room = getDataByPath(plan, pathStr);
            if (room) {
                const materials = { ...(room.materials || {}) };
                if (matFloor) materials.floor = matFloor;
                if (matWall) materials.wall = matWall;
                if (matCeiling) materials.ceiling = matCeiling;
                const updated = { ...room, name: nameVal || room.id || room.name, polygon: polygonFromRect(x, y, width, depth) };
                if (!Number.isNaN(wallThickness) && wallThickness >= 0) updated.wall_thickness_mm = wallThickness;
                if (Object.keys(materials).length) updated.materials = materials;
                applyTreeEdit(plan, updated, pathStr);
                const editInfo = parseEditPath(pathStr);
                if (editInfo?.type === 'room' && editInfo.inBlocks && plan.blocks?.[editInfo.blockIndex]) {
                    const b = plan.blocks[editInfo.blockIndex];
                    const floor = b.floors?.[editInfo.floorIndex];
                    if (floor?.id) regenerateDerivedForLevel(plan, b.id, floor.id);
                }
            }
        } else if (type === 'floor') {
            const nameVal = (form.querySelector('[name="floorName"]')?.value ?? '').trim();
            const elev = Number(form.querySelector('[name="floorElevation"]')?.value);
            const floor = getDataByPath(plan, pathStr);
            if (floor) {
                const updated = { ...floor, name: nameVal || floor.id || floor.name };
                if (!Number.isNaN(elev)) updated.elevation_mm = elev;
                applyTreeEdit(plan, updated, pathStr);
            }
        }
        if (updateUICallback) updateUICallback();
        modal.hidden = true;
        currentPropsEdit = null;
    });
    cancelBtn?.addEventListener('click', () => { modal.hidden = true; currentPropsEdit = null; });
}

export function showBlockEditModal(plan, pathStr, label, updateUICallback) {
    const block = getDataByPath(plan, pathStr);
    if (!block || !pathStr) return;
    wireEditPropsModal();
    const modal = document.getElementById('editPropsModal');
    const title = document.getElementById('editPropsTitle');
    const formEl = document.getElementById('editPropsForm');
    if (!modal || !title || !formEl) return;
    const pos = block.position ?? { x: 0, z: 0 };
    const fp = block.footprint ?? {};
    const w = fp.width ?? 8000;
    const d = fp.depth ?? 8000;
    const mats = block.materials ?? {};
    const defMats = plan?.defaults?.materials ?? {};
    title.textContent = 'Rediger blokk';
    formEl.innerHTML = `
        <label>Navn <input type="text" name="blockName" value="${escapeHtml(block.name ?? block.id ?? '')}" placeholder="Navn på blokk"></label>
        <label>Posisjon X (mm) <input type="number" name="blockPosX" value="${pos.x ?? 0}" step="100"></label>
        <label>Posisjon Z (mm) <input type="number" name="blockPosZ" value="${pos.z ?? 0}" step="100"></label>
        <label>Bredde (mm) <input type="number" name="blockWidth" value="${w}" min="1000" step="100"></label>
        <label>Dybde (mm) <input type="number" name="blockDepth" value="${d}" min="1000" step="100"></label>
        <fieldset class="edit-modal-materials"><legend>Materialer</legend>
        ${materialPickerHtml(plan, 'floor', mats.floor ?? defMats.floor ?? '', 'blockMaterialFloor')}
        ${materialPickerHtml(plan, 'wall', mats.wall ?? defMats.wall ?? '', 'blockMaterialWall')}
        ${materialPickerHtml(plan, 'ceiling', mats.ceiling ?? defMats.ceiling ?? '', 'blockMaterialCeiling')}
        ${materialPickerHtml(plan, 'roof', mats.roof ?? defMats.roof ?? '', 'blockMaterialRoof')}
        </fieldset>`;
    currentPropsEdit = { pathStr, type: 'block', updateUICallback };
    modal.hidden = false;
}

export function showRoomEditModal(plan, pathStr, label, updateUICallback) {
    const room = getDataByPath(plan, pathStr);
    if (!room || !pathStr) return;
    wireEditPropsModal();
    const rect = getRoomRectFromPolygon(room.polygon);
    const modal = document.getElementById('editPropsModal');
    const title = document.getElementById('editPropsTitle');
    const formEl = document.getElementById('editPropsForm');
    if (!modal || !title || !formEl) return;
    const wallThick = room.wall_thickness_mm ?? 0;
    const mats = room.materials ?? {};
    const defMats = plan?.defaults?.materials ?? {};
    title.textContent = 'Rediger rom';
    formEl.innerHTML = `
        <label>Navn <input type="text" name="roomName" value="${escapeHtml(room.name ?? room.id ?? '')}" placeholder="Navn på rom"></label>
        <label>X (mm) <input type="number" name="roomX" value="${rect.x}" step="100"></label>
        <label>Y (mm) <input type="number" name="roomY" value="${rect.y}" step="100"></label>
        <label>Bredde (mm) <input type="number" name="roomWidth" value="${rect.width}" min="500" step="100"></label>
        <label>Dybde (mm) <input type="number" name="roomDepth" value="${rect.depth}" min="500" step="100"></label>
        <label>Veggtykkelse (mm) <input type="number" name="roomWallThickness" value="${wallThick}" min="0" step="10" placeholder="Innvendig vegg"></label>
        <fieldset class="edit-modal-materials"><legend>Materialer</legend>
        ${materialPickerHtml(plan, 'floor', mats.floor ?? defMats.floor ?? '', 'roomMaterialFloor')}
        ${materialPickerHtml(plan, 'wall', mats.wall ?? defMats.wall ?? '', 'roomMaterialWall')}
        ${materialPickerHtml(plan, 'ceiling', mats.ceiling ?? defMats.ceiling ?? '', 'roomMaterialCeiling')}
        </fieldset>`;
    currentPropsEdit = { pathStr, type: 'room', updateUICallback };
    modal.hidden = false;
}

export function showFloorEditModal(plan, pathStr, label, updateUICallback) {
    const floor = getDataByPath(plan, pathStr);
    if (!floor || !pathStr) return;
    wireEditPropsModal();
    const modal = document.getElementById('editPropsModal');
    const title = document.getElementById('editPropsTitle');
    const formEl = document.getElementById('editPropsForm');
    if (!modal || !title || !formEl) return;
    const elev = floor.elevation_mm ?? 0;
    title.textContent = 'Rediger etasje';
    formEl.innerHTML = `
        <label>Navn <input type="text" name="floorName" value="${escapeHtml(floor.name ?? floor.id ?? '')}" placeholder="Navn på etasje"></label>
        <label>Høyde over terreng (mm) <input type="number" name="floorElevation" value="${elev}" step="100"></label>`;
    currentPropsEdit = { pathStr, type: 'floor', updateUICallback };
    modal.hidden = false;
}

export function showTreeEditModal(plan, pathStr, label, updateUICallback) {
    if (!plan) return;
    const editInfo = parseEditPath(pathStr);
    if (editInfo?.type === 'block') {
        showBlockEditModal(plan, pathStr, label, updateUICallback);
        return;
    }
    if (editInfo?.type === 'floor') {
        showFloorEditModal(plan, pathStr, label, updateUICallback);
        return;
    }
    if (editInfo?.type === 'room') {
        showRoomEditModal(plan, pathStr, label, updateUICallback);
        return;
    }
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
                if (updateUICallback) updateUICallback();
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

let highlightedPath = null;
export function setTreeHighlight(pathStr) {
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

export function renderJsonTree(el, data, plan, updateUICallback) {
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
            showTreeEditModal(plan, pathStr ?? '', label, updateUICallback);
        });
    });
}
