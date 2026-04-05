# AI SDK Migration Status

Last updated: 2026-04-04

## Overview

Noble Base Code is migrating from Anthropic-SDK-coupled message types to
provider-neutral internal types, enabling multi-model support through the
Vercel AI SDK abstraction layer.

---

## Completed Phases

### Phase 0: Internal Type Definitions
- **File**: `src/types/internal-messages.ts`
- Provider-neutral message types: `InternalMessage`, `InternalAssistantMessage`,
  `InternalUserMessage`, `InternalToolMessage`, `InternalSystemMessage`
- Content parts: `InternalTextPart`, `InternalReasoningPart`,
  `InternalToolCallPart`, `InternalToolResultPart`, `InternalImagePart`,
  `InternalFilePart`, `InternalConnectorTextPart`
- Streaming: `InternalStreamPart` (text, reasoning, tool-input, tool-call,
  step-finish, finish, error)
- Usage & finish: `InternalUsage`, `InternalFinishReason`
- Provider pass-through: `InternalProviderOptions`
- Helper functions: `isAssistantMessage`, `isUserMessage`, `isToolMessage`,
  `isSystemMessage`, `getToolCalls`, `getTextContent`, `hasToolCalls`,
  `textOutput`, `errorOutput`, `deniedOutput`

### Phase 1: Anthropic Converter
- **File**: `src/services/api/converters/anthropic.ts`
- `anthropicMessageToInternal()` -- Anthropic MessageParam -> InternalMessage[]
- `internalToAnthropicMessages()` -- InternalMessage[] -> Anthropic MessageParam[]
- `anthropicContentBlockToInternalPart()` -- single block conversion
- `internalPartToAnthropicContentBlock()` -- reverse single block
- `internalToolResultToAnthropic()` -- tool result part -> BetaToolResultBlockParam
- `anthropicStreamEventToInternal()` -- stream event conversion
- `anthropicUsageToInternal()` / `internalUsageToAnthropic()` -- usage conversion
- `anthropicStopReasonToInternal()` / `internalFinishReasonToAnthropic()` -- finish reason mapping
- Handles structural differences: tool_result in user messages, type discriminator
  translation (underscores <-> hyphens), field name mapping, thinking/redacted_thinking

### Phase 2: AI SDK Converter
- **File**: `src/services/api/converters/ai-sdk.ts`
- `internalToAiSdkMessages()` / `aiSdkToInternalMessages()` -- full message conversion
- `aiSdkStreamPartToInternal()` -- stream part conversion
- `aiSdkUsageToInternal()` / `internalUsageToAiSdk()` -- usage conversion
- `aiSdkFinishReasonToInternal()` / `internalFinishReasonToAiSdk()` -- finish reason
- Handles: separate tool role, Anthropic-specific stripping (connector_text, redacted_thinking)

### Phase 3: Barrel Export
- **File**: `src/services/api/converters/index.ts`
- Re-exports all public functions from both converters

### Phase 4: Tool Block Compatibility Layer
- **File**: `src/utils/toolBlockCompat.ts`
- `isToolCallBlock(block)` -- detects `tool_use` or `tool-call`
- `isToolResultBlock(block)` -- detects `tool_result` or `tool-result`
- `getToolCallId(block)` -- reads `id` or `toolCallId`
- `getToolName(block)` -- reads `name` or `toolName`
- `getToolInput(block)` -- reads `input` (same field name in both formats)
- `getToolUseId(block)` -- reads `tool_use_id` or `toolCallId`
- `isToolResultError(block)` -- checks `is_error` or output type

### Phase 5: Supporting Systems (imports + TODO markers)

Compat helpers imported and TODO markers placed in:

| Module | File | What was added |
|--------|------|----------------|
| Microcompact | `src/services/compact/microCompact.ts` | Imported `isToolResultBlock`, `getToolUseId`; 5 TODOs at tool_result/tool_use type checks |
| MCP client | `src/services/mcp/client.ts` | Imported all compat helpers; 3 TODOs at ContentBlockParam return types |
| Classifier shared | `src/utils/permissions/classifierShared.ts` | Imported `isToolCallBlock`, `getToolName`, `getToolInput`; 1 TODO at extractToolUseBlock |
| YOLO classifier | `src/utils/permissions/yoloClassifier.ts` | Imported `isToolCallBlock`, `getToolName`, `getToolInput`; 3 TODOs at type-check sites |
| Permission explainer | `src/utils/permissions/permissionExplainer.ts` | Imported `isToolCallBlock`, `getToolName`, `getToolInput`; 1 TODO at tool_use check |
| Bridge inbound messages | `src/bridge/inboundMessages.ts` | Imported `isToolResultBlock`, `getToolUseId`; 1 TODO about internal types |
| Bridge inbound attachments | `src/bridge/inboundAttachments.ts` | Imported `isToolResultBlock`; 1 TODO about internal types |
| Bridge session runner | `src/bridge/sessionRunner.ts` | Imported `isToolCallBlock`, `getToolName`, `getToolInput`; 1 TODO at tool_use check |

---

## TODO Inventory

All `TODO(ai-sdk-migration)` markers have been resolved (61 markers across 25 files).
Compat helpers from `src/utils/toolBlockCompat.ts` are now used consistently.

---

## What's Left (Future Phases)

### Phase 7: Core Query Loop
- `src/query.ts` -- the main query loop assembles messages for the API;
  needs to produce InternalMessage[] and use converters at the provider boundary.
- `src/services/api/claude.ts` -- the Anthropic API call site; should accept
  InternalMessage[] and convert just before sending.

### Phase 8: Tool Execution
- `src/Tool.ts`, individual tool files -- tool call/result handling should
  use InternalToolCallPart / InternalToolResultPart.

### Phase 9: UI Components (COMPLETED)
- All message rendering components now use the compat helpers from `toolBlockCompat.ts`.

### Phase 10: Full Switch
- Remove Anthropic SDK type imports from all files except the converter.
- Remove compat helpers (no longer needed when everything is internal format).

---

## File Inventory

| File | Purpose |
|------|---------|
| `src/types/internal-messages.ts` | Provider-neutral type definitions |
| `src/utils/toolBlockCompat.ts` | Dual-format tool block helpers |
| `src/services/api/converters/anthropic.ts` | Anthropic <-> Internal converter |
| `src/services/api/converters/ai-sdk.ts` | AI SDK <-> Internal converter |
| `src/services/api/converters/index.ts` | Barrel re-export |
| `src/services/api/converters/MIGRATION_STATUS.md` | This file |
