# AI House Planner

AI → JSON plan → Web preview (2D/3D) → senere eksport til SketchUp.

App basert på [platform-standard](https://github.com/sjurivar/platform-standard).

## Oppstart

1. **Kopier** `.env.example` til `.env`
2. **Sett** `OPENAI_API_KEY=sk-...` i `.env` (valgfritt — uten key fungerer sample, men ikke "Generate plan")
3. **Sett** `BASE_URL` (f.eks. `http://localhost/main-projects/aihouseplanner/public`)
4. **Kjør** `composer install`
5. **Sett** web root til `public/` (Apache: DocumentRoot, .htaccess for routing)
6. **Åpne** `http://localhost/` (eller BASE_URL)
7. **Klikk** "Load sample" for å laste eksempel med 2 etasjer og tak

## Plan of Record

Se [docs/PLAN_OF_RECORD.md](docs/PLAN_OF_RECORD.md) for:
- mapper og konvensjoner
- hvordan vi kjører lokalt
- hvordan vi legger inn secrets (OPENAI_API_KEY)
- MVP-endepunkter og filer

## JSON-format

Se [docs/json-building-format.md](docs/json-building-format.md) for full spesifikasjon.

Eksempler: `examples/plan.v0.single.json`, `examples/plan.v0.3.two_floors_roof.json`

### Derived walls (rooms-first)

Innvendige vegger er **avledet** fra rompolygoner: kun kanter som deles av nøyaktig to rom blir vegg-segmenter. Veggene lagres i `plan.derived.wallsByLevel[blockId:levelId]` og regenereres når rom lagres (modal), dras/slippes eller legges til. Segmenter matches med EPS=5mm snapping. Veggtykkelse kommer fra `plan.defaults.wallRules.interior.thicknessMm` (eller `betweenUnits`), med fallback til `room.wall_thickness_mm`.

### Materialer

Materialer settes i rekkefølge: **defaults** (plan) → **blokk** → **rom**. I blokk-modal kan du velge gulv/vegg/tak/roof; i rom-modal gulv/vegg/tak. Avledede vegger får materiale fra samme hierarki (default → blokk → rom). `plan.materialLibrary` inneholder tilgjengelige materialer (id, name, category, color).

## Standard-sjekk

```bash
./tools/standard-check.sh
```

Kjøres automatisk ved push/PR via `.github/workflows/standard.yml`.

## Teknologi

- **Backend:** PHP (ingen node)
- **Frontend:** HTML/CSS/JS + SVG (2D) + Three.js (3D), servert lokalt (ingen CDN, ingen bundler)
- **OpenAI:** API-kall via PHP backend (key aldri til frontend)
