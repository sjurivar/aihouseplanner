/**
 * UI management and event handlers
 */

import { plan, selectedFloorId, setPlan, setSelectedFloorId } from './state.js';
import { parseJson, getFloorList, getActivePlanRoot, getAllFloorRoots } from './parse.js';
import { validatePlan } from './validate.js';
import { render2D, exportSvg } from './render2d.js';
import { clearScene, rebuild3D } from './render3d.js';
import { renderJsonTree } from './tree.js';

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
        clearScene();
        const canvas = document.getElementById('canvas3d');
        if (canvas) canvas.style.display = 'block';
        const v1Msg = document.querySelector('[data-v1-msg]');
        if (v1Msg) v1Msg.remove();
        if (render3dBtn) render3dBtn.disabled = true;
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
    render2D(svgContainer, active, plan, floorIndex >= 0 ? floorIndex : 0);

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
            setPlan(data);
            setSelectedFloorId(plan?.floors?.[0]?.id ?? null);
            if (!selectedFloorId) {
                const floors = getFloorList(plan);
                if (floors.length) setSelectedFloorId(floors[0].id ?? floors[0].name ?? 'f0');
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
            setPlan(data.plan);
            setSelectedFloorId(plan?.floors?.[0]?.id ?? null);
            updateUI();
        } else {
            alert(data?.error ?? 'Generering feilet');
        }
    };
    document.getElementById('generateCancel').onclick = () => { modal.hidden = true; };
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
    const downloadBtn = document.getElementById('downloadJson');
    const exportSvgBtn = document.getElementById('exportSvg');
    const floorSelect = document.getElementById('floorDropdown');
    const svgContainer = document.getElementById('svgContainer');

    fileInput?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            setPlan(parseJson(r.result));
            setSelectedFloorId(plan?.floors?.[0]?.id ?? null);
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
            setPlan(parseJson(r.result));
            setSelectedFloorId(plan?.floors?.[0]?.id ?? null);
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
        setSelectedFloorId(floorSelect.value);
        updateUI();
    });
}
