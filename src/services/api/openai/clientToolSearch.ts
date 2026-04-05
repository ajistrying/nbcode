/**
 * Client-side tool search for OpenAI-compatible providers.
 *
 * Replicates the ToolSearchTool functionality that Anthropic provides server-side
 * via defer_loading and tool_reference blocks. For open models, we implement
 * the same pattern client-side: partition tools into always-loaded and deferred,
 * inject a synthetic ToolSearch function, and do keyword matching when the model
 * invokes it.
 */
import { isDeferredTool } from '../../../tools/ToolSearchTool/prompt.js'
import type { Tool, Tools } from '../../../Tool.js'

export interface ClientToolSearchState {
  /** Deferred tools keyed by name, with cached description */
  deferredTools: Map<string, { tool: Tool; description: string }>
  /** Tools the model has discovered this session via ToolSearch calls */
  discoveredToolNames: Set<string>
  /** Non-deferred tools (always available) */
  alwaysLoadedTools: Tools
}

/**
 * Initialize client tool search state by partitioning all tools into
 * always-loaded and deferred sets.
 */
export async function initClientToolSearch(
  allTools: Tools,
): Promise<ClientToolSearchState> {
  const deferredTools = new Map<string, { tool: Tool; description: string }>()
  const alwaysLoadedTools: Tool[] = []

  for (const tool of allTools) {
    // Skip the Anthropic ToolSearchTool itself — we replace it with our own
    if (tool.name === 'ToolSearch') continue

    if (isDeferredTool(tool)) {
      // Use the tool name as description — tool.prompt() requires context
      // args (getToolPermissionContext, tools, agents) that we don't have here.
      // The name is sufficient for keyword matching.
      deferredTools.set(tool.name, { tool, description: tool.name })
    } else {
      alwaysLoadedTools.push(tool)
    }
  }

  return {
    deferredTools,
    discoveredToolNames: new Set(),
    alwaysLoadedTools,
  }
}

/**
 * Get the tools to send in the current API request.
 * Returns always-loaded tools + previously discovered tools.
 * Does NOT include the deferred tools that haven't been discovered yet.
 */
export function getToolsForQuery(state: ClientToolSearchState): Tools {
  const tools: Tool[] = [...state.alwaysLoadedTools]

  // Add previously discovered tools back into the active set
  for (const name of state.discoveredToolNames) {
    const deferred = state.deferredTools.get(name)
    if (deferred) {
      tools.push(deferred.tool)
    }
  }

  return tools
}

/**
 * Build the synthetic ToolSearch tool schema in OpenAI function format.
 * Returns null if there are no deferred tools to search.
 */
export function buildSyntheticToolSearchSchema(
  state: ClientToolSearchState,
): object | null {
  if (state.deferredTools.size === 0) return null

  // Build a list of available deferred tool names for the description
  const deferredNames = Array.from(state.deferredTools.keys())
  const toolListHint =
    deferredNames.length <= 20
      ? `\n\nAvailable deferred tools: ${deferredNames.join(', ')}`
      : `\n\n${deferredNames.length} deferred tools available.`

  return {
    type: 'function',
    function: {
      name: 'ToolSearch',
      description:
        `Fetches full schema definitions for deferred tools so they can be called.\n\n` +
        `Deferred tools appear by name in <system-reminder> messages. Until fetched, ` +
        `only the name is known — there is no parameter schema, so the tool cannot be invoked. ` +
        `This tool takes a query, matches it against the deferred tool list, and returns the ` +
        `matched tools' complete definitions.\n\n` +
        `Query forms:\n` +
        `- "select:Read,Edit,Grep" — fetch these exact tools by name\n` +
        `- "notebook jupyter" — keyword search, up to max_results best matches\n` +
        `- "+slack send" — require first term in the name, rank by remaining terms` +
        toolListHint,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search.',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
            default: 5,
          },
        },
        required: ['query'],
      },
    },
  }
}

/**
 * Execute a tool search query against the deferred tools.
 * Supports the same query syntax as Anthropic's ToolSearchTool:
 * - "select:Read,Edit,Grep" — exact name matching
 * - "keyword1 keyword2" — keyword search
 * - "+required keyword" — require first term in name
 */
export async function executeToolSearch(
  state: ClientToolSearchState,
  query: string,
  maxResults: number = 5,
): Promise<{ names: string[]; resultText: string }> {
  const trimmedQuery = query.trim()

  let matchedNames: string[]

  if (trimmedQuery.startsWith('select:')) {
    // Exact name selection: "select:Read,Edit,Grep"
    const requestedNames = trimmedQuery
      .slice(7)
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    matchedNames = requestedNames.filter((n) => state.deferredTools.has(n))
  } else {
    // Keyword search
    matchedNames = keywordSearch(state, trimmedQuery, maxResults)
  }

  if (matchedNames.length === 0) {
    return {
      names: [],
      resultText: `No deferred tools matched query "${trimmedQuery}". Available: ${Array.from(state.deferredTools.keys()).join(', ')}`,
    }
  }

  // Build result text with tool schemas
  const schemaLines: string[] = []
  for (const name of matchedNames) {
    const entry = state.deferredTools.get(name)
    if (!entry) continue

    const tool = entry.tool
    const inputSchema = tool.inputJSONSchema ?? { type: 'object', properties: {} }
    schemaLines.push(
      `<function>${JSON.stringify({
        name: tool.name,
        description: entry.description.slice(0, 500),
        parameters: inputSchema,
      })}</function>`,
    )
  }

  return {
    names: matchedNames,
    resultText: `<functions>\n${schemaLines.join('\n')}\n</functions>`,
  }
}

/**
 * Mark tools as discovered so they're included in future queries.
 */
export function markDiscovered(
  state: ClientToolSearchState,
  names: string[],
): void {
  for (const name of names) {
    if (state.deferredTools.has(name)) {
      state.discoveredToolNames.add(name)
    }
  }
}

/**
 * Check if tool search is needed (there are deferred tools that haven't
 * all been discovered yet).
 */
export function hasUndiscoveredTools(state: ClientToolSearchState): boolean {
  for (const name of state.deferredTools.keys()) {
    if (!state.discoveredToolNames.has(name)) return true
  }
  return false
}

// ── Internal: Keyword Search ──────────────────────────────────

interface ScoredMatch {
  name: string
  score: number
}

function keywordSearch(
  state: ClientToolSearchState,
  query: string,
  maxResults: number,
): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  // Check for "+required" prefix — first term must appear in the name
  let requiredInName: string | null = null
  let searchTerms = terms
  if (terms[0]!.startsWith('+')) {
    requiredInName = terms[0]!.slice(1)
    searchTerms = terms.slice(1)
  }

  const scored: ScoredMatch[] = []

  for (const [name, entry] of state.deferredTools) {
    const nameLower = name.toLowerCase()
    const descLower = entry.description.toLowerCase()

    // Apply required-in-name filter
    if (requiredInName && !nameLower.includes(requiredInName)) continue

    let score = 0

    // Exact name match
    if (searchTerms.some((t) => nameLower === t)) {
      score += 100
    }

    // Name prefix match
    if (searchTerms.some((t) => nameLower.startsWith(t))) {
      score += 50
    }

    // Name substring match
    for (const term of searchTerms) {
      if (nameLower.includes(term)) score += 20
      if (descLower.includes(term)) score += 5
    }

    // Required term bonus (it matched since we didn't continue above)
    if (requiredInName) score += 30

    if (score > 0) {
      scored.push({ name, score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((m) => m.name)
}
