/**
 * Keyboard / input-submit decision logic extracted from REPL.tsx.
 *
 * Pure functions — no React imports. These capture the DECISION layer:
 * what should happen when the user presses Enter, not the side-effects
 * (clearing input, setting state, etc.) that implement the decision.
 *
 * The onSubmit callback in REPL.tsx (~L3145-L3548) mixes classification
 * logic with React state mutations. The functions here isolate the
 * classification so it can be tested and reused independently.
 */

import type { Command } from '../../types/command.js'
import {
  getCommandName,
  isCommandEnabled,
} from '../../types/command.js'
import type { PromptInputMode } from '../../types/textInputTypes.js'

// ═══════════════════════════════════════════════════════════════════
// Slash command parsing
// ═══════════════════════════════════════════════════════════════════

export type ParsedSlashCommand = {
  /** The matched command definition. */
  command: Command
  /** Everything after the command name, trimmed. */
  args: string
  /** The raw command name the user typed (without leading `/`). */
  rawName: string
}

/**
 * Parse a slash command from input. Returns null if the input does not
 * start with `/` or no matching command is found.
 *
 * Mirrors the matching logic at REPL.tsx ~L3169-L3176 and
 * handlePromptSubmit.ts ~L229-L246.
 */
export function parseSlashCommand(
  input: string,
  commands: ReadonlyArray<Command>,
): ParsedSlashCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  const spaceIndex = trimmed.indexOf(' ')
  const commandName =
    spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex)
  const commandArgs =
    spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim()

  const matchingCommand = commands.find(
    (cmd) =>
      isCommandEnabled(cmd) &&
      (cmd.name === commandName ||
        cmd.aliases?.includes(commandName) ||
        getCommandName(cmd) === commandName),
  )

  if (!matchingCommand) return null

  return {
    command: matchingCommand,
    args: commandArgs,
    rawName: commandName,
  }
}

// ═══════════════════════════════════════════════════════════════════
// Idle-return detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Configuration for idle-return checks, gathered from environment
 * variables and feature flags by the caller.
 */
export type IdleReturnConfig = {
  /** Feature flag value: 'off' | 'dialog' | 'hint' | 'hint_v2'. */
  willowMode: string
  /** Whether the user has globally dismissed idle-return prompts. */
  idleReturnDismissed: boolean
  /** Whether the current check has been skipped (e.g. after /clear). */
  skipIdleCheck: boolean
  /** Minutes of idle time before the dialog triggers. */
  idleThresholdMinutes: number
  /** Minimum input tokens before idle-return is considered. */
  tokenThreshold: number
}

/**
 * Determine whether the session should show an idle-return dialog.
 *
 * Returns the number of idle minutes if the dialog should trigger,
 * or `null` if the check doesn't apply.
 *
 * Mirrors the idle-return block at REPL.tsx ~L3292-L3313.
 */
export function shouldShowIdleReturnDialog(
  config: IdleReturnConfig,
  lastQueryCompletionMs: number,
  currentTotalInputTokens: number,
  nowMs: number,
): number | null {
  if (config.willowMode === 'off') return null
  if (config.willowMode !== 'dialog') return null
  if (config.idleReturnDismissed) return null
  if (config.skipIdleCheck) return null
  if (lastQueryCompletionMs <= 0) return null
  if (currentTotalInputTokens < config.tokenThreshold) return null

  const idleMs = nowMs - lastQueryCompletionMs
  const idleMinutes = idleMs / 60_000

  if (idleMinutes >= config.idleThresholdMinutes) {
    return idleMinutes
  }

  return null
}

/**
 * Determine if the session is idle and should auto-return.
 *
 * A simpler variant used for the notification-based hint path.
 * Unlike `shouldShowIdleReturnDialog`, this doesn't gate on
 * willowMode === 'dialog' — it just checks the time/token thresholds.
 */
export function shouldIdleReturn(
  lastActivityMs: number,
  idleThresholdMs: number,
  isQueryActive: boolean,
): boolean {
  if (isQueryActive) return false
  if (lastActivityMs <= 0) return false
  return Date.now() - lastActivityMs >= idleThresholdMs
}

// ═══════════════════════════════════════════════════════════════════
// Submit classification
// ═══════════════════════════════════════════════════════════════════

/**
 * All possible outcomes when the user submits input.
 */
export type SubmitAction =
  | {
      type: 'immediate-command'
      command: Command
      args: string
      rawName: string
    }
  | {
      type: 'idle-return'
      idleMinutes: number
    }
  | {
      type: 'speculation-accept'
    }
  | {
      type: 'remote-send'
    }
  | {
      type: 'query'
      /** Whether the input is a slash command (affects history, placeholder). */
      isSlashCommand: boolean
    }
  | {
      type: 'empty'
    }

/**
 * Context the classifier needs to make its decision. The caller
 * (REPL.tsx onSubmit) gathers these from various React state / refs.
 */
export type SubmitContext = {
  /** Current input mode (prompt, bash, etc.). */
  inputMode: PromptInputMode
  /** Available commands to match against. */
  commands: ReadonlyArray<Command>
  /** Whether a query is actively in progress (queryGuard.isActive). */
  isQueryActive: boolean
  /** Whether a speculation is being accepted. */
  hasSpeculation: boolean
  /** Whether we're in remote mode (CCR/SSH). */
  isRemoteMode: boolean
  /** Whether this submit was triggered by a keybinding. */
  fromKeybinding: boolean
  /** Idle-return configuration. */
  idleReturn: IdleReturnConfig
  /** Timestamp of the last query completion (0 = never). */
  lastQueryCompletionMs: number
  /** Total input tokens consumed so far. */
  totalInputTokens: number
}

/**
 * Classify what should happen when the user submits input.
 *
 * This extracts the branching decision tree from onSubmit (~L3145-L3540)
 * into a pure function that returns a discriminated union. The caller
 * can then switch on `action.type` to perform the appropriate
 * side-effects (clearing input, setting state, queuing, etc.).
 *
 * Note: This function does NOT handle the queuing path (when isLoading
 * and the input should be enqueued). That logic lives in
 * handlePromptSubmit.ts and runs after the classification. Here we only
 * classify the "what kind of submit is this?" question.
 */
export function classifySubmit(
  input: string,
  context: SubmitContext,
): SubmitAction {
  const trimmed = input.trim()

  // Empty input
  if (!trimmed) {
    return { type: 'empty' }
  }

  // Speculation acceptance takes priority
  if (context.hasSpeculation) {
    return { type: 'speculation-accept' }
  }

  // Immediate command: slash command that should execute right away
  // even while a query is active (e.g. /compact, /config, /cost).
  if (trimmed.startsWith('/')) {
    const parsed = parseSlashCommand(trimmed, context.commands)
    if (parsed) {
      const shouldTreatAsImmediate =
        context.isQueryActive &&
        (parsed.command.immediate || context.fromKeybinding)
      if (
        shouldTreatAsImmediate &&
        parsed.command.type === 'local-jsx'
      ) {
        return {
          type: 'immediate-command',
          command: parsed.command,
          args: parsed.args,
          rawName: parsed.rawName,
        }
      }
    }
  }

  // Idle-return dialog check (only for non-slash, non-speculation inputs)
  if (!trimmed.startsWith('/') && !context.hasSpeculation) {
    const idleMinutes = shouldShowIdleReturnDialog(
      context.idleReturn,
      context.lastQueryCompletionMs,
      context.totalInputTokens,
      Date.now(),
    )
    if (idleMinutes !== null) {
      return { type: 'idle-return', idleMinutes }
    }
  }

  // Remote mode: send to remote (unless it's a local-jsx command)
  if (context.isRemoteMode) {
    const parsed = parseSlashCommand(trimmed, context.commands)
    if (parsed && parsed.command.type === 'local-jsx') {
      // Local-jsx commands fall through to query path for local execution
    } else {
      return { type: 'remote-send' }
    }
  }

  // Default: run as a query (may be a slash command, bash, or plain prompt)
  const isSlashCommand = trimmed.startsWith('/')
  return { type: 'query', isSlashCommand }
}

// ═══════════════════════════════════════════════════════════════════
// History helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Determine whether the submitted input should be added to history.
 *
 * From REPL.tsx ~L3316-L3328: skip history for keybinding-triggered
 * commands; otherwise always add.
 */
export function shouldAddToHistory(
  fromKeybinding: boolean,
): boolean {
  return !fromKeybinding
}

/**
 * Determine whether the submitted input should be prepended to the
 * shell history cache (for ghost-text completions).
 *
 * Only bash-mode inputs are added to the shell cache.
 * From REPL.tsx ~L3326-L3328.
 */
export function shouldPrependToShellHistory(
  inputMode: PromptInputMode,
): boolean {
  return inputMode === 'bash'
}

// ═══════════════════════════════════════════════════════════════════
// Input state helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Determine whether the placeholder text should be shown after submit.
 *
 * The placeholder bridges the gap between clearing the input and the
 * real user message appearing in the transcript. It's shown only for
 * non-slash, non-speculation, non-remote, prompt-mode inputs.
 *
 * From REPL.tsx ~L3371.
 */
export function shouldShowSubmitPlaceholder(
  isSlashCommand: boolean,
  inputMode: PromptInputMode,
  hasSpeculation: boolean,
  isRemoteMode: boolean,
): boolean {
  return (
    !isSlashCommand &&
    inputMode === 'prompt' &&
    !hasSpeculation &&
    !isRemoteMode
  )
}

/**
 * Determine whether a stashed prompt should be restored after submit.
 *
 * The stash holds the user's in-progress text when a command interrupted
 * it. It's restored after the command completes, but NOT for slash
 * commands (which may show pickers) or when loading (which clears input).
 *
 * From REPL.tsx ~L3331-L3360.
 */
export function shouldRestoreStash(
  hasStashedPrompt: boolean,
  isSlashCommand: boolean,
  submitsNow: boolean,
): boolean {
  return hasStashedPrompt && !isSlashCommand && submitsNow
}

/**
 * Determine whether the submit runs immediately (not queued).
 *
 * From REPL.tsx ~L3346.
 */
export function submitsImmediately(
  isLoading: boolean,
  hasSpeculation: boolean,
  isRemoteMode: boolean,
): boolean {
  return !isLoading || hasSpeculation || isRemoteMode
}
