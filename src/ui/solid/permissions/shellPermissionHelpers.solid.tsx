import type { JSX } from '@opentui/solid'
import { basename, sep } from 'path'
import { getOriginalCwd } from '../../../bootstrap/state.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import { permissionRuleExtractPrefix } from '../../../utils/permissions/shellRuleMatching.js'

function commandListDisplay(commands: string[]): JSX.Element {
  switch (commands.length) {
    case 0:
      return '' as unknown as JSX.Element
    case 1:
      return <text><b>{commands[0]}</b></text>
    case 2:
      return (
        <text>
          <text><b>{commands[0]}</b></text> and <text><b>{commands[1]}</b></text>
        </text>
      )
    default:
      return (
        <text>
          <text><b>{commands.slice(0, -1).join(', ')}</b></text>, and{' '}
          <text><b>{commands.slice(-1)[0]}</b></text>
        </text>
      )
  }
}

function commandListDisplayTruncated(commands: string[]): JSX.Element {
  // Check if the plain text representation would be too long
  const plainText = commands.join(', ')
  if (plainText.length > 50) {
    return 'similar' as unknown as JSX.Element
  }
  return commandListDisplay(commands)
}

function formatPathList(paths: string[]): JSX.Element {
  if (paths.length === 0) return '' as unknown as JSX.Element

  // Extract directory names from paths
  const names = paths.map(p => basename(p) || p)
  if (names.length === 1) {
    return (
      <text>
        <text><b>{names[0]}</b></text>
        {sep}
      </text>
    )
  }
  if (names.length === 2) {
    return (
      <text>
        <text><b>{names[0]}</b></text>
        {sep} and <text><b>{names[1]}</b></text>
        {sep}
      </text>
    )
  }

  // For 3+, show first two with "and N more"
  return (
    <text>
      <text><b>{names[0]}</b></text>
      {sep}, <text><b>{names[1]}</b></text>
      {sep} and {paths.length - 2} more
    </text>
  )
}

/**
 * Generate the label for the "Yes, and apply suggestions" option in shell
 * permission dialogs (Bash, PowerShell). Parametrized by the shell tool name
 * and an optional command transform (e.g., Bash strips output redirections so
 * filenames don't show as commands).
 */
export function generateShellSuggestionsLabel(
  suggestions: PermissionUpdate[],
  shellToolName: string,
  commandTransform?: (command: string) => string,
): JSX.Element | null {
  // Collect all rules for display
  const allRules = suggestions
    .filter(s => s.type === 'addRules')
    .flatMap(s => s.rules || [])

  // Separate Read rules from shell rules
  const readRules = allRules.filter(r => r.toolName === 'Read')
  const shellRules = allRules.filter(r => r.toolName === shellToolName)

  // Get directory info
  const directories = suggestions
    .filter(s => s.type === 'addDirectories')
    .flatMap(s => s.directories || [])

  // Extract paths from Read rules (keep separate from directories)
  const readPaths = readRules
    .map(r => r.ruleContent?.replace('/**', '') || '')
    .filter(p => p)

  // Extract shell command prefixes, optionally transforming for display
  const shellCommands = [
    ...new Set(
      shellRules.flatMap(rule => {
        if (!rule.ruleContent) return []
        const command =
          permissionRuleExtractPrefix(rule.ruleContent) ?? rule.ruleContent
        return commandTransform ? commandTransform(command) : command
      }),
    ),
  ]

  // Check what we have
  const hasDirectories = directories.length > 0
  const hasReadPaths = readPaths.length > 0
  const hasCommands = shellCommands.length > 0

  // Handle single type cases
  if (hasReadPaths && !hasDirectories && !hasCommands) {
    // Only Read rules - use "reading from" language
    if (readPaths.length === 1) {
      const firstPath = readPaths[0]!
      const dirName = basename(firstPath) || firstPath
      return (
        <text>
          Yes, allow reading from <text><b>{dirName}</b></text>
          {sep} from this project
        </text>
      )
    }

    // Multiple read paths
    return (
      <text>
        Yes, allow reading from {formatPathList(readPaths)} from this project
      </text>
    )
  }
  if (hasDirectories && !hasReadPaths && !hasCommands) {
    // Only directory permissions - use "access to" language
    if (directories.length === 1) {
      const firstDir = directories[0]!
      const dirName = basename(firstDir) || firstDir
      return (
        <text>
          Yes, and always allow access to <text><b>{dirName}</b></text>
          {sep} from this project
        </text>
      )
    }

    // Multiple directories
    return (
      <text>
        Yes, and always allow access to {formatPathList(directories)} from this
        project
      </text>
    )
  }
  if (hasCommands && !hasDirectories && !hasReadPaths) {
    // Only shell command permissions
    return (
      <text>
        {"Yes, and don't ask again for "}
        {commandListDisplayTruncated(shellCommands)} commands in{' '}
        <text><b>{getOriginalCwd()}</b></text>
      </text>
    )
  }

  // Handle mixed cases
  if ((hasDirectories || hasReadPaths) && !hasCommands) {
    // Combine directories and read paths since they're both path access
    const allPaths = [...directories, ...readPaths]
    if (hasDirectories && hasReadPaths) {
      // Mixed - use generic "access to"
      return (
        <text>
          Yes, and always allow access to {formatPathList(allPaths)} from this
          project
        </text>
      )
    }
  }
  if ((hasDirectories || hasReadPaths) && hasCommands) {
    // Build descriptive message for both types
    const allPaths = [...directories, ...readPaths]

    // Keep it concise but informative
    if (allPaths.length === 1 && shellCommands.length === 1) {
      return (
        <text>
          Yes, and allow access to {formatPathList(allPaths)} and{' '}
          {commandListDisplayTruncated(shellCommands)} commands
        </text>
      )
    }
    return (
      <text>
        Yes, and allow {formatPathList(allPaths)} access and{' '}
        {commandListDisplayTruncated(shellCommands)} commands
      </text>
    )
  }
  return null
}
