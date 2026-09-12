# kanban-board-formatter

Every kanban tool exports boards as text slightly differently, and half of
them are inconsistent even with themselves: a stray tab here, a card pasted
without its leading dash, a column header typed twice because someone
renamed a list and exported before the tool caught up. Feeding that
straight into another tool usually gets you a generic "invalid input" and
nothing else.

This is a small parser and formatter for a plain-text kanban board format.
It normalizes messy input into a canonical layout, and when it can't, it
tells you exactly where the problem is — line, column, and a source snippet
with a caret pointing at the character — instead of a vague failure.

## The format

```
# Sprint 12

## To Do
- Write tests for the parser
- Fix bug #123

## In Progress
- Refactor the column model

## Done
- Set up the repo
```

A title line (`# Name`), one or more column headers (`## Name`), and cards
(`- text`) under each column. Blank lines are ignored.

A card can carry trailing metadata:

```
- Fix bug #123 @due:2026-09-15 @label:backend @label:urgent
```

`@due:YYYY-MM-DD` sets a due date (at most one per card); `@label:name` adds
a label and can repeat. Both are optional. Anything else trailing the card
text, including a bare `@mention`, is left alone as ordinary text — only
the `@due:` and `@label:` prefixes are treated as markers, which is why
`#123` above stays part of the text instead of being parsed as a label.

## Usage

```ts
import { formatBoard, parseBoard, KanbanFormatError } from "./src/index";

const messy = `#   Sprint 12
##To Do
-Write tests
- Write tests
`;

try {
  formatBoard(messy);
} catch (err) {
  if (err instanceof KanbanFormatError) {
    console.error(err.message);
  }
}
```

That input fails on the second line, because a column header needs a space
after the hashes:

```
unrecognized heading; columns use exactly two hashes, e.g. '## Column Name' (line 2, column 1)
2 | ##To Do
    ^
```

Fix the input and `formatBoard` returns a canonical string: single-space
header markers, trimmed card text, one blank line between sections, and a
trailing newline. Running it twice on its own output is a no-op.

`parseBoard` returns the parsed structure (`Board { title, columns }`) if
you want to inspect it rather than just reformat it — each column and card
also carries its own `line`/`column`, so downstream tooling can report
errors against the original source too.

## CLI

```
npm run build
node dist/cli.js board.txt [more-boards.txt ...]
```

Formats each file in place and prints whether it changed. A file that's
already in canonical form is reported as unchanged and not rewritten. If a
file fails to parse, its error is printed to stderr (with the same
line/column/snippet as the library) and the CLI exits non-zero, but it still
processes the remaining files.

## Tests

```
npm test
```

Compiles with `tsc` and runs the tests with Node's built-in test runner
(`node --test`), so there's nothing to install. `src/parser.test.ts` checks
the line/column reported for every failure mode above, and that
`formatBoard` is idempotent and actually normalizes messy input.

## Status

Early skeleton. The parser handles the core format, card metadata (due
dates, labels), and the common failure modes (missing title, empty
column/card names, duplicate columns, cards before any column, malformed
markers, bad metadata), with a test suite covering the error position for
each one. The CLI formats files in place; it doesn't yet have a `--check`
mode.

## License

MIT, see LICENSE.
