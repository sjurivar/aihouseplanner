# Sjekkliste — overholdelse av standard

Sjekk at appen følger platform-standard. Bruk `./tools/standard-check.sh` for automatisk validering.

## MVP (obligatorisk)

- [ ] Alle nødvendige mapper finnes (se tools/standard-check.sh)
- [ ] `public/index.php` er front controller
- [ ] Ingen SQL-ord (SELECT/INSERT/UPDATE/DELETE) i `app/Http/Controllers/` eller `app/Views/`
- [ ] Forretningslogikk i `app/Domain/`, ikke i controllers
- [ ] Lesing (rapporter, aggregering) i `app/Data/Queries/`
- [ ] Persistens per entitet i `app/Data/Repositories/`
- [ ] Auth via webtjeneste, ikke lokal implementasjon
- [ ] Tunge operasjoner (import, batch) kjøres via `bin/console`, ikke i web-request

## Anbefalt

- [ ] Én klasse per fil, forutsigbar navngiving
- [ ] Korte filer (< 150–200 linjer)
- [ ] Tynne controllers — kun input → service/query → respons
- [ ] Migrasjoner i `database/migrations/` for schema-endringer
- [ ] Dokumenter beslutninger i `docs/adr/`
