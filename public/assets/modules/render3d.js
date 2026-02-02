/**
 * 3D rendering with Three.js
 */

import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { scene3d, renderer3d, camera3d, controls3d, set3DContext } from './state.js';
import { isV05, isV1 } from './parse.js';

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

function buildRoofMeshes(roofSpec, topElevation, width, depth) {
    const meshes = [];
    if (!roofSpec || roofSpec.type !== 'gable') return meshes;
    const scale = 0.001;
    const pitch = (roofSpec.pitch_degrees ?? 35) * Math.PI / 180;
    const overhang = (roofSpec.overhang_mm ?? 500) * scale;
    const ridgeOffsetMm = roofSpec.ridge_offset_mm ?? 0;
    const ridgeMode = roofSpec.ridge_mode ?? 'equal_pitch'; // 'equal_pitch' eller 'equal_eave'
    const ridgeDir = roofSpec.ridge_direction ?? 'x';
    
    // Material - rødbrun takstein
    const mat = new THREE.MeshLambertMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
    
    // Dimensjoner i 3D-enheter (meter)
    const w = width * scale;
    const d = depth * scale;
    const wWithOverhang = w + overhang * 2;
    const dWithOverhang = d + overhang * 2;
    
    if (ridgeDir === 'x') {
        // Møne går øst-vest (parallelt med X-aksen)
        // Ridge offset påvirker Z-posisjon (positiv = mot sør/+Z)
        const ridgeOffsetScaled = ridgeOffsetMm * scale;
        const ridgeZ = ridgeOffsetScaled; // relative to center
        
        // Avstand fra hver side til mønet (horisontal)
        const distNorth = d / 2 + ridgeZ; // nord side (negativ Z) - økt hvis ridge mot sør
        const distSouth = d / 2 - ridgeZ; // sør side (positiv Z) - redusert hvis ridge mot sør
        
        let ridgeHeight, eaveElevNorth, eaveElevSouth, pitchNorth, pitchSouth;
        
        if (ridgeMode === 'equal_pitch') {
            // Begge takflater har samme pitch - gesimshøyde justeres
            pitchNorth = pitch;
            pitchSouth = pitch;
            ridgeHeight = Math.tan(pitch) * Math.max(distNorth, distSouth);
            // Beregn gesimshøyde for hver side
            eaveElevNorth = topElevation + ridgeHeight - Math.tan(pitch) * distNorth;
            eaveElevSouth = topElevation + ridgeHeight - Math.tan(pitch) * distSouth;
        } else {
            // equal_eave: Samme gesimshøyde - pitch justeres
            eaveElevNorth = topElevation;
            eaveElevSouth = topElevation;
            // Finn ridgeHeight fra lengste side
            const ridgeHeightNorth = Math.tan(pitch) * distNorth;
            const ridgeHeightSouth = Math.tan(pitch) * distSouth;
            ridgeHeight = Math.max(ridgeHeightNorth, ridgeHeightSouth);
            // Beregn faktisk pitch for hver side
            pitchNorth = Math.atan(ridgeHeight / distNorth);
            pitchSouth = Math.atan(ridgeHeight / distSouth);
        }
        
        const overhangSlopeLenNorth = overhang / Math.cos(pitchNorth);
        const overhangSlopeLenSouth = overhang / Math.cos(pitchSouth);
        
        // Takflate nord (fra negativ Z til ridge)
        const slopeLenNorth = Math.sqrt(distNorth * distNorth + ridgeHeight * ridgeHeight);
        const totalSlopeLenNorth = slopeLenNorth + overhangSlopeLenNorth;
        const planeNorth = new THREE.PlaneGeometry(wWithOverhang, totalSlopeLenNorth);
        const meshNorth = new THREE.Mesh(planeNorth, mat.clone());
        meshNorth.rotation.x = Math.PI / 2 - pitchNorth;
        const zEaveNorth = ridgeZ - distNorth;
        const zEaveNorthWithOverhang = zEaveNorth - overhang;
        const centerZNorth = (ridgeZ + zEaveNorthWithOverhang) / 2;
        const yEaveNorthWithOverhang = eaveElevNorth - overhang * Math.tan(pitchNorth);
        const yRidgeNorth = eaveElevNorth + ridgeHeight;
        const centerYNorth = (yRidgeNorth + yEaveNorthWithOverhang) / 2;
        meshNorth.position.set(0, centerYNorth, centerZNorth);
        meshes.push(meshNorth);
        
        // Takflate sør (fra ridge til positiv Z)
        const slopeLenSouth = Math.sqrt(distSouth * distSouth + ridgeHeight * ridgeHeight);
        const totalSlopeLenSouth = slopeLenSouth + overhangSlopeLenSouth;
        const planeSouth = new THREE.PlaneGeometry(wWithOverhang, totalSlopeLenSouth);
        const meshSouth = new THREE.Mesh(planeSouth, mat.clone());
        meshSouth.rotation.x = -(Math.PI / 2 - pitchSouth);
        const zEaveSouth = ridgeZ + distSouth;
        const zEaveSouthWithOverhang = zEaveSouth + overhang;
        const centerZSouth = (ridgeZ + zEaveSouthWithOverhang) / 2;
        const yEaveSouthWithOverhang = eaveElevSouth - overhang * Math.tan(pitchSouth);
        const yRidgeSouth = eaveElevSouth + ridgeHeight;
        const centerYSouth = (yRidgeSouth + yEaveSouthWithOverhang) / 2;
        meshSouth.position.set(0, centerYSouth, centerZSouth);
        meshes.push(meshSouth);
        
    } else {
        // Møne går nord-sør (parallelt med Z-aksen)
        // Ridge offset påvirker X-posisjon (positiv = mot øst/+X)
        const ridgeOffsetScaled = ridgeOffsetMm * scale;
        const ridgeX = ridgeOffsetScaled; // relative to center
        
        // Avstand fra hver side til mønet (horisontal)
        const distWest = w / 2 + ridgeX; // vest side (negativ X) - økt hvis ridge mot øst
        const distEast = w / 2 - ridgeX; // øst side (positiv X) - redusert hvis ridge mot øst
        
        let ridgeHeight, eaveElevWest, eaveElevEast, pitchWest, pitchEast;
        
        if (ridgeMode === 'equal_pitch') {
            // Begge takflater har samme pitch - gesimshøyde justeres
            pitchWest = pitch;
            pitchEast = pitch;
            ridgeHeight = Math.tan(pitch) * Math.max(distWest, distEast);
            eaveElevWest = topElevation + ridgeHeight - Math.tan(pitch) * distWest;
            eaveElevEast = topElevation + ridgeHeight - Math.tan(pitch) * distEast;
        } else {
            // equal_eave: Samme gesimshøyde - pitch justeres
            eaveElevWest = topElevation;
            eaveElevEast = topElevation;
            const ridgeHeightWest = Math.tan(pitch) * distWest;
            const ridgeHeightEast = Math.tan(pitch) * distEast;
            ridgeHeight = Math.max(ridgeHeightWest, ridgeHeightEast);
            pitchWest = Math.atan(ridgeHeight / distWest);
            pitchEast = Math.atan(ridgeHeight / distEast);
        }
        
        const overhangSlopeLenWest = overhang / Math.cos(pitchWest);
        const overhangSlopeLenEast = overhang / Math.cos(pitchEast);
        
        // Takflate vest (fra negativ X til ridge)
        const slopeLenWest = Math.sqrt(distWest * distWest + ridgeHeight * ridgeHeight);
        const totalSlopeLenWest = slopeLenWest + overhangSlopeLenWest;
        const planeWest = new THREE.PlaneGeometry(totalSlopeLenWest, dWithOverhang);
        const meshWest = new THREE.Mesh(planeWest, mat.clone());
        meshWest.rotation.z = -(Math.PI / 2 - pitchWest);
        const xEaveWest = ridgeX - distWest;
        const xEaveWestWithOverhang = xEaveWest - overhang;
        const centerXWest = (ridgeX + xEaveWestWithOverhang) / 2;
        const yEaveWestWithOverhang = eaveElevWest - overhang * Math.tan(pitchWest);
        const yRidgeWest = eaveElevWest + ridgeHeight;
        const centerYWest = (yRidgeWest + yEaveWestWithOverhang) / 2;
        meshWest.position.set(centerXWest, centerYWest, 0);
        meshes.push(meshWest);
        
        // Takflate øst (fra ridge til positiv X)
        const slopeLenEast = Math.sqrt(distEast * distEast + ridgeHeight * ridgeHeight);
        const totalSlopeLenEast = slopeLenEast + overhangSlopeLenEast;
        const planeEast = new THREE.PlaneGeometry(totalSlopeLenEast, dWithOverhang);
        const meshEast = new THREE.Mesh(planeEast, mat.clone());
        meshEast.rotation.z = Math.PI / 2 - pitchEast;
        const xEaveEast = ridgeX + distEast;
        const xEaveEastWithOverhang = xEaveEast + overhang;
        const centerXEast = (ridgeX + xEaveEastWithOverhang) / 2;
        const yEaveEastWithOverhang = eaveElevEast - overhang * Math.tan(pitchEast);
        const yRidgeEast = eaveElevEast + ridgeHeight;
        const centerYEast = (yRidgeEast + yEaveEastWithOverhang) / 2;
        meshEast.position.set(centerXEast, centerYEast, 0);
        meshes.push(meshEast);
    }
    
    return meshes;
}

export function rebuild3D(allFloors, roofSpec, plan) {
    clearScene();
    if (!allFloors?.length) return;
    // v0.5/v1: 3D not implemented for polygon footprint / rooms-only
    if ((isV05(plan) || (isV1(plan) && !allFloors[0]?.footprint?.width))) {
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
    let topY = 0;
    let lastW = 8000, lastD = 8000;

    const meshByPath = {};
    let fi = 0;
    for (const root of allFloors) {
        const fp = root.footprint;
        const w = (fp?.width ?? 8000) * scale;
        const d = (fp?.depth ?? 8000) * scale;
        const tw = (root.wall?.thickness ?? 200) * scale;
        const th = (root.wall?.height ?? 2700) * scale;
        const elev = (root.elevation_mm ?? 0) * scale;
        topY = elev + th;
        lastW = (fp?.width ?? 8000);
        lastD = (fp?.depth ?? 8000);
        const path = `floors.${fi}`;

        const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matFloor.clone());
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, elev, 0);
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
            let pos = 0;
            const segs = [];
            for (const o of openings) {
                const oo = (o.offset ?? 0) * scale;
                const ow = (o.width ?? 900) * scale;
                if (oo > pos) segs.push({ start: pos, end: oo });
                pos = oo + ow;
            }
            if (pos < len) segs.push({ start: pos, end: len });

            const isX = wallNames[i] === 'front' || wallNames[i] === 'back';
            const [pw, ph, pd] = wallSize[i];
            for (const seg of segs) {
                const sw = (seg.end - seg.start);
                const segW = isX ? sw : pw;
                const segD = isX ? pd : sw;
                const geom = new THREE.BoxGeometry(segW, ph, segD);
                const mesh = new THREE.Mesh(geom, matWall.clone());
                const cx = (seg.start + seg.end) / 2;
                if (wallNames[i] === 'front') mesh.position.set(-w / 2 + cx, elev + th / 2, -d / 2 + tw / 2);
                else if (wallNames[i] === 'back') mesh.position.set(-w / 2 + cx, elev + th / 2, d / 2 - tw / 2);
                else if (wallNames[i] === 'left') mesh.position.set(-w / 2 + tw / 2, elev + th / 2, -d / 2 + cx);
                else mesh.position.set(w / 2 - tw / 2, elev + th / 2, -d / 2 + cx);
                scene3d.add(mesh);
                if (!meshByPath[path]) meshByPath[path] = [];
                meshByPath[path].push(mesh);
            }
        }
        fi++;
    }

    scene3d.userData.meshesByPath = meshByPath;

    if (roofSpec) {
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
