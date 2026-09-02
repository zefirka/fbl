# The studio

The editor page: code on the left, blueprint on the right, no backend. What the editor knows,
what the preview draws, and the panels that read numbers off the scene.

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

## The editor

Monaco, wired to the language rather than to a syntax file:

- **completion by type** — after `recipe ` it offers only what that machine can craft; after
  `tier ` the four belt tiers; after `entity ` every building and every block you have
  defined; at a slot position, the slots that entity actually has.
- **errors inline** — the checker's diagnostics become squiggles, with the hint in the tooltip.
- **hover** — a machine's footprint, module slots and crafting speed; a recipe's ingredients
  and time; a block's parameters.
- **argument names painted apart** — a slot name and its value sit side by side with nothing
  but a space between them, so `recipe iron-gear-wheel` would read as two words. Semantic
  tokens colour the names, at the call and at the definition both, and a block's own
  parameters light up exactly like the built-in ones because it comes off the syntax tree
  rather than a list. `src/core/labels.ts` collects the spans; the provider is in
  `src/ui/lang/providers.ts`.

Hold **Alt** over the preview and the tile under the cursor lights up with its coordinate,
which is the fastest way to get a number out of the picture and into the source.

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

The overlay in the corner of the preview totals the blueprint three ways. The × puts it away;
clicking the pill that is left brings it back.

| section | what it counts |
| --- | --- |
| `items` | what the schema places, modules included |
| `basic` | those, followed down to the materials they are made of |
| `raw` | those, followed all the way to what the game extracts |

"Extracts" is not the same as "has no recipe". In Space Age `iron-ore` has a recipe of its own
that grows it from bacteria — follow it and a transport belt is priced in biochambers. The
trail stops wherever something *mines* an item or *grows* it or makes it from nothing, which is
also why sulfuric acid and heavy oil turn up as raw: on some planets they are.

It also stops at anything nothing makes at all. Wood is chopped from trees and holmium ore
comes out of scrap, which this model does not follow; both are inputs, not gaps in the data,
and they are listed as such rather than flagged.

A **material** is an item that is *processed* rather than assembled — its recipe runs in a
furnace, a foundry, a chemical plant, a refinery — and that is made of nothing but raw
resources and other materials. Both halves are load-bearing: a foundry casts turbo belts too,
but out of gears and plates, so a belt is not a material. What survives is the tier you would
actually shop for. For the smelters array that turns

```
raw     lava 17.4k · crude oil 15.1k · iron ore 12.7k · heavy oil 6240 · tungsten ore 3480
basic   iron plate 10.7k · lubricant 6240 · copper plate 4728 · tungsten plate 870 · plastic 678
```

## Rates

The second panel: what the machines on screen eat and make per second, running flat out. It is
the number you size a bus against — every machine crafting without pause, so the belts feeding
it have to keep up with the answer.

A craft takes `recipe.time` seconds at speed 1, so a machine finishes
`speed × (1 + speed bonus) ÷ time` of them each second. Ingredients are drawn once per craft;
products come out multiplied by productivity, which is why speed modules move both columns and
productivity modules move only the second. Everything that changes those numbers is read off
the entity: the recipe and its `disallowedEffects`, the modules and the quality of each, the
quality of the machine, whatever the machine does for free — a foundry casts half again as
much — and the beacons, by where they stand.

Beacons are the part worth stating. A beacon reaches every machine whose footprint touches its
area — its own footprint grown by `range` on every side — and hands over `effectivity` of its
modules' effect, shared down by the crowding profile once several of them reach the same
machine. An empty beacon is left out entirely rather than counted and multiplied by nothing,
because it would otherwise dilute the share of the beacons around it.

A machine with no recipe is not a machine making nothing; it is a machine whose output nobody
has stated, and a furnace has no recipe to set at all. Those are counted apart and said under
the list rather than folded into the total as a zero.

The arithmetic lives in `src/core/rates.ts`, and the formula it uses is the same one the
calculator uses backwards — both call `throughputOf` in `src/core/calc/machine.ts`, because a
plan and the thing built from it must not disagree about the same factory.

## Keeping your own schemas

The menu behind the burger holds the examples and whatever you have saved. Type a name and press
**save** to keep the buffer under it; saving again under the same name replaces it rather than
growing a second copy, and the × beside one forgets it. The name of whatever is open comes back
after a reload, along with the buffer itself.

It is all `localStorage` in the reader's own browser — the studio has no server to send anything
to. A schema is a few kilobytes of text, the whole library is read every time the menu opens,
and a synchronous read means there is never a moment where the list is on screen but not yet
loaded, which is what IndexedDB would have bought at the price of async. Clearing site data
clears the schemas.

## Overlapping entities

When two things land on the same tile the preview draws **everything** and marks the overlaps
red, rather than showing an empty view with an error. Debugging a collision means seeing what
collided.
