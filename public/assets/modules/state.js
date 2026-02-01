/**
 * Global state management
 */

export let plan = null;
export let selectedFloorId = null;
export let scene3d = null;
export let renderer3d = null;
export let camera3d = null;
export let controls3d = null;

export function setPlan(newPlan) {
    plan = newPlan;
}

export function setSelectedFloorId(id) {
    selectedFloorId = id;
}

export function set3DContext(scene, renderer, camera, controls) {
    scene3d = scene;
    renderer3d = renderer;
    camera3d = camera;
    controls3d = controls;
}
