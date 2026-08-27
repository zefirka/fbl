import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

import type { Diagnostic } from '../core'
import { configuration, LANGUAGE_ID, monarch, theme, THEME_ID } from './lang/monarch'
import { registerLanguage, type LanguageHost } from './lang/providers'

// Only the base editor worker is needed: there is no TypeScript or JSON service here.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

let registered = false

export interface Editor {
  getValue(): string
  setValue(source: string): void
  onChange(listener: (source: string) => void): void
  setDiagnostics(diagnostics: Diagnostic[]): void
  reveal(line: number, column: number): void
}

export function createEditor(container: HTMLElement, source: string, host: LanguageHost): Editor {
  if (!registered) {
    registered = true
    monaco.languages.register({ id: LANGUAGE_ID, extensions: ['.fbl'] })
    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, monarch)
    monaco.languages.setLanguageConfiguration(LANGUAGE_ID, configuration)
    monaco.editor.defineTheme(THEME_ID, theme)
    registerLanguage(monaco, host)
  }

  const editor = monaco.editor.create(container, {
    value: source,
    language: LANGUAGE_ID,
    theme: THEME_ID,
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    tabSize: 2,
    padding: { top: 10, bottom: 10 },
    // Slots and values are separated by spaces, so completion has to offer itself there too.
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    wordBasedSuggestions: 'off',
    bracketPairColorization: { enabled: false },
    overviewRulerLanes: 0,
    guides: { indentation: false },
    // The examples use × and → in comments; Monaco's default is to flag them as confusable.
    unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
  })

  const model = editor.getModel()!

  return {
    getValue: () => model.getValue(),

    setValue(next) {
      if (model.getValue() !== next) model.setValue(next)
    },

    onChange(listener) {
      model.onDidChangeContent(() => listener(model.getValue()))
    },

    setDiagnostics(diagnostics) {
      monaco.editor.setModelMarkers(
        model,
        'fbl',
        diagnostics
          .filter((d) => d.loc)
          .map((d) => {
            const line = Math.min(d.loc!.line, model.getLineCount())
            const word = model.getWordAtPosition({ lineNumber: line, column: d.loc!.col })
            return {
              severity:
                d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
              message: d.hint ? `${d.message}\n${d.hint}` : d.message,
              startLineNumber: line,
              startColumn: word?.startColumn ?? d.loc!.col,
              endLineNumber: line,
              endColumn: word?.endColumn ?? d.loc!.col + 1,
            }
          }),
      )
    },

    reveal(line, column) {
      editor.revealPositionInCenter({ lineNumber: line, column })
      editor.setPosition({ lineNumber: line, column })
      editor.focus()
    },
  }
}
