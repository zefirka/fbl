import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ProtoRegistry, compile, decodeBlueprint, exportBlueprint, parse } from '../dist-node/core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SPA = { id: 'spa', label: 'Space Age 2.0', directionScale: 2, moduleFormat: 'items-array', supportsQuality: true }
const V11 = { id: '1.1', label: 'Factorio 1.1', directionScale: 1, moduleFormat: 'items-map', supportsQuality: false }

async function registryFor(id, profile) {
  const data = JSON.parse(await readFile(join(ROOT, 'public/data', id, 'data.json'), 'utf8'))
  return new ProtoRegistry(data, profile)
}

const registry = await registryFor('spa', SPA)

/** Compiles and asserts the checker was happy. */
function run(source, reg = registry) {
  const result = compile(source, reg)
  const errors = result.diagnostics.filter((d) => d.severity === 'error')
  assert.deepEqual(
    errors.map((e) => `${e.loc?.line}:${e.loc?.col} ${e.message}`),
    [],
    'expected no errors',
  )
  return result
}

/** Compiles and returns only the errors. */
function errorsIn(source, reg = registry) {
  return compile(source, reg).diagnostics.filter((d) => d.severity === 'error')
}

/** Compiles without asserting anything, for tests that inspect the failure. */
function compileFor(source, reg = registry) {
  return compile(source, reg)
}

const find = (scene, name) => scene.entities.filter((e) => e.proto.name === name)

// ── Syntax ────────────────────────────────────────────────────────────────────

test('commas are optional between arguments', () => {
  const withCommas = run('assembling-machine-3 (at (1, 0), recipe iron-gear-wheel)').scene
  const without = run('assembling-machine-3 (at (1 0) recipe iron-gear-wheel)').scene
  assert.deepEqual(
    [withCommas.entities[0].x, withCommas.entities[0].y],
    [without.entities[0].x, without.entities[0].y],
  )
})

test('a comma separates two bare values from a label and its value', () => {
  // `(north, blue)` is two values; `(tier blue)` is one labelled value.
  const { scene } = run('belt (from (0, 0), to (3, 0), east, blue)')
  assert.equal(scene.entities.length, 4)
  assert.equal(scene.entities[0].proto.name, 'express-transport-belt')
})

test('a line break ends a statement, but not inside parentheses', () => {
  const { scene } = run(`
    assembling-machine-3 (
      at (0, 0),
      recipe iron-gear-wheel
    )
    steel-chest (at (4, 0))
  `)
  assert.equal(scene.entities.length, 2)
})

test('parentheses group a single value and build a tuple otherwise', () => {
  const module = parse('def a = (1 + 2) * 3\ndef b = (1, 2)')
  assert.equal(module.statements[0].value.kind, 'binary')
  assert.equal(module.statements[1].value.kind, 'tuple')
})

// ── Types and the checker ─────────────────────────────────────────────────────

test('a wrong slot type is an error, and nothing is placed', () => {
  const result = compile('assembling-machine-3 (at (0, 0), recipe north)', registry)
  assert.equal(result.ran, false)
  assert.equal(result.scene.entities.length, 0)
  assert.match(result.diagnostics[0].message, /is not a recipe/)
})

test('a misspelled entity is caught with a suggestion', () => {
  const [error] = errorsIn('assembling-machine-4 (at (0, 0))')
  assert.match(error.message, /unknown name 'assembling-machine-4'/)
  assert.match(error.hint, /assembling-machine-\d/)
  assert.equal(error.loc.line, 1)
})

test('an unknown slot names the ones that exist', () => {
  const [error] = errorsIn('steel-chest (at (0, 0), recipe iron-gear-wheel)')
  assert.match(error.message, /has no slot 'recipe'/)
  assert.match(error.hint, /it takes at/)
})

test('a recipe the machine cannot craft fails to compile', () => {
  const [error] = errorsIn('assembling-machine-3 (at (0, 0), recipe iron-plate)')
  assert.match(error.message, /cannot craft iron-plate/)
  assert.match(error.hint, /made in/)
})

test('too many modules fails to compile', () => {
  const [error] = errorsIn(`
    assembling-machine-3 (at (0, 0), modules
      (speed-module-3, speed-module-3, speed-module-3, speed-module-3, speed-module-3))
  `)
  assert.match(error.message, /4 module slot\(s\), 5 given/)
})

test('a declared type is enforced', () => {
  const [error] = errorsIn('coord c = 5')
  assert.match(error.message, /declared coord but the value is int/)
})

test('arithmetic on a non-number is caught', () => {
  const [error] = errorsIn('def x = north * 2')
  assert.match(error.message, /needs numbers, got direction/)
})

test('a handle field typo is caught', () => {
  const [error] = errorsIn(`
    def a = steel-chest (at (0, 0))
    def w = a.widht
  `)
  assert.match(error.message, /no field '.widht'/)
  assert.match(error.hint, /\.width/)
})

// ── Bare values ───────────────────────────────────────────────────────────────

test('a bare value picks its slot from its type', () => {
  const { scene } = run('bulk-inserter (at (0, 0), north)\nbelt (from (2, 0), to (4, 0), green)')
  assert.equal(scene.entities[0].dir, 0, 'north filled dir')
  assert.equal(scene.entities[1].proto.name, 'turbo-transport-belt', 'green filled tier')
})

test('a bare coordinate fills at, which belt accepts as a name for its start', () => {
  const { scene } = run('belt ((0, 0), to (3, 0), red)')
  assert.equal(scene.entities.length, 4)
  assert.deepEqual([scene.entities[0].x, scene.entities[0].y], [0, 0])
})

// ── Defaults ──────────────────────────────────────────────────────────────────

test('module defaults fill slots that were left blank', () => {
  const { scene } = run(`
    defaults (tier blue)
    belt (from (0, 0) to (2, 0))
  `)
  assert.equal(scene.entities[0].proto.name, 'express-transport-belt')
})

test('an explicit value beats the default', () => {
  const { scene } = run(`
    defaults (tier blue)
    belt (from (0, 0) to (2, 0), tier yellow)
  `)
  assert.equal(scene.entities[0].proto.name, 'transport-belt')
})

test('defaults can be narrowed to one entity or family', () => {
  const { scene } = run(`
    defaults (tier blue)
    defaults underground (tier green)
    belt        (from (0, 0) to (2, 0))
    underground (from (3, 0) to (7, 0))
  `)
  assert.equal(find(scene, 'express-transport-belt').length, 3)
  assert.equal(find(scene, 'turbo-underground-belt').length, 2)
})

test('a scoped defaults block only applies inside it', () => {
  const { scene } = run(`
    defaults (tier yellow)
    defaults (tier green) => {
      belt (from (0, 0) to (1, 0))
    }
    belt (from (0, 2) to (1, 2))
  `)
  assert.equal(find(scene, 'turbo-transport-belt').length, 2)
  assert.equal(find(scene, 'transport-belt').length, 2)
})

test('a default that the entity cannot use is flagged', () => {
  const { diagnostics } = compile('defaults steel-chest (tier blue)', registry)
  assert.match(diagnostics[0].message, /has no 'tier' slot/)
})

// ── Blocks ────────────────────────────────────────────────────────────────────

test('a block gets its own coordinate frame', () => {
  const { scene } = run(`
    defblock cell (recipe r) => {
      assembling-machine-3 (at (0, 0), recipe r)
      bulk-inserter (at (0, 3), south)
    }
    cell (at (10, 20), recipe iron-gear-wheel)
  `)
  assert.deepEqual([scene.entities[0].x, scene.entities[0].y], [10, 20])
  assert.deepEqual([scene.entities[1].x, scene.entities[1].y], [10, 23])
})

test('a parameter answers to its name and to its type', () => {
  const byType = run(`
    defblock cell (recipe r) => { assembling-machine-3 (at (0, 0), recipe r) }
    cell (recipe iron-gear-wheel)
  `).scene
  const byName = run(`
    defblock cell (recipe r) => { assembling-machine-3 (at (0, 0), recipe r) }
    cell (r iron-gear-wheel)
  `).scene
  assert.equal(byType.entities[0].recipe, 'iron-gear-wheel')
  assert.equal(byName.entities[0].recipe, 'iron-gear-wheel')
})

test('an array parameter answers to the plural of its type', () => {
  const { scene } = run(`
    defblock cell (module[] m = ()) => { assembling-machine-3 (at (0, 0), modules m) }
    cell (modules (speed-module-3, speed-module-3))
  `)
  assert.equal(scene.entities[0].modules.length, 2)
})

test('a missing required argument is an error', () => {
  const [error] = errorsIn(`
    defblock cell (recipe r) => { assembling-machine-3 (at (0, 0), recipe r) }
    cell (at (0, 0))
  `)
  assert.match(error.message, /needs r/)
})

test('a default parameter value is used when the slot is blank', () => {
  const { scene } = run(`
    defblock cell (tier t = green) => { belt (from (0, 0) to (1, 0), tier t) }
    cell ()
  `)
  assert.equal(scene.entities[0].proto.name, 'turbo-transport-belt')
})

// ── Layout ────────────────────────────────────────────────────────────────────

test('row packs children and expands a nested for', () => {
  const { scene } = run(`
    defblock cell () => { assembling-machine-3 (at (0, 0)) }
    row (gap 1) => {
      for i in 0..3 => { cell () }
    }
  `)
  assert.deepEqual(find(scene, 'assembling-machine-3').map((e) => e.x), [0, 4, 8])
})

test('at shifts the frame, and nests', () => {
  const { scene } = run('at (5, 5) => {\n steel-chest (at (1, 1))\n at (10, 0) => { steel-chest (at (0, 0)) }\n}')
  assert.deepEqual(scene.entities.map((e) => [e.x, e.y]), [[6, 6], [15, 5]])
})

test('measure reports a size without leaving anything behind', () => {
  const { scene, output } = run(`
    defblock cell () => {
      assembling-machine-3 (at (0, 0))
      belt (from (0, 3) to (2, 3), tier red)
    }
    def m = measure (cell ())
    print ("size ", m.width, "x", m.height)
  `)
  assert.equal(scene.entities.length, 0)
  assert.equal(output[0], 'size  3 x 4')
})

// ── Placement semantics ───────────────────────────────────────────────────────

test('an inserter drops toward dir and picks up from `from`', () => {
  // The vanilla prototype has pickup_position {0, 1} (south) and insert_position
  // {0, -1.2} (north) while facing north, so direction names the DROP tile.
  const { scene } = run('bulk-inserter (at (0, 0), north)\nbulk-inserter (at (2, 0), from south)')
  assert.equal(scene.entities[0].dir, 0)
  assert.equal(scene.entities[1].dir, 0)
})

test('a 3x3 machine exports at the centre of its footprint', () => {
  const { scene } = run('assembling-machine-3 (at (1, 0), recipe iron-gear-wheel)')
  const { json } = exportBlueprint(scene, registry)
  assert.deepEqual(json.blueprint.entities[0].position, { x: 2.5, y: 1.5 })
})

test('a splitter facing east swaps its footprint and uses the 16-point scale', () => {
  const { scene } = run('splitter (at (0, 0), east)')
  assert.deepEqual([scene.entities[0].w, scene.entities[0].h], [1, 2])
  const { json } = exportBlueprint(scene, registry)
  assert.equal(json.blueprint.entities[0].direction, 4)
})

test('1.1 halves directions and writes modules as a count map', async () => {
  const legacy = await registryFor('1.1', V11)
  const { scene } = run(
    'assembling-machine-3 (at (0, 0), east, modules (speed-module-3, speed-module-3))',
    legacy,
  )
  const [entity] = exportBlueprint(scene, legacy).json.blueprint.entities
  assert.equal(entity.direction, 2)
  assert.deepEqual(entity.items, { 'speed-module-3': 2 })
})

test('2.0 modules become insert plans with inventory and slot', () => {
  const { scene } = run(`
    assembling-machine-3 (at (0, 0), recipe iron-gear-wheel,
      modules ((quality-module-3, legendary), (quality-module-3, legendary), speed-module-3))
  `)
  const items = exportBlueprint(scene, registry).json.blueprint.entities[0].items
  assert.deepEqual(items[0].id, { name: 'quality-module-3', quality: 'legendary' })
  assert.deepEqual(items[0].items.in_inventory, [
    { inventory: 4, stack: 0, count: 1 },
    { inventory: 4, stack: 1, count: 1 },
  ])
  assert.deepEqual(items[1].id, { name: 'speed-module-3' })
})

test('belts follow a path and each tile faces the next', () => {
  const { scene } = run('belt (from (0, 0), via (4, 0), to (4, 3), tier red)')
  const belts = find(scene, 'fast-transport-belt')
  assert.equal(belts.length, 8)
  assert.equal(belts[0].dir, 4)
  assert.equal(belts.at(-1).dir, 8)
})

test('a diagonal belt leg is rejected with a hint', () => {
  const [error] = errorsIn('belt (from (0, 0) to (3, 3))')
  assert.match(error.message, /diagonal/)
  assert.match(error.hint, /via corner/)
})

test('both ends of an underground pair face the way items flow', () => {
  // Factorio does not turn the exit around: `direction` is the flow, and `type` is what
  // tells the two ends apart. Draftsman models them as independent fields, and the hood
  // sprite is indexed by direction — an exit facing west would show westward chevrons on
  // an eastward belt.
  const { scene } = run('underground (from (0, 0) to (5, 0), red)')
  const [entry, exit] = exportBlueprint(scene, registry).json.blueprint.entities
  assert.equal(entry.direction, 4, 'east')
  assert.equal(exit.direction, 4, 'east, not west')
  assert.equal(entry.type, 'input')
  assert.equal(exit.type, 'output')
})

test('an underground pair is typed and range-checked', () => {
  const { scene, diagnostics } = run('underground (from (0, 0) to (9, 0), tier yellow)')
  assert.deepEqual(scene.entities.map((e) => e.undergroundType), ['input', 'output'])
  assert.match(diagnostics[0].message, /spans 8 tiles but reaches 4/)
})

test('overlapping entities are reported', () => {
  const { scene } = run('assembling-machine-3 (at (0, 0))\nassembling-machine-3 (at (2, 2))')
  const clashes = scene.findCollisions()
  assert.equal(clashes.length, 1)
  assert.deepEqual([clashes[0].x, clashes[0].y], [2, 2])
})

test('blueprint strings round-trip', () => {
  const { scene } = run(`
    defaults (tier green)
    defblock cell (recipe r) => {
      assembling-machine-3 (at (1, 0), recipe r, modules repeat (4, productivity-module-3))
      belt (from (0, 0) to (0, 2))
    }
    row (gap 1) => {
      cell (recipe iron-gear-wheel)
      cell (recipe copper-cable)
    }
  `)
  const { json, text } = exportBlueprint(scene, registry, { label: 'round trip' })
  assert.equal(text[0], '0')
  assert.deepEqual(decodeBlueprint(text), json)
  assert.equal(json.blueprint.entities.length, scene.entities.length)
})

// ── row for ───────────────────────────────────────────────────────────────────

test('row for folds the loop into the layout', () => {
  const nested = run(`
    defblock cell () => { assembling-machine-3 (at (0, 0)) }
    row (gap 1) => { for i in 0..3 => { cell () } }
  `).scene
  const folded = run(`
    defblock cell () => { assembling-machine-3 (at (0, 0)) }
    row (gap 1) for i in 0..3 => { cell () }
  `).scene
  assert.deepEqual(folded.entities.map((e) => e.x), [0, 4, 8])
  assert.deepEqual(folded.entities.map((e) => e.x), nested.entities.map((e) => e.x))
})

test('the loop variable is visible inside row for', () => {
  const { scene } = run(`
    column for i in 0..3 => { belt (at (0, 0), east, length 1 + i) }
  `)
  assert.deepEqual(scene.entities.map((e) => e.y), [0, 1, 1, 2, 2, 2])
})

test('a bare for places everything at the same spot, and the overlap is reported', () => {
  const { scene } = run(`
    defblock cell () => { steel-chest (at (0, 0)) }
    for i in 0..3 => { cell () }
  `)
  assert.deepEqual(scene.entities.map((e) => [e.x, e.y]), [[0, 0], [0, 0], [0, 0]])
  assert.equal(scene.findCollisions().length, 2, 'this is what row is for')
})

// ── entity parameters ─────────────────────────────────────────────────────────

test('a building can be passed in as a parameter', () => {
  const { scene } = run(`
    defblock pad (entity machine, recipe r) => {
      machine (at (0, 0), recipe r)
      bulk-inserter (at (0, 3), north)
    }
    pad (at (0, 0), entity assembling-machine-3, recipe iron-gear-wheel)
    pad (at (5, 0), entity assembling-machine-2, recipe copper-cable)
  `)
  assert.deepEqual(
    scene.entities.filter((e) => e.recipe).map((e) => [e.proto.name, e.recipe]),
    [
      ['assembling-machine-3', 'iron-gear-wheel'],
      ['assembling-machine-2', 'copper-cable'],
    ],
  )
})

test('an entity parameter accepts a block too', () => {
  const { scene } = run(`
    defblock inner () => { steel-chest (at (0, 0)) }
    defblock outer (entity e) => { e (at (2, 2)) }
    outer (entity inner)
  `)
  assert.deepEqual([scene.entities[0].x, scene.entities[0].y], [2, 2])
})

test('a name that is not placeable is rejected where an entity is expected', () => {
  const [error] = errorsIn(`
    defblock pad (entity machine) => { machine (at (0, 0)) }
    pad (entity iron-plate)
  `)
  assert.match(error.message, /'iron-plate' is not a entity/)
})

test('an indirect placement still catches a slot typo', () => {
  const [error] = errorsIn(`
    defblock pad (entity machine) => { machine (at (0, 0), recipy iron-gear-wheel) }
    pad (entity assembling-machine-3)
  `)
  assert.match(error.message, /has no slot 'recipy'/)
})

test('an indirect placement that the real entity cannot support warns at run time', () => {
  const { diagnostics } = run(`
    defblock pad (entity machine) => { machine (at (0, 0), recipe iron-plate) }
    pad (entity assembling-machine-3)
  `)
  assert.match(diagnostics[0].message, /cannot craft iron-plate/)
})

test('a slot the real building lacks is dropped with a warning, not a failure', () => {
  const { scene, diagnostics } = run(`
    defblock pad (entity machine) => { machine (at (0, 0), modules (speed-module-3)) }
    pad (entity steel-furnace)
  `)
  assert.equal(scene.entities.length, 1, 'the blueprint still builds')
  assert.match(diagnostics[0].message, /has no 'modules' slot/)
})

test('an empty list for a missing slot is silent', () => {
  const { scene, diagnostics } = run(`
    defblock pad (entity machine, module[] mods = ()) => { machine (at (0, 0), modules mods) }
    pad (entity steel-furnace)
  `)
  assert.equal(scene.entities.length, 1)
  assert.deepEqual(diagnostics, [], 'nothing was actually requested')
})

test('a beacon takes modules even though the dataset has no machine record for it', () => {
  // FactorioLab is a ratio calculator and a beacon crafts nothing, so its slot count comes
  // from src/data/entity-geometry.ts instead.
  const { scene } = run('beacon (at (0, 0), modules ((speed-module-3, legendary), speed-module-3))')
  assert.equal(scene.entities[0].modules.length, 2)
  const items = exportBlueprint(scene, registry).json.blueprint.entities[0].items
  assert.deepEqual(items[0].items.in_inventory, [{ inventory: 1, stack: 0, count: 1 }], 'beacon inventory index')
})

test('a machine size from the dataset wins over the hand-written fallback', () => {
  // biolab is 5×5 in game; the fallback table used to claim 4×4.
  const { scene } = run('biolab (at (0, 0))')
  assert.deepEqual([scene.entities[0].w, scene.entities[0].h], [5, 5])
})

// ── Belt topology ─────────────────────────────────────────────────────────────

import { beltOrientation, isBeltish, tileIndex } from '../dist-node/core.mjs'

/** The orientation name each belt tile resolves to, in placement order. */
function orientations(scene) {
  const belts = tileIndex(scene.entities, isBeltish)
  return scene.entities.filter(isBeltish).map((e) => beltOrientation(e, belts))
}

test('a straight run is straight all the way', () => {
  const { scene } = run('belt (from (0, 0) to (3, 0), red)')
  assert.deepEqual(orientations(scene), ['east', 'east', 'east', 'east'])
})

test('a corner is named by the side items arrive through, not by where they came from', () => {
  // Running east into the corner means arriving through its WEST edge, and it turns south.
  // Naming it `east-to-south` picks the mirrored sprite and bends the belt the wrong way.
  const { scene } = run('belt (from (0, 0), via (3, 0), to (3, 3), red)')
  assert.deepEqual(orientations(scene), [
    'east',
    'east',
    'east',
    'west-to-south',
    'south',
    'south',
    'south',
  ])
})

test('every quarter turn resolves to its own sprite', () => {
  const cases = [
    ['belt (from (0, 0), via (2, 0), to (2, 2), red)', 'west-to-south'],
    ['belt (from (0, 2), via (2, 2), to (2, 0), red)', 'west-to-north'],
    ['belt (from (2, 0), via (0, 0), to (0, 2), red)', 'east-to-south'],
    ['belt (from (2, 2), via (0, 2), to (0, 0), red)', 'east-to-north'],
    ['belt (from (0, 0), via (0, 2), to (2, 2), red)', 'north-to-east'],
    ['belt (from (2, 0), via (2, 2), to (0, 2), red)', 'north-to-west'],
    ['belt (from (0, 2), via (0, 0), to (2, 0), red)', 'south-to-east'],
    ['belt (from (2, 2), via (2, 0), to (0, 0), red)', 'south-to-west'],
  ]
  for (const [source, expected] of cases) {
    const found = orientations(run(source).scene).filter((o) => o.includes('-to-'))
    assert.deepEqual(found, [expected], source)
  }
})

test('an underground exit feeds the tile in front of it, its entry does not', () => {
  const { scene } = run(`
    belt        (from (0, 0) to (1, 0), red)
    underground (from (2, 0) to (5, 0), red)
    belt        (from (6, 0), via (7, 0), to (7, 2), red)
  `)
  const belts = tileIndex(scene.entities, isBeltish)
  const corner = scene.entities.find((e) => e.x === 7 && e.y === 0)
  assert.equal(beltOrientation(corner, belts), 'west-to-south')
})

// ── Sprite variant names ──────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs'
import { spriteVariants, isPipeish } from '../dist-node/core.mjs'

test('an underground asks for in-/out-, not its blueprint input/output', () => {
  const { scene } = run('underground (from (0, 0) to (4, 0), red)')
  const belts = tileIndex(scene.entities, isBeltish)
  const pipes = tileIndex(scene.entities, isPipeish)
  const [entry, exit] = scene.entities
  assert.equal(spriteVariants(entry, belts, pipes)[0], 'in-east')
  assert.equal(spriteVariants(exit, belts, pipes)[0], 'out-east')
})

test('every entity in every example resolves to a sprite that exists', async (t) => {
  // The atlas is built from a local Factorio install, so it may not be there at all.
  const atlasPath = join(ROOT, 'public/sprites/atlas.json')
  if (!existsSync(atlasPath)) return t.skip('no sprite atlas — run `npm run extract-sprites`')

  const atlas = JSON.parse(await readFile(atlasPath, 'utf8'))
  const missing = []

  for (const file of ['assembler-line.fbl', 'belts.fbl', 'blocks.fbl']) {
    const { scene } = run(await readFile(join(ROOT, 'examples', file), 'utf8'))
    const belts = tileIndex(scene.entities, isBeltish)
    const pipes = tileIndex(scene.entities, isPipeish)

    for (const entity of scene.entities) {
      const variants = atlas.entities[entity.proto.name]
      if (!variants) continue

      const wanted = spriteVariants(entity, belts, pipes)
      // Belts, undergrounds and pipes name an exact orientation; anything else is allowed to
      // fall through from its facing to the single `default` sprite.
      const exact = ['belt', 'underground-belt', 'pipe'].includes(entity.proto.kind)
      const ok = exact ? Boolean(variants[wanted[0]]) : wanted.some((name) => variants[name])
      if (!ok) missing.push(`${file}: ${entity.proto.name} wanted '${wanted[0]}'`)
    }
  }

  assert.deepEqual([...new Set(missing)], [])
})

test('an underground exit is drawn as the mirror of its entry', async (t) => {
  // Factorio draws an output end rotated 180° — its hood faces back down the belt, so a pair
  // reads as two ramps facing each other. The two sprites otherwise differ only in the
  // chevrons painted on them, about 3% of their pixels, which is what this guards against.
  const atlasPath = join(ROOT, 'public/sprites/atlas.json')
  if (!existsSync(atlasPath)) return t.skip('no sprite atlas — run `npm run extract-sprites`')

  const { default: sharp } = await import('sharp')
  const atlas = JSON.parse(await readFile(atlasPath, 'utf8'))
  const png = join(ROOT, 'public/sprites/atlas.png')

  const pixels = async (rect) =>
    sharp(png).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).raw().toBuffer()

  for (const name of ['underground-belt', 'express-underground-belt']) {
    for (const direction of ['north', 'east', 'south', 'west']) {
      const entry = await pixels(atlas.entities[name][`in-${direction}`])
      const exit = await pixels(atlas.entities[name][`out-${direction}`])

      let differing = 0
      for (let i = 0; i < entry.length; i += 4) {
        if (Math.abs(entry[i] - exit[i]) > 12 || Math.abs(entry[i + 3] - exit[i + 3]) > 12) differing++
      }
      // Mirrored, these differ by 13–16%. Sharing one orientation, only 2–5% — the chevrons.
      const share = (100 * differing) / (entry.length / 4)
      assert.ok(share > 10, `${name} ${direction}: entry and exit differ by only ${share.toFixed(1)}%`)
    }
  }
})

test('belt-family art covers the whole entity, never half of it', async (t) => {
  // A splitter's main structure only reaches over one of its two lanes; the other is covered
  // by `structure_patch`. Miss it and half the splitter renders as bare belt.
  const atlasPath = join(ROOT, 'public/sprites/atlas.json')
  if (!existsSync(atlasPath)) return t.skip('no sprite atlas — run `npm run extract-sprites`')

  const atlas = JSON.parse(await readFile(atlasPath, 'utf8'))
  const ppt = atlas.pixelsPerTile
  const short = []

  for (const [name, proto] of registry.entities) {
    if (!['belt', 'underground-belt', 'splitter'].includes(proto.kind)) continue
    const variants = atlas.entities[name]
    if (!variants) continue

    for (const [key, rect] of Object.entries(variants)) {
      // East and west swap the footprint's axes.
      const rotated = key.includes('east') || key.includes('west')
      const needed = rotated ? [proto.size.y, proto.size.x] : [proto.size.x, proto.size.y]
      if (rect.w / ppt < needed[0] || rect.h / ppt < needed[1]) {
        short.push(`${name} ${key}: ${(rect.w / ppt).toFixed(2)}×${(rect.h / ppt).toFixed(2)} covers ${needed[0]}×${needed[1]}`)
      }
    }
  }

  assert.deepEqual(short, [])
})

// ── Balancers ─────────────────────────────────────────────────────────────────

import { BALANCER_LIMIT, balancerSizes, hasBalancer } from '../dist-node/core.mjs'

test('a balancer expands into belts of the chosen tier', () => {
  const { scene } = run('balancer (4 to 8, left, red)')
  const names = new Set(scene.entities.map((e) => e.proto.name))
  assert.deepEqual([...names].sort(), ['fast-splitter', 'fast-transport-belt', 'fast-underground-belt'])
})

test('the flow direction rotates the whole layout', () => {
  const north = run('balancer (4 to 4, north)').scene.bbox()
  const east = run('balancer (4 to 4, east)').scene.bbox()
  assert.deepEqual([east.w, east.h], [north.h, north.w])
})

test('`left` and `west` mean the same thing', () => {
  const left = run('balancer (2 to 4, left)').scene
  const west = run('balancer (2 to 4, west)').scene
  assert.deepEqual(
    left.entities.map((e) => [e.proto.name, e.x, e.y, e.dir]),
    west.entities.map((e) => [e.proto.name, e.x, e.y, e.dir]),
  )
})

test('a pair the library does not have is refused before anything is placed', () => {
  const result = compileFor('balancer (9 to 3)')
  assert.equal(result.ran, false)
  assert.match(result.diagnostics[0].message, /no 9 to 3 balancer/)
  assert.match(result.diagnostics[0].hint, new RegExp(`1 to ${BALANCER_LIMIT}`))
})

test('a diagonal balancer is refused', () => {
  const [error] = errorsIn('balancer (4 to 4, northeast)')
  assert.match(error.message, /runs along an axis/)
})

test('every balancer in the library places cleanly, in every direction', () => {
  const failures = []

  for (const key of balancerSizes()) {
    const [from, to] = key.split('-')
    if (!hasBalancer(Number(from), Number(to))) continue

    for (const direction of ['north', 'east', 'south', 'west']) {
      const result = compileFor(`balancer (${from} to ${to}, ${direction})`)
      if (!result.ran) {
        failures.push(`${key} ${direction}: ${result.diagnostics[0]?.message}`)
        continue
      }
      const clashes = result.scene.findCollisions()
      if (clashes.length) {
        failures.push(`${key} ${direction}: ${clashes.length} overlap(s) at (${clashes[0].x}, ${clashes[0].y})`)
      }
      // Rotation must not move anything off the balancer's own corner.
      const box = result.scene.bbox()
      if (box.x !== 0 || box.y !== 0) failures.push(`${key} ${direction}: corner at (${box.x}, ${box.y})`)
    }
  }

  assert.deepEqual(failures, [])
})

// ── auto routing ──────────────────────────────────────────────────────────────

test('auto leaves a clear path alone', () => {
  const { scene } = run('belt (from (0, 0) to (5, 0), red, auto)')
  assert.equal(scene.entities.length, 6)
  assert.ok(scene.entities.every((e) => e.proto.kind === 'belt'))
})

test('auto tunnels under what is in the way', () => {
  const { scene } = run(`
    steel-chest (at (3, 0))
    belt (from (0, 0) to (6, 0), red, auto)
  `)
  const pair = scene.entities.filter((e) => e.proto.kind === 'underground-belt')
  assert.deepEqual(pair.map((e) => [e.x, e.undergroundType]), [[2, 'input'], [4, 'output']])
  assert.equal(scene.findCollisions().length, 0, 'nothing is laid on top of the chest')
})

test('auto spans a whole machine, not just a tile', () => {
  const { scene } = run(`
    assembling-machine-3 (at (2, -1))
    belt (from (0, 0) to (8, 0), red, auto)
  `)
  const pair = scene.entities.filter((e) => e.proto.kind === 'underground-belt')
  assert.deepEqual(pair.map((e) => e.x), [1, 5], 'entry before the machine, exit after it')
  assert.equal(scene.findCollisions().length, 0)
})

test('a gap the tier cannot reach names a tier that can', () => {
  const source = `
    assembling-machine-3 (at (2, -1))
    electric-furnace (at (5, -1))
    belt (from (0, 0) to (10, 0), TIER, auto)
  `
  const [error] = errorsIn(source.replace('TIER', 'yellow'))
  assert.match(error.message, /but Underground belt reaches 4/)
  assert.match(error.hint, /red reaches 6/)

  const { scene } = run(source.replace('TIER', 'blue'))
  assert.equal(scene.findCollisions().length, 0)
})

test('auto refuses what no underground could do', () => {
  const cases = [
    ['steel-chest (at (0, 0))\nbelt (from (0, 0) to (4, 0), red, auto)', /starts on something/],
    ['steel-chest (at (2, 0))\nsteel-chest (at (4, 0))\nbelt (from (0, 0) to (6, 0), red, auto)', /too close together/],
    ['steel-chest (at (3, 0))\nbelt (from (0, 0), via (3, 0), to (3, 3), red, auto)', /turns at \(3, 0\)/],
  ]
  for (const [source, expected] of cases) {
    const [error] = errorsIn(source)
    assert.match(error.message, expected, source)
  }
})

test('auto only sees what was already placed', () => {
  // The chest comes after the belt, so the belt has nothing to avoid and they overlap.
  const { scene } = run(`
    belt (from (0, 0) to (6, 0), red, auto)
    steel-chest (at (3, 0))
  `)
  assert.equal(scene.entities.filter((e) => e.proto.kind === 'underground-belt').length, 0)
  assert.equal(scene.findCollisions().length, 1)
})

// ── Cost ──────────────────────────────────────────────────────────────────────

import { computeCost } from '../dist-node/core.mjs'

const rawOf = (source) => {
  const { scene } = run(source)
  const cost = computeCost(scene, registry)
  return Object.fromEntries(cost.raw.map((e) => [e.item, e.amount]))
}

test('a belt costs one and a half ore, because the recipe makes two', () => {
  const raw = rawOf('transport-belt (at (0, 0))')
  // 1 belt = ½ iron plate + ½ gear (1 plate) = 1.5 plate = 1.5 ore.
  assert.equal(raw['iron-ore'], 1.5)
})

test('the trail stops at what the game extracts, not at what has no recipe', () => {
  // In Space Age `iron-ore` has a recipe of its own that grows it from bacteria. Following
  // that would price a transport belt in biochambers.
  const raw = rawOf('transport-belt (at (0, 0))')
  assert.deepEqual(Object.keys(raw), ['iron-ore'])
})

test('modules are counted, and they dominate', () => {
  const bare = rawOf('assembling-machine-3 (at (0, 0))')
  const loaded = rawOf('assembling-machine-3 (at (0, 0), modules (productivity-module-3))')
  assert.ok(loaded['copper-ore'] > bare['copper-ore'] * 5, 'a productivity 3 is not cheap')
})

test('everything an example places has a known cost', () => {
  for (const file of ['assembler-line.fbl', 'belts.fbl', 'blocks.fbl']) {
    const source = readFileSync(join(ROOT, 'examples', file), 'utf8')
    const { scene } = run(source)
    const cost = computeCost(scene, registry)
    assert.deepEqual(cost.unresolved, [], file)
    assert.ok(cost.raw.length > 0, file)
    assert.ok(
      cost.items.reduce((n, e) => n + e.amount, 0) >= scene.entities.length,
      `${file}: every entity is billed`,
    )
  }
})

// ── Power coverage ────────────────────────────────────────────────────────────

import { powerCoverage } from '../dist-node/core.mjs'

const coverageOf = (source) => powerCoverage(run(source).scene.entities)

test('a pole powers the square the game says it does', () => {
  // These are supply areas, not wire reach — a big pole throws a wire 32 tiles and powers 4×4.
  const cases = [
    ['small-electric-pole', 5],
    ['medium-electric-pole', 7],
    ['big-electric-pole', 4],
    ['substation', 18],
  ]
  for (const [pole, side] of cases) {
    const report = coverageOf(`${pole} (at (0, 0))`)
    assert.equal(report.covered.size, side * side, pole)
  }
})

test('the supply square is centred on the pole', () => {
  const report = coverageOf('medium-electric-pole (at (0, 0))')
  for (const [x, y, lit] of [
    [0, 0, true],
    [3, 3, true],
    [-3, -3, true],
    [4, 0, false],
    [0, -4, false],
  ]) {
    assert.equal(report.covered.has(`${x},${y}`), lit, `(${x}, ${y})`)
  }
})

test('one tile inside the area is enough to power a machine', () => {
  // The assembler spans (0,0)–(2,2); the pole's area only reaches its far corner.
  const powered = coverageOf('assembling-machine-3 (at (0, 0))\nmedium-electric-pole (at (5, 5))')
  assert.equal(powered.unpowered.length, 0)

  const dark = coverageOf('assembling-machine-3 (at (0, 0))\nmedium-electric-pole (at (6, 6))')
  assert.equal(dark.unpowered.length, 1)
})

test('only things that draw power are counted', () => {
  const report = coverageOf(`
    transport-belt (at (0, 0))
    steel-chest (at (1, 0))
    splitter (at (2, 0))
    burner-inserter (at (4, 0))
    bulk-inserter (at (5, 0))
    small-lamp (at (6, 0))
  `)
  assert.equal(report.consumers, 2, 'the inserter and the lamp; belts and chests need nothing')
  assert.equal(report.poles, 0)
})

test('the assembler-line example is fully powered', () => {
  const source = readFileSync(join(ROOT, 'examples', 'assembler-line.fbl'), 'utf8')
  const report = coverageOf(source)
  assert.ok(report.poles > 0)
  assert.equal(report.unpowered.length, 0, 'every inserter and machine reaches a substation')
})

test('an unlabelled coordinate fills at, and says so when a parameter wanted it', () => {
  // The trap: a block with its own `coord` parameter. `f ((1, 2))` looks like it passes the
  // coordinate to that parameter, but an unlabelled coordinate always means position.
  const source = `
    defblock pad (coord s) => { at (s) => { steel-chest (at (0, 0)) } }
    pad ((1, 2))
  `
  const [error] = errorsIn(source)
  assert.match(error.message, /'pad' needs s/)
  assert.match(error.hint, /unlabelled coordinate fills 'at'/)
  assert.ok(error.loc, 'the error points at the call')

  // Labelling it reaches the parameter; and `at` alone does the same job with no parameter.
  const labelled = run(`
    defblock pad (coord s) => { at (s) => { steel-chest (at (0, 0)) } }
    pad (s (1, 2))
  `).scene
  const builtin = run(`
    defblock pad () => { steel-chest (at (0, 0)) }
    pad (at (1, 2))
  `).scene
  assert.deepEqual(
    labelled.entities.map((e) => [e.x, e.y]),
    builtin.entities.map((e) => [e.x, e.y]),
  )
})

test('a bare name is a value when it is bound, and a bare label when it is not', () => {
  // `stack-inserter (dir)` passes the variable `dir`; only an unbound name that happens to
  // match a slot is a label that lost its argument.
  const { scene } = run(`
    defblock pad (direction dir = left) => { stack-inserter (at (0, 0), dir) }
    pad (right)
  `)
  assert.equal(scene.entities[0].dir, 4, 'east')

  const [error] = errorsIn('stack-inserter (at (0, 0), dir)')
  assert.match(error.message, /'dir' has no value/)
  assert.match(error.hint, /dir takes direction/)
})

test('naming a parameter after its slot lets a bare value find it', () => {
  // A bare direction fills `dir`. A parameter called `d` is reachable only by label.
  const [error] = errorsIn(`
    defblock pad (direction d = left) => { stack-inserter (at (0, 0), dir d) }
    pad (right)
  `)
  assert.match(error.message, /needs a label here/)
  assert.match(error.hint, /at, d/)

  const { scene } = run(`
    defblock pad (direction dir = left) => { stack-inserter (at (0, 0), dir) }
    pad (right)
  `)
  assert.equal(scene.entities[0].dir, 4)
})

test('auto sees its neighbours where a layout will actually put them', () => {
  // Layout forms used to evaluate every child at the frame origin and shift them afterwards,
  // so a belt routing inside one saw the previous child sitting on top of it.
  const source = `
    defblock cell () => {
      steel-chest (at (1, 0))
      belt (from (0, 0) to (3, 0), red, auto)
    }
    LAYOUT
  `
  const stacked = run(source.replace('LAYOUT', 'column for i in 0..3 => { cell () }')).scene
  const spread = run(source.replace('LAYOUT', 'for i in 0..3 => { cell (at (0, i)) }')).scene

  assert.equal(stacked.entities.length, spread.entities.length)
  assert.equal(
    stacked.entities.filter((e) => e.proto.kind === 'underground-belt').length,
    6,
    'each of the three rows tunnels under its own chest',
  )
  assert.equal(stacked.findCollisions().length, 0)
})

test('the smelters array example builds clean', () => {
  const source = readFileSync(join(ROOT, 'examples', 'smelters-array.fbl'), 'utf8')
  const { scene } = run(source)
  assert.equal(scene.findCollisions().length, 0)
  const power = powerCoverage(scene.entities)
  assert.equal(power.unpowered.length, 0, 'one substation per block covers it')
  assert.equal(scene.entities.filter((e) => e.proto.name === 'electric-furnace').length, 36)
})

// ── Contents, filters and priorities ──────────────────────────────────────────

test('content names the lane an item rides on, and never reaches the blueprint', () => {
  const { scene } = run('belt (from (0, 0), to (3, 0), content (iron-ore left, coal right))')
  for (const entity of scene.entities) {
    assert.deepEqual(entity.content, [
      { item: 'iron-ore', side: 'left' },
      { item: 'coal', side: 'right' },
    ])
  }

  const json = exportBlueprint(scene, registry).json.blueprint
  assert.equal(JSON.stringify(json).includes('iron-ore'), false, 'content is metadata only')
})

test('a chest lists items without sides, up to the stacks it has', () => {
  const { scene } = run('steel-chest (at (0, 0), content (iron-plate, copper-plate))')
  assert.deepEqual(scene.entities[0].content, [{ item: 'iron-plate' }, { item: 'copper-plate' }])

  assert.match(errorsIn('wooden-chest (at (0, 0), content (iron-plate left))')[0].message, /no sides/)
  // A wooden chest holds 16 stacks, so the cap is the chest's, not a fixed number.
  const many = Array.from({ length: 17 }, () => 'iron-plate').join(', ')
  assert.match(errorsIn(`wooden-chest (at (0, 0), content (${many}))`)[0].message, /holds 16 stacks/)
})

test('a belt carries two items, one per lane', () => {
  assert.match(errorsIn('belt (at (0, 0), content (iron-ore, coal, stone))')[0].message, /two lanes/)
  assert.match(errorsIn('belt (at (0, 0), content (iron-ore left, coal left))')[0].message, /left lane/)
  assert.match(errorsIn('belt (at (0, 0), content (iron-ore up))')[0].message, /not a side/)
  assert.match(errorsIn('belt (at (0, 0), content (iron-plat))')[0].message, /not an item/)
})

test('an inserter filter is a whitelist, and not makes the whole list a blacklist', () => {
  const pass = run('fast-inserter (at (0, 0), filter (copper-plate, copper-ore))').scene
  assert.deepEqual(pass.entities[0].filters, { items: ['copper-plate', 'copper-ore'], negated: false })

  const block = run('fast-inserter (at (0, 0), filter (not copper-ore))').scene
  assert.deepEqual(block.entities[0].filters, { items: ['copper-ore'], negated: true })

  // The mode belongs to the inserter, so `not` only makes sense in front of the list.
  assert.match(errorsIn('fast-inserter (at (0, 0), filter (copper-ore, not coal))')[0].message, /whole list/)
})

test('inserter filters export as a numbered list with the blacklist switch', async () => {
  const { scene } = run('fast-inserter (at (0, 0), filter (not copper-plate, copper-ore))')
  const entity = exportBlueprint(scene, registry).json.blueprint.entities[0]
  assert.equal(entity.use_filters, true)
  assert.equal(entity.filter_mode, 'blacklist')
  assert.deepEqual(entity.filters, [
    { index: 1, name: 'copper-plate', quality: 'normal', comparator: '=' },
    { index: 2, name: 'copper-ore', quality: 'normal', comparator: '=' },
  ])

  // 1.1 has dedicated filter inserters, so there is no switch to turn on and no quality.
  const old = await registryFor('1.1', V11)
  const legacy = exportBlueprint(run('filter-inserter (at (0, 0), filter (copper-plate))', old).scene, old)
  const first = legacy.json.blueprint.entities[0]
  assert.equal(first.use_filters, undefined)
  assert.deepEqual(first.filters, [{ index: 1, name: 'copper-plate' }])
})

test('a splitter filters one item and prefers a side each way', () => {
  const { scene } = run('splitter (at (0, 0), filter copper-plate, in-priority right)')
  const entity = exportBlueprint(scene, registry).json.blueprint.entities[0]
  assert.equal(entity.input_priority, 'right')
  assert.deepEqual(entity.filter, { name: 'copper-plate', quality: 'normal', comparator: '=' })
  // The game sends a filtered item left when no output side was named.
  assert.equal(entity.output_priority, 'left')

  const plain = exportBlueprint(run('splitter (at (0, 0), out-priority right)').scene, registry)
  assert.equal(plain.json.blueprint.entities[0].output_priority, 'right')
  assert.equal(plain.json.blueprint.entities[0].filter, undefined)

  assert.match(errorsIn('splitter (at (0, 0), filter (copper-plate, coal))')[0].message, /a single item/)
  assert.match(errorsIn('splitter (at (0, 0), in-priority up)')[0].message, /not a side/)
})

test('the sorting example builds clean', () => {
  const source = readFileSync(join(ROOT, 'examples', 'sorting.fbl'), 'utf8')
  const { scene } = run(source)
  assert.equal(scene.findCollisions().length, 0)
  assert.equal(scene.entities.filter((e) => e.content?.length).length, 31, 'every belt tile and chest carries its declaration')
})

test('only the entities that can hold them accept content and filters', () => {
  assert.match(errorsIn('assembling-machine-3 (at (0, 0), content (iron-plate))')[0].message, /no slot 'content'/)
  assert.match(errorsIn('steel-chest (at (0, 0), filter (iron-plate))')[0].message, /no slot 'filter'/)
})
