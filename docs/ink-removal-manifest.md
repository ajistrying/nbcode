# Ink Removal Manifest

> When to execute: After the OpenTUI+SolidJS rendering path has been tested
> and confirmed working end-to-end (API calls, tool execution, dialogs, etc.)

## Phase 1: Delete Ink Fork (~20,000 lines)

```bash
# The entire custom Ink fork — 98 files, 19,844 lines
rm -rf src/ink/

# Yoga layout port — OpenTUI ships its own Yoga integration
rm -rf src/native-ts/yoga-layout/

# The Ink barrel export (re-exports from src/ink/)
rm src/ink.ts
```

## Phase 2: Remove React Dependencies

```bash
bun remove react react-reconciler ink @types/react
```

## Phase 3: Update tsconfig.json

```diff
- "jsx": "react-jsx",
+ "jsx": "preserve",
+ "jsxImportSource": "@opentui/solid",
```

Remove the `.solid.tsx` convention — all `.tsx` files become Solid:
- Rename all `*.solid.tsx` to `*.tsx` in `src/ui/solid/`
- Move `src/ui/solid/` contents to `src/components/` (replacing React versions)

## Phase 4: Update Build Pipeline

In `scripts/build.ts`:
- The Bun plugin (`plugins/solid-transform.ts`) filter changes from
  `\.solid\.(ts|js)x` to `\.(ts|js)x` (all files)
- Or switch to `@opentui/solid/preload` globally

Remove `bunfig.toml` preload guard (no longer dual-mode).

## Phase 5: Update Entry Point

In `src/main.tsx`:
- Replace `import { createRoot } from './ink.js'` with `import { createSolidRoot } from './ui/solid/render.js'`
- Replace `root = await createRoot(ctx.renderOptions)` with `root = await createSolidRoot()`
- All `root.render(<ReactComponent />)` calls become `root.render(() => <SolidComponent />)`

In `src/interactiveHelpers.tsx`:
- Replace the `showDialog` function to use SolidJS signals for dialog state
- Replace React.createElement calls with Solid JSX

## Phase 6: Clean Up References

Files that import from `src/ink/` or `src/ink.js`:
```bash
grep -r "from.*['\"].*ink" src/ --include="*.ts" --include="*.tsx" -l | grep -v node_modules | grep -v "src/ui/solid"
```

These imports need updating:
- `Box`, `Text` from `../ink.js` → native `<box>`, `<text>` elements
- `useInput` → `useKeyboard` from `@opentui/solid`
- `useStdin` → direct stdin access or OpenTUI hooks
- `useTerminalFocus` → `onFocus`/`onBlur` from `@opentui/solid`
- `useTerminalTitle` → direct OSC 0 writes
- `useTabStatus` → direct OSC 1 writes
- `useSearchHighlight` → `createSignal`-based search state
- `useAnimationFrame` → `useTimeline` from `@opentui/solid`
- `ScrollBox` imperative handle → `<scrollbox>` ref

## What's Safe to Delete (inventory)

| Directory/File | Files | Lines | Replacement |
|---|---|---|---|
| `src/ink/` | 98 | 19,844 | `@opentui/core` + `@opentui/solid` |
| `src/ink.ts` | 1 | ~86 | Direct imports from `@opentui/solid` |
| `src/native-ts/yoga-layout/` | 2 | ~930 | OpenTUI's built-in Yoga |
| React components in `src/components/` | ~364 | ~77,000 | `src/ui/solid/` (already ported) |
| **Total removable** | **~465** | **~97,860** | |

## What's Already Done

| Component Category | Files Ported | Lines |
|---|---|---|
| Primitives + hooks | 25 | ~2,000 |
| Design system | 15 | 1,329 |
| Presentational | 120 | 7,022 |
| Simple stateful | 88 | 12,900 |
| Complex stateful | 58 | 4,979 |
| Screens (REPL, Doctor, Resume) | 3 | 2,997 |
| **Total ported** | **272** | **39,044** |

## Estimated Reduction

- **Before**: React 19 (~40 KB) + Ink fork (19,844 lines) + Yoga port (930 lines)
- **After**: SolidJS (~7-8 KB) + OpenTUI (native Zig core) — 0 custom framework code
- **Net deletion**: ~20,774 lines of framework code
- **Component reduction**: ~77,000 lines React → ~39,044 lines Solid (49% smaller)
