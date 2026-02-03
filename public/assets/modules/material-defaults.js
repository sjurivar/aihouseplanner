/**
 * Default material library and plan defaults for materials and wall rules.
 * Used for migration and new plans.
 */

export const DEFAULT_MATERIAL_LIBRARY = [
    { id: 'default_floor', name: 'Standard gulv', category: 'floor', color: '#d4a574' },
    { id: 'default_wall', name: 'Standard vegg', category: 'wall', color: '#c4b8a8' },
    { id: 'default_ceiling', name: 'Standard tak (innvendig)', category: 'ceiling', color: '#e8e8e8' },
    { id: 'default_roof', name: 'Standard tak (utvendig)', category: 'roof', color: '#8b4513' },
];

export const DEFAULT_MATERIALS = {
    floor: 'default_floor',
    wall: 'default_wall',
    ceiling: 'default_ceiling',
    roof: 'default_roof',
};

export const DEFAULT_WALL_RULES = {
    interior: { thicknessMm: 98 },
    betweenUnits: { thicknessMm: 200 },
};

/**
 * Ensure plan has materialLibrary, defaults.materials, defaults.wallRules.
 * Does not mutate; returns new defaults object or plan.defaults merged.
 */
export function ensureMaterialDefaults(plan) {
    if (!plan || typeof plan !== 'object') return plan;
    const def = plan.defaults ?? {};
    const materials = def.materials ?? DEFAULT_MATERIALS;
    const wallRules = def.wallRules ?? DEFAULT_WALL_RULES;
    return {
        ...def,
        wall: def.wall ?? { thickness_mm: 200, height_mm: 2700 },
        materials: { ...DEFAULT_MATERIALS, ...materials },
        wallRules: { ...DEFAULT_WALL_RULES, ...wallRules },
    };
}

/**
 * Ensure plan has materialLibrary. Mutates plan if missing.
 */
export function ensureMaterialLibrary(plan) {
    if (!plan || typeof plan !== 'object') return;
    if (!Array.isArray(plan.materialLibrary) || plan.materialLibrary.length === 0) {
        plan.materialLibrary = [...DEFAULT_MATERIAL_LIBRARY];
    }
}

/**
 * Ensure plan has derived.wallsByLevel object (empty if not present).
 */
export function ensureDerivedStructure(plan) {
    if (!plan || typeof plan !== 'object') return;
    if (!plan.derived || typeof plan.derived !== 'object') {
        plan.derived = { wallsByLevel: {} };
    }
    if (typeof plan.derived.wallsByLevel !== 'object') {
        plan.derived.wallsByLevel = {};
    }
}
