/**
 * Compatibility helpers for tool blocks that may be in either
 * Anthropic format (tool_use/tool_result) or internal format (tool-call/tool-result).
 *
 * UI components use these to render tool blocks without knowing which format they're in.
 */

/** Check if a content block is a tool call (either format). */
export function isToolCallBlock(block: { type: string }): boolean {
  return block.type === 'tool_use' || block.type === 'tool-call'
}

/** Check if a content block is a tool result (either format). */
export function isToolResultBlock(block: { type: string }): boolean {
  return block.type === 'tool_result' || block.type === 'tool-result'
}

/** Get the tool call ID from either format. */
export function getToolCallId(block: Record<string, unknown>): string {
  return (block.toolCallId ?? block.id ?? '') as string
}

/** Get the tool name from either format. */
export function getToolName(block: Record<string, unknown>): string {
  return (block.toolName ?? block.name ?? '') as string
}

/** Get the tool input from either format. */
export function getToolInput(block: Record<string, unknown>): unknown {
  return block.input
}

/** Get the tool_use_id for linking results to calls (either format). */
export function getToolUseId(block: Record<string, unknown>): string {
  return (block.tool_use_id ?? block.toolCallId ?? '') as string
}

/** Check if a tool result is an error (either format). */
export function isToolResultError(block: Record<string, unknown>): boolean {
  if (block.is_error) return true
  const output = block.output as { type?: string } | undefined
  return output?.type === 'error' || output?.type === 'denied'
}
