/**
 * AI House Planner — Entry Point
 * Vanilla JS, no bundler, Three.js lokalt
 */

import { init3D } from './modules/render3d.js';
import { updateUI, setupEventHandlers } from './modules/ui.js';

function setup() {
    init3D();
    setupEventHandlers();
    updateUI();
}

setup();
