import type * as Monaco from 'monaco-editor'

import {
  entitySlots,
  FUNCTIONS,
  HELPER_SLOTS,
  LAYOUT_SLOTS,
  showType,
  Universe,
  type BlockSignature,
  type ProtoRegistry,
  type SlotDef,
  type Type,
} from '../../core'
import { analyze, type Vocabulary } from './context'
import { LANGUAGE_ID } from './monarch'

/** What the providers need to know, refreshed whenever the dataset or the source changes. */
export interface LanguageHost {
  registry: ProtoRegistry | null
  blocks: BlockSignature[]
}

const KEYWORD_DOCS: Record<string, string> = {
  defblock: 'Define a block: `defblock name (int n) => { … }`. It writes itself from (0, 0).',
  def: 'Bind a value: `def prod-3 = repeat (4, productivity-module-3)`.',
  defaults: 'Preset any slot left blank: `defaults (tier blue)`, optionally narrowed to one entity.',
  for: 'Repeat. It does not position anything — use `row for` or compute the position yourself.',
  row: 'Pack children left to right, measuring each. `row for i in 0..n => { … }` folds the loop in.',
  column: 'Pack children top to bottom, measuring each.',
  at: 'Shift the frame: `at (10, 4) => { … }`.',
  if: 'Conditional: `if n > 4 => { … } else => { … }`.',
  measure: 'Evaluate a placement, report its bounding box, then remove it again.',
}

function slotsFor(host: LanguageHost, callee: string): SlotDef[] | null {
  const block = host.blocks.find((b) => b.name === callee)
  if (block) return block.slots

  const proto = host.registry?.entities.get(callee)
  if (proto) return entitySlots(proto, host.registry!.profile.supportsQuality)

  return HELPER_SLOTS[callee] ?? LAYOUT_SLOTS[callee] ?? null
}

export function vocabularyFor(host: LanguageHost): Vocabulary {
  return {
    isCallable: (name) => slotsFor(host, name) !== null,
    slotsOf: (callee) => slotsFor(host, callee)?.flatMap((s) => [s.name, ...(s.aliases ?? [])]) ?? null,
  }
}

function describeEntity(registry: ProtoRegistry, name: string): string {
  const proto = registry.entities.get(name)
  if (!proto) return name
  const parts = [`${proto.size.x}×${proto.size.y}`]
  if (proto.moduleSlots) parts.push(`${proto.moduleSlots} module slots`)
  if (proto.craftingSpeed) parts.push(`speed ${proto.craftingSpeed}`)
  if (proto.beltSpeed) parts.push(`${proto.beltSpeed} items/s`)
  return parts.join(' · ')
}

function describeRecipe(registry: ProtoRegistry, name: string): string {
  const recipe = registry.recipes.get(name)
  if (!recipe) return name
  const inputs = Object.entries(recipe.in ?? {}).map(([id, n]) => `${n}× ${id}`)
  return `${recipe.time}s${inputs.length ? ` · ${inputs.join(', ')}` : ''}`
}

export function registerLanguage(monaco: typeof Monaco, host: LanguageHost): void {
  const Kind = monaco.languages.CompletionItemKind

  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    triggerCharacters: [' ', '(', ',', '.'],

    provideCompletionItems(model, position) {
      const registry = host.registry
      if (!registry) return { suggestions: [] }

      const offset = model.getOffsetAt(position)
      const context = analyze(model.getValue(), offset, vocabularyFor(host))
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const item = (
        label: string,
        kind: Monaco.languages.CompletionItemKind,
        detail?: string,
        documentation?: string,
        insertText = label,
        sortText?: string,
      ): Monaco.languages.CompletionItem => ({
        label,
        kind,
        detail,
        documentation,
        insertText,
        range,
        sortText,
        insertTextRules:
          insertText === label ? undefined : monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      })

      const universe = new Universe(registry)
      const suggestions: Monaco.languages.CompletionItem[] = []

      const entityItems = () =>
        [...registry.entities.values()].map((proto) =>
          item(proto.name, Kind.Class, describeEntity(registry, proto.name), proto.label),
        )
      const blockItems = () =>
        host.blocks.map((block) =>
          item(block.name, Kind.Function, block.slots.map((s) => s.name).join(', '), 'block'),
        )

      switch (context.kind) {
        case 'statement': {
          for (const [keyword, doc] of Object.entries(KEYWORD_DOCS)) {
            suggestions.push(item(keyword, Kind.Keyword, undefined, doc, undefined, `0${keyword}`))
          }
          suggestions.push(...blockItems().map((i) => ({ ...i, sortText: `1${i.label}` })))
          suggestions.push(...entityItems().map((i) => ({ ...i, sortText: `2${i.label}` })))
          for (const fn of FUNCTIONS) {
            suggestions.push(
              item(fn.name, Kind.Method, `(${fn.params.map(showType).join(', ')}) → ${showType(fn.result)}`),
            )
          }
          break
        }

        case 'slot': {
          const slots = slotsFor(host, context.callee) ?? []
          for (const slot of slots) {
            suggestions.push(
              item(slot.name, Kind.Property, showType(slot.type), slot.doc, `${slot.name} `, `0${slot.name}`),
            )
          }
          // Values whose type names their own slot can be written bare.
          for (const slot of slots) {
            if (slot.type.k !== 'enum') continue
            if (!['direction', 'tier', 'quality', 'underground-type', 'align'].includes(slot.type.name)) continue
            for (const member of universe.members(slot.type.name)) {
              suggestions.push(item(member, Kind.EnumMember, `${slot.type.name} → ${slot.name}`, undefined, member, `1${member}`))
            }
          }
          break
        }

        case 'value': {
          const slots = slotsFor(host, context.callee) ?? []
          const slot = slots.find((s) => s.name === context.slot || s.aliases?.includes(context.slot))
          const type: Type | undefined = slot?.type
          if (!type) break
          suggestions.push(...valueSuggestions(type, context.callee))
          break
        }

        case 'defaults-slot': {
          const defaultable: Array<[string, string]> = [
            ['tier', 'tier'],
            ['quality', 'quality'],
            ['dir', 'direction'],
            ['recipe', 'recipe'],
            ['modules', 'module[]'],
            ['gap', 'int'],
            ['align', 'align'],
          ]
          for (const [name, type] of defaultable) {
            suggestions.push(item(name, Kind.Property, type, undefined, `${name} `))
          }
          break
        }

        case 'defaults-target': {
          suggestions.push(...entityItems())
          for (const family of ['belt', 'underground', 'inserter', 'machine', 'pipe', 'pole', 'container']) {
            suggestions.push(item(family, Kind.Folder, 'family', undefined, family, `0${family}`))
          }
          break
        }

        case 'param-type': {
          const types: Array<[string, string]> = [
            ['int', 'a whole number'],
            ['float', 'a number'],
            ['bool', 'true or false'],
            ['text', 'a string'],
            ['coord', 'a tile, written (x, y)'],
            ['direction', 'north, east, south or west'],
            ['tier', 'yellow, red, blue or green'],
            ['quality', 'normal … legendary'],
            ['recipe', 'a recipe name'],
            ['item', 'an item name'],
            ['module', 'an item, optionally with a quality'],
            ['entity', 'a building or a block, so it can be placed'],
            ['handle', 'what a placement evaluates to'],
          ]
          for (const [name, doc] of types) {
            suggestions.push(item(name, Kind.TypeParameter, doc))
            suggestions.push(item(`${name}[]`, Kind.TypeParameter, `a list of ${name}`))
          }
          break
        }

        case 'none':
          break
      }

      function itemItems(): Monaco.languages.CompletionItem[] {
        return universe.members('item').map((name) => item(name, Kind.EnumMember, 'item'))
      }

      function valueSuggestions(type: Type, callee: string): Monaco.languages.CompletionItem[] {
        const registry = host.registry!
        if (type.k === 'coord') return [item('(x, y)', Kind.Snippet, 'a tile', undefined, '(${1:0}, ${2:0})')]
        if (type.k === 'array') return valueSuggestions(type.of, callee)
        if (type.k === 'module') {
          return [...registry.modules].map((name) => item(name, Kind.EnumMember, 'module'))
        }
        if (type.k === 'content') {
          // An entry is an item, optionally followed by the belt lane it rides on.
          return [
            ...universe.members('side').map((side) => item(side, Kind.EnumMember, 'belt lane', undefined, side, `0${side}`)),
            ...itemItems(),
          ]
        }
        if (type.k === 'filters') {
          return [
            item('not', Kind.Keyword, 'turn the list into a blacklist', undefined, 'not ', '0not'),
            ...itemItems(),
          ]
        }
        if (type.k !== 'enum') return []

        switch (type.name) {
          case 'recipe': {
            // Only offer what this machine can actually craft. When the callee is a block or
            // an `entity` parameter the machine is unknown, so everything is fair game.
            const known = registry.entities.has(callee)
            return [...registry.recipes.values()]
              .filter((recipe) => !known || recipe.producers?.includes(callee))
              .map((recipe) => item(recipe.id, Kind.Value, describeRecipe(registry, recipe.id), recipe.name))
          }
          case 'entity':
            return [...entityItems(), ...blockItems()]
          case 'module-item':
            return [...registry.modules].map((name) => item(name, Kind.EnumMember, 'module'))
          case 'item':
            return itemItems()
          default:
            return universe.members(type.name).map((member) => item(member, Kind.EnumMember, type.name))
        }
      }

      return { suggestions }
    },
  })

  monaco.languages.registerHoverProvider(LANGUAGE_ID, {
    provideHover(model, position) {
      const registry = host.registry
      const word = model.getWordAtPosition(position)
      if (!registry || !word) return null

      const name = word.word
      const lines: string[] = []

      const proto = registry.entities.get(name)
      if (proto) lines.push(`**${proto.label}**`, describeEntity(registry, name))
      else if (registry.recipes.has(name)) lines.push(`**${registry.recipes.get(name)!.name}**`, describeRecipe(registry, name))
      else if (KEYWORD_DOCS[name]) lines.push(KEYWORD_DOCS[name])
      else {
        const block = host.blocks.find((b) => b.name === name)
        if (block) {
          lines.push(`**block ${block.name}**`)
          lines.push(block.slots.map((s) => `${s.name}: ${showType(s.type)}`).join('  \n'))
        } else {
          const fn = FUNCTIONS.find((f) => f.name === name)
          if (fn) lines.push(`\`${fn.name} (${fn.params.map(showType).join(', ')}) → ${showType(fn.result)}\``)
        }
      }

      if (lines.length === 0) return null
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: lines.map((value) => ({ value })),
      }
    },
  })
}
