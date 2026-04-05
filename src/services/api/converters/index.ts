/**
 * Converters between the internal message format and provider SDK types.
 *
 * Usage:
 *   import { anthropicMessageToInternal, internalToAiSdkMessages } from './converters/index.js'
 */
export {
  // Anthropic -> Internal
  anthropicMessageToInternal,
  anthropicContentBlockToInternalPart,
  anthropicStreamEventToInternal,
  anthropicUsageToInternal,
  anthropicStopReasonToInternal,
  // Internal -> Anthropic
  internalToAnthropicMessages,
  internalPartToAnthropicContentBlock,
  internalToolResultToAnthropic,
  internalUsageToAnthropic,
  internalFinishReasonToAnthropic,
} from './anthropic.js'

export {
  // AI SDK -> Internal
  aiSdkToInternalMessages,
  aiSdkStreamPartToInternal,
  aiSdkUsageToInternal,
  aiSdkFinishReasonToInternal,
  // Internal -> AI SDK
  internalToAiSdkMessages,
  internalUsageToAiSdk,
  internalFinishReasonToAiSdk,
} from './ai-sdk.js'
