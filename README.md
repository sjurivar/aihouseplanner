# Template-app — platform-standard

Mal for nye applikasjoner som følger [platform-standard](https://github.com/sjurivar/platform-standard). Minimal oppsett: struktur, standard-sjekk, og «golden path»-eksempler.

## Slik starter du en ny app fra denne malen

1. **Kopier** hele `template-app`-mappen til ditt prosjekt (eller clone platform-standard og arbeid i `template-app/`).
2. **Oppdater** `composer.json`: endre `name` til ditt prosjekt (f.eks. `mittfirma/min-app`).
3. **Kopier** `.env.example` til `.env` og fyll inn DB, BASE_URL osv.
4. **Kjør** `composer install`.
5. **Sett** web root til `public/` (Apache/Nginx: document root = `public`).
6. **Verifiser:** `./tools/standard-check.sh` skal vise «Alt OK».
7. **Test:** Besøk `/` eller `/health`, og kjør `php bin/console health`.

## Hvor legger jeg kode?

| Område | Bruk til |
|--------|----------|
| `app/Http/Controllers/` | Tynne HTTP-controllers. Kun input → service/query → respons. |
| `app/Http/Middleware/` | HTTP-mellomlag (auth, logging). |
| `app/Domain/` | Forretningslogikk, tjenester. |
| `app/Data/Repositories/` | CRUD + enkle lese-spørringer per entitet. |
| `app/Data/Queries/` | Kun lesing: rapporter, aggregering. |
| `app/Views/` | HTML-maler. |
| `app/Support/` | Config, Db, Logger, Router, Response-hjelpere. |
| `routes/web.php` | Web-ruter. |
| `bin/console` | CLI-kommandoer. |
| `database/migrations/` | Schema-migrasjoner. |

## Hvordan kjører jeg standard-sjekken?

```bash
./tools/standard-check.sh
```

Sjekken verifiserer at:
- Nødvendige mapper og filer finnes
- Ingen SQL (SELECT/INSERT/UPDATE/DELETE) i controllers eller views

Kjøres automatisk ved push/pull_request via `.github/workflows/standard.yml`.

## Slik oppdaterer du standard-binding

Oppdater `STANDARD.md` med versjon/commit fra platform-standard når du henter endringer.

## TODO

- Integrasjon mot auth-webtjeneste (se `docs/auth-tjeneste.md` i platform-standard).
- Valgfritt: vlucas/phpdotenv for .env-innlasting.
