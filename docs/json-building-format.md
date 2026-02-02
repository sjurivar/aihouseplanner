# JSON Building Plan Format

AI House Planner bruker et strukturert JSON-format for byggeplaner. Dette dokumentet beskriver alle versjoner, felter, regler og koordinatsystemet.

## 1. Oversikt over versjoner

| Versjon | Beskrivelse |
|---------|-------------|
| **v0** | Enkel etasje: units, footprint, wall, openings |
| **v0.2** | Flere etasjer: units, defaults.wall, floors[] |
| **v0.3** | Som v0.2 + roof (tak) |
| **v0.4** | Vinkelhus: blocks[] med egne footprint, floors, roof, position |
| **v0.5** | Rooms-first: levels, buildings[], footprints per level, rooms, stairs, voids, derived walls, skråtak per rom |
| **v1** | Rom-basert: rooms, walls (path-basert), stairs; ulike vegghøyder per rom/vegg |

## 2. Felles begreper

### Enheter og koordinatsystem

- **units:** Alltid `"mm"` (millimeter)
- **2D per floor:** Top-down i mm, origin `(0,0)` i footprint top-left (SVG-konvensjon: X høyre, Y nedover)
- **3D:** X = bredde, Z = dybde, Y = opp; konverter med sentrering rundt footprint

## 3. v0.3 (recap)

v0.3 bruker footprint + defaults.wall + floors med openings:

- `footprint`: `{ type: "rect", width, depth }`
- `defaults.wall`: `{ thickness, height }`
- `floors[]`: `id`, `name`, `level`, `elevation_mm`, `footprint`, `wall?`, `openings[]`
- Vegger navngis: `front` | `right` | `back` | `left`
- Åpninger: `offset`, `width`, `height` langs vegg

### Tak (roof)

Gable-tak (saltak) med to takflater:

```json
"roof": {
  "type": "gable",
  "pitch_degrees": 35,
  "overhang_mm": 500,
  "ridge_offset_mm": 0,
  "ridge_mode": "equal_pitch",
  "ridge_direction": "x",
  "eave_height_mm": 2700,
  "material": "tiles"
}
```

| Felt | Obligatorisk | Beskrivelse |
|------|--------------|-------------|
| type | ja | `"gable"` (saltak med to flater) |
| pitch_degrees | ja | Helningsvinkel (22-45° typisk) |
| overhang_mm | nei | Utstikk (default: 500) |
| ridge_offset_mm | nei | Forskyving av mønet i mm: 0=midt, + mot sør/øst, - mot nord/vest |
| ridge_mode | nei | `"equal_pitch"` (default) eller `"equal_eave"` |
| ridge_direction | ja | `"x"` (møne øst-vest) eller `"y"` (møne nord-sør) |
| eave_height_mm | nei | Gesimshøyde (topp vegg, default fra floors) |
| material | nei | `"tiles"`, `"metal"`, `"shingles"` |

**Møneposisjon:**
- `ridge_direction = "x"`: møne parallelt med X-aksen, offset påvirker Z
- `ridge_direction = "y"`: møne parallelt med Z-aksen, offset påvirker X
- `ridge_offset_mm = 0`: møne midt på bygget (symmetrisk)
- `ridge_offset_mm = 1000`: møne 1m forskjøvet (asymmetrisk tak)

**Ridge mode (ved asymmetrisk tak):**
- `"equal_pitch"` (default): Begge takflater har samme pitch_degrees. Den ene veggen heves/senkes for at takflatene skal møtes.
- `"equal_eave"`: Begge vegger på samme høyde. Takflatene får forskjellig pitch for å møtes i mønet.

**3D-rendering:** To separate takflater (PlaneGeometry) med korrekte normaler.

Se `examples/plan.v0.3.two_floors_roof.json`.

## 4. v0.4 (vinkelhus - blocks)

v0.4 støtter **vinkelhus** (L, T, H-form) med flere sammenkoblede blokker.

### Top-level

```json
{
  "units": "mm",
  "version": "0.4",
  "defaults": {
    "wall": { "thickness": 200, "height": 2700 }
  },
  "blocks": [...]
}
```

### Block-struktur

Hver blokk er en selvstendig bygningsdel med egen posisjon, footprint, etasjer og tak:

```json
{
  "id": "main",
  "name": "Hovedfløy",
  "position": { "x": 0, "z": 0 },
  "footprint": { "type": "rect", "width": 10000, "depth": 8000 },
  "floors": [
    {
      "id": "f1",
      "name": "1. etasje",
      "level": 1,
      "elevation_mm": 0,
      "openings": [...]
    }
  ],
  "roof": {
    "type": "gable",
    "pitch_degrees": 35,
    "ridge_direction": "x",
    ...
  }
}
```

| Felt | Obligatorisk | Beskrivelse |
|------|--------------|-------------|
| id | ja | Unik blokk-ID |
| name | nei | Visningsnavn |
| position | ja | `{ x, z }` i mm fra origin (top-left) |
| footprint | ja | `{ type: "rect", width, depth }` |
| floors | ja | Array med etasjer (som v0.3) |
| roof | nei | Tak for denne blokken |

### Husformer

| Form | Beskrivelse | Eksempel |
|------|-------------|----------|
| **L-hus** | Hovedblokk + 1 fløy | `plan.v0.4.L-house.json` |
| **T-hus** | Hovedblokk + 1 sentrert fløy | `plan.v0.4.T-house.json` |
| **H-hus** | Midtblokk + 2 fløyer | `plan.v0.4.H-house.json` |

### Posisjonering

- `position.x`: Horisontal posisjon (øst-vest)
- `position.z`: Vertikal posisjon (nord-sør)
- Koordinatsystem: Top-left origin (0,0), X øker mot høyre, Z øker nedover
- Blokkene rendres med separate tak som "skjærer" inn i hverandre

**Merk:** Valley-beregning (innvendige renner) er ikke implementert ennå.

## 5. v0.5 (rooms-first, skråtak)

v0.5 bruker **levels**, **buildings[]** med footprints per level, rooms, stairs, voids, derived walls og skråtak per rom.

### Top-level

```json
{
  "version": "0.5",
  "units": "mm",
  "levels": [
    { "id": "L1", "name": "1. etasje", "elevation": 0, "height": 2500 },
    { "id": "L2", "name": "2. etasje", "elevation": 2500, "height": 2500 }
  ],
  "buildings": [ { "id": "B1", "footprints": [...], "rooms": [...], "stairs": [...], "voids": [...], "derived": { "walls_L1": [...], "walls_L2": [...] } } ]
}
```

- **levels[]**: Etasjer med id, name, elevation, height
- **buildings[]**: Hvert bygg har footprints (per levelId), rooms (levelId), stairs (fromLevelId/toLevelId), voids (stair_void per level), derived.walls_Lx (vegg-segmenter med a, b, thickness, heightProfile)

### Rom (v0.5)

- `polygon`: `[{x,y}, ...]` (objekter, ikke tupler)
- `ceiling`: `{ type: "flat", height }` eller `{ type: "plane", z: {a,b,c}, minZ, maxZ }`
- `floor_finish`: optional (wood, tile, carpet)

### Vegger (v0.5 derived)

- `derived.walls_L1`, `derived.walls_L2`: vegg-segmenter med `a: {x,y}`, `b: {x,y}`, `thickness`, `heightProfile` (constant eller sampled)

### Trapper og voids

- `stairs[]`: fromLevelId, toLevelId, origin, direction, runWidth, risers, tread
- `voids[]`: stair_void per level, polygon for trappeåpning

Se `examples/plan.v0.5.rooms_first_sloped.json`.

## 6. v1 (rom-basert)

v1 legger til rom som byggekloss, vegger definert per rom, trapper, og ulike vegghøyder.

### Top-level

```json
{
  "version": "1.0",
  "units": "mm",
  "building": { "name": "..." },
  "defaults": { "wall": { "thickness_mm": 200, "height_mm": 2700 } },
  "floors": [ ... ],
  "roof": { ... }
}
```

- `version`: `"1.0"` angir v1
- `building`: optional metadata
- `defaults.wall`: fallback for vegger uten egen tykkelse/høyde
- `roof`: som v0.3 (optional)

### Per floor (v1)

```json
{
  "id": "F1",
  "name": "1. etasje",
  "level": 1,
  "elevation_mm": 0,
  "footprint": { "type": "rect", "width": 9000, "depth": 7000 },

  "rooms": [
    {
      "id": "R1",
      "name": "Stue/kjøkken",
      "polygon": [ [0,0], [4000,0], [4000,3000], [0,3000] ],
      "floor_finish": "wood",
      "ceiling_height_mm": 2400,
      "tags": ["common"]
    }
  ],

  "walls": [
    {
      "id": "W1",
      "type": "interior",
      "thickness_mm": 98,
      "height_mm": 2400,
      "path": [ [2000,0], [2000,3000] ],
      "joins": "miter",
      "openings": [
        {
          "id": "W1-D1",
          "type": "door",
          "at_mm": 1200,
          "width_mm": 900,
          "height_mm": 2100,
          "swing": "in-right"
        }
      ],
      "tags": ["loadbearing"]
    }
  ],

  "stairs": [
    {
      "id": "S1",
      "name": "Hovedtrapp",
      "from_floor_id": "F1",
      "to_floor_id": "F2",
      "type": "straight",
      "width_mm": 900,
      "rise_mm": 175,
      "run_mm": 250,
      "start": [1500, 6000],
      "direction_degrees": 90,
      "turn_landing_length_mm": 1000,
      "headroom_mm": 2000
    }
  ]
}
```

### Rom (rooms)

| Felt | Obligatorisk | Beskrivelse |
|------|--------------|-------------|
| id | ja | Unik identifikator |
| name | nei | Visningsnavn |
| polygon | ja | Lukket polygon `[[x,y], ...]`, min 3 punkter; siste punkt trenger ikke gjentas |
| floor_finish | nei | F.eks. "wood", "tile" |
| ceiling_height_mm | nei | Overstyring for åpent til møne etc. |
| tags | nei | F.eks. `["common"]` |

**Design:** `rooms.polygon` er primær byggekloss. Brukes til 2D-konturer selv uten walls.

### Vegger (walls, v1)

| Felt | Obligatorisk | Beskrivelse |
|------|--------------|-------------|
| id | ja | Unik identifikator |
| type | ja | `interior` \| `exterior` |
| thickness_mm | nei | Fallback: defaults.wall.thickness |
| height_mm | nei | Fallback: defaults.wall.height eller rom ceiling_height |
| path | ja | Polyline for veggsenterlinje `[[x,y], ...]`, min 2 punkter |
| joins | nei | `miter` (default) |
| openings | nei | Åpninger langs path |
| tags | nei | F.eks. `["loadbearing"]` |

**Åpninger (wall.openings):** Bruker `at_mm` (distanse langs path fra start), ikke offset per veggside.

| Felt | Obligatorisk | Beskrivelse |
|------|--------------|-------------|
| id | ja | Unik identifikator |
| type | ja | `door` \| `window` |
| at_mm | ja | Distanse langs wall path fra start |
| width_mm | ja | Bredde i mm |
| height_mm | ja | Høyde i mm |
| sill_mm | vindu | Må være >= 0 for window |
| swing | dør | `in-left` \| `in-right` \| `out-left` \| `out-right` |

**Design:** `walls.path` er veggsenterlinje. Tykkelse bygges symmetrisk i 3D (fremtidig).

### Trapper (stairs)

| Felt | Obligatorisk | Beskrivelse |
|------|--------------|-------------|
| id | ja | Unik identifikator |
| name | nei | Visningsnavn |
| from_floor_id | ja | Etasje trappen starter på |
| to_floor_id | ja | Etasje trappen ender på |
| type | ja | `straight` \| `l` \| `u` |
| width_mm | ja | Bredde |
| rise_mm | nei | Høyde per trinn; ellers beregnet fra etasjehøyde |
| run_mm | nei | Dybde per trinn |
| start | ja | `[x,y]` planposisjon på from-floor |
| direction_degrees | ja | 0=+x, 90=+y etc. (2D) |
| turn_landing_length_mm | nei | For l/u-typer |
| headroom_mm | nei | Fri høyde under trapp |

**Design:** Trapper binder floors med from/to floor_id. Eier begge etasjer semantisk.

### Mode A vs Mode B (v1)

- **Mode A (v0-kompatibel):** footprint + defaults.wall + openings på floor-nivå
- **Mode B (v1 rom-basert):** floors[].rooms + floors[].walls + floors[].stairs

Begge kan brukes; rooms/walls/stairs er optional.

## 7. Valideringsregler

### Felles

1. `units == "mm"`
2. `footprint.width` og `footprint.depth` > 0 og ≤ 100000

### v0.3

3. `wall.thickness` > 0, `wall.height` > 0
4. Åpninger: offset + width ≤ vegglengde
5. `window` krever `sill >= 0`
6. `roof`: pitch 5–60, overhang 0–2000, thickness 10–500, type "gable"

### v1

7. `rooms.polygon`: min 3 punkter, lukket
8. `walls.path`: min 2 punkter
9. `walls.type`: interior | exterior
10. `walls.openings.at_mm` + `width_mm` ≤ vegglengde (path-lengde)
11. `stairs.type`: straight | l | u
12. `stairs.from_floor_id` og `to_floor_id` må referere til gyldige floors

## 8. Eksempel-JSON

| Fil | Beskrivelse |
|-----|-------------|
| `examples/plan.v0.single.json` | v0, enkel etasje |
| `examples/plan.v0.3.two_floors_roof.json` | v0.3, to etasjer + tak |
| `examples/plan.v1.two_floors_rooms_walls_stairs.json` | v1, rom, vegger, trapp |
