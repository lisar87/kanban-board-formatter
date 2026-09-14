import { KanbanFormatError } from "./errors";

export interface Card {
  text: string;
  labels: string[];
  dueDate: string | null;
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
  warnings: Warning[];
}

export interface Warning {
  message: string;
  line: number;
  column: number;
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
 * A card's text can carry trailing metadata: "@due:2026-09-15" sets a due
 * date and "@label:name" adds a label (repeatable). Anything else trailing
 * the card, including a bare "@" token, is treated as ordinary text.
 *
 * Every failure mode reports the exact line and column so a bad paste from
 * a tool that isn't quite consistent about spacing is easy to locate by hand.
 *
 * Tab-indented lines and CRLF/CR line endings parse fine (indentation is
 * trimmed and any line ending is accepted) but are unusual enough for this
 * format that they're reported back as non-fatal `warnings` rather than
 * silently swallowed.
 */
export function parseBoard(source: string): Board {
  const lines = source.split(/\r\n|\r|\n/);
  const lineEndings = source.match(/\r\n|\r|\n/g) ?? [];

  let title: { value: string; line: number; column: number } | null = null;
  let currentColumn: Column | null = null;
  const columns: Column[] = [];
  const columnLineByKey = new Map<string, number>();
  const warnings: Warning[] = [];
  let sawForeignLineEnding = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const lineNumber = i + 1;

    if (!sawForeignLineEnding) {
      const ending = lineEndings[i];
      if (ending === "\r\n" || ending === "\r") {
        warnings.push({
          message:
            ending === "\r\n"
              ? "input uses CRLF line endings; formatted output uses LF"
              : "input uses bare CR line endings; formatted output uses LF",
          line: lineNumber,
          column: rawLine.length + 1,
        });
        sawForeignLineEnding = true;
      }
    }

    if (rawLine.trim().length === 0) {
      continue;
    }

    const content = rawLine.trimStart();
    const column = rawLine.length - content.length + 1;

    const leadingWhitespace = rawLine.slice(0, column - 1);
    const tabIndex = leadingWhitespace.indexOf("\t");
    if (tabIndex !== -1) {
      warnings.push({
        message: "line is indented with a tab; leading whitespace is stripped when formatting",
        line: lineNumber,
        column: tabIndex + 1,
      });
    }

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

      const bodyRaw = content === "-" ? "" : content.slice(2);
      const bodyColumn = column + 2;
      const tokens = [...bodyRaw.matchAll(/\S+/g)];

      const labels: string[] = [];
      let dueDate: string | null = null;
      let metadataStart = tokens.length;

      for (let t = tokens.length - 1; t >= 0; t--) {
        const token = tokens[t]!;
        const value = token[0];
        const tokenColumn = bodyColumn + token.index!;

        const dueMatch = /^@due:(.*)$/.exec(value);
        if (dueMatch) {
          if (dueDate !== null) {
            throw new KanbanFormatError(
              "card already has a due date",
              { line: lineNumber, column: tokenColumn },
              rawLine
            );
          }
          const dateValue = dueMatch[1]!;
          if (!isValidDate(dateValue)) {
            throw new KanbanFormatError(
              `due date "${dateValue}" must look like YYYY-MM-DD`,
              { line: lineNumber, column: tokenColumn },
              rawLine
            );
          }
          dueDate = dateValue;
          metadataStart = t;
          continue;
        }

        const labelMatch = /^@label:(.*)$/.exec(value);
        if (labelMatch) {
          const labelValue = labelMatch[1]!;
          if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(labelValue)) {
            throw new KanbanFormatError(
              `label "${labelValue}" may only contain letters, numbers, "-", and "_"`,
              { line: lineNumber, column: tokenColumn },
              rawLine
            );
          }
          labels.unshift(labelValue);
          metadataStart = t;
          continue;
        }

        // Anything else trailing the card, including a bare "@something", is
        // part of the card text rather than metadata: only the "@due:" and
        // "@label:" prefixes are unambiguous enough to treat as a marker.
        break;
      }

      const textTokens = tokens.slice(0, metadataStart);
      const text = textTokens.map((m) => m[0]).join(" ");
      const textColumn = textTokens.length > 0 ? bodyColumn + textTokens[0]!.index! : bodyColumn;

      if (text.length === 0) {
        throw new KanbanFormatError("card text cannot be empty", { line: lineNumber, column: textColumn }, rawLine);
      }

      currentColumn.cards.push({ text, labels, dueDate, line: lineNumber, column });
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

  return { title: title.value, line: title.line, column: title.column, columns, warnings };
}

// Checks month/day are in range but doesn't account for month length or leap
// years; good enough to catch typos like "2026-13-40" without a date library.
function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * Re-serializes a parsed board into a canonical form: single-space header
 * markers, one blank line between sections, trimmed card text, trailing
 * newline (LF, regardless of what line endings the source used). Running
 * this twice on its own output is a no-op.
 */
export function serializeBoard(board: Board): string {
  const lines: string[] = [`# ${board.title}`];

  for (const column of board.columns) {
    lines.push("");
    lines.push(`## ${column.name}`);
    for (const card of column.cards) {
      const parts = [`- ${card.text}`];
      if (card.dueDate !== null) {
        parts.push(`@due:${card.dueDate}`);
      }
      for (const label of card.labels) {
        parts.push(`@label:${label}`);
      }
      lines.push(parts.join(" "));
    }
  }

  return lines.join("\n") + "\n";
}

/** Parses `source` and re-serializes it in one step; see `parseBoard` and `serializeBoard`. */
export function formatBoard(source: string): string {
  return serializeBoard(parseBoard(source));
}
