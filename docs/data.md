# The game data, and what it does not say out loud

The dataset is FactorioLab's, and it is very good — but it was built for a ratio calculator,
and reading it as though it described a factory you were about to build goes wrong in specific
ways. Every trap below cost real time to find, and each one produced an answer that looked
plausible until you checked it.

**Read this before changing anything about which recipes are usable, what a plan may help
itself to, or which recipe leads a list.**

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

## What is in it

`public/data/<id>/data.json` per version, plus an icon sheet. `ProtoRegistry`
(`src/core/proto.ts`) turns it into lookups: entities with footprints, recipes, icons,
qualities, modules and their effects, beacons, machines, fluids. The raw dataset stays on the
registry as `dataset`, which is how the item picker gets at the crafting-menu categories.

The fields that matter beyond the obvious ones:

- `machine.baseEffect` — what a machine gives before any module. A foundry casts at +50%
  productivity and an electromagnetic plant assembles at +50%; ignore it and every count
  involving them is a third too high.
- `machine.qualityRecord` / `module.qualityRecord` — absolute values per quality tier, not
  deltas. A legendary electric furnace smelts at 5 rather than 2.
- `recipe.disallowedEffects` — 507 recipes refuse something. A recipe that refuses
  productivity refuses the machine's own base effect too.
- `beacon.profile` — the share each beacon keeps when several reach the same machine, indexed
  by how many there are. This is why eight beacons are not eight times one.
- `recipe.cost` — on extraction recipes only. A hundred for a unit of anything a drill brings
  up, ten for ten units of crude oil, and **nothing at all** for what an offshore pump lifts
  out of a lake. This is the dataset's own valuation and it is the right one to use.
- `recipe.locations` — which planet a recipe can be run on. Carried on 55 recipes, currently
  unused; it is the honest fix for the one default that is still arguable (see below).
- `item.category` / `item.row` — the game's own crafting-menu grouping, which is what the item
  picker files things under.

## The traps

### Recycling is not a way of making things

43 recipes produce an iron plate. **41 of them are recycling something back into one.** Left
in, every chain would rather melt a chest than smelt an ore. Filling and emptying barrels is
the same kind of noise: it moves a fluid, it does not produce one.

Both are filtered out in `recipeGraph`, and nothing that reaches the solver can be reached
through either.

Be exact about what barrelling *is*, though. It is a **filled** barrel on one side of the
recipe: filling makes one, emptying takes one apart. An empty barrel is an ordinary item —
steel makes it, and cliff explosives are packed into one — so a recipe that merely uses one is
not barrelling. Reading the rule as "anything that mentions a barrel" took out cliff explosives
and the barrel's own recipe with it, and cliff explosives simply could not be made.

### Some recipes have no machine at all

Space Age carries recipes for what happens **on its own**: food spoiling, bacteria multiplying
into ore in a crate. There are 29 of them and their `producers` is `undefined`.

Left in, they cost nothing to build, so an optimiser loves them. A plan asked for one
locomotive answered with six thousand biochambers growing iron out of jellynut, and the cards
for the pseudo-recipes showed a dash where the machine should be and a count of zero. A recipe
nothing can be built to run is a thing that happens, not a thing you make.

### The frontier is not "what has no recipe"

Where a chain stops is a judgement, and the obvious readings are both wrong:

- **Not "what nothing produces"** — in Space Age `iron-ore` has a recipe that grows it from
  bacteria, so nothing would ever stop.
- **Not "what the game can extract"** — Space Age has an offshore pump that produces **heavy
  oil** on Vulcanus, so on the data alone heavy oil is free, and a plan asked for petroleum
  buys it by the barrel instead of running a refinery. Which is nonsense anywhere but Vulcanus.

What works: a plan may help itself to what a **drill** brings up, plus the water it pumps. A
solid you dig is raw and that is the end of it; a fluid you dig is raw only where nothing
crafts it, which is why sulfuric acid comes out of a chemical plant rather than a geyser.
Anything else the game grants in one place is made unless someone says otherwise — and
bringing a thing up out of the ground does not count as making it, so a chain still stops
wherever the only way on is a drill or a pump.

Digging is nevertheless a recipe like any other, with the drills as its machines. It is one
click away on the item's own node, and there are three drills to choose between.

### The name of a recipe is not the name of the thing to prefer

Half the recipes are named after what they make, so ranking by name mostly works — and then
walks straight into the well on Vulcanus, whose recipe is literally called `heavy-oil`. Both
of the obvious tiebreaks put the well ahead of the refinery.

The order that holds up: extraction first for what you actually dig and **last** for
everything else; then the recipe named after the item; then recipes made straight out of raw
materials ahead of ones that are not; then the cheapest of those by `recipe.cost`.

That last rule is what puts a foundry on **lava rather than ore** — molten iron out of lava
and calcite costs a twentieth of melting mined ore, which is exactly why Vulcanus is built
that way — and it keeps cracking behind the refinery it is meant to be tidying up after,
rather than looking like a cheap way to make petroleum.

**One default is still arguable**: solid fuel comes out of Aquilo's ammonia, because ammonia
is pumped and therefore free while light oil has to be refined. It is one click to the
light-oil recipe. Doing better means knowing which planet a plan is for — `recipe.locations`
is right there for it — and that is a feature, not a tiebreak.

### Some things cannot be started

A recipe that needs the thing it makes cannot be how you first get one. Where *every* way of
producing an item is like that, the item has no starting point and a plan has to begin with it
in hand — a pentapod egg is grown from a pentapod egg, and raw fish are bred from fish. Those
are treated as things you begin with rather than things a plan can conjure.

Asteroid chunks are the same shape of problem one step out: each kind is reprocessed from
another kind, so no single recipe consumes what it makes, and the whole trio has no entrance.
What scoops the first one is a collector in space, which is not a recipe anybody can build, so
a plan for one on the ground correctly reports that it is short.

## Entity geometry

FactorioLab carries sizes for the 28 crafting machines only, because a ratio calculator does
not need to know how big an inserter is. Belts, inserters, poles and pipes are typed by hand in
`src/data/entity-geometry.ts`, along with module inventories, underground reach and pole supply
areas. Point `scripts/fetch-data.mjs` at a `factorio --dump-data` export and that table becomes
a fallback rather than a source.
