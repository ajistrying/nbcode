# Migration Plan: React+Ink to OpenTUI+SolidJS

## Overview

The current interactive terminal UI is built on React 19 + a heavily customized Ink fork (~80 files). The REPL screen alone is 5,009 lines with 221+ React hooks. While the custom Ink fork is already highly optimized (cell-level diffing, interned pools, double-buffered output), the remaining bottleneck is React's fiber reconciliation — rebuilding a virtual DOM tree and diffing it on every state change.

**OpenTUI** (Zig+TypeScript, 9.7k stars, MIT) eliminates this by pairing a Zig native core for cell buffer management, frame diffing, and ANSI output with **SolidJS** for fine-grained reactivity. SolidJS components run once — only signal-reading expressions re-execute, with no virtual DOM diffing step. OpenTUI powers OpenCode (AI coding assistant) in production.

### Why This Migration

- **No VDOM overhead**: SolidJS compiles JSX to direct renderable mutations. No fiber tree, no reconciliation, no diffing
- **Zig-native hot path**: Cell buffer diff and ANSI generation run in Zig, not TypeScript
- **~57% less memory**: No VDOM tree, no fiber nodes, no memoization wrappers
- **~7-8 KB runtime** vs ~40 KB for React
- **Less code**: ~200 useCallback/useMemo calls become unnecessary. PromptInput (2,338 lines) shrinks ~40-50% because OpenTUI's built-in `<textarea>` handles undo/redo, cursor, selection natively
- **Same layout model**: Both use Yoga flexbox

### Compatibility

- Already Bun-native (`bun build --compile`, Bun 1.3.11+). OpenTUI requires Bun. No blocker
- Pure-TypeScript Yoga port at `src/native-ts/yoga-layout/` can be replaced by OpenTUI's Yoga integration
- 238k lines of business logic (types, constants, services, utils) are framework-agnostic and reusable as-is

---

## Current Codebase Audit

### Component Inventory

| Category | Files | Lines | Migration Effort |
|---|---|---|---|
| Framework-agnostic code (types, constants, services, utils) | 725 | ~238k | None — reuse as-is |
| Presentational components (no state) | 156 | ~5k | Mechanical translation |
| Simple stateful components (1-3 hooks) | 121 | ~20k | Pattern-based translation |
| Complex stateful components (5+ hooks) | 72 | ~30k | Careful redesign |
| Screens (REPL, Doctor, Resume) | 3 | ~6k | Architectural port |
| Custom Ink hooks | 12 | 677 | Replace with OpenTUI hooks |
| Ink framework internals (custom fork) | ~80 | ~15k | Delete entirely |
| **Total UI code requiring migration** | **~364** | **~77k** | |

### Largest Components (Critical Path)

| Component | Lines | Hook Calls | Notes |
|---|---|---|---|
| REPL.tsx | 5,009 | 221+ | Root orchestrator, state machine |
| PromptInput.tsx | 2,338 | 91 | Text input, suggestions, keyboard |
| Settings/Config.tsx | 1,821 | 33 | Complex forms |
| LogSelector.tsx | 1,574 | 29 | Scrolling + state |
| Stats.tsx | 1,227 | — | Metrics display |
| PermissionRuleList.tsx | 1,178 | — | Lists + interactions |
| ElicitationDialog.tsx | 1,168 | — | MCP dialogs |
| VirtualMessageList.tsx | 1,081 | — | Virtual scrolling + search |
| ScrollKeybindingHandler.tsx | 1,011 | — | Keyboard navigation |
| Messages.tsx | 833 | 27 | Core message rendering |

### React Hook Usage (to be eliminated or replaced)

| Hook | Count | SolidJS Replacement |
|---|---|---|
| useState | ~450 | `createSignal` |
| useEffect | ~350 | `createEffect` (auto-tracks) / `onMount` |
| useCallback | ~200 | Delete — not needed |
| useMemo | ~150 | `createMemo` (auto-tracks, no deps array) |
| useRef | ~150 | Plain `let` variables |
| useReducer | ~20 | `createStore` with `produce` |
| useSyncExternalStore | several | Signal updated from subscription |
| useDeferredValue | several | Delete — Solid updates are already granular |

---

## OpenTUI+SolidJS Reference

### npm Packages

```bash
bun add @opentui/core @opentui/solid
# Platform binary installed automatically as optional dep
```

### Component Mapping

| Ink (current) | OpenTUI Element | Notes |
|---|---|---|
| `<Box>` | `<box>` | Same Yoga flexbox model |
| `<Text>` | `<text>` + `<span>/<b>/<i>/<u>` | Inline styles become elements |
| `<ScrollBox>` | `<scrollbox>` | Built-in sticky scroll, acceleration |
| `<Spacer>` | `<box flexGrow={1}>` | Trivial |
| `<Newline>` | `<br>` | Trivial |
| `<RawAnsi>` | Direct text injection | Check OpenTUI support |
| `<Link>` | `<a href={...}>` | OSC 8 built-in |
| `<Button>` | `<box>` + `useKeyboard` | Rebuild interaction |
| `<NoSelect>` | OpenTUI selection API | Check support |
| `<AlternateScreen>` | `render()` options | Handled natively |
| N/A (custom) | `<markdown>` | Built-in markdown rendering |
| N/A (highlight.js) | `<code>` | Built-in tree-sitter syntax highlighting |
| N/A (custom) | `<diff>` | Built-in diff viewer |
| N/A (custom) | `<textarea>` | Built-in multi-line editor with undo/redo |
| N/A (custom) | `<input>` | Built-in single-line input |
| N/A (custom) | `<select>` | Built-in dropdown/list |

### Hook Mapping

| Ink Hook | OpenTUI+Solid Hook | Notes |
|---|---|---|
| `useInput(handler)` | `useKeyboard(handler)` | Similar API, different key event shape |
| `useApp()` | `useRenderer()` | Renderer instance access |
| `useTerminalViewport()` | `useTerminalDimensions()` | Returns reactive signal |
| `useSelection()` | `useSelection()` | Check API compatibility |
| `useSearchHighlight()` | Custom `createSignal` | Rebuild |
| `useAnimationFrame(cb)` | `useTimeline()` | Built-in animation system |
| `useDeclaredCursor()` | Renderer cursor API | Imperative |
| `useTerminalFocus()` | `onFocus()` / `onBlur()` | Lifecycle hooks |
| `useTerminalTitle()` | Renderer API | Direct call |
| `useInterval()` | `setInterval` + `onCleanup` | Native Solid pattern |

### Key SolidJS Patterns (vs React)

**Components run once** — the function body is initialization, not re-render:
```tsx
// React: re-runs on every state change
function Counter() {
  const [count, setCount] = useState(0)
  const doubled = useMemo(() => count * 2, [count])
  return <Text>{doubled}</Text>
}

// Solid: function runs once, only {doubled()} expression re-evaluates
function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)  // auto-tracks
  return <text>{doubled()}</text>
}
```

**Never destructure props** — they're lazy getters:
```tsx
// BAD: breaks reactivity
function Badge({ label, color }: Props) { ... }

// GOOD: preserves reactivity
function Badge(props: Props) {
  return <text fg={props.color}>{props.label}</text>
}
```

**Control flow uses components, not JS expressions**:
```tsx
// React
{loading ? <Spinner/> : items.map(i => <Item key={i.id} item={i}/>)}

// Solid
<Show when={!loading()} fallback={<Spinner/>}>
  <For each={items()}>{(item) => <Item item={item}/>}</For>
</Show>
```

**Streaming responses — ideal for signals**:
```tsx
function StreamingMessage() {
  const [content, setContent] = createSignal("")

  async function stream() {
    for await (const chunk of apiStream) {
      setContent(prev => prev + chunk.text)  // Only this <text> node updates
    }
  }

  return <text>{content()}</text>
}
```

### Rendering Pipeline Comparison

**Current (React + Custom Ink fork)**:
```
React state change
  -> fiber reconciliation (rebuild VDOM tree)
  -> VDOM diff
  -> DOM update
  -> Yoga layout (pure-TS port)
  -> render-node-to-output (traverse DOM -> cell grid)
  -> log-update diff (prev vs next cells, TypeScript)
  -> patch optimizer
  -> ANSI serialization
  -> stdout
```

**After (OpenTUI + SolidJS)**:
```
Signal change
  -> direct renderable property mutation (no diffing)
  -> requestRender()
  -> Yoga layout
  -> renderable.render() writes to buffer
  -> Zig prepareRenderFrame() (cell diff + ANSI generation, native)
  -> stdout
```

Eliminated: fiber reconciliation, VDOM construction, VDOM diffing, TypeScript cell diffing.

---

## Phases

### Phase 0: Scaffold & Dual-Render Bridge

**Duration**: ~2 weeks
**Goal**: Run OpenTUI+SolidJS alongside Ink so migration is incremental.

**Tasks**:

- [ ] Install `@opentui/core` and `@opentui/solid`
- [ ] Configure SolidJS compilation in build pipeline
  - Add `babel-preset-solid` or `@opentui/solid/bun-plugin`
  - Update `tsconfig.json`: `"jsx": "preserve"` for Solid files
  - Convention: `.solid.tsx` for Solid components, `.tsx` for React (during transition)
- [ ] Create adapter types at `src/ui/primitives.ts` — shared prop types that map to both Ink and OpenTUI
- [ ] Create shared hook signatures at `src/ui/hooks.ts` with Ink and Solid implementations
- [ ] Proof of concept: render one leaf component (Spinner) via OpenTUI+Solid inside the existing app
- [ ] Verify `bun build --compile` still produces working binary with both renderers

**Deliverable**: Build succeeds, both renderers available, one component proven end-to-end.

---

### Phase 1: Port Ink Primitives to OpenTUI Equivalents

**Duration**: ~1 week
**Goal**: Replace the 15 custom Ink components (2,126 lines) and 12 hooks (677 lines).

**Tasks**:

- [ ] Port Box (213 lines) -> `<box>` wrapper with prop mapping
- [ ] Port Text (253 lines) -> `<text>` + inline elements
- [ ] Port ScrollBox (236 lines) -> `<scrollbox>` with imperative API
- [ ] Port Button (191 lines) -> `<box>` + `useKeyboard`
- [ ] Port AlternateScreen (79 lines) -> OpenTUI render options
- [ ] Port remaining simple components (Spacer, Newline, RawAnsi, Link, NoSelect)
- [ ] Port App root (657 lines) -> OpenTUI `render()` entry
- [ ] Rewrite 12 Ink hooks as SolidJS composables using OpenTUI APIs
- [ ] Write tests for all primitive components and hooks

**Deliverable**: `src/ui/solid/` with all primitives and hooks, tested.

---

### Phase 2: Port Presentational Components

**Duration**: ~2 weeks
**Goal**: Migrate 156 stateless components. Mechanical translation, highly parallelizable.

**Translation rules** (can be partially automated with codemod):

1. `<Box>` -> `<box>`, `<Text>` -> `<text>` (lowercase)
2. `color=` -> `fg=`, `backgroundColor=` -> `bg=`
3. Destructured props `({ x, y })` -> `(props)` with `props.x`
4. Remove `React.memo()` wrappers
5. `<Text bold>` -> `<text><b>...</b></text>` (or check `bold` prop support)

**Batch order** (by directory):

- [ ] `src/components/LogoV2/` — branding, welcome screens
- [ ] `src/components/design-system/` — Divider, Tabs, ListItem, etc.
- [ ] Simple status indicators, badges, labels
- [ ] Simple layout wrappers and containers
- [ ] Remaining presentational components

**Deliverable**: 156 components ported, visual regression tested.

---

### Phase 3: Port Simple Stateful Components

**Duration**: ~3 weeks
**Goal**: Migrate 121 components with 1-3 React hooks.

**Translation patterns**:

| React | SolidJS |
|---|---|
| `useState(init)` | `createSignal(init)` — read as `value()` |
| `useEffect(fn, [deps])` | `createEffect(fn)` — auto-tracks |
| `useEffect(fn, [])` | `onMount(fn)` |
| `useCallback(fn, [deps])` | Just `fn` — delete the wrapper |
| `useMemo(fn, [deps])` | `createMemo(fn)` — auto-tracks |
| `useRef(init)` | `let ref = init` |
| `{cond && <X/>}` | `<Show when={cond()}><X/></Show>` |
| `{arr.map(i => <X/>)}` | `<For each={arr()}>{(i) => <X/>}</For>` |

**Priority order** (port leaves first, work up dependency tree):

- [ ] Design system wrappers (ThemedBox, ThemedText)
- [ ] Simple dialogs (confirmation, info, error)
- [ ] Simple inputs (text fields, selects)
- [ ] Status displays (StatusLine, SpinnerWithVerb, BriefIdleStatus)
- [ ] Menu items, list items
- [ ] Remaining 1-3 hook components

**Deliverable**: 121 components ported.

---

### Phase 4: Port Complex Components

**Duration**: ~5 weeks
**Goal**: Migrate 72 components with 5+ hooks and complex state. This is the hard part.

#### 4a. VirtualMessageList (1,081 lines) — Week 1-2

- [ ] Port virtual scrolling to OpenTUI `<scrollbox>` with viewport culling
- [ ] Replace `useDeferredValue` — not needed (Solid updates are granular)
- [ ] Replace `useSyncExternalStore` — signal updated from external subscription
- [ ] Port search highlighting with `createSignal` for query state
- [ ] Port selection spanning multiple messages
- [ ] Test with 10k+ message conversations for perf validation

#### 4b. PromptInput (2,338 lines) — Week 2-3

- [ ] Replace custom text input with OpenTUI `<textarea>` (built-in undo/redo, cursor, selection)
- [ ] Port keyboard shortcut handling to `useKeyboard`
- [ ] Port autocomplete/suggestion UI
- [ ] Port paste handling (`usePaste` from OpenTUI)
- [ ] Port slash command input detection
- [ ] Expected reduction: 2,338 -> ~1,200-1,400 lines

#### 4c. Messages + MessageSelector (1,663 lines) — Week 3-4

- [ ] Port streaming text display — `createSignal` updates only the streaming text node
- [ ] Port tool result rendering
- [ ] Replace code blocks with OpenTUI `<code>` (tree-sitter)
- [ ] Replace diff rendering with OpenTUI `<diff>`
- [ ] Replace markdown rendering with OpenTUI `<markdown>`
- [ ] Port message selection/navigation

#### 4d. Permission & Elicitation Dialogs (1,935 lines) — Week 4

- [ ] Port PermissionRequest, ElicitationDialog, ExitPlanModePermissionRequest
- [ ] Replace `useReducer` -> `createStore` with `produce`
- [ ] Port modal state machine with `<Switch>`/`<Match>`
- [ ] Port queue-based dialog serialization

#### 4e. Settings/Config (1,821 lines) — Week 4-5

- [ ] Port complex forms to OpenTUI `<input>`, `<select>`, `<tab_select>`
- [ ] Port navigation/tab state

#### 4f. Remaining Complex Components — Week 5

- [ ] ScrollKeybindingHandler (1,011 lines)
- [ ] FullscreenLayout (636 lines)
- [ ] AgentsMenu (799 lines)
- [ ] LogSelector (1,574 lines)
- [ ] BackgroundTasksDialog (651 lines)
- [ ] All other 300+ line components

**Deliverable**: All 72 complex components ported.

---

### Phase 5: Port Screens & REPL Orchestration

**Duration**: ~3 weeks
**Goal**: Replace REPL.tsx (5,009 lines) and the 2 other screens.

#### 5a. State Architecture Redesign

Expected reductions in REPL.tsx:

| React Pattern | SolidJS | Lines Saved |
|---|---|---|
| 200 `useCallback` calls | Delete entirely | ~200 |
| 150 `useMemo` calls | `createMemo` (no deps) | ~50 |
| 150 `useRef` for perf | `let` variables | ~100 |
| `useDeferredValue(messages)` | Not needed | ~30 |
| Message dual-sync (ref + state) | Single signal | ~100 |
| **Total reduction** | | **~480 lines** |

Estimated: 5,009 -> ~3,000-3,500 lines (30-40% smaller).

#### 5b. Tasks

- [ ] Convert REPL conversation state to `createStore`
- [ ] Replace dialog queue state machine with `<Switch>`/`<Match>`
- [ ] Port query execution loop (mostly framework-agnostic async)
- [ ] Wire keyboard bindings to `useKeyboard`
- [ ] Port screen mode switching (prompt vs transcript)
- [ ] Port feature-gated sections (voice, ultraplan, coordinator, etc.)
- [ ] Port Doctor.tsx (574 lines)
- [ ] Port ResumeConversation.tsx (398 lines)
- [ ] Replace `main.tsx` entry: `Ink.render()` -> OpenTUI `render()` from `@opentui/solid`
- [ ] Wire terminal capabilities, alt-screen, mouse tracking

**Deliverable**: Full app running on OpenTUI+SolidJS.

---

### Phase 6: Remove Ink Fork & Cleanup

**Duration**: ~1 week
**Goal**: Remove all React/Ink code and dependencies.

- [ ] Delete `src/ink/` (~80 files, ~15k lines)
- [ ] Delete `src/native-ts/yoga-layout/` (930 lines) — OpenTUI ships Yoga
- [ ] Remove React dependencies: `react`, `react-reconciler`, `@types/react`
- [ ] Remove Ink dependencies
- [ ] Update `tsconfig.json`: remove `"react-jsx"`, SolidJS as sole JSX target
- [ ] Update build pipeline: remove React-related config
- [ ] Remove `.solid.tsx` file convention — all files are now Solid
- [ ] Run full test suite, fix regressions
- [ ] Verify `bun build --compile` produces working binary

**Deliverable**: Clean codebase, zero React/Ink dependencies.

---

### Phase 7: Optimize

**Duration**: ~1 week
**Goal**: Exploit SolidJS's granular reactivity for performance wins not possible under React.

- [ ] Streaming responses: verify signal-per-token updates hit only the text node
- [ ] Large conversations: verify `<For>` keyed rendering doesn't re-render existing messages
- [ ] Remove any remaining React perf workarounds (deferred rendering, manual memoization)
- [ ] Benchmark tree-sitter (`<code>`) vs highlight.js for syntax highlighting
- [ ] Use OpenTUI debug overlay (FPS, memory, render timing) to profile
- [ ] Test frame times under heavy streaming load
- [ ] Validate CCR (Claude Code Remote) compatibility — Node.js environment needs guards or shim

**Deliverable**: Optimized, profiled, production-ready.

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| OpenTUI is v0.1.x, API may change | High | Pin exact version. Vendor if needed. 173 releases shows active dev |
| Bun-only — CCR container runs Node.js | High | CCR needs `typeof Bun` guards or Node.js OpenTUI shim |
| SolidJS learning curve for team | Medium | Main gotcha: components run once. Use `eslint-plugin-solid` |
| Missing OpenTUI features (RawAnsi, NoSelect) | Medium | Implement as custom renderables extending `Renderable` |
| Virtual scroll perf with 10k+ messages | Medium | Test early in Phase 4a. Fall back to custom if needed |
| Feature flags via `bun:bundle` | Low | Build system unchanged, should work |
| Native NAPI modules (sharp, audio, etc.) | Low | Framework-agnostic, no migration needed |

## Timeline Summary

| Phase | Weeks | Cumulative | What |
|---|---|---|---|
| 0. Scaffold & bridge | 2 | 2 | Install, configure, proof of concept |
| 1. Ink primitives | 1 | 3 | 15 components + 12 hooks |
| 2. Presentational | 2 | 5 | 156 components (mechanical) |
| 3. Simple stateful | 3 | 8 | 121 components |
| 4. Complex components | 5 | 13 | 72 components (hard part) |
| 5. Screens & REPL | 3 | 16 | 3 screens including 5k-line REPL |
| 6. Cleanup | 1 | 17 | Delete Ink fork, remove React |
| 7. Optimize | 1 | 18 | Profile, benchmark, polish |
| **Total** | **18** | | **1 senior engineer** |

## References

- [OpenTUI GitHub](https://github.com/anomalyco/opentui) — 9.7k stars, MIT, v0.1.95
- [OpenTUI Docs](https://opentui.com/docs/getting-started)
- [@opentui/solid API](https://opentui.com/docs/bindings/solid/)
- [SolidJS Docs](https://docs.solidjs.com/)
- [SolidJS Fine-Grained Reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity)
- [OpenCode](https://opencode.ai) — production AI coding assistant built on OpenTUI+SolidJS
- [awesome-opentui](https://github.com/msmps/awesome-opentui) — ecosystem resources
