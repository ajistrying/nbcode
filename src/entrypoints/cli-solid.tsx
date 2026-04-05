/**
 * OpenTUI + SolidJS entry point for Noble Base Code.
 *
 * This is the alternative entry point that uses OpenTUI+SolidJS instead
 * of React+Ink for rendering. Run with:
 *
 *   bun run src/entrypoints/cli-solid.tsx
 *
 * Or build with:
 *
 *   bun run ./scripts/build.ts --solid
 *
 * The business logic (API calls, tool execution, session management, etc.)
 * is identical — only the rendering layer changes.
 */

// Same environment setup as cli.tsx
process.env.COREPACK_ENABLE_AUTO_PIN = '0'

if (process.env.CLAUDE_CODE_REMOTE === 'true') {
  const existing = process.env.NODE_OPTIONS || ''
  process.env.NODE_OPTIONS = existing
    ? `${existing} --max-old-space-size=8192`
    : '--max-old-space-size=8192'
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Fast-path for --version
  if (
    args.length === 1 &&
    (args[0] === '--version' || args[0] === '-v' || args[0] === '-V')
  ) {
    console.log(`${MACRO.VERSION} (Noble Base Code — OpenTUI)`)
    return
  }

  // For all other paths, delegate to the main module.
  // The main module uses the Ink rendering system — we override the
  // render functions via environment flag so it uses OpenTUI instead.
  process.env.NOBLE_BASE_CODE_RENDERER = 'opentui'

  const { profileCheckpoint } = await import('../utils/startupProfiler.js')
  profileCheckpoint('cli_solid_entry')

  // Load the standard main module — it checks NOBLE_BASE_CODE_RENDERER
  // to decide whether to use Ink or OpenTUI rendering.
  const { runMain } = await import('../main.js')
  await runMain()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
