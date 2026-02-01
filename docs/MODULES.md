# JavaScript Modulstruktur

## Oversikt

`app.js` (1301 linjer) er delt opp i 7 moduler + entry point:

| Modul | Linjer | Ansvar |
|-------|--------|--------|
| `state.js` | ~25 | Global state (plan, selectedFloorId, scene3d, renderer3d, camera3d, controls3d) |
| `parse.js` | ~168 | Format-deteksjon (v0/v0.3/v0.5/v1), getFloorList, getActivePlanRoot, getAllFloorRoots, getDefaults |
| `validate.js` | ~35 | Client-side validering (validatePlan) |
| `render2d.js` | ~430 | SVG-rendering (render2D, render2Dv1, render2Dv05, render2Dv0, exportSvg, geometry helpers) |
| `render3d.js` | ~230 | Three.js 3D-rendering (init3D, clearScene, rebuild3D, addGroundAndHorizon, buildRoofMeshes) |
| `tree.js` | ~270 | JSON-hierarki (buildPlanHierarchy, renderJsonTree, setTreeHighlight, showTreeEditModal, getDataByPath, applyTreeEdit) |
| `ui.js` | ~155 | UI event handlers (updateUI, loadSample, generatePlan, downloadJson, setupEventHandlers) |
| **`app.js`** | **~12** | **Entry point (init + setup)** |

## Import-struktur

```
app.js
├── render3d.js (init3D)
│   ├── three (external)
│   ├── OrbitControls (external)
│   ├── state.js
│   └── parse.js (isV05, isV1)
└── ui.js (setupEventHandlers, updateUI)
    ├── state.js
    ├── parse.js (parseJson, getFloorList, getActivePlanRoot, getAllFloorRoots)
    ├── validate.js
    │   └── parse.js (isV1, getAllFloorRoots)
    ├── render2d.js (render2D, exportSvg)
    │   └── parse.js (isV1, isV05)
    ├── render3d.js (clearScene, rebuild3D)
    └── tree.js (renderJsonTree)
        ├── parse.js (isV05)
        └── state.js (scene3d)
```

## Fordeler

✅ **Lettere navigering** – hver fil har ett klart ansvarsområde  
✅ **Raskere debugging** – færre linjer å lete i (12-430 vs 1301)  
✅ **Enklere testing** – kan teste moduler isolert  
✅ **Bedre samarbeid** – mindre merge-konflikter  
✅ **Ingen bundler** – ES modules fungerer direkte i nettleseren

## Import/Export-eksempler

### state.js
```javascript
export let plan = null;
export function setPlan(newPlan) { plan = newPlan; }
```

### parse.js
```javascript
export function isV1(plan) { ... }
export function getFloorList(plan) { ... }
```

### app.js (entry point)
```javascript
import { init3D } from './modules/render3d.js';
import { updateUI, setupEventHandlers } from './modules/ui.js';

function setup() {
    init3D();
    setupEventHandlers();
    updateUI();
}
setup();
```

## Andre filer sjekket

PHP-filene er OK (ikke for store):
- `PlanGenerator.php`: 99 linjer
- `PlanValidator.php`: 179 linjer
- `PlanController.php`: 101 linjer
