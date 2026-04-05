/**
 * Framework-level auto-truncation for tool results.
 *
 * When a tool's output exceeds a character budget the full text is persisted to
 * a temp file and a truncated version (first 40% + last 40%, joined by a
 * marker) is returned to the LLM.  The marker includes the path to the full
 * file so the model can read it if it needs the elided section.
 *
 * ## Integration point
 *
 * This utility is designed to be called from
 * `src/services/tools/toolExecution.ts` after `tool.call()` returns its result
 * (around line 1207-1222) and before `mapToolResultToToolResultBlockParam`
 * (around line 1292). Specifically, if the stringified `result.data` exceeds
 * `tool.maxResultSizeChars`, call `truncateToolOutput()` on the string content
 * and replace the relevant field in `result.data` before it is mapped to the
 * API block format.
 *
 * The existing persistence pipeline in `src/utils/toolResultStorage.ts`
 * (`processToolResultBlock` / `maybePersistLargeToolResult`) operates on the
 * *mapped* `ToolResultBlockParam` and saves the full output to a session-local
 * directory. This truncation utility is complementary: it operates earlier in
 * the pipeline on the raw tool output string, uses `os.tmpdir()` for storage,
 * and preserves both the head and tail of the output (rather than just a
 * head-only preview). To hook it in, apply truncation to the text content of
 * `result.data` before the existing persistence check runs, so the persistence
 * layer sees an already-right-sized result and passes it through.
 */

import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface TruncationResult {
  /** The (possibly truncated) content to send to the LLM */
  content: string
  /** Whether truncation was applied */
  wasTruncated: boolean
  /** Path to full output file if truncated, undefined otherwise */
  fullOutputPath?: string
  /** Original size in characters */
  originalSize: number
}

/**
 * Truncate tool output if it exceeds maxChars.
 *
 * Saves full output to a temp file and returns a truncated version with a
 * reference to the full file.
 *
 * Truncation strategy: keep first 40 % and last 40 % of the output (by
 * character count) and insert a marker in between that tells the model how
 * many characters were elided and where the full output lives.
 *
 * The cut-points are nudged forward/backward to the nearest newline (within a
 * small window) so we don't slice a line in half, and they are also validated
 * against surrogate pairs so we never split a multi-byte UTF-16 character.
 */
export function truncateToolOutput(
  output: string,
  maxChars: number,
  toolName: string,
): TruncationResult {
  const originalSize = output.length

  // --- No truncation needed ---
  if (originalSize <= maxChars) {
    return {
      content: output,
      wasTruncated: false,
      originalSize,
    }
  }

  // --- Persist full output to a temp file ---
  const timestamp = Date.now()
  const sanitized = toolName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `nbcode-${sanitized}-${timestamp}.txt`
  const fullOutputPath = join(tmpdir(), filename)

  writeFileSync(fullOutputPath, output, { encoding: 'utf-8', mode: 0o644 })

  // --- Build the truncated version ---
  //
  // We want head = first 40% of maxChars, tail = last 40% of maxChars.  The
  // remaining 20% is "budget" for the marker itself (usually a few hundred
  // chars at most, but the budget keeps the final string under maxChars even
  // in edge cases).
  const headBudget = Math.floor(maxChars * 0.4)
  const tailBudget = Math.floor(maxChars * 0.4)

  const headEnd = safeSlicePoint(output, headBudget, 'forward')
  const tailStart = safeSlicePoint(output, originalSize - tailBudget, 'backward')

  const elided = tailStart - headEnd
  const marker =
    `\n\n[... ${elided} characters truncated. Full output saved to: ${fullOutputPath} ...]\n\n`

  const content = output.slice(0, headEnd) + marker + output.slice(tailStart)

  return {
    content,
    wasTruncated: true,
    fullOutputPath,
    originalSize,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Adjust `index` so it doesn't land on a lone UTF-16 surrogate (which would
 * produce invalid output) and, when possible, snaps to a nearby newline so
 * we don't cut a line in half.
 *
 * `direction`:
 *   - `'forward'`  — we're looking for the HEAD end; prefer to shorten.
 *   - `'backward'` — we're looking for the TAIL start; prefer to lengthen.
 */
function safeSlicePoint(
  str: string,
  index: number,
  direction: 'forward' | 'backward',
): number {
  // Clamp to valid range.
  index = Math.max(0, Math.min(index, str.length))

  // Avoid splitting a surrogate pair.  High surrogates are 0xD800..0xDBFF.
  if (index > 0 && index < str.length) {
    const code = str.charCodeAt(index)
    // If we landed on a low surrogate (0xDC00-0xDFFF), step back one so the
    // high surrogate stays with its pair.
    if (code >= 0xdc00 && code <= 0xdfff) {
      index--
    }
  }

  // Try to snap to a newline within a small window (512 chars) so we get a
  // clean line boundary.
  const SNAP_WINDOW = 512
  if (direction === 'forward') {
    // For the head-end, look backwards for a newline.
    const search = str.lastIndexOf('\n', index)
    if (search !== -1 && index - search <= SNAP_WINDOW) {
      return search + 1 // include the newline in the head
    }
  } else {
    // For the tail-start, look forwards for a newline.
    const search = str.indexOf('\n', index)
    if (search !== -1 && search - index <= SNAP_WINDOW) {
      return search + 1 // start after the newline
    }
  }

  return index
}
