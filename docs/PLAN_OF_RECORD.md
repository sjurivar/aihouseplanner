# Plan of Record — AI House Planner

## Plassering i platformstandard

Denne appen følger [platform-standard](https://github.com/sjurivar/platform-standard).

### mapper og konvensjoner

| Område | Bruk |
|--------|------|
| `app/Http/Controllers/` | Tynne controllers — API-endepunkter, input → service → respons |
| `app/Domain/` | Forretningslogikk: PlanGenerator, PlanValidator |
| `app/Data/Queries/` | (reservert for rapporter/aggregat) |
| `app/Data/Repositories/` | (reservert for persistens) |
| `app/Support/` | Config, Db, Logger, Response, Router |
| `app/Views/` | HTML-maler (f.eks. app.php) |
| `routes/web.php` | Web-ruter |
| `public/` | Web root — index.php (front controller), assets/, vendor/ |
| `public/assets/` | app.js, styles.css |
| `public/vendor/` | three.module.js, OrbitControls.js (lokalt) |
| `schemas/` | building.plan.schema.json |
| `examples/` | plan.v0.single.json, plan.v0.3.two_floors_roof.json |
| `docs/` | json-building-format.md, PLAN_OF_RECORD.md, adr/ |
| `config/` | Miljøvariabler |

### Kjøre lokalt

1. Sett web root til `public/` (Apache: DocumentRoot, Nginx: root)
2. Kopier `.env.example` til `.env`
3. `composer install`
4. Åpne `http://localhost/` (eller tilsvarende BASE_URL)

XAMPP: Sett virtual host eller bruk `http://localhost/main-projects/aihouseplanner/public/`

### Secrets (OPENAI_API_KEY)

- Legg `OPENAI_API_KEY=sk-...` i `.env` (aldri i kode)
- Appen leser via `$_ENV['OPENAI_API_KEY']` (lastes i public/index.php)
- Hvis key mangler: "Generate plan" er deaktivert, sample fungerer alltid

### MVP-endepunkter

| Endpoint | Metode | Beskrivelse |
|----------|--------|-------------|
| `/` | GET | Hovedside (HTML + app) |
| `/health` | GET | Health-check |
| `/api/sample` | GET | Returnerer sample plan JSON (v0.3) |
| `/api/plan` | POST | Genererer plan via OpenAI, body: `{ "prompt": "..." }` |

### MVP-filer

- `public/index.php` — front controller
- `routes/web.php` — ruteregistrering
- `app/Http/Controllers/PlanController.php` — /api/plan, /api/sample
- `app/Http/Controllers/AppController.php` — / (HTML-side)
- `app/Domain/PlanGenerator.php` — OpenAI-integrasjon
- `app/Domain/PlanValidator.php` — validering av plan-JSON
- `app/Views/app.php` — hovedside HTML
- `public/assets/app.js` — frontend-logikk (2D SVG, 3D Three.js, load/export)
- `public/assets/styles.css` — styling
- `schemas/building.plan.schema.json` — JSON Schema
- `examples/*.json` — Sample planer
- `docs/json-building-format.md` — JSON-spesifikasjon
