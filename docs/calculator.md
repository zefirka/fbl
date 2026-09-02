# The calculator

A second page — `calc.html`, linked from the toolbar — that answers the other half of the
question. You say what you want a second; it works out every recipe behind it, how many
machines each one takes, and draws the chain left to right as a Sankey, each ribbon as thick as
the flow is wide. Nothing about it touches your schema: it is a plan, not a blueprint, and the
two are deliberately kept apart. It ships as its own entry point too, so the page never loads
the editor it does not use.

What makes it more than division is that recipes are not a tree. An oil refinery makes three
things at once, cracking turns two of them back into the third, and a plate can be smelted or
cast — so "how much refining" and "how much cracking" are one question with one answer. It is
put to a linear programme: one variable per recipe, one row per item saying that what is made
covers what is used, minimised against what the plan draws out of the ground. Everything else
falls out of the same frame instead of needing a rule of its own — machines you already have
are a row fixing that recipe's rate, a target you cannot reach leaves a shortfall the solver
would rather pay than fail, and a byproduct nobody wants is simply supply nobody claimed.

A surplus routed somewhere is a standing answer to "what do I do with the spare", not a recipe
switched on for good: it runs only while something in the plan is still making that spare. Left
on unconditionally, cutting a chain off at the top leaves the cracking behind, and the cracking
goes looking for oil to crack — putting back the very refinery that was just taken off the bus,
or finding a coal mine to replace it.

Any node can be cut off from below. Sometimes what is behind a thing is somebody else's
problem — the plates come off the bus and all you want is the number — so every recipe carries
a **take from the bus** control that drops it and everything that was only there to feed it,
leaving an amount you need rather than a factory you build. It is the same switch as
**make it here** on an input, pointed the other way, and both are listed in the rail so a
decision made on a node that has since gone can still be undone.

Digging is a recipe like any other, and a drill is a machine like any other. Ore is *bought* by
default — most plans start from a belt of it, and nobody asking for one locomotive wants six
hundred mining drills in the answer — but the drills are one click away on the ore's own node,
with all three of them to choose between and module slots on the two that have them. The rule
that decides which way round is simple: bringing a thing up out of the ground does not count as
making it, so a plan stops wherever the only way on is a drill or a pump.

That rule has one trap in it, and it is worth stating because the data walks straight into it.
Heavy oil comes out of a well on Vulcanus, and the recipe is even named `heavy-oil` — so both
of the obvious ways to pick a default put the well ahead of the refinery, and every plan for
petroleum would replace its refineries with wells. Extraction comes first only for the things
you actually dig, and last for everything else.

Where an item has two real ways to make it and neither is named after it, the cheaper raw
materials win — priced by the dataset's own reckoning, which is a hundred a unit for anything a
drill brings up, one for crude oil, and next to nothing for what a pump lifts out of a lake.
That is what puts a foundry on **lava rather than ore**: molten iron out of lava and calcite
costs a twentieth of melting mined ore, which is exactly why Vulcanus is built that way. Recipes
made straight out of raw materials are ranked ahead of ones that are not, so cracking stays
behind the refinery it is meant to be tidying up after instead of appearing to be a cheap way
of making petroleum.

One default is still arguable: solid fuel comes out of Aquilo's ammonia, because ammonia is
pumped and therefore free while light oil has to be refined. It is one click to the light-oil
recipe. Doing better means knowing which planet a plan is for — the dataset carries a
`locations` field for exactly that — and that is a feature, not a tiebreak.

Which recipes are on the table stays yours. The solver decides how fast, never what with, so
nothing turns up in a plan because an optimiser found it cheap. Two whole classes are off the
table before that: recycling and barrelling, because 43 recipes produce an iron plate and 41 of
them are shredding something back into one; and everything nothing can be *built* to run.
Space Age carries recipes for what happens on its own — food spoiling, bacteria multiplying
into ore in a crate — and those have no machine at all. Left in, they cost nothing to build,
and a plan asked for a locomotive answers with six thousand biochambers growing iron out of
jellynut.

Going short is priced twice over, and the difference matters. Falling short of something in the
middle of a chain is bad; falling short of what was asked for is giving up. With one price the
solver would rather abandon the locomotive than admit to seventeen asteroid chunks it cannot
get — the arithmetic is right and the answer is useless, because a plan that shows nothing says
nothing about what is missing. Priced apart, it builds everything it can and names the one
thing it could not.

Every setting sits on the node it changes — which machine runs a recipe, what is in its module
slots, how many beacons reach it, and which recipe makes a thing where there is a choice.
A calculator that keeps those in a table somewhere else makes you hold the graph in your head
to use the table.

Nothing is chosen from a dropdown. Everything here is a thing the game draws, and a list of
names is the one form in which those are hardest to tell apart — nobody recognises
"Electromagnetic plant" as fast as they recognise its picture. So every choice opens a grid of
icons, filed the way the game files them (the item picker has the crafting menu's own tabs and
row order), with the name and the numbers that decide it under the cursor: a machine's speed,
slots and draw; a module's effects; what a recipe takes and gives. Module slots are drawn as
slots, so you can see how many are filled, and picking one fills the machine unless you say
otherwise. Tell a node you already have twelve of something and the rest of the plan is
worked out around it; what it then cannot cover is said out loud rather than quietly rounded
away. A surplus becomes a box of its own asking what you would like done with it, and pointing
it at cracking rebalances the whole chain rather than just tidying the leftovers.

Ribbon width is belts, not items a second. Water moves at four hundred a second and copper wire
at forty, so widths in items would draw every chain as a river with some threads beside it;
what is comparable — and what you are about to go and build — is how much carrying a flow
takes. Rates are still what the labels say, and since the width *is* belts, a thick ribbon is
ruled with a hairline on every belt boundary: you can count them.

The scale has a ceiling rather than a fixed pixels-per-belt, the way Kirk McDonald's calculator
caps its node height. Without one the diagram is at the mercy of its largest number — 337 iron
plates a second is twenty-two yellow belts, and at any honest scale that is a ribbon wider than
the card it comes out of. Flows are coloured per item, which is what keeps two of them crossing
legible.

The whole plan lives in the address bar. Every change rewrites the fragment, so the link in
front of you is always the plan in front of you and there is nothing to remember to save;
**copy link** in the toolbar puts it on the clipboard. It goes in the fragment rather than the
query so it never leaves the browser — no server, and no access log between here and whoever
you send it to — and it is deflated first, because a plan is mostly the same few recipe ids
written over and over. A whole science plan with modules on every node comes to a few hundred
characters.

Following a link shows that plan rather than the one you were last looking at, and your own is
not lost: it is still in this browser, and clearing the fragment brings it back. Where you had
panned and zoomed to does not travel — that is about where you were looking, not about the
plan.

Every ribbon says what it carries and how fast, however thin it is, and where a node feeds more
than one place it says **how many of its machines** that branch is worth: five assemblers making
copper cable, four of them for the green circuits and one for the red. That is the question the
diagram is for, and the share of the flow is the share of the machines, so the number was
already there — it only had to be written down. It is apportioned out of the machines you would
*build* rather than the fraction the plan strictly needs, so the numbers along the ribbons add
up to the number on the card.

Every flow arrives and leaves through a **port**: a thin tab on the edge of the card, in the
colour of what is moving, inputs down the left and outputs down the right. Ribbons end *on*
something rather than merely near it, which is what closes the gap they used to leave — and
what makes an input readable as an input before you have traced where it came from.

A ribbon is a filled shape rather than a very thick line. Stroking a curve puts the width
*perpendicular* to it, so where the curve is steep the band splays out sideways and a heavy
flow stops looking like a flow at all — it reads as a blob. A Sankey ribbon is vertically
thick: its two edges are the same curve, one raised by half the width and one dropped by it.
That stays honest at any steepness.

On a version with quality, the tier is chosen where the thing itself is chosen: the machine
picker and the module picker each carry a row of tiers, and what you pick is stamped on the
icon the way the game stamps it. A legendary electric furnace smelts at 5 rather than 2, so the
count on the card drops as you click. Quality on the *products* is a different question — a
plan for legendary circuits is a plan with a quality chain in it — and this does not answer it.

## Getting around it

Zoom and pan, and nothing else: the wheel zooms about the cursor so the thing under it stays
under it, and dragging the background moves the plan. Dragging a *card* does not, because a
card is full of controls someone is trying to hit — and text on a card stays selectable,
because a machine name is a thing you copy.

Those two wants pull against each other: left alone, a drag that starts on the background
sweeps a text selection across every card it crosses. So a press on the background refuses the
browser's default before it starts one, and for the length of the drag nothing on the page is
selectable. A press on the text itself is not touched at all, so selecting still works.

The viewport is one object that is never replaced, which is not a detail. Panning holds a
reference to it and writes into it as the pointer moves; anything that swaps it for a fresh
object — fitting, the zoom buttons, following a link — leaves the pan writing into something
nothing else reads. That showed up as a drag after a fit snapping the zoom back to whatever it
was when the page loaded.

## Where it lives

- `src/core/calc/graph.ts` — which recipes are on the table, who makes what, what counts as
  raw, and what a raw item is worth.
- `src/core/calc/solve.ts` — builds the linear programme and reads the answer back as nodes
  and flows.
- `src/core/calc/simplex.ts` — the solver itself: two-phase simplex, Bland's rule.
- `src/core/calc/machine.ts` — crafts per second, shared with the studio's rates panel.
- `src/core/calc/share.ts` — a plan packed into a link.
- `src/ui/sankey.ts` — the layout: columns, ordering, lanes, ports. Pure arithmetic, no DOM.
- `src/calc/` — the page: cards, pickers, the diagram, the rail, state.

The data traps that shaped all of this are written up in **[data.md](data.md)**; read that
before changing anything about which recipes are usable or what they cost.
