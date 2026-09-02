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
