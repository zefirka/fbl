import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { EMPTY_CONFIG, ProtoRegistry, isFrontier, minimise, recipeGraph, solve } from '../dist-node/core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPA = { id: '2x1', label: 'Space Age 2.1', directionScale: 2, moduleFormat: 'items-array', supportsQuality: true }

const registry = new ProtoRegistry(JSON.parse(await readFile(join(ROOT, 'public/data/2x1/data.json'), 'utf8')), SPA)
const graph = recipeGraph(registry)

const plan = (config) => solve(registry, { ...EMPTY_CONFIG, ...config })
const rateOf = (solution, recipe) => solution.nodes.find((n) => n.recipe === recipe)?.crafts ?? 0
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// ── The linear programme ──────────────────────────────────────────────────────

test('the solver answers the textbook cases', () => {
  // min x + y subject to x + 2y = 4: all of it goes through the cheaper column.
  assert.deepEqual(minimise([[1, 2]], [4], [1, 1]).x.map(Math.round), [0, 2])

  // max 3x + 2y over the usual little polytope, written as a minimisation.
  const corner = minimise([[1, 1, 1, 0, 0], [1, 3, 0, 1, 0], [1, 0, 0, 0, 1]], [4, 6, 3], [-3, -2, 0, 0, 0])
  assert.ok(near(corner.x[0], 3) && near(corner.x[1], 1))

  assert.equal(minimise([[1], [1]], [1, 2], [1]).status, 'infeasible')
  assert.equal(minimise([[1, -1]], [1], [-1, 0]).status, 'unbounded')
  // A row written the other way round, and a row that says nothing new.
  assert.ok(near(minimise([[-1]], [-3], [1]).x[0], 3))
  assert.ok(near(minimise([[1, 1], [1, 1]], [2, 2], [1, 2]).x[0], 2))
})

// ── What counts as raw ────────────────────────────────────────────────────────

test('what a plan may help itself to is what the game digs up', () => {
  for (const item of ['iron-ore', 'copper-ore', 'coal', 'stone', 'crude-oil', 'water', 'lava']) {
    assert.equal(isFrontier(graph, item), true, `${item} should be raw`)
  }
  // A fluid the game grants in one place but a chemical plant makes everywhere is made.
  // Heavy oil comes out of a well on Vulcanus; a plan asked for petroleum should still refine.
  for (const item of ['sulfuric-acid', 'heavy-oil', 'light-oil', 'iron-plate']) {
    assert.equal(isFrontier(graph, item), false, `${item} should be made`)
  }
})

test('recycling and barrelling are not ways of making things', () => {
  const makers = graph.producers.get('iron-plate') ?? []
  assert.ok(makers.includes('iron-plate') && makers.includes('casting-iron'))
  assert.ok(!makers.some((id) => id.includes('recycling')), 'nothing is smelted by shredding a chest')
  assert.ok(!(graph.producers.get('petroleum-gas') ?? []).some((id) => id.includes('barrel')))
})

// ── Plans ─────────────────────────────────────────────────────────────────────

test('a plain chain comes out at the ratios you would work out by hand', () => {
  const solution = plan({ targets: [{ item: 'electronic-circuit', rate: 45 }] })
  assert.equal(solution.status, 'optimal')

  // An electromagnetic plant casts half again as much for nothing, so 30 crafts cover 45.
  assert.ok(near(rateOf(solution, 'electronic-circuit'), 30))
  // Three cables a circuit, two cables a craft, and the same free half again.
  assert.ok(near(rateOf(solution, 'copper-cable'), 30))
  assert.ok(near(solution.inputs.get('iron-ore') ?? 0, 30))
  assert.equal(solution.surplus.size, 0)
})

test('oil is one question with one answer', () => {
  const bare = plan({ targets: [{ item: 'petroleum-gas', rate: 100 }] })
  // Without cracking the refinery has to make all of it, and the rest piles up.
  assert.ok(near(rateOf(bare, 'advanced-oil-processing'), 100 / 55))
  assert.ok((bare.surplus.get('heavy-oil') ?? 0) > 1)
  assert.ok((bare.surplus.get('light-oil') ?? 0) > 1)

  const cracked = plan({
    targets: [{ item: 'petroleum-gas', rate: 100 }],
    extra: { 'heavy-oil': 'heavy-oil-cracking', 'light-oil': 'light-oil-cracking' },
  })
  // Cracking is not a way of making petroleum on its own: the refinery still runs, only
  // slower, and every drop it makes is now accounted for.
  assert.ok(rateOf(cracked, 'advanced-oil-processing') > 0)
  assert.equal(cracked.surplus.size, 0, 'nothing is left over once it is all cracked')
  assert.ok(
    (cracked.inputs.get('crude-oil') ?? 0) < (bare.inputs.get('crude-oil') ?? 0) / 2,
    'cracking should more than halve the oil field',
  )
  assert.equal(cracked.shortfalls.length, 0)
})

test('every item in a plan balances, and the flows say where it went', () => {
  const solution = plan({ targets: [{ item: 'processing-unit', rate: 5 }] })

  const net = new Map()
  const add = (item, rate) => net.set(item, (net.get(item) ?? 0) + rate)
  for (const node of solution.nodes) {
    const recipe = graph.usable.get(node.recipe)
    for (const [item, count] of Object.entries(recipe.in ?? {})) add(item, -count * node.crafts)
    for (const [item, count] of Object.entries(recipe.out ?? {})) {
      add(item, count * node.crafts * node.productivity)
    }
  }
  for (const [item, rate] of solution.inputs) add(item, rate)
  for (const [item, rate] of solution.surplus) add(item, -rate)
  add('processing-unit', -5)

  for (const [item, rate] of net) assert.ok(Math.abs(rate) < 1e-6, `${item} is off by ${rate}`)

  // Every flow leaves somewhere and arrives somewhere, and the two ends agree on the rate.
  const out = new Map()
  const into = new Map()
  for (const flow of solution.flows) {
    out.set(`${flow.from}|${flow.item}`, (out.get(`${flow.from}|${flow.item}`) ?? 0) + flow.rate)
    into.set(`${flow.to}|${flow.item}`, (into.get(`${flow.to}|${flow.item}`) ?? 0) + flow.rate)
  }
  assert.ok(solution.flows.length > 10)
  assert.ok([...out.values()].every((rate) => rate > 0))
  assert.ok([...into.values()].every((rate) => rate > 0))
})

test('machines you already have are worked around, and what they cannot cover is said', () => {
  const solution = plan({
    targets: [{ item: 'electronic-circuit', rate: 45 }],
    nodes: { 'copper-plate': { pin: 20 } },
  })
  const copper = solution.nodes.find((n) => n.recipe === 'copper-plate')
  assert.ok(near(copper.machines, 20), 'the pinned node runs exactly those machines')

  const short = solution.shortfalls.find((f) => f.item === 'copper-plate')
  assert.ok(short && short.rate > 0, 'and the plan says what it is short of')
  // Everything downstream still asks for the full amount rather than quietly shrinking.
  assert.ok(near(rateOf(solution, 'electronic-circuit'), 30))
})

test('modules and machines change how many it takes, not what it takes', () => {
  const bare = plan({ targets: [{ item: 'iron-gear-wheel', rate: 10 }] })
  const fast = plan({
    targets: [{ item: 'iron-gear-wheel', rate: 10 }],
    nodes: {
      'iron-gear-wheel': {
        machine: 'assembling-machine-3',
        modules: [{ name: 'speed-module-3' }, { name: 'speed-module-3' }],
      },
    },
  })
  const gears = (solution) => solution.nodes.find((n) => n.recipe === 'iron-gear-wheel')

  assert.ok(near(gears(bare).crafts, gears(fast).crafts), 'the rate is set by the target')
  // Two speed 3s are +100%, so the same assembler gets through twice as many crafts and
  // exactly half as many of them are needed.
  assert.ok(near(gears(fast).perMachine, gears(bare).perMachine * 2))
  assert.ok(near(gears(fast).machines, gears(bare).machines / 2))
  assert.ok(near(fast.inputs.get('iron-ore') ?? 0, bare.inputs.get('iron-ore') ?? 0), 'the ore does not care')
})

test('a whole science plan solves, and quickly', () => {
  const started = Date.now()
  const solution = plan({
    targets: ['automation', 'logistic', 'chemical', 'production', 'utility', 'military'].map((name) => ({
      item: `${name}-science-pack`,
      rate: 2,
    })),
    extra: { 'heavy-oil': 'heavy-oil-cracking', 'light-oil': 'light-oil-cracking' },
  })
  assert.equal(solution.status, 'optimal')
  assert.ok(solution.nodes.length > 25, 'a real chain, not a stub')
  assert.equal(solution.shortfalls.length, 0)
  assert.ok(Date.now() - started < 2000, 'fast enough to run on every keystroke')
})

// ── The diagram ───────────────────────────────────────────────────────────────

import { layoutSankey } from '../dist-node/sankey.mjs'

test('a diagram runs left to right, and nothing sits left of what feeds it', () => {
  const nodes = ['ore', 'plate', 'gear', 'belt'].map((key) => ({ key, weight: 1 }))
  const links = [
    { from: 'ore', to: 'plate', weight: 2 },
    { from: 'plate', to: 'gear', weight: 1 },
    { from: 'plate', to: 'belt', weight: 1 },
    { from: 'gear', to: 'belt', weight: 1 },
  ]
  const layout = layoutSankey(nodes, links)
  const column = new Map(layout.nodes.map((node) => [node.key, node.column]))

  for (const link of links) assert.ok(column.get(link.from) < column.get(link.to), `${link.from} → ${link.to}`)
  assert.equal(layout.links.length, links.length)
  // Thickness follows weight, and every ribbon starts and ends somewhere real.
  for (const ribbon of layout.links) assert.ok(ribbon.thickness > 0 && ribbon.x2 >= ribbon.x1 - 1e-9)
})

test('a link over a column is given a lane of its own rather than passing behind', () => {
  const nodes = ['a', 'b', 'c'].map((key) => ({ key, weight: 1 }))
  const layout = layoutSankey(nodes, [
    { from: 'a', to: 'b', weight: 1 },
    { from: 'b', to: 'c', weight: 1 },
    { from: 'a', to: 'c', weight: 1 },
  ])

  const skipping = layout.links.find((link) => link.from === 'a' && link.to === 'c')
  assert.equal(skipping.points.length, 1, 'one waypoint, for the one column it crosses')

  const middle = layout.nodes.find((node) => node.key === 'b')
  const lane = skipping.points[0].y
  assert.ok(lane < middle.y || lane > middle.y + middle.height, 'the lane clears the box it passes')
})

test('a factory that feeds itself is drawn, not refused', () => {
  const layout = layoutSankey(
    [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }],
    [{ from: 'a', to: 'b', weight: 1 }, { from: 'b', to: 'a', weight: 0.2 }],
  )
  assert.equal(layout.links.length, 2)
  assert.equal(layout.links.filter((link) => link.backward).length, 1)
  assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height))
})

test('a recipe nothing can be built to run is not a way of making anything', () => {
  // Space Age carries recipes for what happens on its own: food spoiling, and bacteria
  // multiplying into ore in a crate. They have no machine, so a plan cannot run them —
  // and left in, iron would be grown out of jellynut for free.
  assert.equal(graph.usable.has('iron-ore'), false, 'bacteria into ore is not a recipe you build')
  assert.equal(graph.usable.has('spoilage'), false)
  for (const id of ['locomotive', 'electronic-circuit', 'steel-plate', 'advanced-oil-processing']) {
    assert.equal(graph.usable.has(id), true, `${id} is still makeable`)
  }

  const solution = plan({ targets: [{ item: 'locomotive', rate: 1 }] })
  assert.ok(near(solution.inputs.get('iron-ore') ?? 0, 336.67, 0.1), 'the ore is dug, not grown')
  assert.ok(!solution.nodes.some((node) => node.machine === undefined), 'every node has a machine')
})

test('digging is a recipe too, and a drill is a machine like any other', () => {
  // Ore is bought by default — most plans start from a belt of it — but the drills are one
  // click away, and there are three of them to choose between.
  assert.equal(isFrontier(graph, 'iron-ore'), true)
  assert.equal((graph.producers.get('iron-ore') ?? [])[0], 'iron-ore-mining')

  const mining = graph.usable.get('iron-ore-mining')
  assert.deepEqual(mining.producers, ['burner-mining-drill', 'electric-mining-drill', 'big-mining-drill'])

  const solution = plan({ targets: [{ item: 'iron-plate', rate: 100 }], frontier: { 'iron-ore': 'expand' } })
  const drills = solution.nodes.find((node) => node.recipe === 'iron-ore-mining')
  assert.ok(drills, 'expanding the ore puts the drills in the plan')
  // A big mining drill is the fastest of the three, and 2.5 ore a second each.
  assert.equal(drills.machine, 'big-mining-drill')
  assert.ok(near(drills.machines, 40))
  assert.equal(solution.inputs.size, 0, 'nothing is bought once the ore is dug')
})

test('a well is not a refinery, however the recipe is named', () => {
  // Heavy oil comes out of the ground on Vulcanus, and the recipe is even called `heavy-oil`.
  // On the planet most plans are for, it comes out of a refinery, and that has to win.
  assert.equal((graph.producers.get('heavy-oil') ?? [])[0], 'advanced-oil-processing')
  assert.ok(!graph.extraction.has((graph.producers.get('heavy-oil') ?? [])[0]))
  assert.equal(isFrontier(graph, 'heavy-oil'), false)
  assert.equal(plan({ targets: [{ item: 'petroleum-gas', rate: 100 }] }).nodes[0].recipe, 'advanced-oil-processing')

  // Lava is only ever pumped, so a plan stops there rather than counting pumps unasked.
  assert.equal(isFrontier(graph, 'lava'), true)
})

test('links into a box are stacked in the order they arrive from, not against it', () => {
  // Two sources, one above the other, feeding one target. The one that comes from higher up
  // has to arrive higher, or the two ribbons cross for no reason at all.
  const layout = layoutSankey(
    [
      { key: 'top', weight: 1 },
      { key: 'bottom', weight: 1 },
      { key: 'sink', weight: 2 },
    ],
    [
      { from: 'top', to: 'sink', weight: 1 },
      { from: 'bottom', to: 'sink', weight: 1 },
    ],
  )

  const at = new Map(layout.nodes.map((node) => [node.key, node.y + node.height / 2]))
  const arrive = new Map(layout.links.map((link) => [link.from, link.y2]))
  const [first, second] = at.get('top') < at.get('bottom') ? ['top', 'bottom'] : ['bottom', 'top']
  assert.ok(arrive.get(first) < arrive.get(second), 'the higher source arrives higher')

  // And the same on the way out: one source feeding two targets.
  const fan = layoutSankey(
    [
      { key: 'source', weight: 2 },
      { key: 'a', weight: 1 },
      { key: 'b', weight: 1 },
    ],
    [
      { from: 'source', to: 'a', weight: 1 },
      { from: 'source', to: 'b', weight: 1 },
    ],
  )
  const boxes = new Map(fan.nodes.map((node) => [node.key, node.y + node.height / 2]))
  const leave = new Map(fan.links.map((link) => [link.to, link.y1]))
  const [upper, lower] = boxes.get('a') < boxes.get('b') ? ['a', 'b'] : ['b', 'a']
  assert.ok(leave.get(upper) < leave.get(lower), 'the ribbon to the higher target leaves higher')
})

test('taking a thing off the bus takes what fed it with it', () => {
  const extra = { 'heavy-oil': 'heavy-oil-cracking', 'light-oil': 'light-oil-cracking' }
  const full = plan({ targets: [{ item: 'plastic-bar', rate: 20 }], extra })
  assert.ok(full.nodes.some((node) => node.recipe === 'advanced-oil-processing'))

  // Cracking is what to do with a surplus, so it only runs while something makes one. Left on
  // unconditionally it goes looking for oil to crack, and puts back the refinery that was just
  // taken off the bus — or finds a coal mine to replace it, which is worse.
  const cut = plan({ targets: [{ item: 'plastic-bar', rate: 20 }], extra, frontier: { 'petroleum-gas': 'raw' } })
  assert.deepEqual(cut.nodes.map((node) => node.recipe), ['plastic-bar'])
  assert.ok(near(cut.inputs.get('petroleum-gas') ?? 0, 200))
  assert.equal(cut.inputs.has('crude-oil'), false, 'and the oil field goes with it')
})

test('a foundry melts rock, not ore, because a lake does not run out', () => {
  // The dataset prices what it costs to get a thing: a hundred a unit for anything a drill
  // brings up, one for crude oil, and nothing for what a pump lifts out of a lake.
  assert.equal(graph.price.get('iron-ore'), 100)
  assert.equal(graph.price.get('crude-oil'), 1)
  assert.ok((graph.price.get('lava') ?? 1) < 1)

  // So the Vulcanus way round is the default: molten iron comes from lava and calcite rather
  // than from ore that would have to be mined and shipped.
  assert.equal((graph.producers.get('molten-iron') ?? [])[0], 'molten-iron-from-lava')
  assert.equal((graph.producers.get('molten-copper') ?? [])[0], 'molten-copper-from-lava')

  const cast = plan({
    targets: [{ item: 'iron-gear-wheel', rate: 50 }],
    choice: { 'iron-gear-wheel': 'casting-iron-gear-wheel' },
  })
  assert.deepEqual(cast.nodes.map((node) => node.recipe).sort(), ['casting-iron-gear-wheel', 'molten-iron-from-lava'])
  assert.ok(cast.nodes.every((node) => node.machine === 'foundry'))
  assert.equal(cast.inputs.has('iron-ore'), false, 'nothing is mined for it')
  assert.ok((cast.inputs.get('lava') ?? 0) > 0 && (cast.inputs.get('calcite') ?? 0) > 0)
  // Melting rock leaves stone behind, and the plan says so rather than losing it.
  assert.ok((cast.surplus.get('stone') ?? 0) > 0)
})

test('everything castable is offered, and the plain way stays the default', () => {
  // Every one of these has a foundry recipe beside the ordinary one. The one named after the
  // item leads, because that is the way most plans are built; casting is one click away.
  for (const [item, casting] of [
    ['iron-plate', 'casting-iron'],
    ['copper-plate', 'casting-copper'],
    ['steel-plate', 'casting-steel'],
    ['iron-gear-wheel', 'casting-iron-gear-wheel'],
    ['pipe', 'casting-pipe'],
    ['low-density-structure', 'casting-low-density-structure'],
    ['concrete', 'concrete-from-molten-iron'],
  ]) {
    const ways = graph.producers.get(item) ?? []
    assert.equal(ways[0], item, `${item} is made the plain way by default`)
    assert.ok(ways.includes(casting), `${casting} is on the list`)
    assert.equal(graph.usable.get(casting)?.producers?.includes('foundry'), true)
  }
})

// ── Sharing ───────────────────────────────────────────────────────────────────

import { decodePlan, encodePlan } from '../dist-node/core.mjs'

test('a plan survives the round trip through a link', () => {
  const plan = {
    version: '2x1',
    belt: 'express-transport-belt',
    targets: [{ item: 'processing-unit', rate: 5 }, { item: 'iron-gear-wheel', rate: 12.5 }],
    choice: { 'iron-plate': 'casting-iron', 'molten-iron': 'molten-iron-from-lava' },
    extra: { 'heavy-oil': 'heavy-oil-cracking' },
    frontier: { 'iron-ore': 'expand', 'copper-plate': 'raw' },
    nodes: {
      'electronic-circuit': {
        machine: 'electromagnetic-plant',
        quality: 'legendary',
        modules: [{ name: 'productivity-module-3', quality: 'legendary' }, { name: 'speed-module-3' }],
        beacon: { name: 'beacon', count: 8, quality: 'rare', modules: [{ name: 'speed-module-3', quality: 'rare' }] },
      },
      'copper-plate': { pin: 20 },
    },
  }

  const link = encodePlan(plan)
  assert.match(link, /^[\w-]+$/, 'nothing in it needs escaping in a URL')
  assert.deepEqual(decodePlan(link), plan)
})

test('an empty plan and a big one both fit in a link', () => {
  const bare = { version: '2x1', belt: 'transport-belt', targets: [], choice: {}, extra: {}, frontier: {}, nodes: {} }
  assert.deepEqual(decodePlan(encodePlan(bare)), bare)

  // A whole science plan with modules on every node, which is the size that has to work.
  const solution = plan({
    targets: ['automation', 'logistic', 'chemical', 'production', 'utility'].map((name) => ({
      item: `${name}-science-pack`,
      rate: 2,
    })),
    extra: { 'heavy-oil': 'heavy-oil-cracking', 'light-oil': 'light-oil-cracking' },
  })
  const nodes = Object.fromEntries(
    solution.nodes.map((node) => [
      node.recipe,
      { machine: node.machine, modules: [1, 2, 3, 4].map(() => ({ name: 'productivity-module-3' })) },
    ]),
  )
  const heavy = { version: '2x1', belt: 'turbo-transport-belt', targets: [{ item: 'utility-science-pack', rate: 2 }], choice: {}, extra: {}, frontier: {}, nodes }

  const link = encodePlan(heavy)
  assert.deepEqual(decodePlan(link), heavy)
  assert.ok(link.length < 1200, `a link of ${link.length} characters is still a link`)
})

test('a link that has been mangled is refused rather than half-read', () => {
  assert.equal(decodePlan('not-a-plan'), undefined)
  assert.equal(decodePlan(''), undefined)
  const good = encodePlan({ version: '2x1', belt: 'transport-belt', targets: [{ item: 'coal', rate: 1 }], choice: {}, extra: {}, frontier: {}, nodes: {} })
  assert.equal(decodePlan(good.slice(0, good.length - 4)), undefined)
})

test('an empty barrel is an ordinary item, and things are packed into it', () => {
  // Barrelling is a *filled* barrel on one side: filling makes one, emptying takes one apart.
  // An empty barrel is made of steel and cliff explosives are packed into one, so a recipe
  // that merely uses one is not barrelling — throwing it out made cliff explosives unmakeable.
  assert.equal(graph.usable.has('cliff-explosives'), true)
  assert.deepEqual(graph.producers.get('barrel'), ['barrel'])
  assert.ok((graph.usable.get('cliff-explosives')?.in ?? {}).barrel > 0, 'it really does take one')

  const solution = plan({ targets: [{ item: 'cliff-explosives', rate: 1 }] })
  assert.equal(solution.status, 'optimal')
  assert.ok(solution.nodes.some((node) => node.recipe === 'cliff-explosives'))
  assert.ok(solution.nodes.some((node) => node.recipe === 'barrel'), 'and the barrels are counted')
  assert.equal(solution.shortfalls.length, 0)

  // Filling and emptying are still out: nothing gets its petroleum by unpacking a barrel.
  for (const item of ['petroleum-gas', 'light-oil', 'water']) {
    assert.ok(!(graph.producers.get(item) ?? []).some((id) => id.includes('barrel')), item)
  }
})

test('every craftable item in every version can actually be planned', async () => {
  // The check that would have caught cliff explosives, the seventeen items too expensive to
  // be worth making, and the eight caught in a coolant loop. It walks what the raw data says
  // a factory can build — every recipe that is not research, not recycling, not barrelling,
  // and has a machine to run it — and asks for one a second of each.
  const { audit, unexplained } = await import('../scripts/audit-recipes.mjs')

  for (const version of ['2x1', 'spa', '2.0', '1.1']) {
    const report = await audit(version)
    assert.ok(report.count > 150, `${version} should have plenty to check`)

    assert.deepEqual(report.dropped, [], `${version}: the data says these are makeable and the graph disagrees`)
    assert.deepEqual(report.failed, [], `${version}: these failed to solve at all`)
    assert.deepEqual(
      unexplained(report).map((entry) => `${entry.item} needs ${entry.missing.join(', ')}`),
      [],
      `${version}: short of something the ground should supply`,
    )
  }
})

// ── Farming quality ───────────────────────────────────────────────────────────

import { loopRecipeFor, planQuality, recyclingOf, spread } from '../dist-node/core.mjs'

const legendary = (name, count) => Array.from({ length: count }, () => ({ name, quality: 'legendary' }))
const plain = (name, count) => Array.from({ length: count }, () => ({ name }))
/** The same machine on every rung, which is the setup the ladder was first written against. */
const everyTier = (reg, side) => Object.fromEntries(reg.qualities.map((tier) => [tier, side]))

test('a quality roll goes up one tier nine times in ten, and again one time in ten of those', () => {
  const landing = spread(0.3125, 0, 5)
  assert.ok(near(landing.reduce((sum, value) => sum + value, 0), 1), 'it lands somewhere')

  assert.ok(near(landing[0], 0.6875))
  assert.ok(near(landing[1], 0.28125), 'nine tenths of the roll goes up exactly one')
  assert.ok(near(landing[2], 0.028125))
  assert.ok(near(landing[3], 0.0028125))
  // The top tier has nowhere further to send anything, so it takes the whole tail.
  assert.ok(near(landing[4], 0.0003125))

  // From the top there is nothing to roll for at all.
  assert.deepEqual(spread(0.9, 4, 5), [0, 0, 0, 0, 1])
})

test('what recycling gives back is read from the data, not assumed to be a quarter', () => {
  const circuit = recyclingOf(registry, graph.usable.get('electronic-circuit'), 'electronic-circuit')
  assert.ok(near(circuit.recovery, 0.25))

  // A recipe that makes two at a time gives back an eighth of a set per item, not a quarter:
  // the quarter is of the ingredients per *item*, and one craft made two of them.
  const stick = recyclingOf(registry, registry.recipes.get('iron-stick'), 'iron-stick')
  assert.ok(near(stick.recovery, 0.125), `iron sticks give back ${stick.recovery}`)
})

test('no recycler hands back a fluid, so every rung buys its own', () => {
  const unit = registry.recipes.get('processing-unit')
  const back = recyclingOf(registry, unit, 'processing-unit')

  // Twenty circuits come back as five and the acid is simply gone — which is what the game's
  // own recycling recipe says, and nothing like a quarter of the ingredients.
  assert.equal(back.loop, 'ingredients')
  assert.deepEqual(back.recovers, ['electronic-circuit', 'advanced-circuit'])
  assert.deepEqual(back.fresh, ['sulfuric-acid'], 'the acid never comes back')
  assert.ok(near(back.recovery, 0.25))
  assert.equal([...back.gives.keys()].some((item) => registry.fluids.has(item)), false)

  const plan = planQuality(
    registry,
    {
      recipe: 'processing-unit',
      base: 'normal',
      target: 'legendary',
      crafters: everyTier(registry, { machine: 'electromagnetic-plant', modules: legendary('quality-module-3', 5) }),
      recyclers: everyTier(registry, { modules: legendary('quality-module-3', 4) }),
    },
    { machines: 20 },
  )

  // What goes round is bought once at the bottom; what leaks out is bought again for every
  // craft on every rung. The upper rungs are a third of the crafts here, and every one of them
  // wants its five acid.
  const crafts = plan.tiers.reduce((sum, tier) => sum + tier.crafts, 0)
  assert.ok(near(plan.ingredients.get('electronic-circuit'), 20 * plan.input))
  assert.ok(near(plan.ingredients.get('sulfuric-acid'), 5 * crafts))
  assert.ok(crafts > plan.input * 1.1, 'the rungs above the bottom craft too')

  // And nothing a recycler hands back is acid: the returns are circuits, at the tier they came
  // out at, and the acid is not part of the loop at all.
  assert.equal(plan.recovers.includes('sulfuric-acid'), false)
})

test('what does not come apart comes back as itself, and climbs through the recyclers', () => {
  const back = recyclingOf(registry, registry.recipes.get('plastic-bar'), 'plastic-bar')
  assert.equal(back.loop, 'item', 'a plastic bar shreds into a quarter of a plastic bar')
  assert.ok(near(back.recovery, 0.25))
  assert.deepEqual(back.recovers, [])

  const plan = planQuality(
    registry,
    {
      recipe: 'plastic-bar',
      base: 'normal',
      target: 'epic',
      crafters: everyTier(registry, { modules: legendary('quality-module-3', 3) }),
      recyclers: everyTier(registry, { modules: legendary('quality-module-3', 4) }),
    },
    { machines: 10 },
  )

  assert.equal(plan.problem, undefined)
  assert.equal(plan.loop, 'item')
  // Only the bottom rung crafts — the ingredients arrive at one quality and stay there — and
  // everything above it is fed by the recyclers.
  assert.ok(plan.tiers[0].crafts > 0)
  assert.deepEqual(plan.tiers.slice(1).map((tier) => tier.crafts), [0, 0, 0, 0])
  assert.ok(plan.tiers[1].items > 0 && plan.tiers[2].items > 0)
  assert.ok(plan.returned[0][1] > 0, 'a normal bar shredded comes back uncommon')
  assert.ok(plan.output > 0)
  // Nothing goes round, so both ingredients are bought for every craft.
  assert.deepEqual(plan.fresh, ['petroleum-gas', 'coal'])
})

test('the ladder is built on the recipe a recycler reverses', () => {
  // Nutrients have five recipes and shredding them hands back spoilage: only the one made from
  // spoilage feeds itself.
  assert.equal(loopRecipeFor(registry, 'nutrients'), 'nutrients-from-spoilage')
  // A gear cast from molten iron comes back as plates, which no foundry will take.
  assert.equal(loopRecipeFor(registry, 'iron-gear-wheel'), 'iron-gear-wheel')
  // Where the item comes back as itself every recipe closes the loop, so this is not the
  // question that decides it: iron ore is dug, grown out of bacteria and crushed out of
  // asteroids, and picking between those is somebody else's business.
  assert.equal(loopRecipeFor(registry, 'iron-ore'), undefined)

  const casting = planQuality(
    registry,
    { recipe: 'casting-iron-gear-wheel', base: 'normal', target: 'epic', crafters: {}, recyclers: {} },
    { machines: 1 },
  )
  assert.equal(casting.problem, 'no-loop', 'shredding the gears gives back something the foundry cannot take')
  assert.deepEqual(casting.gives, ['iron-plate'])
})

test('a recipe with a byproduct farms the item that was asked for', () => {
  const bare = { recipe: 'yumako-processing', base: 'normal', target: 'rare', crafters: {}, recyclers: {} }
  const mash = planQuality(registry, { ...bare, item: 'yumako-mash' }, { machines: 1 })
  const seed = planQuality(registry, { ...bare, item: 'yumako-seed' }, { machines: 1 })

  // One craft gives two mash and a fiftieth of a seed, so which one is being farmed is the
  // whole answer rather than a detail.
  assert.ok(mash.tiers[0].items > seed.tiers[0].items * 50, `${mash.tiers[0].items} vs ${seed.tiers[0].items}`)
})

test('with nothing to farm for, the ladder is one rung and the loop never runs', () => {
  const plan = planQuality(
    registry,
    {
      recipe: 'electronic-circuit',
      base: 'normal',
      target: 'normal',
      crafters: { normal: { machine: 'assembling-machine-3' } },
      recyclers: {},
    },
    { machines: 1 },
  )

  // One set in, one item out, and nothing is recycled because everything is already wanted.
  assert.ok(near(plan.yield, 1))
  assert.equal(plan.tiers.every((tier) => tier.recycled === 0), true)
  assert.equal(plan.tiers.filter((tier) => tier.recyclers > 0).length, 0)
  // An assembling machine 3 at 1.25 speed on a half-second recipe is 2.5 crafts a second.
  assert.ok(near(plan.output, 2.5))
})

test('the ladder is what makes legendaries, not the roll', () => {
  const setup = {
    recipe: 'electronic-circuit',
    base: 'normal',
    target: 'legendary',
    crafters: everyTier(registry, { machine: 'electromagnetic-plant', modules: legendary('quality-module-3', 5) }),
    recyclers: everyTier(registry, { modules: legendary('quality-module-3', 4) }),
  }
  const plan = planQuality(registry, setup, { machines: 20 })

  assert.ok(near(plan.craftChance, 0.3125), 'five legendary quality 3s are a 31.25% chance')
  assert.ok(near(plan.recycleChance, 0.25))

  // Straight out of the machine a legendary is three in ten thousand. The ladder returns two
  // orders of magnitude more than that, which is the entire reason to build one.
  const direct = spread(plan.craftChance, 0, 5)[4] * 1.5
  assert.ok(plan.yield > direct * 50, `${plan.yield} should dwarf the ${direct} that falls out directly`)

  // The base tier runs exactly the machines it was told it had.
  assert.ok(near(plan.tiers[0].crafters, 20, 1e-6))
  assert.ok(plan.output > 0 && plan.tiers[4].kept > 0)
  assert.equal(plan.tiers[4].recycled, 0, 'nothing at the target is thrown back')
  assert.ok(plan.tiers[0].recyclers > 0, 'and everything below it is')
})

test('both directions are the same sum read from either end', () => {
  const setup = {
    recipe: 'iron-gear-wheel',
    base: 'normal',
    target: 'epic',
    crafters: everyTier(registry, { machine: 'assembling-machine-3', modules: legendary('quality-module-3', 4) }),
    recyclers: everyTier(registry, { modules: legendary('quality-module-3', 4) }),
  }

  const forward = planQuality(registry, setup, { machines: 12 })
  const backward = planQuality(registry, setup, { output: forward.output })

  assert.ok(near(backward.tiers[0].crafters, 12, 1e-6), 'asking for what 12 machines make wants 12 machines')
  assert.ok(near(backward.input, forward.input, 1e-6))
  for (const [at, tier] of forward.tiers.entries()) {
    assert.ok(near(backward.tiers[at].items, tier.items, 1e-6), tier.quality)
  }
})

test('a plan that cannot be worked out says which part is missing', () => {
  const bare = { base: 'normal', target: 'legendary', crafters: {}, recyclers: {} }

  assert.equal(planQuality(registry, { ...bare, recipe: 'nonsense' }, { machines: 1 }).problem, 'no-recipe')
  // Fluids are not shredded, so there is no loop to build.
  assert.equal(planQuality(registry, { ...bare, recipe: 'sulfuric-acid' }, { machines: 1 }).problem, 'no-recycling')

  // Nothing to climb with is not a failure to report. The machines are settled on the cards,
  // so refusing to draw the ladder would leave nowhere to put a module — it is worked out and
  // simply has nothing climbing it.
  const flat = planQuality(registry, { ...bare, recipe: 'electronic-circuit' }, { machines: 1 })
  assert.equal(flat.problem, undefined)
  assert.equal(flat.climbs, false)
  assert.equal(flat.output, 0)
  assert.ok(flat.tiers[0].crafters > 0, 'and the bottom rung is there to put modules in')
})

test('an output the ladder cannot reach still draws the ladder', () => {
  const bare = { recipe: 'electronic-circuit', base: 'normal', target: 'legendary', crafters: {}, recyclers: {} }

  // Nothing climbs, so no factory makes sixty a minute and the honest scale is zero — but a
  // ladder scaled to zero has no cards, and the cards are where the modules go. It falls back
  // to one machine at the bottom rung.
  for (const drive of [{ output: 1 }, { output: 0 }]) {
    const plan = planQuality(registry, bare, drive)
    assert.equal(plan.problem, undefined)
    assert.equal(plan.output, 0)
    assert.ok(plan.tiers[0].crafters > 0, `${JSON.stringify(drive)} should still stand one machine up`)
    assert.ok(plan.tiers[0].items > 0, 'and it should be making something to look at')
  }

  // Once something climbs, the asked-for end is the one that is held.
  const climbing = planQuality(
    registry,
    { ...bare, crafters: everyTier(registry, { modules: legendary('quality-module-3', 4) }) },
    { output: 1 },
  )
  assert.ok(near(climbing.output, 1))
})

test('a ladder travels in a link the same way a plan does', () => {
  const plan = {
    version: '2x1',
    belt: 'express-transport-belt',
    targets: [],
    choice: {},
    extra: {},
    frontier: {},
    nodes: {},
    mode: 'recycling',
    quality: {
      item: 'electronic-circuit',
      recipe: undefined,
      base: 'normal',
      target: 'legendary',
      by: 'machines',
      machines: 20,
      output: 60,
      crafters: {
        normal: { machine: 'electromagnetic-plant', modules: [{ name: 'quality-module-3', quality: 'legendary' }] },
        rare: { machine: 'assembling-machine-3', quality: 'epic' },
      },
      recyclers: { normal: { quality: 'rare', modules: [{ name: 'quality-module-3' }] } },
    },
  }

  assert.deepEqual(decodePlan(encodePlan(plan)), plan)
  // A production plan still decodes to exactly itself: what was not packed does not come back.
  const plain = { version: '2x1', belt: 'transport-belt', targets: [{ item: 'coal', rate: 1 }], choice: {}, extra: {}, frontier: {}, nodes: {} }
  assert.deepEqual(decodePlan(encodePlan(plain)), plain)
})

test('a rung nobody has touched runs the best machine with nothing in it', () => {
  const bare = planQuality(
    registry,
    { recipe: 'electronic-circuit', base: 'normal', target: 'legendary', crafters: {}, recyclers: {} },
    { machines: 10 },
  )
  // Nothing anywhere upgrades anything, so there is a ladder and nothing climbing it.
  assert.equal(bare.problem, undefined)
  assert.equal(bare.climbs, false)

  // One rung with modules is enough to have a plan, and the rest still run their defaults.
  const bottom = planQuality(
    registry,
    {
      recipe: 'electronic-circuit',
      base: 'normal',
      target: 'legendary',
      crafters: { normal: { modules: plain('quality-module-3', 5) } },
      recyclers: {},
    },
    { machines: 10 },
  )
  assert.equal(bottom.climbs, true)
  assert.equal(bottom.tiers[0].machine, 'electromagnetic-plant', 'the best machine, unasked')
  assert.ok(near(bottom.tiers[0].chance, 0.125), 'five plain quality 3s are 12.5%')
  assert.equal(bottom.tiers[1].chance, 0, 'and the rung above has nothing in it')
})

test('rungs can differ, and the ladder counts each one on its own terms', () => {
  const setup = {
    recipe: 'electronic-circuit',
    base: 'normal',
    target: 'legendary',
    crafters: everyTier(registry, { machine: 'electromagnetic-plant', modules: legendary('quality-module-3', 5) }),
    recyclers: everyTier(registry, { modules: legendary('quality-module-3', 4) }),
  }
  const same = planQuality(registry, setup, { machines: 20 })

  // A legendary machine on the bottom rung alone: faster there, unchanged everywhere else.
  const mixed = planQuality(
    registry,
    { ...setup, crafters: { ...setup.crafters, normal: { ...setup.crafters.normal, quality: 'legendary' } } },
    { machines: 20 },
  )

  assert.ok(mixed.output > same.output, 'a faster bottom rung feeds more up the ladder')
  assert.ok(near(mixed.yield, same.yield, 1e-9), 'but what a set is worth does not change')
  assert.equal(mixed.tiers[1].chance, same.tiers[1].chance, 'and the rung above is untouched')
})
