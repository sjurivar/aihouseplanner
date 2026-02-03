/**
 * 3D rendering with Three.js
 */

import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { scene3d, renderer3d, camera3d, controls3d, set3DContext } from './state.js';
import { isV05, isV1 } from './parse.js';
import { computeRoofGeometry } from './roof-geometry.js';

export function init3D() {
    const canvas = document.getElementById('canvas3d');
    if (!canvas) return;
    const w = Math.max(canvas.clientWidth || 400, 1);
    const h = Math.max(canvas.clientHeight || 280, 1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb8d4e8);
    const camera = new THREE.PerspectiveCamera(50, w / h, 1, 100000);
    camera.position.set(15, 10, 15);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    set3DContext(scene, renderer, camera, controls);
    scene.add(new THREE.AmbientLight(0x404060));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10000, 20000, 10000);
    scene.add(dirLight);

    function resize3D() {
        if (!canvas || !renderer || !camera) return;
        const w = Math.max(canvas.clientWidth || 400, 1);
        const h = Math.max(canvas.clientHeight || 280, 1);
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
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

export function clearScene() {
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

const ROOF_MATERIAL_COLORS = {
    tiles: 0x8b4513,
    metal: 0x708090,
    shingles: 0x5c4033,
};

function getMaterialColorHex(plan, materialId) {
    const mat = plan?.materialLibrary?.find(m => m.id === materialId);
    if (!mat?.color) return 0xc4b8a8;
    const hex = mat.color.replace(/^#/, '');
    return parseInt(hex.length === 6 ? hex : hex.slice(0, 6), 16);
}

/** Create a wall segment mesh: mid-line a->b, thickness t, height h (all in mm). Block-local coords; scale and blockOffset applied. */
function wallSegmentMesh(ax, ay, bx, by, thicknessMm, heightMm, scale, blockOffsetX, blockOffsetZ, w, d, elev, plan, materialId) {
    const dx = (bx - ax) * scale;
    const dz = (by - ay) * scale;
    const length = Math.sqrt(dx * dx + dz * dz) || 0.001;
    const thickness = thicknessMm * scale;
    const height = heightMm * scale;
    const midX = blockOffsetX - w / 2 + (ax + bx) / 2 * scale;
    const midZ = blockOffsetZ - d / 2 + (ay + by) / 2 * scale;
    const geom = new THREE.BoxGeometry(thickness, height, length);
    const color = getMaterialColorHex(plan, materialId);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(midX, elev + height / 2, midZ);
    mesh.rotation.y = Math.atan2(-dx, dz);
    return mesh;
}

/** Quad mellom fire hjørnepunkter: ridge-kant og gesims-kant. Vertices 0,1 = ridge, 2,3 = gesims. */
function roofQuadGeometry(p0, p1, p2, p3) {
    const pos = new Float32Array(4 * 3);
    pos[0] = p0.x; pos[1] = p0.y; pos[2] = p0.z;
    pos[3] = p1.x; pos[4] = p1.y; pos[5] = p1.z;
    pos[6] = p2.x; pos[7] = p2.y; pos[8] = p2.z;
    pos[9] = p3.x; pos[10] = p3.y; pos[11] = p3.z;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    return geo;
}

/**
 * Build gable roof meshes: beregner gesims og møne, legger takflaten som quad mellom dem.
 * centerOffsetX/Z: world position for block center (multi-block).
 */
function buildRoofMeshes(roofSpec, topElevation, width, depth, centerOffsetX = 0, centerOffsetZ = 0) {
    const meshes = [];
    const geom = computeRoofGeometry(roofSpec, width, depth);
    if (!geom) return meshes;

    const scale = 0.001;
    const overhang = geom.overhangMm * scale;
    const w = geom.wMm * scale;
    const d = geom.dMm * scale;
    const ox = centerOffsetX;
    const oz = centerOffsetZ;
    const roofColor = ROOF_MATERIAL_COLORS[roofSpec.material] ?? 0x8b4513;
    const mat = new THREE.MeshLambertMaterial({ color: roofColor, side: THREE.DoubleSide });

    const ridgeHeight = geom.ridgeHeightMm * scale;
    const ridgeY = topElevation + ridgeHeight;

    if (geom.ridgeDir === 'x') {
        const ridgeZ = geom.ridgeZMm * scale;
        const distNorth = geom.distNorthMm * scale;
        const distSouth = geom.distSouthMm * scale;
        const pitchNorth = geom.pitchNorthRad;
        const pitchSouth = geom.pitchSouthRad;
        const riseNorth = geom.riseNorthMm * scale;
        const riseSouth = geom.riseSouthMm * scale;
        const eaveElevNorth = topElevation + ridgeHeight - riseNorth;
        const eaveElevSouth = topElevation + ridgeHeight - riseSouth;
        const yEaveNorthWithOverhang = eaveElevNorth - overhang * Math.tan(pitchNorth);
        const yEaveSouthWithOverhang = eaveElevSouth - overhang * Math.tan(pitchSouth);

        const zEaveNorth = ridgeZ - distNorth - overhang;
        const zEaveSouth = ridgeZ + distSouth + overhang;

        const ridgeNorth0 = new THREE.Vector3(ox - w / 2 - overhang, ridgeY, oz + ridgeZ);
        const ridgeNorth1 = new THREE.Vector3(ox + w / 2 + overhang, ridgeY, oz + ridgeZ);
        const eaveNorth0 = new THREE.Vector3(ox - w / 2 - overhang, yEaveNorthWithOverhang, oz + zEaveNorth);
        const eaveNorth1 = new THREE.Vector3(ox + w / 2 + overhang, yEaveNorthWithOverhang, oz + zEaveNorth);
        meshes.push(new THREE.Mesh(roofQuadGeometry(ridgeNorth0, ridgeNorth1, eaveNorth1, eaveNorth0), mat.clone()));

        const ridgeSouth0 = new THREE.Vector3(ox + w / 2 + overhang, ridgeY, oz + ridgeZ);
        const ridgeSouth1 = new THREE.Vector3(ox - w / 2 - overhang, ridgeY, oz + ridgeZ);
        const eaveSouth0 = new THREE.Vector3(ox + w / 2 + overhang, yEaveSouthWithOverhang, oz + zEaveSouth);
        const eaveSouth1 = new THREE.Vector3(ox - w / 2 - overhang, yEaveSouthWithOverhang, oz + zEaveSouth);
        meshes.push(new THREE.Mesh(roofQuadGeometry(ridgeSouth0, ridgeSouth1, eaveSouth1, eaveSouth0), mat.clone()));

        const ridgeLineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ox - w / 2, ridgeY, oz + ridgeZ),
            new THREE.Vector3(ox + w / 2, ridgeY, oz + ridgeZ),
        ]);
        meshes.push(new THREE.Line(ridgeLineGeo, new THREE.LineBasicMaterial({ color: 0x4a3728 })));
    } else {
        const ridgeX = geom.ridgeXMm * scale;
        const distWest = geom.distWestMm * scale;
        const distEast = geom.distEastMm * scale;
        const pitchWest = geom.pitchWestRad;
        const pitchEast = geom.pitchEastRad;
        const riseWest = geom.riseWestMm * scale;
        const riseEast = geom.riseEastMm * scale;
        const eaveElevWest = topElevation + ridgeHeight - riseWest;
        const eaveElevEast = topElevation + ridgeHeight - riseEast;
        const yEaveWestWithOverhang = eaveElevWest - overhang * Math.tan(pitchWest);
        const yEaveEastWithOverhang = eaveElevEast - overhang * Math.tan(pitchEast);

        const xEaveWest = ridgeX - distWest - overhang;
        const xEaveEast = ridgeX + distEast + overhang;

        const ridgeWest0 = new THREE.Vector3(ox + ridgeX, ridgeY, oz - d / 2);
        const ridgeWest1 = new THREE.Vector3(ox + ridgeX, ridgeY, oz + d / 2);
        const eaveWest0 = new THREE.Vector3(ox + xEaveWest, yEaveWestWithOverhang, oz - d / 2 - overhang);
        const eaveWest1 = new THREE.Vector3(ox + xEaveWest, yEaveWestWithOverhang, oz + d / 2 + overhang);
        meshes.push(new THREE.Mesh(roofQuadGeometry(ridgeWest0, ridgeWest1, eaveWest1, eaveWest0), mat.clone()));

        const ridgeEast0 = new THREE.Vector3(ox + ridgeX, ridgeY, oz + d / 2);
        const ridgeEast1 = new THREE.Vector3(ox + ridgeX, ridgeY, oz - d / 2);
        const eaveEast0 = new THREE.Vector3(ox + xEaveEast, yEaveEastWithOverhang, oz + d / 2 + overhang);
        const eaveEast1 = new THREE.Vector3(ox + xEaveEast, yEaveEastWithOverhang, oz - d / 2 - overhang);
        meshes.push(new THREE.Mesh(roofQuadGeometry(ridgeEast0, ridgeEast1, eaveEast1, eaveEast0), mat.clone()));

        const ridgeLineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ox + ridgeX, ridgeY, oz - d / 2),
            new THREE.Vector3(ox + ridgeX, ridgeY, oz + d / 2),
        ]);
        meshes.push(new THREE.Line(ridgeLineGeo, new THREE.LineBasicMaterial({ color: 0x4a3728 })));
    }

    return meshes;
}

export function rebuild3D(allFloors, roofSpec, plan) {
    clearScene();
    if (!allFloors?.length) return;
    // v0.5/v1: 3D not implemented for polygon footprint / rooms-only
    const hasBlocks = allFloors[0]?.isBlock === true;
    if (!hasBlocks && (isV05(plan) || (isV1(plan) && !allFloors[0]?.footprint?.width))) {
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
    
    // For multi-block: find center offset to center the entire building
    let centerOffsetX = 0, centerOffsetZ = 0;
    if (hasBlocks) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const root of allFloors) {
            const pos = root.position ?? { x: 0, z: 0 };
            const fp = root.footprint ?? {};
            const bw = fp.width ?? 8000;
            const bd = fp.depth ?? 8000;
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x + bw);
            minZ = Math.min(minZ, pos.z);
            maxZ = Math.max(maxZ, pos.z + bd);
        }
        centerOffsetX = (minX + maxX) / 2 * scale;
        centerOffsetZ = (minZ + maxZ) / 2 * scale;
    }

    const meshByPath = {};
    let fi = 0;
    for (const root of allFloors) {
        const fp = root.footprint;
        const w = (fp?.width ?? 8000) * scale;
        const d = (fp?.depth ?? 8000) * scale;
        const tw = (root.wall?.thickness ?? 200) * scale;
        const th = (root.wall?.height ?? 2700) * scale;
        const elev = (root.elevation_mm ?? 0) * scale;
        
        // Block position offset
        const pos = root.position ?? { x: 0, z: 0 };
        const blockOffsetX = hasBlocks ? (pos.x * scale + w / 2 - centerOffsetX) : 0;
        const blockOffsetZ = hasBlocks ? (pos.z * scale + d / 2 - centerOffsetZ) : 0;
        
        const path = hasBlocks ? `blocks.${root.blockId}` : `floors.${fi}`;

        const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matFloor.clone());
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(blockOffsetX, elev, blockOffsetZ);
        scene3d.add(floorMesh);
        if (!meshByPath[path]) meshByPath[path] = [];
        meshByPath[path].push(floorMesh);

        const wallsLen = { front: w, back: w, left: d, right: d };
        const wallNames = ['front', 'right', 'back', 'left'];
        const wallSize = [[w, th, tw], [tw, th, d], [w, th, tw], [tw, th, d]];

        for (let i = 0; i < 4; i++) {
            const len = wallsLen[wallNames[i]];
            const openings = (root.openings ?? []).filter(o => o.wall === wallNames[i]);
            openings.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
            let wallPos = 0;
            const segs = [];
            for (const o of openings) {
                const oo = (o.offset ?? 0) * scale;
                const ow = (o.width ?? 900) * scale;
                if (oo > wallPos) segs.push({ start: wallPos, end: oo });
                wallPos = oo + ow;
            }
            if (wallPos < len) segs.push({ start: wallPos, end: len });

            const isX = wallNames[i] === 'front' || wallNames[i] === 'back';
            const [pw, ph, pd] = wallSize[i];
            for (const seg of segs) {
                const sw = (seg.end - seg.start);
                const segW = isX ? sw : pw;
                const segD = isX ? pd : sw;
                const geom = new THREE.BoxGeometry(segW, ph, segD);
                const mesh = new THREE.Mesh(geom, matWall.clone());
                const cx = (seg.start + seg.end) / 2;
                if (wallNames[i] === 'front') mesh.position.set(blockOffsetX - w / 2 + cx, elev + th / 2, blockOffsetZ - d / 2 + tw / 2);
                else if (wallNames[i] === 'back') mesh.position.set(blockOffsetX - w / 2 + cx, elev + th / 2, blockOffsetZ + d / 2 - tw / 2);
                else if (wallNames[i] === 'left') mesh.position.set(blockOffsetX - w / 2 + tw / 2, elev + th / 2, blockOffsetZ - d / 2 + cx);
                else mesh.position.set(blockOffsetX + w / 2 - tw / 2, elev + th / 2, blockOffsetZ - d / 2 + cx);
                scene3d.add(mesh);
                if (!meshByPath[path]) meshByPath[path] = [];
                meshByPath[path].push(mesh);
            }
        }

        // Derived interior walls (rooms-first)
        const walls = root.walls ?? [];
        for (let wi = 0; wi < walls.length; wi++) {
            const wall = walls[wi];
            const a = wall.a ?? {};
            const b = wall.b ?? {};
            const ax = Number(a.x ?? 0);
            const ay = Number(a.y ?? 0);
            const bx = Number(b.x ?? 0);
            const by = Number(b.y ?? 0);
            const thicknessMm = Number(wall.thicknessMm ?? 98);
            const heightMm = Number(wall.heightMm ?? root.wall?.height ?? 2700);
            const mesh = wallSegmentMesh(ax, ay, bx, by, thicknessMm, heightMm, scale, blockOffsetX, blockOffsetZ, w, d, elev, plan, wall.materialId);
            scene3d.add(mesh);
            if (!meshByPath[path]) meshByPath[path] = [];
            meshByPath[path].push(mesh);
        }

        // For blocks: each block has its own roof – møne/raft beregnes, tak tegnes i forhold til blokkens senter
        if (hasBlocks && root.roof) {
            const eaveMm = root.roof.eave_height_mm;
            const topY = eaveMm != null ? eaveMm * scale : (elev + th);
            const roofMeshes = buildRoofMeshes(root.roof, topY, fp?.width ?? 8000, fp?.depth ?? 8000, blockOffsetX, blockOffsetZ);
            for (const m of roofMeshes) scene3d.add(m);
        }
        
        fi++;
    }

    scene3d.userData.meshesByPath = meshByPath;

    // Global roof for non-block plans
    if (!hasBlocks && roofSpec && allFloors.length > 0) {
        const lastRoot = allFloors[allFloors.length - 1];
        const eaveMm = roofSpec.eave_height_mm;
        const topY = eaveMm != null
            ? eaveMm * scale
            : (lastRoot.elevation_mm ?? 0) * scale + (lastRoot.wall?.height ?? 2700) * scale;
        const lastW = lastRoot.footprint?.width ?? 8000;
        const lastD = lastRoot.footprint?.depth ?? 8000;
        buildRoofMeshes(roofSpec, topY, lastW, lastD).forEach(m => scene3d.add(m));
    }

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
