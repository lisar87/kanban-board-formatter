import { test } from "node:test";
import assert = require("node:assert/strict");
import { parseBoard, formatBoard } from "./parser";
import { KanbanFormatError } from "./errors";

function assertFails(
  source: string,
  expected: { line: number; column: number; messageIncludes: string }
): void {
  assert.throws(
    () => parseBoard(source),
    (err: unknown) => {
      assert.ok(err instanceof KanbanFormatError, "expected a KanbanFormatError");
      const e = err as KanbanFormatError;
      assert.equal(e.line, expected.line, `line: got ${e.line}, want ${expected.line}`);
      assert.equal(e.column, expected.column, `column: got ${e.column}, want ${expected.column}`);
      assert.ok(
        e.message.includes(expected.messageIncludes),
        `message "${e.message}" does not include "${expected.messageIncludes}"`
      );
      assert.ok(e.message.includes("^"), "message should render a caret snippet");
      return true;
    }
  );
}

test("empty input reports the file is empty", () => {
  assertFails("", { line: 1, column: 1, messageIncludes: "the file is empty" });
});

test("blank-only input reports the file is empty", () => {
  assertFails("\n\n   \n", { line: 1, column: 1, messageIncludes: "the file is empty" });
});

test("a line before the title that isn't a title fails", () => {
  assertFails("not a title\n", {
    line: 1,
    column: 1,
    messageIncludes: "expected the board to start with a title line",
  });
});

test("a single hash with no space after it is not a valid title", () => {
  assertFails("#Sprint 12\n", {
    line: 1,
    column: 1,
    messageIncludes: "expected the board to start with a title line",
  });
});

test("a title with no text after the hash is rejected", () => {
  assertFails("#   \n", { line: 1, column: 2, messageIncludes: "board title cannot be empty" });
});

test("an unrecognized heading depth fails", () => {
  assertFails("# Board\n\n### Sub\n", {
    line: 3,
    column: 1,
    messageIncludes: "unrecognized heading",
  });
});

test("an empty column name fails", () => {
  assertFails("# Board\n\n## \n", {
    line: 3,
    column: 4,
    messageIncludes: "column name cannot be empty",
  });
});

test("a duplicate column name fails and names the earlier line", () => {
  assertFails("# Board\n\n## To Do\n\n## To Do\n", {
    line: 5,
    column: 1,
    messageIncludes: 'column "To Do" is already defined at line 3',
  });
});

test("a duplicate column name is case-insensitive", () => {
  assertFails("# Board\n\n## To Do\n\n## TO DO\n", {
    line: 5,
    column: 1,
    messageIncludes: 'column "TO DO" is already defined at line 3',
  });
});

test("a card before any column fails", () => {
  assertFails("# Board\n\n- Task\n", {
    line: 3,
    column: 1,
    messageIncludes: "card appears before any column",
  });
});

test("a dash with no space after it fails", () => {
  assertFails("# Board\n\n## To Do\n-Task\n", {
    line: 4,
    column: 1,
    messageIncludes: "cards need a space after the dash",
  });
});

test("a completely unrecognized line fails", () => {
  assertFails("# Board\n\n## To Do\njust some text\n", {
    line: 4,
    column: 1,
    messageIncludes: "unrecognized line",
  });
});

test("a card with no text (bare dash) fails", () => {
  assertFails("# Board\n\n## To Do\n-\n", {
    line: 4,
    column: 3,
    messageIncludes: "card text cannot be empty",
  });
});

test("a card made only of metadata has no text and fails", () => {
  assertFails("# Board\n\n## To Do\n- @label:urgent\n", {
    line: 4,
    column: 3,
    messageIncludes: "card text cannot be empty",
  });
});

test("a second due date on the same card fails", () => {
  assertFails("# Board\n\n## To Do\n- Task @due:2026-01-01 @due:2026-02-02\n", {
    line: 4,
    column: 8,
    messageIncludes: "card already has a due date",
  });
});

test("a malformed due date fails", () => {
  assertFails("# Board\n\n## To Do\n- Task @due:not-a-date\n", {
    line: 4,
    column: 8,
    messageIncludes: 'due date "not-a-date" must look like YYYY-MM-DD',
  });
});

test("a due date with an out-of-range month fails", () => {
  assertFails("# Board\n\n## To Do\n- Task @due:2026-13-01\n", {
    line: 4,
    column: 8,
    messageIncludes: 'due date "2026-13-01" must look like YYYY-MM-DD',
  });
});

test("a label with an invalid character fails", () => {
  assertFails("# Board\n\n## To Do\n- Task @label:back/end\n", {
    line: 4,
    column: 8,
    messageIncludes: 'label "back/end" may only contain letters, numbers, "-", and "_"',
  });
});

test("a board with a title but no columns fails", () => {
  assertFails("# Board\n", {
    line: 1,
    column: 1,
    messageIncludes: "the board has no columns",
  });
});

test("a well-formed board parses without error", () => {
  const board = parseBoard(
    "# Sprint 12\n\n## To Do\n- Write tests @due:2026-09-15 @label:backend\n- Fix bug #123\n\n## Done\n- Set up the repo\n"
  );
  assert.equal(board.title, "Sprint 12");
  assert.equal(board.columns.length, 2);
  assert.equal(board.columns[0]!.name, "To Do");
  assert.equal(board.columns[0]!.cards.length, 2);
  assert.deepEqual(board.columns[0]!.cards[0]!.labels, ["backend"]);
  assert.equal(board.columns[0]!.cards[0]!.dueDate, "2026-09-15");
  assert.equal(board.columns[0]!.cards[1]!.text, "Fix bug #123");
});

test("formatBoard normalizes messy spacing", () => {
  const messy = "#   Sprint 12\n##   To Do\n-   Write tests   \n";
  const formatted = formatBoard(messy);
  assert.equal(formatted, "# Sprint 12\n\n## To Do\n- Write tests\n");
});

test("formatBoard is a no-op on its own output", () => {
  const messy = "#   Sprint 12\n##   To Do\n-   Write tests   \n\n## Done\n- Ship it\n";
  const once = formatBoard(messy);
  const twice = formatBoard(once);
  assert.equal(once, twice);
});
