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

## Standard-sjekk

```bash
./tools/standard-check.sh
```

Kjøres automatisk ved push/PR via `.github/workflows/standard.yml`.

## Teknologi

- **Backend:** PHP (ingen node)
- **Frontend:** HTML/CSS/JS + SVG (2D) + Three.js (3D), servert lokalt (ingen CDN, ingen bundler)
- **OpenAI:** API-kall via PHP backend (key aldri til frontend)
