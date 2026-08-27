import {
  entitySlots,
  FUNCTIONS,
  HELPER_SLOTS,
  showType,
  Universe,
  type ProtoRegistry,
} from '../core'

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const code = (source: string) => `<pre><code>${escape(source.trim())}</code></pre>`

const table = (headers: string[], rows: string[][]) => `
  <table>
    <thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`

const chips = (values: string[]) => values.map((v) => `<code>${escape(v)}</code>`).join(' ')

/**
 * The reference. Anything that exists as a table in the core — types, slots, functions,
 * vocabularies — is rendered from that table rather than retyped, so it cannot drift.
 */
export function renderDocs(registry: ProtoRegistry): string {
  const universe = new Universe(registry)

  const slotRows = (name: string) => {
    const proto = registry.entities.get(name)
    if (!proto) return []
    return entitySlots(proto, registry.profile.supportsQuality).map((slot) => [
      `<code>${slot.name}</code>`,
      `<code>${escape(showType(slot.type))}</code>`,
      slot.doc ?? '',
    ])
  }

  return `
<h1>fbl reference</h1>
<p class="lede">Round brackets are the only constructor. A comma between arguments is optional.
A line break ends a statement unless you are inside <code>( … )</code>.</p>

<h2>Shape of a program</h2>
${code(`
defaults (tier blue)                            ; module-wide settings
def prod-3 = repeat (4, productivity-module-3)  ; a named value

defblock cell (recipe r, module[] m = ()) => {  ; a block writes itself from (0, 0)
  belt (from (0, 0) to (2, 0))
  assembling-machine-3 (at (0, 2), recipe r, modules m)
}

row for i in 0..8 => { cell (recipe iron-gear-wheel, modules prod-3) }
`)}

<h2>Placement</h2>
<p>Everything you can place — a game entity, a helper, a block of your own — is called the
same way, and its arguments are <b>slots</b>:</p>
${code('assembling-machine-3 (at (0, 2), recipe iron-gear-wheel, modules prod-3)')}
<p><b>A value's type decides its slot</b>, so members of the small closed vocabularies are
written bare: <code>north</code> fills <code>dir</code>, <code>blue</code> fills
<code>tier</code>, <code>legendary</code> fills <code>quality</code>. A coordinate fills
<code>at</code>. Recipes and items are too large a namespace to guess from — and
<code>iron-gear-wheel</code> is both a recipe and an item — so those always take their label.</p>
<p><code>(x, y)</code> is the <b>top-left tile of the footprint</b>, in the current frame, not
its centre. The exporter converts to Factorio's centre-of-footprint convention on the way out.</p>

<h2>Types</h2>
${table(
  ['type', 'written as', 'notes'],
  [
    ['<code>int</code>', '<code>8</code>', 'whole number'],
    ['<code>float</code>', '<code>1.25</code>', ''],
    ['<code>bool</code>', '<code>n &gt; 4</code>', ''],
    ['<code>text</code>', '<code>"hello"</code>', ''],
    ['<code>coord</code>', '<code>(3, 0)</code>', 'a tile'],
    ['<code>direction</code>', '<code>north</code>', 'fills <code>dir</code> when bare'],
    ['<code>tier</code>', '<code>blue</code>', 'fills <code>tier</code> when bare'],
    ['<code>quality</code>', '<code>legendary</code>', 'fills <code>quality</code> when bare'],
    ['<code>recipe</code>', '<code>recipe iron-gear-wheel</code>', 'always labelled'],
    ['<code>item</code>', '<code>speed-module-3</code>', ''],
    ['<code>module</code>', '<code>(quality-module-3, legendary)</code>', 'an item, optionally with a quality'],
    ['<code>entity</code>', '<code>entity electric-furnace</code>', 'a building or a block, so it can be placed'],
    ['<code>handle</code>', '<code>def a = steel-chest (at (0, 0))</code>', 'what a placement evaluates to'],
    ['<code>T[]</code>', '<code>(a, b, c)</code>', 'a list; a lone value counts as one'],
  ],
)}
<p>Because <code>()</code> is the only constructor, a tuple becomes a coordinate or a list
depending on what is expected.</p>

<h2>Vocabularies</h2>
${table(
  ['type', 'members'],
  [
    ['<code>direction</code>', chips(['north', 'east', 'south', 'west'])],
    ['<code>tier</code>', chips(['yellow', 'red', 'blue', 'green'])],
    ['<code>quality</code>', chips(universe.members('quality'))],
    ['<code>underground-type</code>', chips(universe.members('underground-type'))],
    ['<code>align</code>', chips(universe.members('align'))],
  ],
)}
<p>Tier names map onto the belt families: <code>yellow</code> … <code>green</code> ≡
<code>transport-belt</code> … <code>turbo-transport-belt</code>. Full entity names work too.</p>

<h2>Module settings</h2>
<p><code>defaults</code> presets any slot left blank, for the rest of the file or for one
block. It can be narrowed to a single entity or a family. Innermost wins; within a scope, an
entity name beats a family, which beats a bare slot.</p>
${code(`
defaults (tier blue)                  ; anything with a tier slot
defaults underground (tier green)     ; just undergrounds
defaults (tier yellow) => { … }       ; only inside this block
`)}
<p>Only styling slots can be defaulted — ${chips(['tier', 'quality', 'dir', 'recipe', 'modules', 'gap', 'align'])} —
never a position.</p>

<h2>Blocks</h2>
${code(`
defblock cell (recipe r, module[] m = (), int lanes = 2) => { … }

cell (at (4, 0), recipe iron-gear-wheel, modules prod-3)
`)}
<p>A parameter answers to its own name <b>and to its type</b>, pluralised for arrays, so
<code>recipe</code> reaches <code>r</code> and <code>modules</code> reaches <code>m</code>
without naming them.</p>
<p>A block writes itself from <code>(0, 0)</code>; the caller decides where that origin lands,
so nothing inside ever does coordinate arithmetic against the outside world.</p>
<p class="callout"><b>Every block already has an <code>at</code> slot.</b> It does not need a
coordinate parameter of its own to be positioned — <code>cell (at (4, 0))</code> shifts the
whole block. And because an unlabelled coordinate always means position, <code>cell ((4, 0))</code>
fills <code>at</code>, never a parameter that happens to be a <code>coord</code>. Label it —
<code>cell (origin (4, 0))</code> — if a block really does take a second coordinate.</p>

<h2>Loops and layout</h2>
<p class="callout"><b><code>for</code> repeats; it does not position.</b> Eight calls to
<code>cell ()</code> with no <code>at</code> land eight cells on the same tile. Either compute
the position yourself, or let a layout form measure each pass and pack them.</p>
${code(`
; you compute the position
for i in 0..4 => { medium-electric-pole (at (1 + i * 7, 7)) }

; row measures each pass and packs it against the previous one
row for i in 0..8 => { cell (recipe iron-gear-wheel) }

; the same thing, spelled out
row => { for i in 0..8 => { cell (recipe iron-gear-wheel) } }
`)}
<p>Layout forms exist because the width of a block is not known in advance: it depends on the
recipe, the modules, the belt tier. <code>row</code> and <code>column</code> evaluate a child,
measure what it emitted, then translate it into place.</p>
${code(`
at (10, 4) => { … }                     ; shift the frame
row (gap 1) => { … }
column (gap 1, align center) => { … }
for i in 0..n => { … }
if n > 4 => { … } else => { … }
def m = measure (cell ())               ; evaluate, report the box, remove it again
`)}

<h2>Handles</h2>
<p>A placement evaluates to a handle. <code>right</code> and <code>bottom</code> are exclusive
edges, so <code>a.right</code> is the first free column beside it.</p>
<p>${chips(['x', 'y', 'left', 'top', 'right', 'bottom', 'width', 'height', 'size', 'pos', 'center', 'name', 'dir'])}</p>

<h2>Helpers</h2>
${code(`
belt (from (0, 0), via ((10, 0), (10, 6)), to (2, 6))   ; a path; each tile faces the next
belt (at (0, 0), east, length 20)
underground (from (4, 9) to (11, 9))                    ; typed entry/exit pair
`)}
${table(
  ['helper', 'slots'],
  Object.entries(HELPER_SLOTS).map(([name, slots]) => [
    `<code>${name}</code>`,
    slots.map((s) => `<code>${s.name}</code>: ${escape(showType(s.type))}`).join(', '),
  ]),
)}

<h2>Routing under obstacles</h2>
<p><code>auto</code> does not route a belt <i>around</i> what is in the way — it goes
<i>under</i> it. Each run of blocked tiles becomes an underground pair, with the entry on the
last free tile before it and the exit on the first free tile after:</p>
${code(`
assembling-machine-3 (at (3, -1))
belt (from (0, 0) to (10, 0), blue, auto)   ; tunnels beneath the machine
`)}
<p>If the tier cannot reach that far it is an error naming one that can, rather than a belt
quietly laid over a machine. Two obstacles with a single tile between them are also an error:
that tile would have to be both the exit of one tunnel and the entry of the next.</p>
<p><code>auto</code> only sees what was placed <b>before</b> it, so order matters — put the
machines down first. Inside a <code>row</code> or <code>column</code> it still works: a layout
settles each item into place before evaluating the next, so a belt sees its neighbours where
they will actually stand rather than piled on the origin.</p>

<h2>Balancers</h2>
<p><code>balancer</code> places a ready-made belt balancer — every N→M from 1 to 8:</p>
${code(`
balancer (4 to 8)                       ; four lanes in, eight out
balancer (at (0, 20), 8 to 4, right, green)
`)}
<p>The library comes from a community blueprint book, and every balancer in it is built from
belts, undergrounds and splitters alone. Nothing there differs between tiers, so one geometry
serves all of them — including turbo, which the book predates. The whole layout rotates with
<code>dir</code>.</p>
<p>Directions also answer to screen words: ${chips(['up', 'right', 'down', 'left'])} are
${chips(['north', 'east', 'south', 'west'])}.</p>

<h2>Functions</h2>
${table(
  ['function', 'signature'],
  FUNCTIONS.map((fn) => [
    `<code>${escape(fn.name)}</code>`,
    `<code>(${escape(fn.params.map(showType).join(', '))}${fn.variadic ? ', …' : ''}) → ${escape(showType(fn.result))}</code>`,
  ]),
)}

<h2>Entity slots</h2>
<p>Which slots an entity accepts is derived from its prototype, so a chest has no
<code>recipe</code> and a pole has no <code>dir</code>. A few examples:</p>
${['assembling-machine-3', 'bulk-inserter', 'underground-belt', 'steel-chest']
  .map((name) => {
    const proto = registry.entities.get(name)
    if (!proto) return ''
    return `<h3>${escape(proto.label)}</h3>${table(['slot', 'type', ''], slotRows(name))}`
  })
  .join('')}

<h2>Preview</h2>
<p>The <b>sprites</b> view draws the game's own art in the game's render order. Two things it
adds on top, because a sprite cannot show them: a machine's recipe floats over its centre, and
the modules in its slots appear as a badge along its bottom edge — one icon per module, in
slot order, each carrying its quality mark.</p>
<p>An underground is one statement and two entities. Both carry the same direction — that is
which way items flow — and it is <code>type</code>, entry or exit, that tells them apart. The
exit is drawn rotated 180°, so the pair reads as two ramps facing each other.</p>
<p>A belt tile only knows which way it faces; whether it is drawn straight or bent comes from
its neighbours, exactly as the game derives it. So <code>via</code> corners need no special
syntax — place the path and the bends appear.</p>
<p>The <b>schematic</b> view replaces the art with colour-coded footprints and direction
chevrons. Easier to read alignment from, and the only view available without a local Factorio
installation.</p>

<h2>Power overlay</h2>
<p>The <b>power</b> button in the toolbar (or <kbd>P</kbd>) washes everything a pole reaches in
blue and outlines the edge of the region. Anything that draws power and sits outside it gets an
orange ring, and the console says how many.</p>
<p>The number to watch is the <b>supply area</b>, which is not the wire reach people usually
quote:</p>
${table(
  ['pole', 'powers', 'wire reaches'],
  [
    ['<code>small-electric-pole</code>', '5×5', '7.5'],
    ['<code>medium-electric-pole</code>', '7×7', '9'],
    ['<code>big-electric-pole</code>', '4×4', '32'],
    ['<code>substation</code>', '<b>18×18</b>', '18'],
  ],
)}
<p>A big electric pole throws a wire 32 tiles and powers almost nothing — it is for carrying
power across a base, not for covering one. The one that covers ground is the
<code>substation</code>.</p>

<h2>Cost</h2>
<p>The panel in the corner of the preview totals what the blueprint costs. <b>items</b> is the
bill of materials — what you carry to the site, modules included. <b>raw</b> follows every
recipe down to what the game extracts directly: ore, coal, stone, water, oil.</p>
<p>“Extracts directly” is doing real work there. It is not the same as “has no recipe”: in
Space Age <code>iron-ore</code> has a recipe of its own that grows it from bacteria, and
following that would price a transport belt in biochambers. The trail stops wherever something
mines an item or makes it out of nothing.</p>

<h2>What the checker catches</h2>
<p>Parse → check → run. The checker is a gate: if it reports an error nothing is placed, so a
program never half-builds a blueprint on the way to failing.</p>
<ul>
  <li>a slot the entity does not have, listing the ones it does</li>
  <li>a value of the wrong type for a slot or a declared local</li>
  <li>an unknown name, with a “did you mean” drawn from the real entity list</li>
  <li>a recipe the machine cannot craft, naming where it <i>is</i> made</li>
  <li>more modules than the machine has slots</li>
  <li>a field a handle does not have</li>
</ul>
<p>Warnings still produce a blueprint: an underground that overruns its reach, a
<code>defaults</code> the target cannot use, overlapping footprints.</p>
`
}
