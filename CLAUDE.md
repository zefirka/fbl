# Working in this repo

## Start at the docs, not at the code

**[docs/README.md](docs/README.md) is the index.** Before looking for how a feature works, open
it and find the file that covers the thing you are about to touch. Each file says what its
capability does, why it is built that way, and where its code lives — which is faster than
grepping, and it is the only place the *reasons* are written down. Grepping finds you the code
and none of the decisions behind it.

If the index does not obviously point somewhere for what you are working on, that is a gap in
the index. Fix it while you are here.

**Read [docs/data.md](docs/data.md) before changing anything about recipes, machines or raw
materials.** The dataset was built for a ratio calculator, and every trap in it produced a
plausible-looking wrong answer before it was found — iron grown out of jellynut, refineries
replaced by wells, ore melted instead of lava. They are all written down there.

## Change the behaviour, change the doc

In the same pass, not later. A doc that has drifted is worse than none, because it is believed.

- Changed how something works → update the file that describes it.
- Added a capability → it needs a home. Either a section in the file that already covers its
  area, or a new file plus a row in the index.
- Removed something → take its prose out. Do not leave it standing as history.

## Found a discrepancy? Fix it

If the docs and the code disagree, do not work around it and do not leave it for later. Work
out which one is wrong and correct that one — usually the doc, sometimes the code, because a
doc that describes the intended behaviour is a bug report for the code. Say which way round it
was in your reply.

The same goes for a comment that no longer matches what its function does, and for the tests:
where a doc and a test disagree, the test is right until proven otherwise.

## Prose style

Comments and docs explain **why**, in plain sentences above the thing they explain. What the
code does is visible; what would go wrong otherwise is not. Do not annotate the obvious, do not
leave a heading with nothing under it, and prefer one honest sentence to three hedged ones.

## Before you say it works

```bash
npm test          # bundles the core for Node, then runs everything
npx tsc --noEmit  # both pages typecheck
npm run build     # both pages build
```

Anything visual is verified **in the browser**, not by reasoning about it. Every sprite and
routing bug in this repo's history was found by looking at the result and none by thinking hard
about the data. Say what you actually checked, and say plainly when you did not check
something.

## The shape of the thing

- `src/core/` never imports from `src/ui/`. It runs in Node, which is what the tests use.
- Two pages, two Vite entries: the studio (`index.html`) and the calculator (`calc.html`).
  They share the core and a little of `src/ui`; the calculator must not pull in the editor.
- Anything worth testing has to be reachable from `src/core/index.ts` or `src/ui/sankey.ts`
  and must not touch the DOM — those are the two bundles the tests import.
- One formula, one place. The studio's rates panel and the calculator solve the same equation
  from opposite ends and both call `throughputOf`; a plan and the thing built from it must not
  disagree about the same factory.
