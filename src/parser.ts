import { KanbanFormatError } from "./errors";

export interface Card {
  text: string;
  line: number;
  column: number;
}

export interface Column {
  name: string;
  line: number;
  column: number;
  cards: Card[];
}

export interface Board {
  title: string;
  line: number;
  column: number;
  columns: Column[];
}

/**
 * Parses a plain-text kanban export of the form:
 *
 *   # Board Name
 *
 *   ## Column Name
 *   - Card text
 *   - Card text
 *
 *   ## Another Column
 *   - Card text
 *
 * Every failure mode reports the exact line and column so a bad paste from
 * a tool that isn't quite consistent about spacing is easy to locate by hand.
 */
export function parseBoard(source: string): Board {
  const lines = source.split(/\r\n|\r|\n/);

  let title: { value: string; line: number; column: number } | null = null;
  let currentColumn: Column | null = null;
  const columns: Column[] = [];
  const columnLineByKey = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const lineNumber = i + 1;

    if (rawLine.trim().length === 0) {
      continue;
    }

    const content = rawLine.trimStart();
    const column = rawLine.length - content.length + 1;

    if (title === null) {
      const match = /^#\s+(.*)$/.exec(content);
      if (!content.startsWith("#") || !match) {
        throw new KanbanFormatError(
          "expected the board to start with a title line ('# Board Name')",
          { line: lineNumber, column },
          rawLine
        );
      }
      const value = match[1]!.trim();
      if (value.length === 0) {
        throw new KanbanFormatError(
          "board title cannot be empty; write '# Board Name'",
          { line: lineNumber, column: column + 1 },
          rawLine
        );
      }
      title = { value, line: lineNumber, column };
      continue;
    }

    if (content.startsWith("## ")) {
      const name = content.slice(3).trim();
      const nameColumn = column + 3;
      if (name.length === 0) {
        throw new KanbanFormatError(
          "column name cannot be empty; write '## Column Name'",
          { line: lineNumber, column: nameColumn },
          rawLine
        );
      }
      const key = name.toLowerCase();
      const existingLine = columnLineByKey.get(key);
      if (existingLine !== undefined) {
        throw new KanbanFormatError(
          `column "${name}" is already defined at line ${existingLine}`,
          { line: lineNumber, column },
          rawLine
        );
      }
      columnLineByKey.set(key, lineNumber);
      currentColumn = { name, line: lineNumber, column, cards: [] };
      columns.push(currentColumn);
      continue;
    }

    if (content.startsWith("#")) {
      throw new KanbanFormatError(
        "unrecognized heading; columns use exactly two hashes, e.g. '## Column Name'",
        { line: lineNumber, column },
        rawLine
      );
    }

    if (content.startsWith("- ") || content === "-") {
      if (currentColumn === null) {
        throw new KanbanFormatError(
          "card appears before any column; add a '## Column Name' header first",
          { line: lineNumber, column },
          rawLine
        );
      }
      const text = content === "-" ? "" : content.slice(2).trim();
      const textColumn = column + 2;
      if (text.length === 0) {
        throw new KanbanFormatError("card text cannot be empty", { line: lineNumber, column: textColumn }, rawLine);
      }
      currentColumn.cards.push({ text, line: lineNumber, column });
      continue;
    }

    if (content.startsWith("-")) {
      throw new KanbanFormatError(
        "cards need a space after the dash, e.g. '- Task name'",
        { line: lineNumber, column },
        rawLine
      );
    }

    throw new KanbanFormatError(
      "unrecognized line; expected a column header ('## Name') or a card ('- Task')",
      { line: lineNumber, column },
      rawLine
    );
  }

  if (title === null) {
    throw new KanbanFormatError(
      "the file is empty; a board needs a title line ('# Board Name')",
      { line: 1, column: 1 },
      ""
    );
  }

  if (columns.length === 0) {
    throw new KanbanFormatError(
      "the board has no columns; add at least one '## Column Name' header",
      { line: title.line, column: title.column },
      lines[title.line - 1] ?? ""
    );
  }

  return { title: title.value, line: title.line, column: title.column, columns };
}

/**
 * Re-serializes a parsed board into a canonical form: single-space header
 * markers, one blank line between sections, trimmed card text, trailing
 * newline. Running this twice on its own output is a no-op.
 */
export function formatBoard(source: string): string {
  const board = parseBoard(source);
  const lines: string[] = [`# ${board.title}`];

  for (const column of board.columns) {
    lines.push("");
    lines.push(`## ${column.name}`);
    for (const card of column.cards) {
      lines.push(`- ${card.text}`);
    }
  }

  return lines.join("\n") + "\n";
}
