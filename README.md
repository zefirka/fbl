# fbl — a typed language that compiles to Factorio blueprints

Write a factory as a program, get a blueprint string. Static checking against the real game
data, live preview with the game's own art, switchable game versions.

```
defaults (tier blue)                        ; every belt below, unless it says otherwise

defblock cell (recipe r, module[] m = ()) => {
  belt (from (0, 0) to (2, 0))
  bulk-inserter (at (1, 1), north)          ; dir is where it DROPS
  assembling-machine-3 (at (0, 2), recipe r, modules m)
  bulk-inserter (at (1, 5), from south)     ; from is where it PICKS UP
  belt (from (0, 6) to (2, 6))
}

defblock line (int n, recipe r) => {
  row => {
    for i in 0..n => { cell (recipe r) }
  }
}

line (at (0, 0), n 8, recipe iron-gear-wheel)
```

## Getting started

```bash
npm install
npm run fetch-data       # game data + icon sheets into public/data/ (~5MB)
npm run dev              # http://localhost:5273
npm test                 # 47 tests over the parser, checker, runtime and exporter
```

The studio is a static page: code on the left, blueprint on the right, no backend.
Drag to pan, scroll to zoom, `f` to fit, hover an entity for its details.
**copy blueprint** puts a paste-ready string on the clipboard, and the **docs** tab is the
language reference, generated from the same tables the checker uses.

The editor is Monaco, wired to the language rather than to a syntax file:

- **completion by type** — after `recipe ` it offers only what that machine can craft; after
  `tier ` the four belt tiers; after `entity ` every building and every block you have
  defined; at a slot position, the slots that entity actually has.
- **errors inline** — the checker's diagnostics become squiggles, with the hint in the tooltip.
- **hover** — a machine's footprint, module slots and crafting speed; a recipe's ingredients
  and time; a block's parameters.

### Real game art (optional)

With Factorio installed, the preview can draw the actual entity sprites instead of coloured
footprints:

```bash
"<factorio>/factorio.app/Contents/MacOS/factorio" --dump-data   # writes data-raw-dump.json
npm run extract-sprites                                          # → public/sprites/ (~12MB)
```

The extractor finds a Steam or /Applications install by itself; override with `--data` and
`--dump`, or `FACTORIO_DATA` / `FACTORIO_DUMP`. `--ppt 32` halves the resolution and quarters
the atlas. Without it the studio still runs — the **sprites / schematic** toggle simply stays
on schematic.

## Preview

Two views, toggled in the toolbar:

- **sprites** — the game's own art, drawn in the game's render order (belts and pipes on the
  ground, machines above them, inserters and poles over everything), positioned by each
  sprite's own `shift` so overhang lands where it does in game. Belts pick their orientation
  from their neighbours, so corners get the curve sprite and undergrounds get the entry and
  exit structures. Machines carry a floating recipe icon, and a badge along the bottom edge
  for the modules inside them — one icon per module in slot order, each with its quality
  mark, because the sprite itself cannot show what is in the slots.
- **schematic** — flat colour-coded footprints with direction chevrons. Easier to read layout
  and alignment from, and the only view available without a local Factorio install.

## The language

Round brackets are the only constructor. A comma is optional between arguments, and a line
break ends a statement unless you are inside `( … )`.

### Placement

Everything you can place — a game entity, a helper, a block of your own — is called the same
way, and its arguments are **slots**:

```
<entity-or-block> ( <slot> <value>, … )
```

```
assembling-machine-3 (at (0, 2), recipe iron-gear-wheel, modules prod-3)
```

**A value's type decides its slot**, so members of the small closed vocabularies are written
bare: `north` fills `dir` because it is a direction, `blue` fills `tier`, `legendary` fills
`quality`. Coordinates default to `at`. Recipes and items are too large a namespace to guess
from — and `iron-gear-wheel` is both — so those always take their label.

**`(x, y)` is the top-left tile of the footprint**, in the current frame, not the centre.
The exporter converts to Factorio's centre-of-footprint convention, which is why a 3×3 machine
lands on `.5` coordinates and a 2×2 one does not. You never see that.

### Types

`int` `float` `bool` `text` `coord` `direction` `tier` `quality` `recipe` `item` `module`
`entity` `handle` `any`, and `T[]` for a list.

Because `()` is the only constructor, a tuple is a coordinate or a list depending on what is
expected: `(0, 2)` is a `coord`, `(speed-module-3, speed-module-3)` is a `module[]`, and a
lone value stands in for a one-element list. A module is an item, optionally paired with a
quality: `(quality-module-3, legendary)`.

```
coord origin = (4, 0)
int    n     = count (prod-3)
def prod-3   = repeat (4, (productivity-module-3, legendary))
```

### Module settings

`defaults` presets any slot left blank, for the rest of the file or for one block. It can be
narrowed to a single entity or to a family:

```
defaults (tier blue)                  ; anything with a tier slot
defaults underground (tier green)     ; just undergrounds
defaults (tier yellow) => { … }       ; only inside this block
```

Innermost wins; within a scope, an entity name beats a family, which beats a bare slot.
Only styling slots can be defaulted — `tier` `quality` `dir` `recipe` `modules` `gap`
`align` — never a position.

### Blocks

A block writes itself from `(0, 0)`; the caller decides where that origin lands, so nothing
inside ever does coordinate arithmetic against the outside world.

```
defblock cell (recipe r, module[] m = (), int lanes = 2) => { … }
```

A parameter answers to its own name **and to its type**, pluralised for arrays, so
`cell (recipe iron-gear-wheel, modules prod-3)` reaches `r` and `m` without naming them.

**Every block already has an `at` slot**, so it needs no coordinate parameter of its own to be
positioned: `cell (at (4, 0))` shifts the whole block. And since an unlabelled coordinate
always means position, `cell ((4, 0))` fills `at` and never a parameter that happens to be a
`coord` — label it if a block genuinely takes a second one.

### Buildings as parameters

An `entity` parameter holds anything placeable — a machine or another block — so one block
covers a whole family:

```
defblock smelter (entity machine, module[] mods = ()) => {
  machine (at (0, 0), modules mods)
  belt (from (0, 3) to (2, 3), tier red)
}

row (gap 1) => {
  smelter (entity electric-furnace, modules (speed-module-3, speed-module-3))
  smelter (entity steel-furnace)
}
```

The checker cannot know which machine arrives, so it validates the slot *names* against the
union of every entity's and leaves the rest to run time. A slot the real building turns out
not to have is dropped with a warning rather than failing the build — a steel furnace has no
module slots, and `modules ()` asked for nothing anyway.

### Layout and control flow

**`for` repeats; it does not position.** Eight calls to `cell ()` with no `at` land eight
cells on the same tile. Either compute the position yourself, or let a layout form measure
each pass and pack them:

```
for i in 0..4 => { medium-electric-pole (at (1 + i * 7, 7)) }   ; you compute it
row for i in 0..8 => { cell (recipe iron-gear-wheel) }          ; row measures and packs
row => { for i in 0..8 => { cell (…) } }                        ; the same, spelled out
```

Layout forms exist because a block's width is not knowable in advance — it depends on the
recipe, the modules, the belt tier. `row` and `column` evaluate a child, measure what it
emitted, then translate it into place.

```
at (10, 4) => { … }                    ; shift the frame
row (gap 1) => { … }
column (gap 1, align center) => { … }
if n > 4 => { … } else => { … }
def m = measure (cell ())              ; evaluate, report the box, remove it again
```

### Handles and fields

A placement evaluates to a handle: `a.width` `a.height` `a.x` `a.y` `a.left` `a.top`
`a.right` `a.bottom` `a.center` `a.size`. `right` and `bottom` are exclusive edges, so
`a.right` is the first free column beside it. A coordinate has `.x` and `.y`.

### Helpers

```
belt (from (0, 0), via ((10, 0), (10, 6)), to (2, 6))   ; a path; each tile faces the next
belt (at (0, 0), east, length 20)
underground (from (4, 9) to (11, 9))                    ; typed entry/exit pair
```

Tier names are a closed vocabulary: `yellow` `red` `blue` `green` ≡ `transport-belt` …
`turbo-transport-belt`. Full entity names work too.

### Routing under obstacles

```
assembling-machine-3 (at (3, -1))
belt (from (0, 0) to (10, 0), blue, auto)   ; tunnels beneath the machine
```

`auto` does not route around what is in the way — it goes under it. Each run of blocked tiles
becomes an underground pair, entry on the last free tile before it and exit on the first free
tile after. A gap the tier cannot reach is an error naming a tier that can, rather than a belt
quietly laid across a machine; so is a single free tile between two obstacles, which would have
to be both an exit and an entry. `auto` only sees what was placed before it, so order matters.

It composes with `row` and `column`: a layout settles each item into place before evaluating
the next, so a belt routing inside one sees its neighbours where they will actually stand.

### Balancers

```
balancer (4 to 8)                            ; four lanes in, eight out
balancer (at (0, 20), 8 to 4, right, green)  ; rotated, turbo belts
```

Every N→M from 1 to 8, lifted from a community blueprint book by
`npm run extract-balancers`. The book is built from belts, undergrounds and splitters alone,
so one geometry serves every tier — including turbo, which it predates by four years — and
the whole layout rotates with `dir`. A pair the library does not have is a compile error.

Directions also answer to screen words: `up` `right` `down` `left` are `north` `east` `south`
`west`.

### Functions

`repeat` `count` `min` `max` `abs` `floor` `ceil` `round` `print`, plus three that read the
game data: `ingredients (recipe)`, `craft-time (recipe)`, `module-slots (entity)`.

## What the checker catches

Parse → **check** → run. The checker is a gate: if it reports an error nothing is placed, so
a program never half-builds a blueprint on the way to failing.

Errors, before anything runs:

- a slot the entity does not have, listing the ones it does
- a value of the wrong type for a slot, or for a declared local
- a name that is not a variable, entity, block or vocabulary member — with a "did you mean"
  drawn from the real entity list, tolerant of transposed letters
- a recipe the machine cannot craft (`assembling-machine-3` making `iron-plate`), naming
  where it *is* made
- more modules than the machine has slots
- a field a handle does not have
- arithmetic on something that is not a number, a `for` over something that is not a list

Warnings, which still produce a blueprint:

- an underground belt that overruns its tier's reach
- a `defaults` that the target entity cannot use
- overlapping footprints, highlighted in red on the canvas

Every diagnostic carries a line and column, and the location is clickable in the console.

## Power overlay

**power** in the toolbar (or <kbd>P</kbd>) washes everything the poles reach in blue, outlines
the edge of the region, and rings anything that draws power and sits outside it. When there is
at least one pole, the console also totals what is left dark.

The number that matters is the **supply area**, which is not the wire reach usually quoted:

| pole | powers | wire reaches |
| --- | --- | --- |
| `small-electric-pole` | 5×5 | 7.5 |
| `medium-electric-pole` | 7×7 | 9 |
| `big-electric-pole` | 4×4 | 32 |
| `substation` | **18×18** | 18 |

A big electric pole throws a wire 32 tiles and powers almost nothing; the one that covers
ground is the `substation`. Writing this overlay immediately found the bug in this project's
own assembler-line example: medium poles on row 7 were never going to reach the inserters on
row 1, and eight of them had been sitting dark since the example was written.

## Cost

The overlay in the corner of the preview totals the blueprint two ways: **items**, the bill of
materials you would carry to the site, modules included; and **raw**, every recipe followed
down to what the game extracts directly.

That last distinction is not the same as "has no recipe". In Space Age `iron-ore` has a recipe
of its own that grows it from bacteria — follow it and a transport belt is priced in
biochambers. The trail stops wherever something *mines* an item or makes it from nothing,
which is also why sulfuric acid and heavy oil turn up as raw: on some planets they are.

## Versions

The switcher covers Space Age 2.1, Space Age 2.0, Factorio 2.0 and Factorio 1.1. It is not
cosmetic — it changes the entity list, the recipes and the export format:

| | 1.1 | 2.0+ |
| --- | --- | --- |
| direction | 8-point (east = 2) | 16-point (east = 4) |
| modules | `{"speed-module-3": 2}` | `items` array of insert plans with inventory + slot |
| quality | — | supported |

Switch the assembler-line example to 1.1 and it fails on `bulk-inserter`, which is 2.0's
rename of `stack-inserter`. That is the switcher working.

## Where things are

```
src/core/          the language — no DOM, runs in Node too
  lexer.ts         text → tokens
  parser.ts        tokens → AST
  types.ts         the type lattice and the closed vocabularies
  slots.ts         which slots each entity, helper and block accepts
  check.ts         the static pass; everything above runs before a single placement
  run.ts           AST → placements (frames, layout, defaults, helpers)
  scene.ts         the placement accumulator; bbox, translate, collision
  blueprint.ts     scene → blueprint JSON → string
  proto.ts         prototype registry
src/data/          game data: dataset schema, version profiles, geometry table
src/ui/            studio: canvas renderer, Monaco editor, generated docs, wiring
  lang/            language service: tokenizer, completion context, providers
examples/*.fbl     the three programs in the example dropdown
```

`src/core` never imports from `src/ui`. `npm run build:core` bundles it for Node, which is
what the tests run against and what a CLI would use.

## Honest limits

This is an MVP. What is real: the reader, the evaluator, macros, frames, layout, the
prototype registry, the exporter (both module formats, both direction scales), the
collision check, and the round-trip through a real blueprint string.

What to know before trusting it with a real base:

- **Entity geometry is partly hand-written.** [FactorioLab](https://factoriolab.github.io)
  is a ratio calculator, so it carries sizes for the 28 crafting machines only. Belts,
  inserters, poles and pipes are typed by hand in `src/data/entity-geometry.ts`. Point
  `scripts/fetch-data.mjs` at a `factorio --dump-data` export and that file becomes a
  fallback rather than a source.
- **The inserter direction convention is pinned by a test, not by the game.** `:dir` names
  the tile the inserter drops into, reasoned from the prototype's `pickup_position {0, 1}`
  and `insert_position {0, -1.2}`. If it turns out inverted in game, flip one call in
  `entities.ts`; one assertion changes with it. `:from` exists so you never have to care.
- **Underground reach values (4/6/8/10) are the tooltip numbers**, used for a warning only.
- **The balancer library is someone else's work.** It is a public community blueprint book,
  re-encoded into `src/data/balancers.json` with its source recorded in the file. The
  extractor re-runs from the original URL, so the derivation is reproducible rather than a
  blob of unexplained coordinates.
- **No macros.** The v1 Lisp had them; this syntax is not homoiconic, and both macros in the
  old examples turned out to be plain blocks with a `for` inside. The AST is shaped so they
  could come back as AST macros, but nothing depends on that today.
- **No circuit wires, no rails, no fluids beyond placing pipes.** No automatic belt routing —
  `via` corners are yours to choose.
- **The checker does not track throughput.** It knows every recipe, crafting speed and belt
  rate in the dataset, and does nothing with them yet. That is the next real feature.
- **The bundle is 4MB**, almost all of it Monaco. Trimming it means hand-picking the editor
  contributions instead of importing the whole package, and completion is the reason Monaco
  is here at all — so it stays whole until the size actually hurts.
- **The sprite atlas is a still frame.** One frame per entity, no animation, no working-state
  overlays, and no inserter arms — inserters show their platform, which is what carries their
  facing. 85 of 86 entities resolve; `heat-pipe` names its connection sprites differently and
  falls back to schematic.
- **Belt orientation is derived, not stored.** A belt tile knows only which way it faces; the
  curve art comes from its neighbours. Factorio names those sprites by the side items arrive
  *through*, not by the direction they were travelling — a belt running east enters the corner
  through its west edge, so the piece that turns it south is `west-to-south`. Reading it the
  other way mirrors every bend, which is a bug you only notice by looking. The 20 orientation
  indices are Factorio's defaults, absent from the dump because every vanilla belt uses them;
  they were read off a contact sheet of the sheet itself.
- **Splitters and undergrounds are drawn in several pieces**, as the game draws them. A
  splitter is two belt lanes, then `structure_patch`, then `structure` — its main housing only
  reaches over one lane, so without the patch half the splitter renders as bare belt. An
  underground is `back_patch`, half a tile of belt, the hood, then `front_patch`. Each missing
  piece looks like a different bug, and none of them is visible in the prototype's obvious
  fields; [Factorio Blueprint Editor](https://github.com/teoxoy/factorio-blueprint-editor)'s
  `spriteDataBuilder.ts` is the reference for what order to draw them in.
- **Both ends of an underground pair carry the same `direction` in the blueprint**, and are
  drawn facing opposite ways. `direction` is the flow; `type: input` / `type: output` tells the
  ends apart. The game then renders an output rotated 180°, so a pair reads as two ramps
  facing each other. Ask the game and it says so plainly: placing an east-facing pair returns
  `a dir=4 type=input | b dir=4 type=output | paired=true`. Take the data at face value and
  you draw both ramps the same way round, which looks wrong and is.
- **A missing sprite name used to fall back to an arbitrary one.** An underground's
  `undergroundType` is `input`/`output` in the blueprint but `in-`/`out-` in the atlas, and the
  mismatched key quietly resolved to whatever variant sorted first — every underground drawn
  facing north while its tooltip read *facing east*. All variant naming now lives in
  `src/core/topology.ts`, a miss draws the schematic fallback instead of a wrong orientation,
  and a test walks every entity in every example to check the name exists.
- Nothing has been pasted into the game and verified tile-for-tile. That is the next test
  worth writing: export a known blueprint from Factorio, decode it, and diff.

## Next, roughly in value order

1. Paste a generated blueprint into the game and diff it against a hand-built one.
   Everything else rests on that.
2. Real prototype data from `--dump-data`, which also unlocks mods.
3. Ports on blocks: declare `:in` / `:out` tiles so blocks connect instead of being placed
   next to each other and hoped over.
4. Ratio checking — the reason to build a language rather than a library. The dataset
   already carries `machine.speed`, `recipe.time` and `belt.speed`; the pieces for
   "10 assemblers at 1.25 speed consume 37.5 items/s, one blue belt supplies 45" are all
   present and unused.
5. A decompiler: blueprint string → source. The fastest way to a standard library is to
   read existing blueprint books back into blocks.

## Where the data comes from

| | source | produced by |
| --- | --- | --- |
| recipes, machine sizes, module slots, item icons | [FactorioLab](https://github.com/factoriolab/factoriolab) dumps | `npm run fetch-data` |
| entity sprites | the local game install + `factorio --dump-data` | `npm run extract-sprites` |
| balancer layouts | [Belt Balancers](https://factoriobin.com/post/KafN8H7L), a community book | `npm run extract-balancers` |
| supply areas, who draws power | hand-written in `src/data/entity-geometry.ts` | — |
| belt/inserter/pole footprints | hand-written in `src/data/entity-geometry.ts` | — |

The sprite extractor never guesses at layout: the dump carries every filename, frame grid,
`shift` and `scale`, so `scripts/extract-sprites.mjs` only has to crop, composite the layers
(shadows first, light and glow layers dropped) and pack the result into an atlas.

The art is Wube Software's copyright. Both the icon sheets and the extracted sprites are read
from your own installation, written locally, and kept out of git (see `.gitignore`).
