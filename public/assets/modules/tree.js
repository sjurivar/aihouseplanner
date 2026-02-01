/**
 * JSON tree hierarchy view with editing
 */

import { isV05 } from './parse.js';
import { scene3d } from './state.js';

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildPlanHierarchy(plan) {
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

export function showTreeEditModal(plan, pathStr, label, updateUICallback) {
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
