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
<p>Only styling slots can be defaulted — ${chips(['tier', 'quality', 'dir', 'recipe', 'modules', 'gap', 'align', 'route'])} —
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
<p>A layout only packs along <b>its own axis</b>. The first item stays exactly where it was
written and each one after it starts a <code>gap</code> past the one before; nothing moves
across the axis. A machine you put above the line stays above the line, and a belt written
after the row finds it there — which is what makes <code>auto</code> usable beside a layout:</p>
${code(`
row (gap 2) for i in 0..4 => {
  electromagnetic-plant (at (-5, -3), recipe quality-module)   ; above the line
  bulk-inserter (at (-1, 0), west)                             ; on it
}
belt (from (24, 0) to (-12, 0), auto)                          ; tunnels under each group
`)}
<p><code>align</code> opts into moving things across the axis, and is measured against the
items themselves so it means the same wherever the layout sits: ${chips(['start'])} flushes
them to the leading edge, ${chips(['center'])} and ${chips(['end'])} follow. Without it their
own placement stands.</p>
${code(`
at (10, 4) => { … }                     ; shift the frame
transform (rotate-cw) => { … }          ; turn or mirror what the body built
row (gap 1) => { … }
column (gap 1, align center) => { … }
for i in 0..n => { … }
if n > 4 => { … } else => { … }
def m = measure (cell ())               ; evaluate, report the box, remove it again
`)}

<h2>Raising your own errors</h2>
<p>A block can refuse the arguments it was given. <code>throw</code> stops the build with your
message, and the error lands on the <b>call</b> — the line that needs fixing — naming the block
that raised it:</p>
${code(`
defblock bank (int size) => {
  if size < 2 => { throw "size must be at least 2" }
  for i in 0..size => { steel-chest (at (i, 0)) }
}

bank (at (0, 0), size 4)
bank (at (0, 2), size 1)      ; size must be at least 2 — thrown by 'bank' on line 2
`)}
<p>A parenthesised list is joined with spaces, exactly as <code>print</code> reads its
arguments, so the message can name the value that broke the rule:</p>
${code(`
throw ("size must be at least 2, got", size)
`)}
<p>Like every error, it means nothing is placed at all — the preview goes empty rather than
showing half a blueprint.</p>

<h2>Turning and mirroring</h2>
<p><code>transform</code> builds its body the plain way round and then turns what came out.
${chips(['flip-h'])} swaps left and right and ${chips(['flip-v'])} swaps top and bottom — the
axes the game's own flip buttons use — ${chips(['flip-hv'])} is both at once, which is a half
turn, and ${chips(['rotate-cw'])} and ${chips(['rotate-ccw'])} are quarter turns.</p>
${code(`
side-buffer (at (0, 0), size 3)
transform (flip-h)    => { side-buffer (at (0, 6), size 3) }
transform (rotate-cw) => { side-buffer (at (12, 0), size 3) }
`)}
<p>Everything inside sees an ordinary frame, so blocks, layout forms and <code>auto</code> need
to know nothing about it. The box keeps its top-left corner and a quarter turn swaps its width
and height, as it does in the game. Footprints move whole — a 1×2 splitter lands on the tiles
it would have covered had it been built that way round — and directions turn with them, except
for entities the game will not let you turn, which only move.</p>
<p>What the geometry cannot show is handedness: a splitter's priorities and a belt's lanes are
named relative to the way the thing faces, so a mirror turns every left into a right and they
are swapped to match. A rotation does not, and two mirrors cancel — only
${chips(['flip-h'])} and ${chips(['flip-v'])} swap them.</p>
<p>One limit worth knowing: a machine whose fluid connections are asymmetric — a chemical plant,
an oil refinery — is moved and turned correctly, but 2.0 stores its internal mirroring as a
separate flag on the entity, and that flag is not written yet.</p>

<h2>Labels and arithmetic</h2>
<p>A slot is written <code>name value</code>, which leaves one place where an argument could be
read two ways: <code>at (0, lines - j)</code> might be a subtraction, or the label
<code>lines</code> with the value <code>-j</code>. Minus is the only operator that can also
begin a value, so it is the only one that was ever in doubt — and it is read as arithmetic. A
labelled negative writes its own brackets: <code>gap (-2)</code>.</p>

<h2>Choosing a value</h2>
<p><code>?</code> picks between two values, where <code>if</code> picks between two pieces of a
program. It reads looser than every operator and chains to the right, so a run of conditions
needs no brackets:</p>
${code(`
def pos = i > 2 ? 3 : 1
def t = i < 4 ? yellow : i < 8 ? red : blue

bulk-inserter (at (i, 0), i > 1 ? left : right)
`)}
<p>The slot's own type reaches both halves, which is why the members there can be written bare
— the choice does not get in the way of anything else the language knows.</p>

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
<p>Obstacles standing a single tile apart share one longer tunnel. That lone tile has nowhere
to surface: it would have to be the exit of one pair and the entry of the next at the same
time, so the belt stays under it and comes up past the far obstacle. If the tier cannot reach
that far it is an error naming one that can, rather than a belt quietly laid over a machine.</p>
<p>Not everything on the path is an obstacle. A splitter, belt or tunnel <b>already running
the way this belt is heading</b> is the same line: the belt joins it and comes out the far
side. So a splitter drops into a run without the belt diving around it, and two runs along one
line merge instead of colliding:</p>
${code(`
express-splitter (at (7, 0), east)
belt (from (0, 0) to (14, 0), auto)     ; feeds the splitter, carries on past it

belt (from (0, 4) to (10, 4), auto)
belt (from (5, 4) to (15, 4), auto)     ; the overlap is left as it was
`)}
<p>Turn that splitter across the line and it is an obstacle like any other, tunnelled under.
A belt running the <i>opposite</i> way on the same tile is an error — only one of them can be
there — and it names which way the one already standing runs.</p>
<p><code>defaults (auto)</code> puts every belt below it on that footing, so a bus does not
have to say it on every line:</p>
${code(`
defaults (tier blue, auto)

assembling-machine-3 (at (3, -1))
belt (from (0, 0) to (10, 0))       ; tunnels, without asking
belt (from (0, 2) to (10, 2), direct)   ; unless it says otherwise
`)}
<p>Where the obstacle is written does not matter. Routing waits until the program has finished
and then reads the blueprint as it actually stands, so a splitter three lines below the belt
merges into it exactly as one three lines above would. The tiles themselves go down as the belt
is met — handles and layout measurement see the run straight away — and only the choice between
belt, tunnel and nothing waits for the end.</p>
<p>Two <code>auto</code> runs along one line still resolve in the order they are written: the
later one merges into the earlier, not the other way round.</p>

<h2>Libraries</h2>
<p>Nothing outside the language itself is in scope until it is asked for. <code>import</code>
brings a library's blocks and helpers into the same namespace as the entities — no prefix, no
aliasing — and using one of them without the import says where it lives rather than guessing at
a typo:</p>
${code(`
import "stdlib"

balancer (at (0, 0), 4 to 4)
side-buffer (at (7, 0), size 4)
`)}
<p>There is one library so far, <code>stdlib</code>. It holds <code>balancer</code>, which the
interpreter expands from a book of ready-made blueprints, and <code>side-buffer</code>, which
is written in fbl and reads like anything else you would write yourself. A guard inside a
library reports on <b>your</b> call and names the library, since its line numbers mean nothing
to you.</p>
${table(
  ['from stdlib', 'what it is'],
  [
    ['<code>balancer</code>', 'every N→M belt balancer from 1 to 8'],
    ['<code>side-buffer</code>', 'boxes in a row, fed and drained from the side'],
    ['<code>line-buffer</code>', 'inserter, box, inserter, box — a chain along one line'],
  ],
)}

<h2>Balancers</h2>
<p><code>balancer</code> places a ready-made belt balancer — every N→M from 1 to 8. It comes
from <code>stdlib</code>, so it needs the import:</p>
${code(`
import "stdlib"

balancer (4 to 8)                       ; four lanes in, eight out
balancer (at (0, 20), 8 to 4, right, green)
`)}
<p>The library comes from a community blueprint book, and every balancer in it is built from
belts, undergrounds and splitters alone. Nothing there differs between tiers, so one geometry
serves all of them — including turbo, which the book predates. The whole layout rotates with
<code>dir</code>.</p>
<p>Directions also answer to screen words: ${chips(['up', 'right', 'down', 'left'])} are
${chips(['north', 'east', 'south', 'west'])}.</p>

<h2>Contents, filters and priorities</h2>
<p><code>content</code> says what a belt or a chest is meant to be carrying. It is metadata:
it never reaches the blueprint, it only shows in the preview and feeds the analysis that will
read it later. A belt has two lanes, so an entry may name the side it rides on; a chest has
none, and holds as many kinds as it has stacks:</p>
${code(`
belt (from (0, 0) to (8, 0), content (iron-ore left, coal right))
steel-chest (at (9, 0), content (iron-plate, copper-plate))
`)}
<p>On a belt the icons ride their lane along every tile of the run, so the whole path reads at
a glance. A chest carrying more than four kinds shows how many instead of the icons.</p>
<p>Inserter filters are a list, and <code>not</code> in front of it makes the whole list a
blacklist — the game holds one mode for the inserter, not one per item:</p>
${code(`
fast-inserter (at (0, 2), filter (copper-plate, copper-ore))
fast-inserter (at (2, 2), filter (not copper-ore))
`)}
<p>A splitter filters a single item, and prefers a side on the way in, on the way out, or
both. Naming a filter without <code>out-priority</code> sends it left, which is what the game
does:</p>
${code(`
splitter (at (4, 2), filter copper-plate, in-priority right)
splitter (at (6, 2), in-priority left, out-priority right)
`)}
<p>In the preview each one is a chevron on the lane it acts on, hugging the edge it belongs
to — the input side at the back, the output side at the front. Left and right are the
splitter's own, looking the way it faces.</p>

<h2>Functions</h2>
${table(
  ['function', 'signature'],
  FUNCTIONS.map((fn) => [
    `<code>${escape(fn.name)}</code>`,
    `<code>(${escape(fn.params.map(showType).join(', '))}${fn.variadic ? ', …' : ''}) → ${escape(showType(fn.result))}</code>`,
  ]),
)}

<h2>Reading the game data</h2>
<p><code>recipe</code> and <code>entity</code> are separate vocabularies that happen to share
names: <code>steel-chest</code> is both something you craft and something you place.
<code>to-entity</code> and <code>to-recipe</code> carry a name from one to the other, and say so
plainly when it has no twin — which is how a block holding a <code>recipe</code> gets to place
it:</p>
${code(`
defblock stash (recipe r) => {
  def entity box = to-entity (r)
  box (at (0, 0))
}
`)}
<p><code>width</code> and <code>height</code> report an entity's footprint before it is turned,
which is what you want for spacing something you were handed rather than something you chose:</p>
${code(`
for i in 0..4 => {
  assembling-machine-3 (at (i * (width (assembling-machine-3) + 1), 0), recipe m)
}
`)}
<p>A block has no size of its own — it is whatever it builds — so ask
<code>measure (block ())</code> for that instead.</p>

<h2>Entity slots</h2>
<p>Which slots an entity accepts is derived from its prototype, so a chest has no
<code>recipe</code> and a pole has no <code>dir</code>. A few examples:</p>
${['assembling-machine-3', 'bulk-inserter', 'splitter', 'steel-chest']
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

<h2>Fluid connections</h2>
<p>A machine whose recipe uses a fluid grows the pipe stubs the game gives it, on the sides its
fluid boxes sit — so an assembler making concrete meets the pipe you put beside it, and the
same machine making gears has no pipes at all:</p>
${code(`
assembling-machine-3 (recipe concrete, east)
pipe-to-ground (at (3, 1), west)
`)}
<p>The stubs turn with the machine. A chemical plant needs none of those — its pipes are part
of its own sprite — but every machine's open connections get the cap the game puts on anything
with nothing attached, and lose it as soon as a pipe stands there.</p>
<p>This is preview only: the blueprint stores a position and a recipe, and the game works the
pipes out for itself.</p>

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
<p>The panel in the corner of the preview totals what the blueprint costs, at three depths.
<b>items</b> is what the schema places, modules included. <b>basic</b> follows those down to
the materials they are made of. <b>raw</b> keeps going, all the way to what the game extracts:
ore, lava, oil, water, fruit. The × in the corner puts the panel away; clicking what is left
of it brings it back.</p>
<p>“Extracts directly” is doing real work there. It is not the same as “has no recipe”: in
Space Age <code>iron-ore</code> has a recipe of its own that grows it from bacteria, and
following that would price a transport belt in biochambers. The trail stops wherever something
mines an item or grows it, or makes it out of nothing — or where nothing makes it at all. Wood
is chopped from trees and holmium ore comes out of scrap, which this model does not follow;
both are inputs rather than gaps, and are listed as such.</p>
<p>A <b>material</b> is an item that is <i>processed</i> rather than assembled — its recipe
runs in a furnace, a foundry, a chemical plant, a refinery — and that is made of nothing but
raw resources and other materials. Both halves matter: a foundry casts turbo belts too, but
out of gears and plates, so a belt is not a material. What survives is the tier you would
actually shop for — plates, steel, plastic, lubricant, tungsten plate — instead of the ore,
lava and fruit underneath them.</p>

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
