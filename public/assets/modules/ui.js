/**
 * UI management and event handlers
 */

import { plan, selectedFloorId, setPlan, setSelectedFloorId } from './state.js';
import { parseJson, getFloorList, getActivePlanRoot, getAllFloorRoots, normalizeToV1, isV04 } from './parse.js';
import { ensureMaterialDefaults, ensureMaterialLibrary, ensureDerivedStructure, DEFAULT_MATERIAL_LIBRARY, DEFAULT_MATERIALS, DEFAULT_WALL_RULES } from './material-defaults.js';
import { regenerateAllDerivedWalls } from './derived-walls.js';
import { validatePlan } from './validate.js';
import { render2D, render2DElevationOnly, exportSvg } from './render2d.js';
import { clearScene, rebuild3D } from './render3d.js';
import { renderJsonTree } from './tree.js';
import { computeFullFacadeWithLog } from './facade-logic.js';
import { setupPlanDragDrop } from './drag-drop.js';

const FACADE_SCALE = 0.08;
const FACADE_PAD = 24;
let facadeLogs = { nord: [], sor: [], ost: [], vest: [] };

/** Ensure plan has materialLibrary, defaults.materials/wallRules, and derived.wallsByLevel (regenerated). */
export function preparePlanForEditor(planObj) {
    if (!planObj || typeof planObj !== 'object') return;
    ensureMaterialLibrary(planObj);
    planObj.defaults = ensureMaterialDefaults(planObj);
    ensureDerivedStructure(planObj);
    regenerateAllDerivedWalls(planObj);
}

const scriptEl = document.querySelector('script[src$="app.js"]');
const BASE = scriptEl?.src
    ? (() => { const u = new URL(scriptEl.src); return u.origin + u.pathname.replace(/\/assets\/app\.js.*$/, ''); })()
    : (() => { const p = window.location.pathname.replace(/\/$/, '') || '/'; return window.location.origin + p; })();

export function updateUI() {
    const jsonTree = document.getElementById('jsonTree');
    const errList = document.getElementById('validationErrors');
    const floorSelect = document.getElementById('floorDropdown');
    const svgContainer = document.getElementById('svgContainer');
    const render3dBtn = document.getElementById('render3dBtn');
    if (!jsonTree || !svgContainer) return;

    if (!plan) {
        renderJsonTree(jsonTree, null, null, updateUI);
        errList.innerHTML = '';
        floorSelect.innerHTML = '';
        svgContainer.innerHTML = '';
        const noPlanPlaceholder = '<p class="svg-placeholder">Last en plan</p>';
        document.querySelectorAll('.elevation-panel .elevation-svg').forEach(el => {
            el.innerHTML = noPlanPlaceholder;
        });
        clearScene();
        const canvas = document.getElementById('canvas3d');
        if (canvas) canvas.style.display = 'block';
        const v1Msg = document.querySelector('[data-v1-msg]');
        if (v1Msg) v1Msg.remove();
        if (render3dBtn) render3dBtn.disabled = true;
        facadeLogs = { nord: [], sor: [], ost: [], vest: [] };
        updateFacadeLogOutput();
        return;
    }

    renderJsonTree(jsonTree, plan, plan, updateUI);
    const errs = validatePlan(plan);
    errList.innerHTML = errs.map(e => `<li>${e}</li>`).join('');

    const floors = getFloorList(plan);
    floorSelect.innerHTML = floors.map(f => `<option value="${f.id}">${f.name ?? f.id}</option>`).join('');
    if (!selectedFloorId && floors.length) setSelectedFloorId(floors[0].id);
    floorSelect.value = selectedFloorId ?? '';

    const active = getActivePlanRoot(plan, selectedFloorId);
    const floorIndex = getFloorList(plan).findIndex(f => f.id === selectedFloorId);
    const showRidgeLine = document.getElementById('showRidgeLine')?.checked ?? false;
    render2D(svgContainer, active, plan, floorIndex >= 0 ? floorIndex : 0, 'plan', showRidgeLine);

    const elevationPanel = document.querySelector('.elevation-panel');
    if (elevationPanel) {
        const elevationContainers = elevationPanel.querySelectorAll('.elevation-svg[data-direction]');
        const directions = ['nord', 'sor', 'ost', 'vest'];
        const isSingleBuilding = plan.floors?.length && !plan.blocks?.length;

        if (isSingleBuilding) {
            directions.forEach((dir, i) => {
                const el = elevationContainers[i];
                if (!el) return;
                const { svgHtml, logLines } = computeFullFacadeWithLog(plan, dir, { scale: FACADE_SCALE, pad: FACADE_PAD });
                facadeLogs[dir] = logLines ?? [];
                el.innerHTML = svgHtml || '<p class="svg-placeholder">—</p>';
            });
        } else {
            elevationContainers.forEach((el, i) => {
                const dir = el.getAttribute('data-direction') || directions[i];
                render2DElevationOnly(el, active, dir, plan);
                facadeLogs[dir] = [];
            });
        }

        updateFacadeLogOutput();
    }

    if (render3dBtn) render3dBtn.disabled = false;
    clearScene();
    const canvas = document.getElementById('canvas3d');
    if (canvas) canvas.style.display = 'block';
    const v1Msg = document.querySelector('[data-v1-msg]');
    if (v1Msg) v1Msg.remove();
}

export async function loadSample(v = 'v0.3') {
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
            const normalized = normalizeToV1(data);
            preparePlanForEditor(normalized);
            setPlan(normalized);
            const floors = getFloorList(normalized);
            setSelectedFloorId(floors.length ? (floors[0].id ?? floors[0].name ?? 'f0') : null);
            updateUI();
        } else {
            alert('Kunne ikke laste sample');
        }
    } catch (err) {
        console.error('loadSample:', err);
        alert('Kunne ikke laste sample: ' + (err?.message || 'nettverksfeil'));
    }
}

export async function generatePlan() {
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
            const normalized = normalizeToV1(data.plan);
            preparePlanForEditor(normalized);
            setPlan(normalized);
            const floors = getFloorList(normalized);
            setSelectedFloorId(floors.length ? (floors[0].id ?? floors[0].name ?? 'f0') : null);
            updateUI();
        } else {
            alert(data?.error ?? 'Generering feilet');
        }
    };
    document.getElementById('generateCancel').onclick = () => { modal.hidden = true; };
}

function updateFacadeLogOutput() {
    const pre = document.getElementById('facadeLogOutput');
    const select = document.getElementById('facadeLogDirection');
    if (!pre || !select) return;
    const dir = select.value || 'nord';
    const lines = facadeLogs[dir];
    if (lines?.length) {
        pre.textContent = lines.join('\n');
        pre.classList.remove('facade-log-empty');
    } else {
        pre.textContent = !plan
            ? 'Last en plan for å vise beregninger.'
            : (plan.floors?.length && !plan.blocks?.length)
                ? 'Velg retning for å vise beregninger.'
                : 'Beregninger vises kun for enkeltbygning (alle etasjer + tak).';
        pre.classList.add('facade-log-empty');
    }
}

/** Minimal ny plan: én blokk (Lego-prinsippet), med materialLibrary og defaults, klar for redigering. */
function createNewPlan() {
    return {
        version: '1.0',
        units: 'mm',
        defaults: {
            wall: { thickness_mm: 200, height_mm: 2700 },
            materials: { ...DEFAULT_MATERIALS },
            wallRules: { ...DEFAULT_WALL_RULES },
        },
        materialLibrary: [...DEFAULT_MATERIAL_LIBRARY],
        derived: { wallsByLevel: {} },
        blocks: [
            {
                id: 'block_1',
                name: 'Blokk 1',
                position: { x: 0, z: 0 },
                footprint: { type: 'rect', width: 8000, depth: 8000 },
                floors: [
                    {
                        id: 'f1',
                        name: '1. etasje',
                        level: 1,
                        elevation_mm: 0,
                        openings: [],
                    },
                ],
                roof: {
                    type: 'gable',
                    pitch_degrees: 35,
                    overhang_mm: 500,
                    ridge_direction: 'x',
                    ridge_offset_mm: 0,
                    ridge_mode: 'equal_pitch',
                },
            },
        ],
    };
}

export function newPlan() {
    const p = createNewPlan();
    preparePlanForEditor(p);
    setPlan(p);
    const floors = getFloorList(p);
    setSelectedFloorId(floors.length ? (floors[0].id ?? 'f1') : null);
    updateUI();
}

/** Legg til ny bygningskropp (blokk). Konverterer til blocks hvis plan kun har floors. */
export function addBlock() {
    if (!plan) return;
    const nextNum = (plan.blocks?.length ?? 0) + 1;
    const newBlock = {
        id: `block_${nextNum}`,
        name: `Blokk ${nextNum}`,
        position: { x: 0, z: 0 },
        footprint: { type: 'rect', width: 6000, depth: 6000 },
        floors: [
            { id: 'f1', name: '1. etasje', level: 1, elevation_mm: 0, openings: [] },
        ],
        roof: {
            type: 'gable',
            pitch_degrees: 35,
            overhang_mm: 500,
            ridge_direction: 'x',
            ridge_offset_mm: 0,
            ridge_mode: 'equal_pitch',
        },
    };
    let p = plan;
    if (!isV04(plan) && plan.floors?.length) {
        p = {
            ...plan,
            blocks: [{
                id: 'block_1',
                name: 'Blokk 1',
                position: { x: 0, z: 0 },
                footprint: plan.floors[0]?.footprint ?? { type: 'rect', width: 8000, depth: 8000 },
                floors: plan.floors.map((f, i) => ({
                    id: f.id ?? `f${i + 1}`,
                    name: f.name ?? `${i + 1}. etasje`,
                    level: f.level ?? i + 1,
                    elevation_mm: f.elevation_mm ?? 0,
                    openings: f.openings ?? [],
                })),
                roof: plan.roof ?? { type: 'gable', pitch_degrees: 35, overhang_mm: 500, ridge_direction: 'x', ridge_offset_mm: 0, ridge_mode: 'equal_pitch' },
            }],
        };
        delete p.floors;
        delete p.roof;
        newBlock.position = { x: (p.blocks[0].footprint?.width ?? 8000) + 2000, z: 0 };
    } else if (p.blocks?.length) {
        const last = p.blocks[p.blocks.length - 1];
        const w = last.footprint?.width ?? 8000;
        const d = last.footprint?.depth ?? 8000;
        const pos = last.position ?? { x: 0, z: 0 };
        newBlock.position = { x: pos.x + w + 2000, z: pos.z };
    }
    p = { ...p, blocks: [...(p.blocks ?? []), newBlock] };
    setPlan(p);
    preparePlanForEditor(plan);
    setSelectedFloorId('f1');
    updateUI();
}

/** Legg til ny etasje (i alle blokker eller i plan.floors). */
export function addFloor() {
    if (!plan) return;
    const floors = getFloorList(plan);
    const nextLevel = floors.length + 1;
    const newFloorId = `f${nextLevel}`;
    const newFloorName = `${nextLevel}. etasje`;
    const lastElev = floors.length ? (floors[floors.length - 1].elevation_mm ?? 0) + 2700 : 0;
    if (isV04(plan) && plan.blocks?.length) {
        const newFloor = { id: newFloorId, name: newFloorName, level: nextLevel, elevation_mm: lastElev, openings: [] };
        const p = {
            ...plan,
            blocks: plan.blocks.map(b => ({
                ...b,
                floors: [...(b.floors ?? []), { ...newFloor }],
            })),
        };
        setPlan(p);
        preparePlanForEditor(plan);
        setSelectedFloorId(newFloorId);
    } else if (plan.floors?.length) {
        const last = plan.floors[plan.floors.length - 1];
        const fp = last.footprint ?? { type: 'rect', width: 8000, depth: 8000 };
        const p = {
            ...plan,
            floors: [
                ...plan.floors,
                {
                    id: newFloorId,
                    name: newFloorName,
                    level: nextLevel,
                    elevation_mm: (last.elevation_mm ?? 0) + 2700,
                    footprint: fp,
                    rooms: [],
                    walls: [],
                    stairs: [],
                },
            ],
        };
        setPlan(p);
        setSelectedFloorId(newFloorId);
    }
    updateUI();
}

/** Legg til nytt rom på valgt etasje. Støtter både plan.floors (v1) og plan.blocks. */
export function addRoom() {
    if (!plan) return;

    const floors = getFloorList(plan);
    const fid = selectedFloorId ?? floors[0]?.id;
    if (!fid) return;

    const defaultWallMm = plan.defaults?.wall?.thickness_mm ?? plan.defaults?.wall?.thickness ?? 200;
    const makeRoom = (count, x0 = 0, y0 = 0, w = 3000, d = 3000) => ({
        id: `R${count}`,
        name: `Rom ${count}`,
        polygon: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + d], [x0, y0 + d]],
        floor_finish: 'wood',
        ceiling_height_mm: 2600,
        wall_thickness_mm: defaultWallMm,
        tags: [],
    });

    if (isV04(plan) && plan.blocks?.length) {
        let existingMax = 0;
        for (const b of plan.blocks) {
            const fl = (b.floors ?? []).find(f => f.id === fid);
            (fl?.rooms ?? []).forEach(r => {
                const n = parseInt(String(r.id || '').replace(/^R/i, ''), 10);
                if (!isNaN(n)) existingMax = Math.max(existingMax, n);
            });
        }
        let nextNum = existingMax;
        const p = {
            ...plan,
            blocks: plan.blocks.map(b => {
                const floor = (b.floors ?? []).find(f => f.id === fid);
                if (!floor) return b;
                nextNum += 1;
                const room = makeRoom(nextNum, 0, 0, 3000, 3000);
                return {
                    ...b,
                    floors: b.floors.map(f => f.id === fid ? { ...f, rooms: [...(f.rooms ?? []), room] } : f),
                };
            }),
        };
        setPlan(p);
        preparePlanForEditor(plan);
    } else if (plan.floors?.length) {
        const floor = plan.floors.find(f => f.id === fid);
        if (!floor) return;
        const rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
        const fp = floor.footprint ?? { type: 'rect', width: 9000, depth: 7000 };
        const room = makeRoom(rooms.length + 1, 0, 0, 3000, 3000);
        const p = {
            ...plan,
            floors: plan.floors.map(f => f.id === fid ? { ...f, rooms: [...rooms, room] } : f),
        };
        setPlan(p);
        preparePlanForEditor(plan);
    } else {
        return;
    }
    updateUI();
}

export function downloadJson(plan) {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'building-plan.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

export function setupEventHandlers() {
    const fileInput = document.getElementById('fileInput');
    const loadSampleDropdown = document.getElementById('loadSampleDropdown');
    const generateBtn = document.getElementById('generatePlan');
    const saveBtn = document.getElementById('btnSave');
    const openBtn = document.getElementById('btnOpen');
    const newBtn = document.getElementById('btnNew');
    const exportSvgBtn = document.getElementById('exportSvg');
    const floorSelect = document.getElementById('floorDropdown');
    const svgContainer = document.getElementById('svgContainer');

    newBtn?.addEventListener('click', () => newPlan());

    openBtn?.addEventListener('click', () => fileInput?.click());

    const addMenu = document.getElementById('addMenu');
    const btnAdd = document.getElementById('btnAdd');
    btnAdd?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!addMenu) return;
        const wasOpen = !addMenu.hidden;
        addMenu.hidden = wasOpen;
        btnAdd.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
    });
    addMenu?.querySelectorAll('[data-add]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = e.currentTarget.getAttribute('data-add');
            addMenu.hidden = true;
            btnAdd?.setAttribute('aria-expanded', 'false');
            if (action === 'block') addBlock();
            else if (action === 'floor') addFloor();
            else if (action === 'room') addRoom();
        });
    });
    document.addEventListener('click', () => {
        if (addMenu && !addMenu.hidden) {
            addMenu.hidden = true;
            btnAdd?.setAttribute('aria-expanded', 'false');
        }
    });

    fileInput?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            const raw = parseJson(r.result);
            const normalized = normalizeToV1(raw);
            preparePlanForEditor(normalized);
            setPlan(normalized);
            const floors = getFloorList(normalized);
            setSelectedFloorId(floors.length ? (floors[0].id ?? floors[0].name ?? 'f0') : null);
            updateUI();
        };
        r.readAsText(f);
        e.target.value = '';
    });

    document.body.addEventListener('dragover', e => { e.preventDefault(); });
    document.body.addEventListener('drop', e => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (!f?.name?.endsWith('.json')) return;
        const r = new FileReader();
        r.onload = () => {
            const raw = parseJson(r.result);
            const normalized = normalizeToV1(raw);
            preparePlanForEditor(normalized);
            setPlan(normalized);
            const floors = getFloorList(normalized);
            setSelectedFloorId(floors.length ? (floors[0].id ?? floors[0].name ?? 'f0') : null);
            updateUI();
        };
        r.readAsText(f);
    });

    loadSampleDropdown?.addEventListener('change', async (e) => {
        const v = e.target.value;
        if (v) {
            await loadSample(v);
            // Behold valgt verdi synlig i dropdown
        }
    });

    generateBtn?.addEventListener('click', generatePlan);

    document.getElementById('render3dBtn')?.addEventListener('click', () => {
        if (!plan) return;
        const allRoots = getAllFloorRoots(plan);
        rebuild3D(allRoots, plan.roof ?? null, plan);
    });

    saveBtn?.addEventListener('click', () => downloadJson(plan));
    exportSvgBtn?.addEventListener('click', () => exportSvg(svgContainer));

    const facadeLogDirection = document.getElementById('facadeLogDirection');
    if (facadeLogDirection) facadeLogDirection.addEventListener('change', updateFacadeLogOutput);

    floorSelect?.addEventListener('change', () => {
        setSelectedFloorId(floorSelect.value);
        updateUI();
    });

    document.getElementById('showRidgeLine')?.addEventListener('change', updateUI);

    if (svgContainer) setupPlanDragDrop(svgContainer, () => plan, updateUI);
}
