# Belt routing

What `auto` does: how a belt gets from one end to the other when something is in the way, and
the rules that decide when two belts are the same line rather than a collision.

## Routing under obstacles

```
assembling-machine-3 (at (3, -1))
belt (from (0, 0) to (10, 0), blue, auto)   ; tunnels beneath the machine
```

`auto` does not route around what is in the way — it goes under it. Each run of blocked tiles
becomes an underground pair, entry on the last free tile before it and exit on the first free
tile after; obstacles a single tile apart share one longer tunnel, since that tile would have to
be both an exit and an entry. A line already running the way the belt is heading — a splitter, a
belt, a tunnel — is not in the way at all: the belt joins it and carries on. A span the tier
cannot reach is an error naming a tier that can, rather than a belt quietly laid across a
machine.

Where the obstacle is written does not matter. Routing waits until the program has finished and
then reads the blueprint as it stands, so a splitter three lines below the belt merges into it
exactly as one three lines above would. The tiles go down as the belt is met — handles and
layout measurement see the run straight away — and only the choice between belt, tunnel and
nothing waits for the end. Two `auto` runs along one line still resolve in source order: the
later merges into the earlier.

`defaults (auto)` puts every belt below it on that footing, so a bus does not have to say it on
every line; a belt that wants the old behaviour writes `direct`.

```
defaults (tier blue, auto)

assembling-machine-3 (at (3, -1))
belt (from (0, 0) to (10, 0))           ; tunnels, without asking
belt (from (0, 2) to (10, 2), direct)   ; unless it says otherwise
```

It composes with `row` and `column`: the layout has finished by the time anything is routed, so
a belt inside one sees its neighbours where they actually ended up.

## Where it lives

`src/core/routing.ts` decides the shape of one run — which tiles become an underground pair,
which are left alone — over a path and a row of tile states. It knows nothing about the scene;
`settleAutoRuns` in `src/core/run.ts` is what classifies the tiles, runs every belt after the
program has finished, and retries the ones that lost a race.

Routing happens **after** the whole program has run, not while it runs. That is the reason a
belt written anywhere works: by the time it is routed, everything it might have to pass under
has already been placed, whatever order it was written in.
