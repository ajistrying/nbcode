import { randomUUID } from 'crypto'
import { queryModelWithStreaming } from '../services/api/claude.js'
import { adaptedQueryModelWithStreaming } from '../services/api/streamAdapter.js'
import { autoCompactIfNeeded } from '../services/compact/autoCompact.js'
import { microcompactMessages } from '../services/compact/microCompact.js'
import { getAPIProvider } from '../utils/model/providers.js'

// -- deps

// I/O dependencies for query(). Passing a `deps` override into QueryParams
// lets tests inject fakes directly instead of spyOn-per-module — the most
// common mocks (callModel, autocompact) are each spied in 6-8 test files
// today with module-import-and-spy boilerplate.
//
// Using `typeof fn` keeps signatures in sync with the real implementations
// automatically. This file imports the real functions for both typing and
// the production factory — tests that import this file for typing are
// already importing query.ts (which imports everything), so there's no
// new module-graph cost.
//
// Scope is intentionally narrow (4 deps) to prove the pattern. Followup
// PRs can add runTools, handleStopHooks, logEvent, queue ops, etc.
export type QueryDeps = {
  // -- model
  callModel: typeof queryModelWithStreaming

  // -- model (adapted, dual-emit: legacy + InternalStreamPart)
  // Optional so existing call sites and tests are unaffected.
  // New consumers can use this to read InternalStreamPart events
  // while the legacy path continues to work via callModel.
  callModelAdapted?: typeof adaptedQueryModelWithStreaming

  // -- compaction
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded

  // -- platform
  uuid: () => string
}

export async function productionDeps(): Promise<QueryDeps> {
  let callModel: typeof queryModelWithStreaming = queryModelWithStreaming
  if (getAPIProvider() === 'openai_compatible') {
    const { queryModelOpenAIWithStreaming } = await import(
      '../services/api/openai/aiSdkAdapter.js'
    )
    callModel = queryModelOpenAIWithStreaming
  }
  return {
    callModel,
    callModelAdapted: adaptedQueryModelWithStreaming,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
