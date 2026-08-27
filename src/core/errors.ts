export interface Loc {
  line: number
  col: number
}

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  loc?: Loc
  hint?: string
}

/** Any error the user can cause by writing bad source. Carries a source location. */
export class LangError extends Error {
  constructor(
    message: string,
    public readonly loc?: Loc,
    public readonly hint?: string,
  ) {
    super(message)
    this.name = 'LangError'
  }
}

export function fail(message: string, loc?: Loc, hint?: string): never {
  throw new LangError(message, loc, hint)
}
