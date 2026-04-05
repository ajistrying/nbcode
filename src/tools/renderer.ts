/**
 * Generic tool result rendering helpers.
 *
 * These functions produce `ToolResult<T>` values that satisfy the interface
 * expected by `Tool.call()`. They abstract away the boilerplate that every
 * tool repeats: wrapping a string output in `{ data, ... }` and building the
 * corresponding `ToolResultBlockParam`.
 *
 * Existing tools are unaffected --- these helpers are purely additive and
 * intended for new tools (especially those created via `defineSimpleTool`).
 */

import type { ToolResult } from '../Tool.js'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Data shape returned by {@link textResult}. */
export type TextResultData = { content: string }

/** Data shape returned by {@link fileResult}. */
export type FileResultData = { content: string; filePath: string }

/** Data shape returned by {@link errorResult}. */
export type ErrorResultData = { error: string }

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

/**
 * Build a standard `ToolResult` from a plain string output.
 *
 * The string is stored in `data.content` and forwarded as-is in
 * `mapToolResultToToolResultBlockParam`.
 */
export function textResult(output: string): ToolResult<TextResultData> {
  return {
    data: { content: output },
  }
}

/**
 * Build a `ToolResult` that includes a file path alongside content.
 *
 * Useful for tools that read or generate a single file --- the path can be
 * surfaced in UI rendering while the content goes to the model.
 */
export function fileResult(
  filePath: string,
  content: string,
): ToolResult<FileResultData> {
  return {
    data: { content, filePath },
  }
}

/**
 * Build an error `ToolResult`.
 *
 * The error string is stored in `data.error` and marked as `is_error: true`
 * in the tool result block so the model knows something went wrong.
 */
export function errorResult(error: string): ToolResult<ErrorResultData> {
  return {
    data: { error },
  }
}
