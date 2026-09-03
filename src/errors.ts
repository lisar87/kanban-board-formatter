export interface SourcePosition {
  line: number;
  column: number;
}

/**
 * Thrown by the parser for any malformed input. Carries the exact position
 * of the offending character and renders a source snippet with a caret,
 * because "invalid input" on line 400 of a pasted export is useless.
 */
export class KanbanFormatError extends Error {
  readonly line: number;
  readonly column: number;
  readonly sourceLine: string;

  constructor(reason: string, position: SourcePosition, sourceLine: string) {
    super(`${reason} (line ${position.line}, column ${position.column})\n${renderSnippet(position, sourceLine)}`);
    this.name = "KanbanFormatError";
    this.line = position.line;
    this.column = position.column;
    this.sourceLine = sourceLine;
  }
}

function renderSnippet(position: SourcePosition, sourceLine: string): string {
  const gutter = `${position.line} | `;
  const caretOffset = gutter.length + Math.max(0, position.column - 1);
  return `${gutter}${sourceLine}\n${" ".repeat(caretOffset)}^`;
}
