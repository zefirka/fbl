# fbl — sprite atlas

This branch carries one build artefact and nothing else: the entity sprite atlas the studio
draws with.

It lives apart from `main` because it cannot be generated in CI — `scripts/extract-sprites.mjs`
reads the PNGs out of a local Factorio installation — and because at 12MB it has no business in
the history of every clone of the source.

The deploy workflow checks this branch out into `public/sprites/` before building. To refresh
it, run `npm run extract-sprites` on `main` and push the result here.

The art is Wube Software's copyright.
