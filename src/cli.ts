#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { parseBoard, serializeBoard } from "./parser";
import { KanbanFormatError } from "./errors";

function usage(): string {
  return "usage: kanban-format <file> [file...]\n";
}

/**
 * Formats each file in place. Files that already match the canonical output
 * are left untouched (and not rewritten, so mtimes don't churn on a no-op run).
 * Non-fatal issues (tab indentation, CRLF/CR line endings) are printed as
 * warnings but don't affect the exit code or stop the file from formatting.
 */
function run(paths: string[]): number {
  if (paths.length === 0) {
    process.stderr.write(usage());
    return 1;
  }

  let exitCode = 0;

  for (const path of paths) {
    let source: string;
    try {
      source = readFileSync(path, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${path}: ${message}\n`);
      exitCode = 1;
      continue;
    }

    let board;
    try {
      board = parseBoard(source);
    } catch (err) {
      if (err instanceof KanbanFormatError) {
        process.stderr.write(`${path}: ${err.message}\n`);
        exitCode = 1;
        continue;
      }
      throw err;
    }

    for (const warning of board.warnings) {
      process.stderr.write(`${path}: warning: ${warning.message} (line ${warning.line}, column ${warning.column})\n`);
    }

    const formatted = serializeBoard(board);

    if (formatted === source) {
      process.stdout.write(`${path}: unchanged\n`);
    } else {
      writeFileSync(path, formatted, "utf8");
      process.stdout.write(`${path}: formatted\n`);
    }
  }

  return exitCode;
}

process.exitCode = run(process.argv.slice(2));
