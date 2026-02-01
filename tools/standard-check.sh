#!/usr/bin/env bash
# Standard-sjekk for platform-standard template-app
# Kjør fra prosjektrot: ./tools/standard-check.sh

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ERRORS=0

echo "=== Sjekker mappestruktur ==="
REQUIRED=(
    "public/index.php"
    "app/Http/Controllers"
    "app/Http/Middleware"
    "app/Domain"
    "app/Data/Repositories"
    "app/Data/Queries"
    "app/Views"
    "app/Support"
    "config"
    "routes"
    "bin"
    "database/migrations"
    "docs/adr"
)
for p in "${REQUIRED[@]}"; do
    if [ -e "$p" ]; then
        echo "  OK: $p"
    else
        echo "  FEIL: Mangler $p"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "=== Sjekker obligatoriske filer ==="
FILES=("STANDARD.md" "CONFORMANCE.md" ".env.example" "composer.json" ".gitignore" "README.md")
for f in "${FILES[@]}"; do
    if [ -f "$f" ]; then
        echo "  OK: $f"
    else
        echo "  FEIL: Mangler $f"
        ERRORS=$((ERRORS + 1))
    fi
done

if [ ! -f "public/index.php" ]; then
    echo "  FEIL: public/index.php er obligatorisk"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=== Sjekker at controllers og views ikke inneholder SQL ==="
SQL_PATTERN='(SELECT|INSERT|UPDATE|DELETE)\s'
for dir in "app/Http/Controllers" "app/Views"; do
    if [ -d "$dir" ]; then
        while IFS= read -r -d '' f; do
            if grep -qiE "$SQL_PATTERN" "$f" 2>/dev/null; then
                echo "  FEIL: SQL funnet i $f"
                ERRORS=$((ERRORS + 1))
            fi
        done < <(find "$dir" -type f \( -name "*.php" -o -name "*.html" \) -print0 2>/dev/null)
    fi
done
if [ $ERRORS -eq 0 ]; then
    echo "  OK: Ingen SQL i controllers/views"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
    echo "=== $ERRORS feil funnet ==="
    exit 1
fi
echo "=== Alt OK ==="
exit 0
