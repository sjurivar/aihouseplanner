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
            <label class="btn-file">
                <input type="file" id="fileInput" accept=".json" hidden>
                Last fil
            </label>
            <label>Last sample:
                <select id="loadSampleDropdown">
                    <option value="">— velg —</option>
                    <option value="v0">v0 (enkel etasje)</option>
                    <option value="v0.3">v0.3 (symmetrisk tak)</option>
                    <option value="v0.3-asym">v0.3 (asymmetrisk tak)</option>
                    <option value="v0.5">v0.5 (rooms-first, skråtak)</option>
                    <option value="v1">v1 (rom + vegger + trapp)</option>
                </select>
            </label>
            <button type="button" id="generatePlan" title="Krever OPENAI_API_KEY i .env">Generate plan</button>
            <button type="button" id="downloadJson">Download JSON</button>
            <button type="button" id="exportSvg">Export SVG</button>
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
                    </div>
                    <div id="svgContainer"></div>
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

    <script type="module" src="<?= htmlspecialchars($basePath) ?>/assets/app.js"></script>
</body>
</html>
