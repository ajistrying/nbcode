/**
 * Dual-JSX Bun plugin for the React → OpenTUI+SolidJS migration.
 *
 * During the transition period both React (.tsx) and Solid (.solid.tsx) files
 * coexist.  This plugin:
 *   1. Intercepts only `.solid.tsx` / `.solid.jsx` files and runs them
 *      through `babel-preset-solid`, producing runtime calls into
 *      `@opentui/solid`.
 *   2. Redirects `solid-js` server-side entry points to client bundles
 *      so that SolidJS works correctly under Bun.
 *   3. Leaves all other `.tsx` / `.jsx` files untouched — React's JSX
 *      transform (configured in tsconfig.json) handles those as before.
 *
 * Usage:
 *   • Dev runtime  — registered via `bunfig.toml` → `preload`
 *   • Prod build   — imported in `scripts/build.ts` and passed to `Bun.build()`
 *
 * The auto-registration is wrapped in a try/catch so that compiled binaries
 * (which don't ship @babel/core) skip it silently.
 */

import { plugin as registerBunPlugin, type BunPlugin } from 'bun'

function stripQuery(path: string): string {
  const searchIdx = path.indexOf('?')
  const hashIdx = path.indexOf('#')
  const end = [searchIdx, hashIdx]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0]
  return end === undefined ? path : path.slice(0, end)
}

export function createDualJsxPlugin(): BunPlugin {
  // Lazy-loaded so the plugin module can be imported without @babel/core
  // being available (e.g. in compiled binaries).
  let _transformAsync: typeof import('@babel/core').transformAsync
  let _ts: unknown
  let _solid: unknown
  let _loaded = false

  async function ensureLoaded() {
    if (_loaded) return
    const babel = await import('@babel/core')
    _transformAsync = babel.transformAsync
    _ts = (await import('@babel/preset-typescript')).default
    _solid = (await import('babel-preset-solid')).default
    _loaded = true
  }

  return {
    name: 'dual-jsx-solid-transform',
    setup(build) {
      // ── solid-js server → client redirects ────────────────────────
      build.onLoad(
        {
          filter:
            /[/\\]node_modules[/\\]solid-js[/\\]dist[/\\]server\.js(?:[?#].*)?$/,
        },
        async (args) => {
          const path = stripQuery(args.path).replace('server.js', 'solid.js')
          return { contents: await Bun.file(path).text(), loader: 'js' }
        },
      )

      build.onLoad(
        {
          filter:
            /[/\\]node_modules[/\\]solid-js[/\\]store[/\\]dist[/\\]server\.js(?:[?#].*)?$/,
        },
        async (args) => {
          const path = stripQuery(args.path).replace('server.js', 'store.js')
          return { contents: await Bun.file(path).text(), loader: 'js' }
        },
      )

      // ── Only transform .solid.tsx / .solid.jsx files ──────────────
      build.onLoad(
        { filter: /\.solid\.(ts|js)x(?:[?#].*)?$/ },
        async (args) => {
          await ensureLoaded()
          const path = stripQuery(args.path)
          const code = await Bun.file(path).text()

          const result = await _transformAsync(code, {
            filename: path,
            presets: [
              [
                _solid,
                { moduleName: '@opentui/solid', generate: 'universal' },
              ],
              [_ts],
            ],
          })

          return { contents: result?.code ?? '', loader: 'js' }
        },
      )
    },
  }
}

// Auto-register when loaded as a preload script (bunfig.toml).
// Wrapped in try/catch so compiled binaries (which don't bundle babel)
// skip this silently.
try {
  registerBunPlugin(createDualJsxPlugin())
} catch {
  // Not in a dev environment — skip plugin registration
}
