import type * as monaco from 'monaco-editor'

export const LANGUAGE_ID = 'fbl'
export const THEME_ID = 'fbl-dark'

const KEYWORDS = ['defblock', 'def', 'defaults', 'for', 'in', 'if', 'else', 'and', 'or', 'not', 'measure', 'row', 'column']
const TYPES = ['int', 'float', 'number', 'bool', 'text', 'coord', 'direction', 'tier', 'quality', 'recipe', 'item', 'module', 'entity', 'handle', 'any']
const SLOTS = ['at', 'from', 'to', 'via', 'dir', 'tier', 'recipe', 'modules', 'quality', 'type', 'length', 'gap', 'align', 'in', 'out']
const LITERALS = [
  'north', 'east', 'south', 'west', 'northeast', 'southeast', 'southwest', 'northwest',
  'up', 'right', 'down', 'left',
  'yellow', 'red', 'blue', 'green', 'normal', 'basic', 'fast', 'express', 'turbo',
  'uncommon', 'rare', 'epic', 'legendary', 'input', 'output', 'start', 'center', 'end',
]
const BUILTINS = [
  'repeat', 'count', 'print', 'min', 'max', 'abs', 'floor', 'ceil', 'round',
  'ingredients', 'craft-time', 'module-slots',
  // Helpers that expand into many entities.
  'belt', 'underground', 'balancer',
]

export const monarch: monaco.languages.IMonarchLanguage = {
  keywords: KEYWORDS,
  typeKeywords: TYPES,
  slots: SLOTS,
  literals: LITERALS,
  builtins: BUILTINS,
  tokenizer: {
    root: [
      [/;.*$/, 'comment'],
      [/"([^"\\]|\\.)*"?/, 'string'],
      // A dot only continues a number when a digit follows, so `0..4` stays a range.
      [/\d+(\.\d+)?/, 'number'],
      [/=>|==|!=|<=|>=|\.\.|\[\]|[+\-*/%<>=.]/, 'operator'],
      [
        /[A-Za-z_][A-Za-z0-9_?!-]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@literals': 'constant',
            '@builtins': 'predefined',
            '@slots': 'attribute',
            '@default': 'identifier',
          },
        },
      ],
      [/[()]/, 'delimiter.parenthesis'],
      [/[{}]/, 'delimiter.curly'],
      [/,/, 'delimiter'],
    ],
  },
}

export const configuration: monaco.languages.LanguageConfiguration = {
  comments: { lineComment: ';' },
  brackets: [
    ['(', ')'],
    ['{', '}'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
  ],
  wordPattern: /[A-Za-z_][A-Za-z0-9_?!-]*/,
  indentationRules: {
    increaseIndentPattern: /\{\s*$/,
    decreaseIndentPattern: /^\s*\}/,
  },
}

export const theme: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5d6673', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff9f4a' },
    { token: 'type', foreground: '63b3ed' },
    { token: 'attribute', foreground: 'c8a0ff' },
    { token: 'constant', foreground: '6ede8a' },
    { token: 'predefined', foreground: '7fd1c8' },
    { token: 'number', foreground: 'd8b4fe' },
    { token: 'string', foreground: '9fd77a' },
    { token: 'operator', foreground: '8b95a3' },
    { token: 'identifier', foreground: 'd7dce3' },
    { token: 'delimiter', foreground: '7f8895' },
  ],
  colors: {
    'editor.background': '#1a1e25',
    'editor.foreground': '#d7dce3',
    'editorCursor.foreground': '#ffae3f',
    'editorLineNumber.foreground': '#4d5561',
    'editorLineNumber.activeForeground': '#8b95a3',
    'editor.lineHighlightBackground': '#ffffff08',
    'editor.selectionBackground': '#2f3a49',
    'editorBracketMatch.background': '#ffae3f33',
    'editorBracketMatch.border': '#ffae3f',
    'editorWidget.background': '#222831',
    'editorWidget.border': '#2c333d',
    'editorSuggestWidget.background': '#1a1e25',
    'editorSuggestWidget.border': '#2c333d',
    'editorSuggestWidget.selectedBackground': '#2f3a49',
    'editorHoverWidget.background': '#1a1e25',
    'editorHoverWidget.border': '#2c333d',
    'editorGutter.background': '#1a1e25',
    'scrollbarSlider.background': '#2c333d80',
  },
}
