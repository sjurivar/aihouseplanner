<?php /** @var array $data */ $baseUrl = $data['baseUrl'] ?? 'http://localhost'; $basePath = rtrim(parse_url($baseUrl, PHP_URL_PATH) ?? '/', '/') ?: '/'; ?>
<!DOCTYPE html>
<html lang="nb">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI House Planner</title>
    <link rel="stylesheet" href="<?= htmlspecialchars($basePath) ?>/assets/styles.css">
    <script type="importmap">
    {
        "imports": {
            "three": "<?= htmlspecialchars($basePath) ?>/vendor/three.module.js"
        }
    }
    </script>
</head>
<body>
    <header>
        <h1>AI House Planner</h1>
        <div class="actions">
            <button type="button" id="btnNew">Ny</button>
            <button type="button" id="btnOpen">Hent</button>
            <input type="file" id="fileInput" accept=".json" hidden>
            <button type="button" id="btnSave">Lagre</button>
            <div class="dropdown-wrap">
                <button type="button" id="btnAdd" aria-haspopup="listbox" aria-expanded="false">Legg til ▾</button>
                <ul id="addMenu" class="add-menu" role="menu" hidden>
                    <li role="none"><button type="button" role="menuitem" data-add="block">Bygningskropp (blokk)</button></li>
                    <li role="none"><button type="button" role="menuitem" data-add="floor">Etasje</button></li>
                    <li role="none"><button type="button" role="menuitem" data-add="room">Rom</button></li>
                </ul>
            </div>
            <span class="actions-sep">|</span>
            <label>Sample:
                <select id="loadSampleDropdown">
                    <option value="">— velg sample —</option>
                    <option value="v0">v0 (enkel etasje)</option>
                    <option value="v0.3">v0.3 (symmetrisk tak)</option>
                    <option value="v0.3-asym-pitch">v0.3 (asym. lik takvinkel)</option>
                    <option value="v0.3-asym-eave">v0.3 (asym. lik gesimshøyde)</option>
                    <option value="v0.4-L">v0.4 L-hus</option>
                    <option value="v0.4-T">v0.4 T-hus</option>
                    <option value="v0.4-H">v0.4 H-hus</option>
                    <option value="v0.5">v0.5 (rooms-first)</option>
                    <option value="v1">v1 (rom + vegger + trapp)</option>
                </select>
            </label>
            <button type="button" id="generatePlan" title="Krever OPENAI_API_KEY i .env">Generer plan</button>
            <button type="button" id="exportSvg">Eksporter SVG</button>
        </div>
    </header>

    <main>
        <section class="main-grid">
            <aside class="json-tree-panel">
                <h2>JSON-struktur</h2>
                <div id="jsonTree" class="json-tree"></div>
                <ul id="validationErrors"></ul>
            </aside>
            <div class="preview-column">
                <div class="panel">
                    <div class="panel-2d-header">
                        <h2>2D (SVG)</h2>
                        <label>Etasje: <select id="floorDropdown"></select></label>
                        <label class="checkbox-label"><input type="checkbox" id="showRidgeLine" title="Vis møneplassering som stiplet linje på romplan"> Vis møne</label>
                    </div>
                    <div id="svgContainer"></div>
                </div>
                <div class="panel elevation-panel">
                    <h2>Fasader (alle etasjer + tak)</h2>
                    <div class="elevation-grid">
                        <div class="elevation-cell">
                            <h3>Nord</h3>
                            <div class="elevation-svg" data-direction="nord"></div>
                        </div>
                        <div class="elevation-cell">
                            <h3>Sør</h3>
                            <div class="elevation-svg" data-direction="sor"></div>
                        </div>
                        <div class="elevation-cell">
                            <h3>Øst</h3>
                            <div class="elevation-svg" data-direction="ost"></div>
                        </div>
                        <div class="elevation-cell">
                            <h3>Vest</h3>
                            <div class="elevation-svg" data-direction="vest"></div>
                        </div>
                    </div>
                    <details class="facade-log-details">
                        <summary>Beregninger (fasade)</summary>
                        <div class="facade-log-toolbar">
                            <label>Retning: <select id="facadeLogDirection">
                                <option value="nord">Nord (sørfasade)</option>
                                <option value="sor">Sør (nordfasade)</option>
                                <option value="ost">Øst (vestfasade)</option>
                                <option value="vest">Vest (østfasade)</option>
                            </select></label>
                        </div>
                        <pre id="facadeLogOutput" class="facade-log-pre"></pre>
                    </details>
                </div>
                <div class="panel">
                    <h2>3D</h2>
                    <div class="panel-3d-header">
                        <button type="button" id="render3dBtn">Render 3D</button>
                    </div>
                    <div id="canvas3dWrap">
                        <canvas id="canvas3d"></canvas>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <div id="generateModal" class="modal" hidden>
        <div class="modal-content">
            <h3>Generer plan</h3>
            <textarea id="promptInput" rows="4" placeholder="Beskriv huset: antall etasjer, rom, vinduer, dører..."></textarea>
            <div class="modal-actions">
                <button type="button" id="generateSubmit">Generer</button>
                <button type="button" id="generateCancel">Avbryt</button>
            </div>
        </div>
    </div>

    <div id="editPropsModal" class="modal" hidden>
        <div class="modal-content edit-props-content">
            <h3 id="editPropsTitle">Rediger</h3>
            <div id="editPropsForm"></div>
            <div class="modal-actions">
                <button type="button" id="editPropsSave">Lagre</button>
                <button type="button" id="editPropsCancel">Avbryt</button>
            </div>
        </div>
    </div>

    <script type="module" src="<?= htmlspecialchars($basePath) ?>/assets/app.js"></script>
</body>
</html>
