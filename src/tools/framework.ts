/**
 * SimpleTool helper for defining new tools with minimal boilerplate.
 *
 * The full `Tool` interface (see `src/Tool.ts`) has ~30 methods. Most tools
 * only need a handful. `defineSimpleTool()` accepts a small config object and
 * returns a complete `Tool` (via `buildTool`) with sensible defaults for
 * everything the config doesn't specify.
 *
 * Existing tools are completely unaffected --- this is an additive helper
 * that new tool authors can opt into.
 *
 * @example
 * ```ts
 * import { z } from 'zod/v4'
 * import { defineSimpleTool } from '../tools/framework.js'
 *
 * export const MyTool = defineSimpleTool({
 *   name: 'MyTool',
 *   description: 'Does something useful',
 *   parameters: z.strictObject({ path: z.string() }),
 *   isReadOnly: true,
 *   async execute({ path }, { cwd }) {
 *     return `Processed ${path} in ${cwd}`
 *   },
 * })
 * ```
 */

import type { z } from 'zod/v4'
import {
  buildTool,
  type AnyObject,
  type Tool,
  type ToolResult,
  type ToolUseContext,
} from '../Tool.js'
import type { PermissionResult } from '../types/permissions.js'
import { getCwd } from '../utils/cwd.js'
import { getFsImplementation } from '../utils/fsOperations.js'
import { textResult, errorResult, type TextResultData, type ErrorResultData } from './renderer.js'

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

/**
 * Minimal context passed to the `execute` callback.
 *
 * Intentionally a tiny subset of `ToolUseContext` so that simple tools don't
 * need to know about the full context machinery.
 */
export interface SimpleToolExecuteContext {
  /** Current working directory for this tool invocation. */
  cwd: string
  /** Abort signal --- tools should check this for cancellation. */
  abortSignal: AbortSignal
  /** Convenience: read a file from the filesystem. */
  readFile: (path: string) => Promise<string>
}

/**
 * Configuration accepted by {@link defineSimpleTool}.
 *
 * @typeParam P  A Zod schema whose inferred type is the tool's input shape.
 *               Must parse to an object (`{ [key: string]: unknown }`).
 */
export interface SimpleToolConfig<P extends AnyObject> {
  /** Primary tool name (must be unique across all tools). */
  name: string
  /** One-line description shown to the model and in help text. */
  description: string
  /** Zod schema describing the tool's parameters. */
  parameters: P
  /** Whether the tool only reads data (default: `true`). */
  isReadOnly?: boolean
  /** Whether the tool can run concurrently with other tools (default: `true`). */
  isConcurrencySafe?: boolean
  /** Max chars before tool result is persisted to disk (default: `100_000`). */
  maxResultSizeChars?: number
  /** Alternative names this tool can be looked up by. */
  aliases?: string[]
  /** Short keyword hint for ToolSearch matching. */
  searchHint?: string

  /**
   * Check whether the tool is allowed to run.
   *
   * Return `null` (or `undefined`) if the tool is permitted, or an error
   * string describing why it is not.
   *
   * When omitted the tool is always allowed (delegates to the general
   * permission system via `buildTool` defaults).
   */
  checkPermission?: (
    input: z.infer<P>,
    cwd: string,
  ) => Promise<string | null>

  /**
   * Execute the tool. Return the output string that the model will see.
   *
   * Throwing an `Error` is allowed --- the framework catches it and converts
   * it into an error tool result.
   */
  execute: (
    input: z.infer<P>,
    context: SimpleToolExecuteContext,
  ) => Promise<string>

  /**
   * Short present-tense activity description for spinner display.
   * Example: `"Reading src/foo.ts"`, `"Searching for pattern"`.
   */
  activityDescription?: (input: Partial<z.infer<P>>) => string | null

  /**
   * Short summary for compact UI views.
   * Example: `"*.ts"`, `"src/foo.ts:42"`.
   */
  summary?: (input: Partial<z.infer<P>>) => string | null
}

// ---------------------------------------------------------------------------
// defineSimpleTool
// ---------------------------------------------------------------------------

/**
 * Create a full `Tool` object from a simplified configuration.
 *
 * The returned tool satisfies the complete `Tool` interface (via `buildTool`)
 * and can be used anywhere an existing tool would be used.
 */
export function defineSimpleTool<P extends AnyObject>(
  config: SimpleToolConfig<P>,
): Tool<P, TextResultData | ErrorResultData> {
  const {
    name,
    description,
    parameters,
    isReadOnly: readOnly = true,
    isConcurrencySafe: concSafe = true,
    maxResultSizeChars = 100_000,
    aliases,
    searchHint,
    checkPermission,
    execute,
    activityDescription,
    summary,
  } = config

  return buildTool({
    name,
    ...(aliases ? { aliases } : {}),
    ...(searchHint ? { searchHint } : {}),
    maxResultSizeChars,

    get inputSchema(): P {
      return parameters
    },

    // ------------------------------------------------------------------
    // Metadata
    // ------------------------------------------------------------------

    async description() {
      return description
    },

    async prompt() {
      return description
    },

    isEnabled() {
      return true
    },

    isReadOnly() {
      return readOnly
    },

    isConcurrencySafe() {
      return concSafe
    },

    userFacingName() {
      return name
    },

    toAutoClassifierInput(input: z.infer<P>) {
      // Provide a simple JSON representation for the classifier.
      try {
        return JSON.stringify(input)
      } catch {
        return ''
      }
    },

    // ------------------------------------------------------------------
    // Optional UI helpers
    // ------------------------------------------------------------------

    ...(activityDescription
      ? { getActivityDescription: activityDescription }
      : {}),

    ...(summary ? { getToolUseSummary: summary } : {}),

    // ------------------------------------------------------------------
    // Rendering (minimal defaults)
    // ------------------------------------------------------------------

    renderToolUseMessage(
      input: Partial<z.infer<P>>,
      _options: { theme: string; verbose: boolean },
    ) {
      // Minimal: return null so the default rendering path is used.
      return null
    },

    mapToolResultToToolResultBlockParam(
      output: TextResultData | ErrorResultData,
      toolUseID: string,
    ) {
      if ('error' in output) {
        return {
          tool_use_id: toolUseID,
          type: 'tool_result' as const,
          is_error: true,
          content: output.error,
        }
      }
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: output.content,
      }
    },

    // ------------------------------------------------------------------
    // Permissions
    // ------------------------------------------------------------------

    async checkPermissions(
      input: z.infer<P>,
      _context: ToolUseContext,
    ): Promise<PermissionResult> {
      if (!checkPermission) {
        // Delegate to the general permission system (allow by default).
        return { behavior: 'allow', updatedInput: input }
      }

      const cwd = getCwd()
      const errorMessage = await checkPermission(input, cwd)

      if (errorMessage) {
        return {
          behavior: 'ask',
          message: errorMessage,
        }
      }

      return { behavior: 'allow', updatedInput: input }
    },

    // ------------------------------------------------------------------
    // Execution
    // ------------------------------------------------------------------

    async call(
      input: z.infer<P>,
      context: ToolUseContext,
    ): Promise<ToolResult<TextResultData | ErrorResultData>> {
      const cwd = getCwd()
      const fs = getFsImplementation()

      const simpleContext: SimpleToolExecuteContext = {
        cwd,
        abortSignal: context.abortController.signal,
        readFile: (path: string) => fs.readFile(path, { encoding: 'utf-8' }),
      }

      try {
        const output = await execute(input, simpleContext)
        return textResult(output)
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err)
        return errorResult(message)
      }
    },
  })
}
