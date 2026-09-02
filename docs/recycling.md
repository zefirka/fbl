# Farming quality

The calculator's second tab. You describe a loop of assemblers and recyclers and it tells you
how many legendaries a minute come out of it, what that costs in fresh ingredients, and how
many machines each rung of the ladder needs.

## The mechanic, and why the odds surprise people

A machine with quality modules has a chance `Q` of turning out something better than what it
was fed. On a successful roll the tier goes up one — and then up another one time in ten, and
another one time in ten of those. So the roll spreads like this, and the top tier takes the
whole tail because it has nowhere further to send anything:

```
five legendary quality 3s in an electromagnetic plant → Q = 31.25%

normal 68.75%   uncommon 28.125%   rare 2.8125%   epic 0.28%   legendary 0.031%
```

**Three in ten thousand.** A hundred circuits a minute yields three legendaries an *hour*
straight out of the machine. That is not how anybody farms quality, and it is the whole reason
the loop exists.

The loop is a ladder. Anything that comes out below the tier you want goes to a recycler, which
hands back a quarter of the ingredients *at that item's quality* — and with quality modules in
the recycler, some of them come back a tier higher again. Those feed the assembler of that tier,
which rolls afresh from a higher starting point. Every rung leaks three quarters of what enters
it and passes a trickle upwards, and the trickle is where legendaries come from: in the example
above, the ladder returns about **sixty times** what falls out of the first roll.

## What it asks and what it answers

**Every rung is set on its own card**, the way a node is set in the production tab: the machine
it runs, what that machine was built to, and what is in its module slots — for the assembler
and for the recycler of each tier. The rail asks only what you are farming, from which quality
up to which, and how many assemblers stand on the bottom rung.

A rung nobody has touched runs the best machine that can do the job with nothing in it, so a
ladder is usable the moment an item is picked and only the rungs you care about need saying.
The settings are stored sparsely for the same reason: what is written down is what differs.

That matters more than it sounds, because the rungs are not alike. The bottom one is a factory
and the top one is a single machine ticking over, and putting legendary modules in both is not
what anybody builds.

**They can also be filled all at once.** Nearly every ladder is nine machines holding the same
module, and saying that a slot at a time is thirty-six clicks for one sentence. *Fill every
rung* in the rail writes one module, at one tier, into every slot of every assembler — or every
recycler — and the cards remain where a rung that differs is set. The moment one of them says
something else, the rail reads **mixed**.

Either end can be the fixed one, because the whole system is linear and the sum reads the same
from either side:

- **the factory** — twenty assemblers at the bottom rung, and it works out what comes out;
- **the output** — a hundred legendaries a minute, and it works out the factory.

Asking for an output the ladder cannot reach is not an error. A fresh ladder has no modules
anywhere and yields nothing, and no factory makes a hundred a minute of nothing — but scaling
that answer to zero empties the diagram of the very cards the modules go in. So it stands one
machine up on the bottom rung, draws the ladder, and says what is missing.

What comes back: the rate at the target quality, how many fresh ingredient sets each one costs,
the items a second arriving at every tier, and the assemblers and recyclers each rung needs.

## Reading it

Everything on this tab is counted **a minute**, not a second. That is not a style choice: three
legendaries an hour is the sort of number the tab exists to show, and per second it reads as
zero.

A tier badge on a card says which rung it is — which quality of item is passing through it —
and never what the machine is. The machine's own tier is stamped on the machine's icon inside
the card, and it is the same machine on every rung, because one setup stands for all of them.
Stamping the rung onto the recycler read as a ladder of ever better recyclers, which is not
what the setup says at all.

The labels on the lines carry a tier badge too, for a plainer reason: every line on this diagram
is the same item, so the icon alone tells you nothing about which of them you are looking at.
The badge is the item's quality, and the tooltip spells it out — *electronic circuit · epic ·
25.8/min*. Normal is left unstamped, the way the game leaves it.

## What a recycler actually gives back

Read from the game's own recycling recipe, never worked out by taking a quarter of the crafting
one. The two are not mirrors of each other, and the differences are the whole shape of the tab:

- **No recycler ever hands back a fluid.** Shred a processing unit and the twenty electronic
  circuits come back as five; the five sulfuric acid are simply gone. So the acid is not part of
  what goes round — every rung buys its own, for every craft it runs. In a twenty-plant
  legendary ladder that is 1152 acid a minute against the 726 you would get by counting only
  what the bottom rung takes. It is true of every recipe with a fluid in it: the lubricant in an
  express belt, the water in concrete, the electrolyte in a tesla turret.
- **Some things do not come apart at all.** A plate, a science pack, anything smelted or made
  out of a fluid gives back a quarter of *itself*. That is still a ladder — it just climbs
  through the recyclers rather than through the assemblers, and only the bottom rung crafts.
  Sixty-three items in Space Age work this way, including every plate and every science pack.
- **Some recipes are not the one the recycler reverses.** Cast a gear from molten iron and
  shredding it hands back iron plates, which no foundry will take. So the ladder picks the
  recipe rather than the other way round: `loopRecipeFor` finds the one whose ingredients are
  what shredding gives back. Nutrients have five recipes and only the one made from spoilage
  feeds itself.
- **And some close no loop at all.** Hazard concrete comes back as stone bricks; scrap comes
  back as a whole planet's economy. Those say so, rather than pretending.

## Two units, kept apart

A **set** is one craft's worth of ingredients; an **item** is one of the things that come out.
The difference matters more than it sounds. A recipe that makes two at a time turns one set into
two items, and recycling one of those gives back an eighth of a set rather than a quarter —
which is exactly what the data says for iron sticks and copper cable. The recovery is read from
the recycling recipe rather than assumed to be a flat quarter, and productivity counts too: an
electromagnetic plant's free half again is half again more material going round the loop.

Which unit goes round is what the two loops differ in. Where the ingredients come back, one
fresh set is bought at the bottom and the recyclers hand the rest back, so the bill for a looped
ingredient is the fresh sets alone. Where the item comes back as itself, nothing is returned to
any assembler, so every craft is paid for in full.

## What it does not model

- **Only the item is recycled.** Its ingredients are fed straight back in; they are not
  themselves crafted with quality modules and given a ladder of their own.
- **No beacons**, and no quality on the ingredients arriving from outside beyond the base tier
  you pick. Fluids arrive at no quality at all, which is what the game does.
- **One recipe, one recycler.** A ladder is one crafting recipe and the recycler that reverses
  it. The two-recipe loop — cast quality gears out of endless molten iron, shred them, and feed
  the plates to the *assembling* recipe — is a real thing people build and is not modelled.
- **Nothing climbing is not an error.** A fresh ladder has no modules anywhere and produces
  nothing, and it is still drawn — the machines are settled on the cards, so refusing to draw
  them would leave nowhere to put a module.
- Machines are counted as they are needed, not as whole ones — the ceiling is shown on each
  card, but the ladder is solved on the exact rates.

## Where it lives

- `src/core/calc/quality.ts` — the ladder: the roll, the loop, and the flows between tiers.
  `recyclingOf` is where what comes back is read, and `loopRecipeFor` is which recipe a ladder
  is built on. No DOM, and the arithmetic is pinned by tests.
- `src/calc/quality-view.ts` — the diagram: a column per rung, with the recycler in the next
  one along. The columns are fixed rather than read off the longest path, which would string a
  ladder that feeds itself into a line one box wide.
- `src/calc/quality-rail.ts` — the left-hand panel.
