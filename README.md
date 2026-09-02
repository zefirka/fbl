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

A second page, `calc.html`, is a factory calculator: say what you want a second and it works
out every recipe behind it, how many machines each takes, and draws the chain as a Sankey you
can change on the spot.

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

The studio is a static page: code on the left, blueprint on the right, no backend. Drag to pan,
scroll to zoom, `f` to fit, hover an entity for its details. **copy blueprint** puts a
paste-ready string on the clipboard, and the **docs** tab is the language reference, generated
from the same tables the checker uses.

## Documentation

Everything is written up under **[docs/](docs/README.md)** — that index says which file covers
what and when you would open it. The short version:

- **[docs/language.md](docs/language.md)** — the language, from placement to records to what
  the checker catches.
- **[docs/calculator.md](docs/calculator.md)** — the calculator: the linear programme, the
  diagram, sharing by link.
- **[docs/studio.md](docs/studio.md)** — the editor page and its panels.
- **[docs/data.md](docs/data.md)** — the game data and the traps in it. Read before touching
  anything about recipes or raw materials.
- **[docs/architecture.md](docs/architecture.md)** — where things live, how to build and test.
- **[docs/limits.md](docs/limits.md)** — what is real and what is approximate.

### Real game art

```bash
"<factorio>/factorio.app/Contents/MacOS/factorio" --dump-data   # writes data-raw-dump.json
npm run extract-sprites                                          # → public/sprites/ (12MB)
```

The extractor finds a Steam or /Applications install by itself; override with `--data` and
`--dump`, or `FACTORIO_DATA` / `FACTORIO_DUMP`. `--ppt 32` quarters the atlas at the cost of
sharpness when zoomed in. Without an atlas the studio still runs — the **sprites / schematic**
toggle just stays on schematic.

Hold **Alt** over the preview and the tile under the cursor lights up with its coordinate, ready
to type into the source — negative numbers and all. The hover tooltip stands aside while it is
up, since it would cover the thing being read.
